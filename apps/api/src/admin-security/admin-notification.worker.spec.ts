import { describe, expect, it, vi } from 'vitest';
import type { AdminNotificationPort } from './admin-notification.port';
import type { AdminSecurityCrypto } from './admin-security.crypto';
import { AdminSecurityCryptoError } from './admin-security.crypto';
import {
  ADMIN_NOTIFICATION_POLICY,
  AdminNotificationActivationGate,
  AdminNotificationWorker,
  AdminNotificationWakeupProcessor,
  BullAdminNotificationWakeup,
} from './admin-notification.worker';
import type {
  AdminNotificationOutboxRecord,
  AdminSecurityRepository,
  AdminSecurityTransactionRepository,
} from './admin-security.repository';

const NOW = new Date('2026-10-17T12:00:00.000Z');

interface NotificationWorkerFixture {
  readonly claimNextNotification: ReturnType<typeof vi.fn>;
  readonly crypto: AdminSecurityCrypto;
  readonly deliver: ReturnType<typeof vi.fn>;
  readonly finishNotification: ReturnType<typeof vi.fn>;
  readonly instance: AdminNotificationWorker;
  readonly port: AdminNotificationPort;
  readonly terminalizeExpiredNotificationClaims: ReturnType<typeof vi.fn>;
}

function claimed(
  overrides: Partial<AdminNotificationOutboxRecord> = {},
): AdminNotificationOutboxRecord {
  return {
    aadHash: 'a'.repeat(64),
    adminInvitationId: null,
    attemptCount: 1,
    claimOwnerHash: 'owner',
    delegatedByAdminUserId: null,
    encryptedPayload: 'ciphertext',
    encryptionKeyId: 'test-key',
    encryptionNonce: 'nonce',
    encryptionTag: 'tag',
    generation: 2,
    id: 'outbox-id',
    leaseExpiresAt: new Date('2026-10-16T10:01:00.000Z'),
    nextAttemptAt: null,
    passwordResetRequestId: 'reset-id',
    purpose: 'PASSWORD_RESET',
    sourceAuditLogId: null,
    sourceSecurityEventId: 'security-event-id',
    sourceValid: true,
    state: 'CLAIMED',
    ...overrides,
  };
}

function workerFixture(options?: {
  claim?: AdminNotificationOutboxRecord;
  decryptError?: Error;
  delivery?: Awaited<ReturnType<AdminNotificationPort['deliver']>>;
  deliveryError?: Error;
  finishChanged?: boolean;
}): NotificationWorkerFixture {
  const finishNotification = vi.fn().mockResolvedValue(options?.finishChanged ?? true);
  const terminalizeExpiredNotificationClaims = vi.fn().mockResolvedValue(0);
  const claimNextNotification = vi.fn().mockResolvedValue(options?.claim);
  const repository = {
    transaction: vi.fn(
      async <T>(callback: (value: AdminSecurityTransactionRepository) => Promise<T>): Promise<T> =>
        callback({
          claimNextNotification,
          finishNotification,
          terminalizeExpiredNotificationClaims,
        } as unknown as AdminSecurityTransactionRepository),
    ),
  } as unknown as AdminSecurityRepository;
  const decryptOutboxPayloadRecord = options?.decryptError
    ? vi.fn().mockRejectedValue(options.decryptError)
    : vi.fn().mockResolvedValue({ destination: 'opaque', template: 'reset' });
  const crypto = {
    assertOutboxAvailable: vi.fn().mockResolvedValue(undefined),
    decryptOutboxPayloadRecord,
  } as unknown as AdminSecurityCrypto;
  const deliver = options?.deliveryError
    ? vi.fn().mockRejectedValue(options.deliveryError)
    : vi
        .fn()
        .mockResolvedValue(
          options?.delivery ?? { acknowledgement: 'acknowledgement', kind: 'ACCEPTED' },
        );
  const port = {
    assertConfigured: vi.fn().mockResolvedValue(undefined),
    deliver,
    reconcile: vi.fn().mockResolvedValue('UNKNOWN'),
  } as AdminNotificationPort;
  return {
    claimNextNotification,
    crypto,
    deliver,
    finishNotification,
    instance: new AdminNotificationWorker(repository, crypto, port),
    port,
    terminalizeExpiredNotificationClaims,
  };
}

