import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { AdminAuthCrypto } from '../admin-auth/admin-auth.crypto';
import { AdminC2TransactionError } from '../database/admin-c2-transaction.service';
import type { AdminPasswordCompromisePort } from './admin-password-compromise.port';
import {
  AdminBootstrapCommand,
  parseAdminBootstrapInput,
  readAdminBootstrapStdin,
} from './admin-bootstrap.command';
import type {
  AdminSecurityRepository,
  AdminSecurityTransactionRepository,
} from './admin-security.repository';

const validInput = Buffer.from(
  JSON.stringify({ email: 'FIRST.ADMIN@EXAMPLE.COM', password: 'correct horse battery' }),
  'utf8',
);

interface BootstrapStateFixture {
  readonly auditLogId: string | null;
  readonly guardPresent: boolean;
  readonly guardUserId: string | null;
  readonly userId: string | null;
}

interface BootstrapCommandFixture {
  readonly bootstrapAdmin: ReturnType<typeof vi.fn>;
  readonly instance: AdminBootstrapCommand;
  readonly transaction: AdminSecurityRepository['transaction'];
  readonly transactionCalls: () => number;
}

function state(present = false): BootstrapStateFixture {
  return {
    auditLogId: present ? 'audit-id' : null,
    guardPresent: present,
    guardUserId: present ? 'user-id' : null,
    userId: present ? 'user-id' : null,
  };
}

function command(options?: {
  compromise?: AdminPasswordCompromisePort;
  transaction?: (
    callback: (repository: AdminSecurityTransactionRepository) => Promise<unknown>,
  ) => Promise<unknown>;
}): BootstrapCommandFixture {
  const bootstrapAdmin = vi.fn().mockResolvedValue(undefined);
  let transactionCalls = 0;
  let acquiredGuard: { auditId: string; userId: string } | undefined;
  const transaction =
    options?.transaction ??
    vi.fn(
      async (callback: (repository: AdminSecurityTransactionRepository) => Promise<unknown>) => {
        transactionCalls += 1;
        return callback({
          acquireBootstrapGuard: vi.fn(async (userId: string, auditId: string) => {
            acquiredGuard = { auditId, userId };
          }),
          bootstrapAdmin,
          readBootstrapState: vi.fn(async () =>
            transactionCalls === 1 || acquiredGuard === undefined
              ? state(false)
              : {
                  auditLogId: acquiredGuard.auditId,
                  guardPresent: true,
                  guardUserId: acquiredGuard.userId,
                  userId: null,
                },
          ),
        } as unknown as AdminSecurityTransactionRepository);
      },
    );
  const instance = new AdminBootstrapCommand(
    {
      transaction: transaction as AdminSecurityRepository['transaction'],
    } as AdminSecurityRepository,
    {
      hashPassword: vi.fn().mockResolvedValue('$argon2id$qualified'),
    } as unknown as AdminAuthCrypto,
    options?.compromise ?? { checkPassword: vi.fn().mockResolvedValue('SAFE') },
  );
  return {
    bootstrapAdmin,
    instance,
    transaction: transaction as AdminSecurityRepository['transaction'],
    transactionCalls: () => transactionCalls,
  };
}

