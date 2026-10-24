import { describe, expect, it, vi } from 'vitest';
import type { AdminC2Transaction } from '../database/admin-c2-transaction.service';
import {
  AdminAuditExportTransactionRepository,
  type ClaimedAdminAuditExport,
} from './admin-audit-export.repository';

function repository(query: ReturnType<typeof vi.fn>): AdminAuditExportTransactionRepository {
  return new AdminAuditExportTransactionRepository({
    query: query as AdminC2Transaction['query'],
    signal: new AbortController().signal,
  });
}

function claim(): ClaimedAdminAuditExport {
  return {
    attemptDeadline: new Date('2026-10-23T12:10:00.000Z'),
    attemptId: '11111111-1111-4111-8111-111111111111',
    attemptNumber: 2,
    attemptStartedAt: new Date('2026-10-23T12:00:00.000Z'),
    claimOwnerHash: 'a'.repeat(64),
    contentSha256: null,
    createdAt: new Date('2026-10-23T11:59:00.000Z'),
    creatorAdminUserId: '22222222-2222-4222-8222-222222222222',
    encryptedBytes: null,
    expiredAt: null,
    expiresAt: null,
    failedAt: null,
    failureCode: null,
    generation: 3,
    id: '33333333-3333-4333-8333-333333333333',
    leaseExpiresAt: new Date('2026-10-23T12:02:00.000Z'),
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

describe('AdminAuditExportTransactionRepository', () => {
  it('claims one due export with SKIP LOCKED and a new generation fence', async () => {
    const query = vi.fn().mockResolvedValue({ command: 'UPDATE', rowCount: 0, rows: [] });
    await repository(query).claimNext('attempt-id', 'b'.repeat(64));
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('"generation" = export_entry."generation" + 1');
    expect(sql).toContain('"attemptNumber" = export_entry."attemptNumber" + 1');
    expect(sql).toContain('RETURNING export_entry."id"');
    expect(sql).not.toContain('RETURNING "id"');
    expect(values).toEqual(['attempt-id', 'b'.repeat(64)]);
  });

  it('lets PostgreSQL calculate the bounded retry backoff', async () => {
    const query = vi.fn().mockResolvedValue({ command: 'UPDATE', rowCount: 1, rows: [] });
    await expect(repository(query).scheduleRetry(claim())).resolves.toBe(true);
    const [sql] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('"attemptId" = NULL');
    expect(sql).not.toContain('INTERVAL');
    expect(sql).toContain('pg_catalog.statement_timestamp()');
    expect(sql).not.toContain('SET "nextAttemptAt"');
  });

  it('publishes READY and its SYSTEM audit in the same repository transaction', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ command: 'UPDATE', rowCount: 1, rows: [{ id: claim().id }] })
      .mockResolvedValueOnce({ command: 'INSERT', rowCount: 1, rows: [] });
    await expect(
      repository(query).finishReady(
        claim(),
        {
          contentSha256: 'c'.repeat(64),
          encryptedBytes: 120,
          objectKey: 'c2b/staging/final.zip.enc',
          plaintextBytes: 80,
          signatureKeyId: 'signature-key-v1',
          stagingObjectKey: 'c2b/staging/final.zip.enc',
          storageKeyId: 'storage-key-v1',
        },
        'request-ready',
        'd'.repeat(64),
      ),
    ).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[0]).toContain('AND "generation" = $2');
    expect(query.mock.calls[0]?.[0]).toContain('AND "attemptId" = $3');
    expect(query.mock.calls[1]?.[0]).toContain("'buildAdminAuditLogExport'");
  });

  it('does not write a SYSTEM audit when a stale fence loses the terminal CAS', async () => {
    const query = vi.fn().mockResolvedValue({ command: 'UPDATE', rowCount: 0, rows: [] });
    await expect(
      repository(query).finishFailed(
        claim(),
        'DEPENDENCY_UNAVAILABLE',
        'request-stale',
        'd'.repeat(64),
      ),
    ).resolves.toBe(false);
    expect(query).toHaveBeenCalledOnce();
  });

  it('uses PostgreSQL time for deadline disposition and retry eligibility', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ disposition: 'DEADLINE_EXPIRED' }] })
      .mockResolvedValueOnce({ rows: [{ remainingMs: 0 }] });
    await expect(repository(query).failureDisposition(claim())).resolves.toBe('DEADLINE_EXPIRED');
    await expect(repository(query).remainingAttemptMilliseconds(claim())).resolves.toBe(0);
    expect(query.mock.calls[0]?.[0]).toContain('pg_catalog.statement_timestamp()');
    expect(query.mock.calls[1]?.[0]).toContain('pg_catalog.statement_timestamp()');
  });

  it('keeps cleanup bounded without requiring forbidden UPDATE privileges', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rowCount: 2, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'snapshot-id' }] });
    await expect(repository(query).purgeExpiredReadLeases()).resolves.toBe(2);
    await expect(repository(query).purgeOneSnapshot()).resolves.toBe('snapshot-id');
    for (const [sql] of query.mock.calls as [string, unknown[]][]) {
      expect(sql).toContain('pg_catalog.statement_timestamp()');
      expect(sql).not.toContain('FOR UPDATE');
    }
  });

  it('serializes expiry with read leases and revalidates the exact READY artifact before audit', async () => {
    const candidate = {
      ...claim(),
      contentSha256: 'c'.repeat(64),
      expiresAt: new Date('2026-10-24T12:00:00.000Z'),
      objectKey: 'c2b/staging/final.zip.enc',
      state: 'READY' as const,
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ command: 'SELECT', rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ command: 'SELECT', rowCount: 1, rows: [{ id: candidate.id }] })
      .mockResolvedValueOnce({ command: 'UPDATE', rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ command: 'INSERT', rowCount: 1, rows: [] });
    await expect(
      repository(query).expire(candidate, 'request-expire', 'd'.repeat(64)),
    ).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[0]?.[0]).toContain('kora_lock_admin_c2b_export_lifecycle');
    expect(query.mock.calls[1]?.[0]).toContain('NOT EXISTS');
    expect(query.mock.calls[1]?.[0]).toContain('FOR UPDATE');
    expect(query.mock.calls[2]?.[0]).toContain('"contentSha256" IS NOT DISTINCT FROM $4');
    expect(query.mock.calls[3]?.[0]).toContain("'expireAdminAuditLogExport'");
  });
});
