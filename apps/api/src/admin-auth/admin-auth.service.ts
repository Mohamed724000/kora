import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { AdminWriterCommitUnknownError } from '../database/admin-writer.service';
import {
  AdminAuthRepository,
  type AdminAuthTransactionRepository,
  type AdminEnrollmentRecord,
  type AdminFailureAuditContext,
  type AdminPreAuthRecord,
  type AdminRecoveryContextRecord,
  type AdminStepUpPurpose,
  type AdminUserRecord,
  type NewRecoveryCodeInput,
} from './admin-auth.repository';
import { ADMIN_AUTH_CRYPTO, AdminAuthCryptoError } from './admin-auth.crypto';
import type { AdminAuthCrypto } from './admin-auth.crypto';
import {
  ADMIN_KEY_PROVIDER,
  AdminKeyProviderUnavailableError,
  type AdminKeyProvider,
} from './admin-key-provider';
import { ADMIN_RATE_LIMITER } from './admin-rate-limit.service';
import type { AdminRateLimitService } from './admin-rate-limit.service';
import {
  ADMIN_REQUEST_POLICY,
  type AdminBrowserContext,
  type AdminRequestPolicy,
} from './admin-request-policy';
import {
  AdminC1HttpError,
  AdminSessionService,
  type AdminPrincipal,
  type SessionDelivery,
} from './admin-session.service';

const CONTEXT_MILLISECONDS = 10 * 60 * 1000;
const IDEMPOTENCY_MILLISECONDS = 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IDEMPOTENCY_PATTERN = /^[\x21-\x7e]{16,128}$/u;
const STEP_UP_PURPOSES = new Set<AdminStepUpPurpose>([
  'SESSION_REVOCATION',
  'RECOVERY_APPROVAL',
  'AUDIT_EXPORT',
  'INVITATION',
  'ROLE_CHANGE',
  'STATUS_CHANGE',
]);

export interface AdminRequestExecutionContext {
  ipAddress: string;
  requestId: string;
}

export interface AdminLoginInput {
  email: string;
  password: string;
}
export interface AdminTotpInput {
  code: string;
}
export interface AdminRecoveryInput {
  selector: string;
  verifier: string;
}
export interface AdminStepUpInput {
  purpose: AdminStepUpPurpose;
  totpCode: string;
}

export interface AdminPreAuthDelivery {
  challengeId: string;
  csrfToken: string;
  expiresAt: string;
  nextStep: 'TOTP_VERIFY' | 'FIRST_TOTP_ENROLLMENT';
  preAuthToken: string;
}

export interface AdminEnrollmentDelivery {
  enrollmentId: string;
  expiresAt: string;
}
export interface AdminRecoveryDelivery {
  csrfToken: string;
  expiresAt: string;
  nextStep: 'ENROLL_TOTP';
  preAuthToken: string;
  recoveryContextId: string;
}

export interface AdminRecoveryCodeDelivery {
  selector: string;
  verifier: string;
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AdminC1HttpError(400, 'VALIDATION_ERROR');
  }
  const record = value as Record<string, unknown>;
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify([...keys].sort())) {
    throw new AdminC1HttpError(400, 'VALIDATION_ERROR');
  }
  return record;
}

export function parseAdminLogin(value: unknown): AdminLoginInput {
  const record = exactRecord(value, ['email', 'password']);
  if (
    typeof record.email !== 'string' ||
    record.email.length < 3 ||
    record.email.length > 254 ||
    !EMAIL_PATTERN.test(record.email) ||
    typeof record.password !== 'string' ||
    record.password.length < 12 ||
    record.password.length > 128
  )
    throw new AdminC1HttpError(400, 'VALIDATION_ERROR');
  return { email: record.email.toLowerCase(), password: record.password };
}

export function parseAdminTotp(value: unknown): AdminTotpInput {
  const record = exactRecord(value, ['code']);
  if (typeof record.code !== 'string' || !/^\d{6}$/u.test(record.code)) {
    throw new AdminC1HttpError(400, 'VALIDATION_ERROR');
  }
  return { code: record.code };
}

export function parseAdminRecovery(value: unknown): AdminRecoveryInput {
  const record = exactRecord(value, ['selector', 'verifier']);
  if (
    typeof record.selector !== 'string' ||
    !/^[A-HJ-NP-Z2-9]{8,16}$/u.test(record.selector) ||
    typeof record.verifier !== 'string' ||
    !/^[A-HJ-NP-Z2-9]{26,32}$/u.test(record.verifier)
  )
    throw new AdminC1HttpError(400, 'VALIDATION_ERROR');
  return { selector: record.selector, verifier: record.verifier };
}

export function parseAdminStepUp(value: unknown): AdminStepUpInput {
  const record = exactRecord(value, ['purpose', 'totpCode']);
  if (
    typeof record.purpose !== 'string' ||
    !STEP_UP_PURPOSES.has(record.purpose as AdminStepUpPurpose) ||
    typeof record.totpCode !== 'string' ||
    !/^\d{6}$/u.test(record.totpCode)
  )
    throw new AdminC1HttpError(400, 'VALIDATION_ERROR');
  return { purpose: record.purpose as AdminStepUpPurpose, totpCode: record.totpCode };
}

