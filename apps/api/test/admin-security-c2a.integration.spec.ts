import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import pg, { type Pool as PgPool } from 'pg';
import request, { type Test } from 'supertest';
import { AdminAuthCrypto } from '../src/admin-auth/admin-auth.crypto';
import type { AdminRole, AdminStepUpPurpose } from '../src/admin-auth/admin-auth.repository';
import { createApplication } from '../src/app.factory';
import type { AdminC2aProcessProfile, RuntimeConfig } from '../src/config/runtime-config';
import {
  AdminC2aBoundariesService,
  createAdminC2aPgPool,
} from '../src/database/admin-c2a-boundaries.service';
import type { AdminBootstrapCommand } from '../src/admin-security/admin-bootstrap.command';
import {
  ADMIN_NOTIFICATION_WAKEUP_QUEUE,
  AdminNotificationWorker,
} from '../src/admin-security/admin-notification.worker';
import { AdminRecoveryExpirationWorker } from '../src/admin-security/admin-recovery-expiration.worker';
import { AdminSecurityController } from '../src/admin-security/admin-security.controller';
import { AdminSecurityCrypto } from '../src/admin-security/admin-security.crypto';
import {
  AdminSecurityRepository,
  type AdminSecurityTransactionRepository,
} from '../src/admin-security/admin-security.repository';
import { createAdminSecurityC2aTestAdapters } from './admin-security-c2a-test-adapters';

const { Pool } = pg;

describe('Admin C2a route inventory', () => {
  it('registers exactly the eleven C2a operations and no C2b operation', () => {
    const methods = Object.getOwnPropertyNames(AdminSecurityController.prototype)
      .filter((name) => name !== 'constructor')
      .flatMap((name) => {
        const handler = Object.getOwnPropertyDescriptor(
          AdminSecurityController.prototype,
          name,
        )?.value;
        if (typeof handler !== 'function') return [];
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        return path === undefined || method === undefined ? [] : [{ method, path }];
      });

    expect(methods).toEqual(
      expect.arrayContaining([
        { method: RequestMethod.POST, path: 'auth/password/reset-requests' },
        { method: RequestMethod.POST, path: 'auth/password/reset' },
        { method: RequestMethod.POST, path: 'recovery-cases' },
        { method: RequestMethod.GET, path: 'recovery-cases' },
        { method: RequestMethod.GET, path: 'recovery-cases/:caseId' },
        { method: RequestMethod.POST, path: 'recovery-cases/:caseId/approve' },
        { method: RequestMethod.POST, path: 'invitations' },
        { method: RequestMethod.POST, path: 'auth/invitations/accept' },
        { method: RequestMethod.GET, path: 'users' },
        { method: RequestMethod.POST, path: 'users/:adminUserId/role-changes' },
        { method: RequestMethod.POST, path: 'users/:adminUserId/status-changes' },
      ]),
    );
    expect(methods).toHaveLength(11);
    expect(methods.some(({ path }) => path.includes('audit'))).toBe(false);
  });
});

const realBusiness = process.env.S1203C2A_BUSINESS_E2E === '1' ? describe : describe.skip;

interface SeededAdmin {
  readonly id: string;
  readonly tokens: Readonly<Partial<Record<AdminStepUpPurpose | 'GENERAL', string>>>;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length < 1) throw new Error(`${name} is required.`);
  return value;
}

function tokenId(token: string): string {
  const encoded = token.split('.')[1];
  if (encoded === undefined) throw new Error('Test token payload is absent.');
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
    jti?: unknown;
  };
  if (typeof payload.jti !== 'string') throw new Error('Test token JTI is absent.');
  return payload.jti;
}

interface ProcessProofOutcome {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
  readonly stdinOpenAtSignal?: boolean;
  readonly stdout: string;
}

async function runBoundedProcess(
  label: string,
  entry: string,
  environment: NodeJS.ProcessEnv,
  stdin: string,
): Promise<ProcessProofOutcome> {
  const child = spawn(process.execPath, [entry], {
    cwd: process.cwd(),
    env: environment,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
  });
  child.stdin.end(stdin, 'utf8');
  const outcome = await new Promise<ProcessProofOutcome>((resolveOutcome, reject) => {
    let forcedCloseTimer: NodeJS.Timeout | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
      forcedCloseTimer = setTimeout(() => {
        reject(new Error(`C2a ${label} process did not close within 5 seconds after SIGKILL.`));
      }, 5_000);
    }, 60_000);
    child.once('error', (error) => {
      clearTimeout(timer);
      if (forcedCloseTimer !== undefined) clearTimeout(forcedCloseTimer);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (forcedCloseTimer !== undefined) clearTimeout(forcedCloseTimer);
      resolveOutcome({ code, signal, stderr, stdout });
    });
  });
  if (timedOut) {
    throw new Error(
      `C2a ${label} process exceeded its 60 second proof bound and was reaped ` +
        `(code=${String(outcome.code)}, signal=${String(outcome.signal)}).`,
    );
  }
  process.stdout.write(
    `C2A_PROCESS_PROOF ${JSON.stringify({
      code: outcome.code,
      label,
      signal: outcome.signal,
      stderr: outcome.stderr,
      stdout: outcome.stdout,
    })}\n`,
  );
  return outcome;
}

interface RunningProcessProof {
  readonly stop: () => Promise<ProcessProofOutcome>;
  readonly terminateBySignal: (signal?: NodeJS.Signals) => Promise<ProcessProofOutcome>;
  readonly waitFor: (text: string) => Promise<void>;
}

function startRunningProcessProof(
  label: string,
  entry: string,
  environment: NodeJS.ProcessEnv,
): RunningProcessProof {
  const child = spawn(process.execPath, [entry], {
    cwd: process.cwd(),
    env: environment,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  let terminalError: Error | undefined;
  let terminalOutcome: ProcessProofOutcome | undefined;
  let signalPromise: Promise<ProcessProofOutcome> | undefined;
  let stopPromise: Promise<ProcessProofOutcome> | undefined;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of listeners) listener();
  };
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    stdout += chunk;
    notify();
  });
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    stderr += chunk;
    notify();
  });
  const closed = new Promise<ProcessProofOutcome>((resolveOutcome, reject) => {
    child.once('error', (error) => {
      terminalError = error;
      notify();
      reject(error);
    });
    child.once('close', (code, signal) => {
      terminalOutcome = { code, signal, stderr, stdout };
      notify();
      resolveOutcome(terminalOutcome);
    });
  });
  return {
    async stop(): Promise<ProcessProofOutcome> {
      stopPromise ??= (async () => {
        if (terminalOutcome === undefined && terminalError === undefined) {
          child.stdin.end('SIGTERM\n', 'utf8');
        }
        let gracefulTimer: NodeJS.Timeout | undefined;
        const graceful = await Promise.race([
          closed.then((outcome) => ({ outcome, timedOut: false as const })),
          new Promise<{ readonly timedOut: true }>((resolveTimeout) => {
            gracefulTimer = setTimeout(() => resolveTimeout({ timedOut: true }), 45_000);
            gracefulTimer.unref();
          }),
        ]).finally(() => {
          if (gracefulTimer !== undefined) clearTimeout(gracefulTimer);
        });
        let outcome: ProcessProofOutcome;
        if (graceful.timedOut) {
          child.kill('SIGKILL');
          let forcedCloseTimer: NodeJS.Timeout | undefined;
          outcome = await Promise.race([
            closed,
            new Promise<never>((_resolve, reject) => {
              forcedCloseTimer = setTimeout(
                () =>
                  reject(
                    new Error(`C2a ${label} process did not close within 5 seconds after SIGKILL.`),
                  ),
                5_000,
              );
              forcedCloseTimer.unref();
            }),
          ]).finally(() => {
            if (forcedCloseTimer !== undefined) clearTimeout(forcedCloseTimer);
          });
        } else {
          outcome = graceful.outcome;
        }
        process.stdout.write(
          `C2A_PROCESS_PROOF ${JSON.stringify({
            code: outcome.code,
            label,
            signal: outcome.signal,
            stderr: outcome.stderr,
            stdout: outcome.stdout,
          })}\n`,
        );
        if (graceful.timedOut) {
          throw new Error(
            `C2a ${label} process exceeded its 45 second shutdown bound and was reaped ` +
              `(code=${String(outcome.code)}, signal=${String(outcome.signal)}).`,
          );
        }
        return outcome;
      })();
      return stopPromise;
    },
    async terminateBySignal(signal = 'SIGTERM'): Promise<ProcessProofOutcome> {
      signalPromise ??= (async () => {
        const stdinOpenAtSignal = child.stdin.writable && !child.stdin.destroyed;
        if (!stdinOpenAtSignal) {
          throw new Error(`C2a ${label} parent stdin was not open before ${signal}.`);
        }
        if (terminalOutcome === undefined && terminalError === undefined && !child.kill(signal)) {
          throw new Error(`C2a ${label} process rejected the ${signal} delivery request.`);
        }
        let signalTimer: NodeJS.Timeout | undefined;
        const signaled = await Promise.race([
          closed.then((outcome) => ({ outcome, timedOut: false as const })),
          new Promise<{ readonly timedOut: true }>((resolveTimeout) => {
            signalTimer = setTimeout(() => resolveTimeout({ timedOut: true }), 45_000);
            signalTimer.unref();
          }),
        ]).finally(() => {
          if (signalTimer !== undefined) clearTimeout(signalTimer);
        });
        if (signaled.timedOut) {
          child.kill('SIGKILL');
          let forcedCloseTimer: NodeJS.Timeout | undefined;
          await Promise.race([
            closed,
            new Promise<never>((_resolve, reject) => {
              forcedCloseTimer = setTimeout(
                () =>
                  reject(
                    new Error(`C2a ${label} process did not close within 5 seconds after SIGKILL.`),
                  ),
                5_000,
              );
              forcedCloseTimer.unref();
            }),
          ]).finally(() => {
            if (forcedCloseTimer !== undefined) clearTimeout(forcedCloseTimer);
          });
          throw new Error(
            `C2a ${label} process exceeded its 45 second ${signal} shutdown bound and was reaped.`,
          );
        }
        process.stdout.write(
          `C2A_OS_SIGNAL_PROCESS_PROOF ${JSON.stringify({
            code: signaled.outcome.code,
            label,
            requestedSignal: signal,
            signal: signaled.outcome.signal,
            stderr: signaled.outcome.stderr,
            stdinOpenAtSignal,
            stdout: signaled.outcome.stdout,
          })}\n`,
        );
        return { ...signaled.outcome, stdinOpenAtSignal };
      })();
      return signalPromise;
    },
    async waitFor(text: string): Promise<void> {
      if (`${stdout}\n${stderr}`.includes(text)) return;
      await new Promise<void>((resolveWait, reject) => {
        const timer = setTimeout(() => {
          listeners.delete(check);
          reject(new Error(`C2a ${label} process did not emit ${text} within 30 seconds.`));
        }, 30_000);
        const check = (): void => {
          if (`${stdout}\n${stderr}`.includes(text)) {
            clearTimeout(timer);
            listeners.delete(check);
            resolveWait();
            return;
          }
          if (terminalError !== undefined || terminalOutcome !== undefined) {
            clearTimeout(timer);
            listeners.delete(check);
            reject(
              terminalError ??
                new Error(
                  `C2a ${label} process exited before emitting ${text} ` +
                    `(code=${String(terminalOutcome?.code)}, signal=${String(terminalOutcome?.signal)}).`,
                ),
            );
          }
        };
        listeners.add(check);
        check();
      });
    },
  };
}

