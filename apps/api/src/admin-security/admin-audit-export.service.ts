import { Inject, Injectable } from '@nestjs/common';
import canonicalize from 'canonicalize';
import { createHash, randomUUID } from 'node:crypto';
import { AdminC2TransactionError } from '../database/admin-c2-transaction.service';
import {
  AdminAuditAuthorizationRejection,
  AdminAuditAuthorizationService,
} from './admin-audit.authorization.service';
import {
  ADMIN_AUDIT_EXPORT_MAX_PAYLOAD_BYTES,
  adminAuditExportNdjsonByteLength,
  AdminAuditExportCodec,
} from './admin-audit-export-codec';
import { AdminAuditRepository, type AdminAuditExportRecord } from './admin-audit.repository';
import type { AdminAuditExportCreateInput } from './admin-audit.types';
import {
  ADMIN_AUDIT_EXPORT_KEYRING,
  AdminAuditExportKeyringUnavailableError,
  decryptAdminAuditExport,
  type AdminAuditExportEnvelopeMetadata,
  type AdminAuditExportStorageKeyring,
} from './admin-audit-export-keyring';
import {
  ADMIN_AUDIT_EXPORT_STORAGE,
  AdminAuditExportStorageUnavailableError,
  type AdminAuditExportStoragePort,
} from './admin-audit-export-storage.port';
import { AdminC2HttpError, type AdminC2OperationId } from './admin-security.errors';

export const ADMIN_AUDIT_EXPORT_WAKEUP = Symbol('ADMIN_AUDIT_EXPORT_WAKEUP');
const ADMIN_AUDIT_EXPORT_WAKEUP_TIMEOUT_MS = 2_000;
const ADMIN_AUDIT_EXPORT_DOWNLOAD_PREPARATION_TIMEOUT_MS = 120_000;

class AdminAuditExportDependencyTimeoutError extends Error {
  constructor() {
    super('Admin audit export dependency deadline expired.');
    this.name = 'AdminAuditExportDependencyTimeoutError';
  }
}

async function withAbortTimeout<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new AdminAuditExportDependencyTimeoutError();
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return operation(controller.signal);
      }),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export interface AdminAuditExportWakeupPort {
  notify(exportId: string, signal?: AbortSignal): Promise<boolean>;
}

export class UnavailableAdminAuditExportWakeup implements AdminAuditExportWakeupPort {
  async notify(_exportId: string, signal?: AbortSignal): Promise<boolean> {
    signal?.throwIfAborted();
    return false;
  }
}

export interface AdminAuditExportProjection {
  readonly contentSha256: string | null;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly exportId: string;
  readonly failureCode: AdminAuditExportRecord['failureCode'];
  readonly signatureKeyId: string | null;
  readonly state: AdminAuditExportRecord['state'];
}

interface DownloadLease {
  readonly bytes: Buffer;
  readonly contentSha256: string;
  readonly exportId: string;
  heartbeat(): Promise<boolean>;
  release(): Promise<void>;
}

function projection(record: AdminAuditExportRecord): AdminAuditExportProjection {
  return {
    contentSha256: record.contentSha256,
    createdAt: record.createdAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null,
    exportId: record.id,
    failureCode: record.failureCode,
    signatureKeyId: record.signatureKeyId,
    state: record.state,
  };
}

function digestRequest(input: AdminAuditExportCreateInput): string {
  const serialized = canonicalize(input);
  if (serialized === undefined) throw new TypeError('Export request is not canonicalizable.');
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
}

function artifactAttemptId(objectKey: string): string {
  const match = /^c2b\/staging\/[0-9a-f-]{36}\/\d+\/([0-9a-f-]{36})\.zip\.enc$/iu.exec(objectKey);
  if (match?.[1] === undefined) throw new Error('Invalid C2b export object key.');
  return match[1];
}

class DurableExportRejection {
  constructor(readonly error: AdminC2HttpError) {}
}

