import { EventEmitter } from 'node:events';
import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_C2_TRANSACTION_BUDGETS,
  AdminC2TransactionError,
  AdminC2TransactionService,
  type AdminC2ClientErrorObservation,
  type AdminC2DriverContract,
  type AdminC2DriverObservation,
  type AdminC2PgClient,
  type AdminC2PgPool,
  type AdminC2TransactionDiagnostic,
  type AdminC2TransactionStatus,
} from './admin-c2-transaction.service';

interface QueryPlan {
  sql: string;
  outcome?: 'resolve' | 'reject' | 'hang' | 'throw';
  readyStatus?: AdminC2TransactionStatus;
  delayMs?: number;
  resultCommand?: string;
}

class FakeStream extends EventEmitter {
  closed = false;

  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.emit('close');
    }
  }
}

class FakeConnection extends EventEmitter {
  readonly stream = new FakeStream();
}

class FakeClient extends EventEmitter implements AdminC2PgClient {
  readonly connection = new FakeConnection();
  readonly queries: string[] = [];
  readonly releases: (boolean | Error | undefined)[] = [];
  readonly hangingRejectors = new Set<(error: Error) => void>();
  status: AdminC2TransactionStatus = 'I';
  releaseError: unknown;

  constructor(private readonly plans: QueryPlan[]) {
    super();
  }

  getTransactionStatus(): AdminC2TransactionStatus {
    return this.status;
  }

  query<Row extends QueryResultRow = QueryResultRow>(text: string): Promise<QueryResult<Row>> {
    this.queries.push(text);
    const plan = this.plans.shift();
    if (plan === undefined || plan.sql !== text) {
      return Promise.reject(new Error('unexpected query: ' + text));
    }
    if (plan.outcome === 'throw') {
      throw new Error(text + ' synchronous failure');
    }
    if (plan.outcome === 'hang') {
      return new Promise<QueryResult<Row>>((_resolve, reject) => {
        this.hangingRejectors.add(reject);
      });
    }

    const delayMs = plan.delayMs ?? 0;
    if (plan.outcome === 'reject') {
      return new Promise<QueryResult<Row>>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error(text + ' rejected'));
          if (plan.readyStatus !== undefined) {
            setTimeout(() => {
              this.status = plan.readyStatus as AdminC2TransactionStatus;
              this.connection.emit('readyForQuery');
            }, 0);
          }
        }, delayMs);
      });
    }

    return new Promise<QueryResult<Row>>((resolve) => {
      setTimeout(() => {
        if (plan.readyStatus !== undefined) {
          this.status = plan.readyStatus;
          this.connection.emit('readyForQuery');
        }
        resolve({
          command: plan.resultCommand ?? text,
          fields: [],
          oid: 0,
          rowCount: 0,
          rows: [],
        } as unknown as QueryResult<Row>);
      }, delayMs);
    });
  }

  release(destroy?: boolean | Error): void {
    this.releases.push(destroy);
    if (this.releaseError !== undefined) {
      throw this.releaseError;
    }
    if (destroy) {
      setTimeout(() => {
        for (const reject of this.hangingRejectors) {
          reject(new Error('client destroyed'));
        }
        this.hangingRejectors.clear();
        this.connection.stream.close();
      }, 0);
    }
  }

  failTransport(error = new Error('transport lost')): void {
    this.emit('error', error);
  }
}

function observation<T>(
  emitter: EventEmitter,
  event: string,
  value: () => T,
): AdminC2DriverObservation<T> {
  let listener: (() => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    listener = () => resolve(value());
    emitter.once(event, listener);
  });
  return {
    promise,
    remove: () => {
      if (listener !== undefined) {
        emitter.removeListener(event, listener);
      }
    },
  };
}

