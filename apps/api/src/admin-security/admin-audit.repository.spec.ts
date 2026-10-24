import { describe, expect, it, vi } from 'vitest';
import type { AdminC2Transaction } from '../database/admin-c2-transaction.service';
import { AdminAuditTransactionRepository } from './admin-audit.repository';
import type { AdminAuditLogEntry } from './admin-audit.types';

function repository(query: ReturnType<typeof vi.fn>): AdminAuditTransactionRepository {
  return new AdminAuditTransactionRepository({
    query: query as AdminC2Transaction['query'],
    signal: new AbortController().signal,
  });
}

describe('AdminAuditTransactionRepository', () => {
  it('inserts every snapshot item with one set-based PostgreSQL statement', async () => {
    const query = vi.fn().mockResolvedValue({ command: 'INSERT', rowCount: 1, rows: [] });
    const first: AdminAuditLogEntry = {
      action: 'changeAdminUserRole',
      actorAdminUserId: 'admin-id',
      adminRecoveryContextId: null,
      adminSessionId: 'session-id',
      causationEventId: null,
      causationSecurityEventId: null,
      context: 'ADMIN_SESSION',
      createdAt: '2026-10-24T00:00:00.000Z',
      delegatedByAdminUserId: null,
      entityId: 'subject-id',
      entityType: 'ADMIN_USER',
      eventClass: 'BUSINESS',
      eventId: 'event-1',
      failureCode: null,
      maskedAfter: { role: 'ADMIN' },
      maskedBefore: { role: 'SUPER_ADMIN' },
      operatorReason: null,
      operatorReasonRedacted: true,
      outcome: 'SUCCESS',
      outcomeProvenance: 'EXPLICIT_C2',
      reasonCode: 'ROLE_ADMINISTRATION',
      requestId: 'request-1',
      subjectAdminUserId: 'subject-id',
      systemExecutionRefHash: null,
      version: 3,
    };
    const second: AdminAuditLogEntry = {
      ...first,
      createdAt: '2026-10-23T23:59:59.000Z',
      eventId: 'event-2',
      requestId: 'request-2',
    };

    await repository(query).insertSnapshot({
      filtersDigest: 'a'.repeat(64),
      items: [first, second],
      operation: 'LIST_ADMIN_AUDIT_LOGS',
      principalAdminUserId: 'admin-id',
    });

    expect(query).toHaveBeenCalledTimes(2);
    const [sql, values] = query.mock.calls[1] as [string, unknown[]];
    expect(sql).toContain('FROM unnest(');
    expect(sql).not.toContain('VALUES ($1, $2, $3, $4, $5, $6)');
    expect(values.slice(1)).toEqual([
      [0, 1],
      ['event-1', 'event-2'],
      ['2026-10-24T00:00:00.000Z', '2026-10-23T23:59:59.000Z'],
      [JSON.stringify(first), JSON.stringify(second)],
      [
        Buffer.byteLength(JSON.stringify(first), 'utf8'),
        Buffer.byteLength(JSON.stringify(second), 'utf8'),
      ],
    ]);
  });

  it('reads only the positive security-barrier projection with stable ordering and AND filters', async () => {
    const query = vi.fn().mockResolvedValue({ command: 'SELECT', rowCount: 0, rows: [] });
    await repository(query).selectProjection({
      action: 'changeAdminUserRole',
      actorAdminUserId: 'admin-id',
      createdFrom: '2026-10-22T00:00:00.000Z',
      entityType: 'ADMIN_USER',
    });
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('FROM "AdminC2bAuditProjectionSource" source');
    expect(sql).toContain('source."action" = $1 AND');
    expect(sql).toContain('ORDER BY source."createdAt" DESC, source."eventId" DESC');
    expect(sql).not.toContain('"reason"');
    expect(sql).not.toContain('"operatorReason"');
    expect(values).toEqual([
      'changeAdminUserRole',
      'admin-id',
      'ADMIN_USER',
      '2026-10-22T00:00:00.000Z',
    ]);
  });

  it('lets PostgreSQL decide the 24-hour idempotency boundary', async () => {
    const query = vi.fn().mockResolvedValue({ command: 'SELECT', rowCount: 0, rows: [] });
    await repository(query).findActiveIdempotency('admin-id', 'idempotency-key-0001');
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('pg_catalog.statement_timestamp()');
    expect(sql).not.toContain('CURRENT_TIMESTAMP');
    expect(values).toEqual(['admin-id', 'idempotency-key-0001']);
  });

  it('reads only API-visible export columns and excludes worker control state', async () => {
    const query = vi.fn().mockResolvedValue({ command: 'SELECT', rowCount: 0, rows: [] });
    await repository(query).getExport('export-id', 'admin-id');
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('"contentSha256"');
    expect(sql).toContain('"signatureKeyId"');
    expect(sql).not.toContain('"attemptId"');
    expect(sql).not.toContain('"claimOwnerHash"');
    expect(sql).not.toContain('"encryptedBytes"');
    expect(values).toEqual(['export-id', 'admin-id']);
  });

  it('inserts an HTTP audit through the exact qualified columns without RETURNING', async () => {
    const query = vi.fn().mockResolvedValue({ command: 'INSERT', rowCount: 1, rows: [] });
    await repository(query).insertHttpAudit({
      action: 'downloadAdminAuditLogExport',
      actorAdminUserId: 'admin-id',
      adminAuditExportId: 'export-id',
      adminSessionId: 'session-id',
      entityId: 'export-id',
      entityType: 'ADMIN_AUDIT_EXPORT',
      outcome: 'SUCCESS',
      requestId: 'request-id',
    });
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('"adminAuditExportId"');
    expect(sql).toContain("'C2_RUNTIME', 'AUDIT_EXPORT'");
    expect(sql).not.toContain('RETURNING');
    expect(values).toHaveLength(11);
  });

  it('renews and releases only an existing non-terminal read lease', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ command: 'UPDATE', rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ command: 'UPDATE', rowCount: 1, rows: [] });
    const selected = repository(query);
    await expect(selected.renewReadLease('lease-id')).resolves.toBe(true);
    await selected.releaseReadLease('lease-id');
    expect(query.mock.calls[0]?.[0]).toContain('"releasedAt" IS NULL');
    expect(query.mock.calls[1]?.[0]).toContain('pg_catalog.statement_timestamp()');
  });

  it('locks lifecycle state and derives download eligibility from one PostgreSQL instant', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ command: 'SELECT', rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ command: 'SELECT', rowCount: 0, rows: [] });
    await repository(query).getExportForDownload('export-id', 'admin-id');
    expect(query.mock.calls[0]?.[0]).toContain('kora_lock_admin_c2b_export_lifecycle');
    expect(query.mock.calls[1]?.[0]).toContain('WITH database_clock AS MATERIALIZED');
    expect(query.mock.calls[1]?.[0]).toContain('"expiresAt" <= database_clock.now');
    expect(query.mock.calls[1]?.[0]).toContain('END AS "downloadStatus"');
  });
});