function throwTransactionFailure(
  operationId: AdminC2OperationId,
  error: unknown,
  proofComplete: boolean,
): never {
  if (error instanceof AdminC2HttpError) throw error;
  if (
    error instanceof AdminC2TransactionError &&
    error.code === 'CALLBACK_FAILED' &&
    error.primaryError instanceof AdminC2HttpError
  ) {
    throw error.primaryError;
  }
  if (error instanceof AdminC2TransactionError && error.code === 'COMMIT_UNKNOWN') {
    throw new AdminC2HttpError(operationId, 'SERVICE_UNAVAILABLE', 'COMMIT_UNKNOWN_NO_SECOND_SINK');
  }
  throw new AdminC2HttpError(
    operationId,
    'SERVICE_UNAVAILABLE',
    proofComplete ? 'NONE_AFTER_PROOF' : 'RECORD_SECURITY_EVENT',
  );
}

@Injectable()
export class AdminAuditExportService {
  constructor(
    @Inject(AdminAuditRepository) private readonly repository: AdminAuditRepository,
    @Inject(AdminAuditAuthorizationService)
    private readonly authorization: AdminAuditAuthorizationService,
    @Inject(ADMIN_AUDIT_EXPORT_WAKEUP) private readonly wakeup: AdminAuditExportWakeupPort,
    @Inject(ADMIN_AUDIT_EXPORT_STORAGE) private readonly storage: AdminAuditExportStoragePort,
    @Inject(ADMIN_AUDIT_EXPORT_KEYRING) private readonly keyring: AdminAuditExportStorageKeyring,
    @Inject(AdminAuditExportCodec) private readonly codec: AdminAuditExportCodec,
  ) {}

