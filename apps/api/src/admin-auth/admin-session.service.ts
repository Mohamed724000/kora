import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { AdminWriterCommitUnknownError } from '../database/admin-writer.service';
import {
  AdminAuthRepository,
  type AdminAuthTransactionRepository,
  type AdminFailureAuditContext,
  type AdminReasonCode,
  type AdminRole,
  type AdminSessionRecord,
  type AdminStepUpPurpose,
  type AdminUserRecord,
} from './admin-auth.repository';
import { ADMIN_AUTH_CRYPTO, type VerifiedAdminAccessToken } from './admin-auth.crypto';
import type { AdminAuthCrypto } from './admin-auth.crypto';
import {
  ADMIN_KEY_PROVIDER,
  AdminKeyProviderUnavailableError,
  type AdminKeyProvider,
} from './admin-key-provider';
import { ADMIN_RATE_LIMITER } from './admin-rate-limit.service';
import type { AdminRateLimitService } from './admin-rate-limit.service';
import { ADMIN_REQUEST_POLICY, type AdminRequestPolicy } from './admin-request-policy';

const ACCESS_SECONDS = 15 * 60;
const IDLE_MILLISECONDS = 8 * 60 * 60 * 1000;
const ABSOLUTE_MILLISECONDS = 12 * 60 * 60 * 1000;
const STEP_UP_MILLISECONDS = 5 * 60 * 1000;

export type AdminC1ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'ADMIN_RECOVERY_CODE_INVALID'
  | 'AUTH_REFRESH_INVALID'
  | 'FORBIDDEN'
  | 'IDEMPOTENCY_CONFLICT'
  | 'SENSITIVE_RESPONSE_ALREADY_DELIVERED'
  | 'ADMIN_SESSION_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE';

const ERROR_MESSAGES: Readonly<Record<AdminC1ErrorCode, string>> = {
  ADMIN_RECOVERY_CODE_INVALID: 'Code de récupération invalide.',
  ADMIN_SESSION_NOT_FOUND: 'Session administrateur introuvable.',
  AUTH_INVALID_CREDENTIALS: 'Identifiants administrateur invalides.',
  AUTH_REFRESH_INVALID: 'Actualisation de session invalide.',
  AUTH_REQUIRED: 'Authentification requise.',
  FORBIDDEN: 'Accès refusé.',
  IDEMPOTENCY_CONFLICT: 'Conflit de requête idempotente.',
  OTP_EXPIRED: "Contexte d'authentification expiré.",
  OTP_INVALID: 'Code de vérification invalide.',
  RATE_LIMITED: 'Trop de requêtes.',
  SENSITIVE_RESPONSE_ALREADY_DELIVERED: 'Réponse sensible déjà livrée.',
  SERVICE_UNAVAILABLE: 'Service temporairement indisponible.',
  VALIDATION_ERROR: 'Requête invalide.',
};

export class AdminC1HttpError extends Error {
  readonly auditAction: string | undefined;
  readonly auditContext: AdminFailureAuditContext | undefined;
  readonly auditRecorded: boolean;
  readonly details: Readonly<Record<string, unknown>>;
  override readonly message: string;
  readonly retryable = false;

