import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import Redis, { type RedisOptions } from 'ioredis';
import type { AdminKeyedDigestProvider } from './admin-key-provider';

export type AdminRateLimitProfile = 'PASSWORD' | 'RECOVERY' | 'REFRESH' | 'TOTP';
export const ADMIN_RATE_LIMITER = Symbol('ADMIN_RATE_LIMITER');

export interface AdminRateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface AdminRateLimitRedisClient {
  call(command: string, ...args: Array<string | number>): Promise<unknown>;
  connect(): Promise<void>;
  disconnect(reconnect?: boolean): void;
  eval(script: string, numberOfKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

export interface AdminRateLimitRedisOptions {
  host: string;
  password?: string;
  port: number;
  tls: boolean;
  waitAofTimeoutMs: number;
}

export interface AdminRateLimitServiceOptions {
  clientFactory?: (options: RedisOptions) => AdminRateLimitRedisClient;
  commandTimeoutMs?: number;
  keyProvider: AdminKeyedDigestProvider;
  redis: AdminRateLimitRedisOptions;
}

interface RateLimitProfileDefinition {
  backoff: 'EXPONENTIAL' | 'FIXED';
  limit: number;
  windowSeconds: number;
}

export const ADMIN_RATE_LIMIT_PROFILES: Readonly<
  Record<AdminRateLimitProfile, RateLimitProfileDefinition>
> = {
  PASSWORD: { backoff: 'EXPONENTIAL', limit: 5, windowSeconds: 900 },
  RECOVERY: { backoff: 'EXPONENTIAL', limit: 5, windowSeconds: 3600 },
  REFRESH: { backoff: 'FIXED', limit: 10, windowSeconds: 60 },
  TOTP: { backoff: 'EXPONENTIAL', limit: 5, windowSeconds: 300 },
};

const MAX_EXPONENTIAL_BACKOFF_POWER = 3;

const RATE_LIMIT_LUA = `
local limit = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local exponential = ARGV[3] == 'EXPONENTIAL'
local max_power = tonumber(ARGV[4])

local function consume(key)
  local count = redis.call('INCR', key)
  if count == 1 then
    redis.call('PEXPIRE', key, window_ms)
  elseif exponential and count > limit then
    local power = math.min(count - limit, max_power)
    local target = window_ms * (2 ^ power)
    local current = redis.call('PTTL', key)
    if current < target then
      redis.call('PEXPIRE', key, target)
    end
  end
  return {count, redis.call('PTTL', key)}
end

local ip = consume(KEYS[1])
local subject = consume(KEYS[2])
local maximum = math.max(ip[1], subject[1])
local retry_ms = math.max(ip[2], subject[2])
local allowed = 0
if ip[1] <= limit and subject[1] <= limit then
  allowed = 1
end
return {allowed, maximum, retry_ms}
`;

export class AdminRateLimitUnavailableError extends Error {
  constructor() {
    super('Admin rate-limit persistence unavailable.');
    this.name = 'AdminRateLimitUnavailableError';
  }
}

function positiveBoundedInteger(value: number, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function parseInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && /^-?\d+$/u.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseLuaResult(result: unknown): readonly [number, number, number] {
  if (!Array.isArray(result) || result.length !== 3) {
    throw new AdminRateLimitUnavailableError();
  }
  const allowed = parseInteger(result[0]);
  const count = parseInteger(result[1]);
  const retryMs = parseInteger(result[2]);
  if (
    (allowed !== 0 && allowed !== 1) ||
    count === undefined ||
    count < 1 ||
    retryMs === undefined ||
    retryMs < 1
  ) {
    throw new AdminRateLimitUnavailableError();
  }
  return [allowed, count, retryMs];
}

function parseWaitAofLocal(result: unknown): number {
  if (!Array.isArray(result) || result.length !== 2) {
    throw new AdminRateLimitUnavailableError();
  }
  const local = parseInteger(result[0]);
  const replicas = parseInteger(result[1]);
  if (local === undefined || replicas === undefined || local < 0 || replicas < 0) {
    throw new AdminRateLimitUnavailableError();
  }
  return local;
}

@Injectable()
export class AdminRateLimitService implements OnModuleDestroy {
  private readonly client: AdminRateLimitRedisClient;
  private connection: Promise<void> | undefined;

  constructor(private readonly options: AdminRateLimitServiceOptions) {
    const commandTimeoutMs = options.commandTimeoutMs ?? options.redis.waitAofTimeoutMs;
    if (
      !positiveBoundedInteger(options.redis.port, 1, 65_535) ||
      !positiveBoundedInteger(options.redis.waitAofTimeoutMs, 1, 10_000) ||
      !positiveBoundedInteger(commandTimeoutMs, 1, 10_000) ||
      options.redis.host.length === 0 ||
      options.redis.host.includes('://')
    ) {
      throw new TypeError('Invalid Admin Redis rate-limit configuration.');
    }
    const redisOptions: RedisOptions = {
      autoResendUnfulfilledCommands: false,
      commandTimeout: commandTimeoutMs,
      connectTimeout: commandTimeoutMs,
      enableOfflineQueue: false,
      host: options.redis.host,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      port: options.redis.port,
      reconnectOnError: () => false,
      retryStrategy: () => null,
      ...(options.redis.password === undefined ? {} : { password: options.redis.password }),
      ...(options.redis.tls ? { tls: {} } : {}),
    };
    this.client = options.clientFactory?.(redisOptions) ?? new Redis(redisOptions);
  }

  async consume(
    profile: AdminRateLimitProfile,
    ipAddress: string,
    subjectOrContext: string,
  ): Promise<AdminRateLimitDecision> {
    if (
      ipAddress.length < 1 ||
      ipAddress.length > 128 ||
      subjectOrContext.length < 1 ||
      subjectOrContext.length > 512 ||
      /\p{Cc}/u.test(ipAddress) ||
      /\p{Cc}/u.test(subjectOrContext)
    ) {
      throw new AdminRateLimitUnavailableError();
    }
    const definition = ADMIN_RATE_LIMIT_PROFILES[profile];
    try {
      await this.ensureConnected();
      const [ipDigest, subjectDigest] = await Promise.all([
        this.options.keyProvider.keyedDigest(
          `ADMIN_RATE_LIMIT_${profile}_IP_V1`,
          Buffer.from(ipAddress, 'utf8'),
        ),
        this.options.keyProvider.keyedDigest(
          `ADMIN_RATE_LIMIT_${profile}_SUBJECT_V1`,
          Buffer.from(subjectOrContext, 'utf8'),
        ),
      ]);
      const keyPrefix = `kora:admin-auth:rate:${profile.toLowerCase()}`;
      const result = await this.client.eval(
        RATE_LIMIT_LUA,
        2,
        `${keyPrefix}:ip:${Buffer.from(ipDigest).toString('hex')}`,
        `${keyPrefix}:subject:${Buffer.from(subjectDigest).toString('hex')}`,
        definition.limit,
        definition.windowSeconds * 1000,
        definition.backoff,
        MAX_EXPONENTIAL_BACKOFF_POWER,
      );
      const [allowed, count, retryMs] = parseLuaResult(result);
      const waitAof = await this.client.call('WAITAOF', 1, 0, this.options.redis.waitAofTimeoutMs);
      if (parseWaitAofLocal(waitAof) < 1) {
        throw new AdminRateLimitUnavailableError();
      }
      return {
        allowed: allowed === 1,
        remaining: Math.max(0, definition.limit - count),
        retryAfterSeconds: Math.max(1, Math.ceil(retryMs / 1000)),
      };
    } catch {
      throw new AdminRateLimitUnavailableError();
    }
  }

  close(): void {
    this.client.disconnect(false);
    this.connection = undefined;
  }

  onModuleDestroy(): void {
    this.close();
  }

  private async ensureConnected(): Promise<void> {
    this.connection ??= this.client.connect().catch((error: unknown) => {
      this.connection = undefined;
      throw error;
    });
    await this.connection;
  }
}
