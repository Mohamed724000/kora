import type { AdminAuthRepository } from './admin-auth.repository';
import { AdminAuthCrypto } from './admin-auth.crypto';
import {
  AdminKeyProviderUnavailableError,
  TestEphemeralAdminKeyProvider,
} from './admin-key-provider';
import type { AdminRateLimitService } from './admin-rate-limit.service';
import { AdminRequestPolicy } from './admin-request-policy';
import { AdminC1HttpError, AdminSessionService } from './admin-session.service';

describe('AdminSessionService', () => {
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
});
