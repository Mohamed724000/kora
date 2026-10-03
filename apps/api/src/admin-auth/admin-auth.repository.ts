import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import { AdminWriterService, type AdminWriterTransaction } from '../database/admin-writer.service';
import { PrismaService } from '../database/prisma.service';

export type AdminRole = 'SUPER_ADMIN' | 'CONTENT_EDITOR' | 'FINANCE_MANAGER' | 'SUPPORT';
export type AdminStatus = 'INVITED' | 'PENDING_MFA' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
export type AdminPreAuthPurpose = 'FIRST_TOTP_ENROLLMENT' | 'TOTP_VERIFY';
export type AdminStepUpPurpose =
  | 'SESSION_REVOCATION'
  | 'RECOVERY_APPROVAL'
  | 'AUDIT_EXPORT'
  | 'INVITATION'
  | 'ROLE_CHANGE'
  | 'STATUS_CHANGE';
export type AdminReasonCode =
  | 'SECURITY_RESPONSE'
  | 'ACCOUNT_RECOVERY'
  | 'ROLE_ADMINISTRATION'
  | 'STATUS_ADMINISTRATION'
  | 'AUDIT_EXPORT'
  | 'INVITATION_ADMINISTRATION';

export interface AdminUserRecord extends QueryResultRow {
  authorizationVersion: number;
  createdAt: Date;
  email: string;
  id: string;
  lastAcceptedTotpCounter: bigint | null;
  passwordHash: string;
  role: AdminRole;
  status: AdminStatus;
  totpEnabledAt: Date | null;
  totpSecretEncrypted: string | null;
}

export interface AdminPreAuthRecord extends QueryResultRow {
  adminUserId: string;
  authorizationVersion: number;
  consumedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  id: string;
  purpose: AdminPreAuthPurpose;
  revokedAt: Date | null;
  tokenHash: string;
}

export interface AdminRecoveryContextRecord extends QueryResultRow {
  adminUserId: string;
  authorizationVersion: number;
  consumedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  id: string;
  recoveryCodeId: string;
  revokedAt: Date | null;
  tokenHash: string;
}

export interface AdminEnrollmentRecord extends QueryResultRow {
  adminPreAuthContextId: string | null;
  adminRecoveryContextId: string | null;
  adminUserId: string;
  authorizationVersion: number;
  confirmedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  id: string;
  qrDeliveredAt: Date | null;
  revokedAt: Date | null;
  secretEncrypted: string;
}

export interface AdminSessionRecord extends QueryResultRow {
  absoluteExpiresAt: Date | null;
  accessTokenJti: string;
  adminUserId: string;
  authorizationVersion: number | null;
  createdAt: Date;
  expiresAt: Date;
  id: string;
  lastActivityAt: Date;
  lastTwoFactorAt: Date;
  refreshTokenHash: string;
  refreshTokenVersion: number;
  revokedAt: Date | null;
  stepUpExpiresAt: Date | null;
  stepUpPurpose: AdminStepUpPurpose | null;
  stepUpVerifiedAt: Date | null;
  tokenFamilyId: string;
  updatedAt: Date;
}

export interface AdminRefreshTokenRecord extends QueryResultRow {
  adminSessionId: string;
  adminUserId: string;
  consumedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  generation: number;
  id: string;
  previousTokenId: string | null;
  tokenHash: string;
}

export interface AdminRecoveryCodeRecord extends QueryResultRow {
  adminUserId: string;
  batchId: string | null;
  codeHash: string;
  createdAt: Date;
  id: string;
  selector: string | null;
  usedAt: Date | null;
}

export interface AdminIdempotencyRecord extends QueryResultRow {
  adminUserId: string;
  createdAt: Date;
  expiresAt: Date;
  id: string;
  idempotencyKey: string;
  operation: string;
  requestHash: string;
  resourceId: string;
  resourceType: string;
  responseCode: number;
}

export interface AdminAuditInsert {
  action: string;
  actorAdminUserId: string;
  adminRecoveryContextId?: string;
  adminSessionId?: string;
  createdAt: Date;
  entityId: string;
  entityType: string;
  id: string;
  maskedAfter?: Readonly<Record<string, unknown>>;
  maskedBefore?: Readonly<Record<string, unknown>>;
  operatorReason?: string;
  reasonCode: AdminReasonCode;
  requestId: string;
  subjectAdminUserId?: string;
}

