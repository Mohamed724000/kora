import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import { AdminC2bBoundariesService } from '../database/admin-c2b-boundaries.service';
import type { AdminC2Transaction } from '../database/admin-c2-transaction.service';
import type { AdminAuditExportRecord, AdminAuditSnapshotItem } from './admin-audit.repository';
import type { AdminAuditLogEntry } from './admin-audit.types';

export interface ClaimedAdminAuditExport extends AdminAuditExportRecord {
  readonly attemptDeadline: Date;
  readonly attemptId: string;
  readonly attemptStartedAt: Date;
  readonly claimOwnerHash: string;
  readonly leaseExpiresAt: Date;
}

export type AdminAuditExportWatchdogResult = 'IDLE' | 'REQUEUED' | 'FAILED' | 'STALE_FENCE';
export type AdminAuditExportFailureDisposition =
  'RETRYABLE' | 'DEADLINE_EXPIRED' | 'BUDGET_EXHAUSTED' | 'STALE_FENCE';

export interface AdminAuditExportWatchdogCandidate extends ClaimedAdminAuditExport {
  readonly deadlineExpired: boolean;
}

function exportColumns(qualifier?: string): string {
  const prefix = qualifier === undefined ? '' : `${qualifier}.`;
  return `${prefix}"id", ${prefix}"creatorAdminUserId", ${prefix}"snapshotId", ${prefix}"sourceAuditLogId", ${prefix}"state",
    ${prefix}"generation", ${prefix}"attemptNumber", ${prefix}"attemptId", ${prefix}"claimOwnerHash", ${prefix}"attemptStartedAt",
    ${prefix}"attemptDeadline", ${prefix}"leaseExpiresAt", ${prefix}"nextAttemptAt", ${prefix}"stagingObjectKey", ${prefix}"objectKey",
    ${prefix}"contentSha256", ${prefix}"signatureKeyId", ${prefix}"storageKeyId", ${prefix}"plaintextBytes", ${prefix}"encryptedBytes",
    ${prefix}"failureCode", ${prefix}"createdAt", ${prefix}"readyAt", ${prefix}"failedAt", ${prefix}"expiresAt", ${prefix}"expiredAt"`;
}

export class AdminAuditExportTransactionRepository {
  constructor(private readonly transaction: AdminC2Transaction) {}

  async claimNext(
    attemptId: string,
    ownerHash: string,
  ): Promise<ClaimedAdminAuditExport | undefined> {
    const result = await this.transaction.query<ClaimedAdminAuditExport>(
      `WITH candidate AS (
         SELECT "id"
           FROM "AdminAuditExport"
          WHERE (
              "state" = 'PENDING'
              OR ("state" = 'PROCESSING' AND "attemptId" IS NULL AND "nextAttemptAt" IS NOT NULL)
            )
            AND "nextAttemptAt" <=
                (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
            AND (
              "attemptDeadline" IS NULL
              OR "attemptDeadline" >
                 (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
            )
            AND "attemptNumber" < 3
          ORDER BY "nextAttemptAt" ASC, "createdAt" ASC, "id" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
       )
       UPDATE "AdminAuditExport" export_entry
          SET "state" = 'PROCESSING',
              "generation" = export_entry."generation" + 1,
              "attemptNumber" = export_entry."attemptNumber" + 1,
              "attemptId" = $1,
              "claimOwnerHash" = $2
         FROM candidate
        WHERE export_entry."id" = candidate."id"
       RETURNING ${exportColumns('export_entry')}`,
      [attemptId, ownerHash],
    );
    return result.rows[0];
  }

  async findById(id: string): Promise<AdminAuditExportRecord | undefined> {
    const result = await this.transaction.query<AdminAuditExportRecord>(
      `SELECT ${exportColumns()} FROM "AdminAuditExport" WHERE "id" = $1`,
      [id],
    );
    return result.rows[0];
  }