const driver: AdminC2DriverContract = {
  assertInstalledDriver: () => undefined,
  transactionStatus: (client) => (client as FakeClient).status,
  observeReadyForQuery: (client) => {
    const fake = client as FakeClient;
    return observation(fake.connection, 'readyForQuery', () => fake.status);
  },
  observeTransportClose: (client) => {
    const stream = (client as FakeClient).connection.stream;
    return stream.closed
      ? { promise: Promise.resolve(), remove: () => undefined }
      : observation(stream, 'close', () => undefined);
  },
  observeClientError: (client): AdminC2ClientErrorObservation => {
    const fake = client as FakeClient;
    let error: unknown;
    let resolveError: ((observed: unknown) => void) | undefined;
    const listener = (observed: unknown): void => {
      if (error === undefined) {
        error = observed;
        resolveError?.(observed);
      }
    };
    const promise = new Promise<unknown>((resolve) => {
      resolveError = resolve;
    });
    fake.on('error', listener);
    return {
      promise,
      currentError: () => error,
      remove: () => fake.removeListener('error', listener),
    };
  },
};

function service(
  client: FakeClient,
  diagnostics: AdminC2TransactionDiagnostic[] = [],
): AdminC2TransactionService {
  const pool: AdminC2PgPool = { connect: async () => client };
  return new AdminC2TransactionService(pool, driver, undefined, (diagnostic) =>
    diagnostics.push(diagnostic),
  );
}

async function start<T>(promise: Promise<T>): Promise<void> {
  void promise.catch(() => undefined);
  await vi.advanceTimersByTimeAsync(0);
}