export type AdminFailureAuditContext = Omit<AdminAuditInsert, 'createdAt' | 'id' | 'requestId'>;

export interface AdminSecurityEventInsert {
  action: string;
  adminUserId?: string;
  createdAt: Date;
  failureCode?: string;
  id: string;
  outcome: 'SUCCEEDED' | 'FAILED';
  requestId: string;
  subjectRefHash?: string;
}

export interface NewSessionInput {
  absoluteExpiresAt: Date;
  accessTokenJti: string;
  adminUserId: string;
  authorizationVersion: number;
  createdAt: Date;
  expiresAt: Date;
  id: string;
  refreshTokenHash: string;
  refreshTokenId: string;
  tokenFamilyId: string;
}

export interface NewRecoveryCodeInput {
  codeHash: string;
  id: string;
  selector: string;
}

function one<Row extends QueryResultRow>(rows: readonly Row[]): Row | undefined {
  return rows.length === 1 ? rows[0] : undefined;
}

export class AdminAuthTransactionRepository {
  constructor(private readonly transaction: AdminWriterTransaction) {}

  async lockAdminUserByEmail(email: string): Promise<AdminUserRecord | undefined> {
    const result = await this.transaction.query<AdminUserRecord>(
      `SELECT "id", "email", "passwordHash", "role", "status",
              "authorizationVersion", "totpSecretEncrypted", "totpEnabledAt",
              "lastAcceptedTotpCounter", "createdAt"
         FROM "AdminUser"
        WHERE lower("email") = lower($1)
        FOR UPDATE`,
      [email],
    );
    return one(result.rows);
  }

  async lockAdminUser(id: string): Promise<AdminUserRecord | undefined> {
    const result = await this.transaction.query<AdminUserRecord>(
      `SELECT "id", "email", "passwordHash", "role", "status",
              "authorizationVersion", "totpSecretEncrypted", "totpEnabledAt",
              "lastAcceptedTotpCounter", "createdAt"
         FROM "AdminUser" WHERE "id" = $1 FOR UPDATE`,
      [id],
    );
    return one(result.rows);
  }

  async lockAdminUsers(ids: readonly string[]): Promise<readonly AdminUserRecord[]> {
    if (ids.length === 0) return [];
    const result = await this.transaction.query<AdminUserRecord>(
      `SELECT "id", "email", "passwordHash", "role", "status",
              "authorizationVersion", "totpSecretEncrypted", "totpEnabledAt",
              "lastAcceptedTotpCounter", "createdAt"
         FROM "AdminUser"
        WHERE "id" = ANY($1::text[])
        ORDER BY "id" ASC
        FOR UPDATE`,
      [[...new Set(ids)].sort()],
    );
    return result.rows;
  }

