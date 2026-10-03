import type { AdminAuthRepository } from './admin-auth.repository';
import { AdminAuthCrypto } from './admin-auth.crypto';
import { TestEphemeralAdminKeyProvider } from './admin-key-provider';
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
});
