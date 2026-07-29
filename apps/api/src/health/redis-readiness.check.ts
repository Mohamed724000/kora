import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { RuntimeConfig } from '../config/runtime-config';
import { redisConnectionOptions } from '../infrastructure/redis-connection-options';
import type { ReadinessCheck } from './readiness-check';

@Injectable()
export class RedisReadinessCheck implements ReadinessCheck {
  readonly name = 'redis' as const;

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<RuntimeConfig, true>,
  ) {}

  async check(): Promise<void> {
    const readiness = this.config.get('readiness', { infer: true });
    const client = new Redis({
      ...redisConnectionOptions(this.config),
      connectTimeout: readiness.timeoutMs,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });

    try {
      await client.connect();
      await client.ping();
    } finally {
      client.disconnect(false);
    }
  }
}
