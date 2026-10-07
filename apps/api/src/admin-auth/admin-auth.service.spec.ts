import type {
  AdminFailureAuditContext,
  AdminAuthRepository,
  AdminAuthTransactionRepository,
  AdminRecoveryContextRecord,
  AdminUserRecord,
} from './admin-auth.repository';
import { AdminWriterCommitUnknownError } from '../database/admin-writer.service';
import { AdminAuthCrypto } from './admin-auth.crypto';
import { TestEphemeralAdminKeyProvider } from './admin-key-provider';
import type { AdminRateLimitService } from './admin-rate-limit.service';
import { AdminRequestPolicy } from './admin-request-policy';
import { AdminC1HttpError, type AdminSessionService } from './admin-session.service';
import { parseReason } from './admin-auth.controller';
import {
  AdminAuthService,
  assertAdminUuid,
  assertIdempotencyKey,
  parseAdminLogin,
  parseAdminRecovery,
  parseAdminStepUp,
  parseAdminTotp,
} from './admin-auth.service';

describe('AdminAuthService contract validation', () => {
  it('accepts only closed login and TOTP bodies', () => {
    expect(
      parseAdminLogin({ email: 'Admin@example.test', password: 'a-secure-passphrase' }),
    ).toEqual({ email: 'admin@example.test', password: 'a-secure-passphrase' });
    expect(parseAdminTotp({ code: '123456' })).toEqual({ code: '123456' });
    expect(() =>
      parseAdminLogin({ email: 'a@example.test', password: 'a-secure-passphrase', x: 1 }),
    ).toThrow(AdminC1HttpError);
    expect(() => parseAdminTotp({ code: '12345' })).toThrow(AdminC1HttpError);
  });

  it('validates recovery material, generic step-up purposes and identifiers', () => {
    expect(
      parseAdminRecovery({ selector: 'ABCDEFGH2345', verifier: 'ABCDEFGHJKLMNPQRSTUVWXYZ2345' }),
    ).toMatchObject({ selector: 'ABCDEFGH2345' });
    expect(parseAdminStepUp({ purpose: 'SESSION_REVOCATION', totpCode: '654321' })).toEqual({
      purpose: 'SESSION_REVOCATION',
      totpCode: '654321',
    });
    expect(() =>
      parseAdminStepUp({ purpose: 'RECOVERY_CODE_ROTATION', totpCode: '654321' }),
    ).toThrow(AdminC1HttpError);
    expect(assertAdminUuid('00000000-0000-4000-8000-000000000020')).toBe(
      '00000000-0000-4000-8000-000000000020',
    );
    expect(assertIdempotencyKey('idempotency-key-0001')).toBe('idempotency-key-0001');
  });

  it('accepte les six motifs contractuels et expose operatorReason manquant', () => {
    for (const reasonCode of [
      'SECURITY_RESPONSE',
      'ACCOUNT_RECOVERY',
      'ROLE_ADMINISTRATION',
      'STATUS_ADMINISTRATION',
      'AUDIT_EXPORT',
      'INVITATION_ADMINISTRATION',
    ] as const) {
      expect(parseReason({ operatorReason: 'Motif explicite', reasonCode })).toEqual({
        operatorReason: 'Motif explicite',
        reasonCode,
      });
    }
    try {
      parseReason({ reasonCode: 'SECURITY_RESPONSE' });
      throw new Error('parseReason should reject a missing operatorReason.');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(AdminC1HttpError);
      expect((error as AdminC1HttpError).details).toEqual({
        field: 'operatorReason',
        reason: 'REQUIRED',
      });
    }
  });

  it('préserve toutes les métadonnées d erreur lors de l enrichissement session', () => {
    const service = Object.create(AdminAuthService.prototype) as AdminAuthService;
    const original = new AdminC1HttpError(429, 'RATE_LIMITED', {
      auditAction: 'ORIGINAL_ACTION',
      auditRecorded: true,
      details: { reason: 'RATE_LIMITED', retryAfterSeconds: 17 },
      retryAfterSeconds: 17,
    });
    const enrich = service as unknown as {
      withSessionAudit(
        error: AdminC1HttpError,
        principal: {
          adminUserId: string;
          authorizationVersion: number;
          role: 'SUPER_ADMIN';
          sessionId: string;
        },
        action: string,
      ): AdminC1HttpError;
    };
    const enriched = enrich.withSessionAudit(
      original,
      {
        adminUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        authorizationVersion: 1,
        role: 'SUPER_ADMIN',
        sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
      'ADMIN_SESSION_STEP_UP_REJECTED',
    );

    expect(enriched).toMatchObject({
      auditAction: 'ORIGINAL_ACTION',
      auditRecorded: true,
      code: 'RATE_LIMITED',
      details: { reason: 'RATE_LIMITED', retryAfterSeconds: 17 },
      retryAfterSeconds: 17,
      status: 429,
    });
    expect(enriched.auditContext).toMatchObject({
      action: 'ADMIN_SESSION_STEP_UP_REJECTED',
      actorAdminUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      adminSessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      subjectAdminUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
  });

  it('preserves a proven recovery context on a generic post-proof enrollment failure', async () => {
    const now = new Date('2026-10-05T10:00:00.000Z');
    const user: AdminUserRecord = {
      authorizationVersion: 3,
      createdAt: now,
      email: 'recovery@example.test',
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      lastAcceptedTotpCounter: null,
      passwordHash: 'not-used',
      role: 'SUPER_ADMIN',
      status: 'PENDING_MFA',
      totpEnabledAt: null,
      totpSecretEncrypted: null,
    };
    const recovery: AdminRecoveryContextRecord = {
      adminUserId: user.id,
      authorizationVersion: user.authorizationVersion,
      consumedAt: null,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      recoveryCodeId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      revokedAt: null,
      tokenHash: 'recovery-token-hash',
    };
    const transaction = {
      findPreAuthByHash: vi.fn().mockResolvedValue(undefined),
      findRecoveryContextByHash: vi.fn().mockResolvedValue(recovery),
      lockAdminUser: vi.fn().mockResolvedValue(user),
      lockRecoveryContextByHash: vi.fn().mockResolvedValue(recovery),
    } as unknown as AdminAuthTransactionRepository;
    const repository = {
      transaction: vi.fn((callback: (value: AdminAuthTransactionRepository) => unknown) =>
        callback(transaction),
      ),
    } as unknown as AdminAuthRepository;
    const keys = new TestEphemeralAdminKeyProvider();
    vi.spyOn(keys, 'keyedDigest').mockRejectedValueOnce(new Error('controlled post-proof'));
    const service = new AdminAuthService(
      repository,
      new AdminAuthCrypto(keys),
      keys,
      {} as AdminRateLimitService,
      {} as AdminSessionService,
      new AdminRequestPolicy({ keyProvider: keys, origin: 'https://admin.example.test' }),
    );

    await expect(
      service.createEnrollment(
        'recovery-context-token',
        'recovery-create-0001',
        'request-recovery-create',
        now,
      ),
    ).rejects.toMatchObject({
      auditContext: {
        action: 'ADMIN_TOTP_ENROLLMENT_CREATE_REJECTED',
        actorAdminUserId: user.id,
        adminRecoveryContextId: recovery.id,
        entityId: recovery.id,
        entityType: 'AdminTotpEnrollment',
        reasonCode: 'ACCOUNT_RECOVERY',
        subjectAdminUserId: user.id,
      },
      auditRecorded: false,
      code: 'SERVICE_UNAVAILABLE',
      details: {},
      status: 503,
    });
  });

  it('preserves normalized metadata and explicit contexts while keeping unknown COMMIT neutral', async () => {
    const recoveryContext: AdminFailureAuditContext = {
      action: 'ADMIN_TOTP_ENROLLMENT_CREATE_REJECTED',
      actorAdminUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      adminRecoveryContextId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      entityId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      entityType: 'AdminTotpEnrollment',
      reasonCode: 'ACCOUNT_RECOVERY',
      subjectAdminUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    };
    const serviceWith = (error: unknown): AdminAuthService => {
      const keys = new TestEphemeralAdminKeyProvider();
      return new AdminAuthService(
        { transaction: vi.fn().mockRejectedValue(error) } as unknown as AdminAuthRepository,
        new AdminAuthCrypto(keys),
        keys,
        {} as AdminRateLimitService,
        {} as AdminSessionService,
        new AdminRequestPolicy({ keyProvider: keys, origin: 'https://admin.example.test' }),
      );
    };
    const run = (service: AdminAuthService): Promise<unknown> =>
      (
        service as unknown as {
          runTransaction(
            callback: (transaction: AdminAuthTransactionRepository) => Promise<unknown>,
            failureContext: () => AdminFailureAuditContext,
          ): Promise<unknown>;
        }
      ).runTransaction(
        async () => undefined,
        () => recoveryContext,
      );

    const normalized = new AdminC1HttpError(429, 'RATE_LIMITED', {
      auditAction: 'ORIGINAL_ACTION',
      auditRecorded: true,
      details: { reason: 'RATE_LIMITED', retryAfterSeconds: 17 },
      retryAfterSeconds: 17,
    });
    await expect(run(serviceWith(normalized))).rejects.toMatchObject({
      auditAction: 'ORIGINAL_ACTION',
      auditContext: recoveryContext,
      auditRecorded: true,
      code: 'RATE_LIMITED',
      details: { reason: 'RATE_LIMITED', retryAfterSeconds: 17 },
      retryAfterSeconds: 17,
      status: 429,
    });

    const explicitContext = {
      ...recoveryContext,
      entityId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    };
    const explicit = new AdminC1HttpError(401, 'AUTH_REQUIRED', {
      auditContext: explicitContext,
    });
    await expect(run(serviceWith(explicit))).rejects.toBe(explicit);

    await expect(
      run(
        serviceWith(
          new AdminWriterCommitUnknownError(new Error('controlled acknowledgement loss')),
        ),
      ),
    ).rejects.toMatchObject({
      auditContext: undefined,
      auditRecorded: true,
      code: 'SERVICE_UNAVAILABLE',
      details: {},
      status: 503,
    });
  });
});