  async insertSecurityEvent(event: AdminSecurityEventInsert): Promise<void> {
    const eventClass = event.action.startsWith('ADMIN_SESSION') ? 'SESSION' : 'LOGIN';
    await this.transaction.query(
      `INSERT INTO "AdminSecurityEvent"
         ("id", "adminUserId", "eventClass", "action", "outcome", "failureCode",
          "requestId", "subjectRefHash", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        event.id,
        event.adminUserId ?? null,
        eventClass,
        event.action,
        event.outcome,
        event.failureCode ?? null,
        event.requestId,
        event.subjectRefHash ?? null,
        event.createdAt,
      ],
    );
  }

  async insertAudit(entry: AdminAuditInsert): Promise<void> {
    const recovery = entry.adminRecoveryContextId !== undefined;
    const eventClass = entry.action.startsWith('ADMIN_SESSION') ? 'SESSION' : 'LOGIN';
    await this.transaction.query(
      `INSERT INTO "AuditLog"
         ("id", "adminUserId", "subjectAdminUserId", "adminSessionId",
          "adminRecoveryContextId", "eventClass", "context", "action", "entityType",
          "entityId", "maskedBefore", "maskedAfter", "reason", "reasonCode",
          "operatorReason", "requestId", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
               $11, $12, 'C1_RUNTIME', $13, $14, $15, $16)`,
      [
        entry.id,
        entry.actorAdminUserId,
        entry.subjectAdminUserId ?? null,
        entry.adminSessionId ?? null,
        entry.adminRecoveryContextId ?? null,
        eventClass,
        recovery ? 'ADMIN_RECOVERY' : 'ADMIN_SESSION',
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.maskedBefore === undefined ? null : JSON.stringify(entry.maskedBefore),
        entry.maskedAfter === undefined ? null : JSON.stringify(entry.maskedAfter),
        entry.reasonCode,
        entry.operatorReason ?? null,
        entry.requestId,
        entry.createdAt,
      ],
    );
  }

  async insertPreAuth(input: {
    adminUserId: string;
    authorizationVersion: number;
    createdAt: Date;
    expiresAt: Date;
    id: string;
    purpose: AdminPreAuthPurpose;
    tokenHash: string;
  }): Promise<void> {
    await this.transaction.query(
      `INSERT INTO "AdminPreAuthContext"
         ("id", "adminUserId", "tokenHash", "purpose", "authorizationVersion",
          "expiresAt", "consumedAt", "revokedAt", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, $7)`,
      [
        input.id,
        input.adminUserId,
        input.tokenHash,
        input.purpose,
        input.authorizationVersion,
        input.expiresAt,
        input.createdAt,
      ],
    );
  }

  async lockPreAuthByHash(tokenHash: string): Promise<AdminPreAuthRecord | undefined> {
    const result = await this.transaction.query<AdminPreAuthRecord>(
      `SELECT "id", "adminUserId", "tokenHash", "purpose", "authorizationVersion",
              "expiresAt", "consumedAt", "revokedAt", "createdAt"
         FROM "AdminPreAuthContext" WHERE "tokenHash" = $1 FOR UPDATE`,
      [tokenHash],
    );
    return one(result.rows);
  }

  async findPreAuthByHash(tokenHash: string): Promise<AdminPreAuthRecord | undefined> {
    const result = await this.transaction.query<AdminPreAuthRecord>(
      `SELECT "id", "adminUserId", "tokenHash", "purpose", "authorizationVersion",
              "expiresAt", "consumedAt", "revokedAt", "createdAt"
         FROM "AdminPreAuthContext" WHERE "tokenHash" = $1`,
      [tokenHash],
    );
    return one(result.rows);
  }

  async lockRecoveryContextByHash(
    tokenHash: string,
  ): Promise<AdminRecoveryContextRecord | undefined> {
    const result = await this.transaction.query<AdminRecoveryContextRecord>(
      `SELECT "id", "adminUserId", "tokenHash", "recoveryCodeId",
              "authorizationVersion", "expiresAt", "consumedAt", "revokedAt", "createdAt"
         FROM "AdminRecoveryContext" WHERE "tokenHash" = $1 FOR UPDATE`,
      [tokenHash],
    );
    return one(result.rows);
  }

  async findRecoveryContextByHash(
    tokenHash: string,
  ): Promise<AdminRecoveryContextRecord | undefined> {
    const result = await this.transaction.query<AdminRecoveryContextRecord>(
      `SELECT "id", "adminUserId", "tokenHash", "recoveryCodeId",
              "authorizationVersion", "expiresAt", "consumedAt", "revokedAt", "createdAt"
         FROM "AdminRecoveryContext" WHERE "tokenHash" = $1`,
      [tokenHash],
    );
    return one(result.rows);
  }

  async consumePreAuth(id: string, consumedAt: Date): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminPreAuthContext" SET "consumedAt" = $2
        WHERE "id" = $1 AND "consumedAt" IS NULL AND "revokedAt" IS NULL`,
      [id, consumedAt],
    );
  }

