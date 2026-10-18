import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { createHash } from 'node:crypto';
import type { RuntimeConfig } from '../config/runtime-config';
import { AdminC2aBoundariesService } from '../database/admin-c2a-boundaries.service';
import type {
  AdminNotificationDelivery,
  AdminNotificationDeliveryResult,
  AdminNotificationPort,
} from './admin-notification.port';
import { AdminNotificationModule } from './admin-notification.module';
import { TestAdminSecurityOutboxKeyring } from './admin-security.crypto';
import {
  AdminNotificationActivationGate,
  AdminNotificationWakeupProcessor,
  AdminNotificationWorker,
} from './admin-notification.worker';

const SHUTDOWN_TIMEOUT_MS = 30_000;
const PROCESS_PROOF_ENVIRONMENT = 'S1203C2A_PROCESS_PROOF';

class ProcessProofNotificationPort implements AdminNotificationPort {
  private readonly accepted = new Set<string>();

  async assertConfigured(): Promise<void> {}

  async deliver(delivery: AdminNotificationDelivery): Promise<AdminNotificationDeliveryResult> {
    if (delivery.signal.aborted) return { kind: 'NOT_ACCEPTED', retryable: false };
    this.accepted.add(delivery.logicalDeliveryId);
    const destinationHash = createHash('sha256')
      .update(delivery.payload.email ?? '', 'utf8')
      .digest('hex');
    process.stdout.write(
      `C2A_NOTIFICATION_PROCESS_PROOF_ACCEPTED purpose=${delivery.purpose} logicalDeliveryId=${delivery.logicalDeliveryId} destinationSha256=${destinationHash}\n`,
    );
    return {
      acknowledgement: `process-proof-${delivery.logicalDeliveryId}`,
      kind: 'ACCEPTED',
    };
  }

  async reconcile(logicalDeliveryId: string): Promise<'ACCEPTED' | 'NOT_FOUND'> {
    return this.accepted.has(logicalDeliveryId) ? 'ACCEPTED' : 'NOT_FOUND';
  }
}

function processProofEnabled(): boolean {
  const enabled = process.env[PROCESS_PROOF_ENVIRONMENT] === '1';
  if (enabled && process.env.NODE_ENV !== 'test') {
    throw new Error('C2a process-proof adapters require NODE_ENV=test.');
  }
  return enabled;
}

function directDependencies(): AdminNotificationMainDependencies {
  if (!processProofEnabled()) return {};
  return {
    createApplicationContext: async () =>
      (await NestFactory.createApplicationContext(
        AdminNotificationModule.register({
          notificationPort: new ProcessProofNotificationPort(),
          outboxKeyring: new TestAdminSecurityOutboxKeyring(),
        }),
        { logger: false },
      )) as AdminNotificationApplicationContext,
    onReady: () => process.stdout.write('C2A_NOTIFICATION_PROCESS_PROOF_READY\n'),
  };
}

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

interface AdminNotificationApplicationContext {
  close(): Promise<void>;
  get<T>(token: unknown): T;
}

export interface AdminNotificationMainDependencies {
  readonly createApplicationContext?: () => Promise<AdminNotificationApplicationContext>;
  readonly onReady?: () => void;
  readonly shutdownMs?: number;
}

export interface AdminNotificationMainOutcome {
  readonly failed: boolean;
  readonly forceExit: boolean;
  readonly processedWakeups: number;
}

export async function runAdminNotificationMain(
  dependencies: AdminNotificationMainDependencies = {},
): Promise<AdminNotificationMainOutcome> {
  const createApplicationContext =
    dependencies.createApplicationContext ??
    (async () =>
      (await NestFactory.createApplicationContext(AdminNotificationModule.register(), {
        logger: false,
      })) as AdminNotificationApplicationContext);
  const shutdownMs = dependencies.shutdownMs ?? SHUTDOWN_TIMEOUT_MS;
  let application: AdminNotificationApplicationContext | undefined;
  let activation: AdminNotificationActivationGate | undefined;
  let worker: AdminNotificationWorker | undefined;
  let failed = false;
  let forceExit = false;
  let processedWakeups = 0;
  let stopping = false;
  let wake: (() => void) | undefined;
  let resolveStop: (() => void) | undefined;
  const stopped = new Promise<void>((resolve) => {
    resolveStop = resolve;
  });
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    wake?.();
    resolveStop?.();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    application = await createApplicationContext();
    const config = application
      .get<ConfigService<RuntimeConfig, true>>(ConfigService)
      .get('adminC2a', {
        infer: true,
      });
    if (!config.enabled || config.profile !== 'NOTIFICATION') {
      throw new Error('The notification runner requires the NOTIFICATION profile.');
    }
    await application.get<AdminC2aBoundariesService>(AdminC2aBoundariesService).assertIdentity();
    const qualifiedWorker = application.get<AdminNotificationWorker>(AdminNotificationWorker);
    const qualifiedActivation = application.get<AdminNotificationActivationGate>(
      AdminNotificationActivationGate,
    );
    worker = qualifiedWorker;
    activation = qualifiedActivation;
    await qualifiedWorker.assertReady();
    if (!stopping) {
      qualifiedActivation.activate();
      dependencies.onReady?.();
      while (!stopping) {
        for (let inspected = 0; inspected < 100 && !stopping; inspected += 1) {
          const result = await Promise.race([
            qualifiedWorker.processOne().then((value) => ({ kind: 'RESULT' as const, value })),
            stopped.then(() => ({ kind: 'STOPPED' as const })),
          ]);
          if (result.kind === 'STOPPED' || result.value === 'IDLE') break;
        }
        if (stopping) break;
        await Promise.race([
          new Promise<void>((resolve) => {
            const finish = (): void => {
              clearTimeout(timer);
              wake = undefined;
              resolve();
            };
            const timer = setTimeout(finish, 60_000);
            wake = finish;
          }),
          stopped,
        ]);
      }
    }
  } catch {
    failed = true;
  } finally {
    const shutdownDeadline = Date.now() + shutdownMs;
    stop();
    activation?.deactivate();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    if (worker !== undefined) {
      const quiescence = await worker.awaitQuiescence(Math.max(0, shutdownDeadline - Date.now()));
      if (quiescence === 'TIMEOUT') forceExit = true;
      else if (quiescence === 'FAILED') failed = true;
    }
    if (application !== undefined) {
      try {
        processedWakeups = application
          .get<AdminNotificationWakeupProcessor>(AdminNotificationWakeupProcessor)
          .processedSignalCount();
      } catch {
        failed = true;
      }
      const closed = await within(application.close(), Math.max(0, shutdownDeadline - Date.now()));
      if (!closed) forceExit = true;
    }
  }
  return { failed: failed || forceExit, forceExit, processedWakeups };
}

const invokedDirectly =
  require.main === module &&
  process.argv[1] !== undefined &&
  /admin-notification\.main\.js$/u.test(process.argv[1].replaceAll('\\', '/'));

if (invokedDirectly) {
  const proof = processProofEnabled();
  if (proof) {
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', (value: string) => {
      if (value.trim() === 'SIGTERM') process.emit('SIGTERM');
    });
  }
  void runAdminNotificationMain(directDependencies()).then(
    (outcome) => {
      if (proof) {
        process.stdout.write(`C2A_NOTIFICATION_PROCESS_PROOF_OUTCOME ${JSON.stringify(outcome)}\n`);
      }
      if (outcome.forceExit) process.exit(1);
      if (outcome.failed) process.exitCode = 1;
    },
    () => {
      process.exitCode = 1;
    },
  );
}
