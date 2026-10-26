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
  | 'RETRYABLE'
  | 'DEADLINE_EXPIRED'
  | 'LEASE_EXPIRED'
  | 'BUDGET_EXHAUSTED'
  | 'RETRY_SCHEDULED'
  | 'STALE_FENCE';

export type AdminAuditExportCommitReconciliation =
  'APPLIED' | 'ACTIVE' | 'WATCHDOG_REQUIRED' | 'RETRY_SCHEDULED' | 'STALE_FENCE';

export interface AdminAuditExportReadyArtifact {
  readonly contentSha256: string;
  readonly encryptedBytes: number;
  readonly objectKey: string;
  readonly plaintextBytes: number;
  readonly signatureKeyId: string;
  readonly stagingObjectKey: string;
  readonly storageKeyId: string;
}

interface AdminAuditExportInternalRecord extends AdminAuditExportRecord {
  readonly lastTransitionRefHash: string | null;
}

export interface AdminAuditExportWatchdogCandidate extends ClaimedAdminAuditExport {
  readonly deadlineExpired: boolean;
}

function exportColumns(qualifier?: string): string {
  const prefix = qualifier === undefined ? '' : `${qualifier}.`;
  return `${prefix}"id", ${prefix}"creatorAdminUserId", ${prefix}"snapshotId", ${prefix}"sourceAuditLogId", ${prefix}"state",
    ${prefix}"generation", ${prefix}"attemptNumber", ${prefix}"attemptId", ${prefix}"claimOwnerHash", ${prefix}"attemptStartedAt",
    ${prefix}"attemptDeadline", ${prefix}"leaseExpiresAt", ${prefix}"nextAttemptAt", ${prefix}"stagingObjectKey", ${prefix}"objectKey",
    ${prefix}"contentSha256", ${prefix}"signatureKeyId", ${prefix}"storageKeyId", ${prefix}"plaintextBytes", ${prefix}"encryptedBytes",
    ${prefix}"failureCode", ${prefix}"lastTransitionRefHash", ${prefix}"createdAt", ${prefix}"readyAt", ${prefix}"failedAt", ${prefix}"expiresAt", ${prefix}"expiredAt"`;
}

export class AdminAuditExportTransactionRepository {
  constructor(private readonly transaction: AdminC2Transaction) {}

  private async lockById(id: string): Promise<AdminAuditExportInternalRecord | undefined> {
    const result = await this.transaction.query<AdminAuditExportInternalRecord>(
      `SELECT ${exportColumns()}
         FROM "AdminAuditExport"
        WHERE "id" = $1
        FOR UPDATE`,
      [id],
    );
    return result.rows[0];
  }

  private async databaseNow(): Promise<Date> {
    const result = await this.transaction.query<QueryResultRow & { databaseNow: Date }>(
      `SELECT (pg_catalog.clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
                AS "databaseNow"`,
    );
    const databaseNow = result.rows[0]?.databaseNow;
    if (!(databaseNow instanceof Date)) throw new TypeError('PostgreSQL time is missing.');
    return databaseNow;
  }

  private sameGeneration(
    left: AdminAuditExportRecord['generation'],
    right: AdminAuditExportRecord['generation'],
  ): boolean {
    return String(left) === String(right);
  }

  private isSameScheduledAttempt(
    claimed: ClaimedAdminAuditExport,
    record: AdminAuditExportInternalRecord,
  ): boolean {
    return (
      record.state === 'PROCESSING' &&
      this.sameGeneration(record.generation, claimed.generation) &&
      record.attemptNumber === claimed.attemptNumber &&
      record.attemptId === null &&
      record.claimOwnerHash === null &&
      record.attemptStartedAt?.getTime() === claimed.attemptStartedAt.getTime() &&
      record.attemptDeadline?.getTime() === claimed.attemptDeadline.getTime() &&
      record.leaseExpiresAt === null &&
      record.nextAttemptAt !== null &&
      record.stagingObjectKey === null &&
      record.failureCode === null
    );
  }