  async consumeRecoveryContext(id: string, consumedAt: Date): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminRecoveryContext" SET "consumedAt" = $2
        WHERE "id" = $1 AND "consumedAt" IS NULL AND "revokedAt" IS NULL`,
      [id, consumedAt],
    );
  }

  async insertEnrollment(input: {
    adminPreAuthContextId?: string;
    adminRecoveryContextId?: string;
    adminUserId: string;
    authorizationVersion: number;
    createdAt: Date;
    expiresAt: Date;
    id: string;
    secretEncrypted: string;
  }): Promise<void> {
    await this.transaction.query(
      `INSERT INTO "AdminTotpEnrollment"
         ("id", "adminUserId", "adminPreAuthContextId", "adminRecoveryContextId",
          "secretEncrypted", "authorizationVersion", "expiresAt", "qrDeliveredAt",
          "confirmedAt", "revokedAt", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, NULL, NULL, $8)`,
      [
        input.id,
        input.adminUserId,
        input.adminPreAuthContextId ?? null,
        input.adminRecoveryContextId ?? null,
        input.secretEncrypted,
        input.authorizationVersion,
        input.expiresAt,
        input.createdAt,
      ],
    );
  }

  async lockEnrollment(id: string): Promise<AdminEnrollmentRecord | undefined> {
    const result = await this.transaction.query<AdminEnrollmentRecord>(
      `SELECT "id", "adminUserId", "adminPreAuthContextId", "adminRecoveryContextId",
              "secretEncrypted", "authorizationVersion", "expiresAt", "qrDeliveredAt",
              "confirmedAt", "revokedAt", "createdAt"
         FROM "AdminTotpEnrollment" WHERE "id" = $1 FOR UPDATE`,
      [id],
    );
    return one(result.rows);
  }

  async markQrDelivered(id: string, deliveredAt: Date): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminTotpEnrollment" SET "qrDeliveredAt" = $2
        WHERE "id" = $1 AND "qrDeliveredAt" IS NULL AND "confirmedAt" IS NULL
          AND "revokedAt" IS NULL`,
      [id, deliveredAt],
    );
  }

  async markEnrollmentConfirmed(id: string, confirmedAt: Date): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminTotpEnrollment" SET "confirmedAt" = $2
        WHERE "id" = $1 AND "confirmedAt" IS NULL AND "revokedAt" IS NULL`,
      [id, confirmedAt],
    );
  }

  async updateTotpFactor(input: {
    adminUserId: string;
    authorizationVersion: number;
    counter: bigint;
    encryptedSecret: string;
    status: 'ACTIVE' | 'PENDING_MFA';
    verifiedAt: Date;
  }): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminUser"
          SET "status" = $2, "authorizationVersion" = $3,
              "totpSecretEncrypted" = $4, "totpEnabledAt" = $5,
              "lastAcceptedTotpCounter" = $6
        WHERE "id" = $1`,
      [
        input.adminUserId,
        input.status,
        input.authorizationVersion,
        input.encryptedSecret,
        input.verifiedAt,
        input.counter.toString(),
      ],
    );
  }

  async updateTotpCounter(
    adminUserId: string,
    counter: bigint,
    encryptedSecret?: string,
  ): Promise<void> {
    if (encryptedSecret === undefined) {
      await this.transaction.query(
        `UPDATE "AdminUser" SET "lastAcceptedTotpCounter" = $2 WHERE "id" = $1`,
        [adminUserId, counter.toString()],
      );
      return;
    }
    await this.transaction.query(
      `UPDATE "AdminUser"
          SET "lastAcceptedTotpCounter" = $2, "totpSecretEncrypted" = $3
        WHERE "id" = $1`,
      [adminUserId, counter.toString(), encryptedSecret],
    );
  }

  async beginRecovery(input: {
    adminUserId: string;
    authorizationVersion: number;
    createdAt: Date;
    expiresAt: Date;
    id: string;
    recoveryCodeId: string;
    tokenHash: string;
  }): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminUser"
          SET "status" = 'PENDING_MFA', "authorizationVersion" = $2
        WHERE "id" = $1`,
      [input.adminUserId, input.authorizationVersion],
    );
    await this.transaction.query(
      `INSERT INTO "AdminRecoveryContext"
         ("id", "adminUserId", "tokenHash", "recoveryCodeId", "authorizationVersion",
          "expiresAt", "consumedAt", "revokedAt", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, $7)`,
      [
        input.id,
        input.adminUserId,
        input.tokenHash,
        input.recoveryCodeId,
        input.authorizationVersion,
        input.expiresAt,
        input.createdAt,
      ],
    );
  }

  async lockRecoveryCode(selector: string): Promise<AdminRecoveryCodeRecord | undefined> {
    const result = await this.transaction.query<AdminRecoveryCodeRecord>(
      `SELECT code."id", code."adminUserId", code."batchId", code."selector",
              code."codeHash", code."usedAt", code."createdAt"
         FROM "AdminRecoveryCode" AS code
         JOIN "AdminRecoveryCodeBatch" AS batch
           ON batch."id" = code."batchId" AND batch."adminUserId" = code."adminUserId"
        WHERE code."selector" = $1 AND batch."revokedAt" IS NULL
        FOR UPDATE OF code`,
      [selector],
    );
    return one(result.rows);
  }

  async consumeRecoveryCode(id: string, usedAt: Date): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminRecoveryCode" SET "usedAt" = $2
        WHERE "id" = $1 AND "usedAt" IS NULL`,
      [id, usedAt],
    );
  }

  async replaceRecoveryCodes(input: {
    adminUserId: string;
    batchId: string;
    codes: readonly NewRecoveryCodeInput[];
    createdAt: Date;
  }): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminRecoveryCodeBatch" SET "revokedAt" = $2
        WHERE "adminUserId" = $1 AND "revokedAt" IS NULL`,
      [input.adminUserId, input.createdAt],
    );
    await this.transaction.query(
      `INSERT INTO "AdminRecoveryCodeBatch" ("id", "adminUserId", "revokedAt", "createdAt")
       VALUES ($1, $2, NULL, $3)`,
      [input.batchId, input.adminUserId, input.createdAt],
    );
    for (const code of input.codes) {
      await this.transaction.query(
        `INSERT INTO "AdminRecoveryCode"
           ("id", "adminUserId", "batchId", "selector", "codeHash", "usedAt", "createdAt")
         VALUES ($1, $2, $3, $4, $5, NULL, $6)`,
        [code.id, input.adminUserId, input.batchId, code.selector, code.codeHash, input.createdAt],
      );
    }
  }

  async lockSession(id: string): Promise<AdminSessionRecord | undefined> {
    const result = await this.transaction.query<AdminSessionRecord>(
      `SELECT "id", "adminUserId", "tokenFamilyId", "accessTokenJti",
              "refreshTokenHash", "refreshTokenVersion", "lastTwoFactorAt",
              "lastActivityAt", "expiresAt", "absoluteExpiresAt",
              "authorizationVersion", "stepUpPurpose", "stepUpVerifiedAt",
              "stepUpExpiresAt", "revokedAt", "createdAt", "updatedAt"
         FROM "AdminSession" WHERE "id" = $1 FOR UPDATE`,
      [id],
    );
    return one(result.rows);
  }

  async lockSessions(ids: readonly string[]): Promise<readonly AdminSessionRecord[]> {
    if (ids.length === 0) return [];
    const result = await this.transaction.query<AdminSessionRecord>(
      `SELECT "id", "adminUserId", "tokenFamilyId", "accessTokenJti",
              "refreshTokenHash", "refreshTokenVersion", "lastTwoFactorAt",
              "lastActivityAt", "expiresAt", "absoluteExpiresAt",
              "authorizationVersion", "stepUpPurpose", "stepUpVerifiedAt",
              "stepUpExpiresAt", "revokedAt", "createdAt", "updatedAt"
         FROM "AdminSession"
        WHERE "id" = ANY($1::text[])
        ORDER BY "id" ASC
        FOR UPDATE`,
      [[...new Set(ids)].sort()],
    );
    return result.rows;
  }

  async findSessions(ids: readonly string[]): Promise<readonly AdminSessionRecord[]> {
    if (ids.length === 0) return [];
    const result = await this.transaction.query<AdminSessionRecord>(
      `SELECT "id", "adminUserId", "tokenFamilyId", "accessTokenJti",
              "refreshTokenHash", "refreshTokenVersion", "lastTwoFactorAt",
              "lastActivityAt", "expiresAt", "absoluteExpiresAt",
              "authorizationVersion", "stepUpPurpose", "stepUpVerifiedAt",
              "stepUpExpiresAt", "revokedAt", "createdAt", "updatedAt"
         FROM "AdminSession"
        WHERE "id" = ANY($1::text[])
        ORDER BY "id" ASC`,
      [[...new Set(ids)].sort()],
    );
    return result.rows;
  }

  async lockRefreshTokenByHash(tokenHash: string): Promise<AdminRefreshTokenRecord | undefined> {
    const result = await this.transaction.query<AdminRefreshTokenRecord>(
      `SELECT "id", "adminUserId", "adminSessionId", "previousTokenId", "tokenHash",
              "generation", "expiresAt", "consumedAt", "createdAt"
         FROM "AdminRefreshToken" WHERE "tokenHash" = $1 FOR UPDATE`,
      [tokenHash],
    );
    return one(result.rows);
  }

  async findRefreshTokenByHash(tokenHash: string): Promise<AdminRefreshTokenRecord | undefined> {
    const result = await this.transaction.query<AdminRefreshTokenRecord>(
      `SELECT "id", "adminUserId", "adminSessionId", "previousTokenId", "tokenHash",
              "generation", "expiresAt", "consumedAt", "createdAt"
         FROM "AdminRefreshToken" WHERE "tokenHash" = $1`,
      [tokenHash],
    );
    return one(result.rows);
  }

  async createSession(input: NewSessionInput): Promise<void> {
    await this.transaction.query(
      `INSERT INTO "AdminSession"
         ("id", "adminUserId", "tokenFamilyId", "accessTokenJti", "refreshTokenHash",
          "refreshTokenVersion", "lastTwoFactorAt", "lastActivityAt", "expiresAt",
          "absoluteExpiresAt", "authorizationVersion", "stepUpPurpose", "stepUpVerifiedAt",
          "stepUpExpiresAt", "revokedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 1, $6, $6, $7, $8, $9,
               NULL, NULL, NULL, NULL, $6, $6)`,
      [
        input.id,
        input.adminUserId,
        input.tokenFamilyId,
        input.accessTokenJti,
        input.refreshTokenHash,
        input.createdAt,
        input.expiresAt,
        input.absoluteExpiresAt,
        input.authorizationVersion,
      ],
    );
    await this.transaction.query(
      `INSERT INTO "AdminRefreshToken"
         ("id", "adminUserId", "adminSessionId", "previousTokenId", "tokenHash",
          "generation", "expiresAt", "consumedAt", "createdAt")
       VALUES ($1, $2, $3, NULL, $4, 1, $5, NULL, $6)`,
      [
        input.refreshTokenId,
        input.adminUserId,
        input.id,
        input.refreshTokenHash,
        input.absoluteExpiresAt,
        input.createdAt,
      ],
    );
  }

  async evictOverflowFamilies(adminUserId: string, now: Date): Promise<void> {
    await this.transaction.query(
      `WITH active AS (
         SELECT "id", row_number() OVER (
           ORDER BY "lastActivityAt" DESC, "createdAt" DESC, "id" DESC
         ) AS keep_order
           FROM "AdminSession"
          WHERE "adminUserId" = $1 AND "revokedAt" IS NULL
            AND "expiresAt" > $2 AND "absoluteExpiresAt" > $2
       )
       UPDATE "AdminSession" AS session_entry
          SET "revokedAt" = $2, "updatedAt" = $2
         FROM active
        WHERE session_entry."id" = active."id" AND active.keep_order > 2`,
      [adminUserId, now],
    );
  }

  async revokeAllSessions(adminUserId: string, revokedAt: Date): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminSession" SET "revokedAt" = $2, "updatedAt" = $2
        WHERE "adminUserId" = $1 AND "revokedAt" IS NULL`,
      [adminUserId, revokedAt],
    );
  }

  async revokeSession(id: string, revokedAt: Date): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminSession" SET "revokedAt" = $2, "updatedAt" = $2
        WHERE "id" = $1 AND "revokedAt" IS NULL`,
      [id, revokedAt],
    );
  }

  async touchSession(id: string, now: Date, expiresAt: Date): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminSession"
          SET "lastActivityAt" = $2, "expiresAt" = $3, "updatedAt" = $2
        WHERE "id" = $1 AND "revokedAt" IS NULL`,
      [id, now, expiresAt],
    );
  }

  async setStepUp(
    id: string,
    purpose: AdminStepUpPurpose,
    verifiedAt: Date,
    expiresAt: Date,
  ): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminSession"
          SET "stepUpPurpose" = $2, "stepUpVerifiedAt" = $3,
              "stepUpExpiresAt" = $4, "updatedAt" = $3
        WHERE "id" = $1 AND "revokedAt" IS NULL`,
      [id, purpose, verifiedAt, expiresAt],
    );
  }

  async rotateRefresh(input: {
    accessTokenJti: string;
    consumedAt: Date;
    expiresAt: Date;
    newTokenHash: string;
    newTokenId: string;
    previous: AdminRefreshTokenRecord;
  }): Promise<void> {
    await this.transaction.query(
      `UPDATE "AdminRefreshToken" SET "consumedAt" = $2
        WHERE "id" = $1 AND "consumedAt" IS NULL`,
      [input.previous.id, input.consumedAt],
    );
    await this.transaction.query(
      `INSERT INTO "AdminRefreshToken"
         ("id", "adminUserId", "adminSessionId", "previousTokenId", "tokenHash",
          "generation", "expiresAt", "consumedAt", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8)`,
      [
        input.newTokenId,
        input.previous.adminUserId,
        input.previous.adminSessionId,
        input.previous.id,
        input.newTokenHash,
        input.previous.generation + 1,
        input.expiresAt,
        input.consumedAt,
      ],
    );
    await this.transaction.query(
      `UPDATE "AdminSession"
          SET "accessTokenJti" = $2, "refreshTokenHash" = $3,
              "refreshTokenVersion" = "refreshTokenVersion" + 1,
              "lastActivityAt" = $4, "expiresAt" = $5, "updatedAt" = $4
        WHERE "id" = $1`,
      [
        input.previous.adminSessionId,
        input.accessTokenJti,
        input.newTokenHash,
        input.consumedAt,
        input.expiresAt,
      ],
    );
  }

  async findIdempotency(
    adminUserId: string,
    operation: string,
    key: string,
  ): Promise<AdminIdempotencyRecord | undefined> {
    const result = await this.transaction.query<AdminIdempotencyRecord>(
      `SELECT "id", "adminUserId", "operation", "idempotencyKey", "requestHash",
              "responseCode", "resourceType", "resourceId", "expiresAt", "createdAt"
         FROM "AdminIdempotencyRecord"
        WHERE "adminUserId" = $1 AND "operation" = $2 AND "idempotencyKey" = $3`,
      [adminUserId, operation, key],
    );
    return one(result.rows);
  }

  async insertIdempotency(input: AdminIdempotencyRecord): Promise<void> {
    await this.transaction.query(
      `INSERT INTO "AdminIdempotencyRecord"
         ("id", "adminUserId", "operation", "idempotencyKey", "requestHash",
          "responseCode", "resourceType", "resourceId", "expiresAt", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.id,
        input.adminUserId,
        input.operation,
        input.idempotencyKey,
        input.requestHash,
        input.responseCode,
        input.resourceType,
        input.resourceId,
        input.expiresAt,
        input.createdAt,
      ],
    );
  }
}

