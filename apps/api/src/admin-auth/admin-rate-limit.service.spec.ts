import { createHash } from 'node:crypto';
import type { RedisOptions } from 'ioredis';
import type { AdminKeyedDigestProvider } from './admin-key-provider';
import {
  ADMIN_RATE_LIMIT_PROFILES,
  AdminRateLimitService,
  AdminRateLimitUnavailableError,
  type AdminRateLimitRedisClient,
} from './admin-rate-limit.service';

class DigestProvider implements AdminKeyedDigestProvider {
  async keyedDigest(domain: string, value: Uint8Array): Promise<Uint8Array> {
    return createHash('sha256').update(domain).update(value).digest();
  }
}

class FakeRedis implements AdminRateLimitRedisClient {
  readonly calls: string[] = [];
  evalResult: unknown = [1, 2, 900_000];
  waitAofResult: unknown = [1, 0];
  throwAt?: 'connect' | 'eval' | 'waitaof';

  async connect(): Promise<void> {
    this.calls.push('connect');
    if (this.throwAt === 'connect') {
      throw new Error('private redis diagnostic');
    }
  }

  async eval(
    script: string,
    numberOfKeys: number,
    ...args: Array<string | number>
  ): Promise<unknown> {
    this.calls.push(`eval:${numberOfKeys}:${args.join(':')}`);
    expect(script).toContain("redis.call('INCR', key)");
    if (this.throwAt === 'eval') {
      throw new Error('private redis diagnostic');
    }
    return this.evalResult;
  }

  async call(command: string, ...args: Array<string | number>): Promise<unknown> {
    this.calls.push(`call:${command}:${args.join(':')}`);
    if (this.throwAt === 'waitaof') {
      throw new Error('private redis diagnostic');
    }
    return this.waitAofResult;
  }

  disconnect(reconnect?: boolean): void {
    this.calls.push(`disconnect:${String(reconnect)}`);
  }
}

function createService(fake: FakeRedis): { options: RedisOptions; service: AdminRateLimitService } {
  let options: RedisOptions | undefined;
  const service = new AdminRateLimitService({
    clientFactory(candidate) {
      options = candidate;
      return fake;
    },
    keyProvider: new DigestProvider(),
    redis: {
      host: '127.0.0.1',
      port: 6379,
      tls: false,
      waitAofTimeoutMs: 250,
    },
  });
  return { options: options!, service };
}

describe('AdminRateLimitService', () => {
  it('verrouille les quatre profils exacts', () => {
    expect(ADMIN_RATE_LIMIT_PROFILES).toEqual({
      PASSWORD: { backoff: 'EXPONENTIAL', limit: 5, windowSeconds: 900 },
      RECOVERY: { backoff: 'EXPONENTIAL', limit: 5, windowSeconds: 3600 },
      REFRESH: { backoff: 'FIXED', limit: 10, windowSeconds: 60 },
      TOTP: { backoff: 'EXPONENTIAL', limit: 5, windowSeconds: 300 },
    });
  });

  it('utilise un client isolé borné sans retry ni offline queue', () => {
    const { options } = createService(new FakeRedis());
    expect(options).toMatchObject({
      autoResendUnfulfilledCommands: false,
      commandTimeout: 250,
      connectTimeout: 250,
      enableOfflineQueue: false,
      host: '127.0.0.1',
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      port: 6379,
    });
    expect(options.retryStrategy?.(1)).toBeNull();
    expect(options.reconnectOnError?.(new Error('test'))).toBe(false);
  });

  it('enchaîne Lua puis WAITAOF sur la même connexion sans PII brute', async () => {
    const fake = new FakeRedis();
    const { service } = createService(fake);
    await expect(
      service.consume('PASSWORD', '203.0.113.1', 'admin@example.invalid'),
    ).resolves.toEqual({
      allowed: true,
      remaining: 3,
      retryAfterSeconds: 900,
    });

    expect(fake.calls[0]).toBe('connect');
    expect(fake.calls[1]).toMatch(/^eval:2:/u);
    expect(fake.calls[2]).toBe('call:WAITAOF:1:0:250');
    expect(fake.calls.join('|')).not.toContain('203.0.113.1');
    expect(fake.calls.join('|')).not.toContain('admin@example.invalid');
    service.onModuleDestroy();
    expect(fake.calls.at(-1)).toBe('disconnect:false');
  });

  it('persiste aussi les compteurs refusés et expose un Retry-After borné', async () => {
    const fake = new FakeRedis();
    fake.evalResult = [0, 6, 1_800_000];
    const { service } = createService(fake);

    await expect(service.consume('TOTP', '203.0.113.1', 'context-id')).resolves.toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1800,
    });
    expect(fake.calls).toContain('call:WAITAOF:1:0:250');
  });

  it.each([
    ['connect', undefined],
    ['eval', undefined],
    ['waitaof', undefined],
    [undefined, [0, 0]],
    [undefined, ['malformed']],
  ] as const)('échoue fermé sur panne %s ou réponse WAITAOF %p', async (throwAt, waitResult) => {
    const fake = new FakeRedis();
    if (throwAt !== undefined) {
      fake.throwAt = throwAt;
    }
    if (waitResult !== undefined) {
      fake.waitAofResult = waitResult;
    }
    const { service } = createService(fake);

    await expect(service.consume('REFRESH', '203.0.113.1', 'selector')).rejects.toEqual(
      new AdminRateLimitUnavailableError(),
    );
  });
});