  constructor(
    readonly status: number,
    readonly code: AdminC1ErrorCode,
    options: {
      auditAction?: string;
      auditContext?: AdminFailureAuditContext;
      auditRecorded?: boolean;
      details?: Readonly<Record<string, unknown>>;
      retryAfterSeconds?: number;
    } = {},
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = 'AdminC1HttpError';
    this.message = ERROR_MESSAGES[code];
    this.auditAction = options.auditAction;
    this.auditContext = options.auditContext;
    this.auditRecorded = options.auditRecorded ?? false;
    this.details = options.details ?? {};
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  readonly retryAfterSeconds: number | undefined;
}

export interface AdminPrincipal {
  adminUserId: string;
  authorizationVersion: number;
  role: AdminRole;
  sessionId: string;
}

export interface PreparedAdminSession {
  absoluteExpiresAt: Date;
  accessExpiresAt: Date;
  accessToken: string;
  accessTokenJti: string;
  adminUserId: string;
  authorizationVersion: number;
  createdAt: Date;
  csrfToken: string;
  idleExpiresAt: Date;
  refreshToken: string;
  refreshTokenHash: string;
  refreshTokenId: string;
  role: AdminRole;
  sessionId: string;
  tokenFamilyId: string;
}

export interface SessionDelivery {
  accessExpiresAt: string;
  accessToken: string;
  absoluteExpiresAt: string;
  authorizationVersion: number;
  csrfToken: string;
  idleExpiresAt: string;
  refreshToken: string;
  role: AdminRole;
  sessionId: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function minimumDate(left: Date, right: Date): Date {
  return left.getTime() < right.getTime() ? left : right;
}

function bearerToken(authorization: string | undefined): string {
  if (authorization === undefined || !/^Bearer [A-Za-z0-9._-]{32,4096}$/u.test(authorization)) {
    throw new AdminC1HttpError(401, 'AUTH_REQUIRED');
  }
  return authorization.slice('Bearer '.length);
}

@Injectable()
export class AdminSessionService {
  constructor(
    @Inject(AdminAuthRepository) private readonly repository: AdminAuthRepository,
    @Inject(ADMIN_AUTH_CRYPTO) private readonly crypto: AdminAuthCrypto,
    @Inject(ADMIN_KEY_PROVIDER) private readonly keyProvider: AdminKeyProvider,
    @Inject(ADMIN_RATE_LIMITER) private readonly rateLimiter: AdminRateLimitService,
    @Inject(ADMIN_REQUEST_POLICY) private readonly policy: AdminRequestPolicy,
  ) {}

  async prepareSession(user: AdminUserRecord, now: Date): Promise<PreparedAdminSession> {
    const sessionId = randomUUID();
    const refreshToken = this.crypto.randomOpaqueToken();
    const tokenFamilyId = randomUUID();
    const csrfToken = await this.issueCsrfToken(refreshToken);
    const accessToken = await this.crypto.issueAccessToken(
      {
        adminUserId: user.id,
        authorizationVersion: user.authorizationVersion,
        role: user.role,
        sessionId,
      },
      Math.floor(now.getTime() / 1000),
      ACCESS_SECONDS,
    );
    const verified = await this.crypto.verifyAccessToken(
      accessToken,
      Math.floor(now.getTime() / 1000),
    );
    return {
      absoluteExpiresAt: new Date(now.getTime() + ABSOLUTE_MILLISECONDS),
      accessExpiresAt: new Date(verified.expiresAtSeconds * 1000),
      accessToken,
      accessTokenJti: verified.tokenId,
      adminUserId: user.id,
      authorizationVersion: user.authorizationVersion,
      createdAt: now,
      csrfToken,
      idleExpiresAt: new Date(now.getTime() + IDLE_MILLISECONDS),
      refreshToken,
      refreshTokenHash: sha256(refreshToken),
      refreshTokenId: randomUUID(),
      role: user.role,
      sessionId,
      tokenFamilyId,
    };
  }

  async commitPreparedSession(
    transaction: AdminAuthTransactionRepository,
    prepared: PreparedAdminSession,
  ): Promise<void> {
    await transaction.evictOverflowFamilies(prepared.adminUserId, prepared.createdAt);
    await transaction.createSession({
      absoluteExpiresAt: prepared.absoluteExpiresAt,
      accessTokenJti: prepared.accessTokenJti,
      adminUserId: prepared.adminUserId,
      authorizationVersion: prepared.authorizationVersion,
      createdAt: prepared.createdAt,
      expiresAt: prepared.idleExpiresAt,
      id: prepared.sessionId,
      refreshTokenHash: prepared.refreshTokenHash,
      refreshTokenId: prepared.refreshTokenId,
      tokenFamilyId: prepared.tokenFamilyId,
    });
  }

