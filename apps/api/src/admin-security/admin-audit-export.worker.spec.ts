import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AdminC2TransactionError } from '../database/admin-c2-transaction.service';
import { TestAdminAuditExportStorageKeyring } from './admin-audit-export-keyring';
import type {
  AdminAuditExportRepository,
  ClaimedAdminAuditExport,
} from './admin-audit-export.repository';
import { TestMemoryAdminAuditExportStorage } from './admin-audit-export-storage.port';
import type { AdminAuditExportStoragePort } from './admin-audit-export-storage.port';
import {
  AdminAuditExportWakeupProcessor,
  AdminAuditExportWorker,
} from './admin-audit-export.worker';
import type { AdminAuditExportCodec } from './admin-audit-export-codec';

function claim(): ClaimedAdminAuditExport {
  const now = Date.now();
  return {
    attemptDeadline: new Date(now + 600_000),
    attemptId: '11111111-1111-4111-8111-111111111111',
    attemptNumber: 1,
    attemptStartedAt: new Date(now),
    claimOwnerHash: 'a'.repeat(64),
    contentSha256: null,
    createdAt: new Date('2026-10-23T00:00:00.000Z'),
    creatorAdminUserId: '22222222-2222-4222-8222-222222222222',
    encryptedBytes: null,
    expiredAt: null,
    expiresAt: null,
    failedAt: null,
    failureCode: null,
    generation: 2,
    id: '33333333-3333-4333-8333-333333333333',
    leaseExpiresAt: new Date(now + 120_000),
    nextAttemptAt: null,
    objectKey: null,
    plaintextBytes: null,
    readyAt: null,
    signatureKeyId: null,
    snapshotId: '44444444-4444-4444-8444-444444444444',
    sourceAuditLogId: '55555555-5555-4555-8555-555555555555',
    stagingObjectKey: null,
    state: 'PROCESSING',
    storageKeyId: null,
  };
}

function repository(transaction: Record<string, unknown>): AdminAuditExportRepository {
  return {
    transaction: async <T>(callback: (value: Record<string, unknown>) => Promise<T>) =>
      callback(transaction),
  } as unknown as AdminAuditExportRepository;
}

