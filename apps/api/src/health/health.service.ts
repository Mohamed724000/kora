import { Inject, Injectable } from '@nestjs/common';
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

async function runCheck(check: ReadinessCheck): Promise<DependencyHealth> {
  const startedAt = Date.now();
  try {
    await check.check();
    return {
      latencyMs: Date.now() - startedAt,
      status: 'up',
    };
  } catch {
    return {
      latencyMs: Date.now() - startedAt,
      reason: 'unavailable',
      status: 'down',
    };
  }
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(READINESS_CHECKS)
    private readonly checks: readonly ReadinessCheck[],
  ) {}

  async readiness(): Promise<ReadinessResult> {
    const results = await Promise.all(
      this.checks.map(async (check) => [check.name, await runCheck(check)] as const),
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