  async create(
    authorizationHeader: string | undefined,
    idempotencyKey: string,
    input: AdminAuditExportCreateInput,
    requestId: string,
    now = new Date(),
  ): Promise<AdminAuditExportProjection> {
    const operationId = 'createAdminAuditLogExport';
    const proof = await this.authorization.verifyBearer(operationId, authorizationHeader, now);
    const requestDigest = digestRequest(input);
    const exportId = randomUUID();
    let proofComplete = false;
    let result;
    try {
      result = await this.repository.transaction(async (transaction) => {
        const authorization = await this.authorization.authorize(
          transaction,
          operationId,
          proof,
          requestId,
          { id: exportId, operatorReason: input.operatorReason, type: 'ADMIN_AUDIT_EXPORT' },
          'AUDIT_EXPORT',
          now,
        );
        if (authorization instanceof AdminAuditAuthorizationRejection) {
          return new DurableExportRejection(authorization.error);
        }
        const principal = authorization;
        proofComplete = true;
        await transaction.lockExportIdempotency(principal.adminUserId, idempotencyKey);
        const replay = await transaction.findActiveIdempotency(
          principal.adminUserId,
          idempotencyKey,
        );
        if (replay !== undefined) {
          if (replay.requestDigest !== requestDigest) {
            await transaction.insertHttpAudit({
              action: operationId,
              actorAdminUserId: principal.adminUserId,
              adminSessionId: principal.sessionId,
              entityId: replay.exportId,
              entityType: 'ADMIN_AUDIT_EXPORT',
              failureCode: 'IDEMPOTENCY_CONFLICT',
              operatorReason: input.operatorReason,
              outcome: 'REJECTED',
              requestId,
            });
            return new DurableExportRejection(
              new AdminC2HttpError(operationId, 'IDEMPOTENCY_CONFLICT', 'ALREADY_DURABLE'),
            );
          }
          const existing = await transaction.getExport(replay.exportId, principal.adminUserId);
          if (existing === undefined) throw new Error('Active export idempotency is dangling.');
          return { projection: projection(existing), replay: true as const };
        }
        const entries = await transaction.selectProjection({
          ...input,
          createdFrom: input.from,
          createdTo: input.to,
        });
        const utf8Bytes = adminAuditExportNdjsonByteLength(entries);
        if (entries.length > 10_000 || utf8Bytes > ADMIN_AUDIT_EXPORT_MAX_PAYLOAD_BYTES) {
          await transaction.insertHttpAudit({
            action: operationId,
            actorAdminUserId: principal.adminUserId,
            adminSessionId: principal.sessionId,
            entityId: exportId,
            entityType: 'ADMIN_AUDIT_EXPORT',
            failureCode: 'PROJECTION_BUDGET_EXCEEDED',
            operatorReason: input.operatorReason,
            outcome: 'REJECTED',
            requestId,
          });
          return new DurableExportRejection(
            new AdminC2HttpError(operationId, 'VALIDATION_ERROR', 'ALREADY_DURABLE'),
          );
        }
        const snapshotId = await transaction.insertSnapshot({
          filtersDigest: requestDigest,
          items: entries,
          operation: 'CREATE_ADMIN_AUDIT_LOG_EXPORT',
          principalAdminUserId: principal.adminUserId,
        });
        const sourceAuditLogId = randomUUID();
        await transaction.insertExport({
          creatorAdminUserId: principal.adminUserId,
          exportId,
          idempotencyKey,
          requestDigest,
          snapshotId,
          sourceAuditLogId,
        });
        await transaction.insertHttpAudit({
          action: operationId,
          actorAdminUserId: principal.adminUserId,
          adminAuditExportId: exportId,
          adminSessionId: principal.sessionId,
          entityId: exportId,
          entityType: 'ADMIN_AUDIT_EXPORT',
          id: sourceAuditLogId,
          operatorReason: input.operatorReason,
          outcome: 'SUCCESS',
          requestId,
        });
        const created = await transaction.getExport(exportId, principal.adminUserId);
        if (created === undefined) throw new Error('C2b export was not persisted.');
        return { projection: projection(created), replay: false as const };
      });
    } catch (error: unknown) {
      if (error instanceof AdminC2TransactionError && error.code === 'COMMIT_UNKNOWN') {
        const committedExportId = await this.repository
          .transaction(async (transaction) => {
            const replay = await transaction.findActiveIdempotency(
              proof.adminUserId,
              idempotencyKey,
            );
            if (replay?.requestDigest !== requestDigest) return undefined;
            const committed = await transaction.getExport(replay.exportId, proof.adminUserId);
            return committed?.id;
          })
          .catch(() => undefined);
        if (committedExportId !== undefined) {
          await withAbortTimeout(ADMIN_AUDIT_EXPORT_WAKEUP_TIMEOUT_MS, (signal) =>
            this.wakeup.notify(committedExportId, signal),
          ).catch(() => false);
        }
      }
      throwTransactionFailure(operationId, error, proofComplete);
    }
    if (result instanceof DurableExportRejection) throw result.error;
    if (!result.replay) {
      await withAbortTimeout(ADMIN_AUDIT_EXPORT_WAKEUP_TIMEOUT_MS, (signal) =>
        this.wakeup.notify(result.projection.exportId, signal),
      ).catch(() => false);
    }
    return result.projection;
  }

  async get(
    authorizationHeader: string | undefined,
    exportId: string,
    requestId: string,
    now = new Date(),
  ): Promise<AdminAuditExportProjection> {
    return this.getAuthorized(
      'getAdminAuditLogExport',
      authorizationHeader,
      exportId,
      requestId,
      now,
    );
  }