describe('C2b export worker state machine', () => {
  it('drains bounded work to IDLE for one valid BullMQ wake-up', async () => {
    const processOne = vi
      .fn()
      .mockResolvedValueOnce('READY')
      .mockResolvedValueOnce('READ_LEASES_PURGED')
      .mockResolvedValueOnce('IDLE');
    const processor = new AdminAuditExportWakeupProcessor({
      processOne,
    } as unknown as AdminAuditExportWorker);

    await processor.process({
      data: { exportId: '33333333-3333-4333-8333-333333333333' },
      name: 'wake',
    } as never);

    expect(processOne).toHaveBeenCalledTimes(3);
  });

  it('runs the watchdog before claiming new work', async () => {
    const claimNext = vi.fn();
    const worker = new AdminAuditExportWorker(
      repository({
        findWatchdogCandidate: async () => ({ ...claim(), deadlineExpired: false }),
        watchdogOne: async () => 'REQUEUED',
        claimNext,
      }),
      {} as AdminAuditExportCodec,
      new TestMemoryAdminAuditExportStorage(),
      new TestAdminAuditExportStorageKeyring(),
    );
    await expect(worker.processOne()).resolves.toBe('WATCHDOG_REQUEUED');
    expect(claimNext).not.toHaveBeenCalled();
  });

  it('reconciles an unknown watchdog commit by one exact fenced resume', async () => {
    const candidate = { ...claim(), deadlineExpired: false };
    const watchdogOne = vi
      .fn()
      .mockRejectedValueOnce(new AdminC2TransactionError('COMMIT_UNKNOWN', 'lost ack'))
      .mockResolvedValueOnce('REQUEUED');
    const worker = new AdminAuditExportWorker(
      repository({
        findWatchdogCandidate: async () => candidate,
        reconcileWatchdog: async () => 'WATCHDOG_REQUIRED',
        watchdogOne,
      }),
      {} as AdminAuditExportCodec,
      new TestMemoryAdminAuditExportStorage(),
      new TestAdminAuditExportStorageKeyring(),
    );
    await expect(worker.processOne()).resolves.toBe('WATCHDOG_REQUEUED');
    expect(watchdogOne).toHaveBeenCalledTimes(2);
  });

  it('allows the third attempt to publish before its deadline', async () => {
    const claimed = { ...claim(), attemptNumber: 3 };
    const artifactBytes = Buffer.from('deterministic-zip-bytes');
    const contentSha256 = createHash('sha256').update(artifactBytes).digest('hex');
    const finishReady = vi.fn(async () => true);
    const transaction = {
      claimNext: async () => claimed,
      failureDisposition: async () => 'BUDGET_EXHAUSTED',
      findExpiredObjectCleanup: async () => undefined,
      findExpiryCandidate: async () => undefined,
      finishReady,
      heartbeat: async () => true,
      orphanStagingCutoff: async () => new Date(0),
      purgeExpiredReadLeases: async () => 0,
      purgeOneSnapshot: async () => undefined,
      remainingAttemptMilliseconds: async () => 600_000,
      snapshotEntries: async () => [],
      findWatchdogCandidate: async () => undefined,
    };
    const build = vi.fn(
      async (input: Parameters<AdminAuditExportCodec['build']>[0], signal?: AbortSignal) => {
        expect(input.exportId).toBe(claimed.id);
        signal?.throwIfAborted();
        return {
          bytes: artifactBytes,
          contentSha256,
          signatureKeyId: 'sign-key-1',
        };
      },
    );
    const codec = {
      build,
      verify: vi.fn().mockResolvedValue(undefined),
    } as unknown as AdminAuditExportCodec;
    let storedBytes: Buffer | undefined;
    const putIfAbsent = vi.fn(
      async (_objectKey: string, bytes: Uint8Array, signal?: AbortSignal): Promise<void> => {
        signal?.throwIfAborted();
        storedBytes = Buffer.from(bytes);
      },
    );
    const get = vi.fn(async (_objectKey: string, signal?: AbortSignal): Promise<Uint8Array> => {
      signal?.throwIfAborted();
      if (storedBytes === undefined) throw new Error('Object was not staged.');
      return Buffer.from(storedBytes);
    });
    const storage = {
      delete: vi.fn().mockResolvedValue(undefined),
      get,
      listStagingBefore: vi.fn().mockResolvedValue([]),
      putIfAbsent,
    } as unknown as AdminAuditExportStoragePort;
    const keyring = new TestAdminAuditExportStorageKeyring();
    const worker = new AdminAuditExportWorker(repository(transaction), codec, storage, keyring);
    await expect(worker.processOne()).resolves.toBe('READY');
    expect(finishReady).toHaveBeenCalledOnce();
    expect(putIfAbsent).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
    expect(build).toHaveBeenCalledWith(
      {
        createdAt: claimed.createdAt.toISOString(),
        entries: [],
        exportId: claimed.id,
      },
      expect.any(AbortSignal),
    );
    expect(build.mock.calls[0]?.[0]).not.toHaveProperty('readyAt');
    expect(build.mock.calls[0]?.[0]).not.toHaveProperty('expiresAt');
    const [storedKey, encryptedBytes, writeSignal] = putIfAbsent.mock.calls[0]!;
    expect(storedKey).toBe(
      `c2b/staging/${claimed.id}/${claimed.generation}/${claimed.attemptId}.zip.enc`,
    );
    expect(encryptedBytes).toBeInstanceOf(Uint8Array);
    expect(encryptedBytes.byteLength).toBeGreaterThan(artifactBytes.byteLength);
    expect(writeSignal).toBeDefined();
    expect(writeSignal?.aborted).toBe(false);
    const [readKey, readSignal] = get.mock.calls[0]!;
    expect(readKey).toBe(storedKey);
    expect(readSignal).toBeDefined();
    expect(readSignal?.aborted).toBe(false);
    expect(finishReady).toHaveBeenCalledWith(
      claimed,
      expect.objectContaining({
        objectKey: `c2b/staging/${claimed.id}/${claimed.generation}/${claimed.attemptId}.zip.enc`,
        stagingObjectKey: `c2b/staging/${claimed.id}/${claimed.generation}/${claimed.attemptId}.zip.enc`,
      }),
      expect.any(String),
      expect.any(String),
    );
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('schedules one bounded retry when artifact construction fails', async () => {
    const scheduleRetry = vi.fn(async () => true);
    const worker = new AdminAuditExportWorker(
      repository({
        claimNext: async () => claim(),
        failureDisposition: async () => 'RETRYABLE',
        findExpiredObjectCleanup: async () => undefined,
        findExpiryCandidate: async () => undefined,
        orphanStagingCutoff: async () => new Date(0),
        purgeExpiredReadLeases: async () => 0,
        purgeOneSnapshot: async () => undefined,
        remainingAttemptMilliseconds: async () => 600_000,
        scheduleRetry,
        snapshotEntries: async () => [],
        findWatchdogCandidate: async () => undefined,
      }),
      {
        build: async () => Promise.reject(new Error('provider unavailable')),
      } as unknown as AdminAuditExportCodec,
      new TestMemoryAdminAuditExportStorage(),
      new TestAdminAuditExportStorageKeyring(),
    );
    await expect(worker.processOne()).resolves.toBe('RETRY_SCHEDULED');
    expect(scheduleRetry).toHaveBeenCalledOnce();
  });

  it('routes an atomic retry fence refusal to the watchdog', async () => {
    const failureDisposition = vi
      .fn()
      .mockResolvedValueOnce('RETRYABLE')
      .mockResolvedValueOnce('RETRYABLE')
      .mockResolvedValueOnce('LEASE_EXPIRED');
    const scheduleRetry = vi.fn().mockRejectedValue(
      new AdminC2TransactionError(
        'CALLBACK_FAILED',
        'C2 transaction callback failed.',
        Object.assign(new Error('C2b export ordinary retry fence is no longer active'), {
          code: '23514',
        }),
      ),
    );
    const worker = new AdminAuditExportWorker(
      repository({
        claimNext: async () => claim(),
        failureDisposition,
        findExpiredObjectCleanup: async () => undefined,
        findExpiryCandidate: async () => undefined,
        findWatchdogCandidate: async () => undefined,
        orphanStagingCutoff: async () => new Date(0),
        purgeExpiredReadLeases: async () => 0,
        purgeOneSnapshot: async () => undefined,
        remainingAttemptMilliseconds: async () => 600_000,
        scheduleRetry,
        snapshotEntries: async () => [],
      }),
      {
        build: async () => Promise.reject(new Error('provider unavailable')),
      } as unknown as AdminAuditExportCodec,
      new TestMemoryAdminAuditExportStorage(),
      new TestAdminAuditExportStorageKeyring(),
    );
    await expect(worker.processOne()).resolves.toBe('WATCHDOG_REQUIRED');
    expect(scheduleRetry).toHaveBeenCalledWith(
      expect.objectContaining({ id: '33333333-3333-4333-8333-333333333333' }),
      expect.any(String),
    );
  });

  it.each([
    ['APPLIED', 'RECONCILED'],
    ['WATCHDOG_REQUIRED', 'WATCHDOG_REQUIRED'],
    ['STALE_FENCE', 'STALE_FENCE'],
  ] as const)(
    'routes retry COMMIT_UNKNOWN reconciliation %s without a blind second mutation',
    async (reconciliation, expected) => {
      const scheduleRetry = vi
        .fn()
        .mockRejectedValue(new AdminC2TransactionError('COMMIT_UNKNOWN', 'lost ack'));
      const worker = new AdminAuditExportWorker(
        repository({
          claimNext: async () => claim(),
          failureDisposition: async () => 'RETRYABLE',
          findExpiredObjectCleanup: async () => undefined,
          findExpiryCandidate: async () => undefined,
          findWatchdogCandidate: async () => undefined,
          orphanStagingCutoff: async () => new Date(0),
          purgeExpiredReadLeases: async () => 0,
          purgeOneSnapshot: async () => undefined,
          reconcileFailedOrRetry: async () => reconciliation,
          remainingAttemptMilliseconds: async () => 600_000,
          scheduleRetry,
          snapshotEntries: async () => [],
        }),
        {
          build: async () => Promise.reject(new Error('provider unavailable')),
        } as unknown as AdminAuditExportCodec,
        new TestMemoryAdminAuditExportStorage(),
        new TestAdminAuditExportStorageKeyring(),
      );
      await expect(worker.processOne()).resolves.toBe(expected);
      expect(scheduleRetry).toHaveBeenCalledOnce();
    },
  );

  it('preserves a deterministic integrity code on the third attempt', async () => {
    const claimed = { ...claim(), attemptNumber: 3 };
    const finishFailed = vi.fn(async () => true);
    const scheduleRetry = vi.fn(async () => true);
    const worker = new AdminAuditExportWorker(
      repository({
        claimNext: async () => claimed,
        failureDisposition: async () => 'BUDGET_EXHAUSTED',
        findExpiredObjectCleanup: async () => undefined,
        findExpiryCandidate: async () => undefined,
        finishFailed,
        heartbeat: async () => true,
        orphanStagingCutoff: async () => new Date(0),
        purgeExpiredReadLeases: async () => 0,
        purgeOneSnapshot: async () => undefined,
        remainingAttemptMilliseconds: async () => 600_000,
        scheduleRetry,
        snapshotEntries: async () => [],
        findWatchdogCandidate: async () => undefined,
      }),
      {
        build: async () => ({
          bytes: Buffer.from('invalid-artifact'),
          contentSha256: 'a'.repeat(64),
          signatureKeyId: 'sign-key-1',
        }),
        verify: async () => Promise.reject(new TypeError('invalid JWS')),
      } as unknown as AdminAuditExportCodec,
      new TestMemoryAdminAuditExportStorage(),
      new TestAdminAuditExportStorageKeyring(),
    );
    await expect(worker.processOne()).resolves.toBe('FAILED');
    expect(scheduleRetry).not.toHaveBeenCalled();
    expect(finishFailed).toHaveBeenCalledWith(
      claimed,
      'INTEGRITY_FAILED',
      expect.any(String),
      expect.any(String),
    );
  });

  it('terminalizes a retryable third-attempt failure with the exhausted budget code', async () => {
    const claimed = { ...claim(), attemptNumber: 3 };
    const finishFailed = vi.fn(async () => true);
    const worker = new AdminAuditExportWorker(
      repository({
        claimNext: async () => claimed,
        failureDisposition: async () => 'BUDGET_EXHAUSTED',
        findExpiredObjectCleanup: async () => undefined,
        findExpiryCandidate: async () => undefined,
        findWatchdogCandidate: async () => undefined,
        finishFailed,
        orphanStagingCutoff: async () => new Date(0),
        purgeExpiredReadLeases: async () => 0,
        purgeOneSnapshot: async () => undefined,
        remainingAttemptMilliseconds: async () => 600_000,
        snapshotEntries: async () => [],
      }),
      {
        build: async () => Promise.reject(new Error('provider unavailable')),
      } as unknown as AdminAuditExportCodec,
      new TestMemoryAdminAuditExportStorage(),
      new TestAdminAuditExportStorageKeyring(),
    );
    await expect(worker.processOne()).resolves.toBe('FAILED');
    expect(finishFailed).toHaveBeenCalledWith(
      claimed,
      'RETRY_BUDGET_EXHAUSTED',
      expect.any(String),
      expect.any(String),
    );
  });

  it('routes an expired first attempt to the watchdog without terminalizing it', async () => {
    const finishFailed = vi.fn(async () => true);
    const worker = new AdminAuditExportWorker(
      repository({
        claimNext: async () => claim(),
        failureDisposition: async () => 'DEADLINE_EXPIRED',
        findExpiredObjectCleanup: async () => undefined,
        findExpiryCandidate: async () => undefined,
        findWatchdogCandidate: async () => undefined,
        finishFailed,
        heartbeat: async () => true,
        orphanStagingCutoff: async () => new Date(0),
        purgeExpiredReadLeases: async () => 0,
        purgeOneSnapshot: async () => undefined,
        remainingAttemptMilliseconds: async () => 1,
        snapshotEntries: async () => [],
      }),
      {
        build: async () => new Promise(() => undefined),
      } as unknown as AdminAuditExportCodec,
      new TestMemoryAdminAuditExportStorage(),
      new TestAdminAuditExportStorageKeyring(),
    );
    await expect(worker.processOne()).resolves.toBe('WATCHDOG_REQUIRED');
    expect(finishFailed).not.toHaveBeenCalled();
  });

  it('resumes the exact READY CAS once after COMMIT_UNKNOWN with the same live fence', async () => {
    const claimed = claim();
    const artifactBytes = Buffer.from('deterministic-zip-bytes');
    const contentSha256 = createHash('sha256').update(artifactBytes).digest('hex');
    const finishReady = vi
      .fn()
      .mockRejectedValueOnce(new AdminC2TransactionError('COMMIT_UNKNOWN', 'lost ack'))
      .mockResolvedValueOnce(true);
    const worker = new AdminAuditExportWorker(
      repository({
        claimNext: async () => claimed,
        failureDisposition: async () => 'RETRYABLE',
        findExpiredObjectCleanup: async () => undefined,
        findExpiryCandidate: async () => undefined,
        findWatchdogCandidate: async () => undefined,
        finishReady,
        heartbeat: async () => true,
        orphanStagingCutoff: async () => new Date(0),
        purgeExpiredReadLeases: async () => 0,
        purgeOneSnapshot: async () => undefined,
        reconcileReady: async () => 'ACTIVE',
        remainingAttemptMilliseconds: async () => 600_000,
        snapshotEntries: async () => [],
      }),
      {
        build: async () => ({ bytes: artifactBytes, contentSha256, signatureKeyId: 'sign-key-1' }),
        verify: vi.fn().mockResolvedValue(undefined),
      } as unknown as AdminAuditExportCodec,
      new TestMemoryAdminAuditExportStorage(),
      new TestAdminAuditExportStorageKeyring(),
    );
    await expect(worker.processOne()).resolves.toBe('READY');
    expect(finishReady).toHaveBeenCalledTimes(2);
  });

  it('expires in PostgreSQL before deleting the final object on the next bounded pass', async () => {
    const candidate = {
      ...claim(),
      expiresAt: new Date(Date.now() - 1),
      objectKey:
        'c2b/staging/33333333-3333-4333-8333-333333333333/2/11111111-1111-4111-8111-111111111111.zip.enc',
      state: 'READY' as const,
    };
    const expire = vi.fn(async () => true);
    const worker = new AdminAuditExportWorker(
      repository({
        expire,
        findExpiredObjectCleanup: async () => undefined,
        findExpiryCandidate: async () => candidate,
        orphanStagingCutoff: async () => new Date(0),
        purgeExpiredReadLeases: async () => 0,
        purgeOneSnapshot: async () => undefined,
        findWatchdogCandidate: async () => undefined,
      }),
      {} as AdminAuditExportCodec,
      new TestMemoryAdminAuditExportStorage(),
      new TestAdminAuditExportStorageKeyring(),
    );
    await expect(worker.processOne()).resolves.toBe('EXPIRED');
    expect(expire).toHaveBeenCalledOnce();
  });

  it('deletes only a database-qualified staging orphan older than the PostgreSQL cutoff', async () => {
    const objectKey =
      'c2b/staging/33333333-3333-4333-8333-333333333333/2/11111111-1111-4111-8111-111111111111.zip.enc';
    const remove = vi.fn().mockResolvedValue(undefined);
    const worker = new AdminAuditExportWorker(
      repository({
        findExpiredObjectCleanup: async () => undefined,
        findWatchdogCandidate: async () => undefined,
        isOrphanStagingObject: async () => true,
        orphanStagingCutoff: async () => new Date('2026-10-22T00:00:00.000Z'),
        purgeExpiredReadLeases: async () => 0,
        purgeOneSnapshot: async () => undefined,
      }),
      {} as AdminAuditExportCodec,
      {
        delete: remove,
        get: vi.fn(),
        listStagingBefore: vi
          .fn()
          .mockResolvedValue([{ lastModifiedAt: new Date('2026-10-21T23:59:59.000Z'), objectKey }]),
        putIfAbsent: vi.fn(),
      } as AdminAuditExportStoragePort,
      new TestAdminAuditExportStorageKeyring(),
    );
    await expect(worker.processOne()).resolves.toBe('ORPHAN_STAGING_DELETED');
    expect(remove).toHaveBeenCalledWith(objectKey, expect.any(AbortSignal));
  });

  it('bounds housekeeping storage calls and aborts a non-responsive delete', async () => {
    vi.useFakeTimers();
    try {
      const objectKey =
        'c2b/staging/33333333-3333-4333-8333-333333333333/2/11111111-1111-4111-8111-111111111111.zip.enc';
      let observedSignal: AbortSignal | undefined;
      const worker = new AdminAuditExportWorker(
        repository({
          findExpiredObjectCleanup: async () => ({ ...claim(), stagingObjectKey: objectKey }),
          findWatchdogCandidate: async () => undefined,
        }),
        {} as AdminAuditExportCodec,
        {
          delete: vi.fn(async (_key: string, signal?: AbortSignal) => {
            observedSignal = signal;
            return new Promise<void>(() => undefined);
          }),
          get: vi.fn(),
          listStagingBefore: vi.fn().mockResolvedValue([]),
          putIfAbsent: vi.fn(),
        } as AdminAuditExportStoragePort,
        new TestAdminAuditExportStorageKeyring(),
      );
      const pending = worker.processOne();
      const rejection = expect(pending).rejects.toThrow('external dependency deadline expired');
      await vi.advanceTimersByTimeAsync(5_001);
      await rejection;
      expect(observedSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