  delivery(prepared: PreparedAdminSession): SessionDelivery {
    return {
      absoluteExpiresAt: prepared.absoluteExpiresAt.toISOString(),
      accessExpiresAt: prepared.accessExpiresAt.toISOString(),
      accessToken: prepared.accessToken,
      authorizationVersion: prepared.authorizationVersion,
      csrfToken: prepared.csrfToken,
      idleExpiresAt: prepared.idleExpiresAt.toISOString(),
      refreshToken: prepared.refreshToken,
      role: prepared.role,
      sessionId: prepared.sessionId,
    };
  }

  async authenticate(
    authorization: string | undefined,
    now = new Date(),
    updateActivity = true,
  ): Promise<AdminPrincipal> {
    const token = bearerToken(authorization);
    let claims: VerifiedAdminAccessToken;
    try {
      await this.keyProvider.assertAvailable();
      claims = await this.crypto.verifyAccessToken(token, Math.floor(now.getTime() / 1000));
    } catch (error: unknown) {
      if (error instanceof AdminKeyProviderUnavailableError) {
        throw new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE');
      }
      throw new AdminC1HttpError(401, 'AUTH_REQUIRED');
    }

    return this.runTransaction(async (transaction) => {
      const user = await transaction.lockAdminUser(claims.adminUserId);
      const session = await transaction.lockSession(claims.sessionId);
      this.assertActiveBinding(user, session, claims, now);
      if (updateActivity) {
        const absolute = session!.absoluteExpiresAt!;
        await transaction.touchSession(
          session!.id,
          now,
          minimumDate(new Date(now.getTime() + IDLE_MILLISECONDS), absolute),
        );
      }
      return {
        adminUserId: user!.id,
        authorizationVersion: user!.authorizationVersion,
        role: user!.role,
        sessionId: session!.id,
      };
    });
  }

  async authenticateForSessionList(
    authorization: string | undefined,
    now = new Date(),
  ): Promise<AdminPrincipal> {
    const token = bearerToken(authorization);
    let claims: VerifiedAdminAccessToken;
    try {
      await this.keyProvider.assertAvailable();
      claims = await this.crypto.verifyAccessToken(token, Math.floor(now.getTime() / 1000));
    } catch (error: unknown) {
      if (error instanceof AdminKeyProviderUnavailableError) {
        throw new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE');
      }
      throw new AdminC1HttpError(401, 'AUTH_REQUIRED');
    }

    let bindingProven = false;
    try {
      return await this.repository.transaction(async (transaction) => {
        const user = await transaction.lockAdminUser(claims.adminUserId);
        const session = await transaction.lockSession(claims.sessionId);
        this.assertActiveBinding(user, session, claims, now);
        bindingProven = true;
        const absolute = session!.absoluteExpiresAt!;
        await transaction.touchSession(
          session!.id,
          now,
          minimumDate(new Date(now.getTime() + IDLE_MILLISECONDS), absolute),
        );
        return {
          adminUserId: user!.id,
          authorizationVersion: user!.authorizationVersion,
          role: user!.role,
          sessionId: session!.id,
        };
      });
    } catch (error: unknown) {
      if (error instanceof AdminWriterCommitUnknownError) {
        throw new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE', { auditRecorded: true });
      }
      const normalized =
        error instanceof AdminC1HttpError
          ? error
          : new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE');
      throw new AdminC1HttpError(normalized.status, normalized.code, {
        ...(bindingProven
          ? {}
          : {
              auditAction: normalized.auditAction ?? 'ADMIN_SESSION_AUTHENTICATION_REJECTED',
            }),
        auditRecorded: bindingProven,
        details: normalized.details,
        ...(normalized.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: normalized.retryAfterSeconds }),
      });
    }
  }