  private async classifyLockedAttempt(
    claimed: ClaimedAdminAuditExport,
    record: AdminAuditExportRecord,
  ): Promise<AdminAuditExportFailureDisposition> {
    if (
      record.state !== 'PROCESSING' ||
      !this.sameGeneration(record.generation, claimed.generation)
    ) {
      return 'STALE_FENCE';
    }
    if (
      record.attemptId === null &&
      record.claimOwnerHash === null &&
      record.nextAttemptAt !== null
    ) {
      return 'RETRY_SCHEDULED';
    }
    if (
      record.attemptId !== claimed.attemptId ||
      record.claimOwnerHash !== claimed.claimOwnerHash ||
      record.nextAttemptAt !== null ||
      record.attemptDeadline === null ||
      record.leaseExpiresAt === null
    ) {
      return 'STALE_FENCE';
    }
    const databaseNow = await this.databaseNow();
    if (record.attemptDeadline.getTime() <= databaseNow.getTime()) return 'DEADLINE_EXPIRED';
    if (record.leaseExpiresAt.getTime() <= databaseNow.getTime()) return 'LEASE_EXPIRED';
    return record.attemptNumber >= 3 ? 'BUDGET_EXHAUSTED' : 'RETRYABLE';
  }

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
      `SELECT ${exportColumns()}, false AS "deadlineExpired"
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
    if (candidate.attemptNumber >= 3) {
      const terminal = await this.transaction.query<QueryResultRow & { id: string }>(
        `UPDATE "AdminAuditExport"
            SET "state" = 'FAILED', "failureCode" = 'RETRY_BUDGET_EXHAUSTED',
                "stagingObjectKey" = NULL, "lastTransitionRefHash" = $5
          WHERE "id" = $1 AND "state" = 'PROCESSING' AND "generation" = $2
            AND "attemptId" = $3 AND "claimOwnerHash" = $4
            AND "nextAttemptAt" IS NULL
            AND "attemptNumber" >= 3
         RETURNING "id"`,
        [
          candidate.id,
          candidate.generation,
          candidate.attemptId,
          candidate.claimOwnerHash,
          systemExecutionRefHash,
        ],
      );
      if (terminal.rowCount !== 1) return 'STALE_FENCE';
      await this.insertSystemAudit(
        candidate,
        'REJECTED',
        'DEPENDENCY_UNAVAILABLE',
        requestId,
        systemExecutionRefHash,
      );
      return 'FAILED';
    }
    const requeued = await this.transaction.query(
      `UPDATE "AdminAuditExport"
          SET "attemptId" = NULL, "claimOwnerHash" = NULL,
              "leaseExpiresAt" = NULL, "nextAttemptAt" = NULL,
              "failureCode" = NULL, "stagingObjectKey" = NULL,
              "lastTransitionRefHash" = $5
        WHERE "id" = $1 AND "state" = 'PROCESSING' AND "generation" = $2
          AND "attemptId" = $3 AND "claimOwnerHash" = $4
          AND "nextAttemptAt" IS NULL
          AND "attemptNumber" < 3`,
      [
        candidate.id,
        candidate.generation,
        candidate.attemptId,
        candidate.claimOwnerHash,
        systemExecutionRefHash,
      ],
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
          SET "leaseExpiresAt" = "leaseExpiresAt"
        WHERE "id" = $1 AND "state" = 'PROCESSING' AND "generation" = $2
          AND "attemptId" = $3 AND "claimOwnerHash" = $4
          AND "nextAttemptAt" IS NULL`,
      [claimed.id, claimed.generation, claimed.attemptId, claimed.claimOwnerHash],
    );
    return result.rowCount === 1;
  }

  async failureDisposition(
    claimed: ClaimedAdminAuditExport,
  ): Promise<AdminAuditExportFailureDisposition> {
    const record = await this.lockById(claimed.id);
    return record === undefined ? 'STALE_FENCE' : await this.classifyLockedAttempt(claimed, record);
  }

  async remainingAttemptMilliseconds(
    claimed: ClaimedAdminAuditExport,
  ): Promise<number | undefined> {
    const record = await this.lockById(claimed.id);
    if (
      record === undefined ||
      record.state !== 'PROCESSING' ||
      !this.sameGeneration(record.generation, claimed.generation) ||
      record.attemptId !== claimed.attemptId ||
      record.claimOwnerHash !== claimed.claimOwnerHash ||
      record.nextAttemptAt !== null ||
      record.attemptDeadline === null ||
      record.leaseExpiresAt === null
    ) {
      return undefined;
    }
    const databaseNow = await this.databaseNow();
    if (record.leaseExpiresAt.getTime() <= databaseNow.getTime()) return undefined;
    return Math.max(0, record.attemptDeadline.getTime() - databaseNow.getTime());
  }

  async scheduleRetry(
    claimed: ClaimedAdminAuditExport,
    transitionRefHash: string,
  ): Promise<boolean> {
    const result = await this.transaction.query(
      `UPDATE "AdminAuditExport"
          SET "attemptId" = NULL, "claimOwnerHash" = NULL, "leaseExpiresAt" = NULL,
              "nextAttemptAt" = NULL,
              "failureCode" = 'DEPENDENCY_UNAVAILABLE', "stagingObjectKey" = NULL,
              "lastTransitionRefHash" = $5
        WHERE "id" = $1 AND "state" = 'PROCESSING' AND "generation" = $2
          AND "attemptId" = $3 AND "claimOwnerHash" = $4
          AND "nextAttemptAt" IS NULL
          AND "attemptNumber" < 3`,
      [
        claimed.id,
        claimed.generation,
        claimed.attemptId,
        claimed.claimOwnerHash,
        transitionRefHash,
      ],
    );
    return result.rowCount === 1;
  }

  async finishReady(
    claimed: ClaimedAdminAuditExport,
    artifact: AdminAuditExportReadyArtifact,
    requestId: string,
    systemExecutionRefHash: string,
  ): Promise<boolean> {
    const updated = await this.transaction.query<QueryResultRow & { id: string }>(
      `UPDATE "AdminAuditExport"
          SET "state" = 'READY', "stagingObjectKey" = $5, "objectKey" = $6,
              "contentSha256" = $7, "signatureKeyId" = $8, "storageKeyId" = $9,
              "plaintextBytes" = $10, "encryptedBytes" = $11,
              "lastTransitionRefHash" = $12
        WHERE "id" = $1 AND "state" = 'PROCESSING' AND "generation" = $2
          AND "attemptId" = $3 AND "claimOwnerHash" = $4
          AND "nextAttemptAt" IS NULL
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
        systemExecutionRefHash,
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
    if (failureCode === 'RETRY_BUDGET_EXHAUSTED' && claimed.attemptNumber < 3) return false;
    const auditFailure =
      failureCode === 'PROJECTION_BUDGET_EXCEEDED'
        ? 'PROJECTION_BUDGET_EXCEEDED'
        : failureCode === 'INTEGRITY_FAILED'
          ? 'INTEGRITY_REJECTED'
          : 'DEPENDENCY_UNAVAILABLE';
    const updated = await this.transaction.query(
      `UPDATE "AdminAuditExport"
          SET "state" = 'FAILED', "failureCode" = $5, "stagingObjectKey" = NULL,
              "lastTransitionRefHash" = $6
        WHERE "id" = $1 AND "state" = 'PROCESSING' AND "generation" = $2
          AND "attemptId" = $3 AND "claimOwnerHash" = $4
          AND "nextAttemptAt" IS NULL`,
      [
        claimed.id,
        claimed.generation,
        claimed.attemptId,
        claimed.claimOwnerHash,
        failureCode,
        systemExecutionRefHash,
      ],
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

  async reconcileReady(
    claimed: ClaimedAdminAuditExport,
    artifact: AdminAuditExportReadyArtifact,
    _requestId: string,
    systemExecutionRefHash: string,
  ): Promise<AdminAuditExportCommitReconciliation> {
    const record = await this.lockById(claimed.id);
    if (record === undefined) return 'STALE_FENCE';
    const exactReady =
      record.state === 'READY' &&
      this.sameGeneration(record.generation, claimed.generation) &&
      record.attemptNumber === claimed.attemptNumber &&
      record.attemptId === null &&
      record.claimOwnerHash === null &&
      record.attemptStartedAt === null &&
      record.attemptDeadline === null &&
      record.leaseExpiresAt === null &&
      record.nextAttemptAt === null &&
      record.stagingObjectKey === artifact.stagingObjectKey &&
      record.objectKey === artifact.objectKey &&
      record.contentSha256 === artifact.contentSha256 &&
      record.signatureKeyId === artifact.signatureKeyId &&
      record.storageKeyId === artifact.storageKeyId &&
      String(record.plaintextBytes) === String(artifact.plaintextBytes) &&
      String(record.encryptedBytes) === String(artifact.encryptedBytes) &&
      record.failureCode === null &&
      record.lastTransitionRefHash === systemExecutionRefHash;
    if (exactReady) return 'APPLIED';
    return this.reconciliationFromDisposition(await this.classifyLockedAttempt(claimed, record));
  }

  async reconcileFailedOrRetry(
    claimed: ClaimedAdminAuditExport,
    failureCode:
      | 'RETRY_BUDGET_EXHAUSTED'
      | 'PROJECTION_BUDGET_EXCEEDED'
      | 'INTEGRITY_FAILED'
      | 'DEPENDENCY_UNAVAILABLE',
    retry: boolean,
    _requestId: string,
    systemExecutionRefHash: string,
  ): Promise<AdminAuditExportCommitReconciliation> {
    const record = await this.lockById(claimed.id);
    if (record === undefined) return 'STALE_FENCE';
    if (
      retry &&
      this.isSameScheduledAttempt(claimed, record) &&
      record.lastTransitionRefHash === systemExecutionRefHash
    ) {
      return 'APPLIED';
    }
    if (retry && this.isSameScheduledAttempt(claimed, record)) return 'STALE_FENCE';
    if (
      !retry &&
      record.state === 'FAILED' &&
      this.sameGeneration(record.generation, claimed.generation) &&
      record.attemptNumber === claimed.attemptNumber &&
      record.attemptId === null &&
      record.claimOwnerHash === null &&
      record.attemptStartedAt === null &&
      record.attemptDeadline === null &&
      record.leaseExpiresAt === null &&
      record.nextAttemptAt === null &&
      record.stagingObjectKey === null &&
      record.failureCode === failureCode &&
      record.lastTransitionRefHash === systemExecutionRefHash
    ) {
      return 'APPLIED';
    }
    return this.reconciliationFromDisposition(await this.classifyLockedAttempt(claimed, record));
  }

  async reconcileWatchdog(
    candidate: AdminAuditExportWatchdogCandidate,
    _requestId: string,
    systemExecutionRefHash: string,
  ): Promise<AdminAuditExportCommitReconciliation> {
    const record = await this.lockById(candidate.id);
    if (record === undefined) return 'STALE_FENCE';
    if (
      candidate.attemptNumber < 3 &&
      this.isSameScheduledAttempt(candidate, record) &&
      record.lastTransitionRefHash === systemExecutionRefHash
    ) {
      return 'APPLIED';
    }
    if (candidate.attemptNumber < 3 && this.isSameScheduledAttempt(candidate, record)) {
      return 'STALE_FENCE';
    }
    if (
      candidate.attemptNumber >= 3 &&
      record.state === 'FAILED' &&
      this.sameGeneration(record.generation, candidate.generation) &&
      record.attemptNumber === candidate.attemptNumber &&
      record.attemptId === null &&
      record.claimOwnerHash === null &&
      record.attemptStartedAt === null &&
      record.attemptDeadline === null &&
      record.leaseExpiresAt === null &&
      record.nextAttemptAt === null &&
      record.stagingObjectKey === null &&
      record.failureCode === 'RETRY_BUDGET_EXHAUSTED' &&
      record.lastTransitionRefHash === systemExecutionRefHash
    ) {
      return 'APPLIED';
    }
    return this.reconciliationFromDisposition(await this.classifyLockedAttempt(candidate, record));
  }

  private reconciliationFromDisposition(
    disposition: AdminAuditExportFailureDisposition,
  ): AdminAuditExportCommitReconciliation {
    if (disposition === 'RETRYABLE' || disposition === 'BUDGET_EXHAUSTED') return 'ACTIVE';
    if (disposition === 'DEADLINE_EXPIRED' || disposition === 'LEASE_EXPIRED') {
      return 'WATCHDOG_REQUIRED';
    }
    return disposition;
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
