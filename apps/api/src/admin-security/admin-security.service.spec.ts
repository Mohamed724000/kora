import type { AdminAuthCrypto } from '../admin-auth/admin-auth.crypto';
import type { AdminKeyProvider } from '../admin-auth/admin-key-provider';
import type { AdminRateLimitService } from '../admin-auth/admin-rate-limit.service';
import type { AdminRequestPolicy } from '../admin-auth/admin-request-policy';
import { AdminC2TransactionError } from '../database/admin-c2-transaction.service';
import {
  AdminNotificationUnavailableError,
  type AdminNotificationPort,
} from './admin-notification.port';
import type { AdminNotificationWakeupPort } from './admin-notification.worker';
import type { AdminPasswordCompromisePort } from './admin-password-compromise.port';
import type { AdminSecurityCrypto } from './admin-security.crypto';
import { AdminC2HttpError } from './admin-security.errors';
import type { AdminSecurityPagination } from './admin-security.pagination';
import type {
  AdminC2LockedPrincipal,
  AdminInvitationRecord,
  AdminPasswordResetContextRecord,
  AdminSecurityRepository,
  AdminSecurityTransactionRepository,
} from './admin-security.repository';
import { AdminSecurityService } from './admin-security.service';
import type { AdminC2BearerProof } from './admin-security.types';

interface AdminSecurityServiceHarness {
  readonly notification: AdminNotificationPort;
  readonly notificationWakeup: AdminNotificationWakeupPort;
  readonly rateLimiter: AdminRateLimitService;
  readonly repository: AdminSecurityRepository;
  readonly securityCrypto: AdminSecurityCrypto;
  readonly service: AdminSecurityService;
}

function harness(overrides: {
  authCrypto?: Partial<AdminAuthCrypto>;
  keyProvider?: Partial<AdminKeyProvider>;
  notification?: Partial<AdminNotificationPort>;
  notificationWakeup?: Partial<AdminNotificationWakeupPort>;
  passwordCompromise?: Partial<AdminPasswordCompromisePort>;
  repository?: Partial<AdminSecurityRepository>;
  securityCrypto?: Partial<AdminSecurityCrypto>;
}): AdminSecurityServiceHarness {
  const repository = {
    transaction: vi.fn(),
    ...overrides.repository,
  } as unknown as AdminSecurityRepository;
  const rateLimiter = {
    consume: vi.fn().mockResolvedValue({ allowed: true }),
  } as unknown as AdminRateLimitService;
  const notification = {
    assertConfigured: vi.fn().mockResolvedValue(undefined),
    deliver: vi.fn(),
    reconcile: vi.fn(),
    ...overrides.notification,
  } as unknown as AdminNotificationPort;
  const securityCrypto = {
    assertOutboxAvailable: vi.fn().mockResolvedValue(undefined),
    canonicalDigest: vi.fn().mockReturnValue('a'.repeat(64)),
    encryptOutboxPayload: vi.fn().mockResolvedValue({
      aadHash: 'b'.repeat(64),
      encryptedPayload: 'ciphertext',
      encryptionKeyId: 'test-key',
      encryptionNonce: 'nonce',
      encryptionTag: 'tag',
    }),
    randomCode: vi.fn().mockReturnValue('A'.repeat(32)),
    bindingMatches: vi.fn().mockReturnValue(true),
    passwordBinding: vi.fn().mockReturnValue('password-binding'),
    sha256: vi.fn().mockReturnValue('c'.repeat(64)),
    ...overrides.securityCrypto,
  } as unknown as AdminSecurityCrypto;
  const authCrypto = {
    hashPassword: vi.fn().mockResolvedValue('qualified-password-hash'),
    verifyAccessToken: vi.fn().mockResolvedValue(BEARER_PROOF),
    ...overrides.authCrypto,
  } as unknown as AdminAuthCrypto;
  const keyProvider = {
    assertAvailable: vi.fn().mockResolvedValue(undefined),
    ...overrides.keyProvider,
  } as unknown as AdminKeyProvider;
  const notificationWakeup = {
    notify: vi.fn().mockResolvedValue(true),
    ...overrides.notificationWakeup,
  } as AdminNotificationWakeupPort;
  const passwordCompromise = {
    checkPassword: vi.fn().mockResolvedValue('SAFE'),
    ...overrides.passwordCompromise,
  } as unknown as AdminPasswordCompromisePort;
  const service = new AdminSecurityService(
    repository,
    authCrypto,
    keyProvider,
    rateLimiter,
    {} as AdminRequestPolicy,
    notification,
    passwordCompromise,
    securityCrypto,
    {} as AdminSecurityPagination,
    notificationWakeup,
  );
  return {
    notification,
    notificationWakeup,
    rateLimiter,
    repository,
    securityCrypto,
    service,
  };
}

