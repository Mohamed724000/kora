import type { INestApplication } from '@nestjs/common';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { utimes } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg, { type Pool as PgPool, type PoolClient } from 'pg';
import request from 'supertest';
import { vi } from 'vitest';
import { AdminAuthCrypto } from '../src/admin-auth/admin-auth.crypto';
import type { AdminRole, AdminStepUpPurpose } from '../src/admin-auth/admin-auth.repository';
import { createApplication } from '../src/app.factory';
import { AdminAuditExportService } from '../src/admin-security/admin-audit-export.service';
import {
  AdminAuditRepository,
  type AdminAuditTransactionRepository,
} from '../src/admin-security/admin-audit.repository';
import { AdminC2TransactionError } from '../src/database/admin-c2-transaction.service';
import { createAdminSecurityC2bTestAdapters } from './admin-security-c2b-test-adapters';

const { Pool } = pg;
const realBusiness = process.env.S1203C2B_BUSINESS_E2E === '1' ? describe : describe.skip;
const ORIGIN = 'https://admin.kora.invalid';

interface SeededAdmin {
  readonly id: string;
  readonly tokens: Readonly<Partial<Record<AdminStepUpPurpose | 'GENERAL', string>>>;
}

interface WorkerProcess {
  readonly child: ChildProcessWithoutNullStreams;
  readonly stop: () => Promise<Readonly<{ code: number | null; stderr: string; stdout: string }>>;
  readonly waitReady: () => Promise<void>;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required.`);
  return value;
}

function tokenId(token: string): string {
  const payload = token.split('.')[1];
  if (payload === undefined) throw new Error('C2b test token payload is missing.');
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    jti?: unknown;
  };
  if (typeof parsed.jti !== 'string') throw new Error('C2b test token JTI is missing.');
  return parsed.jti;
}

function tokenSessionId(token: string): string {
  const payload = token.split('.')[1];
  if (payload === undefined) throw new Error('C2b test token payload is missing.');
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sid?: unknown;
  };
  if (typeof parsed.sid !== 'string') throw new Error('C2b test token session is missing.');
  return parsed.sid;
}

function bearer(admin: SeededAdmin, purpose: AdminStepUpPurpose | 'GENERAL'): string {
  const token = admin.tokens[purpose];
  if (token === undefined) throw new Error(`C2b test token ${purpose} is missing.`);
  return `Bearer ${token}`;
}

function runtimeEnvironment(profile: 'HTTP' | 'EXPORT_WORKER'): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const name of [
    'ADMIN_C2B_AUDIT_API_DATABASE_PASSWORD',
    'ADMIN_C2B_AUDIT_API_DATABASE_USER',
    'ADMIN_C2B_EXPORT_WORKER_DATABASE_PASSWORD',
    'ADMIN_C2B_EXPORT_WORKER_DATABASE_USER',
  ]) {
    delete environment[name];
  }
  const credentials =
    profile === 'HTTP'
      ? {
          ADMIN_C2B_AUDIT_API_DATABASE_PASSWORD: required('S1203C2B_BUSINESS_AUDIT_API_PASSWORD'),
          ADMIN_C2B_AUDIT_API_DATABASE_USER: 'kora_admin_c2b_audit_api',
        }
      : {
          ADMIN_C2B_EXPORT_WORKER_DATABASE_PASSWORD: required(
            'S1203C2B_BUSINESS_EXPORT_WORKER_PASSWORD',
          ),
          ADMIN_C2B_EXPORT_WORKER_DATABASE_USER: 'kora_admin_c2b_export_worker',
        };
  return {
    ...environment,
    ...credentials,
    ADMIN_C2B_DATABASE_HOST: '127.0.0.1',
    ADMIN_C2B_DATABASE_NAME: required('S1203C2B_BUSINESS_DATABASE'),
    ADMIN_C2B_DATABASE_PORT: required('S1203C2B_BUSINESS_POSTGRES_PORT'),
    ADMIN_C2B_DATABASE_SSL: 'false',
    ADMIN_C2B_ENABLED: 'true',
    ADMIN_C2B_PROFILE: profile,
    ADMIN_DATABASE_HOST: '127.0.0.1',
    ADMIN_DATABASE_NAME: required('S1203C2B_BUSINESS_DATABASE'),
    ADMIN_DATABASE_PASSWORD: required('S1203C2B_BUSINESS_C1_WRITER_PASSWORD'),
    ADMIN_DATABASE_PORT: required('S1203C2B_BUSINESS_POSTGRES_PORT'),
    ADMIN_DATABASE_SSL: 'false',
    ADMIN_DATABASE_USER: 'kora_admin_writer',
    ADMIN_ORIGIN: ORIGIN,
    ADMIN_REDIS_HOST: '127.0.0.1',
    ADMIN_REDIS_PASSWORD: required('S1203C2B_BUSINESS_REDIS_PASSWORD'),
    ADMIN_REDIS_PORT: required('S1203C2B_BUSINESS_REDIS_PORT'),
    ADMIN_REDIS_TLS: 'false',
    ADMIN_REDIS_WAIT_AOF_TIMEOUT_MS: '5000',
    API_HOST: '127.0.0.1',
    API_PORT: '3001',
    DATABASE_HOST: '127.0.0.1',
    DATABASE_NAME: required('S1203C2B_BUSINESS_DATABASE'),
    DATABASE_PASSWORD: required('S1203C2B_BUSINESS_READER_PASSWORD'),
    DATABASE_PORT: required('S1203C2B_BUSINESS_POSTGRES_PORT'),
    DATABASE_SSL: 'false',
    DATABASE_USER: 'kora_runtime',
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
    READINESS_TIMEOUT_MS: '5000',
    REDIS_HOST: '127.0.0.1',
    REDIS_PASSWORD: required('S1203C2B_BUSINESS_REDIS_PASSWORD'),
    REDIS_PORT: required('S1203C2B_BUSINESS_REDIS_PORT'),
    REDIS_TLS: 'false',
    S1203C2B_PROCESS_PROOF: '1',
    S1203C2B_TEST_STORAGE_DIRECTORY: required('S1203C2B_TEST_STORAGE_DIRECTORY'),
  };
}

function startWorker(environment: NodeJS.ProcessEnv): WorkerProcess {
  const entry = resolve(
    process.cwd(),
    'dist',
    'src',
    'admin-security',
    'admin-audit-export.main.js',
  );
  const child = spawn(process.execPath, [entry], {
    cwd: process.cwd(),
    env: environment,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  let terminal: Readonly<{ code: number | null; stderr: string; stdout: string }> | undefined;
  let terminalError: Error | undefined;
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
  const closed = new Promise<Readonly<{ code: number | null; stderr: string; stdout: string }>>(
    (resolveClose, reject) => {
      child.once('error', (error) => {
        terminalError = error;
        notify();
        reject(error);
      });
      child.once('close', (code) => {
        terminal = { code, stderr, stdout };
        notify();
        resolveClose(terminal);
      });
    },
  );
  return {
    child,
    async stop() {
      if (terminal === undefined && terminalError === undefined) child.stdin.write('STOP\n');
      let outcome;
      try {
        outcome = await Promise.race([
          closed,
          new Promise<never>((_resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error('C2b worker did not stop within 45 seconds.')),
              45_000,
            );
            timer.unref();
          }),
        ]);
      } catch (error: unknown) {
        if (terminal === undefined && terminalError === undefined) child.kill();
        throw error;
      }
      process.stdout.write(`C2B_WORKER_PROCESS_PROOF ${JSON.stringify(outcome)}\n`);
      return outcome;
    },
    async waitReady() {
      if (stdout.includes('C2B_AUDIT_EXPORT_PROCESS_PROOF_READY')) return;
      await new Promise<void>((resolveReady, reject) => {
        const timer = setTimeout(() => {
          listeners.delete(check);
          reject(new Error(`C2b worker readiness timed out. stderr=${stderr}`));
        }, 30_000);
        const check = (): void => {
          if (stdout.includes('C2B_AUDIT_EXPORT_PROCESS_PROOF_READY')) {
            clearTimeout(timer);
            listeners.delete(check);
            resolveReady();
          } else if (terminal !== undefined || terminalError !== undefined) {
            clearTimeout(timer);
            listeners.delete(check);
            reject(terminalError ?? new Error(`C2b worker exited before readiness: ${stderr}`));
          }
        };
        listeners.add(check);
        check();
      });
    },
  };
}

async function eventually<T>(probe: () => Promise<T | undefined>, label: string): Promise<T> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value !== undefined) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`C2b timed out while waiting for ${label}.`);
}

function databasePool(user: string, password: string): PgPool {
  return new Pool({
    database: required('S1203C2B_BUSINESS_DATABASE'),
    host: '127.0.0.1',
    max: 1,
    password,
    port: Number(required('S1203C2B_BUSINESS_POSTGRES_PORT')),
    user,
  });
}

function postgresProbeFailure(label: string, error: unknown): Error {
  const details =
    typeof error === 'object' && error !== null
      ? (error as {
          code?: unknown;
          column?: unknown;
          constraint?: unknown;
          message?: unknown;
          table?: unknown;
        })
      : {};
  return new Error(
    `${label} failed: ${JSON.stringify({
      code: details.code,
      column: details.column,
      constraint: details.constraint,
      message: details.message,
      table: details.table,
    })}`,
    { cause: error },
  );
}

function runtimeDiagnostic(error: unknown, depth = 0): Readonly<Record<string, unknown>> {
  if (depth > 3 || typeof error !== 'object' || error === null) {
    return { valueType: typeof error };
  }
  const source = error as Record<string, unknown>;
  const diagnostic: Record<string, unknown> = {};
  for (const name of ['name', 'message', 'code', 'table', 'column', 'constraint'] as const) {
    if (typeof source[name] === 'string') diagnostic[name] = source[name];
  }
  for (const name of ['primaryError', 'rollbackError', 'cleanupError', 'cause'] as const) {
    if (source[name] !== undefined) diagnostic[name] = runtimeDiagnostic(source[name], depth + 1);
  }
  return diagnostic;
}

async function probeRoleTransaction(
  label: string,
  pool: PgPool,
  statements: readonly Readonly<{ sql: string; values?: readonly unknown[] }>[],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const statement of statements) {
      if (statement.values === undefined) await client.query(statement.sql);
      else await client.query(statement.sql, [...statement.values]);
    }
    await client.query('ROLLBACK');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw postgresProbeFailure(label, error);
  } finally {
    client.release();
    await pool.end();
  }
}

async function assertRoleStatementDenied(
  label: string,
  pool: PgPool,
  sql: string,
  values: readonly unknown[] = [],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let denial: unknown;
    try {
      await client.query(sql, [...values]);
    } catch (error: unknown) {
      denial = error;
    }
    if (
      typeof denial !== 'object' ||
      denial === null ||
      !('code' in denial) ||
      denial.code !== '42501'
    ) {
      throw postgresProbeFailure(label, denial ?? new Error('statement unexpectedly succeeded'));
    }
    await client.query('ROLLBACK');
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
    await pool.end();
  }
}

async function assertC2bSqlCapabilities(
  adminUserId: string,
  adminSessionId: string,
): Promise<void> {
  const auditApi = databasePool(
    'kora_admin_c2b_audit_api',
    required('S1203C2B_BUSINESS_AUDIT_API_PASSWORD'),
  );
  const exportWorker = databasePool(
    'kora_admin_c2b_export_worker',
    required('S1203C2B_BUSINESS_EXPORT_WORKER_PASSWORD'),
  );
  const auditApiDirectRead = databasePool(
    'kora_admin_c2b_audit_api',
    required('S1203C2B_BUSINESS_AUDIT_API_PASSWORD'),
  );
  const exportWorkerPrincipalLock = databasePool(
    'kora_admin_c2b_export_worker',
    required('S1203C2B_BUSINESS_EXPORT_WORKER_PASSWORD'),
  );
  const auditApiIdempotencyLock = databasePool(
    'kora_admin_c2b_audit_api',
    required('S1203C2B_BUSINESS_AUDIT_API_PASSWORD'),
  );
  const exportWorkerIdempotencyLock = databasePool(
    'kora_admin_c2b_export_worker',
    required('S1203C2B_BUSINESS_EXPORT_WORKER_PASSWORD'),
  );
  const probes = await Promise.allSettled([
    probeRoleTransaction('C2b audit API principal lock capability', auditApi, [
      {
        sql: `SELECT * FROM public.kora_lock_admin_c2b_principal($1, $2)`,
        values: [adminUserId, adminSessionId],
      },
    ]),
    probeRoleTransaction('C2b audit API idempotency lock capability', auditApiIdempotencyLock, [
      {
        sql: `SELECT public.kora_lock_admin_c2b_export_idempotency($1, $2)`,
        values: [adminUserId, 'c2b-capability-key-0001'],
      },
    ]),
    probeRoleTransaction('C2b export worker claim capability', exportWorker, [
      {
        sql: `SELECT "id"
                FROM "AdminAuditExport"
               WHERE "state" = 'PENDING'
               FOR UPDATE SKIP LOCKED
               LIMIT 1`,
      },
    ]),
    assertRoleStatementDenied(
      'C2b audit API direct authentication-table read denial',
      auditApiDirectRead,
      `SELECT "id" FROM public."AdminUser" WHERE "id" = $1`,
      [adminUserId],
    ),
    assertRoleStatementDenied(
      'C2b export worker principal-lock function denial',
      exportWorkerPrincipalLock,
      `SELECT * FROM public.kora_lock_admin_c2b_principal($1, $2)`,
      [adminUserId, adminSessionId],
    ),
    assertRoleStatementDenied(
      'C2b export worker idempotency-lock function denial',
      exportWorkerIdempotencyLock,
      `SELECT public.kora_lock_admin_c2b_export_idempotency($1, $2)`,
      [adminUserId, 'c2b-capability-key-0001'],
    ),
  ]);
  const failures = probes.flatMap((result) =>
    result.status === 'rejected' ? [String(result.reason)] : [],
  );
  if (failures.length > 0) throw new Error(failures.join('\n'));
}

realBusiness('Admin C2b real PostgreSQL/Redis/HTTP/worker', { timeout: 300_000 }, () => {
  let adapters: ReturnType<typeof createAdminSecurityC2bTestAdapters>;
  let authCrypto: AdminAuthCrypto;
  let application: INestApplication;
  let owner: PgPool;
  let worker: WorkerProcess | undefined;
  let creator: SeededAdmin;
  let foreignCreator: SeededAdmin;
  let support: SeededAdmin;
  let exportId = '';
  let downloadedHash = '';

  async function withTemporalFixture<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await owner.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL session_replication_role = replica');
      const result = await operation(client);
      await client.query('SET LOCAL session_replication_role = origin');
      await client.query('COMMIT');
      return result;
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async function createExportRequest(input: {
    readonly idempotencyKey: string;
    readonly operatorReason: string;
    readonly requestId: string;
  }): Promise<request.Response> {
    return request(application.getHttpServer())
      .post('/api/v1/admin/audit-log-exports')
      .set('Authorization', bearer(creator, 'AUDIT_EXPORT'))
      .set('Idempotency-Key', input.idempotencyKey)
      .set('Origin', ORIGIN)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('X-Request-Id', input.requestId)
      .send({
        from: '2020-01-01T00:00:00.000Z',
        operatorReason: input.operatorReason,
        reasonCode: 'AUDIT_EXPORT',
        to: '2030-01-01T00:00:00.000Z',
      });
  }

  async function seedAdmin(
    email: string,
    role: AdminRole,
    purposes: readonly (AdminStepUpPurpose | 'GENERAL')[],
  ): Promise<SeededAdmin> {
    const id = randomUUID();
    const now = new Date();
    const passwordHash = await authCrypto.hashPassword('C2bSeedPassword!2026');
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
          createHash('sha256').update(`refresh-${sessionId}`).digest('hex'),
          now,
          new Date(now.getTime() + 15 * 60 * 1000),
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

  beforeAll(async () => {
    adapters = createAdminSecurityC2bTestAdapters(required('S1203C2B_TEST_STORAGE_DIRECTORY'));
    authCrypto = new AdminAuthCrypto(adapters.adminKeyProvider);
    owner = new Pool({
      database: required('S1203C2B_BUSINESS_DATABASE'),
      host: '127.0.0.1',
      max: 2,
      password: required('S1203C2B_BUSINESS_OWNER_PASSWORD'),
      port: Number(required('S1203C2B_BUSINESS_POSTGRES_PORT')),
      user: 'kora_owner',
    });
    creator = await seedAdmin('c2b-creator@example.invalid', 'SUPER_ADMIN', [
      'GENERAL',
      'AUDIT_EXPORT',
    ]);
    foreignCreator = await seedAdmin('c2b-foreign@example.invalid', 'SUPER_ADMIN', [
      'GENERAL',
      'AUDIT_EXPORT',
    ]);
    support = await seedAdmin('c2b-support@example.invalid', 'SUPPORT', ['GENERAL']);
    const creatorSessionId = tokenSessionId(creator.tokens.GENERAL!);
    await owner.query(
      `INSERT INTO "AuditLog"
         ("id", "version", "adminUserId", "subjectAdminUserId", "adminSessionId",
          "eventClass", "context", "action", "entityType", "entityId", "reason",
          "reasonCode", "requestId")
       VALUES ($1, 2, $2, $2, $3, 'SESSION', 'ADMIN_SESSION',
               'ADMIN_SESSION_CREATED', 'AdminSession', $3,
               'historical free text never projected', 'SECURITY_RESPONSE',
               'c2b-historical-fixture-1'),
              ($4, 2, $2, $2, $3, 'SESSION', 'ADMIN_SESSION',
               'ADMIN_SESSION_CREATED', 'AdminSession', $3,
               'second historical free text never projected', 'SECURITY_RESPONSE',
               'c2b-historical-fixture-2')`,
      [randomUUID(), creator.id, creatorSessionId, randomUUID()],
    );
    await assertC2bSqlCapabilities(creator.id, creatorSessionId);
    const environment = Object.fromEntries(
      Object.entries(runtimeEnvironment('HTTP')).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    application = await createApplication({
      adminAudit: {
        keyring: adapters.keyring,
        signing: adapters.signing,
        storage: adapters.storage,
      },
      adminKeyProvider: adapters.adminKeyProvider,
      environment,
    });
    const repository = application.get(AdminAuditRepository);
    const transaction = repository.transaction.bind(repository);
    repository.transaction = async (callback) => {
      try {
        return await transaction(callback);
      } catch (error: unknown) {
        process.stdout.write(
          `C2B_HTTP_TRANSACTION_DIAGNOSTIC ${JSON.stringify(runtimeDiagnostic(error))}\n`,
        );
        throw error;
      }
    };
    worker = startWorker(runtimeEnvironment('EXPORT_WORKER'));
    await worker.waitReady();
  }, 120_000);

  afterAll(async () => {
    await application?.close();
    if (worker !== undefined) {
      const outcome = await worker.stop();
      expect(outcome.code).toBe(0);
    }
    await owner?.end();
  }, 60_000);

  it('projects historical audit without free text and binds pagination to the principal', async () => {
    const response = await request(application.getHttpServer())
      .get('/api/v1/admin/audit-logs?limit=1')
      .set('Authorization', bearer(creator, 'GENERAL'))
      .set('X-Request-Id', 'c2b-list-historical')
      .expect(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0]).toMatchObject({
      operatorReason: null,
      operatorReasonRedacted: true,
      outcome: 'UNKNOWN',
      outcomeProvenance: 'HISTORICAL_UNKNOWN',
      version: 2,
    });
    expect(JSON.stringify(response.body)).not.toContain('historical free text never projected');
    const cursor = response.body.meta.nextCursor as string | null;
    expect(cursor).not.toBeNull();
    await request(application.getHttpServer())
      .get(`/api/v1/admin/audit-logs?limit=1&cursor=${encodeURIComponent(cursor!)}`)
      .set('Authorization', bearer(foreignCreator, 'GENERAL'))
      .set('X-Request-Id', 'c2b-list-cross-principal')
      .expect(400);
  });

  it('durably rejects a foreign role after server proof', async () => {
    const requestId = 'c2b-list-role-refusal';
    await request(application.getHttpServer())
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', bearer(support, 'GENERAL'))
      .set('X-Request-Id', requestId)
      .expect(403);
    const audit = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AuditLog"
        WHERE "requestId" = $1 AND "action" = 'listAdminAuditLogs'
          AND "outcome" = 'REJECTED' AND "failureCode" = 'FORBIDDEN'`,
      [requestId],
    );
    expect(audit.rows[0]?.count).toBe('1');
  });

  it('creates one export atomically, replays it, and rejects a changed payload', async () => {
    const body = {
      from: '2020-01-01T00:00:00.000Z',
      operatorReason: 'qualified local C2b export',
      reasonCode: 'AUDIT_EXPORT',
      to: '2030-01-01T00:00:00.000Z',
    };
    const create = (candidate: typeof body): request.Test =>
      request(application.getHttpServer())
        .post('/api/v1/admin/audit-log-exports')
        .set('Authorization', bearer(creator, 'AUDIT_EXPORT'))
        .set('Idempotency-Key', 'c2b-qualified-idempotency-key-0001')
        .set('Origin', ORIGIN)
        .set('Sec-Fetch-Site', 'same-origin')
        .set('X-Request-Id', randomUUID())
        .send(candidate);
    const [first, replay] = await Promise.all([create(body).expect(202), create(body).expect(202)]);
    exportId = first.body.data.exportId as string;
    expect(replay.body.data.exportId).toBe(exportId);
    await create({ ...body, operatorReason: 'changed qualified export reason' }).expect(409);
    const durable = await owner.query<{
      audits: string;
      exports: string;
      idempotencyRecords: string;
      windowExact: boolean;
    }>(
      `SELECT
         (SELECT count(*) FROM "AdminAuditExport" WHERE "id" = $1)::text AS exports,
         (SELECT count(*) FROM "AuditLog"
           WHERE "adminAuditExportId" = $1 AND "action" = 'createAdminAuditLogExport'
             AND "outcome" = 'SUCCESS')::text AS audits,
         (SELECT count(*) FROM "AdminAuditExportIdempotencyRecord"
           WHERE "exportId" = $1)::text AS "idempotencyRecords",
         (SELECT bool_and("expiresAt" = "createdAt" + INTERVAL '24 hours')
            FROM "AdminAuditExportIdempotencyRecord"
           WHERE "exportId" = $1) AS "windowExact"`,
      [exportId],
    );
    expect(durable.rows[0]).toEqual({
      audits: '1',
      exports: '1',
      idempotencyRecords: '1',
      windowExact: true,
    });
  });

  it('rolls back the export, idempotency generation, and audit as one unit', async () => {
    const repository = application.get(AdminAuditRepository);
    const transaction = repository.transaction.bind(repository);
    const idempotencyKey = 'c2b-qualified-rollback-key-0001';
    const requestId = 'c2b-qualified-rollback-request-0001';
    const before = await owner.query<{
      audits: string;
      exports: string;
      idempotencyRecords: string;
      snapshots: string;
    }>(
      `SELECT
         (SELECT count(*) FROM "AuditLog")::text AS audits,
         (SELECT count(*) FROM "AdminAuditExport")::text AS exports,
         (SELECT count(*) FROM "AdminAuditExportIdempotencyRecord")::text
           AS "idempotencyRecords",
         (SELECT count(*) FROM "AdminAuditPaginationSnapshot")::text AS snapshots`,
    );
    let injected = false;
    const transactionSpy = vi
      .spyOn(repository, 'transaction')
      .mockImplementation(
        async <T>(
          callback: (candidate: AdminAuditTransactionRepository) => Promise<T>,
        ): Promise<T> =>
          transaction(async (candidate) => {
            const result = await callback(candidate);
            if (!injected) {
              injected = true;
              throw new Error('C2b qualified rollback injection.');
            }
            return result;
          }),
      );
    try {
      await createExportRequest({
        idempotencyKey,
        operatorReason: 'qualified atomic rollback',
        requestId,
      }).then((response) => expect(response.status).toBe(503));
    } finally {
      transactionSpy.mockRestore();
    }
    expect(injected).toBe(true);
    const durable = await owner.query<{
      audits: string;
      exports: string;
      idempotencyRecords: string;
      snapshots: string;
    }>(
      `SELECT
         (SELECT count(*) FROM "AuditLog")::text AS audits,
         (SELECT count(*) FROM "AdminAuditExport")::text AS exports,
         (SELECT count(*) FROM "AdminAuditExportIdempotencyRecord")::text
           AS "idempotencyRecords",
         (SELECT count(*) FROM "AdminAuditPaginationSnapshot")::text AS snapshots`,
    );
    expect(durable.rows[0]).toEqual(before.rows[0]);

    await createExportRequest({
      idempotencyKey,
      operatorReason: 'qualified atomic rollback',
      requestId: 'c2b-qualified-rollback-retry-0001',
    }).then((response) => expect(response.status).toBe(202));
  });

  it('returns a neutral COMMIT_UNKNOWN while preserving one durable generation', async () => {
    const repository = application.get(AdminAuditRepository);
    const transaction = repository.transaction.bind(repository);
    const idempotencyKey = 'c2b-qualified-commit-unknown-key-0001';
    const requestId = 'c2b-qualified-commit-unknown-request-0001';
    let injected = false;
    const transactionSpy = vi
      .spyOn(repository, 'transaction')
      .mockImplementation(
        async <T>(
          callback: (candidate: AdminAuditTransactionRepository) => Promise<T>,
        ): Promise<T> => {
          const result = await transaction(callback);
          if (!injected) {
            injected = true;
            throw new AdminC2TransactionError(
              'COMMIT_UNKNOWN',
              'C2b qualified commit acknowledgement injection.',
            );
          }
          return result;
        },
      );
    try {
      const response = await createExportRequest({
        idempotencyKey,
        operatorReason: 'qualified commit unknown',
        requestId,
      });
      expect(response.status).toBe(503);
      expect(JSON.stringify(response.body)).not.toContain('exportId');
    } finally {
      transactionSpy.mockRestore();
    }
    expect(injected).toBe(true);
    const durable = await owner.query<{
      audits: string;
      exportId: string;
      exports: string;
      idempotencyRecords: string;
    }>(
      `SELECT
         (SELECT count(*) FROM "AdminAuditExport" export_entry
           WHERE export_entry."id" = record."exportId")::text AS exports,
         (SELECT count(*) FROM "AuditLog"
           WHERE "requestId" = $1 AND "action" = 'createAdminAuditLogExport'
             AND "outcome" = 'SUCCESS')::text AS audits,
         record."exportId",
         count(*)::text AS "idempotencyRecords"
         FROM "AdminAuditExportIdempotencyRecord" record
        WHERE record."adminUserId" = $2 AND record."idempotencyKey" = $3
        GROUP BY record."exportId"`,
      [requestId, creator.id, idempotencyKey],
    );
    expect(durable.rows).toHaveLength(1);
    expect(durable.rows[0]).toMatchObject({
      audits: '1',
      exports: '1',
      idempotencyRecords: '1',
    });

    const replay = await createExportRequest({
      idempotencyKey,
      operatorReason: 'qualified commit unknown',
      requestId: 'c2b-qualified-commit-unknown-replay-0001',
    });
    expect(replay.status).toBe(202);
    expect(replay.body.data.exportId).toBe(durable.rows[0]!.exportId);
    await createExportRequest({
      idempotencyKey,
      operatorReason: 'qualified changed commit unknown payload',
      requestId: 'c2b-qualified-commit-unknown-conflict-0001',
    }).then((response) => expect(response.status).toBe(409));
  });

  it('reuses an expired idempotency key atomically with a new generation', async () => {
    const idempotencyKey = 'c2b-qualified-expired-key-0001';
    const first = await createExportRequest({
      idempotencyKey,
      operatorReason: 'qualified expired generation',
      requestId: 'c2b-qualified-expired-generation-1',
    });
    expect(first.status).toBe(202);
    const firstExportId = first.body.data.exportId as string;
    const aged = await withTemporalFixture((client) =>
      client.query<{
        active: boolean;
        windowSeconds: string;
      }>(
        `WITH database_clock AS MATERIALIZED (
           SELECT (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now
         )
         UPDATE "AdminAuditExportIdempotencyRecord" record
            SET "createdAt" = database_clock.now - INTERVAL '24 hours',
                "expiresAt" = database_clock.now
           FROM database_clock
          WHERE record."adminUserId" = $1 AND record."idempotencyKey" = $2
            AND record."exportId" = $3
         RETURNING record."expiresAt" > database_clock.now AS active,
                   EXTRACT(EPOCH FROM (record."expiresAt" - record."createdAt"))::text
                     AS "windowSeconds"`,
        [creator.id, idempotencyKey, firstExportId],
      ),
    );
    expect(aged.rows[0]).toEqual({ active: false, windowSeconds: '86400.000000' });

    const [second, replay] = await Promise.all([
      createExportRequest({
        idempotencyKey,
        operatorReason: 'qualified expired generation',
        requestId: 'c2b-qualified-expired-generation-2',
      }),
      createExportRequest({
        idempotencyKey,
        operatorReason: 'qualified expired generation',
        requestId: 'c2b-qualified-expired-generation-2-replay',
      }),
    ]);
    expect(second.status).toBe(202);
    expect(replay.status).toBe(202);
    const secondExportId = second.body.data.exportId as string;
    expect(secondExportId).not.toBe(firstExportId);
    expect(replay.body.data.exportId).toBe(secondExportId);
    await createExportRequest({
      idempotencyKey,
      operatorReason: 'qualified changed expired payload',
      requestId: 'c2b-qualified-expired-generation-conflict',
    }).then((response) => expect(response.status).toBe(409));

    const generations = await owner.query<{
      audits: string;
      exportId: string;
      generation: string;
      windowExact: boolean;
    }>(
      `SELECT record."generation"::text AS generation, record."exportId",
              record."expiresAt" = record."createdAt" + INTERVAL '24 hours' AS "windowExact",
              (SELECT count(*) FROM "AuditLog" audit
                WHERE audit."adminAuditExportId" = record."exportId"
                  AND audit."action" = 'createAdminAuditLogExport'
                  AND audit."outcome" = 'SUCCESS')::text AS audits
         FROM "AdminAuditExportIdempotencyRecord" record
        WHERE record."adminUserId" = $1 AND record."idempotencyKey" = $2
        ORDER BY record."generation" ASC`,
      [creator.id, idempotencyKey],
    );
    expect(generations.rows).toEqual([
      { audits: '1', exportId: firstExportId, generation: '1', windowExact: true },
      { audits: '1', exportId: secondExportId, generation: '2', windowExact: true },
    ]);
  });

  it('observes BullMQ process completion, creator isolation, and exact verified ZIP bytes', async () => {
    await request(application.getHttpServer())
      .get(`/api/v1/admin/audit-log-exports/${exportId}`)
      .set('Authorization', bearer(foreignCreator, 'GENERAL'))
      .set('X-Request-Id', 'c2b-export-foreign-get')
      .expect(404);
    const ready = await eventually(async () => {
      const result = await request(application.getHttpServer())
        .get(`/api/v1/admin/audit-log-exports/${exportId}`)
        .set('Authorization', bearer(creator, 'GENERAL'))
        .set('X-Request-Id', randomUUID());
      return result.status === 200 && result.body.data.state === 'READY' ? result : undefined;
    }, 'READY export');
    downloadedHash = ready.body.data.contentSha256 as string;
    await request(application.getHttpServer())
      .get(`/api/v1/admin/audit-log-exports/${exportId}/content`)
      .set('Authorization', bearer(creator, 'GENERAL'))
      .set('X-Request-Id', 'c2b-download-step-up-refusal')
      .expect(403);
    const downloaded = await request(application.getHttpServer())
      .get(`/api/v1/admin/audit-log-exports/${exportId}/content`)
      .set('Authorization', bearer(creator, 'AUDIT_EXPORT'))
      .set('X-Request-Id', 'c2b-download-success')
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect('Cache-Control', 'no-store')
      .expect('Content-Type', 'application/zip')
      .expect(200);
    const bytes = downloaded.body as Buffer;
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(downloadedHash);
    expect(bytes.subarray(0, 2).toString('ascii')).toBe('PK');
    const buildAudit = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AuditLog"
        WHERE "adminAuditExportId" = $1 AND "action" = 'buildAdminAuditLogExport'
          AND "outcome" = 'SUCCESS' AND "causationEventId" IS NOT NULL`,
      [exportId],
    );
    expect(buildAudit.rows[0]?.count).toBe('1');
  });

  it('rejects new reads at expiry and expires exactly once after the active lease closes', async () => {
    const created = await createExportRequest({
      idempotencyKey: 'c2b-qualified-expiry-key-0001',
      operatorReason: 'qualified positive expiration',
      requestId: 'c2b-qualified-expiry-create-0001',
    });
    expect(created.status).toBe(202);
    const expiringExportId = created.body.data.exportId as string;
    await eventually(async () => {
      const result = await owner.query<{ state: string }>(
        `SELECT "state" FROM "AdminAuditExport" WHERE "id" = $1`,
        [expiringExportId],
      );
      return result.rows[0]?.state === 'READY' ? true : undefined;
    }, 'READY export for positive expiration');

    const service = application.get(AdminAuditExportService);
    const delivery = await service.download(
      bearer(creator, 'AUDIT_EXPORT'),
      expiringExportId,
      'c2b-qualified-expiry-active-lease',
    );
    const contentSha256 = delivery.contentSha256;
    const aged = await withTemporalFixture(async (client) => {
      const updated = await client.query<{ windowSeconds: string }>(
        `WITH database_clock AS MATERIALIZED (
           SELECT (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now
         )
         UPDATE "AdminAuditExport" export_entry
            SET "readyAt" = database_clock.now - INTERVAL '25 hours',
                "expiresAt" = database_clock.now - INTERVAL '1 hour'
           FROM database_clock
          WHERE export_entry."id" = $1 AND export_entry."state" = 'READY'
         RETURNING EXTRACT(EPOCH FROM (
           export_entry."expiresAt" - export_entry."readyAt"
         ))::text AS "windowSeconds"`,
        [expiringExportId],
      );
      const expiryAtTimezone = async (timezone: string): Promise<boolean> => {
        await client.query(`SELECT pg_catalog.set_config('TimeZone', $1, true)`, [timezone]);
        const result = await client.query<{ expired: boolean }>(
          `SELECT "expiresAt" <=
                    (pg_catalog.statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)
                    AS expired
             FROM "AdminAuditExport" WHERE "id" = $1`,
          [expiringExportId],
        );
        return result.rows[0]?.expired === true;
      };
      return {
        honoluluExpired: await expiryAtTimezone('Pacific/Honolulu'),
        tokyoExpired: await expiryAtTimezone('Asia/Tokyo'),
        windowSeconds: updated.rows[0]?.windowSeconds,
      };
    });
    expect(aged).toEqual({
      honoluluExpired: true,
      tokyoExpired: true,
      windowSeconds: '86400.000000',
    });

    await request(application.getHttpServer())
      .get(`/api/v1/admin/audit-log-exports/${expiringExportId}/content`)
      .set('Authorization', bearer(creator, 'AUDIT_EXPORT'))
      .set('X-Request-Id', 'c2b-qualified-expiry-new-read-refusal')
      .expect(410);
    await createExportRequest({
      idempotencyKey: 'c2b-qualified-expiry-held-wakeup-0001',
      operatorReason: 'qualified held lease wakeup',
      requestId: 'c2b-qualified-expiry-held-wakeup-0001',
    }).then((response) => expect(response.status).toBe(202));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 750));
    const held = await owner.query<{ state: string }>(
      `SELECT "state" FROM "AdminAuditExport" WHERE "id" = $1`,
      [expiringExportId],
    );
    expect(held.rows[0]?.state).toBe('READY');

    await delivery.release();
    await Promise.all(
      [1, 2].map((sequence) =>
        createExportRequest({
          idempotencyKey: `c2b-qualified-expiry-released-wakeup-000${sequence}`,
          operatorReason: `qualified released lease wakeup ${sequence}`,
          requestId: `c2b-qualified-expiry-released-wakeup-000${sequence}`,
        }).then((response) => expect(response.status).toBe(202)),
      ),
    );
    await eventually(async () => {
      const result = await owner.query<{ state: string }>(
        `SELECT "state" FROM "AdminAuditExport" WHERE "id" = $1`,
        [expiringExportId],
      );
      return result.rows[0]?.state === 'EXPIRED' ? true : undefined;
    }, 'expired export after lease release');

    const durable = await owner.query<{
      audits: string;
      contentSha256: string;
      state: string;
      windowExact: boolean;
    }>(
      `SELECT export_entry."state", export_entry."contentSha256",
              export_entry."expiresAt" = export_entry."readyAt" + INTERVAL '24 hours'
                AS "windowExact",
              (SELECT count(*) FROM "AuditLog" audit
                WHERE audit."adminAuditExportId" = export_entry."id"
                  AND audit."action" = 'expireAdminAuditLogExport'
                  AND audit."outcome" = 'SUCCESS')::text AS audits
         FROM "AdminAuditExport" export_entry WHERE export_entry."id" = $1`,
      [expiringExportId],
    );
    expect(durable.rows[0]).toEqual({
      audits: '1',
      contentSha256,
      state: 'EXPIRED',
      windowExact: true,
    });
    await request(application.getHttpServer())
      .get(`/api/v1/admin/audit-log-exports/${expiringExportId}/content`)
      .set('Authorization', bearer(creator, 'AUDIT_EXPORT'))
      .set('X-Request-Id', 'c2b-qualified-expiry-final-refusal')
      .expect(410);
  });

  it('removes only a proven unreferenced staging object older than 24 hours', async () => {
    const orphanKey = `c2b/staging/${randomUUID()}/1/${randomUUID()}.zip.enc`;
    const orphanBytes = Buffer.from('bounded orphan staging object');
    await adapters.storage.putIfAbsent(orphanKey, orphanBytes);
    const orphanPath = resolve(
      required('S1203C2B_TEST_STORAGE_DIRECTORY'),
      ...orphanKey.split('/'),
    );
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await utimes(orphanPath, old, old);

    await Promise.all(
      [1, 2, 3].map((sequence) =>
        request(application.getHttpServer())
          .post('/api/v1/admin/audit-log-exports')
          .set('Authorization', bearer(creator, 'AUDIT_EXPORT'))
          .set('Idempotency-Key', `c2b-cleanup-wakeup-key-000${sequence}`)
          .set('Origin', ORIGIN)
          .set('Sec-Fetch-Site', 'same-origin')
          .set('X-Request-Id', `c2b-cleanup-wakeup-${sequence}`)
          .send({
            from: '2020-01-01T00:00:00.000Z',
            operatorReason: `qualified cleanup wakeup ${sequence}`,
            reasonCode: 'AUDIT_EXPORT',
            to: '2030-01-01T00:00:00.000Z',
          })
          .expect(202),
      ),
    );

    await eventually(async () => {
      try {
        await adapters.storage.get(orphanKey);
        return undefined;
      } catch {
        return true;
      }
    }, 'orphan staging cleanup');

    const finalObject = await owner.query<{ objectKey: string }>(
      `SELECT "objectKey" FROM "AdminAuditExport" WHERE "id" = $1`,
      [exportId],
    );
    await expect(adapters.storage.get(finalObject.rows[0]!.objectKey)).resolves.toBeInstanceOf(
      Uint8Array,
    );
    const releasedLeases = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM "AdminAuditExportReadLease"
        WHERE "releasedAt" IS NOT NULL`,
    );
    expect(releasedLeases.rows[0]?.count).toBe('0');
  });

  it('rejects tampered encrypted storage before a second byte delivery', async () => {
    const record = await owner.query<{ objectKey: string }>(
      `SELECT "objectKey" FROM "AdminAuditExport" WHERE "id" = $1`,
      [exportId],
    );
    const objectKey = record.rows[0]?.objectKey;
    expect(objectKey).toBeTruthy();
    const encrypted = Buffer.from(await adapters.storage.get(objectKey!));
    encrypted[encrypted.byteLength - 1] = encrypted[encrypted.byteLength - 1]! ^ 0x01;
    await adapters.storage.delete(objectKey!);
    await adapters.storage.putIfAbsent(objectKey!, encrypted);
    const requestId = 'c2b-download-integrity-refusal';
    await request(application.getHttpServer())
      .get(`/api/v1/admin/audit-log-exports/${exportId}/content`)
      .set('Authorization', bearer(creator, 'AUDIT_EXPORT'))
      .set('X-Request-Id', requestId)
      .expect(503);
    const durable = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AuditLog"
        WHERE "requestId" = $1 AND "action" = 'downloadAdminAuditLogExport'
          AND "outcome" = 'REJECTED' AND "failureCode" = 'INTEGRITY_REJECTED'`,
      [requestId],
    );
    expect(durable.rows[0]?.count).toBe('1');
  });

  it('persists the exact 10,000-entry export boundary in one bounded transaction', async () => {
    await eventually(async () => {
      const active = await owner.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM "AdminAuditExport"
          WHERE "state" IN ('PENDING', 'PROCESSING')`,
      );
      return active.rows[0]?.count === '0' ? true : undefined;
    }, 'worker quiescence before the capacity boundary');
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));

    await owner.query(
      `INSERT INTO "AuditLog"
         ("id", "version", "adminUserId", "subjectAdminUserId", "adminSessionId",
          "eventClass", "context", "action", "entityType", "entityId", "reason",
          "reasonCode", "requestId", "createdAt")
       SELECT gen_random_uuid()::text, 2, $1, $1, $2,
              'BUSINESS', 'ADMIN_SESSION', 'C2B_CAPACITY_FIXTURE', 'ADMIN_AUDIT_CAPACITY',
              'capacity-' || fixture.sequence::text,
              'capacity boundary fixture', 'SECURITY_RESPONSE',
              'c2b-capacity-' || fixture.sequence::text,
              clock_timestamp() - (fixture.sequence::text || ' microseconds')::interval
         FROM generate_series(1, 10000) AS fixture(sequence)`,
      [creator.id, tokenSessionId(creator.tokens.GENERAL!)],
    );

    const startedAt = performance.now();
    const response = await request(application.getHttpServer())
      .post('/api/v1/admin/audit-log-exports')
      .set('Authorization', bearer(creator, 'AUDIT_EXPORT'))
      .set('Idempotency-Key', 'c2b-qualified-capacity-key-10000')
      .set('Origin', ORIGIN)
      .set('Sec-Fetch-Site', 'same-origin')
      .set('X-Request-Id', 'c2b-capacity-10000')
      .send({
        action: 'C2B_CAPACITY_FIXTURE',
        from: '2020-01-01T00:00:00.000Z',
        operatorReason: 'qualified exact capacity boundary',
        reasonCode: 'AUDIT_EXPORT',
        to: '2030-01-01T00:00:00.000Z',
      })
      .expect(202);
    const elapsedMilliseconds = Math.ceil(performance.now() - startedAt);
    const capacityExportId = response.body.data.exportId as string;
    const snapshot = await owner.query<{
      entryCount: string;
      itemCount: string;
      state: string;
    }>(
      `SELECT snapshot."entryCount"::text AS "entryCount",
              count(item."ordinal")::text AS "itemCount",
              export."state"
         FROM "AdminAuditExport" export
         JOIN "AdminAuditPaginationSnapshot" snapshot ON snapshot."id" = export."snapshotId"
         LEFT JOIN "AdminAuditPaginationSnapshotItem" item ON item."snapshotId" = snapshot."id"
        WHERE export."id" = $1
        GROUP BY snapshot."entryCount", export."state"`,
      [capacityExportId],
    );
    expect(snapshot.rows[0]).toEqual({
      entryCount: '10000',
      itemCount: '10000',
      state: expect.stringMatching(/^(PENDING|PROCESSING|READY)$/u),
    });

    process.stdout.write(
      `C2B_CAPACITY_BOUNDARY_PASS entries=10000 snapshot_items=10000 http_elapsed_ms=${elapsedMilliseconds}\n`,
    );
  });
});