describe('AdminC2TransactionService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses only the internal Connection ReadyForQuery event on the same client', async () => {
    vi.useFakeTimers();
    const client = new FakeClient([
      { sql: 'BEGIN', readyStatus: 'T' },
      { sql: 'SELECT 1', readyStatus: 'T' },
      { sql: 'COMMIT', readyStatus: 'I' },
    ]);
    let publicReadyCount = 0;
    client.on('readyForQuery', () => {
      publicReadyCount += 1;
    });

    const result = service(client).transaction(async (transaction) => {
      await transaction.query('SELECT 1');
      return 'ok';
    });
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe('ok');
    expect(publicReadyCount).toBe(0);
    expect(client.queries).toEqual(['BEGIN', 'SELECT 1', 'COMMIT']);
    expect(client.releases).toEqual([undefined]);
  });

  it('rolls back a primary failure and preserves it separately', async () => {
    vi.useFakeTimers();
    const client = new FakeClient([
      { sql: 'BEGIN', readyStatus: 'T' },
      { sql: 'ROLLBACK', readyStatus: 'I' },
    ]);
    const result = service(client).transaction(async () => {
      throw new Error('primary');
    });
    const assertion = expect(result).rejects.toMatchObject({
      code: 'CALLBACK_FAILED',
      primaryError: expect.objectContaining({ message: 'primary' }),
    });
    await vi.runAllTimersAsync();

    await assertion;
    expect(client.releases).toEqual([undefined]);
  });

  it('fails closed when BEGIN is explicitly rejected after causal idle', async () => {
    vi.useFakeTimers();
    const client = new FakeClient([{ sql: 'BEGIN', outcome: 'reject', readyStatus: 'I' }]);
    const result = service(client).transaction(async () => 'unreachable');
    const assertion = expect(result).rejects.toMatchObject({ code: 'BEGIN_FAILED' });
    await vi.runAllTimersAsync();

    await assertion;
    expect(client.queries).toEqual(['BEGIN']);
    expect(client.releases).toEqual([true]);
  });

  it('times out a BEGIN without acknowledgement and proves disposal', async () => {
    vi.useFakeTimers();
    const client = new FakeClient([{ sql: 'BEGIN', outcome: 'hang' }]);
    const result = service(client).transaction(async () => 'unreachable');
    await start(result);
    await vi.advanceTimersByTimeAsync(ADMIN_C2_TRANSACTION_BUDGETS.beginMs);
    await vi.advanceTimersByTimeAsync(0);

    await expect(result).rejects.toMatchObject({ code: 'BEGIN_TIMEOUT' });
    expect(client.releases).toEqual([true]);
    expect(client.connection.stream.closed).toBe(true);
  });

  it('classifies an explicit COMMIT rejection after causal idle and never rolls back', async () => {
    vi.useFakeTimers();
    const client = new FakeClient([
      { sql: 'BEGIN', readyStatus: 'T' },
      { sql: 'COMMIT', outcome: 'reject', readyStatus: 'I' },
    ]);
    const result = service(client).transaction(async () => 'value');
    const assertion = expect(result).rejects.toMatchObject({ code: 'COMMIT_REJECTED' });
    await vi.runAllTimersAsync();

    await assertion;
    expect(client.queries).toEqual(['BEGIN', 'COMMIT']);
    expect(client.releases).toEqual([true]);
    expect(client.connection.stream.closed).toBe(true);
  });

  it('classifies an absent COMMIT acknowledgement as unknown and proves close', async () => {
    vi.useFakeTimers();
    const client = new FakeClient([
      { sql: 'BEGIN', readyStatus: 'T' },
      { sql: 'COMMIT', outcome: 'hang' },
    ]);
    const result = service(client).transaction(async () => 'value');
    await start(result);
    await vi.advanceTimersByTimeAsync(ADMIN_C2_TRANSACTION_BUDGETS.commitAcknowledgementMs);
    await vi.advanceTimersByTimeAsync(0);

    await expect(result).rejects.toMatchObject({ code: 'COMMIT_UNKNOWN' });
    expect(client.queries).toEqual(['BEGIN', 'COMMIT']);
    expect(client.releases).toEqual([true]);
    expect(client.connection.stream.closed).toBe(true);
  });

  it('rejects a server ROLLBACK response to COMMIT without reporting success', async () => {
    vi.useFakeTimers();
    const client = new FakeClient([
      { sql: 'BEGIN', readyStatus: 'T' },
      { sql: 'COMMIT', readyStatus: 'I', resultCommand: 'ROLLBACK' },
    ]);
    const result = service(client).transaction(async () => 'not-durable');
    const assertion = expect(result).rejects.toMatchObject({ code: 'COMMIT_REJECTED' });
    await vi.runAllTimersAsync();

    await assertion;
    expect(client.releases).toEqual([true]);
  });

  it('abandons a late acquisition without using the client', async () => {
    vi.useFakeTimers();
    let resolveClient: ((client: FakeClient) => void) | undefined;
    const client = new FakeClient([]);
    const pool: AdminC2PgPool = {
      connect: () =>
        new Promise((resolve) => {
          resolveClient = resolve;
        }),
    };
    const result = new AdminC2TransactionService(pool, driver).transaction(async () => undefined);
    await start(result);
    await vi.advanceTimersByTimeAsync(ADMIN_C2_TRANSACTION_BUDGETS.acquireMs);
    await expect(result).rejects.toMatchObject({ code: 'ACQUISITION_TIMEOUT' });
    resolveClient?.(client);
    await vi.advanceTimersByTimeAsync(0);

    expect(client.releases).toEqual([true]);
    expect(client.queries).toEqual([]);
  });

  it('types an immediate acquisition failure and clears the deadline path', async () => {
    vi.useFakeTimers();
    const pool: AdminC2PgPool = {
      connect: () => Promise.reject(new Error('pool unavailable')),
    };
    const result = new AdminC2TransactionService(pool, driver).transaction(async () => undefined);
    const assertion = expect(result).rejects.toMatchObject({
      code: 'ACQUISITION_FAILED',
      primaryError: expect.objectContaining({ message: 'pool unavailable' }),
    });
    await vi.advanceTimersByTimeAsync(0);

    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('freezes a suspended callback, destroys the client and bounds one terminal grace', async () => {
    vi.useFakeTimers();
    const client = new FakeClient([{ sql: 'BEGIN', readyStatus: 'T' }]);
    const result = service(client).transaction(async () => new Promise<never>(() => undefined));
    await start(result);
    await vi.advanceTimersByTimeAsync(
      ADMIN_C2_TRANSACTION_BUDGETS.callbackMs + ADMIN_C2_TRANSACTION_BUDGETS.terminalGraceMs,
    );

    await expect(result).rejects.toMatchObject({ code: 'CALLBACK_TIMEOUT' });
    expect(client.queries).toEqual(['BEGIN']);
    expect(client.releases).toEqual([true]);
    expect(client.connection.stream.closed).toBe(true);
  });

  it('forbids COMMIT while a fire-and-forget raw query remains active', async () => {
    vi.useFakeTimers();
    const client = new FakeClient([
      { sql: 'BEGIN', readyStatus: 'T' },
      { sql: 'SELECT pg_sleep(60)', outcome: 'hang' },
    ]);
    const result = service(client).transaction(async (transaction) => {
      void transaction.query('SELECT pg_sleep(60)').catch(() => undefined);
      return 'premature';
    });
    await start(result);
    await vi.advanceTimersByTimeAsync(
      ADMIN_C2_TRANSACTION_BUDGETS.callbackMs + ADMIN_C2_TRANSACTION_BUDGETS.terminalGraceMs,
    );

    await expect(result).rejects.toMatchObject({ code: 'CALLBACK_NOT_QUIESCENT' });
    expect(client.queries).not.toContain('COMMIT');
    expect(client.releases).toEqual([true]);
    expect(client.hangingRejectors.size).toBe(0);
  });

  it('rolls back state E even when the callback absorbs the SQL error', async () => {
    vi.useFakeTimers();
    const client = new FakeClient([
      { sql: 'BEGIN', readyStatus: 'T' },
      { sql: 'SELECT broken', outcome: 'reject', readyStatus: 'E' },
      { sql: 'ROLLBACK', readyStatus: 'I' },
    ]);
    const result = service(client).transaction(async (transaction) => {
      await transaction.query('SELECT broken').catch(() => undefined);
      return 'not-committable';
    });
    const assertion = expect(result).rejects.toMatchObject({
      code: 'TRANSACTION_STATE_INVALID',
    });
    await vi.runAllTimersAsync();

    await assertion;
    expect(client.queries).toEqual(['BEGIN', 'SELECT broken', 'ROLLBACK']);
    expect(client.releases).toEqual([undefined]);
  });

  it('serializes concurrent callback queries so each consumes only its causal RFQ', async () => {
    vi.useFakeTimers();
    const client = new FakeClient([
      { sql: 'BEGIN', readyStatus: 'T' },
      { sql: 'SELECT first', readyStatus: 'T', delayMs: 5 },
      { sql: 'SELECT second', outcome: 'reject', readyStatus: 'E' },
      { sql: 'ROLLBACK', readyStatus: 'I' },
    ]);
    const result = service(client).transaction(async (transaction) => {
      const first = transaction.query('SELECT first');
      const second = transaction.query('SELECT second');
      await first;
      await second.catch(() => undefined);
      return 'not-committable';
    });
    const assertion = expect(result).rejects.toMatchObject({
      code: 'TRANSACTION_STATE_INVALID',
    });
    await vi.runAllTimersAsync();

    await assertion;
    expect(client.queries).toEqual(['BEGIN', 'SELECT first', 'SELECT second', 'ROLLBACK']);
  });

  it('rejects callback transaction control before it can make effects durable', async () => {
    vi.useFakeTimers();
    const client = new FakeClient([{ sql: 'BEGIN', readyStatus: 'T' }]);
    const result = service(client).transaction(async (transaction) => {
      await transaction.query('/* forbidden */ COMMIT').catch(() => undefined);
      return 'ignored';
    });
    const assertion = expect(result).rejects.toMatchObject({
      code: 'TRANSACTION_STATE_INVALID',
    });
    await vi.runAllTimersAsync();

    await assertion;
    expect(client.queries).toEqual(['BEGIN']);
    expect(client.releases).toEqual([true]);
  });

  it.each([
    "PREPARE TRANSACTION 'admin-c2-bypass'",
    'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE',
    'SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE',
  ])('rejects callback transaction control %s before the driver sees it', async (sql) => {
    vi.useFakeTimers();
    const client = new FakeClient([{ sql: 'BEGIN', readyStatus: 'T' }]);
    const result = service(client).transaction(async (transaction) => {
      await transaction.query(sql).catch(() => undefined);
      return 'ignored';
    });
    const assertion = expect(result).rejects.toMatchObject({
      code: 'TRANSACTION_STATE_INVALID',
    });
    await vi.runAllTimersAsync();

    await assertion;
    expect(client.queries).toEqual(['BEGIN']);
    expect(client.releases).toEqual([true]);
  });

  it('allows SQL PREPARE statements that do not control the transaction', async () => {
    vi.useFakeTimers();
    const sql = 'PREPARE admin_lookup AS SELECT 1';
    const client = new FakeClient([
      { sql: 'BEGIN', readyStatus: 'T' },
      { sql, readyStatus: 'T' },
      { sql: 'COMMIT', readyStatus: 'I' },
    ]);
    const result = service(client).transaction(async (transaction) => {
      await transaction.query(sql);
      return 'prepared';
    });
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe('prepared');
    expect(client.queries).toEqual(['BEGIN', sql, 'COMMIT']);
    expect(client.releases).toEqual([undefined]);
  });

  it('distinguishes rollback timeout and closes exactly once', async () => {
    vi.useFakeTimers();
    const client = new FakeClient([
      { sql: 'BEGIN', readyStatus: 'T' },
      { sql: 'ROLLBACK', outcome: 'hang' },
    ]);
    const result = service(client).transaction(async () => {
      throw new Error('primary');
    });
    await start(result);
    await vi.advanceTimersByTimeAsync(ADMIN_C2_TRANSACTION_BUDGETS.rollbackMs);
    await vi.advanceTimersByTimeAsync(0);

    await expect(result).rejects.toMatchObject({
      code: 'ROLLBACK_TIMEOUT',
      primaryError: expect.objectContaining({ message: 'primary' }),
    });
    expect(client.releases).toEqual([true]);
    expect(client.connection.stream.closed).toBe(true);
  });

  it('distinguishes an explicit ROLLBACK rejection after the primary failure', async () => {
    vi.useFakeTimers();
    const client = new FakeClient([
      { sql: 'BEGIN', readyStatus: 'T' },
      { sql: 'ROLLBACK', outcome: 'reject', readyStatus: 'I' },
    ]);
    const result = service(client).transaction(async () => {
      throw new Error('primary');
    });
    const assertion = expect(result).rejects.toMatchObject({
      code: 'ROLLBACK_FAILED',
      primaryError: expect.objectContaining({ message: 'primary' }),
    });
    await vi.runAllTimersAsync();

    await assertion;
    expect(client.releases).toEqual([true]);
  });

  it('handles a checked-out client transport error without an unhandled error event', async () => {
    vi.useFakeTimers();
    const client = new FakeClient([
      { sql: 'BEGIN', readyStatus: 'T' },
      { sql: 'SELECT pending', outcome: 'hang' },
    ]);
    const result = service(client).transaction(async (transaction) => {
      await transaction.query('SELECT pending');
      return 'unreachable';
    });
    await start(result);
    client.failTransport();
    await vi.runAllTimersAsync();

    await expect(result).rejects.toMatchObject({ code: 'TRANSACTION_STATE_INVALID' });
    expect(client.releases).toEqual([true]);
    expect(client.connection.stream.closed).toBe(true);
  });

  it('preserves a fulfilled COMMIT with non-idle status and discards the client', async () => {
    vi.useFakeTimers();
    const diagnostics: AdminC2TransactionDiagnostic[] = [];
    const client = new FakeClient([
      { sql: 'BEGIN', readyStatus: 'T' },
      { sql: 'COMMIT', readyStatus: 'T' },
    ]);
    const result = service(client, diagnostics).transaction(async () => 'durable');
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe('durable');
    expect(client.releases).toEqual([true]);
    expect(client.connection.stream.closed).toBe(true);
    expect(diagnostics).toEqual([
      expect.objectContaining({ phase: 'confirmed-commit-observability' }),
    ]);
  });

  it('never converts confirmed COMMIT into a replayable failure when release throws', async () => {
    vi.useFakeTimers();
    const diagnostics: AdminC2TransactionDiagnostic[] = [];
    const client = new FakeClient([
      { sql: 'BEGIN', readyStatus: 'T' },
      { sql: 'COMMIT', readyStatus: 'I' },
    ]);
    client.releaseError = new Error('release failed');
    const result = service(client, diagnostics).transaction(async () => 'durable');
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe('durable');
    expect(client.releases).toEqual([undefined]);
    expect(diagnostics).toEqual([expect.objectContaining({ phase: 'confirmed-commit-disposal' })]);
  });

  it('treats a synchronous COMMIT driver failure as unknown and disposes once', async () => {
    vi.useFakeTimers();
    const client = new FakeClient([
      { sql: 'BEGIN', readyStatus: 'T' },
      { sql: 'COMMIT', outcome: 'throw' },
    ]);
    const result = service(client).transaction(async () => 'value');
    const assertion = expect(result).rejects.toMatchObject({ code: 'COMMIT_UNKNOWN' });
    await vi.runAllTimersAsync();

    await assertion;
    expect(client.releases).toEqual([true]);
  });

  it('observes a late transaction query rejection internally', async () => {
    vi.useFakeTimers();
    const client = new FakeClient([
      { sql: 'BEGIN', readyStatus: 'T' },
      { sql: 'COMMIT', readyStatus: 'I' },
    ]);
    let late: Promise<QueryResult> | undefined;
    const result = service(client).transaction(async (transaction) => {
      setTimeout(() => {
        late = transaction.query('SELECT too_late');
      }, 1);
      return 'done';
    });
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe('done');
    await expect(late).rejects.toThrow('closed');
    expect(client.queries).toEqual(['BEGIN', 'COMMIT']);
  });

  it('fails closed when the qualified transaction-status wrapper is absent', async () => {
    vi.useFakeTimers();
    const client = new FakeClient([]);
    const invalidDriver: AdminC2DriverContract = {
      ...driver,
      transactionStatus: () => 'UNKNOWN',
    };
    const pool: AdminC2PgPool = { connect: async () => client };
    const result = new AdminC2TransactionService(pool, invalidDriver).transaction(
      async () => undefined,
    );
    const assertion = expect(result).rejects.toMatchObject({
      code: 'DRIVER_CONTRACT_VIOLATION',
    });
    await vi.runAllTimersAsync();

    await assertion;
    expect(client.releases).toEqual([true]);
  });

  it('locks every contractual monotonic budget', () => {
    expect(ADMIN_C2_TRANSACTION_BUDGETS).toEqual({
      acquireMs: 2_000,
      beginMs: 2_000,
      callbackMs: 5_000,
      rollbackMs: 2_000,
      commitAcknowledgementMs: 2_000,
      terminalGraceMs: 500,
    });
  });

  it('exposes typed errors without diffuse any', () => {
    const error = new AdminC2TransactionError('CALLBACK_FAILED', 'message', 'primary');
    expect(error.name).toBe('AdminC2TransactionError');
    expect(error.primaryError).toBe('primary');
  });
});