export function assertAdminUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) throw new AdminC1HttpError(400, 'VALIDATION_ERROR');
  return value;
}

export function assertIdempotencyKey(value: string | undefined): string {
  if (value === undefined || !IDEMPOTENCY_PATTERN.test(value)) {
    throw new AdminC1HttpError(400, 'VALIDATION_ERROR');
  }
  return value;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function activeContext(
  context: AdminPreAuthRecord | AdminRecoveryContextRecord | undefined,
  user: AdminUserRecord | undefined,
  now: Date,
): boolean {
  return (
    context !== undefined &&
    user !== undefined &&
    context.adminUserId === user.id &&
    context.authorizationVersion === user.authorizationVersion &&
    context.consumedAt === null &&
    context.revokedAt === null &&
    context.expiresAt > now
  );
}

@Injectable()
export class AdminAuthService {
  constructor(
    @Inject(AdminAuthRepository) private readonly repository: AdminAuthRepository,
    @Inject(ADMIN_AUTH_CRYPTO) private readonly crypto: AdminAuthCrypto,
    @Inject(ADMIN_KEY_PROVIDER) private readonly keyProvider: AdminKeyProvider,
    @Inject(ADMIN_RATE_LIMITER) private readonly rateLimiter: AdminRateLimitService,
    @Inject(AdminSessionService) private readonly sessions: AdminSessionService,
    @Inject(ADMIN_REQUEST_POLICY) private readonly policy: AdminRequestPolicy,
  ) {}

  async login(
    input: AdminLoginInput,
    context: AdminRequestExecutionContext,
    now = new Date(),
  ): Promise<AdminPreAuthDelivery> {
    await this.consumeRateLimit('PASSWORD', context.ipAddress, input.email);
    await this.requireKeys();
    const token = this.crypto.randomOpaqueToken();
    const csrfToken = await this.issueCsrfToken('PREAUTH', token);
    const subjectRefHash = await this.digest('ADMIN_LOGIN_SUBJECT_V1', input.email);
    const result = await this.runTransaction(async (transaction) => {
      const user = await transaction.lockAdminUserByEmail(input.email);
      const passwordValid =
        user === undefined
          ? (await this.crypto.hashPassword(input.password)).length > 0 && false
          : await this.crypto.verifyPassword(user.passwordHash, input.password);
      const established = user?.totpSecretEncrypted !== null && user?.totpEnabledAt !== null;
      const eligible =
        user !== undefined &&
        passwordValid &&
        ((user.status === 'ACTIVE' && established) ||
          (user.status === 'PENDING_MFA' && (established || !established)));
      if (!eligible || user === undefined) {
        await transaction.insertSecurityEvent({
          action: 'ADMIN_LOGIN',
          ...(user === undefined ? {} : { adminUserId: user.id }),
          createdAt: now,
          failureCode: 'AUTH_INVALID_CREDENTIALS',
          id: randomUUID(),
          outcome: 'FAILED',
          requestId: context.requestId,
          subjectRefHash,
        });
        return { rejected: true as const };
      }
      const purpose: 'TOTP_VERIFY' | 'FIRST_TOTP_ENROLLMENT' = established
        ? 'TOTP_VERIFY'
        : 'FIRST_TOTP_ENROLLMENT';
      const expiresAt = new Date(now.getTime() + CONTEXT_MILLISECONDS);
      const challengeId = randomUUID();
      await transaction.insertPreAuth({
        adminUserId: user.id,
        authorizationVersion: user.authorizationVersion,
        createdAt: now,
        expiresAt,
        id: challengeId,
        purpose,
        tokenHash: sha256(token),
      });
      await transaction.insertSecurityEvent({
        action: 'ADMIN_LOGIN',
        adminUserId: user.id,
        createdAt: now,
        id: randomUUID(),
        outcome: 'SUCCEEDED',
        requestId: context.requestId,
        subjectRefHash,
      });
      return { challengeId, expiresAt, purpose, rejected: false as const };
    });
    if (result.rejected)
      throw new AdminC1HttpError(401, 'AUTH_INVALID_CREDENTIALS', { auditRecorded: true });
    return {
      challengeId: result.challengeId,
      csrfToken,
      expiresAt: result.expiresAt.toISOString(),
      nextStep: result.purpose,
      preAuthToken: token,
    };
  }

  async createEnrollment(
    contextToken: string,
    idempotencyKey: string,
    requestId: string,
    now = new Date(),
  ): Promise<AdminEnrollmentDelivery> {
    await this.requireKeys();
    const tokenHash = sha256(contextToken);
    return this.runTransaction(async (transaction) => {
      const resolved = await this.resolveContext(transaction, tokenHash, now, false);
      const fingerprint = await this.digest(
        'ADMIN_IDEMPOTENCY_CREATE_ENROLLMENT_V1',
        `${resolved.user.id}\0${contextToken}`,
      );
      const existing = await transaction.findIdempotency(
        resolved.user.id,
        'createAdminTotpEnrollment',
        idempotencyKey,
      );
      if (existing !== undefined) {
        if (existing.requestHash !== fingerprint)
          throw new AdminC1HttpError(
            409,
            'IDEMPOTENCY_CONFLICT',
            this.contextFailureOptions(
              resolved,
              'ADMIN_TOTP_ENROLLMENT_CREATE_REJECTED',
              resolved.context.id,
            ),
          );
        const enrollment = await transaction.lockEnrollment(existing.resourceId);
        if (enrollment === undefined)
          throw new AdminC1HttpError(
            409,
            'IDEMPOTENCY_CONFLICT',
            this.contextFailureOptions(
              resolved,
              'ADMIN_TOTP_ENROLLMENT_CREATE_REJECTED',
              existing.resourceId,
            ),
          );
        return { enrollmentId: enrollment.id, expiresAt: enrollment.expiresAt.toISOString() };
      }
      if (
        (resolved.kind === 'PREAUTH' &&
          (resolved.context.purpose !== 'FIRST_TOTP_ENROLLMENT' ||
            resolved.user.totpEnabledAt !== null ||
            resolved.user.status !== 'PENDING_MFA')) ||
        (resolved.kind === 'RECOVERY' && resolved.user.status !== 'PENDING_MFA')
      )
        throw new AdminC1HttpError(
          403,
          'FORBIDDEN',
          this.contextFailureOptions(
            resolved,
            'ADMIN_TOTP_ENROLLMENT_CREATE_REJECTED',
            resolved.context.id,
          ),
        );
      const secret = this.crypto.randomTotpSecret();
      let encrypted: string;
      try {
        encrypted = await this.crypto.encryptTotpSecret(secret, resolved.user.id);
      } finally {
        secret.fill(0);
      }
      const enrollmentId = randomUUID();
      const expiresAt = new Date(now.getTime() + CONTEXT_MILLISECONDS);
      await transaction.insertEnrollment({
        ...(resolved.kind === 'PREAUTH'
          ? { adminPreAuthContextId: resolved.context.id }
          : { adminRecoveryContextId: resolved.context.id }),
        adminUserId: resolved.user.id,
        authorizationVersion: resolved.user.authorizationVersion,
        createdAt: now,
        expiresAt,
        id: enrollmentId,
        secretEncrypted: encrypted,
      });
      await transaction.insertIdempotency({
        adminUserId: resolved.user.id,
        createdAt: now,
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_MILLISECONDS),
        id: randomUUID(),
        idempotencyKey,
        operation: 'createAdminTotpEnrollment',
        requestHash: fingerprint,
        resourceId: enrollmentId,
        resourceType: 'AdminTotpEnrollment',
        responseCode: 201,
      });
      await this.recordContextAudit(
        transaction,
        resolved,
        'ADMIN_TOTP_ENROLLMENT_CREATED',
        enrollmentId,
        requestId,
        now,
      );
      return { enrollmentId, expiresAt: expiresAt.toISOString() };
    });
  }

  async deliverQr(
    contextToken: string,
    enrollmentId: string,
    idempotencyKey: string,
    requestId: string,
    now = new Date(),
  ): Promise<Buffer> {
    await this.requireKeys();
    return this.runTransaction(async (transaction) => {
      const resolved = await this.resolveContext(transaction, sha256(contextToken), now, false);
      const enrollment = await transaction.lockEnrollment(enrollmentId);
      this.assertEnrollment(
        enrollment,
        resolved.user,
        resolved,
        now,
        'ADMIN_TOTP_QR_DELIVERY_REJECTED',
      );
      const existing = await transaction.findIdempotency(
        resolved.user.id,
        'deliverAdminTotpEnrollmentQr',
        idempotencyKey,
      );
      if (existing !== undefined || enrollment!.qrDeliveredAt !== null) {
        throw new AdminC1HttpError(
          409,
          'SENSITIVE_RESPONSE_ALREADY_DELIVERED',
          this.contextFailureOptions(resolved, 'ADMIN_TOTP_QR_DELIVERY_REJECTED', enrollmentId),
        );
      }
      const decrypted = await this.crypto.decryptTotpSecret(
        enrollment!.secretEncrypted,
        resolved.user.id,
      );
      let png: Buffer;
      try {
        png = await this.crypto.createTotpQrPng(decrypted.secret, resolved.user.email);
      } finally {
        decrypted.secret.fill(0);
      }
      await transaction.markQrDelivered(enrollment!.id, now);
      await transaction.insertIdempotency({
        adminUserId: resolved.user.id,
        createdAt: now,
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_MILLISECONDS),
        id: randomUUID(),
        idempotencyKey,
        operation: 'deliverAdminTotpEnrollmentQr',
        requestHash: await this.digest(
          'ADMIN_IDEMPOTENCY_QR_V1',
          `${enrollmentId}\0${contextToken}`,
        ),
        resourceId: enrollmentId,
        resourceType: 'AdminTotpEnrollment',
        responseCode: 200,
      });
      await this.recordContextAudit(
        transaction,
        resolved,
        'ADMIN_TOTP_QR_DELIVERED',
        enrollmentId,
        requestId,
        now,
      );
      return png;
    });
  }

  async confirmEnrollment(
    contextToken: string,
    enrollmentId: string,
    code: string,
    idempotencyKey: string,
    execution: AdminRequestExecutionContext,
    now = new Date(),
  ): Promise<{ codes: readonly AdminRecoveryCodeDelivery[]; session: SessionDelivery }> {
    await this.consumeRateLimit('TOTP', execution.ipAddress, contextToken);
    await this.requireKeys();
    const result = await this.runTransaction(async (transaction) => {
      const resolved = await this.resolveContext(transaction, sha256(contextToken), now);
      const enrollment = await transaction.lockEnrollment(enrollmentId);
      this.assertEnrollment(
        enrollment,
        resolved.user,
        resolved,
        now,
        'ADMIN_TOTP_ENROLLMENT_CONFIRM_REJECTED',
      );
      if (enrollment!.qrDeliveredAt === null)
        throw new AdminC1HttpError(
          403,
          'FORBIDDEN',
          this.contextFailureOptions(
            resolved,
            'ADMIN_TOTP_ENROLLMENT_CONFIRM_REJECTED',
            enrollmentId,
          ),
        );
      const existing = await transaction.findIdempotency(
        resolved.user.id,
        'confirmAdminTotpEnrollment',
        idempotencyKey,
      );
      if (existing !== undefined)
        throw new AdminC1HttpError(
          409,
          'IDEMPOTENCY_CONFLICT',
          this.contextFailureOptions(
            resolved,
            'ADMIN_TOTP_ENROLLMENT_CONFIRM_REJECTED',
            enrollmentId,
          ),
        );
      const decrypted = await this.crypto.decryptTotpSecret(
        enrollment!.secretEncrypted,
        resolved.user.id,
      );
      let activeEncryptedSecret = enrollment!.secretEncrypted;
      let counter: bigint | undefined;
      try {
        counter = this.crypto.verifyTotp(
          decrypted.secret,
          code,
          Math.floor(now.getTime() / 1000),
          resolved.user.lastAcceptedTotpCounter,
        );
        if (counter !== undefined && decrypted.needsRewrap) {
          activeEncryptedSecret = await this.crypto.encryptTotpSecret(
            decrypted.secret,
            resolved.user.id,
          );
        }
      } finally {
        decrypted.secret.fill(0);
      }
      if (counter === undefined) {
        if (resolved.kind === 'RECOVERY') {
          await transaction.insertAudit({
            action: 'ADMIN_TOTP_ENROLLMENT_CONFIRM_REJECTED',
            actorAdminUserId: resolved.user.id,
            adminRecoveryContextId: resolved.context.id,
            createdAt: now,
            entityId: enrollmentId,
            entityType: 'AdminTotpEnrollment',
            id: randomUUID(),
            reasonCode: 'ACCOUNT_RECOVERY',
            requestId: execution.requestId,
            subjectAdminUserId: resolved.user.id,
          });
        } else {
          await transaction.insertSecurityEvent({
            action: 'ADMIN_TOTP_ENROLLMENT_CONFIRM',
            adminUserId: resolved.user.id,
            createdAt: now,
            failureCode: 'OTP_INVALID',
            id: randomUUID(),
            outcome: 'FAILED',
            requestId: execution.requestId,
          });
        }
        return { rejected: true as const };
      }
      const nextVersion = resolved.user.authorizationVersion + 1;
      await transaction.updateTotpFactor({
        adminUserId: resolved.user.id,
        authorizationVersion: nextVersion,
        counter,
        encryptedSecret: activeEncryptedSecret,
        status: 'ACTIVE',
        verifiedAt: now,
      });
      if (resolved.kind === 'PREAUTH') await transaction.consumePreAuth(resolved.context.id, now);
      else await transaction.consumeRecoveryContext(resolved.context.id, now);
      await transaction.markEnrollmentConfirmed(enrollment!.id, now);
      const codes = this.crypto.generateRecoveryCodes();
      const stored: NewRecoveryCodeInput[] = [];
      for (const recoveryCode of codes) {
        stored.push({
          codeHash: await this.crypto.hashRecoveryCode(recoveryCode),
          id: randomUUID(),
          selector: recoveryCode.selector,
        });
      }
      await transaction.replaceRecoveryCodes({
        adminUserId: resolved.user.id,
        batchId: randomUUID(),
        codes: stored,
        createdAt: now,
      });
      const activeUser = {
        ...resolved.user,
        authorizationVersion: nextVersion,
        status: 'ACTIVE' as const,
      };
      const prepared = await this.sessions.prepareSession(activeUser, now);
      await this.sessions.commitPreparedSession(transaction, prepared);
      await transaction.insertIdempotency({
        adminUserId: resolved.user.id,
        createdAt: now,
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_MILLISECONDS),
        id: randomUUID(),
        idempotencyKey,
        operation: 'confirmAdminTotpEnrollment',
        requestHash: await this.digest(
          'ADMIN_IDEMPOTENCY_CONFIRM_V1',
          `${enrollmentId}\0${code}\0${contextToken}`,
        ),
        resourceId: enrollmentId,
        resourceType: 'AdminTotpEnrollment',
        responseCode: 200,
      });
      await transaction.insertAudit({
        action: 'ADMIN_TOTP_ENROLLMENT_CONFIRMED',
        actorAdminUserId: resolved.user.id,
        adminSessionId: prepared.sessionId,
        createdAt: now,
        entityId: enrollmentId,
        entityType: 'AdminTotpEnrollment',
        id: randomUUID(),
        reasonCode: 'SECURITY_RESPONSE',
        requestId: execution.requestId,
        subjectAdminUserId: resolved.user.id,
      });
      return {
        rejected: false as const,
        value: { codes, session: this.sessions.delivery(prepared) },
      };
    });
    if (result.rejected) throw new AdminC1HttpError(401, 'OTP_INVALID', { auditRecorded: true });
    return result.value;
  }

  async verifyTotp(
    contextToken: string,
    code: string,
    execution: AdminRequestExecutionContext,
    now = new Date(),
  ): Promise<SessionDelivery> {
    await this.consumeRateLimit('TOTP', execution.ipAddress, contextToken);
    await this.requireKeys();
    const result = await this.runTransaction(async (transaction) => {
      const candidate = await transaction.findPreAuthByHash(sha256(contextToken));
      const user =
        candidate === undefined
          ? undefined
          : await transaction.lockAdminUser(candidate.adminUserId);
      const preauth =
        user === undefined ? undefined : await transaction.lockPreAuthByHash(sha256(contextToken));
      if (
        !activeContext(preauth, user, now) ||
        preauth!.purpose !== 'TOTP_VERIFY' ||
        user!.status !== 'ACTIVE' ||
        user!.totpSecretEncrypted === null
      ) {
        throw new AdminC1HttpError(
          preauth !== undefined && preauth.expiresAt <= now ? 410 : 401,
          preauth !== undefined && preauth.expiresAt <= now ? 'OTP_EXPIRED' : 'AUTH_REQUIRED',
        );
      }
      const decrypted = await this.crypto.decryptTotpSecret(user!.totpSecretEncrypted, user!.id);
      let counter: bigint | undefined;
      let rewrappedSecret: string | undefined;
      try {
        counter = this.crypto.verifyTotp(
          decrypted.secret,
          code,
          Math.floor(now.getTime() / 1000),
          user!.lastAcceptedTotpCounter,
        );
        if (counter !== undefined && decrypted.needsRewrap) {
          rewrappedSecret = await this.crypto.encryptTotpSecret(decrypted.secret, user!.id);
        }
      } finally {
        decrypted.secret.fill(0);
      }
      if (counter === undefined) {
        await transaction.insertSecurityEvent({
          action: 'ADMIN_TOTP_VERIFY',
          adminUserId: user!.id,
          createdAt: now,
          failureCode: 'OTP_INVALID',
          id: randomUUID(),
          outcome: 'FAILED',
          requestId: execution.requestId,
        });
        return { rejected: true as const };
      }
      await transaction.updateTotpCounter(user!.id, counter, rewrappedSecret);
      await transaction.consumePreAuth(preauth!.id, now);
      const prepared = await this.sessions.prepareSession(user!, now);
      await this.sessions.commitPreparedSession(transaction, prepared);
      await transaction.insertAudit({
        action: 'ADMIN_TOTP_VERIFIED',
        actorAdminUserId: user!.id,
        adminSessionId: prepared.sessionId,
        createdAt: now,
        entityId: prepared.sessionId,
        entityType: 'AdminSession',
        id: randomUUID(),
        reasonCode: 'SECURITY_RESPONSE',
        requestId: execution.requestId,
        subjectAdminUserId: user!.id,
      });
      return { delivery: this.sessions.delivery(prepared), rejected: false as const };
    }).then((result) => {
      if (result.rejected) throw new AdminC1HttpError(401, 'OTP_INVALID', { auditRecorded: true });
      return result.delivery;
    });
    return result;
  }

  async verifyRecoveryCode(
    contextToken: string,
    input: AdminRecoveryInput,
    execution: AdminRequestExecutionContext,
    now = new Date(),
  ): Promise<AdminRecoveryDelivery> {
    await this.consumeRateLimit('RECOVERY', execution.ipAddress, contextToken);
    await this.requireKeys();
    const recoveryToken = this.crypto.randomOpaqueToken();
    const csrfToken = await this.issueCsrfToken('PREAUTH', recoveryToken);
    const result = await this.runTransaction(async (transaction) => {
      const candidate = await transaction.findPreAuthByHash(sha256(contextToken));
      const user =
        candidate === undefined
          ? undefined
          : await transaction.lockAdminUser(candidate.adminUserId);
      const preauth =
        user === undefined ? undefined : await transaction.lockPreAuthByHash(sha256(contextToken));
      const recoveryCode = await transaction.lockRecoveryCode(input.selector);
      const valid =
        activeContext(preauth, user, now) &&
        preauth!.purpose === 'TOTP_VERIFY' &&
        recoveryCode !== undefined &&
        recoveryCode.adminUserId === user!.id &&
        recoveryCode.usedAt === null &&
        (await this.crypto.verifyRecoveryCode(recoveryCode.codeHash, input));
      if (!valid || user === undefined || recoveryCode === undefined || preauth === undefined) {
        await transaction.insertSecurityEvent({
          action: 'ADMIN_RECOVERY_CODE_VERIFY',
          createdAt: now,
          failureCode: 'ADMIN_RECOVERY_CODE_INVALID',
          id: randomUUID(),
          outcome: 'FAILED',
          requestId: execution.requestId,
        });
        return { rejected: true as const };
      }
      const nextVersion = user.authorizationVersion + 1;
      const recoveryContextId = randomUUID();
      const expiresAt = new Date(now.getTime() + CONTEXT_MILLISECONDS);
      await transaction.consumeRecoveryCode(recoveryCode.id, now);
      await transaction.consumePreAuth(preauth.id, now);
      await transaction.revokeAllSessions(user.id, now);
      await transaction.beginRecovery({
        adminUserId: user.id,
        authorizationVersion: nextVersion,
        createdAt: now,
        expiresAt,
        id: recoveryContextId,
        recoveryCodeId: recoveryCode.id,
        tokenHash: sha256(recoveryToken),
      });
      await transaction.insertAudit({
        action: 'ADMIN_RECOVERY_CODE_CONSUMED',
        actorAdminUserId: user.id,
        adminRecoveryContextId: recoveryContextId,
        createdAt: now,
        entityId: recoveryCode.id,
        entityType: 'AdminRecoveryCode',
        id: randomUUID(),
        reasonCode: 'ACCOUNT_RECOVERY',
        requestId: execution.requestId,
        subjectAdminUserId: user.id,
      });
      return { expiresAt, recoveryContextId, rejected: false as const };
    });
    if (result.rejected)
      throw new AdminC1HttpError(401, 'ADMIN_RECOVERY_CODE_INVALID', {
        auditRecorded: true,
      });
    return {
      csrfToken,
      expiresAt: result.expiresAt.toISOString(),
      nextStep: 'ENROLL_TOTP',
      preAuthToken: recoveryToken,
      recoveryContextId: result.recoveryContextId,
    };
  }

  async rotateRecoveryCodes(
    principal: AdminPrincipal,
    code: string,
    idempotencyKey: string,
    execution: AdminRequestExecutionContext,
    now = new Date(),
  ): Promise<readonly AdminRecoveryCodeDelivery[]> {
    try {
      await this.consumeRateLimit('TOTP', execution.ipAddress, principal.adminUserId);
    } catch (error: unknown) {
      if (error instanceof AdminC1HttpError)
        throw this.withSessionAudit(error, principal, 'ADMIN_RECOVERY_CODES_ROTATION_REJECTED');
      throw error;
    }
    await this.requireKeys();
    const result = await this.runTransaction(async (transaction) => {
      const { session, user } = await this.sessions.lockPrincipal(transaction, principal, now);
      const existing = await transaction.findIdempotency(
        user.id,
        'rotateAdminRecoveryCodes',
        idempotencyKey,
      );
      if (existing !== undefined)
        throw new AdminC1HttpError(409, 'IDEMPOTENCY_CONFLICT', {
          auditContext: this.sessionAuditContext(
            principal,
            'ADMIN_RECOVERY_CODES_ROTATION_REJECTED',
          ),
        });
      if (user.totpSecretEncrypted === null)
        throw new AdminC1HttpError(403, 'FORBIDDEN', {
          auditContext: this.sessionAuditContext(
            principal,
            'ADMIN_RECOVERY_CODES_ROTATION_REJECTED',
          ),
        });
      const decrypted = await this.crypto.decryptTotpSecret(user.totpSecretEncrypted, user.id);
      let counter: bigint | undefined;
      let rewrappedSecret: string | undefined;
      try {
        counter = this.crypto.verifyTotp(
          decrypted.secret,
          code,
          Math.floor(now.getTime() / 1000),
          user.lastAcceptedTotpCounter,
        );
        if (counter !== undefined && decrypted.needsRewrap) {
          rewrappedSecret = await this.crypto.encryptTotpSecret(decrypted.secret, user.id);
        }
      } finally {
        decrypted.secret.fill(0);
      }
      if (counter === undefined) {
        await transaction.insertAudit({
          action: 'ADMIN_RECOVERY_CODES_ROTATION_REJECTED',
          actorAdminUserId: user.id,
          adminSessionId: session.id,
          createdAt: now,
          entityId: user.id,
          entityType: 'AdminRecoveryCodeBatch',
          id: randomUUID(),
          reasonCode: 'SECURITY_RESPONSE',
          requestId: execution.requestId,
          subjectAdminUserId: user.id,
        });
        return { rejected: true as const };
      }
      const codes = this.crypto.generateRecoveryCodes();
      const stored: NewRecoveryCodeInput[] = [];
      for (const material of codes)
        stored.push({
          codeHash: await this.crypto.hashRecoveryCode(material),
          id: randomUUID(),
          selector: material.selector,
        });
      await transaction.updateTotpCounter(user.id, counter, rewrappedSecret);
      await transaction.replaceRecoveryCodes({
        adminUserId: user.id,
        batchId: randomUUID(),
        codes: stored,
        createdAt: now,
      });
      await transaction.insertIdempotency({
        adminUserId: user.id,
        createdAt: now,
        expiresAt: new Date(now.getTime() + IDEMPOTENCY_MILLISECONDS),
        id: randomUUID(),
        idempotencyKey,
        operation: 'rotateAdminRecoveryCodes',
        requestHash: await this.digest('ADMIN_IDEMPOTENCY_ROTATE_V1', `${user.id}\0${code}`),
        resourceId: randomUUID(),
        resourceType: 'AdminRecoveryCodeBatch',
        responseCode: 200,
      });
      await transaction.insertAudit({
        action: 'ADMIN_RECOVERY_CODES_ROTATED',
        actorAdminUserId: user.id,
        adminSessionId: session.id,
        createdAt: now,
        entityId: user.id,
        entityType: 'AdminRecoveryCodeBatch',
        id: randomUUID(),
        reasonCode: 'SECURITY_RESPONSE',
        requestId: execution.requestId,
        subjectAdminUserId: user.id,
      });
      return { codes, rejected: false as const };
    });
    if (result.rejected) throw new AdminC1HttpError(401, 'OTP_INVALID', { auditRecorded: true });
    return result.codes;
  }

  async stepUp(
    principal: AdminPrincipal,
    input: AdminStepUpInput,
    execution: AdminRequestExecutionContext,
    now = new Date(),
  ): Promise<{ expiresAt: string; verifiedAt: string }> {
    try {
      await this.consumeRateLimit('TOTP', execution.ipAddress, principal.adminUserId);
    } catch (error: unknown) {
      if (error instanceof AdminC1HttpError)
        throw this.withSessionAudit(error, principal, 'ADMIN_SESSION_STEP_UP_REJECTED');
      throw error;
    }
    await this.requireKeys();
    const result = await this.runTransaction(async (transaction) => {
      const { session, user } = await this.sessions.lockPrincipal(transaction, principal, now);
      if (user.totpSecretEncrypted === null)
        throw new AdminC1HttpError(403, 'FORBIDDEN', {
          auditContext: this.sessionAuditContext(principal, 'ADMIN_SESSION_STEP_UP_REJECTED'),
        });
      const decrypted = await this.crypto.decryptTotpSecret(user.totpSecretEncrypted, user.id);
      let counter: bigint | undefined;
      let rewrappedSecret: string | undefined;
      try {
        counter = this.crypto.verifyTotp(
          decrypted.secret,
          input.totpCode,
          Math.floor(now.getTime() / 1000),
          user.lastAcceptedTotpCounter,
        );
        if (counter !== undefined && decrypted.needsRewrap) {
          rewrappedSecret = await this.crypto.encryptTotpSecret(decrypted.secret, user.id);
        }
      } finally {
        decrypted.secret.fill(0);
      }
      if (counter === undefined) {
        await transaction.insertAudit({
          action: 'ADMIN_SESSION_STEP_UP_REJECTED',
          actorAdminUserId: user.id,
          adminSessionId: session.id,
          createdAt: now,
          entityId: session.id,
          entityType: 'AdminSession',
          id: randomUUID(),
          reasonCode: 'SECURITY_RESPONSE',
          requestId: execution.requestId,
          subjectAdminUserId: user.id,
        });
        return { rejected: true as const };
      }
      await transaction.updateTotpCounter(user.id, counter, rewrappedSecret);
      const expiresAt = await this.sessions.establishStepUp(
        transaction,
        session.id,
        input.purpose,
        now,
      );
      await transaction.insertAudit({
        action: 'ADMIN_SESSION_STEP_UP',
        actorAdminUserId: user.id,
        adminSessionId: session.id,
        createdAt: now,
        entityId: session.id,
        entityType: 'AdminSession',
        id: randomUUID(),
        reasonCode: 'SECURITY_RESPONSE',
        requestId: execution.requestId,
        subjectAdminUserId: user.id,
      });
      return {
        rejected: false as const,
        value: { expiresAt: expiresAt.toISOString(), verifiedAt: now.toISOString() },
      };
    });
    if (result.rejected) throw new AdminC1HttpError(401, 'OTP_INVALID', { auditRecorded: true });
    return result.value;
  }

  private async resolveContext(
    transaction: AdminAuthTransactionRepository,
    tokenHash: string,
    now: Date,
    expiredIsOtp = true,
  ): Promise<
    | { context: AdminPreAuthRecord; kind: 'PREAUTH'; user: AdminUserRecord }
    | { context: AdminRecoveryContextRecord; kind: 'RECOVERY'; user: AdminUserRecord }
  > {
    const preauthCandidate = await transaction.findPreAuthByHash(tokenHash);
    if (preauthCandidate !== undefined) {
      const user = await transaction.lockAdminUser(preauthCandidate.adminUserId);
      const preauth = await transaction.lockPreAuthByHash(tokenHash);
      if (!activeContext(preauth, user, now)) {
        throw new AdminC1HttpError(
          expiredIsOtp && preauth !== undefined && preauth.expiresAt <= now ? 410 : 401,
          expiredIsOtp && preauth !== undefined && preauth.expiresAt <= now
            ? 'OTP_EXPIRED'
            : 'AUTH_REQUIRED',
        );
      }
      return { context: preauth!, kind: 'PREAUTH', user: user! };
    }
    const recoveryCandidate = await transaction.findRecoveryContextByHash(tokenHash);
    const user =
      recoveryCandidate === undefined
        ? undefined
        : await transaction.lockAdminUser(recoveryCandidate.adminUserId);
    const recovery =
      user === undefined ? undefined : await transaction.lockRecoveryContextByHash(tokenHash);
    if (!activeContext(recovery, user, now)) throw new AdminC1HttpError(401, 'AUTH_REQUIRED');
    return { context: recovery!, kind: 'RECOVERY', user: user! };
  }

  private assertEnrollment(
    enrollment: AdminEnrollmentRecord | undefined,
    user: AdminUserRecord,
    resolved: {
      context: AdminPreAuthRecord | AdminRecoveryContextRecord;
      kind: 'PREAUTH' | 'RECOVERY';
    },
    now: Date,
    failureAction: string,
  ): void {
    const bound =
      resolved.kind === 'PREAUTH'
        ? enrollment?.adminPreAuthContextId === resolved.context.id
        : enrollment?.adminRecoveryContextId === resolved.context.id;
    if (
      enrollment === undefined ||
      !bound ||
      enrollment.adminUserId !== user.id ||
      enrollment.authorizationVersion !== user.authorizationVersion ||
      enrollment.expiresAt <= now ||
      enrollment.confirmedAt !== null ||
      enrollment.revokedAt !== null
    ) {
      throw new AdminC1HttpError(
        403,
        'FORBIDDEN',
        this.contextFailureOptions(
          { ...resolved, user },
          failureAction,
          enrollment?.id ?? resolved.context.id,
        ),
      );
    }
  }

  private contextFailureOptions(
    resolved: {
      context: AdminPreAuthRecord | AdminRecoveryContextRecord;
      kind: 'PREAUTH' | 'RECOVERY';
      user: AdminUserRecord;
    },
    action: string,
    entityId: string,
  ): { auditAction?: string; auditContext?: AdminFailureAuditContext } {
    if (resolved.kind === 'PREAUTH') return { auditAction: action };
    return {
      auditContext: {
        action,
        actorAdminUserId: resolved.user.id,
        adminRecoveryContextId: resolved.context.id,
        entityId,
        entityType: 'AdminTotpEnrollment',
        reasonCode: 'ACCOUNT_RECOVERY',
        subjectAdminUserId: resolved.user.id,
      },
    };
  }

  private async recordContextAudit(
    transaction: AdminAuthTransactionRepository,
    resolved: {
      context: AdminPreAuthRecord | AdminRecoveryContextRecord;
      kind: 'PREAUTH' | 'RECOVERY';
      user: AdminUserRecord;
    },
    action: string,
    entityId: string,
    requestId: string,
    now: Date,
  ): Promise<void> {
    if (resolved.kind === 'RECOVERY') {
      await transaction.insertAudit({
        action,
        actorAdminUserId: resolved.user.id,
        adminRecoveryContextId: resolved.context.id,
        createdAt: now,
        entityId,
        entityType: 'AdminTotpEnrollment',
        id: randomUUID(),
        reasonCode: 'ACCOUNT_RECOVERY',
        requestId,
        subjectAdminUserId: resolved.user.id,
      });
    } else {
      await transaction.insertSecurityEvent({
        action,
        adminUserId: resolved.user.id,
        createdAt: now,
        id: randomUUID(),
        outcome: 'SUCCEEDED',
        requestId,
      });
    }
  }

  private async consumeRateLimit(
    profile: 'PASSWORD' | 'RECOVERY' | 'TOTP',
    ipAddress: string,
    subject: string,
  ): Promise<void> {
    try {
      const decision = await this.rateLimiter.consume(profile, ipAddress, subject);
      if (!decision.allowed)
        throw new AdminC1HttpError(429, 'RATE_LIMITED', {
          details: { reason: 'RATE_LIMITED', retryAfterSeconds: decision.retryAfterSeconds },
          retryAfterSeconds: decision.retryAfterSeconds,
        });
    } catch (error: unknown) {
      if (error instanceof AdminC1HttpError) throw error;
      throw new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE');
    }
  }

  private sessionAuditContext(principal: AdminPrincipal, action: string): AdminFailureAuditContext {
    return {
      action,
      actorAdminUserId: principal.adminUserId,
      adminSessionId: principal.sessionId,
      entityId: principal.sessionId,
      entityType: 'AdminSession',
      reasonCode: 'SECURITY_RESPONSE',
      subjectAdminUserId: principal.adminUserId,
    };
  }

  private withSessionAudit(
    error: AdminC1HttpError,
    principal: AdminPrincipal,
    action: string,
  ): AdminC1HttpError {
    return new AdminC1HttpError(error.status, error.code, {
      auditContext: this.sessionAuditContext(principal, action),
      details: error.details,
      ...(error.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds }),
    });
  }

  private async requireKeys(): Promise<void> {
    try {
      await this.keyProvider.assertAvailable();
    } catch {
      throw new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE');
    }
  }

  private async digest(domain: string, value: string): Promise<string> {
    return Buffer.from(
      await this.keyProvider.keyedDigest(domain, Buffer.from(value, 'utf8')),
    ).toString('hex');
  }

  private async issueCsrfToken(context: AdminBrowserContext, token: string): Promise<string> {
    try {
      return await this.policy.issueCsrfToken(context, token);
    } catch {
      throw new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE');
    }
  }

  private async runTransaction<T>(
    callback: (transaction: AdminAuthTransactionRepository) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.repository.transaction(callback);
    } catch (error: unknown) {
      if (error instanceof AdminC1HttpError) throw error;
      if (
        error instanceof AdminWriterCommitUnknownError ||
        error instanceof AdminAuthCryptoError ||
        error instanceof AdminKeyProviderUnavailableError
      ) {
        throw new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE');
      }
      throw new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE');
    }
  }
}