  async lockPrincipal(
    transaction: AdminAuthTransactionRepository,
    principal: AdminPrincipal,
    now: Date,
  ): Promise<{ session: AdminSessionRecord; user: AdminUserRecord }> {
    const user = await transaction.lockAdminUser(principal.adminUserId);
    const session = await transaction.lockSession(principal.sessionId);
    this.assertActiveBinding(
      user,
      session,
      {
        adminUserId: principal.adminUserId,
        authorizationVersion: principal.authorizationVersion,
        expiresAtSeconds: Math.floor(now.getTime() / 1000) + 1,
        issuedAtSeconds: 0,
        role: principal.role,
        sessionId: principal.sessionId,
        tokenId: session?.accessTokenJti ?? '',
      },
      now,
    );
    await transaction.touchSession(
      session!.id,
      now,
      minimumDate(new Date(now.getTime() + IDLE_MILLISECONDS), session!.absoluteExpiresAt!),
    );
    return { session: session!, user: user! };
  }

  async refresh(
    refreshToken: string,
    requestId: string,
    ipAddress: string,
    now = new Date(),
  ): Promise<SessionDelivery> {
    await this.consumeRateLimit('REFRESH', ipAddress, refreshToken);
    try {
      await this.keyProvider.assertAvailable();
    } catch {
      throw new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE');
    }
    const tokenHash = sha256(refreshToken);
    let failureContext: AdminFailureAuditContext | undefined;

    const result = await this.runTransaction(
      async (transaction) => {
        const candidate = await transaction.findRefreshTokenByHash(tokenHash);
        if (candidate === undefined) throw new AdminC1HttpError(401, 'AUTH_REFRESH_INVALID');
        const user = await transaction.lockAdminUser(candidate.adminUserId);
        const session = await transaction.lockSession(candidate.adminSessionId);
        const refresh = await transaction.lockRefreshTokenByHash(tokenHash);
        const candidateContextProven =
          user !== undefined &&
          session !== undefined &&
          session.adminUserId === user.id &&
          candidate.adminUserId === user.id &&
          candidate.adminSessionId === session.id;
        if (
          refresh === undefined ||
          refresh.id !== candidate.id ||
          refresh.adminUserId !== candidate.adminUserId ||
          refresh.adminSessionId !== candidate.adminSessionId ||
          refresh.consumedAt !== null ||
          refresh.expiresAt <= now ||
          user === undefined ||
          session === undefined ||
          user.status !== 'ACTIVE' ||
          session.revokedAt !== null ||
          session.expiresAt <= now ||
          session.absoluteExpiresAt === null ||
          session.absoluteExpiresAt <= now ||
          session.authorizationVersion !== user.authorizationVersion ||
          session.refreshTokenHash !== tokenHash
        ) {
          if (candidateContextProven) {
            failureContext = this.sessionAuditContext(
              {
                adminUserId: user.id,
                authorizationVersion: user.authorizationVersion,
                role: user.role,
                sessionId: session.id,
              },
              'ADMIN_SESSION_REFRESH_REJECTED',
            );
          }
          if (session !== undefined && session.revokedAt === null) {
            await transaction.revokeSession(session.id, now);
          }
          if (failureContext !== undefined) {
            await transaction.insertAudit({
              ...failureContext,
              createdAt: now,
              id: randomUUID(),
              requestId,
            });
          } else {
            await transaction.insertSecurityEvent({
              action: 'ADMIN_SESSION_REFRESH_REJECTED',
              createdAt: now,
              failureCode: 'AUTH_REFRESH_INVALID',
              id: randomUUID(),
              outcome: 'FAILED',
              requestId,
            });
          }
          return { rejected: true as const };
        }

        failureContext = this.sessionAuditContext(
          {
            adminUserId: user.id,
            authorizationVersion: user.authorizationVersion,
            role: user.role,
            sessionId: session.id,
          },
          'ADMIN_SESSION_REFRESH_REJECTED',
        );
        const newRefreshToken = this.crypto.randomOpaqueToken();
        const csrfToken = await this.issueCsrfToken(newRefreshToken);
        const accessToken = await this.crypto.issueAccessToken(
          {
            adminUserId: user.id,
            authorizationVersion: user.authorizationVersion,
            role: user.role,
            sessionId: session.id,
          },
          Math.floor(now.getTime() / 1000),
        );
        const verified = await this.crypto.verifyAccessToken(
          accessToken,
          Math.floor(now.getTime() / 1000),
        );
        const idle = minimumDate(
          new Date(now.getTime() + IDLE_MILLISECONDS),
          session.absoluteExpiresAt,
        );
        await transaction.rotateRefresh({
          accessTokenJti: verified.tokenId,
          consumedAt: now,
          expiresAt: idle,
          newTokenHash: sha256(newRefreshToken),
          newTokenId: randomUUID(),
          previous: refresh,
        });
        await transaction.insertAudit({
          action: 'ADMIN_SESSION_REFRESHED',
          actorAdminUserId: user.id,
          adminSessionId: session.id,
          createdAt: now,
          entityId: session.id,
          entityType: 'AdminSession',
          id: randomUUID(),
          reasonCode: 'SECURITY_RESPONSE',
          requestId,
          subjectAdminUserId: user.id,
        });
        return {
          delivery: {
            absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
            accessExpiresAt: new Date(verified.expiresAtSeconds * 1000).toISOString(),
            accessToken,
            authorizationVersion: user.authorizationVersion,
            csrfToken,
            idleExpiresAt: idle.toISOString(),
            refreshToken: newRefreshToken,
            role: user.role,
            sessionId: session.id,
          },
          rejected: false as const,
        };
      },
      () => failureContext,
    );
    if (result.rejected) {
      throw new AdminC1HttpError(401, 'AUTH_REFRESH_INVALID', { auditRecorded: true });
    }
    return result.delivery;
  }