describe.runIf(process.env.S1203C2A_REAL_TRANSACTION === '1')(
  'AdminC2TransactionService with pg@8.22.0 and PostgreSQL',
  () => {
    it('uses the causal ReadyForQuery status and never reuses a discarded max=1 client', async () => {
      const database = process.env.S1203C2A_REAL_TRANSACTION_DATABASE;
      const host = process.env.S1203C2A_ADMIN_HOST;
      const password = process.env.S1203C2A_WRITER_PASSWORD;
      const port = Number(process.env.S1203C2A_ADMIN_PORT);
      const user = process.env.S1203C2A_WRITER_USER;
      if (!database || !host || !password || !Number.isInteger(port) || !user) {
        throw new Error('The isolated C2a PostgreSQL transaction fixture is incomplete.');
      }

      const pool = new Pool({ database, host, max: 1, password, port, user });
      pool.on('error', () => undefined);
      const executor = new AdminC2TransactionService({
        connect: async () => (await pool.connect()) as unknown as AdminC2PgClient,
      });
      try {
        const firstPid = await executor.transaction(async (transaction) => {
          const result = await transaction.query<{ pid: number }>(
            'SELECT pg_backend_pid()::integer AS pid',
          );
          return result.rows[0]?.pid;
        });
        expect(firstPid).toBeTypeOf('number');

        let discardedPid: number | undefined;
        await expect(
          executor.transaction(async (transaction) => {
            const result = await transaction.query<{ pid: number }>(
              'SELECT pg_backend_pid()::integer AS pid',
            );
            discardedPid = result.rows[0]?.pid;
            return new Promise<never>(() => undefined);
          }),
        ).rejects.toMatchObject({ code: 'CALLBACK_TIMEOUT' });

        const replacementPid = await executor.transaction(async (transaction) => {
          const result = await transaction.query<{ pid: number }>(
            'SELECT pg_backend_pid()::integer AS pid',
          );
          return result.rows[0]?.pid;
        });
        expect(discardedPid).toBeTypeOf('number');
        expect(replacementPid).toBeTypeOf('number');
        expect(replacementPid).not.toBe(discardedPid);
      } finally {
        await pool.end();
      }
    }, 15_000);
  },
);
