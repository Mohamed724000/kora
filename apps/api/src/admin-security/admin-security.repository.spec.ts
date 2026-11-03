import { describe, expect, it, vi } from 'vitest';
import type { AdminC2Transaction } from '../database/admin-c2-transaction.service';
import {
  type AdminPasswordResetContextRecord,
  AdminSecurityTransactionRepository,
} from './admin-security.repository';

function transactionWithQuery(query: ReturnType<typeof vi.fn>): AdminC2Transaction {
  return {
    query: query as AdminC2Transaction['query'],
    signal: new AbortController().signal,
  };
}

const passwordResetContext: AdminPasswordResetContextRecord = {
  adminUserId: 'admin-id',
  authorizationVersion: 7,
  consumedAt: null,
  contextId: 'context-id',
  expiresAt: new Date('2026-10-16T11:00:00.000Z'),
  passwordResetRequestId: 'request-id',
  requestExpiresAt: new Date('2026-10-16T11:00:00.000Z'),
  requestRevokedAt: null,
  revokedAt: null,
  tokenHash: 'a'.repeat(64),
  userAuthorizationVersion: 7,
  userStatus: 'ACTIVE',
};

describe('AdminSecurityTransactionRepository', () => {
  it('fences notification completion by owner, generation and unexpired lease', async () => {
    const query = vi.fn().mockResolvedValue({ command: 'UPDATE', rowCount: 0, rows: [] });
    const repository = new AdminSecurityTransactionRepository(transactionWithQuery(query));
    const completedAt = new Date('2026-10-16T10:01:00.001Z');

    await expect(
      repository.finishNotification({
        generation: 7,
        id: 'outbox-id',
        now: completedAt,
        ownerHash: 'a'.repeat(64),
        state: 'DELIVERY_UNCERTAIN',
      }),
    ).resolves.toBe(false);

    expect(query).toHaveBeenCalledOnce();
    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('"leaseExpiresAt" > $4');
    expect(values.slice(0, 4)).toEqual(['outbox-id', 7, 'a'.repeat(64), completedAt]);
  });

  it('atomically cancels an exact pending outbox using only writer-authorized columns', async () => {
    const query = vi.fn().mockResolvedValue({
      command: 'SELECT',
      rowCount: 1,
      rows: [{ cancelledOutboxes: 1, terminalizedRequests: 1 }],
    });
    const repository = new AdminSecurityTransactionRepository(transactionWithQuery(query));
    const now = new Date('2026-10-16T10:00:00.000Z');

    await repository.replacePasswordReset('request-id', 'outbox-id', now);

    expect(query).toHaveBeenCalledOnce();
    const [outboxSql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(outboxSql).toContain('WITH cancelled_outbox AS');
    expect(outboxSql).toContain('terminalized_request AS');
    expect(outboxSql).toContain('"generation" = "generation" + 1');
    expect(outboxSql).toContain('"state" = \'PENDING\'');
    expect(outboxSql).toContain('AND "passwordResetRequestId" = $1');
    expect(outboxSql).not.toContain('"claimOwnerHash"');
    expect(outboxSql).not.toContain('"leaseExpiresAt"');
    expect(outboxSql).not.toContain('"uncertainAt"');
    expect(outboxSql).not.toContain('"nextAttemptAt"');
    expect(values).toEqual(['request-id', 'outbox-id', now]);
  });

  it.each([
    { cancelledOutboxes: 0, terminalizedRequests: 0 },
    { cancelledOutboxes: 1, terminalizedRequests: 0 },
  ])('rejects inconsistent reset replacement cardinality %#', async (counts) => {
    const query = vi.fn().mockResolvedValue({ command: 'SELECT', rowCount: 1, rows: [counts] });
    const repository = new AdminSecurityTransactionRepository(transactionWithQuery(query));

    await expect(
      repository.replacePasswordReset(
        'request-id',
        'outbox-id',
        new Date('2026-10-16T10:00:00.000Z'),
      ),
    ).rejects.toThrow('Admin password reset replacement cardinality invariant violated.');
  });

  it('atomically consumes a reset, terminalizes its exact parent and then revokes sessions', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        command: 'SELECT',
        rowCount: 1,
        rows: [{ consumedContexts: 1, terminalizedRequests: 1, updatedUsers: 1 }],
      })
      .mockResolvedValueOnce({ command: 'UPDATE', rowCount: 2, rows: [] });
    const repository = new AdminSecurityTransactionRepository(transactionWithQuery(query));
    const now = new Date('2026-10-16T10:00:00.000Z');

    await repository.consumePasswordReset(passwordResetContext, '$argon2id$qualified', now);

    expect(query).toHaveBeenCalledTimes(2);
    const [consumptionSql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(consumptionSql).toContain('WITH consumed_context AS');
    expect(consumptionSql).toContain('terminalized_request AS');
    expect(consumptionSql).toContain('updated_user AS');
    expect(consumptionSql).toContain('AND "passwordResetRequestId" = $3');
    expect(consumptionSql).toContain('AND "adminUserId" = $4');
    expect(consumptionSql).toContain('SET "revokedAt" = $2');
    expect(consumptionSql).not.toContain('AdminNotificationOutbox');
    expect(values).toEqual(['context-id', now, 'request-id', 'admin-id', 7, '$argon2id$qualified']);
    expect(query.mock.calls[1]?.[0]).toContain('UPDATE "AdminSession"');
    expect(query.mock.calls[1]?.[1]).toEqual(['admin-id', now]);
  });

  it.each([
    { consumedContexts: 0, terminalizedRequests: 1, updatedUsers: 1 },
    { consumedContexts: 1, terminalizedRequests: 0, updatedUsers: 1 },
    { consumedContexts: 1, terminalizedRequests: 1, updatedUsers: 0 },
  ])(
    'rejects inconsistent reset mutation cardinality %# before session revocation',
    async (counts) => {
      const query = vi.fn().mockResolvedValue({ command: 'SELECT', rowCount: 1, rows: [counts] });
      const repository = new AdminSecurityTransactionRepository(transactionWithQuery(query));

      await expect(
        repository.consumePasswordReset(
          passwordResetContext,
          '$argon2id$qualified',
          new Date('2026-10-16T10:00:00.000Z'),
        ),
      ).rejects.toThrow('Admin password reset transaction cardinality invariant violated.');

      expect(query).toHaveBeenCalledOnce();
      expect(query.mock.calls[0]?.[0]).not.toContain('AdminNotificationOutbox');
    },
  );

  it('acquires the singleton guard before bootstrap user and audit inserts', async () => {
    const query = vi.fn().mockResolvedValue({ command: 'INSERT', rowCount: 1, rows: [] });
    const repository = new AdminSecurityTransactionRepository(transactionWithQuery(query));
    await repository.acquireBootstrapGuard('user-id', 'audit-id');
    await repository.bootstrapAdmin({
      auditId: 'audit-id',
      email: 'first.admin@example.com',
      passwordHash: '$argon2id$qualified',
      requestId: 'request-id',
      systemExecutionRefHash: 'b'.repeat(64),
      userId: 'user-id',
    });

    expect(query.mock.calls[0]?.[0]).toContain('INSERT INTO "AdminBootstrapGuard"');
    expect(query.mock.calls[1]?.[0]).toContain('INSERT INTO "AdminUser"');
    expect(query.mock.calls[2]?.[0]).toContain('INSERT INTO "AuditLog"');
  });

  it('keeps writer audit inserts within the qualified C2a writer column ACL', async () => {
    const query = vi.fn().mockResolvedValue({ command: 'INSERT', rowCount: 1, rows: [] });
    const repository = new AdminSecurityTransactionRepository(transactionWithQuery(query));

    await repository.insertAudit({
      action: 'resetAdminPassword',
      actorAdminUserId: 'admin-id',
      adminPasswordResetContextId: 'reset-context-id',
      context: 'ADMIN_RECOVERY',
      entityId: 'admin-id',
      entityType: 'ADMIN_USER',
      eventClass: 'LOGIN',
      id: 'audit-id',
      outcome: 'SUCCESS',
      reasonCode: 'ACCOUNT_RECOVERY',
      requestId: 'request-id',
      subjectAdminUserId: 'admin-id',
    });

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('"adminPasswordResetContextId"');
    expect(sql).not.toContain('"bootstrapGuardId"');
    expect(sql).not.toContain('"notificationOutboxId"');
    expect(values).toHaveLength(23);
  });

  it('delegates idempotency generation and both timestamps to the PostgreSQL insert guard', async () => {
    const query = vi.fn().mockResolvedValue({ command: 'INSERT', rowCount: 1, rows: [] });
    const repository = new AdminSecurityTransactionRepository(transactionWithQuery(query));

    await repository.insertIdempotency({
      adminUserId: 'admin-id',
      id: 'idempotency-record-id',
      idempotencyKey: 'idempotency-key',
      operation: 'CREATE_ADMIN_INVITATION',
      requestDigest: 'a'.repeat(64),
      resourceId: 'invitation-id',
      resourceType: 'ADMIN_INVITATION',
      responseCode: 201,
    });

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain('"generation"');
    expect(sql).not.toContain('"createdAt"');
    expect(sql).not.toContain('"expiresAt"');
    expect(values).toHaveLength(8);
  });

  it('lets PostgreSQL decide whether an idempotency generation is still active', async () => {
    const query = vi.fn().mockResolvedValue({ command: 'SELECT', rowCount: 0, rows: [] });
    const repository = new AdminSecurityTransactionRepository(transactionWithQuery(query));

    await expect(
      repository.lockIdempotency(
        '00000000-0000-4000-8000-000000000001',
        'CREATE_ADMIN_RECOVERY_CASE',
        'postgres-clock-key',
      ),
    ).resolves.toBeUndefined();

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WITH database_clock AS MATERIALIZED');
    expect(sql).toContain('pg_catalog.clock_timestamp()');
    expect(sql).toContain('record."expiresAt" > database_clock.database_now');
    expect(sql).not.toContain('record."expiresAt" >= database_clock.database_now');
    expect(sql).not.toContain('CURRENT_TIMESTAMP');
    expect(values).toEqual([
      '00000000-0000-4000-8000-000000000001',
      'CREATE_ADMIN_RECOVERY_CASE',
      'postgres-clock-key',
    ]);
  });

  it('serializes an absent idempotency key with a transaction-scoped advisory lock', async () => {
    const query = vi.fn().mockResolvedValue({ command: 'SELECT', rowCount: 1, rows: [{}] });
    const repository = new AdminSecurityTransactionRepository(transactionWithQuery(query));

    await repository.lockIdempotencyKey(
      '00000000-0000-4000-8000-000000000001',
      'CREATE_ADMIN_INVITATION',
      'concurrent-invitation-key',
    );

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toContain('KORA_ADMIN_C2_IDEMPOTENCY_LOCK_V2');
    expect(query.mock.calls[0]?.[0]).toContain('pg_catalog.jsonb_build_array');
    expect(query.mock.calls[0]?.[0]).toContain('pg_catalog.hashtextextended');
    expect(query.mock.calls[0]?.[1]).toEqual([
      '00000000-0000-4000-8000-000000000001',
      'CREATE_ADMIN_INVITATION',
      'concurrent-invitation-key',
    ]);
  });

  it('uses a transaction-scoped PostgreSQL advisory lock for global expiration concurrency', async () => {
    const query = vi.fn().mockResolvedValue({
      command: 'SELECT',
      rowCount: 1,
      rows: [{ acquired: true }],
    });
    const repository = new AdminSecurityTransactionRepository(transactionWithQuery(query));
    await expect(repository.tryAcquireRecoveryExpirationSingleton()).resolves.toBe(true);
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[0]).toBe(
      'SELECT pg_try_advisory_xact_lock(1263489601, 843142467) AS "acquired"',
    );
  });

  it('binds delegated recovery cancellation to a deterministic system execution reference', async () => {
    const query = vi.fn().mockResolvedValue({ command: 'INSERT', rowCount: 1, rows: [] });
    const repository = new AdminSecurityTransactionRepository(transactionWithQuery(query));

    await repository.insertRecoveryCancellationAudit(
      {
        approverAdminUserId: null,
        cancelledAt: null,
        createdAt: new Date('2026-10-18T00:00:00.000Z'),
        creatorAdminUserId: 'creator-id',
        expiresAt: new Date('2026-10-19T00:00:00.000Z'),
        id: 'recovery-case-id',
        state: 'PENDING',
        stateGeneration: 7,
        subjectAdminUserId: 'subject-id',
      },
      'causal-audit-id',
      'delegated-admin-id',
      'request-id',
    );

    const [sql, values] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('"systemExecutionRefHash"');
    expect(values[6]).toMatch(/^[a-f0-9]{64}$/u);
    expect(values).toContain('causal-audit-id');
    expect(values).toContain('delegated-admin-id');
  });
});