  private async getAuthorized(
    operationId: 'getAdminAuditLogExport' | 'downloadAdminAuditLogExport',
    authorizationHeader: string | undefined,
    exportId: string,
    requestId: string,
    now: Date,
  ): Promise<AdminAuditExportProjection> {
    const proof = await this.authorization.verifyBearer(operationId, authorizationHeader, now);
    let proofComplete = false;
    let result;
    try {
      result = await this.repository.transaction(async (transaction) => {
        const authorization = await this.authorization.authorize(
          transaction,
          operationId,
          proof,
          requestId,
          { id: exportId, type: 'ADMIN_AUDIT_EXPORT' },
          operationId === 'downloadAdminAuditLogExport' ? 'AUDIT_EXPORT' : undefined,
          now,
        );
        if (authorization instanceof AdminAuditAuthorizationRejection) {
          return new DurableExportRejection(authorization.error);
        }
        const principal = authorization;
        proofComplete = true;
        const record = await transaction.getExport(exportId, principal.adminUserId);
        if (record === undefined) {
          await transaction.insertHttpAudit({
            action: operationId,
            actorAdminUserId: principal.adminUserId,
            adminSessionId: principal.sessionId,
            entityId: exportId,
            entityType: 'ADMIN_AUDIT_EXPORT',
            failureCode: 'RESOURCE_NOT_FOUND',
            outcome: 'REJECTED',
            requestId,
          });
          return new DurableExportRejection(
            new AdminC2HttpError(operationId, 'AUDIT_EXPORT_NOT_FOUND', 'ALREADY_DURABLE'),
          );
        }
        await transaction.insertHttpAudit({
          action: operationId,
          actorAdminUserId: principal.adminUserId,
          adminAuditExportId: exportId,
          adminSessionId: principal.sessionId,
          entityId: exportId,
          entityType: 'ADMIN_AUDIT_EXPORT',
          outcome: 'SUCCESS',
          requestId,
        });
        return projection(record);
      });
    } catch (error: unknown) {
      throwTransactionFailure(operationId, error, proofComplete);
    }
    if (result instanceof DurableExportRejection) throw result.error;
    return result;
  }