describe('AdminBootstrapCommand', () => {
  it('accepts only the exact UTF-8 shape and canonicalizes ASCII email', () => {
    expect(parseAdminBootstrapInput(validInput)).toEqual({
      email: 'first.admin@example.com',
      password: 'correct horse battery',
    });
    expect(() =>
      parseAdminBootstrapInput(
        Buffer.from(
          JSON.stringify({
            email: 'first.admin@example.com',
            extra: true,
            password: 'correct horse battery',
          }),
        ),
      ),
    ).toThrow();
    expect(() => parseAdminBootstrapInput(Uint8Array.from([0xc3, 0x28]))).toThrow();
    expect(() =>
      parseAdminBootstrapInput(
        Buffer.from(
          '{"email":"first.admin@example.com","email":"second.admin@example.com","password":"correct horse battery"}',
        ),
      ),
    ).toThrow();
    expect(() =>
      parseAdminBootstrapInput(
        Buffer.from(
          '{"email":"first.admin@example.com","password":"correct horse battery","password":"substitution battery"}',
        ),
      ),
    ).toThrow();
  });

  it('bounds stdin by bytes and rejects a stream that does not finish in time', async () => {
    await expect(
      readAdminBootstrapStdin(Readable.from([Buffer.alloc(9)]), {
        maximumBytes: 8,
        timeoutMs: 100,
      }),
    ).rejects.toThrow();
    await expect(
      readAdminBootstrapStdin(new Readable({ read() {} }), {
        maximumBytes: 8,
        timeoutMs: 5,
      }),
    ).rejects.toThrow();
  });

  it('performs preliminary proof, HIBP and Argon outside the final transaction', async () => {
    const compromise = { checkPassword: vi.fn().mockResolvedValue('SAFE') };
    const fixture = command({ compromise });
    const result = await fixture.instance.execute(validInput);
    expect(result).toMatchObject({ exitCode: 0, status: 'CREATED' });
    expect(fixture.transactionCalls()).toBe(2);
    expect(compromise.checkPassword).toHaveBeenCalledWith('correct horse battery', {
      signal: expect.any(AbortSignal),
      timeoutMs: 3000,
    });
    expect(fixture.bootstrapAdmin).toHaveBeenCalledOnce();
  });

  it('fails closed before hashing when HIBP reports a compromised password', async () => {
    const fixture = command({
      compromise: { checkPassword: vi.fn().mockResolvedValue('COMPROMISED') },
    });
    await expect(fixture.instance.execute(validInput)).resolves.toEqual({
      exitCode: 2,
      status: 'INVALID_INPUT',
    });
    expect(fixture.bootstrapAdmin).not.toHaveBeenCalled();
  });

  it('enforces the 3000 ms HIBP deadline even when the adapter ignores abort', async () => {
    vi.useFakeTimers();
    try {
      const fixture = command({
        compromise: { checkPassword: vi.fn(() => new Promise<'SAFE'>(() => undefined)) },
      });
      const outcome = fixture.instance.execute(validInput);
      await vi.advanceTimersByTimeAsync(3_001);
      await expect(outcome).resolves.toEqual({
        exitCode: 4,
        status: 'DEPENDENCY_UNAVAILABLE',
      });
      expect(fixture.bootstrapAdmin).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports an existing user or guard without preparing the password', async () => {
    const transaction = vi.fn(
      async (callback: (repository: AdminSecurityTransactionRepository) => Promise<unknown>) =>
        callback({
          readBootstrapState: vi.fn().mockResolvedValue(state(true)),
        } as unknown as AdminSecurityTransactionRepository),
    );
    const fixture = command({ transaction });
    await expect(fixture.instance.execute(validInput)).resolves.toEqual({
      exitCode: 3,
      status: 'ALREADY_BOOTSTRAPPED',
    });
  });

  it('keeps COMMIT_UNKNOWN neutral and reconciles only by reading', async () => {
    let call = 0;
    let expectedUserId: string | undefined;
    let expectedAuditId: string | undefined;
    const transaction = vi.fn(
      async (callback: (repository: AdminSecurityTransactionRepository) => Promise<unknown>) => {
        call += 1;
        if (call === 1) {
          return callback({
            readBootstrapState: vi.fn().mockResolvedValue(state(false)),
          } as unknown as AdminSecurityTransactionRepository);
        }
        if (call === 2) {
          let acquired: { auditId: string; userId: string } | undefined;
          const repository = {
            acquireBootstrapGuard: vi.fn(async (userId: string, auditId: string) => {
              acquired = { auditId, userId };
            }),
            bootstrapAdmin: vi.fn(async (input: { auditId: string; userId: string }) => {
              expectedUserId = input.userId;
              expectedAuditId = input.auditId;
            }),
            readBootstrapState: vi.fn(async () => ({
              auditLogId: acquired?.auditId ?? null,
              guardPresent: acquired !== undefined,
              guardUserId: acquired?.userId ?? null,
              userId: null,
            })),
          } as unknown as AdminSecurityTransactionRepository;
          await callback(repository);
          throw new AdminC2TransactionError('COMMIT_UNKNOWN', 'unknown');
        }
        return callback({
          readBootstrapState: vi.fn().mockResolvedValue({
            auditLogId: expectedAuditId,
            guardPresent: true,
            guardUserId: expectedUserId,
            userId: expectedUserId,
          }),
        } as unknown as AdminSecurityTransactionRepository);
      },
    );
    const fixture = command({ transaction });
    await expect(fixture.instance.execute(validInput)).resolves.toEqual({
      exitCode: 5,
      reconciliation: 'MATCHING_COMMIT_OBSERVED',
      status: 'COMMIT_UNKNOWN',
    });
    expect(transaction).toHaveBeenCalledTimes(3);
  });
});
