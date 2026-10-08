import type { AdminWriterService, AdminWriterTransaction } from '../database/admin-writer.service';
import type { PrismaService } from '../database/prisma.service';
import { AdminAuthRepository } from './admin-auth.repository';

describe('AdminAuthRepository', () => {
  it('parameterizes security sinks and never uses RETURNING', async () => {
    const calls: Array<{ text: string; values: readonly unknown[] }> = [];
    const transaction: AdminWriterTransaction = {
      async query(text, values) {
        calls.push({ text, values });
        return { command: 'INSERT', fields: [], oid: 0, rowCount: 1, rows: [] };
      },
    };
    const writer = {
      transaction: async <T>(callback: (tx: AdminWriterTransaction) => Promise<T>) =>
        callback(transaction),
    } as AdminWriterService;
    const repository = new AdminAuthRepository(writer, {} as PrismaService);

    await repository.transaction(async (tx) => {
      await tx.insertSecurityEvent({
        action: 'ADMIN_LOGIN',
        createdAt: new Date('2026-10-02T17:00:00.000Z'),
        failureCode: 'AUTH_INVALID_CREDENTIALS',
        id: '00000000-0000-4000-8000-000000000001',
        outcome: 'FAILED',
        requestId: 'request-test-001',
        subjectRefHash: 'a'.repeat(64),
      });
      await tx.insertAudit({
        action: 'ADMIN_SESSION_REVOKED',
        actorAdminUserId: '00000000-0000-4000-8000-000000000002',
        adminSessionId: '00000000-0000-4000-8000-000000000003',
        createdAt: new Date('2026-10-02T17:00:00.000Z'),
        entityId: '00000000-0000-4000-8000-000000000003',
        entityType: 'AdminSession',
        id: '00000000-0000-4000-8000-000000000004',
        reasonCode: 'SECURITY_RESPONSE',
        requestId: 'request-test-001',
      });
    });

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.text).not.toMatch(/RETURNING|ON\s+CONFLICT/iu);
      expect(call.text).not.toContain('request-test-001');
      expect(call.values).toContain('request-test-001');
    }
  });

  it('rewraps the TOTP envelope only with the accepted monotonic counter', async () => {
    const calls: Array<{ text: string; values: readonly unknown[] }> = [];
    const transaction: AdminWriterTransaction = {
      async query(text, values) {
        calls.push({ text, values });
        return { command: 'UPDATE', fields: [], oid: 0, rowCount: 1, rows: [] };
      },
    };
    const writer = {
      transaction: async <T>(callback: (tx: AdminWriterTransaction) => Promise<T>) =>
        callback(transaction),
    } as AdminWriterService;
    const repository = new AdminAuthRepository(writer, {} as PrismaService);

    await repository.transaction((tx) =>
      tx.updateTotpCounter(
        '00000000-0000-4000-8000-000000000001',
        42n,
        'rewrapped-envelope-without-plaintext',
      ),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('"lastAcceptedTotpCounter" = $2');
    expect(calls[0]?.text).toContain('"totpSecretEncrypted" = $3');
    expect(calls[0]?.text).not.toMatch(/RETURNING|ON\s+CONFLICT/iu);
    expect(calls[0]?.values).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '42',
      'rewrapped-envelope-without-plaintext',
    ]);
  });
});
