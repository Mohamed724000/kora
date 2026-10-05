import type { AdminAuthRepository } from './admin-auth.repository';
import { AdminAuthCrypto } from './admin-auth.crypto';
import { AdminWriterCommitUnknownError } from '../database/admin-writer.service';
import {
  AdminKeyProviderUnavailableError,
  TestEphemeralAdminKeyProvider,
} from './admin-key-provider';
import type { AdminRateLimitService } from './admin-rate-limit.service';
import { AdminRequestPolicy } from './admin-request-policy';
import { AdminC1HttpError, AdminSessionService } from './admin-session.service';

describe('AdminSessionService', () => {
  const principal = {
    adminUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    authorizationVersion: 1,
    role: 'SUPER_ADMIN' as const,
    sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  };

  function serviceWith(repository: AdminAuthRepository): AdminSessionService {
    const keys = new TestEphemeralAdminKeyProvider();
    return new AdminSessionService(
      repository,
      new AdminAuthCrypto(keys),
      keys,
      {} as AdminRateLimitService,
      new AdminRequestPolicy({ keyProvider: keys, origin: 'https://admin.example.test' }),
    );
  }

  it('prepares a real RS256 access token and opaque refresh material', async () => {
    const keys = new TestEphemeralAdminKeyProvider();
    const crypto = new AdminAuthCrypto(keys);
    const service = new AdminSessionService(
      {} as AdminAuthRepository,
      crypto,
      keys,
      {} as AdminRateLimitService,
      new AdminRequestPolicy({ keyProvider: keys, origin: 'https://admin.example.test' }),
    );
    const now = new Date('2026-10-02T17:00:00.000Z');
    const prepared = await service.prepareSession(
      {
        authorizationVersion: 4,
        createdAt: now,
        email: 'admin@example.test',
        id: '00000000-0000-4000-8000-000000000010',
        lastAcceptedTotpCounter: 1n,
        passwordHash: 'not-used',
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        totpEnabledAt: now,
        totpSecretEncrypted: 'not-used',
      },
      now,
    );
    const verified = await crypto.verifyAccessToken(
      prepared.accessToken,
      Math.floor(now.getTime() / 1000),
    );

    expect(verified.sessionId).toBe(prepared.sessionId);
    expect(verified.authorizationVersion).toBe(4);
    expect(prepared.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(prepared.absoluteExpiresAt.getTime() - now.getTime()).toBe(12 * 60 * 60 * 1000);
  });

  it('exposes the exact fail-closed 503 payload fields', () => {
    const error = new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE');
    expect(error).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      details: {},
      message: 'Service temporairement indisponible.',
      retryable: false,
      status: 503,
    });
  });

  it('maps verification-key unavailability to 503 before inventing a session context', async () => {
    const keys = new TestEphemeralAdminKeyProvider();
    const crypto = new AdminAuthCrypto(keys);
    const repository = { transaction: jest.fn() } as unknown as AdminAuthRepository;
    const service = new AdminSessionService(
      repository,
      crypto,
      keys,
      {} as AdminRateLimitService,
      new AdminRequestPolicy({ keyProvider: keys, origin: 'https://admin.example.test' }),
    );
    const now = 1_800_000_000;
    const token = await crypto.issueAccessToken(
      {
        adminUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        authorizationVersion: 1,
        role: 'SUPPORT',
        sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
      now,
    );
    const resolve = jest
      .spyOn(keys, 'resolveJwtVerificationKey')
      .mockRejectedValueOnce(new AdminKeyProviderUnavailableError());

    try {
      await expect(
        service.authenticate(`Bearer ${token}`, new Date((now + 1) * 1000)),
      ).rejects.toMatchObject({
        auditContext: undefined,
        code: 'SERVICE_UNAVAILABLE',
        status: 503,
      });
      expect(repository.transaction).not.toHaveBeenCalled();
    } finally {
      resolve.mockRestore();
    }
  });

  it('keeps unknown keys, malformed tokens, bad signatures and expiration at 401', async () => {
    const keys = new TestEphemeralAdminKeyProvider();
    const crypto = new AdminAuthCrypto(keys);
    const repository = { transaction: jest.fn() } as unknown as AdminAuthRepository;
    const service = new AdminSessionService(
      repository,
      crypto,
      keys,
      {} as AdminRateLimitService,
      new AdminRequestPolicy({ keyProvider: keys, origin: 'https://admin.example.test' }),
    );
    const now = 1_800_000_000;
    const token = await crypto.issueAccessToken(
      {
        adminUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        authorizationVersion: 1,
        role: 'SUPPORT',
        sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
      now,
      10,
    );
    const parts = token.split('.');
    const signature = Buffer.from(parts[2]!, 'base64url');
    signature[0] = (signature[0] ?? 0) ^ 1;
    const invalidSignature = `${parts[0]}.${parts[1]}.${signature.toString('base64url')}`;

    const unknownKey = jest
      .spyOn(keys, 'resolveJwtVerificationKey')
      .mockResolvedValueOnce(undefined);
    await expect(
      service.authenticate(`Bearer ${token}`, new Date((now + 1) * 1000)),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED', status: 401 });
    unknownKey.mockRestore();

    for (const [candidate, at] of [
      ['x'.repeat(32), now + 1],
      [invalidSignature, now + 1],
      [token, now + 11],
    ] as const) {
      await expect(
        service.authenticate(`Bearer ${candidate}`, new Date(at * 1000)),
      ).rejects.toMatchObject({ auditContext: undefined, code: 'AUTH_REQUIRED', status: 401 });
    }
    expect(repository.transaction).not.toHaveBeenCalled();
  });

  it('routes a signed list token with a mismatched JTI to the pre-proof security sink', async () => {
    const keys = new TestEphemeralAdminKeyProvider();
    const crypto = new AdminAuthCrypto(keys);
    const nowSeconds = 1_800_000_000;
    const now = new Date((nowSeconds + 1) * 1000);
    const token = await crypto.issueAccessToken(
      {
        adminUserId: principal.adminUserId,
        authorizationVersion: principal.authorizationVersion,
        role: principal.role,
        sessionId: principal.sessionId,
      },
      nowSeconds,
    );
    const user = {
      authorizationVersion: principal.authorizationVersion,
      createdAt: now,
      email: 'admin@example.test',
      id: principal.adminUserId,
      lastAcceptedTotpCounter: null,
      passwordHash: 'not-used',
      role: principal.role,
      status: 'ACTIVE' as const,
      totpEnabledAt: now,
      totpSecretEncrypted: 'not-used',
    };
    const session = {
      absoluteExpiresAt: new Date(now.getTime() + 60_000),
      accessTokenJti: 'different-jti',
      adminUserId: principal.adminUserId,
      authorizationVersion: principal.authorizationVersion,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
      id: principal.sessionId,
      lastActivityAt: now,
      lastTwoFactorAt: now,
      refreshTokenHash: 'not-used',
      refreshTokenVersion: 1,
      revokedAt: null,
      stepUpExpiresAt: null,
      stepUpPurpose: null,
      stepUpVerifiedAt: null,
      tokenFamilyId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      updatedAt: now,
    };
    const repository = {
      transaction: jest.fn(
        (callback: (transaction: Record<string, jest.Mock>) => unknown): unknown =>
          callback({
            lockAdminUser: jest.fn().mockResolvedValue(user),
            lockSession: jest.fn().mockResolvedValue(session),
          }),
      ),
    } as unknown as AdminAuthRepository;
    const service = new AdminSessionService(
      repository,
      crypto,
      keys,
      {} as AdminRateLimitService,
      new AdminRequestPolicy({ keyProvider: keys, origin: 'https://admin.example.test' }),
    );

    await expect(
      (
        service as unknown as {
          authenticateForSessionList(authorization: string, at: Date): Promise<typeof principal>;
        }
      ).authenticateForSessionList(`Bearer ${token}`, now),
    ).rejects.toMatchObject({
      auditAction: 'ADMIN_SESSION_AUTHENTICATION_REJECTED',
      auditContext: undefined,
      auditRecorded: false,
      code: 'AUTH_REQUIRED',
      status: 401,
    });

    const normalizedBeforeProof = new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE', {
      auditRecorded: true,
      details: { phase: 'BEFORE_BINDING' },
    });
    const preProofService = new AdminSessionService(
      {
        transaction: jest.fn().mockRejectedValue(normalizedBeforeProof),
      } as unknown as AdminAuthRepository,
      crypto,
      keys,
      {} as AdminRateLimitService,
      new AdminRequestPolicy({ keyProvider: keys, origin: 'https://admin.example.test' }),
    );
    await expect(
      preProofService.authenticateForSessionList(`Bearer ${token}`, now),
    ).rejects.toMatchObject({
      auditAction: 'ADMIN_SESSION_AUTHENTICATION_REJECTED',
      auditContext: undefined,
      auditRecorded: false,
      code: 'SERVICE_UNAVAILABLE',
      details: { phase: 'BEFORE_BINDING' },
      status: 503,
    });
  });

  it('enriches a normalized error after proven authentication and preserves its metadata', async () => {
    const source = new AdminC1HttpError(429, 'RATE_LIMITED', {
      auditAction: 'SOURCE_ACTION',
      auditRecorded: true,
      details: { reason: 'CONTROLLED', retryAfterSeconds: 17 },
      retryAfterSeconds: 17,
    });
    const repository = {
      transaction: jest.fn().mockRejectedValue(source),
    } as unknown as AdminAuthRepository;

    await expect(
      serviceWith(repository).revokeCurrent(principal, 'request-normalized'),
    ).rejects.toMatchObject({
      auditAction: 'SOURCE_ACTION',
      auditContext: {
        action: 'ADMIN_SESSION_REVOCATION_REJECTED',
        actorAdminUserId: principal.adminUserId,
        adminSessionId: principal.sessionId,
        entityId: principal.sessionId,
        entityType: 'AdminSession',
        reasonCode: 'SECURITY_RESPONSE',
        subjectAdminUserId: principal.adminUserId,
      },
      auditRecorded: true,
      code: 'RATE_LIMITED',
      details: { reason: 'CONTROLLED', retryAfterSeconds: 17 },
      message: source.message,
      retryAfterSeconds: 17,
      status: 429,
    });
  });

  it('does not replace an explicit failure context', async () => {
    const explicitContext = {
      action: 'ADMIN_SESSION_AUTHENTICATION_REJECTED',
      actorAdminUserId: principal.adminUserId,
      adminSessionId: principal.sessionId,
      entityId: principal.sessionId,
      entityType: 'AdminSession' as const,
      reasonCode: 'SECURITY_RESPONSE' as const,
      subjectAdminUserId: principal.adminUserId,
    };
    const source = new AdminC1HttpError(401, 'AUTH_REQUIRED', {
      auditContext: explicitContext,
    });
    const repository = {
      transaction: jest.fn().mockRejectedValue(source),
    } as unknown as AdminAuthRepository;

    let observed: unknown;
    try {
      await serviceWith(repository).revokeCurrent(principal, 'request-explicit');
    } catch (error: unknown) {
      observed = error;
    }
    expect(observed).toBe(source);
    expect((observed as AdminC1HttpError).auditContext).toBe(explicitContext);
  });

  it('keeps unknown COMMIT neutral and suppresses a second failure sink', async () => {
    const repository = {
      transaction: jest
        .fn()
        .mockRejectedValue(
          new AdminWriterCommitUnknownError(new Error('controlled acknowledgement loss')),
        ),
    } as unknown as AdminAuthRepository;

    await expect(
      serviceWith(repository).revokeCurrent(principal, 'request-unknown-commit'),
    ).rejects.toMatchObject({
      auditContext: undefined,
      auditRecorded: true,
      code: 'SERVICE_UNAVAILABLE',
      details: {},
      retryable: false,
      status: 503,
    });
  });

  it('isolates concurrent revocation contexts by invocation', async () => {
    const gates: Array<() => void> = [];
    const repository = {
      transaction: jest.fn().mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            gates.push(() => reject(new Error('controlled concurrent failure')));
          }),
      ),
    } as unknown as AdminAuthRepository;
    const service = serviceWith(repository);
    const secondPrincipal = {
      ...principal,
      adminUserId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      sessionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    };

    const first = service.revokeOther(
      principal,
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      { operatorReason: 'Premier motif controle', reasonCode: 'SECURITY_RESPONSE' },
      'request-first',
    );
    const second = service.revokeOther(
      secondPrincipal,
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
      { operatorReason: 'Second motif controle', reasonCode: 'ACCOUNT_RECOVERY' },
      'request-second',
    );
    expect(gates).toHaveLength(2);
    gates[1]!();
    gates[0]!();

    const results = await Promise.allSettled([first, second]);
    expect(results).toHaveLength(2);
    const errors = results.map((result) => {
      expect(result.status).toBe('rejected');
      return (result as PromiseRejectedResult).reason as AdminC1HttpError;
    });
    expect(errors[0]!.auditContext).toEqual({
      action: 'ADMIN_SESSION_REVOCATION_REJECTED',
      actorAdminUserId: principal.adminUserId,
      adminSessionId: principal.sessionId,
      entityId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      entityType: 'AdminSession',
      operatorReason: 'Premier motif controle',
      reasonCode: 'SECURITY_RESPONSE',
    });
    expect(errors[1]!.auditContext).toEqual({
      action: 'ADMIN_SESSION_REVOCATION_REJECTED',
      actorAdminUserId: secondPrincipal.adminUserId,
      adminSessionId: secondPrincipal.sessionId,
      entityId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      entityType: 'AdminSession',
      operatorReason: 'Second motif controle',
      reasonCode: 'ACCOUNT_RECOVERY',
    });
  });
});
