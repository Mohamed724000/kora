import { describe, expect, it, vi } from 'vitest';
import canonicalize from 'canonicalize';
import { createHash } from 'node:crypto';
import { AdminC2TransactionError } from '../database/admin-c2-transaction.service';
import type { AdminAuditAuthorizationService } from './admin-audit.authorization.service';
import type {
  AdminAuditExportRecord,
  AdminAuditPrincipal,
  AdminAuditRepository,
  AdminAuditTransactionRepository,
} from './admin-audit.repository';
import type { AdminAuditExportCodec } from './admin-audit-export-codec';
import {
  encryptAdminAuditExport,
  TestAdminAuditExportStorageKeyring,
} from './admin-audit-export-keyring';
import type { AdminAuditExportStoragePort } from './admin-audit-export-storage.port';
import {
  AdminAuditExportService,
  type AdminAuditExportWakeupPort,
} from './admin-audit-export.service';
import type { AdminAuditExportCreateInput } from './admin-audit.types';
import type { AdminC2BearerProof } from './admin-security.types';

const NOW = new Date('2026-10-23T12:00:00.000Z');
const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
const SESSION_ID = '00000000-0000-4000-8000-000000000002';
const EXPORT_ID = '00000000-0000-4000-8000-000000000003';
const ATTEMPT_ID = '00000000-0000-4000-8000-000000000004';
const PROOF: AdminC2BearerProof = {
  adminUserId: ADMIN_ID,
  authorizationVersion: 3,
  expiresAtSeconds: Math.floor(NOW.getTime() / 1000) + 3_600,
  issuedAtSeconds: Math.floor(NOW.getTime() / 1000) - 60,
  role: 'SUPER_ADMIN',
  sessionId: SESSION_ID,
  tokenId: 'token-jti',
};
const PRINCIPAL = { adminUserId: ADMIN_ID, sessionId: SESSION_ID } as AdminAuditPrincipal;
const INPUT: AdminAuditExportCreateInput = {
  from: '2026-10-22T00:00:00.000Z',
  operatorReason: 'approved export',
  reasonCode: 'AUDIT_EXPORT',
  to: '2026-10-23T00:00:00.000Z',
};

function record(overrides: Partial<AdminAuditExportRecord> = {}): AdminAuditExportRecord {
  return {
    attemptDeadline: null,
    attemptId: null,
    attemptNumber: 1,
    attemptStartedAt: null,
    claimOwnerHash: null,
    contentSha256: null,
    createdAt: NOW,
    creatorAdminUserId: ADMIN_ID,
    encryptedBytes: null,
    expiredAt: null,
    expiresAt: null,
    failedAt: null,
    failureCode: null,
    generation: 1,
    id: EXPORT_ID,
    leaseExpiresAt: null,
    nextAttemptAt: NOW,
    objectKey: null,
    plaintextBytes: null,
    readyAt: null,
    signatureKeyId: null,
    snapshotId: '00000000-0000-4000-8000-000000000005',
    sourceAuditLogId: '00000000-0000-4000-8000-000000000006',
    stagingObjectKey: null,
    state: 'PENDING',
    storageKeyId: null,
    ...overrides,
  };
}

function authorization(): AdminAuditAuthorizationService {
  return {
    authorize: vi.fn().mockResolvedValue(PRINCIPAL),
    verifyBearer: vi.fn().mockResolvedValue(PROOF),
  } as unknown as AdminAuditAuthorizationService;
}

function service(
  repository: AdminAuditRepository,
  options: Readonly<{
    authorization?: AdminAuditAuthorizationService;
    codec?: Partial<AdminAuditExportCodec>;
    keyring?: TestAdminAuditExportStorageKeyring;
    storage?: Partial<AdminAuditExportStoragePort>;
    wakeup?: Partial<AdminAuditExportWakeupPort>;
  }> = {},
): AdminAuditExportService {
  return new AdminAuditExportService(
    repository,
    options.authorization ?? authorization(),
    {
      notify: vi.fn().mockResolvedValue(true),
      ...options.wakeup,
    } as AdminAuditExportWakeupPort,
    {
      delete: vi.fn(),
      get: vi.fn(),
      listStagingBefore: vi.fn().mockResolvedValue([]),
      putIfAbsent: vi.fn(),
      ...options.storage,
    } as AdminAuditExportStoragePort,
    options.keyring ?? new TestAdminAuditExportStorageKeyring(),
    {
      verify: vi.fn().mockResolvedValue(undefined),
      ...options.codec,
    } as unknown as AdminAuditExportCodec,
  );
}