  async revokeCurrent(
    principal: AdminPrincipal,
    requestId: string,
    now = new Date(),
  ): Promise<void> {
    const failureContext = this.sessionAuditContext(principal, 'ADMIN_SESSION_REVOCATION_REJECTED');
    await this.runTransaction(
      async (transaction) => {
        const { session, user } = await this.lockPrincipal(transaction, principal, now);
        await transaction.revokeSession(session.id, now);
        await transaction.insertAudit({
          action: 'ADMIN_SESSION_REVOKED',
          actorAdminUserId: user.id,
          adminSessionId: session.id,
          createdAt: now,
          entityId: session.id,
          entityType: 'AdminSession',
          id: randomUUID(),
          reasonCode: 'SECURITY_RESPONSE',
          requestId,
          subjectAdminUserId: user.id,
        });
      },
      () => failureContext,
    );
  }

  async list(
    principal: AdminPrincipal,
    now = new Date(),
  ): Promise<
    readonly {
      absoluteExpiresAt: string;
      createdAt: string;
      current: boolean;
      idleExpiresAt: string;
      lastSeenAt: string;
      sessionId: string;
    }[]
  > {
    try {
      const sessions = await this.repository.listSessions(principal.adminUserId);
      return sessions
        .filter(
          (session) =>
            session.revokedAt === null &&
            session.expiresAt > now &&
            session.absoluteExpiresAt > now,
        )
        .map((session) => ({
          absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
          createdAt: session.createdAt.toISOString(),
          current: session.id === principal.sessionId,
          idleExpiresAt: session.expiresAt.toISOString(),
          lastSeenAt: session.lastActivityAt.toISOString(),
          sessionId: session.id,
        }));
    } catch {
      throw new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE', { auditRecorded: true });
    }
  }

