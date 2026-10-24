import { describe, expect, it, vi } from 'vitest';
import { AdminAuthCryptoError, type AdminAuthCrypto } from '../admin-auth/admin-auth.crypto';
import {
  AdminKeyProviderUnavailableError,
  type AdminKeyProvider,
} from '../admin-auth/admin-key-provider';
import type {
  AdminAuditPrincipal,
  AdminAuditTransactionRepository,
} from './admin-audit.repository';
import {
  AdminAuditAuthorizationRejection,
  AdminAuditAuthorizationService,
} from './admin-audit.authorization.service';
import type { AdminC2BearerProof } from './admin-security.types';

const NOW = new Date('2026-10-23T12:00:00.000Z');
const PROOF: AdminC2BearerProof = {
  adminUserId: '00000000-0000-4000-8000-000000000001',
  authorizationVersion: 7,
  expiresAtSeconds: Math.floor(NOW.getTime() / 1000) + 3_600,
  issuedAtSeconds: Math.floor(NOW.getTime() / 1000) - 60,
  role: 'SUPER_ADMIN',
  sessionId: '00000000-0000-4000-8000-000000000002',
  tokenId: 'access-token-jti',
};

function principal(overrides: Partial<AdminAuditPrincipal> = {}): AdminAuditPrincipal {
  return {
    absoluteExpiresAt: new Date(NOW.getTime() + 3_600_000),
    accessTokenJti: PROOF.tokenId,
    adminUserId: PROOF.adminUserId,
    authorizationVersion: PROOF.authorizationVersion,
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    role: 'SUPER_ADMIN',
    sessionAuthorizationVersion: PROOF.authorizationVersion,
    sessionId: PROOF.sessionId,
    sessionRevokedAt: null,
    status: 'ACTIVE',
    stepUpExpiresAt: new Date(NOW.getTime() + 300_000),
    stepUpPurpose: 'AUDIT_EXPORT',
    ...overrides,
  };
}

function service(
  crypto: Partial<AdminAuthCrypto> = {},
  keys: Partial<AdminKeyProvider> = {},
): AdminAuditAuthorizationService {
  return new AdminAuditAuthorizationService(
    {
      verifyAccessToken: vi.fn().mockResolvedValue(PROOF),
      ...crypto,
    } as unknown as AdminAuthCrypto,
    {
      assertAvailable: vi.fn().mockResolvedValue(undefined),
      ...keys,
    } as unknown as AdminKeyProvider,
  );
}

describe('AdminAuditAuthorizationService', () => {
  it('fails closed before proof when the key provider is unavailable', async () => {
    await expect(
      service(
        {},
        { assertAvailable: vi.fn().mockRejectedValue(new AdminKeyProviderUnavailableError()) },
      ).verifyBearer('listAdminAuditLogs', `Bearer ${'a'.repeat(32)}`, NOW),
    ).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      disposition: 'RECORD_SECURITY_EVENT',
      operationId: 'listAdminAuditLogs',
    });
  });

  it('maps an invalid bearer to AUTH_REQUIRED before proof', async () => {
    await expect(
      service({
        verifyAccessToken: vi.fn().mockRejectedValue(new AdminAuthCryptoError()),
      }).verifyBearer('getAdminAuditLogExport', `Bearer ${'b'.repeat(32)}`, NOW),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED', disposition: 'RECORD_SECURITY_EVENT' });
  });

  it('persists a role denial after proof and never returns the principal', async () => {
    const insertHttpAudit = vi.fn().mockResolvedValue('audit-id');
    const supportProof = { ...PROOF, role: 'SUPPORT' as const };
    const transaction = {
      insertHttpAudit,
      lockPrincipal: vi.fn().mockResolvedValue(principal({ role: 'SUPPORT' })),
    } as unknown as AdminAuditTransactionRepository;

    const rejection = await service().authorize(
      transaction,
      'listAdminAuditLogs',
      supportProof,
      'request-role-denied',
      { id: 'snapshot-id', type: 'ADMIN_AUDIT_SNAPSHOT' },
      undefined,
      NOW,
    );
    expect(rejection).toBeInstanceOf(AdminAuditAuthorizationRejection);
    expect((rejection as AdminAuditAuthorizationRejection).error).toMatchObject({
      code: 'FORBIDDEN',
      disposition: 'ALREADY_DURABLE',
    });
    expect(insertHttpAudit).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'FORBIDDEN', outcome: 'REJECTED' }),
    );
  });

  it('requires the exact fresh AUDIT_EXPORT step-up', async () => {
    const insertHttpAudit = vi.fn().mockResolvedValue('audit-id');
    const transaction = {
      insertHttpAudit,
      lockPrincipal: vi.fn().mockResolvedValue(principal({ stepUpPurpose: 'INVITATION' })),
    } as unknown as AdminAuditTransactionRepository;

    const rejection = await service().authorize(
      transaction,
      'downloadAdminAuditLogExport',
      PROOF,
      'request-step-up-denied',
      { id: 'export-id', type: 'ADMIN_AUDIT_EXPORT' },
      'AUDIT_EXPORT',
      NOW,
    );
    expect(rejection).toBeInstanceOf(AdminAuditAuthorizationRejection);
    expect((rejection as AdminAuditAuthorizationRejection).error).toMatchObject({
      code: 'FORBIDDEN',
      disposition: 'ALREADY_DURABLE',
    });
    expect(insertHttpAudit).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'STEP_UP_INVALID', outcome: 'REJECTED' }),
    );
  });

  it('returns only a principal matching session, JTI, versions and step-up', async () => {
    const selected = principal();
    const transaction = {
      lockPrincipal: vi.fn().mockResolvedValue(selected),
    } as unknown as AdminAuditTransactionRepository;

    await expect(
      service().authorize(
        transaction,
        'createAdminAuditLogExport',
        PROOF,
        'request-authorized',
        { id: 'export-id', type: 'ADMIN_AUDIT_EXPORT' },
        'AUDIT_EXPORT',
        NOW,
      ),
    ).resolves.toBe(selected);
  });
});
