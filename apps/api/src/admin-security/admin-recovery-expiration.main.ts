import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { RuntimeConfig } from '../config/runtime-config';
import { AdminC2aBoundariesService } from '../database/admin-c2a-boundaries.service';
import {
  ADMIN_RECOVERY_EXPIRATION_POLICY,
  AdminRecoveryExpirationStopSignal,
  AdminRecoveryExpirationWorker,
  runAdminRecoveryExpirationLoop,
} from './admin-recovery-expiration.worker';

async function within<T>(promise: Promise<T>, timeoutMs: number): Promise<boolean> {
  if (timeoutMs <= 0) {
    void promise.catch(() => undefined);
    return false;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([
      promise.then(
        () => true,
        () => false,
      ),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

interface AdminRecoveryExpirationApplicationContext {
  close(): Promise<void>;
  get<T>(token: unknown): T;
}

export interface AdminRecoveryExpirationMainDependencies {
  readonly clearReadinessInterval?: (timer: ReturnType<typeof setInterval>) => void;
  readonly createApplicationContext?: () => Promise<AdminRecoveryExpirationApplicationContext>;
  readonly now?: () => number;
  readonly onReady?: () => void;
  readonly setReadinessInterval?: (
    callback: () => void,
    milliseconds: number,
  ) => ReturnType<typeof setInterval>;
  readonly shutdownMs?: number;
  readonly stopSignal?: AdminRecoveryExpirationStopSignal;
}

export interface AdminRecoveryExpirationMainOutcome {
  readonly failed: boolean;
  readonly forceExit: boolean;
}

export async function runAdminRecoveryExpirationMain(
  dependencies: AdminRecoveryExpirationMainDependencies = {},
): Promise<AdminRecoveryExpirationMainOutcome> {
  const createApplicationContext =
    dependencies.createApplicationContext ??
    (async () => {
      const { AdminRecoveryExpirationModule } = await import('./admin-recovery-expiration.module');
      return (await NestFactory.createApplicationContext(AdminRecoveryExpirationModule, {
        logger: false,
      })) as AdminRecoveryExpirationApplicationContext;
    });
  const now = dependencies.now ?? Date.now;
  const setReadinessInterval = dependencies.setReadinessInterval ?? setInterval;
  const clearReadinessInterval = dependencies.clearReadinessInterval ?? clearInterval;
  const shutdownMs = dependencies.shutdownMs ?? ADMIN_RECOVERY_EXPIRATION_POLICY.shutdownMs;
  const stopSignal = dependencies.stopSignal ?? new AdminRecoveryExpirationStopSignal();
  let application: AdminRecoveryExpirationApplicationContext | undefined;
  let worker: AdminRecoveryExpirationWorker | undefined;
  let readinessTimer: ReturnType<typeof setInterval> | undefined;
  let failed = false;
  let forceExit = false;
  try {
    application = await createApplicationContext();
    const config = application
      .get<ConfigService<RuntimeConfig, true>>(ConfigService)
      .get('adminC2a', {
        infer: true,
      });
    if (!config.enabled || config.profile !== 'EXPIRATION') {
      throw new Error('The recovery-expiration runner requires the EXPIRATION profile.');
    }
    await application.get<AdminC2aBoundariesService>(AdminC2aBoundariesService).assertIdentity();
    const qualifiedWorker = application.get<AdminRecoveryExpirationWorker>(
      AdminRecoveryExpirationWorker,
    );
    worker = qualifiedWorker;
    const runnerStartedAt = now();
    readinessTimer = setReadinessInterval(() => {
      if (
        now() - runnerStartedAt >= ADMIN_RECOVERY_EXPIRATION_POLICY.readinessStaleMs &&
        !qualifiedWorker.isReady()
      ) {
        failed = true;
        stopSignal.stop();
      }
    }, ADMIN_RECOVERY_EXPIRATION_POLICY.intervalMs);
    dependencies.onReady?.();
    await runAdminRecoveryExpirationLoop(qualifiedWorker, stopSignal);
  } catch {
    failed = true;
  } finally {
    const shutdownDeadline = now() + shutdownMs;
    stopSignal.stop();
    stopSignal.dispose();
    if (readinessTimer !== undefined) clearReadinessInterval(readinessTimer);
    if (worker !== undefined) {
      const quiescence = await worker.awaitQuiescence(Math.max(0, shutdownDeadline - now()));
      if (quiescence === 'TIMEOUT') forceExit = true;
      else if (quiescence === 'FAILED') failed = true;
    }
    if (application !== undefined) {
      const closed = await within(application.close(), Math.max(0, shutdownDeadline - now()));
      if (!closed) forceExit = true;
    }
  }
  return { failed: failed || forceExit, forceExit };
}

const invokedDirectly =
  require.main === module &&
  process.argv[1] !== undefined &&
  /admin-recovery-expiration\.main\.js$/u.test(process.argv[1].replaceAll('\\', '/'));

if (invokedDirectly) {
  const proof = process.env.S1203C2A_PROCESS_PROOF === '1';
  if (proof && process.env.NODE_ENV !== 'test') {
    throw new Error('C2a process-proof output requires NODE_ENV=test.');
  }
  if (proof) {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (value: string) => {
      if (value.trim() === 'SIGTERM') process.emit('SIGTERM');
    });
  }
  void runAdminRecoveryExpirationMain(
    proof
      ? {
          onReady: () => process.stdout.write('C2A_EXPIRATION_PROCESS_PROOF_READY\n'),
        }
      : {},
  ).then(
    (outcome) => {
      if (proof) {
        process.stdout.write(`C2A_EXPIRATION_PROCESS_PROOF_OUTCOME ${JSON.stringify(outcome)}\n`);
      }
      if (outcome.forceExit) process.exit(1);
      if (outcome.failed) process.exitCode = 1;
    },
    () => {
      process.exitCode = 1;
    },
  );
}