@Injectable()
export class AdminAuthRepository {
  constructor(
    @Inject(AdminWriterService) private readonly writer: AdminWriterService,
    @Inject(PrismaService) private readonly reader: PrismaService,
  ) {}

  transaction<T>(
    callback: (transaction: AdminAuthTransactionRepository) => Promise<T>,
  ): Promise<T> {
    return this.writer.transaction(async (transaction) =>
      callback(new AdminAuthTransactionRepository(transaction)),
    );
  }

  async recordFailure(
    failure: Readonly<{
      auditAction?: string;
      auditContext?: AdminFailureAuditContext;
      code: string;
    }>,
    requestId: string,
  ): Promise<void> {
    const now = new Date();
    await this.transaction(async (transaction) => {
      if (failure.auditContext !== undefined) {
        await transaction.insertAudit({
          ...failure.auditContext,
          createdAt: now,
          id: randomUUID(),
          requestId,
        });
        return;
      }
      await transaction.insertSecurityEvent({
        action: failure.auditAction ?? 'ADMIN_AUTH_REQUEST_REJECTED',
        createdAt: now,
        failureCode: failure.code,
        id: randomUUID(),
        outcome: 'FAILED',
        requestId,
      });
    });
  }

  async listSessions(adminUserId: string): Promise<
    readonly {
      absoluteExpiresAt: Date;
      createdAt: Date;
      expiresAt: Date;
      id: string;
      lastActivityAt: Date;
      revokedAt: Date | null;
    }[]
  > {
    const sessions = await this.reader.adminSession.findMany({
      orderBy: [{ lastActivityAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: {
        absoluteExpiresAt: true,
        createdAt: true,
        expiresAt: true,
        id: true,
        lastActivityAt: true,
        revokedAt: true,
      },
      take: 50,
      where: { adminUserId },
    });
    return sessions.flatMap((session) =>
      session.absoluteExpiresAt === null
        ? []
        : [{ ...session, absoluteExpiresAt: session.absoluteExpiresAt }],
    );
  }
}
