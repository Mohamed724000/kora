import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import type {
  AdminRole,
  AdminStatus,
  AdminStepUpPurpose,
} from '../admin-auth/admin-auth.repository';
import { AdminC2aBoundariesService } from '../database/admin-c2a-boundaries.service';
import type { AdminC2Transaction } from '../database/admin-c2-transaction.service';
import type { AdminSnapshotOperation } from './admin-security.pagination';
import type { AdminRecoveryCaseProjection, AdminUserProjection } from './admin-security.types';
import type { AdminEncryptedOutboxPayload } from './admin-security.crypto';
import type { AdminC2OperationId } from './admin-security.errors';

export interface AdminC2LockedPrincipal {
  readonly absoluteExpiresAt: Date | null;
  readonly accessTokenJti: string;
  readonly adminUserId: string;
  readonly authorizationVersion: number | null;
  readonly expiresAt: Date;
  readonly role: AdminRole;
  readonly sessionAuthorizationVersion: number | null;
  readonly sessionId: string;
  readonly sessionRevokedAt: Date | null;
  readonly status: AdminStatus;
  readonly stepUpExpiresAt: Date | null;
  readonly stepUpPurpose: AdminStepUpPurpose | null;
}

interface LockedPrincipalRow extends QueryResultRow, AdminC2LockedPrincipal {}

interface RecoveryExpirationSingletonRow extends QueryResultRow {
  readonly acquired: boolean;
}

export interface RecoveryCaseRow extends QueryResultRow {
  approverAdminUserId: string | null;
  caseId: string;
  createdAt: Date;
  creatorAdminUserId: string;
  expiresAt: Date;
  state: AdminRecoveryCaseProjection['state'];
  subjectAdminUserId: string;
}

export interface AdminUserRow extends QueryResultRow {
  authorizationVersion: number;
  createdAt: Date;
  email: string;
  id: string;
  role: AdminRole;
  status: AdminStatus;
}

export interface AdminSnapshotRecord extends QueryResultRow {
  readonly createdAt: Date;
  readonly entryCount: number;
  readonly expiresAt: Date;
  readonly filtersDigest: string;
  readonly id: string;
  readonly operation: AdminSnapshotOperation;
  readonly principalAdminUserId: string;
  readonly projectionVersion: number;
  readonly utf8Bytes: string | number | bigint;
}

export interface AdminSnapshotItemRecord extends QueryResultRow {
  readonly ordinal: number;
  readonly projectionJson: string;
  readonly resourceId: string;
  readonly sourceCreatedAt: Date;
  readonly utf8Bytes: number;
}

export interface AdminSnapshotMaterial {
  readonly expiresAt: Date;
  readonly filtersDigest: string;
  readonly id: string;
  readonly items: readonly {
    readonly ordinal: number;
    readonly projectionJson: string;
    readonly resourceId: string;
    readonly sourceCreatedAt: Date;
    readonly utf8Bytes: number;
  }[];
  readonly operation: AdminSnapshotOperation;
  readonly principalAdminUserId: string;
  readonly projectionVersion: number;
  readonly utf8Bytes: number;
}

export interface AdminC2UserRecord extends QueryResultRow {
  readonly authorizationVersion: number;
  readonly createdAt: Date;
  readonly email: string;
  readonly id: string;
  readonly role: AdminRole;
  readonly status: AdminStatus;
  readonly totpEnabledAt: Date | null;
}

export interface AdminPasswordResetContextRecord extends QueryResultRow {
  readonly adminUserId: string;
  readonly authorizationVersion: number;
  readonly consumedAt: Date | null;
  readonly contextId: string;
  readonly expiresAt: Date;
  readonly passwordResetRequestId: string;
  readonly requestExpiresAt: Date;
  readonly requestRevokedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly tokenHash: string;
  readonly userAuthorizationVersion: number;
  readonly userStatus: AdminStatus;
}

export interface AdminInvitationRecord extends QueryResultRow {
  readonly acceptedAdminUserId: string | null;
  readonly codeHash: string;
  readonly createdAt: Date;
  readonly createdByAuditLogId: string;
  readonly creatorAdminUserId: string;
  readonly emailCanonical: string;
  readonly expiresAt: Date;
  readonly id: string;
  readonly proposedRole: AdminRole;
  readonly replacedInvitationId: string | null;
  readonly revokedAt: Date | null;
  readonly state: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';
  readonly stateGeneration: number;
}

export interface AdminRecoveryCaseRecord extends QueryResultRow {
  readonly approverAdminUserId: string | null;
  readonly cancelledAt: Date | null;
  readonly createdAt: Date;
  readonly creatorAdminUserId: string;
  readonly expiresAt: Date;
  readonly id: string;
  readonly state: 'PENDING' | 'APPROVED' | 'CANCELLED' | 'EXPIRED';
  readonly stateGeneration: number;
  readonly subjectAdminUserId: string;
}

export interface AdminC2IdempotencyRecord extends QueryResultRow {
  readonly adminUserId: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly idempotencyKey: string;
  readonly operation:
    | 'CREATE_ADMIN_RECOVERY_CASE'
    | 'APPROVE_ADMIN_RECOVERY_CASE'
    | 'CREATE_ADMIN_INVITATION'
    | 'CHANGE_ADMIN_USER_ROLE'
    | 'CHANGE_ADMIN_USER_STATUS';
  readonly requestDigest: string;
  readonly resourceId: string;
  readonly resourceType: string;
  readonly responseCode: number;
}

export interface AdminNotificationOutboxRecord extends QueryResultRow {
  readonly aadHash: string;
  readonly adminInvitationId: string | null;
  readonly attemptCount: number;
  readonly claimOwnerHash: string | null;
  readonly delegatedByAdminUserId: string | null;
  readonly encryptedPayload: string;
  readonly encryptionKeyId: string;
  readonly encryptionNonce: string;
  readonly encryptionTag: string;
  readonly generation: number;
  readonly id: string;
  readonly leaseExpiresAt: Date | null;
  readonly nextAttemptAt: Date | null;
  readonly passwordResetRequestId: string | null;
  readonly purpose: 'PASSWORD_RESET' | 'INVITATION';
  readonly sourceAuditLogId: string | null;
  readonly sourceSecurityEventId: string | null;
  readonly sourceValid: boolean;
  readonly state:
    'PENDING' | 'CLAIMED' | 'DELIVERED' | 'FAILED' | 'DELIVERY_UNCERTAIN' | 'CANCELLED';
}

export interface AdminSecurityEventInsert {
  readonly action: AdminC2OperationId;
  readonly adminInvitationId?: string;
  readonly adminUserId?: string;
  readonly entityId?: string;
  readonly entityType?: string;
  readonly eventClass: 'LOGIN' | 'BUSINESS';
  readonly failureCode?: string;
  readonly id: string;
  readonly outcome: 'SUCCEEDED' | 'FAILED';
  readonly requestId: string;
  readonly subjectRefHash?: string;
}