describe('AdminAuditExportService', () => {
  it('commits snapshot, export, idempotency and audit before notifying BullMQ', async () => {
    const order: string[] = [];
    const transaction = {
      findActiveIdempotency: vi.fn().mockResolvedValue(undefined),
      getExport: vi.fn().mockResolvedValue(record()),
      insertExport: vi.fn().mockResolvedValue(undefined),
      insertHttpAudit: vi.fn().mockResolvedValue('audit-id'),
      insertSnapshot: vi.fn().mockResolvedValue('snapshot-id'),
      lockExportIdempotency: vi.fn().mockResolvedValue(undefined),
      selectProjection: vi.fn().mockResolvedValue([]),
    } as unknown as AdminAuditTransactionRepository;
    const repository = {
      transaction: vi.fn(async (callback) => {
        const result = await callback(transaction);
        order.push('commit');
        return result;
      }),
    } as unknown as AdminAuditRepository;
    const notify = vi.fn(async () => {
      order.push('wakeup');
      return true;
    });
    await expect(
      service(repository, { wakeup: { notify } }).create(
        `Bearer ${'a'.repeat(32)}`,
        'idempotency-key-0001',
        INPUT,
        'request-create',
        NOW,
      ),
    ).resolves.toMatchObject({ state: 'PENDING' });
    expect(order).toEqual(['commit', 'wakeup']);
    expect(transaction.lockExportIdempotency).toHaveBeenCalledWith(
      expect.any(String),
      'idempotency-key-0001',
    );
    expect(transaction.insertExport).toHaveBeenCalledOnce();
    expect(transaction.insertHttpAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'createAdminAuditLogExport', outcome: 'SUCCESS' }),
    );
  });

  it('reconciles a committed create once after COMMIT_UNKNOWN without exposing the export', async () => {
    const requestDigest = createHash('sha256').update(canonicalize(INPUT)!, 'utf8').digest('hex');
    let insertedExportId: string | undefined;
    let idempotencyReads = 0;
    const transaction = {
      findActiveIdempotency: vi.fn(async () => {
        idempotencyReads += 1;
        return idempotencyReads === 1 ? undefined : { exportId: insertedExportId!, requestDigest };
      }),
      getExport: vi.fn(async (id: string) => record({ id })),
      insertExport: vi.fn(async (input: { exportId: string }) => {
        insertedExportId = input.exportId;
      }),
      insertHttpAudit: vi.fn().mockResolvedValue('audit-id'),
      insertSnapshot: vi.fn().mockResolvedValue('snapshot-id'),
      lockExportIdempotency: vi.fn().mockResolvedValue(undefined),
      selectProjection: vi.fn().mockResolvedValue([]),
    } as unknown as AdminAuditTransactionRepository;
    let calls = 0;
    const repository = {
      transaction: vi.fn(async (callback) => {
        calls += 1;
        const result = await callback(transaction);
        if (calls === 1) {
          throw new AdminC2TransactionError('COMMIT_UNKNOWN', 'commit acknowledgement missing');
        }
        return result;
      }),
    } as unknown as AdminAuditRepository;
    const notify = vi.fn().mockResolvedValue(true);

    await expect(
      service(repository, { wakeup: { notify } }).create(
        `Bearer ${'a'.repeat(32)}`,
        'idempotency-key-commit-unknown',
        INPUT,
        'request-commit-unknown-create',
        NOW,
      ),
    ).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      disposition: 'COMMIT_UNKNOWN_NO_SECOND_SINK',
    });
    expect(repository.transaction).toHaveBeenCalledTimes(2);
    expect(transaction.insertExport).toHaveBeenCalledOnce();
    expect(transaction.insertHttpAudit).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(insertedExportId, expect.any(AbortSignal));
  });

  it('durably rejects a reused idempotency key with a different payload', async () => {
    const insertHttpAudit = vi.fn().mockResolvedValue('audit-id');
    const transaction = {
      findActiveIdempotency: vi.fn().mockResolvedValue({
        exportId: EXPORT_ID,
        requestDigest: 'f'.repeat(64),
      }),
      insertHttpAudit,
      lockExportIdempotency: vi.fn().mockResolvedValue(undefined),
    } as unknown as AdminAuditTransactionRepository;
    const repository = {
      transaction: vi.fn(async (callback) => callback(transaction)),
    } as unknown as AdminAuditRepository;
    await expect(
      service(repository).create(
        `Bearer ${'a'.repeat(32)}`,
        'idempotency-key-0001',
        INPUT,
        'request-conflict',
        NOW,
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT', disposition: 'ALREADY_DURABLE' });
    expect(insertHttpAudit).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'IDEMPOTENCY_CONFLICT', outcome: 'REJECTED' }),
    );
  });

  it('verifies the exact decrypted ZIP and JWS before committing the success audit', async () => {
    const order: string[] = [];
    const plaintext = Buffer.from('qualified zip bytes');
    const contentSha256 = await import('node:crypto').then(({ createHash }) =>
      createHash('sha256').update(plaintext).digest('hex'),
    );
    const keyring = new TestAdminAuditExportStorageKeyring();
    const ready = record({
      contentSha256,
      encryptedBytes: 500,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      generation: 2,
      nextAttemptAt: null,
      objectKey: `c2b/staging/${EXPORT_ID}/2/${ATTEMPT_ID}.zip.enc`,
      plaintextBytes: plaintext.byteLength,
      readyAt: NOW,
      signatureKeyId: 'test-ed25519-key-v1',
      stagingObjectKey: `c2b/staging/${EXPORT_ID}/2/${ATTEMPT_ID}.zip.enc`,
      state: 'READY',
      storageKeyId: 'test-storage-key-v1',
    });
    const encrypted = await encryptAdminAuditExport(keyring, plaintext, {
      attemptId: ATTEMPT_ID,
      contentSha256,
      exportId: EXPORT_ID,
      generation: '2',
      plaintextBytes: plaintext.byteLength,
      signatureKeyId: 'test-ed25519-key-v1',
    });
    const insertHttpAudit = vi.fn(async (input: { outcome: string }) => {
      order.push(`audit:${input.outcome}`);
      return 'audit-id';
    });
    const transaction = {
      acquireReadLease: vi.fn().mockResolvedValue('lease-id'),
      getExportForDownload: vi.fn().mockResolvedValue({ ...ready, downloadStatus: 'READY' }),
      insertHttpAudit,
      releaseReadLease: vi.fn().mockResolvedValue(undefined),
      renewReadLease: vi.fn().mockResolvedValue(true),
    } as unknown as AdminAuditTransactionRepository;
    const repository = {
      transaction: vi.fn(async (callback) => callback(transaction)),
    } as unknown as AdminAuditRepository;
    const verify = vi.fn(async () => {
      order.push('integrity');
    });
    const selected = service(repository, {
      codec: { verify },
      keyring,
      storage: { get: vi.fn().mockResolvedValue(encrypted.bytes) },
    });
    const delivery = await selected.download(
      `Bearer ${'a'.repeat(32)}`,
      EXPORT_ID,
      'request-download',
      NOW,
    );
    expect(delivery.bytes.equals(plaintext)).toBe(true);
    expect(order).toEqual(['integrity', 'audit:SUCCESS']);
    expect(verify).toHaveBeenCalledOnce();
    await delivery.release();
    expect(transaction.releaseReadLease).toHaveBeenCalledWith('lease-id');
  });

  it('records one durable integrity rejection and no success audit for a mutated ZIP', async () => {
    const plaintext = Buffer.from('mutated zip bytes');
    const contentSha256 = await import('node:crypto').then(({ createHash }) =>
      createHash('sha256').update(plaintext).digest('hex'),
    );
    const keyring = new TestAdminAuditExportStorageKeyring();
    const ready = record({
      contentSha256,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      generation: 2,
      nextAttemptAt: null,
      objectKey: `c2b/staging/${EXPORT_ID}/2/${ATTEMPT_ID}.zip.enc`,
      plaintextBytes: plaintext.byteLength,
      readyAt: NOW,
      signatureKeyId: 'test-ed25519-key-v1',
      state: 'READY',
      storageKeyId: 'test-storage-key-v1',
    });
    const encrypted = await encryptAdminAuditExport(keyring, plaintext, {
      attemptId: ATTEMPT_ID,
      contentSha256,
      exportId: EXPORT_ID,
      generation: '2',
      plaintextBytes: plaintext.byteLength,
      signatureKeyId: 'test-ed25519-key-v1',
    });
    const insertHttpAudit = vi.fn().mockResolvedValue('audit-id');
    const releaseReadLease = vi.fn().mockResolvedValue(undefined);
    const transaction = {
      acquireReadLease: vi.fn().mockResolvedValue('lease-id'),
      getExportForDownload: vi.fn().mockResolvedValue({ ...ready, downloadStatus: 'READY' }),
      insertHttpAudit,
      releaseReadLease,
    } as unknown as AdminAuditTransactionRepository;
    const repository = {
      transaction: vi.fn(async (callback) => callback(transaction)),
    } as unknown as AdminAuditRepository;
    await expect(
      service(repository, {
        codec: { verify: vi.fn().mockRejectedValue(new TypeError('invalid JWS')) },
        keyring,
        storage: { get: vi.fn().mockResolvedValue(encrypted.bytes) },
      }).download(`Bearer ${'a'.repeat(32)}`, EXPORT_ID, 'request-integrity', NOW),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', disposition: 'ALREADY_DURABLE' });
    expect(insertHttpAudit).toHaveBeenCalledTimes(1);
    expect(insertHttpAudit).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'INTEGRITY_REJECTED', outcome: 'REJECTED' }),
    );
    expect(releaseReadLease).toHaveBeenCalledWith('lease-id');
  });

  it('preserves COMMIT_UNKNOWN after the integrity check without creating a second sink', async () => {
    const plaintext = Buffer.from('qualified zip bytes');
    const contentSha256 = await import('node:crypto').then(({ createHash }) =>
      createHash('sha256').update(plaintext).digest('hex'),
    );
    const keyring = new TestAdminAuditExportStorageKeyring();
    const ready = record({
      contentSha256,
      expiresAt: new Date(NOW.getTime() + 86_400_000),
      generation: 2,
      nextAttemptAt: null,
      objectKey: `c2b/staging/${EXPORT_ID}/2/${ATTEMPT_ID}.zip.enc`,
      plaintextBytes: plaintext.byteLength,
      readyAt: NOW,
      signatureKeyId: 'test-ed25519-key-v1',
      state: 'READY',
      storageKeyId: 'test-storage-key-v1',
    });
    const encrypted = await encryptAdminAuditExport(keyring, plaintext, {
      attemptId: ATTEMPT_ID,
      contentSha256,
      exportId: EXPORT_ID,
      generation: '2',
      plaintextBytes: plaintext.byteLength,
      signatureKeyId: 'test-ed25519-key-v1',
    });
    const insertHttpAudit = vi.fn().mockResolvedValue('audit-id');
    const transaction = {
      acquireReadLease: vi.fn().mockResolvedValue('lease-id'),
      getExportForDownload: vi.fn().mockResolvedValue({ ...ready, downloadStatus: 'READY' }),
      insertHttpAudit,
      releaseReadLease: vi.fn().mockResolvedValue(undefined),
      renewReadLease: vi.fn().mockResolvedValue(true),
    } as unknown as AdminAuditTransactionRepository;
    let call = 0;
    const repository = {
      transaction: vi.fn(async (callback) => {
        call += 1;
        const result = await callback(transaction);
        if (call === 2) {
          throw new AdminC2TransactionError('COMMIT_UNKNOWN', 'commit acknowledgement missing');
        }
        return result;
      }),
    } as unknown as AdminAuditRepository;
    await expect(
      service(repository, {
        keyring,
        storage: { get: vi.fn().mockResolvedValue(encrypted.bytes) },
      }).download(`Bearer ${'a'.repeat(32)}`, EXPORT_ID, 'request-commit-unknown', NOW),
    ).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      disposition: 'COMMIT_UNKNOWN_NO_SECOND_SINK',
    });
    expect(insertHttpAudit).toHaveBeenCalledTimes(1);
    expect(insertHttpAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'SUCCESS' }));
  });

  it('bounds a non-responsive wakeup and passes an aborted signal without undoing the commit', async () => {
    vi.useFakeTimers();
    try {
      let observedSignal: AbortSignal | undefined;
      const transaction = {
        findActiveIdempotency: vi.fn().mockResolvedValue(undefined),
        getExport: vi.fn().mockResolvedValue(record()),
        insertExport: vi.fn().mockResolvedValue(undefined),
        insertHttpAudit: vi.fn().mockResolvedValue('audit-id'),
        insertSnapshot: vi.fn().mockResolvedValue('snapshot-id'),
        lockExportIdempotency: vi.fn().mockResolvedValue(undefined),
        selectProjection: vi.fn().mockResolvedValue([]),
      } as unknown as AdminAuditTransactionRepository;
      const repository = {
        transaction: vi.fn(async (callback) => callback(transaction)),
      } as unknown as AdminAuditRepository;
      const pending = service(repository, {
        wakeup: {
          notify: vi.fn(async (_exportId: string, signal?: AbortSignal) => {
            observedSignal = signal;
            return new Promise<boolean>(() => undefined);
          }),
        },
      }).create(`Bearer ${'a'.repeat(32)}`, 'idempotency-key-0001', INPUT, 'request-timeout', NOW);
      await vi.advanceTimersByTimeAsync(2_001);
      await expect(pending).resolves.toMatchObject({ state: 'PENDING' });
      expect(observedSignal?.aborted).toBe(true);
      expect(transaction.insertExport).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('bounds download preparation, aborts the storage read and durably rejects the request', async () => {
    vi.useFakeTimers();
    try {
      const ready = record({
        contentSha256: 'a'.repeat(64),
        expiresAt: new Date(NOW.getTime() + 86_400_000),
        generation: 2,
        objectKey: `c2b/staging/${EXPORT_ID}/2/${ATTEMPT_ID}.zip.enc`,
        plaintextBytes: 100,
        readyAt: NOW,
        signatureKeyId: 'test-ed25519-key-v1',
        state: 'READY',
        storageKeyId: 'test-storage-key-v1',
      });
      let observedSignal: AbortSignal | undefined;
      const insertHttpAudit = vi.fn().mockResolvedValue('audit-id');
      const releaseReadLease = vi.fn().mockResolvedValue(undefined);
      const transaction = {
        acquireReadLease: vi.fn().mockResolvedValue('lease-id'),
        getExportForDownload: vi.fn().mockResolvedValue({ ...ready, downloadStatus: 'READY' }),
        insertHttpAudit,
        releaseReadLease,
      } as unknown as AdminAuditTransactionRepository;
      const repository = {
        transaction: vi.fn(async (callback) => callback(transaction)),
      } as unknown as AdminAuditRepository;
      const pending = service(repository, {
        storage: {
          get: vi.fn(async (_objectKey: string, signal?: AbortSignal) => {
            observedSignal = signal;
            return new Promise<Uint8Array>(() => undefined);
          }),
        },
      }).download(`Bearer ${'a'.repeat(32)}`, EXPORT_ID, 'request-read-timeout', NOW);
      const rejection = expect(pending).rejects.toMatchObject({
        code: 'SERVICE_UNAVAILABLE',
        disposition: 'ALREADY_DURABLE',
      });
      await vi.advanceTimersByTimeAsync(120_001);
      await rejection;
      expect(observedSignal?.aborted).toBe(true);
      expect(insertHttpAudit).toHaveBeenCalledWith(
        expect.objectContaining({ failureCode: 'DEPENDENCY_UNAVAILABLE', outcome: 'REJECTED' }),
      );
      expect(releaseReadLease).toHaveBeenCalledWith('lease-id');
    } finally {
      vi.useRealTimers();
    }
  });
});
