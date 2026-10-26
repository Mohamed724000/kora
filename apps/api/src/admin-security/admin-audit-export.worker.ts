import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { createHash, randomUUID } from 'node:crypto';
import { AdminC2TransactionError } from '../database/admin-c2-transaction.service';
import {
  AdminAuditExportRepository,
  type AdminAuditExportCommitReconciliation,
  type AdminAuditExportFailureDisposition,
  type AdminAuditExportWatchdogCandidate,
  type ClaimedAdminAuditExport,
} from './admin-audit-export.repository';
import { AdminAuditExportCodec } from './admin-audit-export-codec';
import {
  ADMIN_AUDIT_EXPORT_KEYRING,
  AdminAuditExportIntegrityError,
  decryptAdminAuditExport,
  encryptAdminAuditExport,
  type AdminAuditExportEnvelopeMetadata,
  type AdminAuditExportStorageKeyring,
} from './admin-audit-export-keyring';
import {
  ADMIN_AUDIT_EXPORT_STORAGE,
  AdminAuditExportStorageUnavailableError,
  type AdminAuditExportStoragePort,
} from './admin-audit-export-storage.port';
import type { AdminAuditExportWakeupPort } from './admin-audit-export.service';

export const ADMIN_AUDIT_EXPORT_WAKEUP_QUEUE = 'admin-c2b-audit-export-wakeup';
const HEARTBEAT_MS = 30_000;
const HOUSEKEEPING_DEPENDENCY_TIMEOUT_MS = 5_000;
const STAGING_OBJECT_KEY =
  /^c2b\/staging\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/(\d+)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.zip\.enc$/iu;

class AdminAuditExportArtifactIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminAuditExportArtifactIntegrityError';
  }
}

class AdminAuditExportAttemptDeadlineError extends Error {
  constructor() {
    super('C2b export attempt deadline expired.');
    this.name = 'AdminAuditExportAttemptDeadlineError';
  }
}

class AdminAuditExportExternalDeadlineError extends Error {
  constructor() {
    super('C2b export external dependency deadline expired.');
    this.name = 'AdminAuditExportExternalDeadlineError';
  }
}

interface WakeupJob {
  readonly exportId: string;
}

function opaqueId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
  );
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function bounded<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const aborted = (): void => reject(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    void Promise.resolve()
      .then(() => {
        signal.throwIfAborted();
        return operation();
      })
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener('abort', aborted);
      });
  });
}