const NOW = new Date('2026-10-17T12:00:00.000Z');
const BEARER = `Bearer ${'a'.repeat(32)}`;
const BEARER_PROOF: AdminC2BearerProof = {
  adminUserId: '00000000-0000-4000-8000-000000000001',
  authorizationVersion: 3,
  expiresAtSeconds: Math.floor(NOW.getTime() / 1000) + 3_600,
  issuedAtSeconds: Math.floor(NOW.getTime() / 1000) - 60,
  role: 'SUPER_ADMIN',
  sessionId: '00000000-0000-4000-8000-000000000002',
  tokenId: 'token-id',
};
const PRINCIPAL: AdminC2LockedPrincipal = {
  absoluteExpiresAt: new Date(NOW.getTime() + 3_600_000),
  accessTokenJti: BEARER_PROOF.tokenId,
  adminUserId: BEARER_PROOF.adminUserId,
  authorizationVersion: BEARER_PROOF.authorizationVersion,
  expiresAt: new Date(NOW.getTime() + 3_600_000),
  role: 'SUPER_ADMIN',
  sessionAuthorizationVersion: BEARER_PROOF.authorizationVersion,
  sessionId: BEARER_PROOF.sessionId,
  sessionRevokedAt: null,
  status: 'ACTIVE',
  stepUpExpiresAt: new Date(NOW.getTime() + 600_000),
  stepUpPurpose: 'INVITATION',
};
const RESET_CONTEXT: AdminPasswordResetContextRecord = {
  adminUserId: '00000000-0000-4000-8000-000000000011',
  authorizationVersion: 4,
  consumedAt: null,
  contextId: '00000000-0000-4000-8000-000000000012',
  expiresAt: new Date(NOW.getTime() + 10 * 60_000),
  passwordResetRequestId: '00000000-0000-4000-8000-000000000013',
  requestExpiresAt: new Date(NOW.getTime() + 10 * 60_000),
  requestRevokedAt: null,
  revokedAt: null,
  tokenHash: 'c'.repeat(64),
  userAuthorizationVersion: 4,
  userStatus: 'ACTIVE',
};

function repositoryExecuting(transaction: Partial<AdminSecurityTransactionRepository>): {
  repository: AdminSecurityRepository;
  transaction: ReturnType<typeof vi.fn>;
} {
  const transactionWithDefaults = {
    lockIdempotencyKey: vi.fn().mockResolvedValue(undefined),
    ...transaction,
  } as AdminSecurityTransactionRepository;
  const execute = vi.fn(
    async <T>(callback: (value: AdminSecurityTransactionRepository) => Promise<T>): Promise<T> =>
      callback(transactionWithDefaults),
  );
  return {
    repository: { transaction: execute } as unknown as AdminSecurityRepository,
    transaction: execute,
  };
}