  async revokeOther(
    principal: AdminPrincipal,
    targetSessionId: string,
    reason: { operatorReason: string; reasonCode: AdminReasonCode },
    requestId: string,
    now = new Date(),
  ): Promise<void> {
    let failureContext: AdminFailureAuditContext = {
      action: 'ADMIN_SESSION_REVOCATION_REJECTED',
      actorAdminUserId: principal.adminUserId,
      adminSessionId: principal.sessionId,
      entityId: targetSessionId,
      entityType: 'AdminSession',
      operatorReason: reason.operatorReason,
      reasonCode: reason.reasonCode,
    };
    await this.runTransaction(
      async (transaction) => {
        const sessionCandidates = await transaction.findSessions([
          principal.sessionId,
          targetSessionId,
        ]);
        const targetCandidate = sessionCandidates.find(({ id }) => id === targetSessionId);
        const users = await transaction.lockAdminUsers([
          principal.adminUserId,
          ...(targetCandidate === undefined ? [] : [targetCandidate.adminUserId]),
        ]);
        const actor = users.find(({ id }) => id === principal.adminUserId);
        const sessions = await transaction.lockSessions([principal.sessionId, targetSessionId]);
        const actorSession = sessions.find(({ id }) => id === principal.sessionId);
        const target = sessions.find(({ id }) => id === targetSessionId);
        this.assertPrincipalBinding(actor, actorSession, principal, now);
        const targetIsKnown =
          target !== undefined &&
          targetCandidate !== undefined &&
          target.adminUserId === targetCandidate.adminUserId;
        if (targetIsKnown) {
          failureContext = { ...failureContext, subjectAdminUserId: target.adminUserId };
        }
        if (targetSessionId === principal.sessionId)
          throw new AdminC1HttpError(403, 'FORBIDDEN', { auditContext: failureContext });
        if (
          actor!.role !== 'SUPER_ADMIN' ||
          actorSession!.stepUpPurpose !== 'SESSION_REVOCATION' ||
          actorSession!.stepUpExpiresAt === null ||
          actorSession!.stepUpExpiresAt <= now
        ) {
          throw new AdminC1HttpError(403, 'FORBIDDEN', { auditContext: failureContext });
        }
        if (!targetIsKnown)
          throw new AdminC1HttpError(404, 'ADMIN_SESSION_NOT_FOUND', {
            auditContext: failureContext,
          });
        await transaction.touchSession(
          actorSession!.id,
          now,
          minimumDate(
            new Date(now.getTime() + IDLE_MILLISECONDS),
            actorSession!.absoluteExpiresAt!,
          ),
        );
        await transaction.revokeSession(target.id, now);
        await transaction.insertAudit({
          action: 'ADMIN_SESSION_REVOKED_BY_ADMIN',
          actorAdminUserId: actor!.id,
          adminSessionId: actorSession!.id,
          createdAt: now,
          entityId: target.id,
          entityType: 'AdminSession',
          id: randomUUID(),
          operatorReason: reason.operatorReason,
          reasonCode: reason.reasonCode,
          requestId,
          subjectAdminUserId: target.adminUserId,
        });
      },
      () => failureContext,
    );
  }

  private assertPrincipalBinding(
    user: AdminUserRecord | undefined,
    session: AdminSessionRecord | undefined,
    principal: AdminPrincipal,
    now: Date,
  ): void {
    this.assertActiveBinding(
      user,
      session,
      {
        adminUserId: principal.adminUserId,
        authorizationVersion: principal.authorizationVersion,
        expiresAtSeconds: Math.floor(now.getTime() / 1000) + 1,
        issuedAtSeconds: 0,
        role: principal.role,
        sessionId: principal.sessionId,
        tokenId: session?.accessTokenJti ?? '',
      },
      now,
    );
  }