export interface AdminC2AuditInsert {
  readonly action:
    | AdminC2OperationId
    | 'cancelAdminRecoveryCase'
    | 'expireAdminRecoveryCase'
    | 'deliverAdminPasswordResetNotification'
    | 'deliverAdminInvitationNotification'
    | 'bootstrapAdminUser';
  readonly actorAdminUserId?: string;
  readonly adminInvitationId?: string;
  readonly adminPasswordResetContextId?: string;
  readonly adminRecoveryCaseId?: string;
  readonly adminSessionId?: string;
  readonly bootstrapGuardId?: string;
  readonly causationEventId?: string;
  readonly causationSecurityEventId?: string;
  readonly context: 'ADMIN_SESSION' | 'ADMIN_RECOVERY' | 'SYSTEM';
  readonly delegatedByAdminUserId?: string;
  readonly entityId: string;
  readonly entityType: string;
  readonly eventClass: 'LOGIN' | 'BUSINESS';
  readonly failureCode?:
    | 'FORBIDDEN'
    | 'STEP_UP_REQUIRED'
    | 'STEP_UP_EXPIRED'
    | 'STEP_UP_INVALID'
    | 'INTEGRITY_REJECTED'
    | 'DEPENDENCY_UNAVAILABLE'
    | 'VALIDATION_ERROR'
    | 'IDEMPOTENCY_CONFLICT'
    | 'RESOURCE_NOT_FOUND'
    | 'RESOURCE_CONFLICT'
    | 'RESOURCE_EXPIRED'
    | 'PROJECTION_BUDGET_EXCEEDED';
  readonly id: string;
  readonly maskedAfter?: Readonly<Record<string, unknown>>;
  readonly maskedBefore?: Readonly<Record<string, unknown>>;
  readonly operatorReason?: string;
  readonly outcome: 'SUCCESS' | 'REJECTED';
  readonly reasonCode:
    | 'SECURITY_RESPONSE'
    | 'ACCOUNT_RECOVERY'
    | 'ROLE_ADMINISTRATION'
    | 'STATUS_ADMINISTRATION'
    | 'AUDIT_EXPORT'
    | 'INVITATION_ADMINISTRATION';
  readonly requestId: string;
  readonly subjectAdminUserId?: string;
  readonly systemExecutionRefHash?: string;
}

function one<Row extends QueryResultRow>(rows: readonly Row[]): Row | undefined {
  return rows.length === 1 ? rows[0] : undefined;
}

function createDeliveryExecutionHash(outboxId: string, generation: number): string {
  return createHash('sha256')
    .update(`KORA_ADMIN_NOTIFICATION_DELIVERY_V1\0${outboxId}\0${generation}`, 'utf8')
    .digest('hex');
}

function createRecoveryCancellationExecutionHash(
  recoveryCaseId: string,
  generation: number,
  causalAuditId: string,
): string {
  return createHash('sha256')
    .update(
      `KORA_ADMIN_RECOVERY_CANCELLATION_V1\0${recoveryCaseId}\0${generation}\0${causalAuditId}`,
      'utf8',
    )
    .digest('hex');
}

export class AdminSecurityTransactionRepository {
  constructor(private readonly transaction: AdminC2Transaction) {}

  async lockPrincipal(
    adminUserId: string,
    sessionId: string,
  ): Promise<AdminC2LockedPrincipal | undefined> {
    const result = await this.transaction.query<LockedPrincipalRow>(
      `SELECT u."id" AS "adminUserId", u."role", u."status",
              u."authorizationVersion",
              s."id" AS "sessionId", s."accessTokenJti",
              s."authorizationVersion" AS "sessionAuthorizationVersion",
              s."expiresAt", s."absoluteExpiresAt",
              s."stepUpPurpose", s."stepUpExpiresAt",
              s."revokedAt" AS "sessionRevokedAt"
         FROM "AdminUser" AS u
         JOIN "AdminSession" AS s ON s."adminUserId" = u."id"
        WHERE u."id" = $1 AND s."id" = $2
        FOR UPDATE OF u, s`,
      [adminUserId, sessionId],
    );
    return one(result.rows);
  }

  async listRecoveryCaseProjections(maximum: number): Promise<readonly RecoveryCaseRow[]> {
    const result = await this.transaction.query<RecoveryCaseRow>(
      `SELECT "id" AS "caseId", "creatorAdminUserId", "subjectAdminUserId",
              "approverAdminUserId", "state", "createdAt", "expiresAt"
         FROM "AdminRecoveryCase"
        ORDER BY "createdAt" DESC, "id" DESC
        LIMIT $1`,
      [maximum],
    );
    return result.rows;
  }

  async getRecoveryCaseProjection(caseId: string): Promise<RecoveryCaseRow | undefined> {
    const result = await this.transaction.query<RecoveryCaseRow>(
      `SELECT "id" AS "caseId", "creatorAdminUserId", "subjectAdminUserId",
              "approverAdminUserId", "state", "createdAt", "expiresAt"
         FROM "AdminRecoveryCase"
        WHERE "id" = $1`,
      [caseId],
    );
    return one(result.rows);
  }

  async listAdminUserProjections(maximum: number): Promise<readonly AdminUserRow[]> {
    const result = await this.transaction.query<AdminUserRow>(
      `SELECT "id", "email", "role", "status", "authorizationVersion", "createdAt"
         FROM "AdminUser"
        ORDER BY "createdAt" DESC, "id" DESC
        LIMIT $1`,
      [maximum],
    );
    return result.rows;
  }

