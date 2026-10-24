import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import type {
  AdminRole,
  AdminStatus,
  AdminStepUpPurpose,
} from '../admin-auth/admin-auth.repository';
import { AdminC2bBoundariesService } from '../database/admin-c2b-boundaries.service';
import type { AdminC2Transaction } from '../database/admin-c2-transaction.service';
import type { AdminAuditFilters, AdminAuditLogEntry } from './admin-audit.types';
import { projectAdminAudit, type AdminAuditProjectionRow } from './admin-audit.projection';
import type { AdminC2OperationId } from './admin-security.errors';

export interface AdminAuditPrincipal extends QueryResultRow {
  readonly absoluteExpiresAt: Date | null;
  readonly accessTokenJti: string;
  readonly adminUserId: string;
  readonly authorizationVersion: number;
  readonly expiresAt: Date;
  readonly role: AdminRole;
  readonly sessionAuthorizationVersion: number;
  readonly sessionId: string;
  readonly sessionRevokedAt: Date | null;
  readonly status: AdminStatus;
  readonly stepUpExpiresAt: Date | null;
  readonly stepUpPurpose: AdminStepUpPurpose | null;
}

export interface AdminAuditSnapshot extends QueryResultRow {
  readonly createdAt: Date;
  readonly entryCount: number;
  readonly expiresAt: Date;
  readonly filtersDigest: string;
  readonly id: string;
  readonly operation: 'LIST_ADMIN_AUDIT_LOGS' | 'CREATE_ADMIN_AUDIT_LOG_EXPORT';
  readonly principalAdminUserId: string;
  readonly utf8Bytes: string | number | bigint;
}

export interface AdminAuditSnapshotItem extends QueryResultRow {
  readonly ordinal: number;
  readonly projectionJson: string;
  readonly resourceId: string;
  readonly sourceCreatedAt: Date;
  readonly utf8Bytes: number;
}

export type AdminAuditExportState = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED' | 'EXPIRED';

export type AdminAuditExportDownloadStatus = 'READY' | 'EXPIRED' | 'NOT_READY';

export interface AdminAuditExportRecord extends QueryResultRow {
  readonly attemptDeadline: Date | null;
  readonly attemptId: string | null;
  readonly attemptNumber: number;
  readonly attemptStartedAt: Date | null;
  readonly claimOwnerHash: string | null;
  readonly contentSha256: string | null;
  readonly createdAt: Date;
  readonly creatorAdminUserId: string;
  readonly encryptedBytes: string | number | bigint | null;
  readonly expiredAt: Date | null;
  readonly expiresAt: Date | null;
  readonly failedAt: Date | null;
  readonly failureCode:
    | 'RETRY_BUDGET_EXHAUSTED'
    | 'PROJECTION_BUDGET_EXCEEDED'
    | 'INTEGRITY_FAILED'
    | 'DEPENDENCY_UNAVAILABLE'
    | null;
  readonly generation: string | number | bigint;
  readonly id: string;
  readonly leaseExpiresAt: Date | null;
  readonly nextAttemptAt: Date | null;
  readonly objectKey: string | null;
  readonly plaintextBytes: string | number | bigint | null;
  readonly readyAt: Date | null;
  readonly signatureKeyId: string | null;
  readonly snapshotId: string;
  readonly sourceAuditLogId: string;
  readonly stagingObjectKey: string | null;
  readonly state: AdminAuditExportState;
  readonly storageKeyId: string | null;
}

export interface AdminAuditExportDownloadRecord extends AdminAuditExportRecord {
  readonly downloadStatus: AdminAuditExportDownloadStatus;
}

interface IdempotencyRecord extends QueryResultRow {
  readonly exportId: string;
  readonly requestDigest: string;
}