  async findByAttemptId(attemptId: string): Promise<AdminAuditExportRecord | undefined> {
    const result = await this.transaction.query<AdminAuditExportRecord>(
      `SELECT ${exportColumns()} FROM "AdminAuditExport" WHERE "attemptId" = $1`,
      [attemptId],
    );
    return result.rows[0];
  }

  async findWatchdogCandidate(): Promise<AdminAuditExportWatchdogCandidate | undefined> {
    const result = await this.transaction.query<AdminAuditExportWatchdogCandidate>(
      `SELECT ${exportColumns()},
              ("attemptDeadline" <=
               (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3))
                AS "deadlineExpired"
         FROM "AdminAuditExport"
        WHERE "state" = 'PROCESSING'
          AND "attemptId" IS NOT NULL
          AND "claimOwnerHash" IS NOT NULL
          AND "leaseExpiresAt" IS NOT NULL
          AND (
            "attemptDeadline" <=
              (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
            OR "leaseExpiresAt" <=
              (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
          )
        ORDER BY (
                   "attemptDeadline" <=
                   (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
                 ) DESC,
                 LEAST("attemptDeadline", "leaseExpiresAt") ASC,
                 "id" ASC
        LIMIT 1`,
    );
    return result.rows[0];
  }

  async watchdogOne(
    candidate: AdminAuditExportWatchdogCandidate,
    requestId: string,
    systemExecutionRefHash: string,
  ): Promise<AdminAuditExportWatchdogResult> {
    const result = await this.transaction.query<AdminAuditExportWatchdogCandidate>(
      `SELECT ${exportColumns()},
              ("attemptDeadline" <=
               (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3))
                AS "deadlineExpired"
         FROM "AdminAuditExport"
        WHERE "id" = $1
          AND "state" = 'PROCESSING'
          AND "generation" = $2
          AND "attemptId" = $3
          AND "claimOwnerHash" = $4
          AND "leaseExpiresAt" IS NOT NULL
          AND (
            "attemptDeadline" <=
              (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
            OR "leaseExpiresAt" <=
              (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
          )
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
      [candidate.id, candidate.generation, candidate.attemptId, candidate.claimOwnerHash],
    );
    const claimed = result.rows[0];
    if (claimed === undefined) return 'STALE_FENCE';
    if (claimed.deadlineExpired || claimed.attemptNumber >= 3) {
      return (await this.finishFailed(
        claimed,
        'RETRY_BUDGET_EXHAUSTED',
        requestId,
        systemExecutionRefHash,
      ))
        ? 'FAILED'
        : 'STALE_FENCE';
    }
    const requeued = await this.transaction.query(
      `UPDATE "AdminAuditExport"
          SET "attemptId" = NULL, "claimOwnerHash" = NULL,
              "leaseExpiresAt" = NULL, "nextAttemptAt" = "leaseExpiresAt"
        WHERE "id" = $1 AND "state" = 'PROCESSING' AND "generation" = $2
          AND "attemptId" = $3 AND "claimOwnerHash" = $4
          AND "leaseExpiresAt" <=
              (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
          AND "attemptDeadline" >
              (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)`,
      [claimed.id, claimed.generation, claimed.attemptId, claimed.claimOwnerHash],
    );
    return requeued.rowCount === 1 ? 'REQUEUED' : 'STALE_FENCE';
  }

  async findExpiryCandidate(): Promise<AdminAuditExportRecord | undefined> {
    const result = await this.transaction.query<AdminAuditExportRecord>(
      `SELECT ${exportColumns()}
         FROM "AdminAuditExport"
        WHERE "state" = 'READY'
          AND "expiresAt" <=
              (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
          AND NOT EXISTS (
            SELECT 1
              FROM "AdminAuditExportReadLease" read_lease
             WHERE read_lease."exportId" = "AdminAuditExport"."id"
               AND read_lease."exportGeneration" = "AdminAuditExport"."generation"
               AND read_lease."releasedAt" IS NULL
               AND read_lease."expiresAt" >
                   (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
          )
        ORDER BY "expiresAt" ASC, "id" ASC
        LIMIT 1`,
    );
    return result.rows[0];
  }

  async expire(
    candidate: AdminAuditExportRecord,
    requestId: string,
    systemExecutionRefHash: string,
  ): Promise<boolean> {
    await this.transaction.query(`SELECT public.kora_lock_admin_c2b_export_lifecycle($1)`, [
      candidate.id,
    ]);
    const eligible = await this.transaction.query<QueryResultRow & { id: string }>(
      `SELECT export_entry."id"
         FROM "AdminAuditExport" export_entry
        WHERE export_entry."id" = $1
          AND export_entry."state" = 'READY'
          AND export_entry."generation" = $2
          AND export_entry."objectKey" = $3
          AND export_entry."contentSha256" IS NOT DISTINCT FROM $4
          AND export_entry."expiresAt" IS NOT DISTINCT FROM $5
          AND export_entry."expiresAt" <=
              (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
          AND NOT EXISTS (
            SELECT 1
              FROM "AdminAuditExportReadLease" read_lease
             WHERE read_lease."exportId" = export_entry."id"
               AND read_lease."exportGeneration" = export_entry."generation"
               AND read_lease."releasedAt" IS NULL
               AND read_lease."expiresAt" >
                   (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
          )
        FOR UPDATE`,
      [
        candidate.id,
        candidate.generation,
        candidate.objectKey,
        candidate.contentSha256,
        candidate.expiresAt,
      ],
    );
    if (eligible.rows[0] === undefined) return false;
    const result = await this.transaction.query(
      `UPDATE "AdminAuditExport"
          SET "state" = 'EXPIRED', "objectKey" = NULL
        WHERE "id" = $1 AND "state" = 'READY' AND "generation" = $2
          AND "objectKey" = $3
          AND "contentSha256" IS NOT DISTINCT FROM $4
          AND "expiresAt" IS NOT DISTINCT FROM $5`,
      [
        candidate.id,
        candidate.generation,
        candidate.objectKey,
        candidate.contentSha256,
        candidate.expiresAt,
      ],
    );
    if (result.rowCount !== 1) return false;
    await this.transaction.query(
      `INSERT INTO "AuditLog"
         ("id", "version", "systemExecutionRefHash", "eventClass", "context",
          "outcome", "action", "entityType", "entityId", "reason", "reasonCode",
          "requestId", "adminAuditExportId")
       VALUES ($1, 3, $2, 'EXPORT', 'SYSTEM', 'SUCCESS', 'expireAdminAuditLogExport',
               'ADMIN_AUDIT_EXPORT', $3, 'C2_RUNTIME', 'AUDIT_EXPORT', $4, $3)`,
      [randomUUID(), systemExecutionRefHash, candidate.id, requestId],
    );
    return true;
  }

  async findExpiredObjectCleanup(): Promise<AdminAuditExportRecord | undefined> {
    const result = await this.transaction.query<AdminAuditExportRecord>(
      `SELECT ${exportColumns()}
         FROM "AdminAuditExport"
        WHERE "state" = 'EXPIRED' AND "stagingObjectKey" IS NOT NULL
        ORDER BY "expiredAt" ASC, "id" ASC
        LIMIT 1`,
    );
    return result.rows[0];
  }

  async markExpiredObjectDeleted(id: string, objectKey: string): Promise<boolean> {
    const result = await this.transaction.query(
      `UPDATE "AdminAuditExport" SET "stagingObjectKey" = NULL
        WHERE "id" = $1 AND "state" = 'EXPIRED' AND "stagingObjectKey" = $2`,
      [id, objectKey],
    );
    return result.rowCount === 1;
  }

  async purgeExpiredReadLeases(): Promise<number> {
    const result = await this.transaction.query(
      `WITH candidates AS (
         SELECT "id"
           FROM "AdminAuditExportReadLease"
          WHERE "releasedAt" IS NOT NULL
             OR "expiresAt" <=
                (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
          ORDER BY "expiresAt" ASC, "id" ASC
          LIMIT 100
       )
       DELETE FROM "AdminAuditExportReadLease" read_lease
        USING candidates
        WHERE read_lease."id" = candidates."id"`,
    );
    return result.rowCount ?? 0;
  }

  async purgeOneSnapshot(): Promise<string | undefined> {
    const result = await this.transaction.query<QueryResultRow & { id: string }>(
      `WITH candidate AS (
         SELECT snapshot."id"
           FROM "AdminAuditPaginationSnapshot" snapshot
           LEFT JOIN "AdminAuditExport" export_entry
             ON export_entry."snapshotId" = snapshot."id"
          WHERE (
            snapshot."operation" = 'LIST_ADMIN_AUDIT_LOGS'
            AND snapshot."expiresAt" <=
                (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
          ) OR (
            snapshot."operation" = 'CREATE_ADMIN_AUDIT_LOG_EXPORT'
            AND export_entry."attemptId" IS NULL
            AND export_entry."claimOwnerHash" IS NULL
            AND export_entry."leaseExpiresAt" IS NULL
            AND (
              (export_entry."state" = 'FAILED'
               AND export_entry."failedAt" + INTERVAL '24 hours' <=
                   (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3))
              OR
              (export_entry."state" = 'EXPIRED'
               AND export_entry."expiredAt" + INTERVAL '24 hours' <=
                   (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3))
            )
            AND NOT EXISTS (
              SELECT 1 FROM "AdminAuditExportReadLease" read_lease
               WHERE read_lease."exportId" = export_entry."id"
                 AND read_lease."releasedAt" IS NULL
                 AND read_lease."expiresAt" >
                     (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
            )
          )
          ORDER BY snapshot."expiresAt" ASC, snapshot."id" ASC
          LIMIT 1
       )
       DELETE FROM "AdminAuditPaginationSnapshot" snapshot
        USING candidate
        WHERE snapshot."id" = candidate."id"
       RETURNING snapshot."id"`,
    );
    return result.rows[0]?.id;
  }

  async orphanStagingCutoff(): Promise<Date> {
    const result = await this.transaction.query<QueryResultRow & { cutoff: Date }>(
      `SELECT (
          (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
          - INTERVAL '24 hours'
        ) AS "cutoff"`,
    );
    const cutoff = result.rows[0]?.cutoff;
    if (!(cutoff instanceof Date)) throw new TypeError('PostgreSQL orphan cutoff is missing.');
    return cutoff;
  }

  async isOrphanStagingObject(input: {
    attemptId: string;
    exportId: string;
    generation: string;
    objectKey: string;
  }): Promise<boolean> {
    const result = await this.transaction.query<QueryResultRow & { eligible: boolean }>(
      `SELECT NOT EXISTS (
         SELECT 1
           FROM "AdminAuditExport" export_entry
          WHERE export_entry."stagingObjectKey" = $1
             OR export_entry."objectKey" = $1
             OR (
               export_entry."id" = $2
               AND export_entry."generation" = $3::bigint
               AND export_entry."attemptId" = $4
               AND export_entry."state" = 'PROCESSING'
             )
             OR (
               export_entry."id" = $2
               AND export_entry."generation" = $3::bigint
               AND EXISTS (
                 SELECT 1 FROM "AdminAuditExportReadLease" read_lease
                  WHERE read_lease."exportId" = export_entry."id"
                    AND read_lease."exportGeneration" = export_entry."generation"
                    AND read_lease."releasedAt" IS NULL
                    AND read_lease."expiresAt" >
                        (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
               )
             )
       ) AS "eligible"`,
      [input.objectKey, input.exportId, input.generation, input.attemptId],
    );
    return result.rows[0]?.eligible === true;
  }

  async snapshotEntries(snapshotId: string): Promise<readonly AdminAuditLogEntry[]> {
    const result = await this.transaction.query<AdminAuditSnapshotItem>(
      `SELECT "ordinal", "projectionJson", "resourceId", "sourceCreatedAt", "utf8Bytes"
         FROM "AdminAuditPaginationSnapshotItem"
        WHERE "snapshotId" = $1
        ORDER BY "ordinal" ASC`,
      [snapshotId],
    );
    return result.rows.map((row) => JSON.parse(row.projectionJson) as AdminAuditLogEntry);
  }

  async heartbeat(claimed: ClaimedAdminAuditExport): Promise<boolean> {
    const result = await this.transaction.query(
      `UPDATE "AdminAuditExport"
          SET "leaseExpiresAt" =
              (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
        WHERE "id" = $1 AND "state" = 'PROCESSING' AND "generation" = $2
          AND "attemptId" = $3 AND "claimOwnerHash" = $4`,
      [claimed.id, claimed.generation, claimed.attemptId, claimed.claimOwnerHash],
    );
    return result.rowCount === 1;
  }

  async failureDisposition(
    claimed: ClaimedAdminAuditExport,
  ): Promise<AdminAuditExportFailureDisposition> {
    const result = await this.transaction.query<QueryResultRow & { disposition: string }>(
      `SELECT CASE
          WHEN "state" <> 'PROCESSING'
            OR "generation" <> $2
            OR "attemptId" IS DISTINCT FROM $3
            OR "claimOwnerHash" IS DISTINCT FROM $4
            THEN 'STALE_FENCE'
          WHEN "attemptDeadline" <=
               (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
            THEN 'DEADLINE_EXPIRED'
          WHEN "attemptNumber" >= 3 THEN 'BUDGET_EXHAUSTED'
          ELSE 'RETRYABLE'
        END AS "disposition"
        FROM "AdminAuditExport"
       WHERE "id" = $1`,
      [claimed.id, claimed.generation, claimed.attemptId, claimed.claimOwnerHash],
    );
    const disposition = result.rows[0]?.disposition;
    return disposition === 'RETRYABLE' ||
      disposition === 'DEADLINE_EXPIRED' ||
      disposition === 'BUDGET_EXHAUSTED'
      ? disposition
      : 'STALE_FENCE';
  }

  async remainingAttemptMilliseconds(
    claimed: ClaimedAdminAuditExport,
  ): Promise<number | undefined> {
    const result = await this.transaction.query<QueryResultRow & { remainingMs: number }>(
      `SELECT GREATEST(
          0,
          floor(EXTRACT(EPOCH FROM (
            "attemptDeadline"
            - (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
          )) * 1000)
        )::integer AS "remainingMs"
        FROM "AdminAuditExport"
       WHERE "id" = $1 AND "state" = 'PROCESSING' AND "generation" = $2
         AND "attemptId" = $3 AND "claimOwnerHash" = $4`,
      [claimed.id, claimed.generation, claimed.attemptId, claimed.claimOwnerHash],
    );
    return result.rows[0]?.remainingMs;
  }

  async scheduleRetry(claimed: ClaimedAdminAuditExport): Promise<boolean> {
    const result = await this.transaction.query(
      `UPDATE "AdminAuditExport"
          SET "attemptId" = NULL, "claimOwnerHash" = NULL, "leaseExpiresAt" = NULL
        WHERE "id" = $1 AND "state" = 'PROCESSING' AND "generation" = $2
          AND "attemptId" = $3 AND "claimOwnerHash" = $4
          AND "attemptDeadline" >
              (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
          AND "attemptNumber" < 3`,
      [claimed.id, claimed.generation, claimed.attemptId, claimed.claimOwnerHash],
    );
    return result.rowCount === 1;
  }

  async finishReady(
    claimed: ClaimedAdminAuditExport,
    artifact: Readonly<{
      contentSha256: string;
      encryptedBytes: number;
      objectKey: string;
      plaintextBytes: number;
      signatureKeyId: string;
      stagingObjectKey: string;
      storageKeyId: string;
    }>,
    requestId: string,
    systemExecutionRefHash: string,
  ): Promise<boolean> {
    const updated = await this.transaction.query<QueryResultRow & { id: string }>(
      `UPDATE "AdminAuditExport"
          SET "state" = 'READY', "stagingObjectKey" = $5, "objectKey" = $6,
              "contentSha256" = $7, "signatureKeyId" = $8, "storageKeyId" = $9,
              "plaintextBytes" = $10, "encryptedBytes" = $11
        WHERE "id" = $1 AND "state" = 'PROCESSING' AND "generation" = $2
          AND "attemptId" = $3 AND "claimOwnerHash" = $4
       RETURNING "id"`,
      [
        claimed.id,
        claimed.generation,
        claimed.attemptId,
        claimed.claimOwnerHash,
        artifact.stagingObjectKey,
        artifact.objectKey,
        artifact.contentSha256,
        artifact.signatureKeyId,
        artifact.storageKeyId,
        artifact.plaintextBytes,
        artifact.encryptedBytes,
      ],
    );
    if (updated.rowCount !== 1) return false;
    await this.insertSystemAudit(claimed, 'SUCCESS', null, requestId, systemExecutionRefHash);
    return true;
  }

  async finishFailed(
    claimed: ClaimedAdminAuditExport,
    failureCode:
      | 'RETRY_BUDGET_EXHAUSTED'
      | 'PROJECTION_BUDGET_EXCEEDED'
      | 'INTEGRITY_FAILED'
      | 'DEPENDENCY_UNAVAILABLE',
    requestId: string,
    systemExecutionRefHash: string,
  ): Promise<boolean> {
    const auditFailure =
      failureCode === 'PROJECTION_BUDGET_EXCEEDED'
        ? 'PROJECTION_BUDGET_EXCEEDED'
        : failureCode === 'INTEGRITY_FAILED'
          ? 'INTEGRITY_REJECTED'
          : 'DEPENDENCY_UNAVAILABLE';
    const updated = await this.transaction.query(
      `UPDATE "AdminAuditExport"
          SET "state" = 'FAILED', "failureCode" = $5, "stagingObjectKey" = NULL
        WHERE "id" = $1 AND "state" = 'PROCESSING' AND "generation" = $2
          AND "attemptId" = $3 AND "claimOwnerHash" = $4`,
      [claimed.id, claimed.generation, claimed.attemptId, claimed.claimOwnerHash, failureCode],
    );
    if (updated.rowCount !== 1) return false;
    await this.insertSystemAudit(
      claimed,
      'REJECTED',
      auditFailure,
      requestId,
      systemExecutionRefHash,
    );
    return true;
  }

  private async insertSystemAudit(
    claimed: ClaimedAdminAuditExport,
    outcome: 'SUCCESS' | 'REJECTED',
    failureCode: string | null,
    requestId: string,
    systemExecutionRefHash: string,
  ): Promise<void> {
    await this.transaction.query(
      `INSERT INTO "AuditLog"
         ("id", "version", "delegatedByAdminUserId", "systemExecutionRefHash",
          "eventClass", "context", "outcome", "failureCode", "action", "entityType",
          "entityId", "reason", "reasonCode", "requestId", "causationEventId",
          "adminAuditExportId")
       VALUES ($1, 3, $2, $3, 'EXPORT', 'SYSTEM', $4, $5, 'buildAdminAuditLogExport',
               'ADMIN_AUDIT_EXPORT', $6, 'C2_RUNTIME', 'AUDIT_EXPORT', $7, $8, $6)`,
      [
        randomUUID(),
        claimed.creatorAdminUserId,
        systemExecutionRefHash,
        outcome,
        failureCode,
        claimed.id,
        requestId,
        claimed.sourceAuditLogId,
      ],
    );
  }
}

@Injectable()
export class AdminAuditExportRepository {
  constructor(
    @Inject(AdminC2bBoundariesService) private readonly boundaries: AdminC2bBoundariesService,
  ) {}

  transaction<T>(
    callback: (repository: AdminAuditExportTransactionRepository) => Promise<T>,
  ): Promise<T> {
    return this.boundaries.transaction((transaction) =>
      callback(new AdminAuditExportTransactionRepository(transaction)),
    );
  }
}
