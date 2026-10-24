import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { isAbsolute } from 'node:path';
import { createInterface } from 'node:readline';
import type { RuntimeConfig } from '../config/runtime-config';
import { AdminC2bBoundariesService } from '../database/admin-c2b-boundaries.service';
import { AdminAuditExportModule } from './admin-audit-export.module';
import { TestAdminAuditExportStorageKeyring } from './admin-audit-export-keyring';
import { TestEd25519AdminAuditExportSigningPort } from './admin-audit-export-signing.port';
import { TestFileAdminAuditExportStorage } from './admin-audit-export-storage.port';
import { AdminAuditExportWorker } from './admin-audit-export.worker';

const SHUTDOWN_TIMEOUT_MS = 30_000;
const PROCESS_PROOF_ENVIRONMENT = 'S1203C2B_PROCESS_PROOF';
const TEST_STORAGE_DIRECTORY_ENVIRONMENT = 'S1203C2B_TEST_STORAGE_DIRECTORY';

interface ApplicationContext {
  close(): Promise<void>;
  get<T>(token: unknown): T;
}

interface SignalSource {
  on(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
  removeListener(event: 'SIGINT' | 'SIGTERM', listener: () => void): unknown;
}

export interface AdminAuditExportMainDependencies {
  readonly createApplicationContext?: () => Promise<ApplicationContext>;
  readonly onFailure?: (error: unknown) => void;
  readonly onReady?: () => void;
  readonly registerStop?: (stop: () => void) => () => void;
  readonly signalSource?: SignalSource;
  readonly shutdownMs?: number;
}

export interface AdminAuditExportMainOutcome {
  readonly failed: boolean;
  readonly forceExit: boolean;
}

function processProofEnabled(): boolean {
  const enabled = process.env[PROCESS_PROOF_ENVIRONMENT] === '1';
  if (enabled && process.env.NODE_ENV !== 'test') {
    throw new Error('C2b process-proof adapters require NODE_ENV=test.');
  }
  return enabled;
}

function directDependencies(): AdminAuditExportMainDependencies {
  if (!processProofEnabled()) return {};
  const storageDirectory = process.env[TEST_STORAGE_DIRECTORY_ENVIRONMENT];
  if (storageDirectory === undefined || !isAbsolute(storageDirectory)) {
    throw new Error('C2b process-proof storage directory must be an absolute path.');
  }
  return {
    createApplicationContext: async () =>
      (await NestFactory.createApplicationContext(
        AdminAuditExportModule.register({
          keyring: new TestAdminAuditExportStorageKeyring(),
          signing: new TestEd25519AdminAuditExportSigningPort(),
          storage: new TestFileAdminAuditExportStorage(storageDirectory),
        }),
        { logger: false },
      )) as ApplicationContext,
    onFailure: (error) => {
      process.stdout.write(
        `C2B_AUDIT_EXPORT_PROCESS_PROOF_FAILURE ${JSON.stringify(errorDiagnostic(error))}\n`,
      );
    },
    onReady: () => process.stdout.write('C2B_AUDIT_EXPORT_PROCESS_PROOF_READY\n'),
    registerStop: (stop) => {
      const lines = createInterface({ input: process.stdin, terminal: false });
      const listener = (line: string): void => {
        if (line === 'STOP') stop();
      };
      lines.on('line', listener);
      return () => {
        lines.removeListener('line', listener);
        lines.close();
      };
    },
  };
}

function errorDiagnostic(error: unknown, depth = 0): Readonly<Record<string, unknown>> {
  if (depth > 3 || typeof error !== 'object' || error === null) {
    return { valueType: typeof error };
  }
  const source = error as Record<string, unknown>;
  const diagnostic: Record<string, unknown> = {};
  for (const name of ['name', 'message', 'code', 'table', 'column', 'constraint'] as const) {
    if (typeof source[name] === 'string') diagnostic[name] = source[name];
  }
  for (const name of ['primaryError', 'rollbackError', 'cleanupError', 'cause'] as const) {
    if (source[name] !== undefined) diagnostic[name] = errorDiagnostic(source[name], depth + 1);
  }
  return diagnostic;
}

async function within(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.then(
        () => true,
        () => false,
      ),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), Math.max(0, timeoutMs));
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function runAdminAuditExportMain(
  dependencies: AdminAuditExportMainDependencies = {},
): Promise<AdminAuditExportMainOutcome> {
  const signalSource = dependencies.signalSource ?? process;
  const shutdownMs = dependencies.shutdownMs ?? SHUTDOWN_TIMEOUT_MS;
  let application: ApplicationContext | undefined;
  let worker: AdminAuditExportWorker | undefined;
  let stopping = false;
  let failed = false;
  let forceExit = false;
  let wake: (() => void) | undefined;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    wake?.();
  };
  signalSource.on('SIGINT', stop);
  signalSource.on('SIGTERM', stop);
  const unregisterStop = dependencies.registerStop?.(stop);
  try {
    application = await (
      dependencies.createApplicationContext ??
      (async () =>
        (await NestFactory.createApplicationContext(AdminAuditExportModule.register(), {
          logger: false,
        })) as ApplicationContext)
    )();
    const config = application
      .get<ConfigService<RuntimeConfig, true>>(ConfigService)
      .get('adminC2b', { infer: true });
    if (!config.enabled || config.profile !== 'EXPORT_WORKER') {
      throw new Error('The C2b export runner requires the EXPORT_WORKER profile.');
    }
    await application.get<AdminC2bBoundariesService>(AdminC2bBoundariesService).assertIdentity();
    worker = application.get<AdminAuditExportWorker>(AdminAuditExportWorker);
    dependencies.onReady?.();
    while (!stopping) {
      for (let inspected = 0; inspected < 100 && !stopping; inspected += 1) {
        if ((await worker.processOne()) === 'IDLE') break;
      }
      if (stopping) break;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 60_000);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      wake = undefined;
    }
  } catch (error: unknown) {
    failed = true;
    dependencies.onFailure?.(error);
  } finally {
    const deadline = Date.now() + shutdownMs;
    stop();
    if (worker !== undefined) {
      const state = await worker.awaitQuiescence(Math.max(0, deadline - Date.now()));
      if (state === 'TIMEOUT') forceExit = true;
      else if (state === 'FAILED') failed = true;
    }
    if (application !== undefined) {
      if (!(await within(application.close(), Math.max(0, deadline - Date.now()))))
        forceExit = true;
    }
    signalSource.removeListener('SIGINT', stop);
    signalSource.removeListener('SIGTERM', stop);
    unregisterStop?.();
  }
  return { failed: failed || forceExit, forceExit };
}

const invokedDirectly =
  require.main === module &&
  process.argv[1] !== undefined &&
  /admin-audit-export\.main\.js$/u.test(process.argv[1].replaceAll('\\', '/'));

if (invokedDirectly) {
  void runAdminAuditExportMain(directDependencies()).then(
    (outcome) => {
      if (processProofEnabled()) {
        process.stdout.write(`C2B_AUDIT_EXPORT_PROCESS_PROOF_OUTCOME ${JSON.stringify(outcome)}\n`);
      }
      if (outcome.forceExit) process.exit(1);
      if (outcome.failed) process.exitCode = 1;
    },
    () => {
      process.exitCode = 1;
    },
  );
}