  async insertSnapshot(material: AdminSnapshotMaterial): Promise<void> {
    await this.transaction.query(
      `INSERT INTO "AdminPaginationSnapshot"
         ("id", "principalAdminUserId", "operation", "filtersDigest",
          "projectionVersion", "entryCount", "utf8Bytes", "expiresAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        material.id,
        material.principalAdminUserId,
        material.operation,
        material.filtersDigest,
        material.projectionVersion,
        material.items.length,
        material.utf8Bytes,
        material.expiresAt,
      ],
    );
    if (material.items.length === 0) return;
    await this.transaction.query(
      `INSERT INTO "AdminPaginationSnapshotItem"
         ("snapshotId", "ordinal", "resourceId", "sourceCreatedAt",
          "projectionJson", "utf8Bytes")
       SELECT $1, input."ordinal", input."resourceId", input."sourceCreatedAt",
              input."projectionJson", input."utf8Bytes"
         FROM unnest(
           $2::integer[], $3::text[], $4::timestamp(3)[], $5::text[], $6::integer[]
         ) AS input("ordinal", "resourceId", "sourceCreatedAt", "projectionJson", "utf8Bytes")`,
      [
        material.id,
        material.items.map((item) => item.ordinal),
        material.items.map((item) => item.resourceId),
        material.items.map((item) => item.sourceCreatedAt),
        material.items.map((item) => item.projectionJson),
        material.items.map((item) => item.utf8Bytes),
      ],
    );
  }

  async loadSnapshot(id: string): Promise<AdminSnapshotRecord | undefined> {
    const result = await this.transaction.query<AdminSnapshotRecord>(
      `SELECT "id", "principalAdminUserId", "operation", "filtersDigest",
              "projectionVersion", "entryCount", "utf8Bytes", "createdAt", "expiresAt"
         FROM "AdminPaginationSnapshot"
        WHERE "id" = $1`,
      [id],
    );
    return one(result.rows);
  }

  async loadSnapshotPage(
    snapshotId: string,
    offset: number,
    limit: number,
  ): Promise<readonly AdminSnapshotItemRecord[]> {
    const result = await this.transaction.query<AdminSnapshotItemRecord>(
      `SELECT "ordinal", "resourceId", "sourceCreatedAt", "projectionJson", "utf8Bytes"
         FROM "AdminPaginationSnapshotItem"
        WHERE "snapshotId" = $1 AND "ordinal" >= $2
        ORDER BY "ordinal" ASC
        LIMIT $3`,
      [snapshotId, offset, limit],
    );
    return result.rows;
  }

  async lockAdminUserByEmail(emailCanonical: string): Promise<AdminC2UserRecord | undefined> {
    const result = await this.transaction.query<AdminC2UserRecord>(
      `SELECT "id", "email", "role", "status", "authorizationVersion",
              "totpEnabledAt", "createdAt"
         FROM "AdminUser"
        WHERE pg_catalog.translate(
                "email", 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'
              ) = $1
        FOR UPDATE`,
      [emailCanonical],
    );
    return one(result.rows);
  }

  async lockAdminUser(id: string): Promise<AdminC2UserRecord | undefined> {
    const result = await this.transaction.query<AdminC2UserRecord>(
      `SELECT "id", "email", "role", "status", "authorizationVersion",
              "totpEnabledAt", "createdAt"
         FROM "AdminUser"
        WHERE "id" = $1
        FOR UPDATE`,
      [id],
    );
    return one(result.rows);
  }

  async insertSecurityEvent(event: AdminSecurityEventInsert): Promise<void> {
    await this.transaction.query(
      `INSERT INTO "AdminSecurityEvent"
         ("id", "adminUserId", "eventClass", "action", "outcome", "failureCode",
          "requestId", "subjectRefHash", "entityType", "entityId", "adminInvitationId")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        event.id,
        event.adminUserId ?? null,
        event.eventClass,
        event.action,
        event.outcome,
        event.failureCode ?? null,
        event.requestId,
        event.subjectRefHash ?? null,
        event.entityType ?? null,
        event.entityId ?? null,
        event.adminInvitationId ?? null,
      ],
    );
  }

  async insertAudit(entry: AdminC2AuditInsert): Promise<void> {
    await this.transaction.query(
      `INSERT INTO "AuditLog"
         ("id", "version", "adminUserId", "subjectAdminUserId",
          "delegatedByAdminUserId", "adminSessionId", "adminRecoveryContextId",
          "adminPasswordResetContextId", "systemExecutionRefHash", "eventClass",
          "context", "outcome", "failureCode", "action", "entityType", "entityId",
          "maskedBefore", "maskedAfter", "reason", "reasonCode", "operatorReason",
          "requestId", "causationEventId", "causationSecurityEventId",
          "adminRecoveryCaseId", "adminInvitationId")
       VALUES ($1, 3, $2, $3, $4, $5, NULL, $6, $7, $8, $9, $10, $11, $12,
               $13, $14, $15, $16, 'C2_RUNTIME', $17, $18, $19, $20, $21, $22,
               $23)`,
      [
        entry.id,
        entry.actorAdminUserId ?? null,
        entry.subjectAdminUserId ?? null,
        entry.delegatedByAdminUserId ?? null,
        entry.adminSessionId ?? null,
        entry.adminPasswordResetContextId ?? null,
        entry.systemExecutionRefHash ?? null,
        entry.eventClass,
        entry.context,
        entry.outcome,
        entry.failureCode ?? null,
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.maskedBefore === undefined ? null : JSON.stringify(entry.maskedBefore),
        entry.maskedAfter === undefined ? null : JSON.stringify(entry.maskedAfter),
        entry.reasonCode,
        entry.operatorReason ?? null,
        entry.requestId,
        entry.causationEventId ?? null,
        entry.causationSecurityEventId ?? null,
        entry.adminRecoveryCaseId ?? null,
        entry.adminInvitationId ?? null,
      ],
    );
  }

  async lockCurrentPasswordReset(adminUserId: string): Promise<
    | {
        outboxId: string;
        requestId: string;
      }
    | undefined
  > {
    const result = await this.transaction.query<
      QueryResultRow & { outboxId: string; requestId: string }
    >(
      `SELECT request."id" AS "requestId", outbox."id" AS "outboxId"
         FROM "AdminPasswordResetRequest" AS request
         JOIN "AdminNotificationOutbox" AS outbox
           ON outbox."passwordResetRequestId" = request."id"
        WHERE request."adminUserId" = $1 AND request."revokedAt" IS NULL
        FOR UPDATE OF request, outbox`,
      [adminUserId],
    );
    return one(result.rows);
  }

  async replacePasswordReset(requestId: string, outboxId: string, now: Date): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminPasswordResetRequest" SET "revokedAt" = $2
        WHERE "id" = $1 AND "revokedAt" IS NULL`,
      [requestId, now],
    );
    await this.transaction.query(
      `UPDATE "AdminNotificationOutbox"
          SET "state" = CASE
                WHEN "state" = 'PENDING' THEN 'CANCELLED'::"AdminNotificationState"
                ELSE 'DELIVERY_UNCERTAIN'::"AdminNotificationState"
              END,
              "generation" = "generation" + 1,
              "claimOwnerHash" = NULL, "leaseExpiresAt" = NULL,
              "cancelledAt" = CASE WHEN "state" = 'PENDING' THEN $2 ELSE NULL END,
              "uncertainAt" = CASE WHEN "state" = 'CLAIMED' THEN $2 ELSE NULL END,
              "nextAttemptAt" = NULL
        WHERE "id" = $1 AND "state" IN ('PENDING', 'CLAIMED')`,
      [outboxId, now],
    );
  }

  async insertPasswordReset(input: {
    adminUserId: string;
    contextId: string;
    encrypted: AdminEncryptedOutboxPayload;
    expiresAt: Date;
    outboxId: string;
    replacedOutboxId?: string;
    replacedRequestId?: string;
    requestId: string;
    securityEventId: string;
    tokenHash: string;
  }): Promise<void> {
    await this.transaction.query(
      `INSERT INTO "AdminPasswordResetRequest"
         ("id", "adminUserId", "securityEventId", "replacedRequestId", "expiresAt")
       VALUES ($1, $2, $3, $4, $5)`,
      [
        input.requestId,
        input.adminUserId,
        input.securityEventId,
        input.replacedRequestId ?? null,
        input.expiresAt,
      ],
    );
    await this.transaction.query(
      `INSERT INTO "AdminPasswordResetContext"
         ("id", "passwordResetRequestId", "adminUserId", "tokenHash",
          "authorizationVersion", "expiresAt")
       SELECT $1, $2, $3, $4, "authorizationVersion", $5
         FROM "AdminUser" WHERE "id" = $3`,
      [input.contextId, input.requestId, input.adminUserId, input.tokenHash, input.expiresAt],
    );
    await this.transaction.query(
      `INSERT INTO "AdminNotificationOutbox"
         ("id", "purpose", "state", "generation", "encryptedPayload",
          "encryptionKeyId", "encryptionNonce", "encryptionTag", "aadHash",
          "sourceSecurityEventId", "passwordResetRequestId", "replacedOutboxId")
       VALUES ($1, 'PASSWORD_RESET', 'PENDING', 1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.outboxId,
        input.encrypted.encryptedPayload,
        input.encrypted.encryptionKeyId,
        input.encrypted.encryptionNonce,
        input.encrypted.encryptionTag,
        input.encrypted.aadHash,
        input.securityEventId,
        input.requestId,
        input.replacedOutboxId ?? null,
      ],
    );
  }

  async lockPasswordResetContext(
    tokenHash: string,
  ): Promise<AdminPasswordResetContextRecord | undefined> {
    const result = await this.transaction.query<AdminPasswordResetContextRecord>(
      `SELECT context."id" AS "contextId", context."passwordResetRequestId",
              context."adminUserId", context."tokenHash", context."authorizationVersion",
              context."expiresAt", context."consumedAt", context."revokedAt",
              request."expiresAt" AS "requestExpiresAt",
              request."revokedAt" AS "requestRevokedAt",
              u."status" AS "userStatus",
              u."authorizationVersion" AS "userAuthorizationVersion"
         FROM "AdminPasswordResetContext" AS context
         JOIN "AdminPasswordResetRequest" AS request
           ON request."id" = context."passwordResetRequestId"
          AND request."adminUserId" = context."adminUserId"
         JOIN "AdminUser" AS u ON u."id" = context."adminUserId"
        WHERE context."tokenHash" = $1
        FOR UPDATE OF context, request, u`,
      [tokenHash],
    );
    return one(result.rows);
  }

  async consumePasswordReset(
    context: AdminPasswordResetContextRecord,
    passwordHash: string,
    now: Date,
  ): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminPasswordResetContext"
          SET "consumedAt" = $2
        WHERE "id" = $1 AND "consumedAt" IS NULL AND "revokedAt" IS NULL`,
      [context.contextId, now],
    );
    await this.transaction.query(
      `UPDATE "AdminUser"
          SET "passwordHash" = $2,
              "authorizationVersion" = "authorizationVersion" + 1
        WHERE "id" = $1`,
      [context.adminUserId, passwordHash],
    );
    await this.transaction.query(
      `UPDATE "AdminSession" SET "revokedAt" = $2
        WHERE "adminUserId" = $1 AND "revokedAt" IS NULL`,
      [context.adminUserId, now],
    );
  }

  async lockPendingInvitationByEmail(
    emailCanonical: string,
  ): Promise<(AdminInvitationRecord & { outboxId: string }) | undefined> {
    const result = await this.transaction.query<AdminInvitationRecord & { outboxId: string }>(
      `SELECT invitation."id", invitation."emailCanonical", invitation."codeHash",
              invitation."proposedRole", invitation."creatorAdminUserId",
              invitation."createdByAuditLogId", invitation."acceptedAdminUserId",
              invitation."replacedInvitationId", invitation."state",
              invitation."stateGeneration", invitation."expiresAt",
              invitation."acceptedAt", invitation."revokedAt", invitation."createdAt",
              outbox."id" AS "outboxId"
         FROM "AdminInvitation" AS invitation
         JOIN "AdminNotificationOutbox" AS outbox
           ON outbox."adminInvitationId" = invitation."id"
        WHERE invitation."emailCanonical" = $1 AND invitation."state" = 'PENDING'
        FOR UPDATE OF invitation, outbox`,
      [emailCanonical],
    );
    return one(result.rows);
  }

  async revokeInvitation(invitationId: string, outboxId: string, now: Date): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminInvitation"
          SET "state" = 'REVOKED', "stateGeneration" = "stateGeneration" + 1,
              "revokedAt" = $2
        WHERE "id" = $1 AND "state" = 'PENDING'`,
      [invitationId, now],
    );
    await this.transaction.query(
      `UPDATE "AdminNotificationOutbox"
          SET "state" = CASE
                WHEN "state" = 'PENDING' THEN 'CANCELLED'::"AdminNotificationState"
                ELSE 'DELIVERY_UNCERTAIN'::"AdminNotificationState"
              END,
              "generation" = "generation" + 1,
              "claimOwnerHash" = NULL, "leaseExpiresAt" = NULL,
              "cancelledAt" = CASE WHEN "state" = 'PENDING' THEN $2 ELSE NULL END,
              "uncertainAt" = CASE WHEN "state" = 'CLAIMED' THEN $2 ELSE NULL END,
              "nextAttemptAt" = NULL
        WHERE "id" = $1 AND "state" IN ('PENDING', 'CLAIMED')`,
      [outboxId, now],
    );
  }

  async insertInvitation(input: {
    audit: AdminC2AuditInsert;
    codeHash: string;
    deliveryEmailEncrypted: string;
    emailCanonical: string;
    encrypted: AdminEncryptedOutboxPayload;
    expiresAt: Date;
    invitationId: string;
    outboxId: string;
    proposedRole: AdminRole;
    replacedInvitationId?: string;
    replacedOutboxId?: string;
  }): Promise<void> {
    await this.insertAudit(input.audit);
    await this.transaction.query(
      `INSERT INTO "AdminInvitation"
         ("id", "emailCanonical", "deliveryEmailEncrypted", "codeHash", "proposedRole",
          "creatorAdminUserId", "createdByAuditLogId", "replacedInvitationId",
          "state", "stateGeneration", "expiresAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PENDING', 1, $9)`,
      [
        input.invitationId,
        input.emailCanonical,
        input.deliveryEmailEncrypted,
        input.codeHash,
        input.proposedRole,
        input.audit.actorAdminUserId,
        input.audit.id,
        input.replacedInvitationId ?? null,
        input.expiresAt,
      ],
    );
    await this.transaction.query(
      `INSERT INTO "AdminNotificationOutbox"
         ("id", "purpose", "state", "generation", "encryptedPayload",
          "encryptionKeyId", "encryptionNonce", "encryptionTag", "aadHash",
          "sourceAuditLogId", "adminInvitationId", "replacedOutboxId")
       VALUES ($1, 'INVITATION', 'PENDING', 1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.outboxId,
        input.encrypted.encryptedPayload,
        input.encrypted.encryptionKeyId,
        input.encrypted.encryptionNonce,
        input.encrypted.encryptionTag,
        input.encrypted.aadHash,
        input.audit.id,
        input.invitationId,
        input.replacedOutboxId ?? null,
      ],
    );
  }

  async lockInvitationByCodeHash(codeHash: string): Promise<AdminInvitationRecord | undefined> {
    const result = await this.transaction.query<AdminInvitationRecord>(
      `SELECT "id", "emailCanonical", "codeHash", "proposedRole", "creatorAdminUserId",
              "createdByAuditLogId", "acceptedAdminUserId", "replacedInvitationId",
              "state", "stateGeneration", "expiresAt", "acceptedAt", "revokedAt", "createdAt"
         FROM "AdminInvitation" WHERE "codeHash" = $1 FOR UPDATE`,
      [codeHash],
    );
    return one(result.rows);
  }

  async lockInvitation(id: string): Promise<AdminInvitationRecord | undefined> {
    const result = await this.transaction.query<AdminInvitationRecord>(
      `SELECT "id", "emailCanonical", "codeHash", "proposedRole", "creatorAdminUserId",
              "createdByAuditLogId", "acceptedAdminUserId", "replacedInvitationId",
              "state", "stateGeneration", "expiresAt", "acceptedAt", "revokedAt", "createdAt"
         FROM "AdminInvitation" WHERE "id" = $1 FOR UPDATE`,
      [id],
    );
    return one(result.rows);
  }

  async acceptInvitation(input: {
    invitation: AdminInvitationRecord;
    now: Date;
    passwordHash: string;
    preAuthExpiresAt: Date;
    preAuthId: string;
    preAuthTokenHash: string;
    requestId: string;
    securityEventId: string;
    userId: string;
  }): Promise<void> {
    await this.transaction.query(
      `INSERT INTO "AdminUser"
         ("id", "email", "passwordHash", "role", "status", "authorizationVersion",
          "totpSecretEncrypted", "totpEnabledAt", "lastAcceptedTotpCounter")
       VALUES ($1, $2, $3, $4, 'PENDING_MFA', 1, NULL, NULL, NULL)`,
      [
        input.userId,
        input.invitation.emailCanonical,
        input.passwordHash,
        input.invitation.proposedRole,
      ],
    );
    await this.transaction.query(
      `INSERT INTO "AdminPreAuthContext"
         ("id", "adminUserId", "tokenHash", "purpose", "authorizationVersion", "expiresAt")
       VALUES ($1, $2, $3, 'FIRST_TOTP_ENROLLMENT', 1, $4)`,
      [input.preAuthId, input.userId, input.preAuthTokenHash, input.preAuthExpiresAt],
    );
    await this.transaction.query(
      `UPDATE "AdminInvitation"
          SET "state" = 'ACCEPTED', "stateGeneration" = "stateGeneration" + 1,
              "acceptedAdminUserId" = $2, "acceptedAt" = $3
        WHERE "id" = $1 AND "state" = 'PENDING'`,
      [input.invitation.id, input.userId, input.now],
    );
    await this.insertSecurityEvent({
      action: 'acceptAdminInvitation',
      adminInvitationId: input.invitation.id,
      adminUserId: input.userId,
      entityId: input.invitation.id,
      entityType: 'ADMIN_INVITATION',
      eventClass: 'BUSINESS',
      id: input.securityEventId,
      outcome: 'SUCCEEDED',
      requestId: input.requestId,
    });
  }

  async lockIdempotency(
    adminUserId: string,
    operation: AdminC2IdempotencyRecord['operation'],
    idempotencyKey: string,
  ): Promise<AdminC2IdempotencyRecord | undefined> {
    const result = await this.transaction.query<AdminC2IdempotencyRecord>(
      `WITH database_clock AS MATERIALIZED (
         SELECT (
           pg_catalog.clock_timestamp() AT TIME ZONE 'UTC'
         )::timestamp(3) AS database_now
       )
       SELECT record."adminUserId", record."operation", record."idempotencyKey",
              record."requestDigest", record."responseCode", record."resourceType",
              record."resourceId", record."createdAt", record."expiresAt"
         FROM "AdminC2IdempotencyRecord" AS record
         CROSS JOIN database_clock
        WHERE record."adminUserId" = $1
          AND record."operation" = $2
          AND record."idempotencyKey" = $3
          AND record."expiresAt" > database_clock.database_now`,
      [adminUserId, operation, idempotencyKey],
    );
    return one(result.rows);
  }

  async lockIdempotencyKey(
    adminUserId: string,
    operation: AdminC2IdempotencyRecord['operation'],
    idempotencyKey: string,
  ): Promise<void> {
    await this.transaction.query(
      `SELECT pg_catalog.pg_advisory_xact_lock(
         pg_catalog.hashtextextended(
           pg_catalog.jsonb_build_array(
             'KORA_ADMIN_C2_IDEMPOTENCY_LOCK_V2'::text,
             $1::text,
             $2::text,
             $3::text
           )::text,
           0
         )
       )`,
      [adminUserId, operation, idempotencyKey],
    );
  }

  async insertIdempotency(input: {
    adminUserId: string;
    id: string;
    idempotencyKey: string;
    operation: AdminC2IdempotencyRecord['operation'];
    requestDigest: string;
    resourceId: string;
    resourceType: string;
    responseCode: number;
  }): Promise<void> {
    await this.transaction.query(
      `INSERT INTO "AdminC2IdempotencyRecord"
         ("id", "adminUserId", "operation", "idempotencyKey", "requestDigest",
          "responseCode", "resourceType", "resourceId")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.id,
        input.adminUserId,
        input.operation,
        input.idempotencyKey,
        input.requestDigest,
        input.responseCode,
        input.resourceType,
        input.resourceId,
      ],
    );
  }

  async lockPendingRecoveryCaseBySubject(
    subjectAdminUserId: string,
  ): Promise<AdminRecoveryCaseRecord | undefined> {
    const result = await this.transaction.query<AdminRecoveryCaseRecord>(
      `SELECT "id", "subjectAdminUserId", "creatorAdminUserId", "approverAdminUserId",
              "state", "stateGeneration", "expiresAt", "cancelledAt", "createdAt"
         FROM "AdminRecoveryCase"
        WHERE "subjectAdminUserId" = $1 AND "state" = 'PENDING'
        FOR UPDATE`,
      [subjectAdminUserId],
    );
    return one(result.rows);
  }

  async lockRecoveryCase(id: string): Promise<AdminRecoveryCaseRecord | undefined> {
    const result = await this.transaction.query<AdminRecoveryCaseRecord>(
      `SELECT "id", "subjectAdminUserId", "creatorAdminUserId", "approverAdminUserId",
              "state", "stateGeneration", "expiresAt", "cancelledAt", "createdAt"
         FROM "AdminRecoveryCase" WHERE "id" = $1 FOR UPDATE`,
      [id],
    );
    return one(result.rows);
  }

  async insertRecoveryCase(input: {
    creatorAdminUserId: string;
    expiresAt: Date;
    id: string;
    subjectAdminUserId: string;
  }): Promise<void> {
    await this.transaction.query(
      `INSERT INTO "AdminRecoveryCase"
         ("id", "subjectAdminUserId", "creatorAdminUserId", "state",
          "stateGeneration", "expiresAt")
       VALUES ($1, $2, $3, 'PENDING', 1, $4)`,
      [input.id, input.subjectAdminUserId, input.creatorAdminUserId, input.expiresAt],
    );
  }

  async cancelRecoveryCase(
    recoveryCase: AdminRecoveryCaseRecord,
    causalAuditId: string,
    delegatedByAdminUserId: string,
    requestId: string,
    now: Date,
  ): Promise<void> {
    await this.markRecoveryCaseCancelled(recoveryCase, now);
    await this.insertRecoveryCancellationAudit(
      recoveryCase,
      causalAuditId,
      delegatedByAdminUserId,
      requestId,
    );
  }

  async markRecoveryCaseCancelled(recoveryCase: AdminRecoveryCaseRecord, now: Date): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminRecoveryCase"
          SET "state" = 'CANCELLED', "stateGeneration" = "stateGeneration" + 1,
              "cancelledAt" = $2
        WHERE "id" = $1 AND "state" = 'PENDING' AND "stateGeneration" = $3`,
      [recoveryCase.id, now, recoveryCase.stateGeneration],
    );
  }

  async insertRecoveryCancellationAudit(
    recoveryCase: AdminRecoveryCaseRecord,
    causalAuditId: string,
    delegatedByAdminUserId: string,
    requestId: string,
  ): Promise<void> {
    await this.insertAudit({
      action: 'cancelAdminRecoveryCase',
      adminRecoveryCaseId: recoveryCase.id,
      causationEventId: causalAuditId,
      context: 'SYSTEM',
      delegatedByAdminUserId,
      entityId: recoveryCase.id,
      entityType: 'ADMIN_RECOVERY_CASE',
      eventClass: 'BUSINESS',
      id: randomUUID(),
      maskedAfter: { state: 'CANCELLED', stateGeneration: recoveryCase.stateGeneration + 1 },
      maskedBefore: { state: recoveryCase.state, stateGeneration: recoveryCase.stateGeneration },
      outcome: 'SUCCESS',
      reasonCode: 'SECURITY_RESPONSE',
      requestId,
      systemExecutionRefHash: createRecoveryCancellationExecutionHash(
        recoveryCase.id,
        recoveryCase.stateGeneration + 1,
        causalAuditId,
      ),
    });
  }

  async approveRecoveryCase(
    recoveryCase: AdminRecoveryCaseRecord,
    approverAdminUserId: string,
    now: Date,
  ): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminRecoveryCase"
          SET "state" = 'APPROVED', "stateGeneration" = "stateGeneration" + 1,
              "approverAdminUserId" = $2, "approvedAt" = $3
        WHERE "id" = $1 AND "state" = 'PENDING' AND "stateGeneration" = $4`,
      [recoveryCase.id, approverAdminUserId, now, recoveryCase.stateGeneration],
    );
    await this.transaction.query(
      `UPDATE "AdminUser"
          SET "status" = 'PENDING_MFA',
              "authorizationVersion" = "authorizationVersion" + 1,
              "totpSecretEncrypted" = NULL,
              "totpEnabledAt" = NULL,
              "lastAcceptedTotpCounter" = NULL
        WHERE "id" = $1`,
      [recoveryCase.subjectAdminUserId],
    );
    await this.revokeSecurityMaterial(recoveryCase.subjectAdminUserId, now);
  }

  async lockActiveSuperAdmins(): Promise<readonly AdminC2UserRecord[]> {
    const result = await this.transaction.query<AdminC2UserRecord>(
      `SELECT "id", "email", "role", "status", "authorizationVersion",
              "totpEnabledAt", "createdAt"
         FROM "AdminUser"
        WHERE "role" = 'SUPER_ADMIN' AND "status" = 'ACTIVE'
        ORDER BY "id" ASC
        FOR UPDATE`,
    );
    return result.rows;
  }

  async changeAdminUserRole(adminUserId: string, role: AdminRole, now: Date): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminUser"
          SET "role" = $2, "authorizationVersion" = "authorizationVersion" + 1
        WHERE "id" = $1`,
      [adminUserId, role],
    );
    await this.revokeSecurityMaterial(adminUserId, now);
  }

  async changeAdminUserStatus(
    adminUserId: string,
    status: Extract<AdminStatus, 'ACTIVE' | 'SUSPENDED' | 'DISABLED'>,
    now: Date,
  ): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminUser"
          SET "status" = $2, "authorizationVersion" = "authorizationVersion" + 1
        WHERE "id" = $1`,
      [adminUserId, status],
    );
    await this.revokeSecurityMaterial(adminUserId, now);
  }

  private async revokeSecurityMaterial(adminUserId: string, now: Date): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminSession" SET "revokedAt" = $2
        WHERE "adminUserId" = $1 AND "revokedAt" IS NULL`,
      [adminUserId, now],
    );
    await this.transaction.query(
      `UPDATE "AdminTotpEnrollment" SET "revokedAt" = $2
        WHERE "adminUserId" = $1 AND "revokedAt" IS NULL`,
      [adminUserId, now],
    );
    await this.transaction.query(
      `UPDATE "AdminRecoveryCodeBatch" SET "revokedAt" = $2
        WHERE "adminUserId" = $1 AND "revokedAt" IS NULL`,
      [adminUserId, now],
    );
  }

  async lockDueRecoveryCases(now: Date, limit = 100): Promise<readonly AdminRecoveryCaseRecord[]> {
    const result = await this.transaction.query<AdminRecoveryCaseRecord>(
      `SELECT "id", NULL::text AS "subjectAdminUserId", NULL::text AS "creatorAdminUserId",
              NULL::text AS "approverAdminUserId", "state", "stateGeneration", "expiresAt",
              NULL::timestamp AS "cancelledAt", "expiresAt" AS "createdAt"
         FROM "AdminRecoveryCase"
        WHERE "state" = 'PENDING' AND "expiresAt" <= $1
        ORDER BY "expiresAt" ASC, "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $2`,
      [now, limit],
    );
    return result.rows;
  }

  async tryAcquireRecoveryExpirationSingleton(): Promise<boolean> {
    const result = await this.transaction.query<RecoveryExpirationSingletonRow>(
      'SELECT pg_try_advisory_xact_lock(1263489601, 843142467) AS "acquired"',
    );
    return result.rows.length === 1 && result.rows[0]?.acquired === true;
  }

  async expireRecoveryCase(
    recoveryCase: AdminRecoveryCaseRecord,
    systemExecutionRefHash: string,
    requestId: string,
    now: Date,
  ): Promise<boolean> {
    const result = await this.transaction.query(
      `UPDATE "AdminRecoveryCase"
          SET "state" = 'EXPIRED', "stateGeneration" = "stateGeneration" + 1,
              "expiredAt" = $2
        WHERE "id" = $1 AND "state" = 'PENDING' AND "stateGeneration" = $3
          AND "expiresAt" <= $2`,
      [recoveryCase.id, now, recoveryCase.stateGeneration],
    );
    if (result.rowCount !== 1) return false;
    await this.transaction.query(
      `INSERT INTO "AuditLog"
         ("id", "version", "systemExecutionRefHash", "eventClass", "context",
          "outcome", "failureCode", "action", "entityType", "entityId",
          "maskedBefore", "maskedAfter", "reason", "reasonCode", "operatorReason",
          "requestId", "adminRecoveryCaseId")
       VALUES ($1, 3, $2, 'BUSINESS', 'SYSTEM', 'SUCCESS', NULL,
               'expireAdminRecoveryCase', 'ADMIN_RECOVERY_CASE', $3,
               $4, $5, 'C2_RUNTIME', 'SECURITY_RESPONSE', NULL, $6, $3)`,
      [
        randomUUID(),
        systemExecutionRefHash,
        recoveryCase.id,
        JSON.stringify({ state: 'PENDING', stateGeneration: recoveryCase.stateGeneration }),
        JSON.stringify({ state: 'EXPIRED', stateGeneration: recoveryCase.stateGeneration + 1 }),
        requestId,
      ],
    );
    return true;
  }

  async terminalizeExpiredNotificationClaims(now: Date): Promise<number> {
    const result = await this.transaction.query(
      `UPDATE "AdminNotificationOutbox"
          SET "state" = 'DELIVERY_UNCERTAIN', "generation" = "generation" + 1,
              "claimOwnerHash" = NULL, "leaseExpiresAt" = NULL,
              "uncertainAt" = $1, "nextAttemptAt" = NULL
        WHERE "state" = 'CLAIMED' AND "leaseExpiresAt" <= $1`,
      [now],
    );
    return result.rowCount ?? 0;
  }

  async claimNextNotification(
    ownerHash: string,
    now: Date,
    leaseExpiresAt: Date,
  ): Promise<AdminNotificationOutboxRecord | undefined> {
    const candidate = await this.transaction.query<AdminNotificationOutboxRecord>(
      `SELECT outbox."id", outbox."purpose", outbox."state", outbox."generation",
              outbox."encryptedPayload", outbox."encryptionKeyId", outbox."encryptionNonce",
              outbox."encryptionTag", outbox."aadHash", outbox."sourceSecurityEventId",
              outbox."sourceAuditLogId", outbox."passwordResetRequestId",
              outbox."adminInvitationId", outbox."claimOwnerHash", outbox."leaseExpiresAt",
              outbox."attemptCount", outbox."nextAttemptAt",
              CASE
                WHEN outbox."purpose" = 'PASSWORD_RESET' THEN security_source."notificationOutboxId" IS NOT NULL
                ELSE audit_source."notificationOutboxId" IS NOT NULL
              END AS "sourceValid",
              audit_source."actorAdminUserId" AS "delegatedByAdminUserId"
         FROM "AdminNotificationOutbox" AS outbox
         LEFT JOIN "AdminC2NotificationSecurityEventSource" AS security_source
           ON security_source."notificationOutboxId" = outbox."id"
         LEFT JOIN "AdminC2NotificationAuditSource" AS audit_source
           ON audit_source."notificationOutboxId" = outbox."id"
        WHERE outbox."state" = 'PENDING'
          AND (outbox."nextAttemptAt" IS NULL OR outbox."nextAttemptAt" <= $1)
        ORDER BY outbox."createdAt" ASC, outbox."id" ASC
        FOR UPDATE OF outbox SKIP LOCKED
        LIMIT 1`,
      [now],
    );
    const row = one(candidate.rows);
    if (row === undefined) return undefined;
    if (!row.sourceValid) {
      await this.transaction.query(
        `UPDATE "AdminNotificationOutbox"
            SET "state" = 'CANCELLED', "generation" = "generation" + 1,
                "cancelledAt" = $2, "nextAttemptAt" = NULL
          WHERE "id" = $1 AND "state" = 'PENDING' AND "generation" = $3`,
        [row.id, now, row.generation],
      );
      return undefined;
    }
    const claimed = await this.transaction.query<AdminNotificationOutboxRecord>(
      `UPDATE "AdminNotificationOutbox"
          SET "state" = 'CLAIMED', "generation" = "generation" + 1,
              "claimOwnerHash" = $2, "leaseExpiresAt" = $3,
              "attemptCount" = "attemptCount" + 1, "nextAttemptAt" = NULL
        WHERE "id" = $1 AND "state" = 'PENDING' AND "generation" = $4
      RETURNING "id", "purpose", "state", "generation", "encryptedPayload",
                "encryptionKeyId", "encryptionNonce", "encryptionTag", "aadHash",
                "sourceSecurityEventId", "sourceAuditLogId", "passwordResetRequestId",
                "adminInvitationId", "claimOwnerHash", "leaseExpiresAt", "attemptCount",
                "nextAttemptAt", true AS "sourceValid"`,
      [row.id, ownerHash, leaseExpiresAt, row.generation],
    );
    const claimedRow = one(claimed.rows);
    return claimedRow === undefined
      ? undefined
      : { ...claimedRow, delegatedByAdminUserId: row.delegatedByAdminUserId };
  }

  async finishNotification(input: {
    acknowledgementHash?: string;
    delegatedByAdminUserId?: string;
    generation: number;
    id: string;
    nextAttemptAt?: Date;
    now: Date;
    ownerHash: string;
    state: 'DELIVERED' | 'FAILED' | 'DELIVERY_UNCERTAIN' | 'PENDING';
  }): Promise<boolean> {
    const result = await this.transaction.query<AdminNotificationOutboxRecord>(
      `UPDATE "AdminNotificationOutbox"
          SET "state" = $5::"AdminNotificationState",
              "generation" = "generation" + 1,
              "claimOwnerHash" = NULL,
              "leaseExpiresAt" = NULL,
              "nextAttemptAt" = $6,
              "providerAcknowledgementHash" = $7,
              "deliveredAt" = CASE WHEN $5 = 'DELIVERED' THEN $4 ELSE NULL END,
              "failedAt" = CASE WHEN $5 = 'FAILED' THEN $4 ELSE NULL END,
              "uncertainAt" = CASE WHEN $5 = 'DELIVERY_UNCERTAIN' THEN $4 ELSE NULL END
        WHERE "id" = $1 AND "state" = 'CLAIMED' AND "generation" = $2
          AND "claimOwnerHash" = $3 AND "leaseExpiresAt" > $4
      RETURNING "id", "purpose", "state", "generation", "encryptedPayload",
                "encryptionKeyId", "encryptionNonce", "encryptionTag", "aadHash",
                "sourceSecurityEventId", "sourceAuditLogId", "passwordResetRequestId",
                "adminInvitationId", "claimOwnerHash", "leaseExpiresAt", "attemptCount",
                "nextAttemptAt", true AS "sourceValid"`,
      [
        input.id,
        input.generation,
        input.ownerHash,
        input.now,
        input.state,
        input.nextAttemptAt ?? null,
        input.acknowledgementHash ?? null,
      ],
    );
    const updated = one(result.rows);
    if (updated === undefined) return false;
    if (input.state === 'DELIVERED') await this.insertNotificationDeliveryAudit(updated, input);
    return true;
  }

  private async insertNotificationDeliveryAudit(
    outbox: AdminNotificationOutboxRecord,
    input: Readonly<{ delegatedByAdminUserId?: string; now: Date }>,
  ): Promise<void> {
    const passwordReset = outbox.purpose === 'PASSWORD_RESET';
    const action = passwordReset
      ? 'deliverAdminPasswordResetNotification'
      : 'deliverAdminInvitationNotification';
    await this.transaction.query(
      `INSERT INTO "AuditLog"
         ("id", "version", "systemExecutionRefHash", "eventClass", "context",
          "outcome", "failureCode", "action", "entityType", "entityId",
          "maskedBefore", "maskedAfter", "reason", "reasonCode", "operatorReason",
          "requestId", "causationEventId", "causationSecurityEventId",
          "delegatedByAdminUserId", "adminInvitationId", "notificationOutboxId")
       VALUES ($1, 3, $2, $3::"AdminAuditEventClass", 'SYSTEM', 'SUCCESS', NULL,
               $4, $5, $6, $7, $8, 'C2_RUNTIME', $9::"AdminReasonCode", NULL,
               $10, $11, $12, $13, $14, $15)`,
      [
        randomUUID(),
        createDeliveryExecutionHash(outbox.id, outbox.generation),
        passwordReset ? 'LOGIN' : 'BUSINESS',
        action,
        passwordReset ? 'ADMIN_PASSWORD_RESET_REQUEST' : 'ADMIN_INVITATION',
        passwordReset ? outbox.passwordResetRequestId : outbox.adminInvitationId,
        JSON.stringify({ state: 'CLAIMED' }),
        JSON.stringify({ state: 'DELIVERED' }),
        passwordReset ? 'ACCOUNT_RECOVERY' : 'INVITATION_ADMINISTRATION',
        randomUUID(),
        passwordReset ? null : outbox.sourceAuditLogId,
        passwordReset ? outbox.sourceSecurityEventId : null,
        passwordReset ? null : input.delegatedByAdminUserId,
        passwordReset ? null : outbox.adminInvitationId,
        outbox.id,
      ],
    );
  }

  async readBootstrapState(): Promise<{
    auditLogId: string | null;
    guardUserId: string | null;
    guardPresent: boolean;
    userId: string | null;
  }> {
    const users = await this.transaction.query<QueryResultRow & { id: string }>(
      `SELECT "id" FROM "AdminUser" ORDER BY "id" ASC LIMIT 1`,
    );
    const guard = await this.transaction.query<
      QueryResultRow & { adminUserId: string; bootstrapAuditLogId: string }
    >(
      `SELECT "adminUserId", "bootstrapAuditLogId"
         FROM "AdminBootstrapGuard"
        WHERE "singletonKey" = 'ADMIN_BOOTSTRAP_V1'`,
    );
    const guardRow = one(guard.rows);
    return {
      auditLogId: guardRow?.bootstrapAuditLogId ?? null,
      guardUserId: guardRow?.adminUserId ?? null,
      guardPresent: guardRow !== undefined,
      userId: one(users.rows)?.id ?? null,
    };
  }

  async acquireBootstrapGuard(userId: string, auditId: string): Promise<void> {
    await this.transaction.query(
      `INSERT INTO "AdminBootstrapGuard"
         ("singletonKey", "adminUserId", "bootstrapAuditLogId")
       VALUES ('ADMIN_BOOTSTRAP_V1', $1, $2)`,
      [userId, auditId],
    );
  }

  async bootstrapAdmin(input: {
    auditId: string;
    email: string;
    passwordHash: string;
    requestId: string;
    systemExecutionRefHash: string;
    userId: string;
  }): Promise<void> {
    await this.transaction.query(
      `INSERT INTO "AdminUser"
         ("id", "email", "passwordHash", "role", "status", "authorizationVersion",
          "totpSecretEncrypted", "totpEnabledAt", "lastAcceptedTotpCounter")
       VALUES ($1, $2, $3, 'SUPER_ADMIN', 'PENDING_MFA', 1, NULL, NULL, NULL)`,
      [input.userId, input.email, input.passwordHash],
    );
    await this.transaction.query(
      `INSERT INTO "AuditLog"
         ("id", "version", "systemExecutionRefHash", "eventClass", "context",
          "outcome", "failureCode", "action", "entityType", "entityId",
          "maskedBefore", "maskedAfter", "reason", "reasonCode", "operatorReason",
          "requestId", "bootstrapGuardId")
       VALUES ($1, 3, $2, 'BUSINESS', 'SYSTEM', 'SUCCESS', NULL,
               'bootstrapAdminUser', 'ADMIN_USER', $3, NULL, $4,
               'C2_RUNTIME', 'SECURITY_RESPONSE', NULL, $5, 'ADMIN_BOOTSTRAP_V1')`,
      [
        input.auditId,
        input.systemExecutionRefHash,
        input.userId,
        JSON.stringify({ role: 'SUPER_ADMIN', status: 'PENDING_MFA' }),
        input.requestId,
      ],
    );
  }

  mapRecoveryCase(row: RecoveryCaseRow): AdminRecoveryCaseProjection {
    return {
      approverAdminUserId: row.approverAdminUserId,
      caseId: row.caseId,
      createdAt: row.createdAt.toISOString(),
      creatorAdminUserId: row.creatorAdminUserId,
      expiresAt: row.expiresAt.toISOString(),
      state: row.state,
      subjectAdminUserId: row.subjectAdminUserId,
    };
  }

  mapAdminUser(row: AdminUserRow): AdminUserProjection {
    return {
      adminUserId: row.id,
      authorizationVersion: row.authorizationVersion,
      email: row.email,
      role: row.role,
      status: row.status,
    };
  }
}

@Injectable()
export class AdminSecurityRepository {
  constructor(
    @Inject(AdminC2aBoundariesService) private readonly boundaries: AdminC2aBoundariesService,
  ) {}

  async transaction<T>(
    callback: (transaction: AdminSecurityTransactionRepository) => Promise<T>,
  ): Promise<T> {
    return this.boundaries.transaction((transaction) =>
      callback(new AdminSecurityTransactionRepository(transaction)),
    );
  }
}
