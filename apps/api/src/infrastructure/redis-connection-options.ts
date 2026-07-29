import type { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';
import type { RuntimeConfig } from '../config/runtime-config';

export function redisConnectionOptions(config: ConfigService<RuntimeConfig, true>): RedisOptions {
  const redis = config.get('redis', { infer: true });

  return {
    host: redis.host,
    port: redis.port,
    lazyConnect: true,
    maxRetriesPerRequest: null,
    ...(redis.password === undefined ? {} : { password: redis.password }),
    ...(redis.tls ? { tls: {} } : {}),
  };
}
