import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolConfig } from 'pg';
import type { RuntimeConfig } from '../config/runtime-config';
import type { ReadinessCheck } from './readiness-check';

@Injectable()
export class PostgresqlReadinessCheck implements ReadinessCheck, OnApplicationShutdown {
  readonly name = 'postgresql' as const;

  private pool?: Pool;

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<RuntimeConfig, true>,
  ) {}

  async check(): Promise<void> {
    await this.getPool().query('SELECT 1');
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.pool !== undefined) {
      await this.pool.end();
    }
  }

  private getPool(): Pool {
    if (this.pool !== undefined) {
      return this.pool;
    }

    const postgresql = this.config.get('postgresql', { infer: true });
    const readiness = this.config.get('readiness', { infer: true });
    const options: PoolConfig = {
      application_name: 'kora-plus-api-readiness',
      connectionTimeoutMillis: readiness.timeoutMs,
      database: postgresql.database,
      host: postgresql.host,
      max: 1,
      password: postgresql.password,
      port: postgresql.port,
      query_timeout: readiness.timeoutMs,
      statement_timeout: readiness.timeoutMs,
      user: postgresql.user,
    };

    if (postgresql.ssl) {
      options.ssl = { rejectUnauthorized: true };
    }

    this.pool = new Pool(options);
    return this.pool;
  }
}