function filterSql(filters: AdminAuditFilters): { clause: string; values: unknown[] } {
  const predicates: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown): void => {
    values.push(value);
    predicates.push(sql.replace('?', `$${values.length}`));
  };
  if (filters.action !== undefined) add('source."action" = ?', filters.action);
  if (filters.actorAdminUserId !== undefined) {
    add('source."actorAdminUserId" = ?', filters.actorAdminUserId);
  }
  if (filters.entityType !== undefined) add('source."entityType" = ?', filters.entityType);
  if (filters.entityId !== undefined) add('source."entityId" = ?', filters.entityId);
  if (filters.createdFrom !== undefined)
    add('source."createdAt" >= ?::timestamptz', filters.createdFrom);
  if (filters.createdTo !== undefined)
    add('source."createdAt" <= ?::timestamptz', filters.createdTo);
  if (filters.auditVersion !== undefined) add('source."version" = ?', filters.auditVersion);
  if (filters.auditEventClass !== undefined)
    add('source."eventClass" = ?', filters.auditEventClass);
  if (filters.auditContext !== undefined) add('source."context" = ?', filters.auditContext);
  if (filters.auditReasonCode !== undefined)
    add('source."reasonCode" = ?', filters.auditReasonCode);
  return { clause: predicates.length === 0 ? '' : `WHERE ${predicates.join(' AND ')}`, values };
}

export class AdminAuditTransactionRepository {
  constructor(private readonly transaction: AdminC2Transaction) {}

  async lockPrincipal(
    adminUserId: string,
    sessionId: string,
  ): Promise<AdminAuditPrincipal | undefined> {
    const result = await this.transaction.query<AdminAuditPrincipal>(
      `SELECT * FROM public.kora_lock_admin_c2b_principal($1, $2)`,
      [adminUserId, sessionId],
    );
    return result.rows[0];
  }

  async selectProjection(filters: AdminAuditFilters): Promise<readonly AdminAuditLogEntry[]> {
    const where = filterSql(filters);
    const result = await this.transaction.query<AdminAuditProjectionRow & QueryResultRow>(
      `SELECT source.*
         FROM "AdminC2bAuditProjectionSource" source
         ${where.clause}
        ORDER BY source."createdAt" DESC, source."eventId" DESC
        LIMIT 10001`,
      where.values,
    );
    return result.rows.map(projectAdminAudit);
  }

  async insertSnapshot(input: {
    filtersDigest: string;
    items: readonly AdminAuditLogEntry[];
    operation: AdminAuditSnapshot['operation'];
    principalAdminUserId: string;
  }): Promise<string> {
    const id = randomUUID();
    const serialized = input.items.map((item) => JSON.stringify(item));
    const utf8Bytes = serialized.reduce(
      (total, item) => total + Buffer.byteLength(item, 'utf8'),
      0,
    );
    await this.transaction.query(
      `INSERT INTO "AdminAuditPaginationSnapshot"
         ("id", "principalAdminUserId", "operation", "filtersDigest",
          "projectionVersion", "entryCount", "utf8Bytes")
       VALUES ($1, $2, $3, $4, 1, $5, $6)`,
      [
        id,
        input.principalAdminUserId,
        input.operation,
        input.filtersDigest,
        serialized.length,
        utf8Bytes,
      ],
    );
    if (serialized.length > 0) {
      await this.transaction.query(
        `INSERT INTO "AdminAuditPaginationSnapshotItem"
           ("snapshotId", "ordinal", "resourceId", "sourceCreatedAt", "projectionJson", "utf8Bytes")
         SELECT $1, input."ordinal", input."resourceId", input."sourceCreatedAt",
                input."projectionJson", input."utf8Bytes"
           FROM unnest(
             $2::integer[], $3::text[], $4::timestamp(3)[], $5::text[], $6::integer[]
           ) AS input("ordinal", "resourceId", "sourceCreatedAt", "projectionJson", "utf8Bytes")`,
        [
          id,
          serialized.map((_, ordinal) => ordinal),
          input.items.map((item) => item.eventId),
          input.items.map((item) => item.createdAt),
          serialized,
          serialized.map((projectionJson) => Buffer.byteLength(projectionJson, 'utf8')),
        ],
      );
    }
    return id;
  }

  async getSnapshot(
    id: string,
    principalAdminUserId: string,
  ): Promise<AdminAuditSnapshot | undefined> {
    const result = await this.transaction.query<AdminAuditSnapshot>(
      `SELECT "id", "principalAdminUserId", "operation", "filtersDigest",
              "entryCount", "utf8Bytes", "createdAt", "expiresAt"
         FROM "AdminAuditPaginationSnapshot"
        WHERE "id" = $1 AND "principalAdminUserId" = $2`,
      [id, principalAdminUserId],
    );
    return result.rows[0];
  }