async function eventually<T>(probe: () => Promise<T | undefined>, label: string): Promise<T> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== undefined) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`C2a real-process proof timed out while waiting for ${label}.`);
}

realBusiness('Admin C2a real PostgreSQL/Redis/HTTP', { timeout: 300_000 }, () => {
  const origin = 'https://admin.kora.invalid';
  const adapters = createAdminSecurityC2aTestAdapters();
  const authCrypto = new AdminAuthCrypto(adapters.adminKeyProvider);
  const securityCrypto = new AdminSecurityCrypto(adapters.outboxKeyring);
  let application: INestApplication;
  let owner: PgPool;
  let notificationBoundaries: AdminC2aBoundariesService;
  let expirationBoundaries: AdminC2aBoundariesService;
  let notificationWorker: AdminNotificationWorker;
  let expirationWorker: AdminRecoveryExpirationWorker;
  let bootstrapFirst: Awaited<ReturnType<AdminBootstrapCommand['execute']>>;
  let bootstrapSecond: Awaited<ReturnType<AdminBootstrapCommand['execute']>>;
  let creator: SeededAdmin;
  let approver: SeededAdmin;
  let concurrentAdmin: SeededAdmin;
  let recoveryOperator: SeededAdmin;
  let recoverySubject: SeededAdmin;
  let expirySubject: SeededAdmin;
  let expirationDueSubject: SeededAdmin;
  let accessTarget: SeededAdmin;
  let recoveryCaseId = '';
  let expiredRecoveryCaseId = '';
  let invitationId = '';

  const database = (): string => requiredEnvironment('S1203C2A_BUSINESS_DATABASE');
  const postgresPort = (): number => Number(requiredEnvironment('S1203C2A_BUSINESS_POSTGRES_PORT'));

  function profileBoundaries(
    profile: AdminC2aProcessProfile,
    user: string,
    password: string,
  ): AdminC2aBoundariesService {
    const adminC2a: RuntimeConfig['adminC2a'] = {
      enabled: true,
      pool: {
        database: database(),
        host: '127.0.0.1',
        password,
        port: postgresPort(),
        ssl: false,
        user,
      },
      profile,
    };
    const config = {
      getOrThrow(path: string): RuntimeConfig['adminC2a'] {
        if (path !== 'adminC2a') throw new Error('Unexpected C2a test config path.');
        return adminC2a;
      },
    } as unknown as ConfigService<RuntimeConfig, true>;
    return new AdminC2aBoundariesService(config, createAdminC2aPgPool);
  }

  function processEnvironment(profile: AdminC2aProcessProfile): NodeJS.ProcessEnv {
    const port = String(postgresPort());
    const redisPort = requiredEnvironment('S1203C2A_BUSINESS_REDIS_PORT');
    const environment = { ...process.env };
    for (const name of [
      'ADMIN_C2A_BOOTSTRAP_DATABASE_PASSWORD',
      'ADMIN_C2A_BOOTSTRAP_DATABASE_USER',
      'ADMIN_C2A_EXPIRATION_WORKER_DATABASE_PASSWORD',
      'ADMIN_C2A_EXPIRATION_WORKER_DATABASE_USER',
      'ADMIN_C2A_NOTIFICATION_WORKER_DATABASE_PASSWORD',
      'ADMIN_C2A_NOTIFICATION_WORKER_DATABASE_USER',
      'ADMIN_C2A_WRITER_DATABASE_PASSWORD',
      'ADMIN_C2A_WRITER_DATABASE_USER',
    ]) {
      delete environment[name];
    }
    const profileCredentials: Readonly<Record<AdminC2aProcessProfile, NodeJS.ProcessEnv>> = {
      BOOTSTRAP: {
        ADMIN_C2A_BOOTSTRAP_DATABASE_PASSWORD: requiredEnvironment(
          'S1203C2A_BUSINESS_BOOTSTRAP_PASSWORD',
        ),
        ADMIN_C2A_BOOTSTRAP_DATABASE_USER: 'kora_admin_c2a_bootstrap',
      },
      EXPIRATION: {
        ADMIN_C2A_EXPIRATION_WORKER_DATABASE_PASSWORD: requiredEnvironment(
          'S1203C2A_BUSINESS_EXPIRATION_PASSWORD',
        ),
        ADMIN_C2A_EXPIRATION_WORKER_DATABASE_USER: 'kora_admin_c2a_expiration_worker',
      },
      HTTP: {
        ADMIN_C2A_WRITER_DATABASE_PASSWORD: requiredEnvironment(
          'S1203C2A_BUSINESS_WRITER_PASSWORD',
        ),
        ADMIN_C2A_WRITER_DATABASE_USER: 'kora_admin_c2a_writer',
      },
      NOTIFICATION: {
        ADMIN_C2A_NOTIFICATION_WORKER_DATABASE_PASSWORD: requiredEnvironment(
          'S1203C2A_BUSINESS_NOTIFICATION_PASSWORD',
        ),
        ADMIN_C2A_NOTIFICATION_WORKER_DATABASE_USER: 'kora_admin_c2a_notification_worker',
      },
    };
    return {
      ...environment,
      ...profileCredentials[profile],
      ADMIN_C2A_DATABASE_HOST: '127.0.0.1',
      ADMIN_C2A_DATABASE_NAME: database(),
      ADMIN_C2A_DATABASE_PORT: port,
      ADMIN_C2A_DATABASE_SSL: 'false',
      ADMIN_C2A_ENABLED: 'true',
      ADMIN_C2A_PROFILE: profile,
      ADMIN_DATABASE_HOST: '127.0.0.1',
      ADMIN_DATABASE_NAME: database(),
      ADMIN_DATABASE_PASSWORD: requiredEnvironment('S1203C2A_BUSINESS_C1_WRITER_PASSWORD'),
      ADMIN_DATABASE_PORT: port,
      ADMIN_DATABASE_SSL: 'false',
      ADMIN_DATABASE_USER: requiredEnvironment('S1203C2A_BUSINESS_C1_WRITER_USER'),
      ADMIN_ORIGIN: origin,
      ADMIN_REDIS_HOST: '127.0.0.1',
      ADMIN_REDIS_PASSWORD: requiredEnvironment('S1203C2A_BUSINESS_REDIS_PASSWORD'),
      ADMIN_REDIS_PORT: redisPort,
      ADMIN_REDIS_TLS: 'false',
      ADMIN_REDIS_WAIT_AOF_TIMEOUT_MS: '5000',
      API_HOST: '127.0.0.1',
      API_PORT: '3001',
      DATABASE_HOST: '127.0.0.1',
      DATABASE_NAME: database(),
      DATABASE_PASSWORD: requiredEnvironment('S1203C2A_BUSINESS_READER_PASSWORD'),
      DATABASE_PORT: port,
      DATABASE_SSL: 'false',
      DATABASE_USER: requiredEnvironment('S1203C2A_BUSINESS_READER_USER'),
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
      READINESS_TIMEOUT_MS: '5000',
      REDIS_HOST: '127.0.0.1',
      REDIS_PASSWORD: requiredEnvironment('S1203C2A_BUSINESS_REDIS_PASSWORD'),
      REDIS_PORT: redisPort,
      REDIS_TLS: 'false',
      S1203C2A_PROCESS_PROOF: '1',
    };
  }

  async function seedAdmin(
    email: string,
    role: AdminRole,
    purposes: readonly (AdminStepUpPurpose | 'GENERAL')[] = [],
  ): Promise<SeededAdmin> {
    const id = randomUUID();
    const now = new Date();
    const passwordHash = await authCrypto.hashPassword('C2aSeedPassword!2026');
    const totpSecret = await authCrypto.encryptTotpSecret(
      createHash('sha256').update(id, 'utf8').digest(),
      id,
    );
    await owner.query(
      `INSERT INTO "AdminUser"
         ("id", "email", "passwordHash", "role", "status", "authorizationVersion",
          "totpSecretEncrypted", "totpEnabledAt", "createdAt")
       VALUES ($1, $2, $3, $4, 'ACTIVE', 1, $5, $6, $6)`,
      [id, email, passwordHash, role, totpSecret, now],
    );

    const tokens: Partial<Record<AdminStepUpPurpose | 'GENERAL', string>> = {};
    for (const purpose of purposes) {
      const sessionId = randomUUID();
      const token = await authCrypto.issueAccessToken(
        { adminUserId: id, authorizationVersion: 1, role, sessionId },
        Math.floor(now.getTime() / 1000),
      );
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
      const stepUp = purpose === 'GENERAL' ? null : purpose;
      await owner.query(
        `INSERT INTO "AdminSession"
           ("id", "adminUserId", "tokenFamilyId", "accessTokenJti", "refreshTokenHash",
            "refreshTokenVersion", "lastTwoFactorAt", "lastActivityAt", "expiresAt",
            "absoluteExpiresAt", "authorizationVersion", "stepUpPurpose", "stepUpVerifiedAt",
            "stepUpExpiresAt", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, 1, $6, $6, $7, $8, 1, $9, $10, $11, $6, $6)`,
        [
          sessionId,
          id,
          randomUUID(),
          tokenId(token),
          createHash('sha256').update(`refresh-${sessionId}`, 'utf8').digest('hex'),
          now,
          expiresAt,
          new Date(now.getTime() + 60 * 60 * 1000),
          stepUp,
          stepUp === null ? null : now,
          stepUp === null ? null : new Date(now.getTime() + 5 * 60 * 1000),
        ],
      );
      tokens[purpose] = token;
    }
    return { id, tokens };
  }

  function bearer(admin: SeededAdmin, purpose: AdminStepUpPurpose | 'GENERAL'): string {
    const value = admin.tokens[purpose];
    if (value === undefined) throw new Error(`Missing test token for ${purpose}.`);
    return `Bearer ${value}`;
  }

  async function clearRecoveryRateLimitFixture(): Promise<void> {
    const client = new Redis({
      autoResendUnfulfilledCommands: false,
      enableOfflineQueue: false,
      host: '127.0.0.1',
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      password: requiredEnvironment('S1203C2A_BUSINESS_REDIS_PASSWORD'),
      port: Number(requiredEnvironment('S1203C2A_BUSINESS_REDIS_PORT')),
      retryStrategy: () => null,
    });
    try {
      await client.connect();
      let cursor = '0';
      do {
        const [nextCursor, keys] = await client.scan(
          cursor,
          'MATCH',
          'kora:admin-auth:rate:recovery:*',
          'COUNT',
          100,
        );
        if (keys.length > 0) await client.unlink(...keys);
        cursor = nextCursor;
      } while (cursor !== '0');
    } finally {
      client.disconnect(false);
    }
  }

  beforeAll(async () => {
    const port = postgresPort();
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
      throw new Error('S1203C2A_BUSINESS_POSTGRES_PORT is invalid.');
    }
    const redisPort = Number(requiredEnvironment('S1203C2A_BUSINESS_REDIS_PORT'));
    if (!Number.isSafeInteger(redisPort) || redisPort < 1 || redisPort > 65_535) {
      throw new Error('S1203C2A_BUSINESS_REDIS_PORT is invalid.');
    }
    owner = new Pool({
      database: database(),
      host: '127.0.0.1',
      max: 1,
      password: requiredEnvironment('S1203C2A_BUSINESS_ADMIN_PASSWORD'),
      port,
      user: requiredEnvironment('S1203C2A_BUSINESS_ADMIN_USER'),
    });

    const bootstrapEntry = resolve(
      process.cwd(),
      'dist',
      'src',
      'admin-security',
      'admin-bootstrap.main.js',
    );
    const bootstrapInput = `${JSON.stringify({
      email: 'bootstrap@example.invalid',
      password: 'BootstrapLocal!2026',
    })}\n`;
    const bootstrapProcesses = await Promise.all([
      runBoundedProcess(
        'admin:bootstrap:concurrent-a',
        bootstrapEntry,
        processEnvironment('BOOTSTRAP'),
        bootstrapInput,
      ),
      runBoundedProcess(
        'admin:bootstrap:concurrent-b',
        bootstrapEntry,
        processEnvironment('BOOTSTRAP'),
        bootstrapInput,
      ),
    ]);
    const bootstrapOutcomes = bootstrapProcesses.map(
      (outcome) =>
        JSON.parse(outcome.stdout || outcome.stderr) as Awaited<
          ReturnType<AdminBootstrapCommand['execute']>
        >,
    );
    bootstrapFirst = bootstrapOutcomes.find(({ exitCode }) => exitCode === 0)!;
    bootstrapSecond = bootstrapOutcomes.find(({ exitCode }) => exitCode === 3)!;
    expect(bootstrapProcesses.map(({ code }) => code).sort()).toEqual([0, 3]);
    expect(bootstrapFirst).toBeDefined();
    expect(bootstrapSecond).toBeDefined();

    creator = await seedAdmin('creator@example.invalid', 'SUPER_ADMIN', [
      'INVITATION',
      'ROLE_CHANGE',
      'STATUS_CHANGE',
    ]);
    approver = await seedAdmin('approver@example.invalid', 'SUPER_ADMIN', [
      'GENERAL',
      'RECOVERY_APPROVAL',
    ]);
    concurrentAdmin = await seedAdmin('concurrent@example.invalid', 'SUPER_ADMIN', [
      'STATUS_CHANGE',
    ]);
    await seedAdmin('reset@example.invalid', 'SUPPORT');
    recoveryOperator = await seedAdmin('recovery-operator@example.invalid', 'SUPPORT', ['GENERAL']);
    recoverySubject = await seedAdmin('recovery@example.invalid', 'SUPPORT');
    expirySubject = await seedAdmin('expiry@example.invalid', 'CONTENT_EDITOR');
    expirationDueSubject = await seedAdmin('expiration-due@example.invalid', 'CONTENT_EDITOR');
    accessTarget = await seedAdmin('target@example.invalid', 'SUPPORT');

    const runtimeEnvironment = Object.fromEntries(
      Object.entries(processEnvironment('HTTP')).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    application = await createApplication({
      adminKeyProvider: adapters.adminKeyProvider,
      adminSecurity: {
        notificationPort: adapters.notificationPort,
        outboxKeyring: adapters.outboxKeyring,
        passwordCompromisePort: adapters.passwordCompromisePort,
      },
      environment: runtimeEnvironment,
    });

    notificationBoundaries = profileBoundaries(
      'NOTIFICATION',
      'kora_admin_c2a_notification_worker',
      requiredEnvironment('S1203C2A_BUSINESS_NOTIFICATION_PASSWORD'),
    );
    expirationBoundaries = profileBoundaries(
      'EXPIRATION',
      'kora_admin_c2a_expiration_worker',
      requiredEnvironment('S1203C2A_BUSINESS_EXPIRATION_PASSWORD'),
    );
    await notificationBoundaries.assertIdentity();
    await expirationBoundaries.assertIdentity();
    notificationWorker = new AdminNotificationWorker(
      new AdminSecurityRepository(notificationBoundaries),
      securityCrypto,
      adapters.notificationPort,
    );
    expirationWorker = new AdminRecoveryExpirationWorker(
      new AdminSecurityRepository(expirationBoundaries),
    );
  }, 300_000);

  afterAll(async () => {
    await application?.close();
    await notificationBoundaries?.onModuleDestroy();
    await expirationBoundaries?.onModuleDestroy();
    await owner?.end();
  }, 60_000);

  it('qualifies bootstrap with one confirmed success and no automatic replay', async () => {
    expect(bootstrapFirst).toEqual({
      adminUserId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      exitCode: 0,
      nextStep: 'FIRST_TOTP_ENROLLMENT',
      status: 'CREATED',
    });
    expect(bootstrapSecond).toEqual({ exitCode: 3, status: 'ALREADY_BOOTSTRAPPED' });
    const state = await owner.query<{ guards: string; users: string }>(
      `SELECT
         (SELECT count(*)::text FROM "AdminBootstrapGuard") AS guards,
         (SELECT count(*)::text FROM "AdminUser"
           WHERE "email" = 'bootstrap@example.invalid'
             AND "role" = 'SUPER_ADMIN'
             AND "status" = 'PENDING_MFA') AS users`,
    );
    expect(state.rows[0]).toEqual({ guards: '1', users: '1' });
  });

  it('executes the eleven operations, five replays, two snapshots and notification continuations', async () => {
    const server = application.getHttpServer();
    const passwordResetRequest = await request(server)
      .post('/api/v1/admin/auth/password/reset-requests')
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ email: 'Reset@Example.Invalid' })
      .expect(202);
    expect(passwordResetRequest.body).toMatchObject({ data: { accepted: true } });
    expect(JSON.stringify(passwordResetRequest.body)).not.toMatch(/code|token|secret/iu);

    await request(server)
      .post('/api/v1/admin/auth/password/reset-requests')
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ email: 'absent@example.invalid' })
      .expect(202);
    await expect(notificationWorker.processOne()).resolves.toBe('DELIVERED');
    const resetDelivery = adapters.notificationPort
      .acceptedDeliveries()
      .find(({ purpose }) => purpose === 'PASSWORD_RESET');
    expect(resetDelivery?.simulatedEvent).toBe('PROVIDER_ACCEPTED_FOR_TEST');
    expect(resetDelivery?.payload.email).toBe('Reset@Example.Invalid');
    const resetCode = resetDelivery?.payload.code;
    expect(typeof resetCode).toBe('string');
    const resetResponse = await request(server)
      .post('/api/v1/admin/auth/password/reset')
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('X-Request-Id', 'c2a-password-reset-success')
      .send({ newPassword: 'C2aResetPassword!2026', resetCode });
    if (resetResponse.status !== 204) {
      const failure = await owner.query<{
        failureCode: string | null;
        outcome: string;
        source: string;
      }>(
        `SELECT 'AUDIT'::text AS source, "outcome"::text AS outcome,
                "failureCode"::text AS "failureCode"
           FROM "AuditLog" WHERE "requestId" = 'c2a-password-reset-success'
         UNION ALL
         SELECT 'SECURITY'::text, "outcome"::text, "failureCode"::text
           FROM "AdminSecurityEvent" WHERE "requestId" = 'c2a-password-reset-success'`,
      );
      const state = await owner.query<{ authorizationVersion: number; consumed: boolean }>(
        `SELECT (context."consumedAt" IS NOT NULL) AS consumed,
                u."authorizationVersion" AS "authorizationVersion"
           FROM "AdminPasswordResetContext" AS context
           JOIN "AdminUser" AS u ON u."id" = context."adminUserId"
          WHERE context."tokenHash" = $1`,
        [securityCrypto.sha256(resetCode!)],
      );
      throw new Error(
        `Password reset diagnostic: status=${resetResponse.status} evidence=${JSON.stringify({
          failure: failure.rows,
          state: state.rows,
        })}`,
      );
    }
    expect(resetResponse.status).toBe(204);

    const invitationBody = {
      email: 'Invitee@Example.Invalid',
      operatorReason: 'approved local invitation',
      reasonCode: 'INVITATION_ADMINISTRATION',
      role: 'FINANCE_MANAGER',
    };
    const invitation = await request(server)
      .post('/api/v1/admin/invitations')
      .set('Authorization', bearer(creator, 'INVITATION'))
      .set('Idempotency-Key', 'c2a-invitation-idempotency-01')
      .set('Origin', origin)
      .send(invitationBody)
      .expect(201);
    invitationId = invitation.body.data.invitationId as string;
    expect(invitation.headers.location).toBe(`/api/v1/admin/invitations/${invitationId}`);
    expect(JSON.stringify(invitation.body)).not.toMatch(/code|token|secret/iu);
    adapters.notificationPort.setAvailable(false);
    const keyringAvailability = vi
      .spyOn(adapters.outboxKeyring, 'assertAvailable')
      .mockRejectedValue(new Error('controlled keyring unavailability'));
    const keyringWrite = vi
      .spyOn(adapters.outboxKeyring, 'activeWriteKey')
      .mockRejectedValue(new Error('controlled keyring unavailability'));
    const invitationReplay = await (async () => {
      try {
        return await request(server)
          .post('/api/v1/admin/invitations')
          .set('Authorization', bearer(creator, 'INVITATION'))
          .set('Idempotency-Key', 'c2a-invitation-idempotency-01')
          .set('Origin', origin)
          .send(invitationBody)
          .expect(201);
      } finally {
        keyringAvailability.mockRestore();
        keyringWrite.mockRestore();
        adapters.notificationPort.setAvailable(true);
      }
    })();
    expect(invitationReplay.body.data.invitationId).toBe(invitationId);
    expect(keyringAvailability).not.toHaveBeenCalled();
    expect(keyringWrite).not.toHaveBeenCalled();
    await expect(notificationWorker.processOne()).resolves.toBe('DELIVERED');
    const invitationDelivery = adapters.notificationPort
      .acceptedDeliveries()
      .find(({ purpose }) => purpose === 'INVITATION');
    expect(invitationDelivery?.simulatedEvent).toBe('PROVIDER_ACCEPTED_FOR_TEST');
    expect(invitationDelivery?.payload.email).toBe('Invitee@Example.Invalid');
    const invitationCode = invitationDelivery?.payload.code;
    expect(typeof invitationCode).toBe('string');
    const accepted = await request(server)
      .post('/api/v1/admin/auth/invitations/accept')
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ invitationCode, password: 'C2aInvitation!2026' })
      .expect(200);
    expect(accepted.body.data.nextStep).toBe('FIRST_TOTP_ENROLLMENT');
    expect(accepted.headers['set-cookie']).toHaveLength(2);

    const concurrentInvitationBody = {
      email: 'Concurrent-Invitee@Example.Invalid',
      operatorReason: 'concurrent invitation serialization',
      reasonCode: 'INVITATION_ADMINISTRATION',
      role: 'SUPPORT',
    } as const;
    const concurrentInvitations = await Promise.all(
      [0, 1].map(() =>
        request(server)
          .post('/api/v1/admin/invitations')
          .set('Authorization', bearer(creator, 'INVITATION'))
          .set('Idempotency-Key', 'c2a-invitation-concurrent-key-01')
          .set('Origin', origin)
          .send(concurrentInvitationBody)
          .expect(201),
      ),
    );
    expect(concurrentInvitations[0]?.body.data.invitationId).toBe(
      concurrentInvitations[1]?.body.data.invitationId,
    );
    const concurrentState = await owner.query<{ invitations: string; outboxes: string }>(
      `SELECT
         (SELECT count(*)::text FROM "AdminInvitation"
           WHERE "emailCanonical" = 'concurrent-invitee@example.invalid') AS invitations,
         (SELECT count(*)::text FROM "AdminNotificationOutbox" AS outbox
           JOIN "AdminInvitation" AS invitation ON invitation."id" = outbox."adminInvitationId"
          WHERE invitation."emailCanonical" = 'concurrent-invitee@example.invalid') AS outboxes`,
    );
    expect(concurrentState.rows[0]).toEqual({ invitations: '1', outboxes: '1' });
    await expect(notificationWorker.processOne()).resolves.toBe('DELIVERED');
    expect(
      adapters.notificationPort
        .acceptedDeliveries()
        .filter(({ payload }) => payload.email === 'Concurrent-Invitee@Example.Invalid'),
    ).toHaveLength(1);

    const expiredReuseKey = 'c2a-invitation-expired-reuse-01';
    const expiredGenerationOneBody = {
      email: 'Expired-Generation-One@Example.Invalid',
      operatorReason: 'seed expired idempotency generation',
      reasonCode: 'INVITATION_ADMINISTRATION',
      role: 'SUPPORT',
    } as const;
    const expiredGenerationOne = await request(server)
      .post('/api/v1/admin/invitations')
      .set('Authorization', bearer(creator, 'INVITATION'))
      .set('Idempotency-Key', expiredReuseKey)
      .set('Origin', origin)
      .send(expiredGenerationOneBody)
      .expect(201);
    await owner.query('BEGIN');
    try {
      await owner.query('SET LOCAL session_replication_role = replica');
      const expired = await owner.query(
        `WITH database_clock AS MATERIALIZED (
           SELECT (
             pg_catalog.clock_timestamp() AT TIME ZONE 'UTC'
           )::timestamp(3) AS database_now
         )
         UPDATE "AdminC2IdempotencyRecord"
         SET "createdAt" = database_clock.database_now - INTERVAL '25 hours',
             "expiresAt" = database_clock.database_now - INTERVAL '1 hour'
         FROM database_clock
         WHERE "adminUserId" = $1
           AND "operation" = 'CREATE_ADMIN_INVITATION'
           AND "idempotencyKey" = $2
           AND "generation" = 1`,
        [creator.id, expiredReuseKey],
      );
      expect(expired.rowCount).toBe(1);
      await owner.query('SET LOCAL session_replication_role = origin');
      await owner.query('COMMIT');
    } catch (error) {
      await owner.query('ROLLBACK');
      throw error;
    }
    const expiredGenerationTwoBody = {
      email: 'Expired-Generation-Two@Example.Invalid',
      operatorReason: 'reuse expired idempotency generation',
      reasonCode: 'INVITATION_ADMINISTRATION',
      role: 'CONTENT_EDITOR',
    } as const;
    const replacementResponses = await Promise.all(
      [0, 1].map(() =>
        request(server)
          .post('/api/v1/admin/invitations')
          .set('Authorization', bearer(creator, 'INVITATION'))
          .set('Idempotency-Key', expiredReuseKey)
          .set('Origin', origin)
          .send(expiredGenerationTwoBody)
          .expect(201),
      ),
    );
    expect(replacementResponses[0]?.body.data.invitationId).toBe(
      replacementResponses[1]?.body.data.invitationId,
    );
    expect(replacementResponses[0]?.body.data.invitationId).not.toBe(
      expiredGenerationOne.body.data.invitationId,
    );
    await request(server)
      .post('/api/v1/admin/invitations')
      .set('Authorization', bearer(creator, 'INVITATION'))
      .set('Idempotency-Key', expiredReuseKey)
      .set('Origin', origin)
      .send({
        ...expiredGenerationTwoBody,
        email: 'Expired-Generation-Conflict@Example.Invalid',
      })
      .expect(409);
    const expiredReuseState = await owner.query<{
      generation: string;
      resourceId: string;
    }>(
      `SELECT "generation"::text AS generation, "resourceId" AS "resourceId"
       FROM "AdminC2IdempotencyRecord"
       WHERE "adminUserId" = $1
         AND "operation" = 'CREATE_ADMIN_INVITATION'
         AND "idempotencyKey" = $2
       ORDER BY "generation"`,
      [creator.id, expiredReuseKey],
    );
    expect(expiredReuseState.rows).toEqual([
      {
        generation: '1',
        resourceId: expiredGenerationOne.body.data.invitationId,
      },
      {
        generation: '2',
        resourceId: replacementResponses[0]?.body.data.invitationId,
      },
    ]);
    const idempotencyGuardState = await owner.query<{ enabled: string }>(
      `SELECT tgenabled AS enabled
       FROM pg_catalog.pg_trigger
       WHERE tgrelid = 'public."AdminC2IdempotencyRecord"'::regclass
         AND tgname IN (
           'AdminC2IdempotencyRecord_insert_guard',
           'AdminC2IdempotencyRecord_append_only'
         )
       ORDER BY tgname`,
    );
    expect(idempotencyGuardState.rows).toEqual([{ enabled: 'O' }, { enabled: 'O' }]);
    await expect(notificationWorker.processOne()).resolves.toBe('DELIVERED');
    await expect(notificationWorker.processOne()).resolves.toBe('DELIVERED');

    const createRecovery = (subjectAdminUserId: string, idempotencyKey: string): Test =>
      request(server)
        .post('/api/v1/admin/recovery-cases')
        .set('Authorization', bearer(recoveryOperator, 'GENERAL'))
        .set('Idempotency-Key', idempotencyKey)
        .set('Origin', origin)
        .send({
          operatorReason: 'approved local recovery',
          reasonCode: 'ACCOUNT_RECOVERY',
          subjectAdminUserId,
        });
    const recovery = await createRecovery(
      recoverySubject.id,
      'c2a-recovery-idempotency-0001',
    ).expect(201);
    recoveryCaseId = recovery.body.data.caseId as string;
    const recoveryReplay = await createRecovery(
      recoverySubject.id,
      'c2a-recovery-idempotency-0001',
    ).expect(201);
    expect(recoveryReplay.body.data.caseId).toBe(recoveryCaseId);
    await createRecovery(expirySubject.id, 'c2a-recovery-idempotency-0002').expect(201);

    const firstRecoveryPage = await request(server)
      .get('/api/v1/admin/recovery-cases?limit=1')
      .set('Authorization', bearer(recoveryOperator, 'GENERAL'))
      .expect(200);
    expect(firstRecoveryPage.body.data).toHaveLength(1);
    expect(firstRecoveryPage.body.meta.hasMore).toBe(true);
    const recoveryCursor = firstRecoveryPage.body.meta.nextCursor as string;
    const secondRecoveryPage = await request(server)
      .get(`/api/v1/admin/recovery-cases?limit=1&cursor=${encodeURIComponent(recoveryCursor)}`)
      .set('Authorization', bearer(recoveryOperator, 'GENERAL'))
      .expect(200);
    expect(secondRecoveryPage.body.data).toHaveLength(1);
    await request(server)
      .get(`/api/v1/admin/recovery-cases/${recoveryCaseId}`)
      .set('Authorization', bearer(recoveryOperator, 'GENERAL'))
      .expect(200)
      .expect((response) => {
        expect(response.body.data.caseId).toBe(recoveryCaseId);
      });

    const approvalBody = {
      operatorReason: 'independent recovery approval',
      reasonCode: 'ACCOUNT_RECOVERY',
    };
    const approve = (): Test =>
      request(server)
        .post(`/api/v1/admin/recovery-cases/${recoveryCaseId}/approve`)
        .set('Authorization', bearer(approver, 'RECOVERY_APPROVAL'))
        .set('Idempotency-Key', 'c2a-approval-idempotency-01')
        .set('Origin', origin)
        .send(approvalBody);
    await approve().expect(204);
    await approve().expect(204);

    const roleBody = {
      operatorReason: 'approved role adjustment',
      reasonCode: 'ROLE_ADMINISTRATION',
      role: 'CONTENT_EDITOR',
    };
    const changeRole = (): Test =>
      request(server)
        .post(`/api/v1/admin/users/${accessTarget.id}/role-changes`)
        .set('Authorization', bearer(creator, 'ROLE_CHANGE'))
        .set('Idempotency-Key', 'c2a-role-idempotency-000001')
        .set('Origin', origin)
        .send(roleBody);
    await changeRole().expect(204);
    await changeRole().expect(204);

    const statusBody = {
      operatorReason: 'approved status adjustment',
      reasonCode: 'STATUS_ADMINISTRATION',
      status: 'SUSPENDED',
    };
    const changeStatus = (): Test =>
      request(server)
        .post(`/api/v1/admin/users/${accessTarget.id}/status-changes`)
        .set('Authorization', bearer(creator, 'STATUS_CHANGE'))
        .set('Idempotency-Key', 'c2a-status-idempotency-0001')
        .set('Origin', origin)
        .send(statusBody);
    await changeStatus().expect(204);
    await changeStatus().expect(204);

    const firstUserPage = await request(server)
      .get('/api/v1/admin/users?limit=1')
      .set('Authorization', bearer(approver, 'GENERAL'))
      .expect(200);
    expect(firstUserPage.body.data).toHaveLength(1);
    expect(firstUserPage.body.meta.hasMore).toBe(true);
    const userCursor = firstUserPage.body.meta.nextCursor as string;
    await request(server)
      .get(`/api/v1/admin/users?limit=1&cursor=${encodeURIComponent(userCursor)}`)
      .set('Authorization', bearer(approver, 'GENERAL'))
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toHaveLength(1);
      });

    const auditActions = await owner.query<{ action: string }>(
      `SELECT DISTINCT "action"::text AS action
         FROM "AuditLog"
        WHERE "action" IN (
          'resetAdminPassword', 'createAdminRecoveryCase', 'approveAdminRecoveryCase',
          'createAdminInvitation', 'changeAdminUserRole', 'changeAdminUserStatus',
          'deliverAdminPasswordResetNotification', 'deliverAdminInvitationNotification'
        )
        ORDER BY action`,
    );
    expect(auditActions.rows.map(({ action }) => action)).toEqual([
      'approveAdminRecoveryCase',
      'changeAdminUserRole',
      'changeAdminUserStatus',
      'createAdminInvitation',
      'createAdminRecoveryCase',
      'deliverAdminInvitationNotification',
      'deliverAdminPasswordResetNotification',
      'resetAdminPassword',
    ]);
    const securityActions = await owner.query<{ action: string }>(
      `SELECT DISTINCT "action"::text AS action
         FROM "AdminSecurityEvent"
        WHERE "action" IN ('requestAdminPasswordReset', 'acceptAdminInvitation')
        ORDER BY action`,
    );
    expect(securityActions.rows.map(({ action }) => action)).toEqual([
      'acceptAdminInvitation',
      'requestAdminPasswordReset',
    ]);
  });

  it('terminalizes consumed reset parents atomically and preserves delivery history', async () => {
    interface ResetProofRow {
      readonly activeSessions: string;
      readonly adminUserId: string;
      readonly authorizationVersion: number;
      readonly consumedAt: Date | null;
      readonly contextId: string;
      readonly generation: number;
      readonly outboxId: string;
      readonly outboxJson: string;
      readonly outboxState: string;
      readonly passwordHash: string;
      readonly replacedOutboxId: string | null;
      readonly replacedRequestId: string | null;
      readonly requestId: string;
      readonly requestRevokedAt: Date | null;
      readonly resetAudits: string;
    }

    const server = application.getHttpServer();
    const repository = application.get(AdminSecurityRepository);
    const originalTransaction = repository.transaction.bind(repository);
    const outboxFingerprint = (row: ResetProofRow): string =>
      createHash('sha256').update(row.outboxJson, 'utf8').digest('hex');
    const resetFingerprint = (row: ResetProofRow): string =>
      createHash('sha256')
        .update(
          JSON.stringify({
            activeSessions: row.activeSessions,
            authorizationVersion: row.authorizationVersion,
            consumedAt: row.consumedAt?.toISOString() ?? null,
            outboxFingerprint: outboxFingerprint(row),
            passwordHash: row.passwordHash,
            requestRevokedAt: row.requestRevokedAt?.toISOString() ?? null,
            resetAudits: row.resetAudits,
          }),
          'utf8',
        )
        .digest('hex');
    const readResetProof = async (outboxId: string): Promise<ResetProofRow> => {
      const result = await owner.query<ResetProofRow>(
        `SELECT u."id" AS "adminUserId", u."passwordHash",
                u."authorizationVersion" AS "authorizationVersion",
                context."id" AS "contextId", context."consumedAt",
                request."id" AS "requestId", request."revokedAt" AS "requestRevokedAt",
                request."replacedRequestId", outbox."id" AS "outboxId",
                outbox."state"::text AS "outboxState", outbox."generation",
                outbox."replacedOutboxId", to_jsonb(outbox)::text AS "outboxJson",
                (SELECT count(*)::text FROM "AdminSession" AS session
                  WHERE session."adminUserId" = u."id" AND session."revokedAt" IS NULL)
                  AS "activeSessions",
                (SELECT count(*)::text FROM "AuditLog" AS audit
                  WHERE audit."adminPasswordResetContextId" = context."id"
                    AND audit."action" = 'resetAdminPassword'
                    AND audit."outcome" = 'SUCCESS') AS "resetAudits"
           FROM "AdminNotificationOutbox" AS outbox
           JOIN "AdminPasswordResetRequest" AS request
             ON request."id" = outbox."passwordResetRequestId"
           JOIN "AdminPasswordResetContext" AS context
             ON context."passwordResetRequestId" = request."id"
            AND context."adminUserId" = request."adminUserId"
           JOIN "AdminUser" AS u ON u."id" = request."adminUserId"
          WHERE outbox."id" = $1`,
        [outboxId],
      );
      const row = result.rows[0];
      if (row === undefined) throw new Error('Password reset proof row is absent.');
      return row;
    };
    const latestReset = async (
      email: string,
      excludedRequestId?: string,
    ): Promise<{
      readonly outboxId: string;
      readonly replacedOutboxId: string | null;
      readonly replacedRequestId: string | null;
      readonly requestId: string;
    }> => {
      const result = await owner.query<{
        outboxId: string;
        replacedOutboxId: string | null;
        replacedRequestId: string | null;
        requestId: string;
      }>(
        `SELECT request."id" AS "requestId", request."replacedRequestId",
                outbox."id" AS "outboxId", outbox."replacedOutboxId"
           FROM "AdminPasswordResetRequest" AS request
           JOIN "AdminUser" AS u ON u."id" = request."adminUserId"
           JOIN "AdminNotificationOutbox" AS outbox
             ON outbox."passwordResetRequestId" = request."id"
          WHERE u."email" = $1 AND ($2::text IS NULL OR request."id" <> $2::text)
          ORDER BY request."createdAt" DESC, request."id" DESC
          LIMIT 1`,
        [email, excludedRequestId ?? null],
      );
      const row = result.rows[0];
      if (row === undefined) throw new Error('Latest password reset proof row is absent.');
      return row;
    };
    const requestReset = async (email: string, requestId: string): Promise<void> => {
      await clearRecoveryRateLimitFixture();
      await request(server)
        .post('/api/v1/admin/auth/password/reset-requests')
        .set('Origin', origin)
        .set('Sec-Fetch-Site', 'same-origin')
        .set('X-Request-Id', requestId)
        .send({ email })
        .expect(202);
    };

    const email = 'reset-terminalization@example.invalid';
    await seedAdmin(email, 'SUPPORT', ['GENERAL']);
    await requestReset(email, 'c2a-reset-terminalize-request-1');
    await expect(notificationWorker.processOne()).resolves.toBe('DELIVERED');
    const firstDelivery = adapters.notificationPort
      .acceptedDeliveries()
      .find(({ payload }) => payload.email === email);
    expect(firstDelivery?.simulatedEvent).toBe('PROVIDER_ACCEPTED_FOR_TEST');
    const firstCode = firstDelivery?.payload.code;
    expect(typeof firstCode).toBe('string');
    const firstBefore = await readResetProof(firstDelivery!.logicalDeliveryId);
    expect(firstBefore).toMatchObject({
      activeSessions: '1',
      consumedAt: null,
      outboxState: 'DELIVERED',
      replacedOutboxId: null,
      replacedRequestId: null,
      requestRevokedAt: null,
      resetAudits: '0',
    });
    expect(firstBefore.generation).toBeGreaterThanOrEqual(1);

    await clearRecoveryRateLimitFixture();
    await request(server)
      .post('/api/v1/admin/auth/password/reset')
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('X-Request-Id', 'c2a-reset-terminalize-consume-1')
      .send({ newPassword: 'C2aTerminalizedReset!2026-A', resetCode: firstCode })
      .expect(204);
    const firstAfter = await readResetProof(firstDelivery!.logicalDeliveryId);
    expect(firstAfter.consumedAt?.toISOString()).toBe(firstAfter.requestRevokedAt?.toISOString());
    expect(firstAfter).toMatchObject({
      activeSessions: '0',
      authorizationVersion: firstBefore.authorizationVersion + 1,
      generation: firstBefore.generation,
      outboxState: 'DELIVERED',
      resetAudits: '1',
    });
    expect(outboxFingerprint(firstAfter)).toBe(outboxFingerprint(firstBefore));

    await requestReset(email, 'c2a-reset-terminalize-request-2');
    const second = await latestReset(email, firstAfter.requestId);
    expect(second).toMatchObject({ replacedOutboxId: null, replacedRequestId: null });
    expect(second.requestId).not.toBe(firstAfter.requestId);
    expect(second.outboxId).not.toBe(firstAfter.outboxId);
    await expect(notificationWorker.processOne()).resolves.toBe('DELIVERED');
    const secondDelivery = adapters.notificationPort
      .acceptedDeliveries()
      .find(({ logicalDeliveryId }) => logicalDeliveryId === second.outboxId);
    const secondCode = secondDelivery?.payload.code;
    expect(typeof secondCode).toBe('string');

    await clearRecoveryRateLimitFixture();
    const concurrentConsumption = await Promise.all(
      ['a', 'b'].map((suffix) =>
        request(server)
          .post('/api/v1/admin/auth/password/reset')
          .set('Origin', origin)
          .set('Sec-Fetch-Site', 'same-origin')
          .set('X-Request-Id', `c2a-reset-terminalize-concurrent-${suffix}`)
          .send({
            newPassword: `C2aTerminalizedReset!2026-${suffix.toUpperCase()}`,
            resetCode: secondCode,
          }),
      ),
    );
    expect(concurrentConsumption.map(({ status }) => status).sort()).toEqual([204, 400]);
    const secondAfter = await readResetProof(second.outboxId);
    expect(secondAfter.consumedAt?.toISOString()).toBe(secondAfter.requestRevokedAt?.toISOString());
    expect(secondAfter).toMatchObject({ outboxState: 'DELIVERED', resetAudits: '1' });
    expect(outboxFingerprint(await readResetProof(firstAfter.outboxId))).toBe(
      outboxFingerprint(firstBefore),
    );

    await clearRecoveryRateLimitFixture();
    await request(server)
      .post('/api/v1/admin/auth/password/reset')
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('X-Request-Id', 'c2a-reset-terminalize-old-code-replay')
      .send({ newPassword: 'C2aTerminalizedReplay!2026', resetCode: firstCode })
      .expect(400);
    expect(outboxFingerprint(await readResetProof(firstAfter.outboxId))).toBe(
      outboxFingerprint(firstBefore),
    );

    const rollbackEmail = 'reset-rollback@example.invalid';
    await seedAdmin(rollbackEmail, 'SUPPORT', ['GENERAL']);
    await requestReset(rollbackEmail, 'c2a-reset-rollback-request');
    await expect(notificationWorker.processOne()).resolves.toBe('DELIVERED');
    const rollbackDelivery = adapters.notificationPort
      .acceptedDeliveries()
      .find(({ payload }) => payload.email === rollbackEmail);
    const rollbackCode = rollbackDelivery?.payload.code;
    expect(typeof rollbackCode).toBe('string');
    const rollbackBefore = await readResetProof(rollbackDelivery!.logicalDeliveryId);
    const transactionSpy = vi.spyOn(repository, 'transaction').mockImplementation((async <T>(
      callback: (transaction: AdminSecurityTransactionRepository) => Promise<T>,
    ): Promise<T> =>
      originalTransaction((transaction) => {
        const injected = new Proxy(transaction, {
          get(target, property) {
            if (property === 'insertAudit') {
              return async (): Promise<never> => {
                throw new Error('controlled password reset audit failure');
              };
            }
            const value = Reflect.get(target, property, target) as unknown;
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
        return callback(injected);
      })) as typeof repository.transaction);
    try {
      await clearRecoveryRateLimitFixture();
      await request(server)
        .post('/api/v1/admin/auth/password/reset')
        .set('Origin', origin)
        .set('Sec-Fetch-Site', 'same-origin')
        .set('X-Request-Id', 'c2a-reset-rollback-consume')
        .send({ newPassword: 'C2aRollbackReset!2026', resetCode: rollbackCode })
        .expect(503);
    } finally {
      transactionSpy.mockRestore();
    }
    const rollbackAfter = await readResetProof(rollbackDelivery!.logicalDeliveryId);
    expect(resetFingerprint(rollbackAfter)).toBe(resetFingerprint(rollbackBefore));

    const pendingEmail = 'reset-active-replacement@example.invalid';
    await seedAdmin(pendingEmail, 'SUPPORT');
    await requestReset(pendingEmail, 'c2a-reset-active-request-1');
    const pendingFirst = await latestReset(pendingEmail);
    const pendingBefore = await readResetProof(pendingFirst.outboxId);
    expect(pendingBefore).toMatchObject({
      consumedAt: null,
      outboxState: 'PENDING',
      replacedOutboxId: null,
      replacedRequestId: null,
      requestRevokedAt: null,
      resetAudits: '0',
    });
    await requestReset(pendingEmail, 'c2a-reset-active-request-2');
    const pendingSecond = await latestReset(pendingEmail, pendingFirst.requestId);
    const replaced = await readResetProof(pendingFirst.outboxId);
    const replacement = await readResetProof(pendingSecond.outboxId);
    expect(replaced).toMatchObject({
      generation: pendingBefore.generation + 1,
      outboxState: 'CANCELLED',
    });
    expect(replaced.requestRevokedAt).not.toBeNull();
    expect(replacement).toMatchObject({
      outboxState: 'PENDING',
      replacedOutboxId: pendingFirst.outboxId,
      replacedRequestId: pendingFirst.requestId,
      requestRevokedAt: null,
    });
    await expect(notificationWorker.processOne()).resolves.toBe('DELIVERED');
  });

  it('expires a due recovery case under the dedicated singleton identity', async () => {
    const now = new Date();
    expiredRecoveryCaseId = randomUUID();
    await owner.query(
      `INSERT INTO "AdminRecoveryCase"
         ("id", "subjectAdminUserId", "creatorAdminUserId", "state",
          "stateGeneration", "expiresAt", "createdAt")
       VALUES ($1, $2, $3, 'PENDING', 1, $4, $5)`,
      [
        expiredRecoveryCaseId,
        expirationDueSubject.id,
        recoveryOperator.id,
        new Date(now.getTime() - 1_000),
        new Date(now.getTime() - 24 * 60 * 60 * 1_000),
      ],
    );

    await expect(expirationWorker.scanOnce(now)).resolves.toMatchObject({
      expired: 1,
      performed: true,
    });
    const state = await owner.query<{ state: string }>(
      `SELECT "state"::text AS state FROM "AdminRecoveryCase" WHERE "id" = $1`,
      [expiredRecoveryCaseId],
    );
    expect(state.rows[0]?.state).toBe('EXPIRED');
  });

  it('observes real BullMQ consumption and PostgreSQL recovery after a lost wake-up', async () => {
    await clearRecoveryRateLimitFixture();
    const notificationEntry = resolve(
      process.cwd(),
      'dist',
      'src',
      'admin-security',
      'admin-notification.main.js',
    );
    const firstSubject = await seedAdmin('runner-first@example.invalid', 'CONTENT_EDITOR');
    void firstSubject;
    const firstRunner = startRunningProcessProof(
      'admin:notification-worker:bullmq',
      notificationEntry,
      processEnvironment('NOTIFICATION'),
    );
    try {
      await firstRunner.waitFor('C2A_NOTIFICATION_PROCESS_PROOF_READY');
      const firstDeliveryEmail = 'Runner-First@Example.Invalid';
      const firstRequestId = 'c2a-runner-bullmq-delivery';
      await request(application.getHttpServer())
        .post('/api/v1/admin/auth/password/reset-requests')
        .set('Origin', origin)
        .set('Sec-Fetch-Site', 'same-origin')
        .set('X-Request-Id', firstRequestId)
        .send({ email: firstDeliveryEmail })
        .expect(202);
      const firstDestinationHash = createHash('sha256')
        .update(firstDeliveryEmail, 'utf8')
        .digest('hex');
      await firstRunner.waitFor(`destinationSha256=${firstDestinationHash}`);
      const firstOutcome = await firstRunner.stop();
      expect(firstOutcome.code).toBe(0);
      expect(firstOutcome.signal).toBeNull();
      expect(firstOutcome.stderr).toBe('');
      const firstRunnerOutcome = /C2A_NOTIFICATION_PROCESS_PROOF_OUTCOME (\{[^\r\n]+\})/u.exec(
        firstOutcome.stdout,
      )?.[1];
      expect(firstRunnerOutcome).toBeDefined();
      expect(JSON.parse(firstRunnerOutcome!).processedWakeups).toBeGreaterThan(0);
    } finally {
      await firstRunner.stop().catch(() => undefined);
    }

    const secondSubject = await seedAdmin('runner-second@example.invalid', 'CONTENT_EDITOR');
    void secondSubject;
    const secondDeliveryEmail = 'Runner-Second@Example.Invalid';
    const secondRequestId = 'c2a-runner-lost-wakeup-delivery';
    await request(application.getHttpServer())
      .post('/api/v1/admin/auth/password/reset-requests')
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('X-Request-Id', secondRequestId)
      .send({ email: secondDeliveryEmail })
      .expect(202);
    const secondOutboxId = await eventually(async () => {
      const result = await owner.query<{ id: string }>(
        `SELECT outbox."id"
           FROM "AdminSecurityEvent" AS event
           JOIN "AdminNotificationOutbox" AS outbox
             ON outbox."sourceSecurityEventId" = event."id"
          WHERE event."requestId" = $1`,
        [secondRequestId],
      );
      return result.rows[0]?.id;
    }, 'the lost-wakeup outbox');
    const queue = new Queue(ADMIN_NOTIFICATION_WAKEUP_QUEUE, {
      connection: {
        host: '127.0.0.1',
        maxRetriesPerRequest: null,
        password: requiredEnvironment('S1203C2A_BUSINESS_REDIS_PASSWORD'),
        port: Number(requiredEnvironment('S1203C2A_BUSINESS_REDIS_PORT')),
      },
    });
    try {
      const jobId = createHash('sha256')
        .update(`KORA_ADMIN_NOTIFICATION_WAKEUP_V1\0${secondOutboxId}`, 'utf8')
        .digest('hex');
      const job = await eventually(
        async () => (await queue.getJob(jobId)) ?? undefined,
        'the real opaque BullMQ wake-up',
      );
      expect(job.name).toBe('wake');
      expect(job.data).toEqual({ opaqueSignalId: secondOutboxId });
      await job.remove();
      expect(await queue.getJob(jobId)).toBeUndefined();
    } finally {
      await queue.close();
    }

    const recoveryRunner = startRunningProcessProof(
      'admin:notification-worker:lost-wakeup-recovery',
      notificationEntry,
      processEnvironment('NOTIFICATION'),
    );
    try {
      await recoveryRunner.waitFor('C2A_NOTIFICATION_PROCESS_PROOF_READY');
      const secondDestinationHash = createHash('sha256')
        .update(secondDeliveryEmail, 'utf8')
        .digest('hex');
      await recoveryRunner.waitFor(`destinationSha256=${secondDestinationHash}`);
      const recoveryOutcome = await recoveryRunner.stop();
      expect(recoveryOutcome.code).toBe(0);
      expect(recoveryOutcome.signal).toBeNull();
      expect(recoveryOutcome.stderr).toBe('');
    } finally {
      await recoveryRunner.stop().catch(() => undefined);
    }
    const recovered = await owner.query<{ state: string }>(
      `SELECT "state"::text AS state FROM "AdminNotificationOutbox" WHERE "id" = $1`,
      [secondOutboxId],
    );
    expect(recovered.rows[0]?.state).toBe('DELIVERED');

    const signalRunner = startRunningProcessProof(
      'admin:notification-worker:os-signal',
      notificationEntry,
      processEnvironment('NOTIFICATION'),
    );
    try {
      await signalRunner.waitFor('C2A_NOTIFICATION_PROCESS_PROOF_READY');
      const signalOutcome = await signalRunner.terminateBySignal('SIGTERM');
      expect(signalOutcome.stdinOpenAtSignal).toBe(true);
      if (process.platform === 'win32') {
        expect(signalOutcome).toMatchObject({ code: null, signal: 'SIGTERM', stderr: '' });
        expect(signalOutcome.stdout).not.toContain('C2A_NOTIFICATION_PROCESS_PROOF_OUTCOME');
        process.stdout.write(
          'C2A_OS_SIGNAL_PLATFORM_LIMITATION process=notification platform=win32 ' +
            'delivery=terminate_process graceful_handler=not_observed\n',
        );
      } else {
        expect(signalOutcome).toMatchObject({ code: 0, signal: null, stderr: '' });
        const gracefulOutcome = /C2A_NOTIFICATION_PROCESS_PROOF_OUTCOME (\{[^\r\n]+\})/u.exec(
          signalOutcome.stdout,
        )?.[1];
        expect(gracefulOutcome).toBeDefined();
        expect(JSON.parse(gracefulOutcome!)).toMatchObject({ failed: false, forceExit: false });
      }
    } finally {
      await signalRunner.stop().catch(() => undefined);
    }
  });

  it('runs the compiled expiration process and quiesces after the proof stop signal', async () => {
    const now = new Date();
    const caseId = randomUUID();
    const processExpirySubject = await seedAdmin(
      'process-expiry@example.invalid',
      'CONTENT_EDITOR',
    );
    await owner.query(
      `INSERT INTO "AdminRecoveryCase"
         ("id", "subjectAdminUserId", "creatorAdminUserId", "state",
          "stateGeneration", "expiresAt", "createdAt")
       VALUES ($1, $2, $3, 'PENDING', 1, $4, $5)`,
      [
        caseId,
        processExpirySubject.id,
        recoveryOperator.id,
        new Date(now.getTime() - 1_000),
        new Date(now.getTime() - 60_000),
      ],
    );
    const expirationEntry = resolve(
      process.cwd(),
      'dist',
      'src',
      'admin-security',
      'admin-recovery-expiration.main.js',
    );
    const runner = startRunningProcessProof(
      'admin:recovery-expiration-worker',
      expirationEntry,
      processEnvironment('EXPIRATION'),
    );
    try {
      await runner.waitFor('C2A_EXPIRATION_PROCESS_PROOF_READY');
      await eventually(async () => {
        const state = await owner.query<{ state: string }>(
          `SELECT "state"::text AS state FROM "AdminRecoveryCase" WHERE "id" = $1`,
          [caseId],
        );
        return state.rows[0]?.state === 'EXPIRED' ? state.rows[0].state : undefined;
      }, 'the expiration process transition');
      const outcome = await runner.stop();
      expect(outcome).toMatchObject({ code: 0, signal: null, stderr: '' });
      expect(outcome.stdout).toContain(
        'C2A_EXPIRATION_PROCESS_PROOF_OUTCOME {"failed":false,"forceExit":false}',
      );
    } finally {
      await runner.stop().catch(() => undefined);
    }

    const signalRunner = startRunningProcessProof(
      'admin:recovery-expiration-worker:os-signal',
      expirationEntry,
      processEnvironment('EXPIRATION'),
    );
    try {
      await signalRunner.waitFor('C2A_EXPIRATION_PROCESS_PROOF_READY');
      const signalOutcome = await signalRunner.terminateBySignal('SIGTERM');
      expect(signalOutcome.stdinOpenAtSignal).toBe(true);
      if (process.platform === 'win32') {
        expect(signalOutcome).toMatchObject({ code: null, signal: 'SIGTERM', stderr: '' });
        expect(signalOutcome.stdout).not.toContain('C2A_EXPIRATION_PROCESS_PROOF_OUTCOME');
        process.stdout.write(
          'C2A_OS_SIGNAL_PLATFORM_LIMITATION process=expiration platform=win32 ' +
            'delivery=terminate_process graceful_handler=not_observed\n',
        );
      } else {
        expect(signalOutcome).toMatchObject({ code: 0, signal: null, stderr: '' });
        expect(signalOutcome.stdout).toContain(
          'C2A_EXPIRATION_PROCESS_PROOF_OUTCOME {"failed":false,"forceExit":false}',
        );
      }
    } finally {
      await signalRunner.stop().catch(() => undefined);
    }
  });

  it('normalizes exactly the eight C2a POST bodies and leaves all C2b routes absent', async () => {
    const server = application.getHttpServer();
    const malformedPaths = [
      '/api/v1/admin/auth/password/reset-requests',
      '/api/v1/admin/auth/password/reset',
      '/api/v1/admin/invitations',
      '/api/v1/admin/auth/invitations/accept',
      '/api/v1/admin/recovery-cases',
      `/api/v1/admin/recovery-cases/${recoveryCaseId}/approve`,
      `/api/v1/admin/users/${accessTarget.id}/role-changes`,
      `/api/v1/admin/users/${accessTarget.id}/status-changes`,
    ] as const;
    const requestIds: string[] = [];
    for (const [index, path] of malformedPaths.entries()) {
      const requestId = `c2a-malformed-${index}`;
      requestIds.push(requestId);
      const response = await request(server)
        .post(path)
        .set('Content-Type', 'application/json')
        .set('Origin', origin)
        .set('X-Request-Id', requestId)
        .send('{"broken":')
        .expect(400);
      expect(response.body).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          details: {},
          message: 'Requête invalide.',
          retryable: false,
        },
        requestId,
      });
    }
    const sinkCount = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AdminSecurityEvent"
        WHERE "requestId" = ANY($1::text[])`,
      [requestIds],
    );
    expect(sinkCount.rows[0]?.count).toBe('8');

    await request(server).get('/api/v1/admin/audit-logs').expect(404);
    await request(server)
      .post('/api/v1/admin/audit-log-exports')
      .set('Content-Type', 'application/json')
      .send('{}')
      .expect(404);
    await request(server)
      .get('/api/v1/admin/audit-log-exports/11111111-1111-4111-8111-111111111111')
      .expect(404);
    await request(server)
      .get('/api/v1/admin/audit-log-exports/11111111-1111-4111-8111-111111111111/content')
      .expect(404);
  });

  it('fails closed before producer mutation when the test notification capability is absent', async () => {
    await clearRecoveryRateLimitFixture();
    const before = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AdminNotificationOutbox"`,
    );
    adapters.notificationPort.setAvailable(false);
    try {
      await request(application.getHttpServer())
        .post('/api/v1/admin/auth/password/reset-requests')
        .set('Origin', origin)
        .set('Sec-Fetch-Site', 'same-origin')
        .set('X-Request-Id', 'c2a-notification-unavailable')
        .send({ email: 'reset@example.invalid' })
        .expect(503);
    } finally {
      adapters.notificationPort.setAvailable(true);
    }
    const after = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AdminNotificationOutbox"`,
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
    const sink = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AdminSecurityEvent"
        WHERE "requestId" = 'c2a-notification-unavailable'
          AND "outcome" = 'FAILED'`,
    );
    expect(sink.rows[0]?.count).toBe('1');
  });

  it('commits one rejected AuditLog before each post-proof HTTP error', async () => {
    const server = application.getHttpServer();
    const roleRequestId = 'c2a-durable-role-rejection';
    const stepUpRequestId = 'c2a-durable-step-up-rejection';
    const idempotencyRequestId = 'c2a-durable-idempotency-rejection';
    const missingRequestId = 'c2a-durable-missing-rejection';
    const expiredRequestId = 'c2a-durable-expired-rejection';
    const rejectionRequestIds = [
      roleRequestId,
      stepUpRequestId,
      idempotencyRequestId,
      missingRequestId,
      expiredRequestId,
    ];
    const invitationBefore = await owner.query<{ invitations: string; outboxes: string }>(
      `SELECT
         (SELECT count(*)::text FROM "AdminInvitation") AS invitations,
         (SELECT count(*)::text FROM "AdminNotificationOutbox") AS outboxes`,
    );
    const invitationBody = {
      email: 'durable-rejection@example.invalid',
      operatorReason: 'durable rejection proof',
      reasonCode: 'INVITATION_ADMINISTRATION',
      role: 'FINANCE_MANAGER',
    };

    await request(server)
      .post('/api/v1/admin/invitations')
      .set('Authorization', bearer(recoveryOperator, 'GENERAL'))
      .set('Idempotency-Key', 'c2a-durable-role-key-0001')
      .set('Origin', origin)
      .set('X-Request-Id', roleRequestId)
      .send(invitationBody)
      .expect(403);
    await request(server)
      .post('/api/v1/admin/invitations')
      .set('Authorization', bearer(approver, 'GENERAL'))
      .set('Idempotency-Key', 'c2a-durable-step-up-key-01')
      .set('Origin', origin)
      .set('X-Request-Id', stepUpRequestId)
      .send(invitationBody)
      .expect(403);

    const invitationAfter = await owner.query<{ invitations: string; outboxes: string }>(
      `SELECT
         (SELECT count(*)::text FROM "AdminInvitation") AS invitations,
         (SELECT count(*)::text FROM "AdminNotificationOutbox") AS outboxes`,
    );
    expect(invitationAfter.rows[0]).toEqual(invitationBefore.rows[0]);

    const conflictSubjectA = await seedAdmin(
      'durable-conflict-a@example.invalid',
      'CONTENT_EDITOR',
    );
    const conflictSubjectB = await seedAdmin(
      'durable-conflict-b@example.invalid',
      'CONTENT_EDITOR',
    );
    const conflictKey = 'c2a-durable-idempotency-key-01';
    await request(server)
      .post('/api/v1/admin/recovery-cases')
      .set('Authorization', bearer(recoveryOperator, 'GENERAL'))
      .set('Idempotency-Key', conflictKey)
      .set('Origin', origin)
      .set('X-Request-Id', 'c2a-durable-idempotency-seed')
      .send({
        operatorReason: 'durable idempotency seed',
        reasonCode: 'ACCOUNT_RECOVERY',
        subjectAdminUserId: conflictSubjectA.id,
      })
      .expect(201);
    const recoveryCountBeforeConflict = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AdminRecoveryCase"`,
    );
    await request(server)
      .post('/api/v1/admin/recovery-cases')
      .set('Authorization', bearer(recoveryOperator, 'GENERAL'))
      .set('Idempotency-Key', conflictKey)
      .set('Origin', origin)
      .set('X-Request-Id', idempotencyRequestId)
      .send({
        operatorReason: 'durable idempotency conflict',
        reasonCode: 'ACCOUNT_RECOVERY',
        subjectAdminUserId: conflictSubjectB.id,
      })
      .expect(409);
    const recoveryCountAfterConflict = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AdminRecoveryCase"`,
    );
    expect(recoveryCountAfterConflict.rows[0]).toEqual(recoveryCountBeforeConflict.rows[0]);

    const missingCaseId = randomUUID();
    const approvalBody = {
      operatorReason: 'durable recovery rejection proof',
      reasonCode: 'ACCOUNT_RECOVERY',
    };
    await request(server)
      .post(`/api/v1/admin/recovery-cases/${missingCaseId}/approve`)
      .set('Authorization', bearer(approver, 'RECOVERY_APPROVAL'))
      .set('Idempotency-Key', 'c2a-durable-missing-key-0001')
      .set('Origin', origin)
      .set('X-Request-Id', missingRequestId)
      .send(approvalBody)
      .expect(404);
    await request(server)
      .post(`/api/v1/admin/recovery-cases/${expiredRecoveryCaseId}/approve`)
      .set('Authorization', bearer(approver, 'RECOVERY_APPROVAL'))
      .set('Idempotency-Key', 'c2a-durable-expired-key-001')
      .set('Origin', origin)
      .set('X-Request-Id', expiredRequestId)
      .send(approvalBody)
      .expect(410);

    const expiredState = await owner.query<{ state: string }>(
      `SELECT "state"::text AS state FROM "AdminRecoveryCase" WHERE "id" = $1`,
      [expiredRecoveryCaseId],
    );
    expect(expiredState.rows[0]?.state).toBe('EXPIRED');
    const rejectedAudits = await owner.query<{ count: string; requestId: string }>(
      `SELECT "requestId", count(*)::text AS count
         FROM "AuditLog"
        WHERE "requestId" = ANY($1::text[]) AND "outcome" = 'REJECTED'
        GROUP BY "requestId"
        ORDER BY "requestId"`,
      [rejectionRequestIds],
    );
    expect(rejectedAudits.rows).toEqual(
      [...rejectionRequestIds].sort().map((requestId) => ({ count: '1', requestId })),
    );
    const unexpectedSecurityEvents = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM "AdminSecurityEvent"
        WHERE "requestId" = ANY($1::text[])`,
      [rejectionRequestIds],
    );
    expect(unexpectedSecurityEvents.rows[0]?.count).toBe('0');
  });

  it('applies the recovery eligibility and conflict priority table with one durable sink', async () => {
    const server = application.getHttpServer();
    const inactiveSubject = await seedAdmin('recovery-inactive@example.invalid', 'CONTENT_EDITOR');
    await owner.query(
      `UPDATE "AdminUser"
          SET "status" = 'SUSPENDED',
              "authorizationVersion" = "authorizationVersion" + 1
        WHERE "id" = $1`,
      [inactiveSubject.id],
    );
    const recoveryBefore = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AdminRecoveryCase"`,
    );
    const createCases = [
      { label: 'absent', subjectAdminUserId: randomUUID() },
      { label: 'inactive', subjectAdminUserId: inactiveSubject.id },
      { label: 'self', subjectAdminUserId: recoveryOperator.id },
    ] as const;
    const requestIds: string[] = [];
    for (const [index, candidate] of createCases.entries()) {
      const requestId = `c2a-recovery-create-${candidate.label}`;
      requestIds.push(requestId);
      const response = await request(server)
        .post('/api/v1/admin/recovery-cases')
        .set('Authorization', bearer(recoveryOperator, 'GENERAL'))
        .set('Idempotency-Key', `c2a-recovery-create-refusal-${index}`)
        .set('Origin', origin)
        .set('X-Request-Id', requestId)
        .send({
          operatorReason: `recovery create refusal ${candidate.label}`,
          reasonCode: 'ACCOUNT_RECOVERY',
          subjectAdminUserId: candidate.subjectAdminUserId,
        })
        .expect(400);
      expect(response.body).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          details: {},
          message: 'Requête invalide.',
          retryable: false,
        },
        requestId,
      });
    }
    const recoveryAfter = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AdminRecoveryCase"`,
    );
    expect(recoveryAfter.rows[0]).toEqual(recoveryBefore.rows[0]);

    const now = new Date();
    const approvalCases = [
      {
        code: 'VALIDATION_ERROR',
        creatorAdminUserId: recoveryOperator.id,
        label: 'inactive-subject',
        state: 'PENDING',
        status: 400,
        subjectAdminUserId: inactiveSubject.id,
      },
      {
        code: 'RECOVERY_CASE_CONFLICT',
        creatorAdminUserId: recoveryOperator.id,
        label: 'non-pending-priority',
        state: 'CANCELLED',
        status: 409,
        subjectAdminUserId: inactiveSubject.id,
      },
      {
        code: 'RECOVERY_CASE_CONFLICT',
        creatorAdminUserId: approver.id,
        label: 'creator-is-approver',
        state: 'PENDING',
        status: 409,
        subjectAdminUserId: recoverySubject.id,
      },
      {
        code: 'RECOVERY_CASE_CONFLICT',
        creatorAdminUserId: recoveryOperator.id,
        label: 'subject-is-approver',
        state: 'PENDING',
        status: 409,
        subjectAdminUserId: approver.id,
      },
    ] as const;
    const insertedCases: Array<{ id: string; state: string }> = [];
    for (const candidate of approvalCases) {
      const id = randomUUID();
      insertedCases.push({ id, state: candidate.state });
      await owner.query(
        `INSERT INTO "AdminRecoveryCase"
           ("id", "subjectAdminUserId", "creatorAdminUserId", "state",
            "stateGeneration", "expiresAt", "createdAt", "cancelledAt")
         VALUES ($1, $2, $3, $4, 1, $5, $6, $7)`,
        [
          id,
          candidate.subjectAdminUserId,
          candidate.creatorAdminUserId,
          candidate.state,
          new Date(now.getTime() + 60 * 60 * 1000),
          now,
          candidate.state === 'CANCELLED' ? now : null,
        ],
      );
      const requestId = `c2a-recovery-approve-${candidate.label}`;
      requestIds.push(requestId);
      const response = await request(server)
        .post(`/api/v1/admin/recovery-cases/${id}/approve`)
        .set('Authorization', bearer(approver, 'RECOVERY_APPROVAL'))
        .set('Idempotency-Key', `c2a-recovery-approve-${candidate.label}`)
        .set('Origin', origin)
        .set('X-Request-Id', requestId)
        .send({
          operatorReason: `recovery approval refusal ${candidate.label}`,
          reasonCode: 'ACCOUNT_RECOVERY',
        })
        .expect(candidate.status);
      expect(response.body).toMatchObject({
        error: { code: candidate.code, details: {}, retryable: false },
        requestId,
      });
    }
    const states = await owner.query<{ id: string; state: string }>(
      `SELECT "id", "state"::text AS state
         FROM "AdminRecoveryCase"
        WHERE "id" = ANY($1::text[])
        ORDER BY "id"`,
      [insertedCases.map(({ id }) => id)],
    );
    expect(states.rows).toEqual(
      [...insertedCases].sort((left, right) => left.id.localeCompare(right.id)),
    );
    const audits = await owner.query<{ count: string; failureCode: string; requestId: string }>(
      `SELECT "requestId", "failureCode"::text AS "failureCode", count(*)::text AS count
         FROM "AuditLog"
        WHERE "requestId" = ANY($1::text[])
        GROUP BY "requestId", "failureCode"
        ORDER BY "requestId"`,
      [requestIds],
    );
    const expectedFailureCodes = new Map([
      ...createCases.map(
        (candidate) => [`c2a-recovery-create-${candidate.label}`, 'VALIDATION_ERROR'] as const,
      ),
      ...approvalCases.map(
        (candidate) =>
          [
            `c2a-recovery-approve-${candidate.label}`,
            candidate.code === 'VALIDATION_ERROR' ? 'VALIDATION_ERROR' : 'RESOURCE_CONFLICT',
          ] as const,
      ),
    ]);
    expect(audits.rows).toEqual(
      [...expectedFailureCodes]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([requestId, failureCode]) => ({ count: '1', failureCode, requestId })),
    );
    const securityEvents = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AdminSecurityEvent"
        WHERE "requestId" = ANY($1::text[])`,
      [requestIds],
    );
    expect(securityEvents.rows[0]?.count).toBe('0');
  });

  it('rolls back causal post-proof sink and mutation failures without a second sink', async () => {
    const server = application.getHttpServer();
    const repository = application.get(AdminSecurityRepository);
    const originalTransaction = repository.transaction.bind(repository);
    const scenarios = [
      { failingMethod: 'insertAudit', label: 'audit-sink' },
      { failingMethod: 'insertRecoveryCase', label: 'business-mutation' },
      { failingMethod: 'insertIdempotency', label: 'idempotency-final-write' },
    ] as const;
    for (const [index, scenario] of scenarios.entries()) {
      const subject = await seedAdmin(
        `post-proof-${scenario.label}@example.invalid`,
        'CONTENT_EDITOR',
      );
      const requestId = `c2a-post-proof-${scenario.label}`;
      const idempotencyKey = `c2a-post-proof-failure-${index}`;
      const before = await owner.query<{
        audits: string;
        cases: string;
        events: string;
        idempotencies: string;
      }>(
        `SELECT
           (SELECT count(*)::text FROM "AdminRecoveryCase") AS cases,
           (SELECT count(*)::text FROM "AuditLog" WHERE "requestId" = $1) AS audits,
           (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "requestId" = $1) AS events,
           (SELECT count(*)::text FROM "AdminC2IdempotencyRecord"
             WHERE "idempotencyKey" = $2) AS idempotencies`,
        [requestId, idempotencyKey],
      );
      const transactionSpy = vi.spyOn(repository, 'transaction').mockImplementation((async <T>(
        callback: (transaction: AdminSecurityTransactionRepository) => Promise<T>,
      ): Promise<T> =>
        originalTransaction((transaction) => {
          const injected = new Proxy(transaction, {
            get(target, property) {
              if (property === scenario.failingMethod) {
                const original = Reflect.get(target, property, target) as (
                  ...args: unknown[]
                ) => Promise<unknown>;
                return async (...args: unknown[]): Promise<unknown> => {
                  if (
                    scenario.failingMethod === 'insertRecoveryCase' ||
                    scenario.failingMethod === 'insertIdempotency'
                  ) {
                    await original.apply(target, args);
                  }
                  throw new Error(`controlled ${scenario.label} failure`);
                };
              }
              const value = Reflect.get(target, property, target) as unknown;
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });
          return callback(injected);
        })) as typeof repository.transaction);
      try {
        const response = await request(server)
          .post('/api/v1/admin/recovery-cases')
          .set('Authorization', bearer(recoveryOperator, 'GENERAL'))
          .set('Idempotency-Key', idempotencyKey)
          .set('Origin', origin)
          .set('X-Request-Id', requestId)
          .send({
            operatorReason: `controlled post-proof ${scenario.label}`,
            reasonCode: 'ACCOUNT_RECOVERY',
            subjectAdminUserId: subject.id,
          })
          .expect(503);
        expect(response.body).toEqual({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            details: {},
            message: 'Service temporairement indisponible.',
            retryable: false,
          },
          requestId,
        });
      } finally {
        transactionSpy.mockRestore();
      }
      const after = await owner.query<{
        audits: string;
        cases: string;
        events: string;
        idempotencies: string;
      }>(
        `SELECT
           (SELECT count(*)::text FROM "AdminRecoveryCase") AS cases,
           (SELECT count(*)::text FROM "AuditLog" WHERE "requestId" = $1) AS audits,
           (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "requestId" = $1) AS events,
           (SELECT count(*)::text FROM "AdminC2IdempotencyRecord"
             WHERE "idempotencyKey" = $2) AS idempotencies`,
        [requestId, idempotencyKey],
      );
      expect(after.rows[0]).toEqual(before.rows[0]);
    }
  });

  it('preserves C1 login and prevents concurrent removal of every active SUPER_ADMIN', async () => {
    const login = await request(application.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ email: 'reset@example.invalid', password: 'C2aResetPassword!2026' })
      .expect(200);
    expect(login.body.data.nextStep).toBe('TOTP_VERIFY');

    await request(application.getHttpServer())
      .post(`/api/v1/admin/users/${approver.id}/status-changes`)
      .set('Authorization', bearer(creator, 'STATUS_CHANGE'))
      .set('Idempotency-Key', 'c2a-status-disable-approver')
      .set('Origin', origin)
      .send({
        operatorReason: 'prepare bounded concurrency proof',
        reasonCode: 'SECURITY_RESPONSE',
        status: 'DISABLED',
      })
      .expect(204);

    const disable = (
      actor: SeededAdmin,
      target: SeededAdmin,
      idempotencyKey: string,
      requestId: string,
    ): Test =>
      request(application.getHttpServer())
        .post(`/api/v1/admin/users/${target.id}/status-changes`)
        .set('Authorization', bearer(actor, 'STATUS_CHANGE'))
        .set('Idempotency-Key', idempotencyKey)
        .set('Origin', origin)
        .set('X-Request-Id', requestId)
        .send({
          operatorReason: 'concurrent last super admin proof',
          reasonCode: 'SECURITY_RESPONSE',
          status: 'DISABLED',
        });
    const outcomes = await Promise.all([
      disable(
        creator,
        concurrentAdmin,
        'c2a-concurrent-status-0001',
        'c2a-concurrent-status-request-1',
      ),
      disable(
        concurrentAdmin,
        creator,
        'c2a-concurrent-status-0002',
        'c2a-concurrent-status-request-2',
      ),
    ]);
    expect(outcomes.filter(({ status }) => status === 204)).toHaveLength(1);
    expect(outcomes.filter(({ status }) => [401, 409].includes(status))).toHaveLength(1);
    const rejectedOutcome = outcomes.find(({ status }) => status !== 204);
    expect(rejectedOutcome).toBeDefined();
    const active = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AdminUser"
        WHERE "role" = 'SUPER_ADMIN' AND "status" = 'ACTIVE'`,
    );
    expect(active.rows[0]?.count).toBe('1');
    const successfulConcurrentAudits = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM "AuditLog"
        WHERE "requestId" = ANY($1::text[])
          AND "action" = 'changeAdminUserStatus'
          AND "outcome" = 'SUCCESS'`,
      [['c2a-concurrent-status-request-1', 'c2a-concurrent-status-request-2']],
    );
    expect(successfulConcurrentAudits.rows[0]?.count).toBe('1');
    const rejectedConcurrentAudits = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM "AuditLog"
        WHERE "requestId" = ANY($1::text[])
          AND "action" = 'changeAdminUserStatus'
          AND "outcome" = 'REJECTED'`,
      [['c2a-concurrent-status-request-1', 'c2a-concurrent-status-request-2']],
    );
    const failedConcurrentSecurityEvents = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM "AdminSecurityEvent"
        WHERE "requestId" = ANY($1::text[])
          AND "action" = 'changeAdminUserStatus'
          AND "outcome" = 'FAILED'`,
      [['c2a-concurrent-status-request-1', 'c2a-concurrent-status-request-2']],
    );
    if (rejectedOutcome?.status === 401) {
      expect(rejectedConcurrentAudits.rows[0]?.count).toBe('0');
      expect(failedConcurrentSecurityEvents.rows[0]?.count).toBe('1');
    } else {
      expect(rejectedOutcome?.status).toBe(409);
      expect(rejectedConcurrentAudits.rows[0]?.count).toBe('1');
      expect(failedConcurrentSecurityEvents.rows[0]?.count).toBe('0');
    }
  });
});