  async establishStepUp(
    transaction: AdminAuthTransactionRepository,
    sessionId: string,
    purpose: AdminStepUpPurpose,
    verifiedAt: Date,
  ): Promise<Date> {
    const expiresAt = new Date(verifiedAt.getTime() + STEP_UP_MILLISECONDS);
    await transaction.setStepUp(sessionId, purpose, verifiedAt, expiresAt);
    return expiresAt;
  }

  private assertActiveBinding(
    user: AdminUserRecord | undefined,
    session: AdminSessionRecord | undefined,
    claims: VerifiedAdminAccessToken,
    now: Date,
  ): void {
    if (
      user === undefined ||
      session === undefined ||
      user.status !== 'ACTIVE' ||
      session.adminUserId !== user.id ||
      session.revokedAt !== null ||
      session.expiresAt <= now ||
      session.absoluteExpiresAt === null ||
      session.absoluteExpiresAt <= now ||
      session.authorizationVersion !== user.authorizationVersion ||
      claims.authorizationVersion !== user.authorizationVersion ||
      claims.role !== user.role ||
      session.accessTokenJti !== claims.tokenId
    ) {
      const auditContext =
        user !== undefined &&
        session !== undefined &&
        session.adminUserId === user.id &&
        claims.adminUserId === user.id &&
        claims.sessionId === session.id
          ? this.sessionAuditContext(
              {
                adminUserId: user.id,
                authorizationVersion: user.authorizationVersion,
                role: user.role,
                sessionId: session.id,
              },
              'ADMIN_SESSION_AUTHENTICATION_REJECTED',
              session.id,
            )
          : undefined;
      throw new AdminC1HttpError(401, 'AUTH_REQUIRED', {
        ...(auditContext === undefined ? {} : { auditContext }),
      });
    }
  }

  private sessionAuditContext(
    principal: AdminPrincipal,
    action: string,
    entityId = principal.sessionId,
  ): AdminFailureAuditContext {
    return {
      action,
      actorAdminUserId: principal.adminUserId,
      adminSessionId: principal.sessionId,
      entityId,
      entityType: 'AdminSession',
      reasonCode: 'SECURITY_RESPONSE',
      subjectAdminUserId: principal.adminUserId,
    };
  }

  private async consumeRateLimit(
    profile: 'REFRESH',
    ipAddress: string,
    subject: string,
  ): Promise<void> {
    try {
      const decision = await this.rateLimiter.consume(profile, ipAddress, subject);
      if (!decision.allowed) {
        throw new AdminC1HttpError(429, 'RATE_LIMITED', {
          details: { reason: 'RATE_LIMITED', retryAfterSeconds: decision.retryAfterSeconds },
          retryAfterSeconds: decision.retryAfterSeconds,
        });
      }
    } catch (error: unknown) {
      if (error instanceof AdminC1HttpError) throw error;
      throw new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE');
    }
  }

  private async issueCsrfToken(refreshToken: string): Promise<string> {
    try {
      return await this.policy.issueCsrfToken('REFRESH', refreshToken);
    } catch {
      throw new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE');
    }
  }

  private async runTransaction<T>(
    callback: (transaction: AdminAuthTransactionRepository) => Promise<T>,
    failureContext?: () => AdminFailureAuditContext | undefined,
  ): Promise<T> {
    try {
      return await this.repository.transaction(callback);
    } catch (error: unknown) {
      if (error instanceof AdminWriterCommitUnknownError) {
        throw new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE', { auditRecorded: true });
      }
      const normalized =
        error instanceof AdminC1HttpError
          ? error
          : new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE');
      const context = failureContext?.();
      if (context === undefined || normalized.auditContext !== undefined) throw normalized;
      throw new AdminC1HttpError(normalized.status, normalized.code, {
        ...(normalized.auditAction === undefined ? {} : { auditAction: normalized.auditAction }),
        auditContext: context,
        auditRecorded: normalized.auditRecorded,
        details: normalized.details,
        ...(normalized.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: normalized.retryAfterSeconds }),
      });
    }
  }
}