describe('AdminNotificationWorker', () => {
  it('qualifies both provider and keyring before readiness', async () => {
    const fixture = workerFixture();
    await fixture.instance.assertReady();
    expect(fixture.port.assertConfigured).toHaveBeenCalledOnce();
    expect(fixture.crypto.assertOutboxAvailable).toHaveBeenCalledOnce();
  });

  it('terminalizes expired claims before atomically claiming one durable outbox', async () => {
    const now = new Date('2026-10-16T10:00:00.000Z');
    const fixture = workerFixture();
    await expect(fixture.instance.processOne(now)).resolves.toBe('IDLE');
    expect(fixture.terminalizeExpiredNotificationClaims).toHaveBeenCalledWith(now);
    expect(fixture.claimNextNotification).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/u),
      now,
      new Date(now.getTime() + ADMIN_NOTIFICATION_POLICY.leaseMs),
    );
    expect(fixture.deliver).not.toHaveBeenCalled();
  });

  it('uses the stable logical delivery id and persists only a correlated acknowledgement hash', async () => {
    const now = new Date('2026-10-16T10:00:00.000Z');
    const rawAcknowledgement = 'RAW_PROVIDER_ACK_CANARY_74f5e2';
    const fixture = workerFixture({
      claim: claimed(),
      delivery: { acknowledgement: rawAcknowledgement, kind: 'ACCEPTED' },
    });
    await expect(fixture.instance.processOne(now)).resolves.toBe('DELIVERED');
    expect(fixture.deliver).toHaveBeenCalledWith({
      logicalDeliveryId: 'outbox-id',
      payload: { destination: 'opaque', template: 'reset' },
      purpose: 'PASSWORD_RESET',
      signal: expect.any(AbortSignal),
    });
    expect(fixture.finishNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        acknowledgementHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        generation: 2,
        id: 'outbox-id',
        now: expect.any(Date),
        state: 'DELIVERED',
      }),
    );
    expect(JSON.stringify(fixture.finishNotification.mock.calls)).not.toContain(rawAcknowledgement);
  });

  it('retries only a proven pre-acceptance failure and keeps provider uncertainty terminal', async () => {
    const now = new Date('2026-10-16T10:00:00.000Z');
    const retry = workerFixture({
      claim: claimed(),
      delivery: { kind: 'NOT_ACCEPTED', retryable: true },
    });
    await expect(retry.instance.processOne(now)).resolves.toBe('RETRY_SCHEDULED');
    const retryFinish = retry.finishNotification.mock.calls[0]?.[0] as
      { nextAttemptAt: Date; now: Date; state: string } | undefined;
    expect(retryFinish?.state).toBe('PENDING');
    expect(retryFinish?.nextAttemptAt.getTime()).toBe((retryFinish?.now.getTime() ?? 0) + 30_000);

    const uncertain = workerFixture({
      claim: claimed(),
      deliveryError: new Error('connection lost after call began'),
    });
    await expect(uncertain.instance.processOne(now)).resolves.toBe('DELIVERY_UNCERTAIN');
    expect(uncertain.finishNotification).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'DELIVERY_UNCERTAIN' }),
    );
  });

  it.each([
    [1, 30_000],
    [2, 120_000],
    [3, 600_000],
    [4, 1_800_000],
  ] as const)(
    'applies the complete retry backoff after attempt %i',
    async (attemptCount, delayMs) => {
      const fixture = workerFixture({
        claim: claimed({ attemptCount }),
        delivery: { kind: 'NOT_ACCEPTED', retryable: true },
      });
      await expect(fixture.instance.processOne(NOW)).resolves.toBe('RETRY_SCHEDULED');
      const completion = fixture.finishNotification.mock.calls[0]?.[0] as
        { nextAttemptAt: Date; now: Date; state: string } | undefined;
      expect(completion?.state).toBe('PENDING');
      expect(completion?.nextAttemptAt.getTime()).toBe((completion?.now.getTime() ?? 0) + delayMs);
    },
  );

  it('closes the fifth failed attempt without scheduling a sixth delivery', async () => {
    const fixture = workerFixture({
      claim: claimed({ attemptCount: ADMIN_NOTIFICATION_POLICY.maximumAttempts }),
      delivery: { kind: 'NOT_ACCEPTED', retryable: true },
    });
    await expect(fixture.instance.processOne(NOW)).resolves.toBe('FAILED');
    expect(fixture.finishNotification).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'FAILED' }),
    );
    expect(fixture.finishNotification.mock.calls[0]?.[0]).not.toHaveProperty('nextAttemptAt');
  });

  it('cuts off a suspended provider at ten seconds and ignores its late acknowledgement', async () => {
    vi.useFakeTimers();
    try {
      let resolveDelivery:
        ((value: { acknowledgement: string; kind: 'ACCEPTED' }) => void) | undefined;
      const fixture = workerFixture({ claim: claimed() });
      fixture.deliver.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveDelivery = resolve;
        }),
      );
      const outcome = fixture.instance.processOne(NOW);
      await vi.advanceTimersByTimeAsync(ADMIN_NOTIFICATION_POLICY.providerDeadlineMs - 1);
      expect(fixture.finishNotification).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await expect(outcome).resolves.toBe('DELIVERY_UNCERTAIN');
      expect(fixture.finishNotification).toHaveBeenCalledTimes(1);
      expect(fixture.finishNotification).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'DELIVERY_UNCERTAIN' }),
      );
      const delivery = fixture.deliver.mock.calls[0]?.[0] as { signal: AbortSignal } | undefined;
      expect(delivery?.signal.aborted).toBe(true);

      resolveDelivery?.({ acknowledgement: 'late-acknowledgement', kind: 'ACCEPTED' });
      await Promise.resolve();
      await Promise.resolve();
      expect(fixture.finishNotification).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats decryption failure as proven pre-call and fences stale completions', async () => {
    const beforeCall = workerFixture({
      claim: claimed(),
      decryptError: new AdminSecurityCryptoError(),
    });
    await expect(beforeCall.instance.processOne()).resolves.toBe('RETRY_SCHEDULED');
    expect(beforeCall.deliver).not.toHaveBeenCalled();

    const stale = workerFixture({ claim: claimed(), finishChanged: false });
    await expect(stale.instance.processOne()).resolves.toBe('STALE_FENCE');
  });

  it('does not overlap two scans in one process', async () => {
    let resolveClaim: ((value: undefined) => void) | undefined;
    const pendingClaim = new Promise<undefined>((resolve) => {
      resolveClaim = resolve;
    });
    const fixture = workerFixture();
    fixture.claimNextNotification.mockReturnValueOnce(pendingClaim);
    const first = fixture.instance.processOne();
    const second = fixture.instance.processOne();
    expect(second).toBe(first);
    resolveClaim?.(undefined);
    await expect(first).resolves.toBe('IDLE');
    expect(fixture.claimNextNotification).toHaveBeenCalledOnce();
  });

  it('clears the quiescence timer and distinguishes completion from failure', async () => {
    vi.useFakeTimers();
    try {
      let resolveClaim: ((value: undefined) => void) | undefined;
      const completedFixture = workerFixture();
      completedFixture.claimNextNotification.mockReturnValueOnce(
        new Promise<undefined>((resolve) => {
          resolveClaim = resolve;
        }),
      );
      const completed = completedFixture.instance.processOne();
      const completedQuiescence = completedFixture.instance.awaitQuiescence(30_000);
      resolveClaim?.(undefined);
      await expect(completed).resolves.toBe('IDLE');
      await expect(completedQuiescence).resolves.toBe('QUIESCED');
      expect(vi.getTimerCount()).toBe(0);

      let rejectClaim: ((error: Error) => void) | undefined;
      const failedFixture = workerFixture();
      failedFixture.claimNextNotification.mockReturnValueOnce(
        new Promise<never>((_resolve, reject) => {
          rejectClaim = reject;
        }),
      );
      const failed = failedFixture.instance.processOne();
      const failedQuiescence = failedFixture.instance.awaitQuiescence(30_000);
      rejectClaim?.(new Error('controlled claim failure'));
      await expect(failed).rejects.toThrow('controlled claim failure');
      await expect(failedQuiescence).resolves.toBe('FAILED');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('BullAdminNotificationWakeup', () => {
  const opaqueSignalId = '00000000-0000-4000-8000-000000000001';

  it('publishes only an opaque identifier with deterministic cleanup metadata', async () => {
    const add = vi.fn().mockResolvedValue(undefined);
    const wakeup = new BullAdminNotificationWakeup({ add } as never);
    await expect(wakeup.notify(opaqueSignalId)).resolves.toBe(true);
    expect(add).toHaveBeenCalledWith(
      'wake',
      { opaqueSignalId },
      {
        jobId: expect.stringMatching(/^[a-f0-9]{64}$/u),
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    expect(JSON.stringify(add.mock.calls)).not.toContain('email');
    await expect(wakeup.notify('not-an-opaque-uuid')).resolves.toBe(false);
    expect(add).toHaveBeenCalledOnce();
  });

  it('fails softly when Redis is unavailable because PostgreSQL remains the source of truth', async () => {
    const wakeup = new BullAdminNotificationWakeup({
      add: vi.fn().mockRejectedValue(new Error('redis unavailable')),
    } as never);
    await expect(wakeup.notify(opaqueSignalId)).resolves.toBe(false);
  });

  it('bounds a Redis command that never settles', async () => {
    vi.useFakeTimers();
    try {
      const wakeup = new BullAdminNotificationWakeup({
        add: vi.fn(() => new Promise(() => undefined)),
      } as never);
      const outcome = wakeup.notify(opaqueSignalId);
      await vi.advanceTimersByTimeAsync(ADMIN_NOTIFICATION_POLICY.wakeupDeadlineMs);
      await expect(outcome).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AdminNotificationWakeupProcessor', () => {
  const opaqueSignalId = '00000000-0000-4000-8000-000000000002';

  it('rejects non-exact jobs and drains one durable record per valid signal', async () => {
    const processOne = vi.fn().mockResolvedValue('DELIVERED');
    const notify = vi.fn().mockResolvedValue(true);
    const activation = new AdminNotificationActivationGate();
    activation.activate();
    const processor = new AdminNotificationWakeupProcessor(
      { processOne } as never,
      { notify },
      activation,
    );
    await expect(
      processor.process({ name: 'wake', data: { opaqueSignalId, forbidden: 'payload' } } as never),
    ).rejects.toThrow('Invalid C2a notification wake-up job.');
    await expect(
      processor.process({ name: 'wake', data: { opaqueSignalId } } as never),
    ).resolves.toBe(undefined);
    expect(processor.processedSignalCount()).toBe(1);
    expect(processOne).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/u));
  });

  it('does not enqueue another signal when the durable outbox is idle', async () => {
    const processOne = vi.fn().mockResolvedValue('IDLE');
    const notify = vi.fn().mockResolvedValue(true);
    const activation = new AdminNotificationActivationGate();
    activation.activate();
    const processor = new AdminNotificationWakeupProcessor(
      { processOne } as never,
      { notify },
      activation,
    );
    await processor.process({ name: 'wake', data: { opaqueSignalId } } as never);
    expect(processor.processedSignalCount()).toBe(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('cannot touch PostgreSQL until the qualified runner explicitly activates it', async () => {
    const processOne = vi.fn().mockResolvedValue('DELIVERED');
    const notify = vi.fn().mockResolvedValue(true);
    const activation = new AdminNotificationActivationGate();
    const processor = new AdminNotificationWakeupProcessor(
      { processOne } as never,
      { notify },
      activation,
    );
    await processor.process({ name: 'wake', data: { opaqueSignalId } } as never);
    expect(processor.processedSignalCount()).toBe(0);
    expect(processOne).not.toHaveBeenCalled();
    activation.activate();
    await processor.process({ name: 'wake', data: { opaqueSignalId } } as never);
    expect(processor.processedSignalCount()).toBe(1);
    expect(processOne).toHaveBeenCalledOnce();
    activation.deactivate();
    await processor.process({ name: 'wake', data: { opaqueSignalId } } as never);
    expect(processor.processedSignalCount()).toBe(1);
    expect(processOne).toHaveBeenCalledOnce();
  });
});
