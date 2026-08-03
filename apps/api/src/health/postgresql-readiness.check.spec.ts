import type { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'node:events';
import { Pool } from 'pg';
import type { RuntimeConfig } from '../config/runtime-config';
import { PostgresqlReadinessCheck } from './postgresql-readiness.check';

jest.mock('pg', () => ({ Pool: jest.fn() }));

interface PoolDouble extends EventEmitter {
  end: jest.Mock<Promise<void>, []>;
  query: jest.Mock<Promise<unknown>, [string]>;
}

function createPoolDouble(): PoolDouble {
  return Object.assign(new EventEmitter(), {
    end: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    query: jest.fn<Promise<unknown>, [string]>().mockResolvedValue({}),
  });
}

function createConfig(): ConfigService<RuntimeConfig, true> {
  return {
    get: jest.fn((key: string) => {
      if (key === 'postgresql') {
        return {
          database: 'kora_test',
          host: '127.0.0.1',
          password: 'local-test-only',
          port: 5432,
          ssl: false,
          user: 'kora_test',
        };
      }
      if (key === 'readiness') {
        return { timeoutMs: 100 };
      }
      throw new Error(`Unexpected configuration key: ${key}`);
    }),
  } as unknown as ConfigService<RuntimeConfig, true>;
}

describe('PostgresqlReadinessCheck', () => {
  const MockedPool = jest.mocked(Pool);
  let pool: PoolDouble;
  let readinessCheck: PostgresqlReadinessCheck;

  beforeEach(() => {
    jest.clearAllMocks();
    pool = createPoolDouble();
    MockedPool.mockImplementation(() => pool as unknown as Pool);
    readinessCheck = new PostgresqlReadinessCheck(createConfig());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('absorbe une erreur de client inactif avec un listener unique et sans fuite', async () => {
    const sensitiveDetail = 'postgresql://private-user:private-password@database.internal/kora';
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    pool.query.mockImplementation(async () => {
      expect(pool.listenerCount('error')).toBe(1);
      return {};
    });

    await readinessCheck.check();
    await readinessCheck.check();

    expect(MockedPool).toHaveBeenCalledTimes(1);
    expect(pool.listenerCount('error')).toBe(1);
    expect(() => pool.emit('error', new Error(sensitiveDetail))).not.toThrow();
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('propage toujours un échec de requête au mécanisme de readiness', async () => {
    const queryError = new Error('controlled query failure');
    pool.query.mockRejectedValue(queryError);

    await expect(readinessCheck.check()).rejects.toBe(queryError);
    expect(pool.listenerCount('error')).toBe(1);
  });

  it('ferme toujours le pool pendant l’arrêt de l’application', async () => {
    await readinessCheck.check();
    await readinessCheck.onApplicationShutdown();

    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});