describe('AdminSecurityService', () => {
  it('refuse fail-closed une notification absente avant toute transaction métier', async () => {
    const { rateLimiter, repository, securityCrypto, service } = harness({
      notification: {
        assertConfigured: vi.fn().mockRejectedValue(new AdminNotificationUnavailableError()),
      },
    });

    await expect(
      service.requestPasswordReset(
        {
          deliveryEmail: 'Admin@Example.Invalid',
          emailCanonical: 'admin@example.invalid',
        },
        { ipAddress: '192.0.2.20', requestId: 'request-notification-unavailable' },
      ),
    ).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      disposition: 'RECORD_SECURITY_EVENT',
      operationId: 'requestAdminPasswordReset',
    } satisfies Partial<AdminC2HttpError>);
    expect(rateLimiter.consume).toHaveBeenCalledExactlyOnceWith(
      'RECOVERY',
      '192.0.2.20',
      'admin@example.invalid',
    );
    expect(securityCrypto.assertOutboxAvailable).toHaveBeenCalledOnce();
    expect(repository.transaction).not.toHaveBeenCalled();
  });

  it('ne crée aucun second sink pour une erreur déjà durable', async () => {
    const { repository, service } = harness({});

    await service.recordFailure(
      new AdminC2HttpError('createAdminInvitation', 'IDEMPOTENCY_CONFLICT', 'ALREADY_DURABLE'),
      'request-already-durable',
    );

    expect(repository.transaction).not.toHaveBeenCalled();
  });

  it('propage COMMIT_UNKNOWN comme résultat neutre sans second sink', async () => {
    const { repository, service } = harness({
      repository: {
        transaction: vi
          .fn()
          .mockRejectedValue(new AdminC2TransactionError('COMMIT_UNKNOWN', 'commit unresolved')),
      },
    });

    await expect(
      service.recordFailure(
        new AdminC2HttpError('changeAdminUserRole', 'FORBIDDEN', 'RECORD_SECURITY_EVENT'),
        'request-commit-unknown',
      ),
    ).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      disposition: 'COMMIT_UNKNOWN_NO_SECOND_SINK',
      operationId: 'changeAdminUserRole',
    } satisfies Partial<AdminC2HttpError>);
    expect(repository.transaction).toHaveBeenCalledOnce();
  });

  it('préserve une erreur métier C2a encapsulée par un échec de callback transactionnel', async () => {
    const callbackError = new AdminC2HttpError(
      'changeAdminUserStatus',
      'AUTH_REQUIRED',
      'NONE_AFTER_PROOF',
    );
    const { service } = harness({
      repository: {
        transaction: vi
          .fn()
          .mockRejectedValue(
            new AdminC2TransactionError('CALLBACK_FAILED', 'callback rejected', callbackError),
          ),
      },
    });

    await expect(
      service.recordFailure(
        new AdminC2HttpError('changeAdminUserStatus', 'FORBIDDEN', 'RECORD_SECURITY_EVENT'),
        'request-callback-failure',
      ),
    ).rejects.toBe(callbackError);
  });

  it('sépare l’adresse canonique de l’orthographe de livraison du reset', async () => {
    const insertPasswordReset = vi.fn().mockResolvedValue(undefined);
    const lockedUser = {
      authorizationVersion: 1,
      createdAt: NOW,
      email: 'Admin@Example.Invalid',
      id: '00000000-0000-4000-8000-000000000010',
      role: 'SUPPORT' as const,
      status: 'ACTIVE' as const,
      totpEnabledAt: NOW,
    };
    const executing = repositoryExecuting({
      insertPasswordReset,
      insertSecurityEvent: vi.fn().mockResolvedValue(undefined),
      lockAdminUserByEmail: vi.fn().mockResolvedValue(lockedUser),
      lockCurrentPasswordReset: vi.fn().mockResolvedValue(undefined),
    });
    const { securityCrypto, service } = harness({ repository: executing.repository });

    await service.requestPasswordReset(
      {
        deliveryEmail: 'Admin@Example.Invalid',
        emailCanonical: 'admin@example.invalid',
      },
      { ipAddress: '192.0.2.30', requestId: 'mixed-case-reset' },
      NOW,
    );

    expect(securityCrypto.encryptOutboxPayload).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'PASSWORD_RESET' }),
      { code: 'A'.repeat(32), email: 'Admin@Example.Invalid' },
    );
    expect(insertPasswordReset).toHaveBeenCalledOnce();
  });

  it('neutralise une panne de mutation reset après revalidation verrouillée sans second sink', async () => {
    const insertSecurityEvent = vi.fn().mockResolvedValue(undefined);
    const executing = repositoryExecuting({
      consumePasswordReset: vi
        .fn()
        .mockRejectedValue(new Error('controlled reset mutation failure')),
      insertAudit: vi.fn().mockResolvedValue(undefined),
      insertSecurityEvent,
      lockPasswordResetContext: vi.fn().mockResolvedValue(RESET_CONTEXT),
    });
    const { service } = harness({ repository: executing.repository });

    let failure: AdminC2HttpError | undefined;
    try {
      await service.resetPassword(
        { newPassword: 'QualifiedReset!2026', resetCode: 'reset-code' },
        { ipAddress: '192.0.2.31', requestId: 'reset-mutation-failure' },
        NOW,
      );
    } catch (error: unknown) {
      failure = error as AdminC2HttpError;
    }
    expect(failure).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      disposition: 'NONE_AFTER_PROOF',
    });
    await service.recordFailure(failure!, 'reset-mutation-failure');
    expect(executing.transaction).toHaveBeenCalledTimes(2);
    expect(insertSecurityEvent).not.toHaveBeenCalled();
  });

  it('revalide un rejet HIBP et neutralise la panne du sink après preuve', async () => {
    const insertSecurityEvent = vi.fn().mockResolvedValue(undefined);
    const executing = repositoryExecuting({
      insertAudit: vi.fn().mockRejectedValue(new Error('controlled reset audit failure')),
      insertSecurityEvent,
      lockPasswordResetContext: vi.fn().mockResolvedValue(RESET_CONTEXT),
    });
    const { service } = harness({
      passwordCompromise: { checkPassword: vi.fn().mockResolvedValue('COMPROMISED') },
      repository: executing.repository,
    });

    let failure: AdminC2HttpError | undefined;
    try {
      await service.resetPassword(
        { newPassword: 'CompromisedReset!2026', resetCode: 'reset-code' },
        { ipAddress: '192.0.2.32', requestId: 'reset-rejection-audit-failure' },
        NOW,
      );
    } catch (error: unknown) {
      failure = error as AdminC2HttpError;
    }
    expect(failure).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      disposition: 'NONE_AFTER_PROOF',
    });
    await service.recordFailure(failure!, 'reset-rejection-audit-failure');
    expect(executing.transaction).toHaveBeenCalledTimes(2);
    expect(insertSecurityEvent).not.toHaveBeenCalled();
  });

  it('résout un rejeu d’invitation après réautorisation sans provider, secret, chiffrement ni signal', async () => {
    const invitation: AdminInvitationRecord = {
      acceptedAdminUserId: null,
      codeHash: 'c'.repeat(64),
      createdAt: NOW,
      createdByAuditLogId: '00000000-0000-4000-8000-000000000020',
      creatorAdminUserId: PRINCIPAL.adminUserId,
      emailCanonical: 'invitee@example.invalid',
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      id: '00000000-0000-4000-8000-000000000021',
      proposedRole: 'SUPPORT',
      replacedInvitationId: null,
      revokedAt: null,
      state: 'PENDING',
      stateGeneration: 1,
    };
    const executing = repositoryExecuting({
      lockIdempotencyKey: vi.fn().mockResolvedValue(undefined),
      lockIdempotency: vi.fn().mockResolvedValue({
        adminUserId: PRINCIPAL.adminUserId,
        createdAt: NOW,
        // The repository only returns a PostgreSQL-active generation. A stale
        // Node clock or record timestamp must not override that database decision.
        expiresAt: new Date(NOW.getTime() - 60_000),
        idempotencyKey: 'invitation-replay-key-0001',
        operation: 'CREATE_ADMIN_INVITATION',
        requestDigest: 'a'.repeat(64),
        resourceId: invitation.id,
        resourceType: 'ADMIN_INVITATION',
        responseCode: 201,
      }),
      lockInvitation: vi.fn().mockResolvedValue(invitation),
      lockPrincipal: vi.fn().mockResolvedValue(PRINCIPAL),
    });
    const { notification, notificationWakeup, securityCrypto, service } = harness({
      notification: {
        assertConfigured: vi.fn().mockRejectedValue(new AdminNotificationUnavailableError()),
      },
      repository: executing.repository,
      securityCrypto: {
        assertOutboxAvailable: vi.fn().mockRejectedValue(new Error('keyring unavailable')),
      },
    });

    await expect(
      service.createInvitation(
        BEARER,
        'invitation-replay-key-0001',
        {
          deliveryEmail: 'Invitee@Example.Invalid',
          emailCanonical: 'invitee@example.invalid',
          operatorReason: 'approved replay',
          reasonCode: 'INVITATION_ADMINISTRATION',
          role: 'SUPPORT',
        },
        { requestId: 'invitation-replay' },
        NOW,
      ),
    ).resolves.toEqual({
      email: 'invitee@example.invalid',
      expiresAt: invitation.expiresAt.toISOString(),
      invitationId: invitation.id,
      role: 'SUPPORT',
      status: 'PENDING',
    });
    expect(notification.assertConfigured).not.toHaveBeenCalled();
    expect(securityCrypto.assertOutboxAvailable).not.toHaveBeenCalled();
    expect(securityCrypto.randomCode).not.toHaveBeenCalled();
    expect(securityCrypto.encryptOutboxPayload).not.toHaveBeenCalled();
    expect(notificationWakeup.notify).not.toHaveBeenCalled();
    expect(executing.transaction).toHaveBeenCalledOnce();
  });

  it('écrit un rejet AuditLog unique si le provider manque après preuve invitation', async () => {
    const insertAudit = vi.fn().mockResolvedValue(undefined);
    const insertSecurityEvent = vi.fn().mockResolvedValue(undefined);
    const executing = repositoryExecuting({
      insertAudit,
      insertSecurityEvent,
      lockIdempotency: vi.fn().mockResolvedValue(undefined),
      lockIdempotencyKey: vi.fn().mockResolvedValue(undefined),
      lockPrincipal: vi.fn().mockResolvedValue(PRINCIPAL),
    });
    const { securityCrypto, service } = harness({
      notification: {
        assertConfigured: vi.fn().mockRejectedValue(new AdminNotificationUnavailableError()),
      },
      repository: executing.repository,
    });

    let failure: AdminC2HttpError | undefined;
    try {
      await service.createInvitation(
        BEARER,
        'invitation-provider-failure-key',
        {
          deliveryEmail: 'Provider-Failure@Example.Invalid',
          emailCanonical: 'provider-failure@example.invalid',
          operatorReason: 'provider failure proof',
          reasonCode: 'INVITATION_ADMINISTRATION',
          role: 'SUPPORT',
        },
        { requestId: 'invitation-provider-failure' },
        NOW,
      );
    } catch (error: unknown) {
      failure = error as AdminC2HttpError;
    }
    expect(failure).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      disposition: 'ALREADY_DURABLE',
    });
    expect(insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'DEPENDENCY_UNAVAILABLE', outcome: 'REJECTED' }),
    );
    expect(insertSecurityEvent).not.toHaveBeenCalled();
    expect(securityCrypto.randomCode).not.toHaveBeenCalled();
    expect(securityCrypto.encryptOutboxPayload).not.toHaveBeenCalled();
    await service.recordFailure(failure!, 'invitation-provider-failure');
    expect(executing.transaction).toHaveBeenCalledOnce();
  });

  it('écrit le même rejet durable si le keyring disparaît entre préflight et chiffrement', async () => {
    const insertAudit = vi.fn().mockResolvedValue(undefined);
    const insertInvitation = vi.fn().mockResolvedValue(undefined);
    const insertSecurityEvent = vi.fn().mockResolvedValue(undefined);
    const executing = repositoryExecuting({
      insertAudit,
      insertInvitation,
      insertSecurityEvent,
      lockIdempotency: vi.fn().mockResolvedValue(undefined),
      lockIdempotencyKey: vi.fn().mockResolvedValue(undefined),
      lockPrincipal: vi.fn().mockResolvedValue(PRINCIPAL),
    });
    const { securityCrypto, service } = harness({
      repository: executing.repository,
      securityCrypto: {
        encryptOutboxPayload: vi
          .fn()
          .mockRejectedValue(new Error('simulated generic keyring primitive failure')),
      },
    });

    let failure: AdminC2HttpError | undefined;
    try {
      await service.createInvitation(
        BEARER,
        'invitation-keyring-toctou-key',
        {
          deliveryEmail: 'Keyring-Failure@Example.Invalid',
          emailCanonical: 'keyring-failure@example.invalid',
          operatorReason: 'keyring availability changed',
          reasonCode: 'INVITATION_ADMINISTRATION',
          role: 'SUPPORT',
        },
        { requestId: 'invitation-keyring-toctou' },
        NOW,
      );
    } catch (error: unknown) {
      failure = error as AdminC2HttpError;
    }
    expect(failure).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      disposition: 'ALREADY_DURABLE',
    });
    expect(securityCrypto.assertOutboxAvailable).toHaveBeenCalledOnce();
    expect(securityCrypto.randomCode).toHaveBeenCalledOnce();
    expect(securityCrypto.encryptOutboxPayload).toHaveBeenCalledOnce();
    expect(insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'DEPENDENCY_UNAVAILABLE', outcome: 'REJECTED' }),
    );
    expect(insertInvitation).not.toHaveBeenCalled();
    expect(insertSecurityEvent).not.toHaveBeenCalled();
    await service.recordFailure(failure!, 'invitation-keyring-toctou');
    expect(executing.transaction).toHaveBeenCalledOnce();
  });

  it('garde un échec d’insert AuditLog post-preuve neutre sans mutation ni second sink', async () => {
    const controlledFailure = new Error('controlled audit insert failure');
    const insertRecoveryCase = vi.fn().mockResolvedValue(undefined);
    const insertSecurityEvent = vi.fn().mockResolvedValue(undefined);
    const executing = repositoryExecuting({
      insertAudit: vi.fn().mockRejectedValue(controlledFailure),
      insertRecoveryCase,
      insertSecurityEvent,
      lockAdminUser: vi.fn().mockResolvedValue({
        authorizationVersion: 1,
        createdAt: NOW,
        email: 'subject@example.invalid',
        id: '00000000-0000-4000-8000-000000000030',
        role: 'SUPPORT',
        status: 'ACTIVE',
        totpEnabledAt: NOW,
      }),
      lockIdempotency: vi.fn().mockResolvedValue(undefined),
      lockPendingRecoveryCaseBySubject: vi.fn().mockResolvedValue(undefined),
      lockPrincipal: vi.fn().mockResolvedValue(PRINCIPAL),
    });
    const { service } = harness({ repository: executing.repository });
    let failure: AdminC2HttpError | undefined;
    try {
      await service.createRecoveryCase(
        BEARER,
        'recovery-audit-failure-key',
        {
          operatorReason: 'controlled audit failure',
          reasonCode: 'ACCOUNT_RECOVERY',
          subjectAdminUserId: '00000000-0000-4000-8000-000000000030',
        },
        { requestId: 'recovery-audit-failure' },
        NOW,
      );
    } catch (error: unknown) {
      failure = error as AdminC2HttpError;
    }
    expect(failure).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      disposition: 'NONE_AFTER_PROOF',
    });
    await service.recordFailure(failure!, 'recovery-audit-failure');
    expect(executing.transaction).toHaveBeenCalledOnce();
    expect(insertRecoveryCase).not.toHaveBeenCalled();
    expect(insertSecurityEvent).not.toHaveBeenCalled();
  });

  it('préserve COMMIT_REJECTED post-preuve comme 503 neutre sans fallback', async () => {
    const transactionRepository = {
      insertAudit: vi.fn().mockResolvedValue(undefined),
      insertIdempotency: vi.fn().mockResolvedValue(undefined),
      insertRecoveryCase: vi.fn().mockResolvedValue(undefined),
      lockAdminUser: vi.fn().mockResolvedValue({
        authorizationVersion: 1,
        createdAt: NOW,
        email: 'subject@example.invalid',
        id: '00000000-0000-4000-8000-000000000031',
        role: 'SUPPORT',
        status: 'ACTIVE',
        totpEnabledAt: NOW,
      }),
      lockIdempotency: vi.fn().mockResolvedValue(undefined),
      lockPendingRecoveryCaseBySubject: vi.fn().mockResolvedValue(undefined),
      lockPrincipal: vi.fn().mockResolvedValue(PRINCIPAL),
    } as unknown as AdminSecurityTransactionRepository;
    const execute = vi.fn(
      async (callback: (value: AdminSecurityTransactionRepository) => Promise<unknown>) => {
        await callback(transactionRepository);
        throw new AdminC2TransactionError('COMMIT_REJECTED', 'controlled commit rejection');
      },
    );
    const { service } = harness({
      repository: { transaction: execute } as unknown as AdminSecurityRepository,
    });
    let failure: AdminC2HttpError | undefined;
    try {
      await service.createRecoveryCase(
        BEARER,
        'recovery-commit-rejected-key',
        {
          operatorReason: 'controlled commit rejection',
          reasonCode: 'ACCOUNT_RECOVERY',
          subjectAdminUserId: '00000000-0000-4000-8000-000000000031',
        },
        { requestId: 'recovery-commit-rejected' },
        NOW,
      );
    } catch (error: unknown) {
      failure = error as AdminC2HttpError;
    }
    expect(failure).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      disposition: 'NONE_AFTER_PROOF',
    });
    await service.recordFailure(failure!, 'recovery-commit-rejected');
    expect(execute).toHaveBeenCalledOnce();
  });

  it.each([
    ['subject absent', undefined, '00000000-0000-4000-8000-000000000040'],
    [
      'subject inactive',
      {
        authorizationVersion: 1,
        createdAt: NOW,
        email: 'inactive@example.invalid',
        id: '00000000-0000-4000-8000-000000000041',
        role: 'SUPPORT' as const,
        status: 'SUSPENDED' as const,
        totpEnabledAt: NOW,
      },
      '00000000-0000-4000-8000-000000000041',
    ],
    [
      'auto-cible',
      {
        authorizationVersion: 3,
        createdAt: NOW,
        email: 'actor@example.invalid',
        id: PRINCIPAL.adminUserId,
        role: 'SUPER_ADMIN' as const,
        status: 'ACTIVE' as const,
        totpEnabledAt: NOW,
      },
      PRINCIPAL.adminUserId,
    ],
  ])(
    'classe create recovery %s en VALIDATION_ERROR durable',
    async (_label, subject, subjectId) => {
      const insertAudit = vi.fn().mockResolvedValue(undefined);
      const insertRecoveryCase = vi.fn().mockResolvedValue(undefined);
      const executing = repositoryExecuting({
        insertAudit,
        insertRecoveryCase,
        lockAdminUser: vi.fn().mockResolvedValue(subject),
        lockIdempotency: vi.fn().mockResolvedValue(undefined),
        lockPrincipal: vi.fn().mockResolvedValue(PRINCIPAL),
      });
      const { service } = harness({ repository: executing.repository });

      await expect(
        service.createRecoveryCase(
          BEARER,
          'recovery-validation-key',
          {
            operatorReason: 'recovery eligibility check',
            reasonCode: 'ACCOUNT_RECOVERY',
            subjectAdminUserId: subjectId,
          },
          { requestId: `create-${String(_label)}` },
          NOW,
        ),
      ).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        disposition: 'ALREADY_DURABLE',
        status: 400,
      });
      expect(insertAudit).toHaveBeenCalledWith(
        expect.objectContaining({ failureCode: 'VALIDATION_ERROR', outcome: 'REJECTED' }),
      );
      const rejectedAudit = insertAudit.mock.calls[0]?.[0];
      if (subject === undefined) {
        expect(rejectedAudit).not.toHaveProperty('subjectAdminUserId');
      } else {
        expect(rejectedAudit).toHaveProperty('subjectAdminUserId', subjectId);
      }
      expect(insertRecoveryCase).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['subject absent', 'PENDING', undefined, false, false, 'VALIDATION_ERROR', 400],
    ['subject inactive', 'PENDING', { status: 'DISABLED' }, false, false, 'VALIDATION_ERROR', 400],
    ['case non pending', 'APPROVED', { status: 'ACTIVE' }, false, false, 'RESOURCE_CONFLICT', 409],
    ['creator is approver', 'PENDING', { status: 'ACTIVE' }, true, false, 'RESOURCE_CONFLICT', 409],
    ['subject is approver', 'PENDING', { status: 'ACTIVE' }, false, true, 'RESOURCE_CONFLICT', 409],
  ] as const)(
    'applique la priorité recovery approve : %s',
    async (
      _label,
      state,
      subjectShape,
      creatorIsPrincipal,
      subjectIsPrincipal,
      failureCode,
      status,
    ) => {
      const subjectId = subjectIsPrincipal
        ? PRINCIPAL.adminUserId
        : '00000000-0000-4000-8000-000000000050';
      const insertAudit = vi.fn().mockResolvedValue(undefined);
      const approveRecoveryCase = vi.fn().mockResolvedValue(undefined);
      const executing = repositoryExecuting({
        approveRecoveryCase,
        insertAudit,
        lockAdminUser: vi.fn().mockResolvedValue(
          subjectShape === undefined
            ? undefined
            : {
                authorizationVersion: 1,
                createdAt: NOW,
                email: 'approval-subject@example.invalid',
                id: subjectId,
                role: 'SUPPORT',
                status: subjectShape.status,
                totpEnabledAt: NOW,
              },
        ),
        lockIdempotency: vi.fn().mockResolvedValue(undefined),
        lockPrincipal: vi.fn().mockResolvedValue({
          ...PRINCIPAL,
          stepUpPurpose: 'RECOVERY_APPROVAL',
        }),
        lockRecoveryCase: vi.fn().mockResolvedValue({
          approverAdminUserId: null,
          cancelledAt: null,
          createdAt: NOW,
          creatorAdminUserId: creatorIsPrincipal
            ? PRINCIPAL.adminUserId
            : '00000000-0000-4000-8000-000000000051',
          expiresAt: new Date(NOW.getTime() + 60_000),
          id: '00000000-0000-4000-8000-000000000052',
          state,
          stateGeneration: 1,
          subjectAdminUserId: subjectId,
        }),
      });
      const { service } = harness({ repository: executing.repository });

      await expect(
        service.approveRecoveryCase(
          BEARER,
          'approve-recovery-priority-key',
          '00000000-0000-4000-8000-000000000052',
          { operatorReason: 'approval eligibility check', reasonCode: 'ACCOUNT_RECOVERY' },
          { requestId: `approve-${String(_label)}` },
          NOW,
        ),
      ).rejects.toMatchObject({
        code: failureCode === 'VALIDATION_ERROR' ? 'VALIDATION_ERROR' : 'RECOVERY_CASE_CONFLICT',
        disposition: 'ALREADY_DURABLE',
        status,
      });
      expect(insertAudit).toHaveBeenCalledWith(
        expect.objectContaining({ failureCode, outcome: 'REJECTED' }),
      );
      expect(approveRecoveryCase).not.toHaveBeenCalled();
    },
  );
});