  async getSnapshotPage(
    snapshotId: string,
    firstOrdinal: number,
    limit: number,
  ): Promise<readonly AdminAuditSnapshotItem[]> {
    const result = await this.transaction.query<AdminAuditSnapshotItem>(
      `SELECT "ordinal", "projectionJson", "resourceId", "sourceCreatedAt", "utf8Bytes"
         FROM "AdminAuditPaginationSnapshotItem"
        WHERE "snapshotId" = $1 AND "ordinal" >= $2
        ORDER BY "ordinal" ASC
        LIMIT $3`,
      [snapshotId, firstOrdinal, limit],
    );
    return result.rows;
  }

  async insertSecurityEvent(input: {
    action: AdminC2OperationId;
    adminUserId?: string;
    entityId?: string;
    entityType?: string;
    failureCode: string;
    requestId: string;
    subjectRefHash?: string;
  }): Promise<void> {
    await this.transaction.query(
      `INSERT INTO "AdminSecurityEvent"
         ("id", "adminUserId", "eventClass", "action", "outcome", "failureCode",
          "requestId", "subjectRefHash", "entityType", "entityId")
       VALUES ($1, $2, 'EXPORT', $3, 'FAILED', $4, $5, $6, $7, $8)`,
      [
        randomUUID(),
        input.adminUserId ?? null,
        input.action,
        input.failureCode,
        input.requestId,
        input.subjectRefHash ?? null,
        input.entityType ?? null,
        input.entityId ?? null,
      ],
    );
  }

  async insertHttpAudit(input: {
    action: AdminC2OperationId;
    adminAuditExportId?: string;
    adminSessionId: string;
    actorAdminUserId: string;
    entityId: string;
    entityType: 'ADMIN_AUDIT_SNAPSHOT' | 'ADMIN_AUDIT_EXPORT';
    failureCode?: string;
    operatorReason?: string;
    outcome: 'SUCCESS' | 'REJECTED';
    requestId: string;
    id?: string;
  }): Promise<string> {
    const id = input.id ?? randomUUID();
    await this.transaction.query(
      `INSERT INTO "AuditLog"
         ("id", "version", "adminUserId", "adminSessionId", "eventClass", "context",
          "outcome", "failureCode", "action", "entityType", "entityId", "reason",
          "reasonCode", "operatorReason", "requestId", "adminAuditExportId")
       VALUES ($1, 3, $2, $3, 'EXPORT', 'ADMIN_SESSION', $4, $5, $6, $7, $8,
               'C2_RUNTIME', 'AUDIT_EXPORT', $9, $10, $11)`,
      [
        id,
        input.actorAdminUserId,
        input.adminSessionId,
        input.outcome,
        input.failureCode ?? null,
        input.action,
        input.entityType,
        input.entityId,
        input.operatorReason ?? null,
        input.requestId,
        input.adminAuditExportId ?? null,
      ],
    );
    return id;
  }

  async findActiveIdempotency(
    adminUserId: string,
    idempotencyKey: string,
  ): Promise<IdempotencyRecord | undefined> {
    const result = await this.transaction.query<IdempotencyRecord>(
      `SELECT "requestDigest", "exportId"
         FROM "AdminAuditExportIdempotencyRecord"
        WHERE "adminUserId" = $1
          AND "operation" = 'CREATE_ADMIN_AUDIT_LOG_EXPORT'
          AND "idempotencyKey" = $2
          AND "expiresAt" >
              (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
        ORDER BY "generation" DESC
        LIMIT 1`,
      [adminUserId, idempotencyKey],
    );
    return result.rows[0];
  }

  async lockExportIdempotency(adminUserId: string, idempotencyKey: string): Promise<void> {
    await this.transaction.query(`SELECT public.kora_lock_admin_c2b_export_idempotency($1, $2)`, [
      adminUserId,
      idempotencyKey,
    ]);
  }