  async download(
    authorizationHeader: string | undefined,
    exportId: string,
    requestId: string,
    now = new Date(),
  ): Promise<DownloadLease> {
    const operationId = 'downloadAdminAuditLogExport';
    const proof = await this.authorization.verifyBearer(operationId, authorizationHeader, now);
    const ownerHash = createHash('sha256')
      .update(`KORA_ADMIN_C2B_READ_LEASE_V1\0${randomUUID()}`, 'utf8')
      .digest('hex');
    let proofComplete = false;
    let acquired:
      | DurableExportRejection
      | Readonly<{
          leaseId: string;
          principal: Readonly<{ adminUserId: string; sessionId: string }>;
          record: AdminAuditExportRecord;
        }>;
    try {
      acquired = await this.repository.transaction(async (transaction) => {
        const authorization = await this.authorization.authorize(
          transaction,
          operationId,
          proof,
          requestId,
          { id: exportId, type: 'ADMIN_AUDIT_EXPORT' },
          'AUDIT_EXPORT',
          now,
        );
        if (authorization instanceof AdminAuditAuthorizationRejection) {
          return new DurableExportRejection(authorization.error);
        }
        const principal = authorization;
        proofComplete = true;
        const record = await transaction.getExportForDownload(exportId, principal.adminUserId);
        if (record === undefined) {
          await transaction.insertHttpAudit({
            action: operationId,
            actorAdminUserId: principal.adminUserId,
            adminSessionId: principal.sessionId,
            entityId: exportId,
            entityType: 'ADMIN_AUDIT_EXPORT',
            failureCode: 'RESOURCE_NOT_FOUND',
            outcome: 'REJECTED',
            requestId,
          });
          return new DurableExportRejection(
            new AdminC2HttpError(operationId, 'AUDIT_EXPORT_NOT_FOUND', 'ALREADY_DURABLE'),
          );
        }
        if (record.downloadStatus === 'EXPIRED') {
          await transaction.insertHttpAudit({
            action: operationId,
            actorAdminUserId: principal.adminUserId,
            adminAuditExportId: exportId,
            adminSessionId: principal.sessionId,
            entityId: exportId,
            entityType: 'ADMIN_AUDIT_EXPORT',
            failureCode: 'RESOURCE_EXPIRED',
            outcome: 'REJECTED',
            requestId,
          });
          return new DurableExportRejection(
            new AdminC2HttpError(operationId, 'AUDIT_EXPORT_EXPIRED', 'ALREADY_DURABLE'),
          );
        }
        if (record.downloadStatus !== 'READY') {
          await transaction.insertHttpAudit({
            action: operationId,
            actorAdminUserId: principal.adminUserId,
            adminAuditExportId: exportId,
            adminSessionId: principal.sessionId,
            entityId: exportId,
            entityType: 'ADMIN_AUDIT_EXPORT',
            failureCode: 'RESOURCE_CONFLICT',
            outcome: 'REJECTED',
            requestId,
          });
          return new DurableExportRejection(
            new AdminC2HttpError(operationId, 'AUDIT_EXPORT_NOT_READY', 'ALREADY_DURABLE'),
          );
        }
        const leaseId = await transaction.acquireReadLease({
          exportId,
          ownerHash,
          readerAdminUserId: principal.adminUserId,
        });
        return { leaseId, principal, record };
      });
    } catch (error: unknown) {
      throwTransactionFailure(operationId, error, proofComplete);
    }
    if (acquired instanceof DurableExportRejection) throw acquired.error;
    const record = acquired.record;
    const metadata: AdminAuditExportEnvelopeMetadata = {
      attemptId: artifactAttemptId(record.objectKey!),
      contentSha256: record.contentSha256!,
      exportId,
      generation: String(record.generation),
      plaintextBytes: Number(record.plaintextBytes),
      signatureKeyId: record.signatureKeyId!,
    };
    let plaintext: Buffer;
    try {
      plaintext = await withAbortTimeout(
        ADMIN_AUDIT_EXPORT_DOWNLOAD_PREPARATION_TIMEOUT_MS,
        async (signal) => {
          const encrypted = await this.storage.get(record.objectKey!, signal);
          const prepared = Buffer.from(
            await decryptAdminAuditExport(this.keyring, encrypted, metadata, signal),
          );
          await this.codec.verify(
            prepared,
            {
              contentSha256: record.contentSha256!,
              exportId,
              signatureKeyId: record.signatureKeyId!,
            },
            signal,
          );
          signal.throwIfAborted();
          return prepared;
        },
      );
    } catch (error: unknown) {
      const failureCode =
        error instanceof AdminAuditExportStorageUnavailableError ||
        error instanceof AdminAuditExportKeyringUnavailableError ||
        error instanceof AdminAuditExportDependencyTimeoutError
          ? 'DEPENDENCY_UNAVAILABLE'
          : 'INTEGRITY_REJECTED';
      let rejection: AdminC2HttpError = new AdminC2HttpError(
        operationId,
        'SERVICE_UNAVAILABLE',
        'ALREADY_DURABLE',
      );
      try {
        await this.repository.transaction((transaction) =>
          transaction.insertHttpAudit({
            action: operationId,
            actorAdminUserId: acquired.principal.adminUserId,
            adminAuditExportId: exportId,
            adminSessionId: acquired.principal.sessionId,
            entityId: exportId,
            entityType: 'ADMIN_AUDIT_EXPORT',
            failureCode,
            outcome: 'REJECTED',
            requestId,
          }),
        );
      } catch (auditError: unknown) {
        try {
          throwTransactionFailure(operationId, auditError, true);
        } catch (mapped: unknown) {
          rejection = mapped as AdminC2HttpError;
        }
      }
      await this.repository
        .transaction((transaction) => transaction.releaseReadLease(acquired.leaseId))
        .catch(() => undefined);
      throw rejection;
    }
    const auditNow = new Date();
    proofComplete = false;
    let auditResult: void | DurableExportRejection;
    try {
      auditResult = await this.repository.transaction(async (transaction) => {
        const authorization = await this.authorization.authorize(
          transaction,
          operationId,
          proof,
          requestId,
          { id: exportId, type: 'ADMIN_AUDIT_EXPORT' },
          'AUDIT_EXPORT',
          auditNow,
        );
        if (authorization instanceof AdminAuditAuthorizationRejection) {
          return new DurableExportRejection(authorization.error);
        }
        const principal = authorization;
        proofComplete = true;
        const current = await transaction.getExportForDownload(exportId, principal.adminUserId);
        if (current === undefined) {
          await transaction.insertHttpAudit({
            action: operationId,
            actorAdminUserId: principal.adminUserId,
            adminSessionId: principal.sessionId,
            entityId: exportId,
            entityType: 'ADMIN_AUDIT_EXPORT',
            failureCode: 'RESOURCE_NOT_FOUND',
            outcome: 'REJECTED',
            requestId,
          });
          return new DurableExportRejection(
            new AdminC2HttpError(operationId, 'AUDIT_EXPORT_NOT_FOUND', 'ALREADY_DURABLE'),
          );
        }
        if (current.downloadStatus === 'EXPIRED') {
          await transaction.insertHttpAudit({
            action: operationId,
            actorAdminUserId: principal.adminUserId,
            adminAuditExportId: exportId,
            adminSessionId: principal.sessionId,
            entityId: exportId,
            entityType: 'ADMIN_AUDIT_EXPORT',
            failureCode: 'RESOURCE_EXPIRED',
            outcome: 'REJECTED',
            requestId,
          });
          return new DurableExportRejection(
            new AdminC2HttpError(operationId, 'AUDIT_EXPORT_EXPIRED', 'ALREADY_DURABLE'),
          );
        }
        if (
          current.downloadStatus !== 'READY' ||
          current.generation !== record.generation ||
          current.objectKey !== record.objectKey ||
          current.contentSha256 !== record.contentSha256 ||
          current.signatureKeyId !== record.signatureKeyId ||
          current.storageKeyId !== record.storageKeyId ||
          current.plaintextBytes !== record.plaintextBytes ||
          !(await transaction.renewReadLease(acquired.leaseId))
        ) {
          await transaction.insertHttpAudit({
            action: operationId,
            actorAdminUserId: principal.adminUserId,
            adminAuditExportId: exportId,
            adminSessionId: principal.sessionId,
            entityId: exportId,
            entityType: 'ADMIN_AUDIT_EXPORT',
            failureCode: 'INTEGRITY_REJECTED',
            outcome: 'REJECTED',
            requestId,
          });
          return new DurableExportRejection(
            new AdminC2HttpError(operationId, 'SERVICE_UNAVAILABLE', 'ALREADY_DURABLE'),
          );
        }
        await transaction.insertHttpAudit({
          action: operationId,
          actorAdminUserId: principal.adminUserId,
          adminAuditExportId: exportId,
          adminSessionId: principal.sessionId,
          entityId: exportId,
          entityType: 'ADMIN_AUDIT_EXPORT',
          outcome: 'SUCCESS',
          requestId,
        });
        return undefined;
      });
    } catch (error: unknown) {
      await this.repository
        .transaction((transaction) => transaction.releaseReadLease(acquired.leaseId))
        .catch(() => undefined);
      throwTransactionFailure(operationId, error, proofComplete);
    }
    if (auditResult instanceof DurableExportRejection) {
      await this.repository
        .transaction((transaction) => transaction.releaseReadLease(acquired.leaseId))
        .catch(() => undefined);
      throw auditResult.error;
    }
    return {
      bytes: plaintext,
      contentSha256: record.contentSha256!,
      exportId,
      heartbeat: () =>
        this.repository.transaction((transaction) => transaction.renewReadLease(acquired.leaseId)),
      release: () =>
        this.repository.transaction((transaction) =>
          transaction.releaseReadLease(acquired.leaseId),
        ),
    };
  }
}