async function withExternalDeadline<T>(
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new AdminAuditExportExternalDeadlineError();
      controller.abort(error);
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      bounded(() => operation(controller.signal), controller.signal),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

@Injectable()
export class BullAdminAuditExportWakeup implements AdminAuditExportWakeupPort {
  constructor(
    @InjectQueue(ADMIN_AUDIT_EXPORT_WAKEUP_QUEUE)
    private readonly queue: Queue<WakeupJob>,
  ) {}

  async notify(exportId: string, signal?: AbortSignal): Promise<boolean> {
    if (!opaqueId(exportId)) return false;
    try {
      signal?.throwIfAborted();
      const enqueue = (): Promise<Job<WakeupJob>> =>
        this.queue.add(
          'wake',
          { exportId },
          {
            jobId: hash(`KORA_ADMIN_C2B_EXPORT_WAKEUP_V1\0${exportId}`),
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
      if (signal === undefined) await enqueue();
      else await bounded(enqueue, signal);
      return true;
    } catch {
      return false;
    }
  }
}

export type AdminAuditExportProcessingResult =
  | 'IDLE'
  | 'READY'
  | 'FAILED'
  | 'RETRY_SCHEDULED'
  | 'WATCHDOG_REQUEUED'
  | 'EXPIRED'
  | 'EXPIRED_OBJECT_DELETED'
  | 'READ_LEASES_PURGED'
  | 'SNAPSHOT_PURGED'
  | 'ORPHAN_STAGING_DELETED'
  | 'STALE_FENCE'
  | 'WATCHDOG_REQUIRED'
  | 'RECONCILED';

@Injectable()
export class AdminAuditExportWorker {
  private active: Promise<AdminAuditExportProcessingResult> | undefined;

  constructor(
    @Inject(AdminAuditExportRepository) private readonly repository: AdminAuditExportRepository,
    @Inject(AdminAuditExportCodec) private readonly codec: AdminAuditExportCodec,
    @Inject(ADMIN_AUDIT_EXPORT_STORAGE) private readonly storage: AdminAuditExportStoragePort,
    @Inject(ADMIN_AUDIT_EXPORT_KEYRING) private readonly keyring: AdminAuditExportStorageKeyring,
  ) {}

  processOne(): Promise<AdminAuditExportProcessingResult> {
    if (this.active === undefined) {
      this.active = this.performOne().finally(() => {
        this.active = undefined;
      });
    }
    return this.active;
  }

  async awaitQuiescence(timeoutMs = 30_000): Promise<'QUIESCED' | 'FAILED' | 'TIMEOUT'> {
    if (this.active === undefined) return 'QUIESCED';
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.active.then(
          () => 'QUIESCED' as const,
          () => 'FAILED' as const,
        ),
        new Promise<'TIMEOUT'>((resolve) => {
          timer = setTimeout(() => resolve('TIMEOUT'), timeoutMs);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private async performOne(): Promise<AdminAuditExportProcessingResult> {
    const watchdogRequestId = `c2b-watchdog-${randomUUID()}`;
    const watchdogCandidate = await this.repository.transaction((transaction) =>
      transaction.findWatchdogCandidate(),
    );
    if (watchdogCandidate !== undefined) {
      return this.resolveWatchdog(
        watchdogCandidate,
        watchdogRequestId,
        hash(`KORA_ADMIN_C2B_EXPORT_WATCHDOG_V1\0${watchdogRequestId}`),
      );
    }
    const expiredCleanup = await this.repository.transaction((transaction) =>
      transaction.findExpiredObjectCleanup(),
    );
    if (expiredCleanup?.stagingObjectKey !== null && expiredCleanup !== undefined) {
      await withExternalDeadline(HOUSEKEEPING_DEPENDENCY_TIMEOUT_MS, (signal) =>
        this.storage.delete(expiredCleanup.stagingObjectKey!, signal),
      );
      const marked = await this.repository.transaction((transaction) =>
        transaction.markExpiredObjectDeleted(expiredCleanup.id, expiredCleanup.stagingObjectKey!),
      );
      return marked ? 'EXPIRED_OBJECT_DELETED' : 'STALE_FENCE';
    }
    const purgedReadLeases = await this.repository.transaction((transaction) =>
      transaction.purgeExpiredReadLeases(),
    );
    if (purgedReadLeases > 0) return 'READ_LEASES_PURGED';
    const purgedSnapshot = await this.repository.transaction((transaction) =>
      transaction.purgeOneSnapshot(),
    );
    if (purgedSnapshot !== undefined) return 'SNAPSHOT_PURGED';
    const orphanCutoff = await this.repository.transaction((transaction) =>
      transaction.orphanStagingCutoff(),
    );
    const orphanCandidate = (
      await withExternalDeadline(HOUSEKEEPING_DEPENDENCY_TIMEOUT_MS, (signal) =>
        this.storage.listStagingBefore(orphanCutoff, signal),
      )
    )[0];
    if (orphanCandidate !== undefined) {
      const match = STAGING_OBJECT_KEY.exec(orphanCandidate.objectKey);
      if (match === null) {
        throw new AdminAuditExportStorageUnavailableError();
      }
      const eligible = await this.repository.transaction((transaction) =>
        transaction.isOrphanStagingObject({
          attemptId: match[3]!,
          exportId: match[1]!,
          generation: match[2]!,
          objectKey: orphanCandidate.objectKey,
        }),
      );
      if (!eligible) return 'STALE_FENCE';
      await withExternalDeadline(HOUSEKEEPING_DEPENDENCY_TIMEOUT_MS, (signal) =>
        this.storage.delete(orphanCandidate.objectKey, signal),
      );
      return 'ORPHAN_STAGING_DELETED';
    }
    const expiryCandidate = await this.repository.transaction((transaction) =>
      transaction.findExpiryCandidate(),
    );
    if (expiryCandidate !== undefined && expiryCandidate.objectKey !== null) {
      const expiryRequestId = `c2b-expiry-${randomUUID()}`;
      try {
        const changed = await this.repository.transaction((transaction) =>
          transaction.expire(
            expiryCandidate,
            expiryRequestId,
            hash(
              `KORA_ADMIN_C2B_EXPORT_EXPIRY_V1\0${expiryCandidate.id}\0${expiryCandidate.generation}`,
            ),
          ),
        );
        return changed ? 'EXPIRED' : 'STALE_FENCE';
      } catch (error: unknown) {
        if (error instanceof AdminC2TransactionError && error.code === 'COMMIT_UNKNOWN') {
          const reconciled = await this.repository.transaction((transaction) =>
            transaction.findById(expiryCandidate.id),
          );
          return reconciled?.state === 'EXPIRED' ? 'RECONCILED' : 'STALE_FENCE';
        }
        throw error;
      }
    }
    const attemptId = randomUUID();
    const ownerHash = hash(`KORA_ADMIN_C2B_EXPORT_WORKER_V1\0${randomUUID()}`);
    let claimed: ClaimedAdminAuditExport | undefined;
    try {
      claimed = await this.repository.transaction((transaction) =>
        transaction.claimNext(attemptId, ownerHash),
      );
    } catch (error: unknown) {
      if (!(error instanceof AdminC2TransactionError) || error.code !== 'COMMIT_UNKNOWN') {
        throw error;
      }
      const reconciled = await this.repository.transaction((transaction) =>
        transaction.findByAttemptId(attemptId),
      );
      if (
        reconciled?.state !== 'PROCESSING' ||
        reconciled.attemptId !== attemptId ||
        reconciled.claimOwnerHash !== ownerHash ||
        reconciled.attemptDeadline === null ||
        reconciled.attemptStartedAt === null ||
        reconciled.leaseExpiresAt === null
      ) {
        return 'RECONCILED';
      }
      claimed = reconciled as ClaimedAdminAuditExport;
    }
    if (claimed === undefined) return 'IDLE';
    const claimDisposition = await this.readFailureDisposition(claimed);
    const claimRouting = this.routeDisposition(claimDisposition);
    if (claimRouting !== undefined) return claimRouting;

    let heartbeatFailed = false;
    const heartbeatTimer = setInterval(() => {
      void this.repository
        .transaction((transaction) => transaction.heartbeat(claimed))
        .then((current) => {
          if (!current) heartbeatFailed = true;
        })
        .catch(() => {
          heartbeatFailed = true;
        });
    }, HEARTBEAT_MS);
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const entries = await this.repository.transaction((transaction) =>
        transaction.snapshotEntries(claimed.snapshotId),
      );
      const remainingMs = await this.repository.transaction((transaction) =>
        transaction.remainingAttemptMilliseconds(claimed),
      );
      if (remainingMs === undefined) return this.routeCurrentAttempt(claimed);
      if (remainingMs <= 0) throw new AdminAuditExportAttemptDeadlineError();
      const deadline = new AbortController();
      deadlineTimer = setTimeout(
        () => deadline.abort(new AdminAuditExportAttemptDeadlineError()),
        remainingMs,
      );
      const artifact = await bounded(
        () =>
          this.codec.build(
            {
              createdAt: claimed.createdAt.toISOString(),
              entries,
              exportId: claimed.id,
            },
            deadline.signal,
          ),
        deadline.signal,
      );
      await bounded(
        () =>
          this.codec.verify(
            artifact.bytes,
            {
              contentSha256: artifact.contentSha256,
              exportId: claimed.id,
              signatureKeyId: artifact.signatureKeyId,
            },
            deadline.signal,
          ),
        deadline.signal,
      );
      if (heartbeatFailed) throw new AdminAuditExportStorageUnavailableError();
      const afterBuild = await this.repository.transaction((transaction) =>
        transaction.failureDisposition(claimed),
      );
      const afterBuildRouting = this.routeDisposition(afterBuild);
      if (afterBuildRouting !== undefined) return afterBuildRouting;
      const metadata: AdminAuditExportEnvelopeMetadata = {
        attemptId: claimed.attemptId,
        contentSha256: artifact.contentSha256,
        exportId: claimed.id,
        generation: String(claimed.generation),
        plaintextBytes: artifact.bytes.byteLength,
        signatureKeyId: artifact.signatureKeyId,
      };
      const encrypted = await bounded(
        () => encryptAdminAuditExport(this.keyring, artifact.bytes, metadata, deadline.signal),
        deadline.signal,
      );
      const stagingObjectKey = `c2b/staging/${claimed.id}/${claimed.generation}/${claimed.attemptId}.zip.enc`;
      await bounded(
        () => this.storage.putIfAbsent(stagingObjectKey, encrypted.bytes, deadline.signal),
        deadline.signal,
      );
      const staged = await bounded(
        () => this.storage.get(stagingObjectKey, deadline.signal),
        deadline.signal,
      );
      const stagedPlaintext = Buffer.from(
        await bounded(
          () => decryptAdminAuditExport(this.keyring, staged, metadata, deadline.signal),
          deadline.signal,
        ),
      );
      if (
        !stagedPlaintext.equals(artifact.bytes) ||
        createHash('sha256').update(stagedPlaintext).digest('hex') !== artifact.contentSha256
      ) {
        throw new AdminAuditExportArtifactIntegrityError('C2b staging verification failed.');
      }
      await bounded(
        () =>
          this.codec.verify(
            stagedPlaintext,
            {
              contentSha256: artifact.contentSha256,
              exportId: claimed.id,
              signatureKeyId: artifact.signatureKeyId,
            },
            deadline.signal,
          ),
        deadline.signal,
      );
      if (heartbeatFailed) throw new AdminAuditExportStorageUnavailableError();
      const beforeCommit = await this.repository.transaction((transaction) =>
        transaction.failureDisposition(claimed),
      );
      const beforeCommitRouting = this.routeDisposition(beforeCommit);
      if (beforeCommitRouting !== undefined) return beforeCommitRouting;
      const requestId = `c2b-worker-${randomUUID()}`;
      const systemExecutionRefHash = hash(
        `KORA_ADMIN_C2B_EXPORT_EXECUTION_V1\0${claimed.id}\0${claimed.generation}\0${claimed.attemptId}`,
      );
      const readyArtifact = {
        contentSha256: artifact.contentSha256,
        encryptedBytes: Buffer.byteLength(staged),
        objectKey: stagingObjectKey,
        plaintextBytes: artifact.bytes.byteLength,
        signatureKeyId: artifact.signatureKeyId,
        stagingObjectKey,
        storageKeyId: encrypted.keyId,
      };
      let committed: boolean;
      try {
        committed = await this.repository.transaction((transaction) =>
          transaction.finishReady(claimed, readyArtifact, requestId, systemExecutionRefHash),
        );
      } catch (error: unknown) {
        if (error instanceof AdminC2TransactionError && error.code === 'COMMIT_UNKNOWN') {
          const reconciliation = await this.repository.transaction((transaction) =>
            transaction.reconcileReady(claimed, readyArtifact, requestId, systemExecutionRefHash),
          );
          const reconciliationResult = this.routeReconciliation(reconciliation);
          if (reconciliationResult !== undefined) return reconciliationResult;
          if (reconciliation === 'ACTIVE') {
            try {
              const resumed = await this.repository.transaction((transaction) =>
                transaction.finishReady(claimed, readyArtifact, requestId, systemExecutionRefHash),
              );
              if (!resumed) return this.routeCurrentAttempt(claimed);
              return 'READY';
            } catch (resumeError: unknown) {
              if (
                resumeError instanceof AdminC2TransactionError &&
                resumeError.code === 'COMMIT_UNKNOWN'
              ) {
                const resumedReconciliation = await this.repository.transaction((transaction) =>
                  transaction.reconcileReady(
                    claimed,
                    readyArtifact,
                    requestId,
                    systemExecutionRefHash,
                  ),
                );
                return this.routeReconciliation(resumedReconciliation) ?? 'STALE_FENCE';
              }
              throw resumeError;
            }
          }
          return 'STALE_FENCE';
        }
        throw error;
      }
      if (!committed) return this.routeCurrentAttempt(claimed);
      return 'READY';
    } catch (error: unknown) {
      const failureCode =
        error instanceof AdminAuditExportAttemptDeadlineError
          ? 'DEPENDENCY_UNAVAILABLE'
          : error instanceof AdminAuditExportIntegrityError ||
              error instanceof AdminAuditExportArtifactIntegrityError ||
              error instanceof TypeError
            ? 'INTEGRITY_FAILED'
            : 'DEPENDENCY_UNAVAILABLE';
      return await this.failOrRetry(claimed, failureCode);
    } finally {
      clearInterval(heartbeatTimer);
      if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    }
  }

  private async resolveWatchdog(
    candidate: AdminAuditExportWatchdogCandidate,
    requestId: string,
    systemExecutionRefHash: string,
  ): Promise<AdminAuditExportProcessingResult> {
    const run = (): Promise<'IDLE' | 'REQUEUED' | 'FAILED' | 'STALE_FENCE'> =>
      this.repository.transaction((transaction) =>
        transaction.watchdogOne(candidate, requestId, systemExecutionRefHash),
      );
    const map = (
      result: 'IDLE' | 'REQUEUED' | 'FAILED' | 'STALE_FENCE',
    ): AdminAuditExportProcessingResult => {
      if (result === 'FAILED') return 'FAILED';
      if (result === 'REQUEUED') return 'WATCHDOG_REQUEUED';
      return result === 'IDLE' ? 'IDLE' : 'STALE_FENCE';
    };
    try {
      return map(await run());
    } catch (error: unknown) {
      if (this.isTemporalTransitionRefusal(error)) {
        return this.routeWatchdogRefusal(candidate);
      }
      if (!(error instanceof AdminC2TransactionError) || error.code !== 'COMMIT_UNKNOWN') {
        throw error;
      }
      const reconciliation = await this.repository.transaction((transaction) =>
        transaction.reconcileWatchdog(candidate, requestId, systemExecutionRefHash),
      );
      if (reconciliation === 'APPLIED' || reconciliation === 'RETRY_SCHEDULED') {
        return 'RECONCILED';
      }
      if (reconciliation === 'STALE_FENCE') return 'STALE_FENCE';
      if (reconciliation === 'ACTIVE') return 'IDLE';
      try {
        return map(await run());
      } catch (resumeError: unknown) {
        if (this.isTemporalTransitionRefusal(resumeError)) {
          return this.routeWatchdogRefusal(candidate);
        }
        if (
          !(resumeError instanceof AdminC2TransactionError) ||
          resumeError.code !== 'COMMIT_UNKNOWN'
        ) {
          throw resumeError;
        }
        const resumedReconciliation = await this.repository.transaction((transaction) =>
          transaction.reconcileWatchdog(candidate, requestId, systemExecutionRefHash),
        );
        if (resumedReconciliation === 'APPLIED' || resumedReconciliation === 'RETRY_SCHEDULED') {
          return 'RECONCILED';
        }
        return resumedReconciliation === 'WATCHDOG_REQUIRED' ? 'WATCHDOG_REQUIRED' : 'STALE_FENCE';
      }
    }
  }

  private async failOrRetry(
    claimed: ClaimedAdminAuditExport,
    failureCode:
      | 'RETRY_BUDGET_EXHAUSTED'
      | 'PROJECTION_BUDGET_EXCEEDED'
      | 'INTEGRITY_FAILED'
      | 'DEPENDENCY_UNAVAILABLE',
  ): Promise<AdminAuditExportProcessingResult> {
    const disposition = await this.readFailureDisposition(claimed);
    const dispositionRouting = this.routeDisposition(disposition);
    if (dispositionRouting !== undefined) return dispositionRouting;
    const retry = failureCode === 'DEPENDENCY_UNAVAILABLE' && disposition === 'RETRYABLE';
    const terminalFailureCode =
      failureCode === 'DEPENDENCY_UNAVAILABLE' && disposition === 'BUDGET_EXHAUSTED'
        ? 'RETRY_BUDGET_EXHAUSTED'
        : failureCode;
    const requestId = `c2b-worker-${randomUUID()}`;
    const systemExecutionRefHash = hash(
      `KORA_ADMIN_C2B_EXPORT_EXECUTION_V1\0${claimed.id}\0${claimed.generation}\0${claimed.attemptId}`,
    );
    try {
      if (retry) {
        const changed = await this.repository.transaction((transaction) =>
          transaction.scheduleRetry(claimed, systemExecutionRefHash),
        );
        return changed ? 'RETRY_SCHEDULED' : this.routeCurrentAttempt(claimed);
      }
      const changed = await this.repository.transaction((transaction) =>
        transaction.finishFailed(claimed, terminalFailureCode, requestId, systemExecutionRefHash),
      );
      return changed ? 'FAILED' : this.routeCurrentAttempt(claimed);
    } catch (error: unknown) {
      if (this.isTemporalTransitionRefusal(error)) return this.routeCurrentAttempt(claimed);
      if (!(error instanceof AdminC2TransactionError) || error.code !== 'COMMIT_UNKNOWN') {
        throw error;
      }
      const reconciliation = await this.repository.transaction((transaction) =>
        transaction.reconcileFailedOrRetry(
          claimed,
          terminalFailureCode,
          retry,
          requestId,
          systemExecutionRefHash,
        ),
      );
      const reconciliationResult = this.routeReconciliation(reconciliation);
      if (reconciliationResult !== undefined) return reconciliationResult;
      try {
        if (retry) {
          const resumed = await this.repository.transaction((transaction) =>
            transaction.scheduleRetry(claimed, systemExecutionRefHash),
          );
          return resumed ? 'RETRY_SCHEDULED' : this.routeCurrentAttempt(claimed);
        }
        const resumed = await this.repository.transaction((transaction) =>
          transaction.finishFailed(claimed, terminalFailureCode, requestId, systemExecutionRefHash),
        );
        return resumed ? 'FAILED' : this.routeCurrentAttempt(claimed);
      } catch (resumeError: unknown) {
        if (this.isTemporalTransitionRefusal(resumeError)) {
          return this.routeCurrentAttempt(claimed);
        }
        if (
          !(resumeError instanceof AdminC2TransactionError) ||
          resumeError.code !== 'COMMIT_UNKNOWN'
        ) {
          throw resumeError;
        }
        const resumedReconciliation = await this.repository.transaction((transaction) =>
          transaction.reconcileFailedOrRetry(
            claimed,
            terminalFailureCode,
            retry,
            requestId,
            systemExecutionRefHash,
          ),
        );
        return this.routeReconciliation(resumedReconciliation) ?? 'STALE_FENCE';
      }
    }
  }

  private routeDisposition(
    disposition: AdminAuditExportFailureDisposition,
  ): AdminAuditExportProcessingResult | undefined {
    if (disposition === 'STALE_FENCE') return 'STALE_FENCE';
    if (disposition === 'RETRY_SCHEDULED') return 'RECONCILED';
    if (disposition === 'DEADLINE_EXPIRED' || disposition === 'LEASE_EXPIRED') {
      return 'WATCHDOG_REQUIRED';
    }
    return undefined;
  }

  private routeReconciliation(
    reconciliation: AdminAuditExportCommitReconciliation,
  ): AdminAuditExportProcessingResult | undefined {
    if (reconciliation === 'APPLIED' || reconciliation === 'RETRY_SCHEDULED') {
      return 'RECONCILED';
    }
    if (reconciliation === 'WATCHDOG_REQUIRED') return 'WATCHDOG_REQUIRED';
    if (reconciliation === 'STALE_FENCE') return 'STALE_FENCE';
    return undefined;
  }

  private async routeCurrentAttempt(
    claimed: ClaimedAdminAuditExport,
  ): Promise<AdminAuditExportProcessingResult> {
    const disposition = await this.readFailureDisposition(claimed);
    return this.routeDisposition(disposition) ?? 'STALE_FENCE';
  }

  private async routeWatchdogRefusal(
    claimed: ClaimedAdminAuditExport,
  ): Promise<AdminAuditExportProcessingResult> {
    const disposition = await this.readFailureDisposition(claimed);
    if (disposition === 'RETRYABLE' || disposition === 'BUDGET_EXHAUSTED') return 'IDLE';
    return this.routeDisposition(disposition) ?? 'STALE_FENCE';
  }

  private isTemporalTransitionRefusal(error: unknown): boolean {
    if (!(error instanceof AdminC2TransactionError) || error.code !== 'CALLBACK_FAILED') {
      return false;
    }
    const primary = error.primaryError;
    if (primary === null || typeof primary !== 'object') return false;
    const code = 'code' in primary ? primary.code : undefined;
    const message = 'message' in primary ? primary.message : undefined;
    if (code !== '23514' || typeof message !== 'string') return false;
    return [
      'C2b export ordinary retry fence is no longer active',
      'C2b export heartbeat fence is no longer active',
      'C2b export READY fence is no longer active',
      'C2b export FAILED fence is no longer active',
      'C2b export watchdog transition is not eligible',
    ].some((expected) => message.includes(expected));
  }

  private async readFailureDisposition(
    claimed: ClaimedAdminAuditExport,
  ): Promise<AdminAuditExportFailureDisposition> {
    try {
      return await this.repository.transaction((transaction) =>
        transaction.failureDisposition(claimed),
      );
    } catch (error: unknown) {
      if (!(error instanceof AdminC2TransactionError) || error.code !== 'COMMIT_UNKNOWN') {
        throw error;
      }
      return this.repository.transaction((transaction) => transaction.failureDisposition(claimed));
    }
  }
}

@Processor(ADMIN_AUDIT_EXPORT_WAKEUP_QUEUE, { concurrency: 1 })
export class AdminAuditExportWakeupProcessor extends WorkerHost {
  constructor(
    @Inject(AdminAuditExportWorker) private readonly exportWorker: AdminAuditExportWorker,
  ) {
    super();
  }

  async process(job: Job<WakeupJob>): Promise<void> {
    if (
      job.name !== 'wake' ||
      job.data === null ||
      typeof job.data !== 'object' ||
      JSON.stringify(Object.keys(job.data).sort()) !== '["exportId"]' ||
      !opaqueId(job.data.exportId)
    ) {
      throw new Error('Invalid C2b audit-export wake-up job.');
    }
    for (let inspected = 0; inspected < 100; inspected += 1) {
      if ((await this.exportWorker.processOne()) === 'IDLE') return;
    }
  }
}