  async insertExport(input: {
    creatorAdminUserId: string;
    exportId: string;
    idempotencyKey: string;
    requestDigest: string;
    snapshotId: string;
    sourceAuditLogId: string;
  }): Promise<void> {
    await this.transaction.query(
      `INSERT INTO "AdminAuditExport" ("id", "creatorAdminUserId", "snapshotId", "sourceAuditLogId")
       VALUES ($1, $2, $3, $4)`,
      [input.exportId, input.creatorAdminUserId, input.snapshotId, input.sourceAuditLogId],
    );
    await this.transaction.query(
      `INSERT INTO "AdminAuditExportIdempotencyRecord"
         ("id", "adminUserId", "operation", "idempotencyKey", "requestDigest",
          "responseCode", "exportId")
       VALUES ($1, $2, 'CREATE_ADMIN_AUDIT_LOG_EXPORT', $3, $4, 202, $5)`,
      [
        randomUUID(),
        input.creatorAdminUserId,
        input.idempotencyKey,
        input.requestDigest,
        input.exportId,
      ],
    );
  }

  async getExport(
    id: string,
    creatorAdminUserId: string,
  ): Promise<AdminAuditExportRecord | undefined> {
    const result = await this.transaction.query<AdminAuditExportRecord>(
      `SELECT "id", "creatorAdminUserId", "snapshotId", "sourceAuditLogId", "state",
              "generation", "objectKey",
              "contentSha256", "signatureKeyId", "storageKeyId", "plaintextBytes",
              "failureCode", "createdAt", "expiresAt"
         FROM "AdminAuditExport"
        WHERE "id" = $1 AND "creatorAdminUserId" = $2`,
      [id, creatorAdminUserId],
    );
    return result.rows[0];
  }

  async getExportForDownload(
    id: string,
    creatorAdminUserId: string,
  ): Promise<AdminAuditExportDownloadRecord | undefined> {
    await this.transaction.query(`SELECT public.kora_lock_admin_c2b_export_lifecycle($1)`, [id]);
    const result = await this.transaction.query<AdminAuditExportDownloadRecord>(
      `WITH database_clock AS MATERIALIZED (
         SELECT (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now
       )
       SELECT "id", "creatorAdminUserId", "snapshotId", "sourceAuditLogId", "state",
              "generation", "objectKey", "contentSha256", "signatureKeyId", "storageKeyId",
              "plaintextBytes", "failureCode", "createdAt", "readyAt", "expiresAt",
              CASE
                WHEN "state" = 'EXPIRED'
                  OR ("expiresAt" IS NOT NULL AND "expiresAt" <= database_clock.now)
                  THEN 'EXPIRED'
                WHEN "state" = 'READY'
                  AND "expiresAt" > database_clock.now
                  AND "objectKey" IS NOT NULL
                  AND "contentSha256" IS NOT NULL
                  AND "signatureKeyId" IS NOT NULL
                  AND "storageKeyId" IS NOT NULL
                  AND "plaintextBytes" IS NOT NULL
                  THEN 'READY'
                ELSE 'NOT_READY'
              END AS "downloadStatus"
         FROM "AdminAuditExport"
         CROSS JOIN database_clock
        WHERE "id" = $1 AND "creatorAdminUserId" = $2`,
      [id, creatorAdminUserId],
    );
    return result.rows[0];
  }

  async acquireReadLease(input: {
    exportId: string;
    ownerHash: string;
    readerAdminUserId: string;
  }): Promise<string> {
    const id = randomUUID();
    await this.transaction.query(
      `INSERT INTO "AdminAuditExportReadLease" ("id", "exportId", "readerAdminUserId", "ownerHash")
       VALUES ($1, $2, $3, $4)`,
      [id, input.exportId, input.readerAdminUserId, input.ownerHash],
    );
    return id;
  }

  async releaseReadLease(id: string): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminAuditExportReadLease"
          SET "releasedAt" =
              (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
        WHERE "id" = $1`,
      [id],
    );
  }

  async renewReadLease(id: string): Promise<boolean> {
    const result = await this.transaction.query(
      `UPDATE "AdminAuditExportReadLease"
          SET "lastHeartbeatAt" =
              (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
        WHERE "id" = $1 AND "releasedAt" IS NULL`,
      [id],
    );
    return result.rowCount === 1;
  }
}

@Injectable()
export class AdminAuditRepository {
  constructor(
    @Inject(AdminC2bBoundariesService) private readonly boundaries: AdminC2bBoundariesService,
  ) {}

  transaction<T>(
    callback: (repository: AdminAuditTransactionRepository) => Promise<T>,
  ): Promise<T> {
    return this.boundaries.transaction((transaction) =>
      callback(new AdminAuditTransactionRepository(transaction)),
    );
  }
}
