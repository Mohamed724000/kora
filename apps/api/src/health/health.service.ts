import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RuntimeConfig } from '../config/runtime-config';
import { READINESS_CHECKS, type DependencyName, type ReadinessCheck } from './readiness-check';

export interface DependencyHealth {
  latencyMs: number;
  reason?: 'unavailable';
  status: 'up' | 'down';
}

export interface ReadinessResult {
  checks: Record<DependencyName, DependencyHealth>;
  status: 'ready' | 'not_ready';
}

async function runCheck(check: ReadinessCheck, timeoutMs: number): Promise<DependencyHealth> {
  const startedAt = Date.now();
  const status = await new Promise<'up' | 'down'>((resolve) => {
    let settled = false;

    const finish = (result: 'up' | 'down'): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish('down');
    }, timeoutMs);

    void Promise.resolve()
      .then(async () => check.check())
      .then(
        () => {
          finish('up');
        },
        () => {
          finish('down');
        },
      );
  });

  return {
    latencyMs: Date.now() - startedAt,
    ...(status === 'down' ? { reason: 'unavailable' as const } : {}),
    status,
  };
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService<RuntimeConfig, true>,
    @Inject(READINESS_CHECKS)
    private readonly checks: readonly ReadinessCheck[],
  ) {}

  async readiness(): Promise<ReadinessResult> {
    const readiness = this.config.get('readiness', { infer: true });
    const results = await Promise.all(
      this.checks.map(
        async (check) => [check.name, await runCheck(check, readiness.timeoutMs)] as const,
      ),
    );
    const checks = Object.fromEntries(results) as Record<DependencyName, DependencyHealth>;
    const ready =
      checks.postgresql !== undefined &&
      checks.redis !== undefined &&
      Object.values(checks).every((check) => check.status === 'up');

    return {
      checks,
      status: ready ? 'ready' : 'not_ready',
    };
  }
}
