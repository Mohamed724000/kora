import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFileSync } from 'node:child_process';
import { createHash, randomInt, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Redis from 'ioredis';
import pg, {
  type Pool as PgPool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from 'pg';
import request from 'supertest';
import type { MockInstance } from 'vitest';
import { AdminAuthController } from '../src/admin-auth/admin-auth.controller';
import { AdminAuthRepository } from '../src/admin-auth/admin-auth.repository';
import { ADMIN_AUTH_CRYPTO, AdminAuthCrypto } from '../src/admin-auth/admin-auth.crypto';
import {
  AdminKeyProviderUnavailableError,
  TestEphemeralAdminKeyProvider,
  type AdminKeyProvider,
  type AdminKeyProviderOperation,
  type AdminRs256Signature,
  type WrappedAdminDek,
} from '../src/admin-auth/admin-key-provider';
import { AdminRateLimitService } from '../src/admin-auth/admin-rate-limit.service';
import { ADMIN_REQUEST_POLICY, AdminRequestPolicy } from '../src/admin-auth/admin-request-policy';
import { createApplication } from '../src/app.factory';
import type { RuntimeConfig } from '../src/config/runtime-config';
import {
  AdminWriterBoundaryError,
  AdminWriterCommitUnknownError,
  AdminWriterService,
  type AdminWriterTransaction,
} from '../src/database/admin-writer.service';
import {
  PostgresqlRuntimeBoundary,
  RuntimeDatabaseBoundaryError,
} from '../src/database/postgresql-runtime-boundary';
import { PrismaService } from '../src/database/prisma.service';

const { Client, Pool } = pg;

describe('Admin C1 route inventory', () => {
  it('registers exactly the twelve contract operations', () => {
    const methods = Object.getOwnPropertyNames(AdminAuthController.prototype)
      .filter((name) => name !== 'constructor')
      .flatMap((name) => {
        const handler = Object.getOwnPropertyDescriptor(AdminAuthController.prototype, name)?.value;
        if (typeof handler !== 'function') return [];
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        return path === undefined || method === undefined ? [] : [{ method, path }];
      });

    expect(methods).toEqual(
      expect.arrayContaining([
        { method: RequestMethod.POST, path: 'login' },
        { method: RequestMethod.POST, path: 'totp/enrollments' },
        {
          method: RequestMethod.POST,
          path: 'totp/enrollments/:enrollmentId/qr',
        },
        {
          method: RequestMethod.POST,
          path: 'totp/enrollments/:enrollmentId/confirm',
        },
        { method: RequestMethod.POST, path: 'totp/verify' },
        { method: RequestMethod.POST, path: 'recovery-codes/verify' },
        { method: RequestMethod.POST, path: 'recovery-codes/rotate' },
        { method: RequestMethod.POST, path: 'step-up' },
        { method: RequestMethod.POST, path: 'sessions/refresh' },
        { method: RequestMethod.DELETE, path: 'sessions/current' },
        { method: RequestMethod.GET, path: 'sessions' },
        { method: RequestMethod.POST, path: 'sessions/:sessionId/revocations' },
      ]),
    );
    expect(methods).toHaveLength(12);
  });
});

const realRedis = process.env.S1203C1_REAL_REDIS === '1' ? describe : describe.skip;

realRedis('Admin C1 real Redis durability', { timeout: 30_000 }, () => {
  it('applies the concurrent refresh limit and observes the persisted counter on reconnect', async () => {
    const port = Number(process.env.S1203C1_REDIS_PORT);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
      throw new Error('S1203C1_REDIS_PORT must identify the isolated Redis instance.');
    }
    const keyProvider = new TestEphemeralAdminKeyProvider();
    const options = {
      keyProvider,
      redis: {
        host: '127.0.0.1',
        port,
        tls: false,
        waitAofTimeoutMs: 5_000,
      },
    } as const;
    const first = new AdminRateLimitService(options);
    try {
      const decisions = await Promise.all(
        Array.from({ length: 11 }, () =>
          first.consume('REFRESH', '192.0.2.10', 'real-redis-refresh-context'),
        ),
      );
      expect(decisions.filter(({ allowed }) => allowed)).toHaveLength(10);
      expect(decisions.filter(({ allowed }) => !allowed)).toHaveLength(1);
    } finally {
      first.close();
    }

    const container = process.env.S1203C1_REDIS_CONTAINER;
    if (container !== undefined) {
      if (!/^kora-s1203c1-redis-validation-[0-9]{8}$/u.test(container)) {
        throw new Error('S1203C1_REDIS_CONTAINER failed the isolated-target guard.');
      }
      execFileSync('docker', ['restart', container], {
        stdio: 'pipe',
        timeout: 30_000,
        windowsHide: true,
      });
      let ready = false;
      for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
        try {
          ready =
            execFileSync('docker', ['exec', container, 'redis-cli', 'PING'], {
              encoding: 'utf8',
              stdio: 'pipe',
              timeout: 2_000,
              windowsHide: true,
            }).trim() === 'PONG';
        } catch {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
        }
      }
      expect(ready).toBe(true);
    }

    const reconnected = new AdminRateLimitService(options);
    try {
      await expect(
        reconnected.consume('REFRESH', '192.0.2.10', 'real-redis-refresh-context'),
      ).resolves.toMatchObject({ allowed: false, remaining: 0 });
    } finally {
      reconnected.close();
    }
  });
});

const realHttp = process.env.S1203C1_HTTP_E2E === '1' ? describe : describe.skip;

interface BrowserCookies {
  cookie: string;
  csrf: string;
}

type R11ValidationOperation =
  | 'confirmAdminTotpEnrollment'
  | 'rotateAdminRecoveryCodes'
  | 'stepUpAdminSession'
  | 'verifyAdminRecoveryCode'
  | 'verifyAdminTotp';

const r11OpenApi = JSON.parse(
  readFileSync(resolve(process.cwd(), '..', '..', 'docs', 'api', 'openapi.yaml'), 'utf8'),
) as Readonly<{
  'x-kora-operation-errors': Readonly<Record<string, readonly string[]>>;
}>;

interface AdminWriterPoolFixture {
  pool: PgPool;
}

interface BackendIdentity extends QueryResultRow {
  backendStart: Date;
  pid: number;
}

type TestClientQuery = <Row extends QueryResultRow = QueryResultRow>(
  text: string,
  values?: readonly unknown[],
) => Promise<QueryResult<Row>>;

function extractBrowserCookies(
  headers: Readonly<Record<string, string | readonly string[] | undefined>>,
): BrowserCookies {
  const raw = headers['set-cookie'];
  const lines = raw === undefined ? [] : typeof raw === 'string' ? [raw] : [...raw];
  const pairs = lines.map((line) => line.split(';', 1)[0] ?? '');
  const csrf = pairs.find((pair) => pair.startsWith('__Host-kora_admin_csrf='));
  if (pairs.length !== 2 || csrf === undefined) {
    throw new Error('Expected two separate secure Admin C1 cookies.');
  }
  return { cookie: pairs.join('; '), csrf: csrf.slice(csrf.indexOf('=') + 1) };
}

function deterministicUuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

class OperationFaultKeyProvider implements AdminKeyProvider {
  private failed: AdminKeyProviderOperation | undefined;
  private failAvailabilityAfter: number | undefined;
  private availabilityCalls = 0;
  private failedDigestAfter = 0;
  private failedDigestDomain: string | undefined;
  private matchedDigestCalls = 0;

  constructor(private readonly delegate: AdminKeyProvider) {}

  fail(operation: AdminKeyProviderOperation): void {
    this.failed = operation;
  }

  failAssertAvailableAfter(successfulCalls: number): void {
    this.failAvailabilityAfter = successfulCalls;
    this.availabilityCalls = 0;
  }

  failKeyedDigestDomain(domain: string, afterSuccessfulMatches = 0): void {
    this.failedDigestDomain = domain;
    this.failedDigestAfter = afterSuccessfulMatches;
    this.matchedDigestCalls = 0;
  }

  recover(): void {
    this.failed = undefined;
    this.failAvailabilityAfter = undefined;
    this.availabilityCalls = 0;
    this.failedDigestAfter = 0;
    this.failedDigestDomain = undefined;
    this.matchedDigestCalls = 0;
  }

  async assertAvailable(): Promise<void> {
    if (
      this.failAvailabilityAfter !== undefined &&
      this.availabilityCalls >= this.failAvailabilityAfter
    ) {
      throw new AdminKeyProviderUnavailableError();
    }
    this.availabilityCalls += 1;
    await this.delegate.assertAvailable();
  }

  async activeEnvelopeKeyId(): Promise<string> {
    return this.delegate.activeEnvelopeKeyId();
  }

  async activeSigningKeyId(): Promise<string> {
    return this.delegate.activeSigningKeyId();
  }

  async keyedDigest(domain: string, value: Uint8Array): Promise<Uint8Array> {
    if (this.failedDigestDomain === domain) {
      if (this.matchedDigestCalls >= this.failedDigestAfter)
        throw new AdminKeyProviderUnavailableError();
      this.matchedDigestCalls += 1;
    }
    this.reject('KEYED_DIGEST');
    return this.delegate.keyedDigest(domain, value);
  }

  async resolveJwtVerificationKey(keyId: string): Promise<KeyObject | undefined> {
    this.reject('RESOLVE_SIGNING_KEY');
    return this.delegate.resolveJwtVerificationKey(keyId);
  }

  async signRs256(signingInput: Uint8Array): Promise<AdminRs256Signature> {
    this.reject('SIGN_RS256');
    return this.delegate.signRs256(signingInput);
  }

  async unwrapDek(wrapped: WrappedAdminDek): Promise<Uint8Array> {
    this.reject('UNWRAP_DEK');
    return this.delegate.unwrapDek(wrapped);
  }

  async wrapDek(dek: Uint8Array): Promise<WrappedAdminDek> {
    this.reject('WRAP_DEK');
    return this.delegate.wrapDek(dek);
  }

  private reject(operation: AdminKeyProviderOperation): void {
    if (this.failed === operation) throw new AdminKeyProviderUnavailableError();
  }
}

realHttp('Admin C1 real HTTP/PostgreSQL/Redis journeys', { timeout: 300_000 }, () => {
  const origin = 'https://admin.kora.invalid';
  const password = 'correct-horse-battery-staple';
  const ids = {
    binding: deterministicUuid(111),
    concurrent: deterministicUuid(109),
    crossA: deterministicUuid(121),
    crossB: deterministicUuid(122),
    csrfFailure: deterministicUuid(120),
    doubleTotp: deterministicUuid(108),
    first: deterministicUuid(101),
    invalidAuthorization: deterministicUuid(114),
    invalidRevocation: deterministicUuid(115),
    invalidRole: deterministicUuid(113),
    invalidStatus: deterministicUuid(112),
    qrFailure: deterministicUuid(117),
    recovery: deterministicUuid(110),
    rotateEnvelope: deterministicUuid(119),
    totp: deterministicUuid(102),
    rotate: deterministicUuid(103),
    signatureFailure: deterministicUuid(116),
    sinkFailure: deterministicUuid(118),
    stepUp: deterministicUuid(104),
    target: deterministicUuid(105),
    invalidConfirm: deterministicUuid(123),
    invalidTotp: deterministicUuid(124),
    replayConcurrent: deterministicUuid(125),
    auditRotate: deterministicUuid(126),
    auditStepUp: deterministicUuid(127),
    revokeActor: deterministicUuid(128),
    revokeTarget: deterministicUuid(129),
    revokeSupport: deterministicUuid(130),
    digestFailure: deterministicUuid(131),
    commitUnknown: deterministicUuid(132),
    r4Current: deterministicUuid(133),
    r4EarlyActor: deterministicUuid(134),
    r4EarlyTarget: deterministicUuid(135),
    r4LateActor: deterministicUuid(136),
    r4LateTarget: deterministicUuid(137),
    r4RefreshCsrf: deterministicUuid(138),
    r4RefreshSignature: deterministicUuid(139),
    r4RefreshRotation: deterministicUuid(140),
    r4SinkCurrent: deterministicUuid(141),
    r4SinkActor: deterministicUuid(142),
    r4SinkTarget: deterministicUuid(143),
    r4SinkRefresh: deterministicUuid(144),
    r4CommitCurrent: deterministicUuid(145),
    r4CommitActor: deterministicUuid(146),
    r4CommitTarget: deterministicUuid(147),
    r4CommitRefresh: deterministicUuid(148),
    r5RecoveryCreate: deterministicUuid(149),
    r5RecoveryQr: deterministicUuid(150),
    r5RecoveryConfirm: deterministicUuid(151),
    r5RecoverySink: deterministicUuid(152),
    r5CommitCreate: deterministicUuid(153),
    r5CommitQr: deterministicUuid(154),
    r5CommitConfirm: deterministicUuid(155),
    r5List: deterministicUuid(156),
    r6Rollback: deterministicUuid(157),
    concurrentForward: deterministicUuid(158),
    concurrentReverse: deterministicUuid(159),
    r11Confirm: deterministicUuid(160),
    r11Totp: deterministicUuid(161),
    r11Recovery: deterministicUuid(162),
    r11Rotate: deterministicUuid(163),
    r11StepUp: deterministicUuid(164),
  } as const;
  const seeds = new Map<string, Uint8Array>();
  const keys = new TestEphemeralAdminKeyProvider();
  const faultKeys = new OperationFaultKeyProvider(keys);
  const crypto = new AdminAuthCrypto(keys);
  const accessTokens = new Map<string, string>();
  const r4Sessions = new Map<string, Readonly<{ refreshToken?: string; sessionId: string }>>();
  const recoveryMaterials = new Map<string, Readonly<{ selector: string; verifier: string }>>();
  const r11BusinessTables = [
    'AdminSession',
    'AdminRecoveryCode',
    'AdminPreAuthContext',
    'AdminTotpEnrollment',
    'AdminRecoveryContext',
    'AdminRefreshToken',
    'AdminRecoveryCodeBatch',
    'AdminIdempotencyRecord',
  ] as const;
  const owner = new Client({
    database: process.env.S1203C1_E2E_DATABASE,
    host: '127.0.0.1',
    password: process.env.S1203C1_E2E_OWNER_PASSWORD,
    port: Number(process.env.S1203C1_E2E_POSTGRES_PORT),
    user: process.env.S1203C1_E2E_OWNER_USER,
  });
  let application: INestApplication;
  let faultApplication: INestApplication;
  let rateLimitRedis: Redis;
  let runtimeEnvironment: Record<string, string | undefined>;

  async function insertUser(
    id: string,
    email: string,
    passwordHash: string,
    status: 'ACTIVE' | 'DISABLED' | 'PENDING_MFA' | 'SUSPENDED',
    withTotp: boolean,
    role: 'SUPER_ADMIN' | 'CONTENT_EDITOR' | 'FINANCE_MANAGER' | 'SUPPORT' = 'SUPER_ADMIN',
  ): Promise<void> {
    let encrypted: string | null = null;
    if (withTotp) {
      const seed = crypto.randomTotpSecret();
      seeds.set(id, seed);
      encrypted = await crypto.encryptTotpSecret(seed, id);
    }
    await owner.query(
      `INSERT INTO "AdminUser"
         ("id", "email", "passwordHash", "role", "status", "authorizationVersion",
          "totpSecretEncrypted", "totpEnabledAt", "lastAcceptedTotpCounter", "createdAt")
       VALUES ($1, $2, $3, $4, $5, 1, $6, $7, NULL, CURRENT_TIMESTAMP)`,
      [id, email, passwordHash, role, status, encrypted, withTotp ? new Date() : null],
    );
  }

  async function insertSession(
    adminUserId: string,
    sequence: number,
    role: 'SUPER_ADMIN' | 'CONTENT_EDITOR' | 'FINANCE_MANAGER' | 'SUPPORT' = 'SUPER_ADMIN',
    refreshToken = `fixture-refresh-${sequence}`,
    createdAt = new Date(),
  ): Promise<string> {
    const sessionId = deterministicUuid(1_000 + sequence);
    const now = createdAt;
    const accessToken = await crypto.issueAccessToken(
      {
        adminUserId,
        authorizationVersion: 1,
        role,
        sessionId,
      },
      Math.floor(now.getTime() / 1000),
    );
    const verified = await crypto.verifyAccessToken(accessToken, Math.floor(now.getTime() / 1000));
    await owner.query(
      `INSERT INTO "AdminSession"
         ("id", "adminUserId", "tokenFamilyId", "accessTokenJti", "refreshTokenHash",
          "refreshTokenVersion", "lastTwoFactorAt", "lastActivityAt", "expiresAt",
          "absoluteExpiresAt", "authorizationVersion", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 1, $6, $6, $7, $8, 1, $6, $6)`,
      [
        sessionId,
        adminUserId,
        deterministicUuid(2_000 + sequence),
        verified.tokenId,
        createHash('sha256').update(refreshToken).digest('hex'),
        now,
        new Date(now.getTime() + 8 * 60 * 60 * 1000),
        new Date(now.getTime() + 12 * 60 * 60 * 1000),
      ],
    );
    return accessToken;
  }

  async function insertR4Session(
    adminUserId: string,
    sequence: number,
    withRefreshToken = false,
  ): Promise<void> {
    const refreshToken = `r4-refresh-${sequence}`.padEnd(43, 'x');
    const accessToken = await insertSession(adminUserId, sequence, 'SUPER_ADMIN', refreshToken);
    const sessionId = deterministicUuid(1_000 + sequence);
    accessTokens.set(adminUserId, accessToken);
    r4Sessions.set(adminUserId, {
      ...(withRefreshToken ? { refreshToken } : {}),
      sessionId,
    });
    if (withRefreshToken) {
      const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');
      await owner.query(
        `INSERT INTO "AdminRefreshToken"
           ("id", "adminUserId", "adminSessionId", "previousTokenId", "tokenHash",
            "generation", "expiresAt", "consumedAt", "createdAt")
         VALUES ($1, $2, $3, NULL, $4, 1, $5, NULL, CURRENT_TIMESTAMP)`,
        [
          deterministicUuid(5_000 + sequence),
          adminUserId,
          sessionId,
          refreshTokenHash,
          new Date(Date.now() + 12 * 60 * 60 * 1000),
        ],
      );
    }
  }

  async function enableR4RevocationStepUp(adminUserId: string): Promise<void> {
    const fixture = r4Sessions.get(adminUserId);
    if (fixture === undefined) throw new Error('Missing R4 session fixture.');
    await owner.query(
      `UPDATE "AdminSession"
          SET "stepUpPurpose" = 'SESSION_REVOCATION',
              "stepUpVerifiedAt" = CURRENT_TIMESTAMP,
              "stepUpExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
        WHERE "id" = $1`,
      [fixture.sessionId],
    );
  }

  async function r4RefreshCookies(adminUserId: string): Promise<BrowserCookies> {
    const fixture = r4Sessions.get(adminUserId);
    if (fixture?.refreshToken === undefined) throw new Error('Missing R4 refresh fixture.');
    const csrf = await new AdminRequestPolicy({ keyProvider: keys, origin }).issueCsrfToken(
      'REFRESH',
      fixture.refreshToken,
    );
    return {
      cookie: `__Host-kora_admin_refresh=${fixture.refreshToken}; __Host-kora_admin_csrf=${csrf}`,
      csrf,
    };
  }

  async function expectR4FailureAudit(
    response: request.Response,
    expected: Readonly<{
      action: string;
      actorAdminUserId: string;
      adminSessionId: string;
      entityId: string;
      operatorReason: string | null;
      reasonCode: string;
      subjectAdminUserId: string | null;
    }>,
  ): Promise<void> {
    expect(response.status).toBe(503);
    expect(response.body.error).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      details: {},
      message: 'Service temporairement indisponible.',
      retryable: false,
    });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(
      /accessToken|refreshToken|selector|verifier/iu,
    );
    const requestId = String(response.body.requestId);
    const audit = await owner.query<{
      action: string;
      actorAdminUserId: string;
      adminSessionId: string;
      entityId: string;
      entityType: string;
      operatorReason: string | null;
      reasonCode: string;
      subjectAdminUserId: string | null;
    }>(
      `SELECT "action", "adminUserId" AS "actorAdminUserId", "adminSessionId",
              "entityId", "entityType", "operatorReason", "reasonCode"::text,
              "subjectAdminUserId"
         FROM "AuditLog" WHERE "requestId" = $1`,
      [requestId],
    );
    expect(audit.rows).toEqual([{ ...expected, entityType: 'AdminSession' }]);
    const security = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AdminSecurityEvent" WHERE "requestId" = $1`,
      [requestId],
    );
    expect(security.rows[0]!.count).toBe('0');
  }

  async function insertRecoveryCode(
    adminUserId: string,
    sequence: number,
  ): Promise<Readonly<{ selector: string; verifier: string }>> {
    const materials = crypto.generateRecoveryCodes();
    const hashes = await Promise.all(
      materials.map((material) => crypto.hashRecoveryCode(material)),
    );
    const batchId = deterministicUuid(3_000 + sequence);
    await owner.query('BEGIN');
    try {
      await owner.query(
        `INSERT INTO "AdminRecoveryCodeBatch" ("id", "adminUserId", "createdAt")
         VALUES ($1, $2, CURRENT_TIMESTAMP)`,
        [batchId, adminUserId],
      );
      for (const [index, material] of materials.entries()) {
        await owner.query(
          `INSERT INTO "AdminRecoveryCode"
             ("id", "adminUserId", "batchId", "selector", "codeHash", "createdAt")
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
          [
            deterministicUuid(4_000 + sequence * 10 + index),
            adminUserId,
            batchId,
            material.selector,
            hashes[index],
          ],
        );
      }
      await owner.query('COMMIT');
    } catch (error: unknown) {
      await owner.query('ROLLBACK');
      throw error;
    }
    return materials[0]!;
  }

  async function loginBrowser(
    server: Parameters<typeof request>[0],
    email: string,
  ): Promise<BrowserCookies> {
    const response = await request(server)
      .post('/api/v1/admin/auth/login')
      .set('Content-Type', 'application/json')
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ email, password });
    expect(response.status).toBe(200);
    return extractBrowserCookies(response.headers);
  }

  async function beginRecoveryJourney(
    adminUserId: string,
    email: string,
  ): Promise<Readonly<{ cookies: BrowserCookies; recoveryContextId: string }>> {
    const material = recoveryMaterials.get(adminUserId);
    if (material === undefined) throw new Error('Missing R5 recovery fixture material.');
    const loginCookies = await loginBrowser(application.getHttpServer(), email);
    const recovery = await request(application.getHttpServer())
      .post('/api/v1/admin/auth/recovery-codes/verify')
      .set('Content-Type', 'application/json')
      .set('Cookie', loginCookies.cookie)
      .set('Origin', origin)
      .set('X-Kora-Csrf', loginCookies.csrf)
      .send(material);
    expect(recovery.status).toBe(200);
    return {
      cookies: extractBrowserCookies(recovery.headers),
      recoveryContextId: String(recovery.body.data.recoveryContextId),
    };
  }

  async function expectR5RecoveryFailureAudit(
    response: request.Response,
    expected: Readonly<{
      action: string;
      actorAdminUserId: string;
      adminRecoveryContextId: string;
      entityId: string;
    }>,
  ): Promise<void> {
    expect(response.status).toBe(503);
    expect(response.body.error).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      details: {},
      message: 'Service temporairement indisponible.',
      retryable: false,
    });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(
      /accessToken|refreshToken|recoveryCodes|selector|verifier/iu,
    );
    const sinks = await owner.query<{
      action: string;
      actorAdminUserId: string;
      adminRecoveryContextId: string;
      auditCount: string;
      entityId: string;
      entityType: string;
      reasonCode: string;
      securityCount: string;
      subjectAdminUserId: string;
    }>(
      `SELECT min("action") AS "action", min("adminUserId") AS "actorAdminUserId",
              min("adminRecoveryContextId") AS "adminRecoveryContextId",
              count(*)::text AS "auditCount", min("entityId") AS "entityId",
              min("entityType") AS "entityType", min("reasonCode"::text) AS "reasonCode",
              min("subjectAdminUserId") AS "subjectAdminUserId",
              (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "requestId" = $1)
                AS "securityCount"
         FROM "AuditLog" WHERE "requestId" = $1`,
      [String(response.body.requestId)],
    );
    expect(sinks.rows[0]).toEqual({
      ...expected,
      auditCount: '1',
      entityType: 'AdminTotpEnrollment',
      reasonCode: 'ACCOUNT_RECOVERY',
      securityCount: '0',
      subjectAdminUserId: expected.actorAdminUserId,
    });
  }

  function cookieValue(cookies: BrowserCookies, name: string): string {
    const pair = cookies.cookie.split('; ').find((candidate) => candidate.startsWith(`${name}=`));
    if (pair === undefined) throw new Error(`Missing fixture cookie ${name}.`);
    return pair.slice(pair.indexOf('=') + 1);
  }

  function currentTotp(adminUserId: string, minimumExclusive?: bigint): string {
    const seed = seeds.get(adminUserId);
    if (seed === undefined) throw new Error('Missing fixture TOTP seed.');
    const wallCounter = BigInt(Math.floor(Date.now() / 30_000));
    const counter =
      minimumExclusive !== undefined && wallCounter <= minimumExclusive
        ? minimumExclusive + 1n
        : wallCounter;
    if (counter > wallCounter + 1n)
      throw new Error('Fixture TOTP counter left the accepted window.');
    return crypto.generateTotpCode(seed, counter);
  }

  async function stableTotpPair(adminUserId: string): Promise<
    Readonly<{
      counter: bigint;
      currentCode: string;
      nextCode: string;
    }>
  > {
    const periodMilliseconds = 30_000;
    const minimumRemainingMilliseconds = 10_000;
    const remaining = periodMilliseconds - (Date.now() % periodMilliseconds);
    if (remaining < minimumRemainingMilliseconds) {
      await new Promise<void>((resolve) => setTimeout(resolve, remaining + 25));
    }
    const counter = BigInt(Math.floor(Date.now() / periodMilliseconds));
    const seed = seeds.get(adminUserId);
    if (seed === undefined) throw new Error('Missing ordered fixture TOTP seed.');
    const currentCode = crypto.generateTotpCode(seed, counter);
    const nextCode = crypto.generateTotpCode(seed, counter + 1n);
    if (currentCode === nextCode) {
      throw new Error('Adjacent TOTP fixture counters produced an ambiguous code.');
    }
    return { counter, currentCode, nextCode };
  }

  function totpVerification(
    server: Parameters<typeof request>[0],
    cookies: BrowserCookies,
    code: string,
  ): request.Test {
    return request(server)
      .post('/api/v1/admin/auth/totp/verify')
      .set('Content-Type', 'application/json')
      .set('Cookie', cookies.cookie)
      .set('Origin', origin)
      .set('X-Kora-Csrf', cookies.csrf)
      .send({ code });
  }

  async function expectTotpOrderState(input: {
    adminUserId: string;
    counter: bigint;
    initialFamilyIds: readonly string[];
    outcomes: readonly Readonly<{
      cookies: BrowserCookies;
      response: request.Response;
      slot: 'n' | 'n+1';
    }>[];
  }): Promise<void> {
    const successful = input.outcomes.filter(({ response }) => response.status === 200);
    const rejected = input.outcomes.filter(({ response }) => response.status !== 200);

    for (const { response } of successful) {
      expect(response.status).toBe(200);
      expect(response.body.meta.requestId).toEqual(expect.any(String));
      expect(response.body.data.sessionId).toEqual(expect.any(String));
    }
    for (const { response } of rejected) {
      expect(response.status).toBe(400);
      expect(response.body.error).toEqual({
        code: 'OTP_INVALID',
        details: {},
        message: 'Code de vérification invalide.',
        retryable: false,
      });
      expect(response.body.requestId).toEqual(expect.any(String));
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toMatch(/accessToken|refreshToken|cookie|seed/iu);
    }

    const userState = await owner.query<{ lastAcceptedTotpCounter: string }>(
      `SELECT "lastAcceptedTotpCounter"::text AS "lastAcceptedTotpCounter"
         FROM "AdminUser" WHERE "id" = $1`,
      [input.adminUserId],
    );
    expect(userState.rows).toEqual([{ lastAcceptedTotpCounter: (input.counter + 1n).toString() }]);

    const preauthHashes = input.outcomes.map(({ cookies }) =>
      createHash('sha256').update(cookieValue(cookies, '__Host-kora_admin_preauth')).digest('hex'),
    );
    const preauthState = await owner.query<{ consumed: boolean; tokenHash: string }>(
      `SELECT "tokenHash", "consumedAt" IS NOT NULL AS consumed
         FROM "AdminPreAuthContext" WHERE "tokenHash" = ANY($1::text[])`,
      [preauthHashes],
    );
    const consumedByHash = new Map(
      preauthState.rows.map(({ consumed, tokenHash }) => [tokenHash, consumed]),
    );
    expect(consumedByHash.size).toBe(input.outcomes.length);
    for (const [index, { response }] of input.outcomes.entries()) {
      expect(consumedByHash.get(preauthHashes[index]!)).toBe(response.status === 200);
    }

    const familyState = await owner.query<{ active: boolean; id: string; revokedAt: Date | null }>(
      `SELECT "id", "revokedAt",
              ("revokedAt" IS NULL AND "expiresAt" > CURRENT_TIMESTAMP
               AND "absoluteExpiresAt" > CURRENT_TIMESTAMP) AS active
         FROM "AdminSession" WHERE "adminUserId" = $1`,
      [input.adminUserId],
    );
    const successfulSessionIds = successful.map(({ response }) =>
      String(response.body.data.sessionId),
    );
    const expectedActiveIds = [
      ...input.initialFamilyIds.slice(successful.length),
      ...successfulSessionIds,
    ].sort();
    expect(
      familyState.rows
        .filter(({ active }) => active)
        .map(({ id }) => id)
        .sort(),
    ).toEqual(expectedActiveIds);
    expect(
      familyState.rows
        .filter(({ revokedAt, id }) => revokedAt !== null && input.initialFamilyIds.includes(id))
        .map(({ id }) => id)
        .sort(),
    ).toEqual(input.initialFamilyIds.slice(0, successful.length).sort());
    expect(expectedActiveIds).toHaveLength(3);

    for (const { response } of successful) {
      const requestId = String(response.body.meta.requestId);
      const audit = await owner.query<{
        action: string;
        adminSessionId: string;
        entityId: string;
      }>(
        `SELECT "action", "adminSessionId", "entityId"
           FROM "AuditLog" WHERE "requestId" = $1`,
        [requestId],
      );
      expect(audit.rows).toEqual([
        {
          action: 'ADMIN_TOTP_VERIFIED',
          adminSessionId: String(response.body.data.sessionId),
          entityId: String(response.body.data.sessionId),
        },
      ]);
      const security = await owner.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM "AdminSecurityEvent" WHERE "requestId" = $1`,
        [requestId],
      );
      expect(security.rows[0]!.count).toBe('0');
    }

    for (const { response } of rejected) {
      const requestId = String(response.body.requestId);
      const audit = await owner.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM "AuditLog" WHERE "requestId" = $1`,
        [requestId],
      );
      expect(audit.rows[0]!.count).toBe('0');
      const security = await owner.query<{
        action: string;
        adminUserId: string;
        failureCode: string;
        outcome: string;
      }>(
        `SELECT "action", "adminUserId", "failureCode", "outcome"
           FROM "AdminSecurityEvent" WHERE "requestId" = $1`,
        [requestId],
      );
      expect(security.rows).toEqual([
        {
          action: 'ADMIN_TOTP_VERIFY',
          adminUserId: input.adminUserId,
          failureCode: 'OTP_INVALID',
          outcome: 'FAILED',
        },
      ]);
    }

    expect(BigInt(Math.floor(Date.now() / 30_000))).toBeLessThanOrEqual(input.counter + 1n);
  }

  function invalidTotp(adminUserId: string): string {
    const seed = seeds.get(adminUserId);
    if (seed === undefined) throw new Error('Missing fixture TOTP seed.');
    const counter = BigInt(Math.floor(Date.now() / 30_000));
    const accepted = new Set([
      crypto.generateTotpCode(seed, counter - 1n),
      crypto.generateTotpCode(seed, counter),
      crypto.generateTotpCode(seed, counter + 1n),
    ]);
    for (let candidate = 0; candidate <= 999_999; candidate += 1) {
      const code = String(candidate).padStart(6, '0');
      if (!accepted.has(code)) return code;
    }
    throw new Error('Could not generate an invalid TOTP fixture.');
  }

  async function r11BusinessStateSignature(adminUserId: string): Promise<string> {
    const sections: unknown[] = [];
    const user = await owner.query<{ row: string }>(
      `SELECT to_jsonb(entry)::text AS row FROM "AdminUser" AS entry WHERE "id" = $1`,
      [adminUserId],
    );
    sections.push(user.rows);
    for (const table of r11BusinessTables) {
      const state = await owner.query<{ row: string }>(
        `SELECT to_jsonb(entry)::text AS row FROM "${table}" AS entry
          WHERE "adminUserId" = $1 ORDER BY "id"`,
        [adminUserId],
      );
      sections.push(state.rows);
    }
    return createHash('sha256').update(JSON.stringify(sections), 'utf8').digest('hex');
  }

  async function expectR11ValidationFailure(
    response: request.Response,
    operationId: R11ValidationOperation,
    adminUserId: string,
    businessStateBefore: string,
  ): Promise<void> {
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        details: {},
        message: 'Requête invalide.',
        retryable: false,
      },
      requestId: expect.any(String),
    });
    expect(String(response.body.requestId).length).toBeGreaterThanOrEqual(8);
    expect(String(response.body.requestId).length).toBeLessThanOrEqual(128);
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(r11OpenApi['x-kora-operation-errors'][operationId]).toContain('VALIDATION_ERROR');
    await expect(r11BusinessStateSignature(adminUserId)).resolves.toBe(businessStateBefore);

    const sinks = await owner.query<{
      action: string | null;
      adminUserId: string | null;
      auditCount: string;
      failureCode: string | null;
      outcome: string | null;
      securityCount: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM "AuditLog" WHERE "requestId" = $1) AS "auditCount",
         (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "requestId" = $1)
           AS "securityCount",
         (SELECT "action" FROM "AdminSecurityEvent" WHERE "requestId" = $1 LIMIT 1)
           AS "action",
         (SELECT "adminUserId" FROM "AdminSecurityEvent" WHERE "requestId" = $1 LIMIT 1)
           AS "adminUserId",
         (SELECT "failureCode"::text FROM "AdminSecurityEvent" WHERE "requestId" = $1 LIMIT 1)
           AS "failureCode",
         (SELECT "outcome"::text FROM "AdminSecurityEvent" WHERE "requestId" = $1 LIMIT 1)
           AS "outcome"`,
      [String(response.body.requestId)],
    );
    expect(sinks.rows).toEqual([
      {
        action: 'ADMIN_AUTH_REQUEST_REJECTED',
        adminUserId: null,
        auditCount: '0',
        failureCode: 'VALIDATION_ERROR',
        outcome: 'FAILED',
        securityCount: '1',
      },
    ]);
  }

  beforeAll(async () => {
    const required = [
      'S1203C1_E2E_DATABASE',
      'S1203C1_E2E_OWNER_PASSWORD',
      'S1203C1_E2E_OWNER_USER',
      'S1203C1_E2E_POSTGRES_PORT',
      'S1203C1_E2E_READER_PASSWORD',
      'S1203C1_E2E_READER_USER',
      'S1203C1_E2E_REDIS_PORT',
      'S1203C1_E2E_WRITER_PASSWORD',
      'S1203C1_E2E_WRITER_USER',
    ];
    for (const name of required) {
      if (process.env[name] === undefined || process.env[name]?.length === 0) {
        throw new Error(`${name} is required for the isolated C1 HTTP harness.`);
      }
    }
    await owner.connect();
    const passwordHash = await crypto.hashPassword(password);
    await insertUser(ids.first, 'first@example.invalid', passwordHash, 'PENDING_MFA', false);
    await insertUser(ids.totp, 'totp@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(ids.rotate, 'rotate@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(ids.stepUp, 'stepup@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(ids.target, 'target@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(
      deterministicUuid(106),
      'disabled@example.invalid',
      passwordHash,
      'DISABLED',
      true,
    );
    await insertUser(
      deterministicUuid(107),
      'suspended@example.invalid',
      passwordHash,
      'SUSPENDED',
      true,
    );
    await insertUser(ids.doubleTotp, 'double-totp@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(ids.concurrent, 'concurrent@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(ids.recovery, 'recovery@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(ids.binding, 'binding@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(
      ids.invalidStatus,
      'invalid-status@example.invalid',
      passwordHash,
      'ACTIVE',
      true,
    );
    await insertUser(ids.invalidRole, 'invalid-role@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(
      ids.invalidAuthorization,
      'invalid-authorization@example.invalid',
      passwordHash,
      'ACTIVE',
      true,
    );
    await insertUser(
      ids.invalidRevocation,
      'invalid-revocation@example.invalid',
      passwordHash,
      'ACTIVE',
      true,
    );
    await insertUser(
      ids.signatureFailure,
      'signature-failure@example.invalid',
      passwordHash,
      'ACTIVE',
      true,
    );
    await insertUser(ids.sinkFailure, 'sink-failure@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(
      ids.qrFailure,
      'qr-failure@example.invalid',
      passwordHash,
      'PENDING_MFA',
      false,
    );
    await insertUser(
      ids.rotateEnvelope,
      'rotate-envelope@example.invalid',
      passwordHash,
      'ACTIVE',
      true,
    );
    await insertUser(ids.csrfFailure, 'csrf-failure@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(ids.crossA, 'cross-a@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(ids.crossB, 'cross-b@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(
      ids.invalidConfirm,
      'invalid-confirm@example.invalid',
      passwordHash,
      'PENDING_MFA',
      false,
    );
    await insertUser(ids.invalidTotp, 'invalid-totp@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(
      ids.replayConcurrent,
      'replay-concurrent@example.invalid',
      passwordHash,
      'PENDING_MFA',
      false,
    );
    await insertUser(ids.auditRotate, 'audit-rotate@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(ids.auditStepUp, 'audit-stepup@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(ids.revokeActor, 'revoke-actor@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(
      ids.revokeTarget,
      'revoke-target@example.invalid',
      passwordHash,
      'ACTIVE',
      true,
    );
    await insertUser(
      ids.revokeSupport,
      'revoke-support@example.invalid',
      passwordHash,
      'ACTIVE',
      true,
      'SUPPORT',
    );
    await insertUser(
      ids.digestFailure,
      'digest-failure@example.invalid',
      passwordHash,
      'PENDING_MFA',
      false,
    );
    await insertUser(
      ids.commitUnknown,
      'commit-unknown@example.invalid',
      passwordHash,
      'ACTIVE',
      true,
    );
    for (const [id, label] of [
      [ids.r4Current, 'current'],
      [ids.r4EarlyActor, 'early-actor'],
      [ids.r4EarlyTarget, 'early-target'],
      [ids.r4LateActor, 'late-actor'],
      [ids.r4LateTarget, 'late-target'],
      [ids.r4RefreshCsrf, 'refresh-csrf'],
      [ids.r4RefreshSignature, 'refresh-signature'],
      [ids.r4RefreshRotation, 'refresh-rotation'],
      [ids.r4SinkCurrent, 'sink-current'],
      [ids.r4SinkActor, 'sink-actor'],
      [ids.r4SinkTarget, 'sink-target'],
      [ids.r4SinkRefresh, 'sink-refresh'],
      [ids.r4CommitCurrent, 'commit-current'],
      [ids.r4CommitActor, 'commit-actor'],
      [ids.r4CommitTarget, 'commit-target'],
      [ids.r4CommitRefresh, 'commit-refresh'],
    ] as const) {
      await insertUser(id, `r4-${label}@example.invalid`, passwordHash, 'ACTIVE', true);
    }
    for (const [id, label] of [
      [ids.r5RecoveryCreate, 'recovery-create'],
      [ids.r5RecoveryQr, 'recovery-qr'],
      [ids.r5RecoveryConfirm, 'recovery-confirm'],
      [ids.r5RecoverySink, 'recovery-sink'],
      [ids.r5CommitCreate, 'commit-create'],
      [ids.r5CommitQr, 'commit-qr'],
      [ids.r5CommitConfirm, 'commit-confirm'],
      [ids.r5List, 'list'],
    ] as const) {
      await insertUser(id, `r5-${label}@example.invalid`, passwordHash, 'ACTIVE', true);
    }
    await insertUser(ids.r6Rollback, 'r6-rollback@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(
      ids.concurrentForward,
      'concurrent-forward@example.invalid',
      passwordHash,
      'ACTIVE',
      true,
    );
    await insertUser(
      ids.concurrentReverse,
      'concurrent-reverse@example.invalid',
      passwordHash,
      'ACTIVE',
      true,
    );
    await insertUser(
      ids.r11Confirm,
      'r11-confirm@example.invalid',
      passwordHash,
      'PENDING_MFA',
      false,
    );
    await insertUser(ids.r11Totp, 'r11-totp@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(ids.r11Recovery, 'r11-recovery@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(ids.r11Rotate, 'r11-rotate@example.invalid', passwordHash, 'ACTIVE', true);
    await insertUser(ids.r11StepUp, 'r11-step-up@example.invalid', passwordHash, 'ACTIVE', true);
    for (let index = 1; index <= 3; index += 1) await insertSession(ids.totp, index);
    for (const [adminUserId, firstSequence] of [
      [ids.concurrent, 20],
      [ids.concurrentForward, 65],
      [ids.concurrentReverse, 68],
    ] as const) {
      const baseline = Date.now() - 60_000;
      for (let offset = 0; offset < 3; offset += 1) {
        const sequence = firstSequence + offset;
        await insertSession(
          adminUserId,
          sequence,
          'SUPER_ADMIN',
          `fixture-refresh-${sequence}`,
          new Date(baseline + offset * 1_000),
        );
      }
    }
    const rotateToken = await insertSession(ids.rotate, 10);
    const stepUpToken = await insertSession(ids.stepUp, 11);
    const targetToken = await insertSession(ids.target, 12);
    accessTokens.set(ids.invalidStatus, await insertSession(ids.invalidStatus, 30));
    accessTokens.set(ids.invalidRole, await insertSession(ids.invalidRole, 31));
    accessTokens.set(ids.invalidAuthorization, await insertSession(ids.invalidAuthorization, 32));
    accessTokens.set(ids.invalidRevocation, await insertSession(ids.invalidRevocation, 33));
    accessTokens.set(ids.sinkFailure, await insertSession(ids.sinkFailure, 34));
    accessTokens.set(ids.crossA, await insertSession(ids.crossA, 40));
    accessTokens.set(ids.crossB, await insertSession(ids.crossB, 41));
    accessTokens.set(ids.auditRotate, await insertSession(ids.auditRotate, 42));
    accessTokens.set(ids.auditStepUp, await insertSession(ids.auditStepUp, 43));
    accessTokens.set(ids.revokeActor, await insertSession(ids.revokeActor, 44));
    accessTokens.set(ids.revokeTarget, await insertSession(ids.revokeTarget, 45));
    accessTokens.set(ids.revokeSupport, await insertSession(ids.revokeSupport, 46, 'SUPPORT'));
    accessTokens.set(ids.commitUnknown, await insertSession(ids.commitUnknown, 47));
    await insertR4Session(ids.r4Current, 48);
    await insertR4Session(ids.r4EarlyActor, 49);
    await insertR4Session(ids.r4EarlyTarget, 50);
    await insertR4Session(ids.r4LateActor, 51);
    await insertR4Session(ids.r4LateTarget, 52);
    await insertR4Session(ids.r4RefreshCsrf, 53, true);
    await insertR4Session(ids.r4RefreshSignature, 54, true);
    await insertR4Session(ids.r4RefreshRotation, 55, true);
    await insertR4Session(ids.r4SinkCurrent, 56);
    await insertR4Session(ids.r4SinkActor, 57);
    await insertR4Session(ids.r4SinkTarget, 58);
    await insertR4Session(ids.r4SinkRefresh, 59, true);
    await insertR4Session(ids.r4CommitCurrent, 60);
    await insertR4Session(ids.r4CommitActor, 61);
    await insertR4Session(ids.r4CommitTarget, 62);
    await insertR4Session(ids.r4CommitRefresh, 63, true);
    accessTokens.set(ids.r5List, await insertSession(ids.r5List, 64));
    for (const actor of [ids.r4EarlyActor, ids.r4LateActor, ids.r4SinkActor, ids.r4CommitActor]) {
      await enableR4RevocationStepUp(actor);
    }
    recoveryMaterials.set(ids.recovery, await insertRecoveryCode(ids.recovery, 1));
    recoveryMaterials.set(ids.binding, await insertRecoveryCode(ids.binding, 2));
    for (const [index, adminUserId] of [
      ids.r5RecoveryCreate,
      ids.r5RecoveryQr,
      ids.r5RecoveryConfirm,
      ids.r5RecoverySink,
      ids.r5CommitCreate,
      ids.r5CommitQr,
      ids.r5CommitConfirm,
    ].entries()) {
      recoveryMaterials.set(adminUserId, await insertRecoveryCode(adminUserId, index + 3));
    }
    recoveryMaterials.set(ids.r6Rollback, await insertRecoveryCode(ids.r6Rollback, 10));
    recoveryMaterials.set(ids.r11Recovery, await insertRecoveryCode(ids.r11Recovery, 11));
    accessTokens.set(ids.r11Rotate, await insertSession(ids.r11Rotate, 71));
    accessTokens.set(ids.r11StepUp, await insertSession(ids.r11StepUp, 72));
    process.env.S1203C1_ROTATE_TOKEN = rotateToken;
    process.env.S1203C1_STEP_UP_TOKEN = stepUpToken;
    process.env.S1203C1_TARGET_TOKEN = targetToken;

    runtimeEnvironment = {
      ADMIN_DATABASE_HOST: '127.0.0.1',
      ADMIN_DATABASE_NAME: process.env.S1203C1_E2E_DATABASE,
      ADMIN_DATABASE_PASSWORD: process.env.S1203C1_E2E_WRITER_PASSWORD,
      ADMIN_DATABASE_PORT: process.env.S1203C1_E2E_POSTGRES_PORT,
      ADMIN_DATABASE_SSL: 'false',
      ADMIN_DATABASE_USER: process.env.S1203C1_E2E_WRITER_USER,
      ADMIN_ORIGIN: origin,
      ADMIN_REDIS_HOST: '127.0.0.1',
      ADMIN_REDIS_PORT: process.env.S1203C1_E2E_REDIS_PORT,
      ADMIN_REDIS_TLS: 'false',
      ADMIN_REDIS_WAIT_AOF_TIMEOUT_MS: '5000',
      API_HOST: '127.0.0.1',
      API_PORT: '3001',
      DATABASE_HOST: '127.0.0.1',
      DATABASE_NAME: process.env.S1203C1_E2E_DATABASE,
      DATABASE_PASSWORD: process.env.S1203C1_E2E_READER_PASSWORD,
      DATABASE_PORT: process.env.S1203C1_E2E_POSTGRES_PORT,
      DATABASE_SSL: 'false',
      DATABASE_USER: process.env.S1203C1_E2E_READER_USER,
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
      READINESS_TIMEOUT_MS: '5000',
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: process.env.S1203C1_E2E_REDIS_PORT,
      REDIS_TLS: 'false',
    };
    application = await createApplication({
      adminKeyProvider: keys,
      environment: runtimeEnvironment,
    });
    faultApplication = await createApplication({
      adminKeyProvider: faultKeys,
      environment: runtimeEnvironment,
    });
    rateLimitRedis = new Redis({
      enableOfflineQueue: false,
      host: '127.0.0.1',
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      port: Number(process.env.S1203C1_E2E_REDIS_PORT),
      retryStrategy: () => null,
    });
    await rateLimitRedis.connect();
  }, 300_000);

  beforeEach(async () => {
    await rateLimitRedis.flushdb();
    faultKeys.recover();
    keys.recover();
  }, 300_000);

  afterAll(async () => {
    rateLimitRedis?.disconnect(false);
    await faultApplication?.close();
    await application?.close();
    await owner.end();
    for (const seed of seeds.values()) seed.fill(0);
    delete process.env.S1203C1_ROTATE_TOKEN;
    delete process.env.S1203C1_STEP_UP_TOKEN;
    delete process.env.S1203C1_TARGET_TOKEN;
  }, 300_000);

  it('executes all twelve C1 operations with real dependencies and durable security state', async () => {
    const server = application.getHttpServer();
    const loginFirst = await request(server)
      .post('/api/v1/admin/auth/login')
      .set('Content-Type', 'application/json')
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ email: 'first@example.invalid', password });
    expect(loginFirst.status).toBe(200);
    expect(loginFirst.body.data.nextStep).toBe('FIRST_TOTP_ENROLLMENT');
    let firstCookies = extractBrowserCookies(loginFirst.headers);

    const enrollment = await request(server)
      .post('/api/v1/admin/auth/totp/enrollments')
      .set('Cookie', firstCookies.cookie)
      .set('Idempotency-Key', 'enrollment-first-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', firstCookies.csrf);
    expect(enrollment.status).toBe(201);
    const enrollmentId = enrollment.body.data.enrollmentId as string;
    const enrollmentReplay = await request(server)
      .post('/api/v1/admin/auth/totp/enrollments')
      .set('Cookie', firstCookies.cookie)
      .set('Idempotency-Key', 'enrollment-first-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', firstCookies.csrf);
    expect(enrollmentReplay.status).toBe(201);
    expect(enrollmentReplay.body.data.enrollmentId).toBe(enrollmentId);

    const qr = await request(server)
      .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/qr`)
      .set('Cookie', firstCookies.cookie)
      .set('Idempotency-Key', 'enrollment-qr-first-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', firstCookies.csrf);
    expect(qr.status).toBe(200);
    expect(qr.headers['content-type']).toMatch(/^image\/png/u);
    const qrReplay = await request(server)
      .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/qr`)
      .set('Cookie', firstCookies.cookie)
      .set('Idempotency-Key', 'enrollment-qr-first-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', firstCookies.csrf);
    expect(qrReplay.status).toBe(409);
    expect(qrReplay.headers['content-type']).not.toMatch(/^image\/png/u);

    const enrollmentSecret = await owner.query<{ secretEncrypted: string }>(
      `SELECT "secretEncrypted" FROM "AdminTotpEnrollment" WHERE "id" = $1`,
      [enrollmentId],
    );
    const decryptedFirst = await crypto.decryptTotpSecret(
      enrollmentSecret.rows[0]!.secretEncrypted,
      ids.first,
    );
    seeds.set(ids.first, decryptedFirst.secret);
    const initialCounter = BigInt(Math.floor(Date.now() / 30_000));
    const initialCode = crypto.generateTotpCode(decryptedFirst.secret, initialCounter);
    const confirmation = await request(server)
      .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/confirm`)
      .set('Content-Type', 'application/json')
      .set('Cookie', firstCookies.cookie)
      .set('Idempotency-Key', 'enrollment-confirm-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', firstCookies.csrf)
      .send({ code: initialCode });
    expect(confirmation.status).toBe(200);
    expect(confirmation.body.data.recoveryCodes.codes).toHaveLength(10);
    const firstRecovery = confirmation.body.data.recoveryCodes.codes[0] as {
      selector: string;
      verifier: string;
    };
    const confirmationStateBeforeReplay = await owner.query<{
      batchCount: string;
      codeCount: string;
      idempotencyCount: string;
      sessionCount: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM "AdminRecoveryCodeBatch" WHERE "adminUserId" = $1)
           AS "batchCount",
         (SELECT count(*)::text FROM "AdminRecoveryCode" WHERE "adminUserId" = $1)
           AS "codeCount",
         (SELECT count(*)::text FROM "AdminIdempotencyRecord"
           WHERE "adminUserId" = $1 AND "operation" = 'confirmAdminTotpEnrollment')
           AS "idempotencyCount",
         (SELECT count(*)::text FROM "AdminSession" WHERE "adminUserId" = $1)
           AS "sessionCount"`,
      [ids.first],
    );
    const confirmationReplay = await request(server)
      .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/confirm`)
      .set('Content-Type', 'application/json')
      .set('Cookie', firstCookies.cookie)
      .set('Idempotency-Key', 'enrollment-confirm-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', firstCookies.csrf)
      .send({ code: initialCode });
    expect(confirmationReplay.status).toBe(409);
    expect(confirmationReplay.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(confirmationReplay.body.data?.recoveryCodes).toBeUndefined();
    expect(confirmationReplay.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(confirmationReplay.body)).not.toMatch(
      /accessToken|refreshToken|selector|verifier/iu,
    );

    const confirmationStateAfterReplay = await owner.query<{
      batchCount: string;
      codeCount: string;
      idempotencyCount: string;
      sessionCount: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM "AdminRecoveryCodeBatch" WHERE "adminUserId" = $1)
           AS "batchCount",
         (SELECT count(*)::text FROM "AdminRecoveryCode" WHERE "adminUserId" = $1)
           AS "codeCount",
         (SELECT count(*)::text FROM "AdminIdempotencyRecord"
           WHERE "adminUserId" = $1 AND "operation" = 'confirmAdminTotpEnrollment')
           AS "idempotencyCount",
         (SELECT count(*)::text FROM "AdminSession" WHERE "adminUserId" = $1)
           AS "sessionCount"`,
      [ids.first],
    );
    expect(confirmationStateAfterReplay.rows[0]).toEqual(confirmationStateBeforeReplay.rows[0]);

    const loginTotp = await request(server)
      .post('/api/v1/admin/auth/login')
      .set('Content-Type', 'application/json')
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ email: 'totp@example.invalid', password });
    expect(loginTotp.status).toBe(200);
    expect(loginTotp.body.data.nextStep).toBe('TOTP_VERIFY');
    const totpCookies = extractBrowserCookies(loginTotp.headers);
    const verifiedTotp = await request(server)
      .post('/api/v1/admin/auth/totp/verify')
      .set('Content-Type', 'application/json')
      .set('Cookie', totpCookies.cookie)
      .set('Origin', origin)
      .set('X-Kora-Csrf', totpCookies.csrf)
      .send({ code: currentTotp(ids.totp) });
    expect(verifiedTotp.status).toBe(200);
    const refreshCookies = extractBrowserCookies(verifiedTotp.headers);
    const activeFamilies = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AdminSession"
        WHERE "adminUserId" = $1 AND "revokedAt" IS NULL`,
      [ids.totp],
    );
    expect(Number(activeFamilies.rows[0]!.count)).toBeLessThanOrEqual(3);

    const refreshRequest = (): request.Test =>
      request(server)
        .post('/api/v1/admin/auth/sessions/refresh')
        .set('Cookie', refreshCookies.cookie)
        .set('Origin', origin)
        .set('X-Kora-Csrf', refreshCookies.csrf);
    const refreshRace = await Promise.all([refreshRequest(), refreshRequest()]);
    expect(refreshRace.map(({ status }) => status).sort()).toEqual([200, 401]);
    const refreshWinner = refreshRace.find(({ status }) => status === 200)!;
    const invalidatedWinner = await request(server)
      .get('/api/v1/admin/auth/sessions')
      .set('Authorization', `Bearer ${String(refreshWinner.body.data.accessToken)}`);
    expect(invalidatedWinner.status).toBe(401);

    const rotate = await request(server)
      .post('/api/v1/admin/auth/recovery-codes/rotate')
      .set('Authorization', `Bearer ${process.env.S1203C1_ROTATE_TOKEN}`)
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', 'recovery-rotate-0001')
      .set('Origin', origin)
      .send({ code: currentTotp(ids.rotate) });
    expect(rotate.status).toBe(200);
    expect(rotate.body.data.codes).toHaveLength(10);
    const rotateReplay = await request(server)
      .post('/api/v1/admin/auth/recovery-codes/rotate')
      .set('Authorization', `Bearer ${process.env.S1203C1_ROTATE_TOKEN}`)
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', 'recovery-rotate-0001')
      .set('Origin', origin)
      .send({ code: currentTotp(ids.rotate) });
    expect(rotateReplay.status).toBe(409);
    expect(rotateReplay.body.data?.codes).toBeUndefined();

    await rateLimitRedis.flushdb();
    const stepUp = await request(server)
      .post('/api/v1/admin/auth/step-up')
      .set('Authorization', `Bearer ${process.env.S1203C1_STEP_UP_TOKEN}`)
      .set('Content-Type', 'application/json')
      .set('Origin', origin)
      .send({
        purpose: 'SESSION_REVOCATION',
        totpCode: currentTotp(ids.stepUp),
      });
    expect(stepUp.status).toBe(200);
    const listed = await request(server)
      .get('/api/v1/admin/auth/sessions')
      .set('Authorization', `Bearer ${process.env.S1203C1_STEP_UP_TOKEN}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
    const targetClaims = await crypto.verifyAccessToken(
      process.env.S1203C1_TARGET_TOKEN!,
      Math.floor(Date.now() / 1000),
    );
    const revokedOther = await request(server)
      .post(`/api/v1/admin/auth/sessions/${targetClaims.sessionId}/revocations`)
      .set('Authorization', `Bearer ${process.env.S1203C1_STEP_UP_TOKEN}`)
      .set('Content-Type', 'application/json')
      .set('Origin', origin)
      .send({
        operatorReason: 'Compromission confirmee',
        reasonCode: 'SECURITY_RESPONSE',
      });
    expect(revokedOther.status).toBe(204);
    const targetState = await owner.query<{ revokedAt: Date | null }>(
      `SELECT "revokedAt" FROM "AdminSession" WHERE "id" = $1`,
      [targetClaims.sessionId],
    );
    expect(targetState.rows[0]!.revokedAt).not.toBeNull();

    const loginRecovery = await request(server)
      .post('/api/v1/admin/auth/login')
      .set('Content-Type', 'application/json')
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'same-origin')
      .send({ email: 'first@example.invalid', password });
    expect(loginRecovery.status).toBe(200);
    const recoveryLoginCookies = extractBrowserCookies(loginRecovery.headers);
    const recovery = await request(server)
      .post('/api/v1/admin/auth/recovery-codes/verify')
      .set('Content-Type', 'application/json')
      .set('Cookie', recoveryLoginCookies.cookie)
      .set('Origin', origin)
      .set('X-Kora-Csrf', recoveryLoginCookies.csrf)
      .send(firstRecovery);
    expect(recovery.status).toBe(200);
    firstCookies = extractBrowserCookies(recovery.headers);
    const recoveryEnrollment = await request(server)
      .post('/api/v1/admin/auth/totp/enrollments')
      .set('Cookie', firstCookies.cookie)
      .set('Idempotency-Key', 'recovery-enrollment-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', firstCookies.csrf);
    expect(recoveryEnrollment.status).toBe(201);
    const recoveryEnrollmentId = recoveryEnrollment.body.data.enrollmentId as string;
    const recoveryQr = await request(server)
      .post(`/api/v1/admin/auth/totp/enrollments/${recoveryEnrollmentId}/qr`)
      .set('Cookie', firstCookies.cookie)
      .set('Idempotency-Key', 'recovery-qr-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', firstCookies.csrf);
    expect(recoveryQr.status).toBe(200);
    const replacement = await owner.query<{ secretEncrypted: string }>(
      `SELECT "secretEncrypted" FROM "AdminTotpEnrollment" WHERE "id" = $1`,
      [recoveryEnrollmentId],
    );
    const replacementSecret = await crypto.decryptTotpSecret(
      replacement.rows[0]!.secretEncrypted,
      ids.first,
    );
    const recoveryConfirmation = await request(server)
      .post(`/api/v1/admin/auth/totp/enrollments/${recoveryEnrollmentId}/confirm`)
      .set('Content-Type', 'application/json')
      .set('Cookie', firstCookies.cookie)
      .set('Idempotency-Key', 'recovery-confirm-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', firstCookies.csrf)
      .send({
        code: crypto.generateTotpCode(
          replacementSecret.secret,
          BigInt(Math.floor(Date.now() / 30_000)) <= initialCounter
            ? initialCounter + 1n
            : BigInt(Math.floor(Date.now() / 30_000)),
        ),
      });
    replacementSecret.secret.fill(0);
    expect(recoveryConfirmation.status).toBe(200);

    const revokedCurrent = await request(server)
      .delete('/api/v1/admin/auth/sessions/current')
      .set('Authorization', `Bearer ${process.env.S1203C1_STEP_UP_TOKEN}`)
      .set('Origin', origin);
    expect(revokedCurrent.status).toBe(204);
  });

  it('contracts structural validation for confirmAdminTotpEnrollment without business mutation', async () => {
    const server = application.getHttpServer();
    const cookies = await loginBrowser(server, 'r11-confirm@example.invalid');
    const enrollment = await request(server)
      .post('/api/v1/admin/auth/totp/enrollments')
      .set('Cookie', cookies.cookie)
      .set('Idempotency-Key', 'r11-confirm-enrollment-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', cookies.csrf);
    expect(enrollment.status).toBe(201);
    const enrollmentId = String(enrollment.body.data.enrollmentId);
    await request(server)
      .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/qr`)
      .set('Cookie', cookies.cookie)
      .set('Idempotency-Key', 'r11-confirm-qr-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', cookies.csrf)
      .expect(200);
    const stored = await owner.query<{ secretEncrypted: string }>(
      `SELECT "secretEncrypted" FROM "AdminTotpEnrollment" WHERE "id" = $1`,
      [enrollmentId],
    );
    const decrypted = await crypto.decryptTotpSecret(
      stored.rows[0]!.secretEncrypted,
      ids.r11Confirm,
    );
    let code: string;
    try {
      code = crypto.generateTotpCode(decrypted.secret, BigInt(Math.floor(Date.now() / 30_000)));
    } finally {
      decrypted.secret.fill(0);
    }
    const businessStateBefore = await r11BusinessStateSignature(ids.r11Confirm);

    const response = await request(server)
      .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/confirm`)
      .set('Content-Type', 'application/json')
      .set('Cookie', cookies.cookie)
      .set('Idempotency-Key', 'r11-confirm-invalid-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', cookies.csrf)
      .send({ code, unexpected: true });

    await expectR11ValidationFailure(
      response,
      'confirmAdminTotpEnrollment',
      ids.r11Confirm,
      businessStateBefore,
    );
  });

  it('contracts structural validation for verifyAdminTotp without business mutation', async () => {
    const server = application.getHttpServer();
    const cookies = await loginBrowser(server, 'r11-totp@example.invalid');
    const businessStateBefore = await r11BusinessStateSignature(ids.r11Totp);

    const response = await request(server)
      .post('/api/v1/admin/auth/totp/verify')
      .set('Content-Type', 'application/json')
      .set('Cookie', cookies.cookie)
      .set('Origin', origin)
      .set('X-Kora-Csrf', cookies.csrf)
      .send({ code: currentTotp(ids.r11Totp), unexpected: true });

    await expectR11ValidationFailure(response, 'verifyAdminTotp', ids.r11Totp, businessStateBefore);
  });

  it('contracts structural validation for verifyAdminRecoveryCode without business mutation', async () => {
    const server = application.getHttpServer();
    const cookies = await loginBrowser(server, 'r11-recovery@example.invalid');
    const material = recoveryMaterials.get(ids.r11Recovery);
    if (material === undefined) throw new Error('Missing R11 recovery-code fixture.');
    const businessStateBefore = await r11BusinessStateSignature(ids.r11Recovery);

    const response = await request(server)
      .post('/api/v1/admin/auth/recovery-codes/verify')
      .set('Content-Type', 'application/json')
      .set('Cookie', cookies.cookie)
      .set('Origin', origin)
      .set('X-Kora-Csrf', cookies.csrf)
      .send({ ...material, unexpected: true });

    await expectR11ValidationFailure(
      response,
      'verifyAdminRecoveryCode',
      ids.r11Recovery,
      businessStateBefore,
    );
  });

  it('contracts structural validation for rotateAdminRecoveryCodes without business mutation', async () => {
    const server = application.getHttpServer();
    const businessStateBefore = await r11BusinessStateSignature(ids.r11Rotate);

    const response = await request(server)
      .post('/api/v1/admin/auth/recovery-codes/rotate')
      .set('Authorization', `Bearer ${accessTokens.get(ids.r11Rotate)}`)
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', 'r11-rotate-invalid-0001')
      .set('Origin', origin)
      .send({ code: currentTotp(ids.r11Rotate), unexpected: true });

    await expectR11ValidationFailure(
      response,
      'rotateAdminRecoveryCodes',
      ids.r11Rotate,
      businessStateBefore,
    );
  });

  it('contracts structural validation for stepUpAdminSession without business mutation', async () => {
    const server = application.getHttpServer();
    const businessStateBefore = await r11BusinessStateSignature(ids.r11StepUp);

    const response = await request(server)
      .post('/api/v1/admin/auth/step-up')
      .set('Authorization', `Bearer ${accessTokens.get(ids.r11StepUp)}`)
      .set('Content-Type', 'application/json')
      .set('Origin', origin)
      .send({
        purpose: 'SESSION_REVOCATION',
        totpCode: currentTotp(ids.r11StepUp),
        unexpected: true,
      });

    await expectR11ValidationFailure(
      response,
      'stepUpAdminSession',
      ids.r11StepUp,
      businessStateBefore,
    );
  });

  it('returns one success and one secret-free 409 for concurrent enrollment confirmation', async () => {
    const server = application.getHttpServer();
    const cookies = await loginBrowser(server, 'replay-concurrent@example.invalid');
    const enrollment = await request(server)
      .post('/api/v1/admin/auth/totp/enrollments')
      .set('Cookie', cookies.cookie)
      .set('Idempotency-Key', 'replay-concurrent-enrollment-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', cookies.csrf);
    expect(enrollment.status).toBe(201);
    const enrollmentId = String(enrollment.body.data.enrollmentId);
    await request(server)
      .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/qr`)
      .set('Cookie', cookies.cookie)
      .set('Idempotency-Key', 'replay-concurrent-qr-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', cookies.csrf)
      .expect(200);
    const stored = await owner.query<{ secretEncrypted: string }>(
      `SELECT "secretEncrypted" FROM "AdminTotpEnrollment" WHERE "id" = $1`,
      [enrollmentId],
    );
    const decrypted = await crypto.decryptTotpSecret(
      stored.rows[0]!.secretEncrypted,
      ids.replayConcurrent,
    );
    const code = crypto.generateTotpCode(decrypted.secret, BigInt(Math.floor(Date.now() / 30_000)));
    decrypted.secret.fill(0);
    const confirm = (): request.Test =>
      request(server)
        .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/confirm`)
        .set('Content-Type', 'application/json')
        .set('Cookie', cookies.cookie)
        .set('Idempotency-Key', 'replay-concurrent-confirm-0001')
        .set('Origin', origin)
        .set('X-Kora-Csrf', cookies.csrf)
        .send({ code });

    const responses = await Promise.all([confirm(), confirm()]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const replay = responses.find(({ status }) => status === 409)!;
    expect(replay.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(replay.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(replay.body)).not.toMatch(
      /accessToken|refreshToken|recoveryCodes|selector|verifier/iu,
    );

    const otherKey = await request(server)
      .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/confirm`)
      .set('Content-Type', 'application/json')
      .set('Cookie', cookies.cookie)
      .set('Idempotency-Key', 'replay-concurrent-other-key-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', cookies.csrf)
      .send({ code });
    expect(otherKey.status).toBe(401);
    expect(otherKey.body.error.code).toBe('AUTH_REQUIRED');

    const divergentPayload = await request(server)
      .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/confirm`)
      .set('Content-Type', 'application/json')
      .set('Cookie', cookies.cookie)
      .set('Idempotency-Key', 'replay-concurrent-confirm-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', cookies.csrf)
      .send({ code: code === '999999' ? '000000' : '999999' });
    expect(divergentPayload.status).toBe(409);
    expect(divergentPayload.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(divergentPayload.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(divergentPayload.body)).not.toMatch(
      /accessToken|refreshToken|recoveryCodes|selector|verifier/iu,
    );

    const otherUserCookies = await loginBrowser(server, 'qr-failure@example.invalid');
    const otherUserContext = await request(server)
      .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/confirm`)
      .set('Content-Type', 'application/json')
      .set('Cookie', otherUserCookies.cookie)
      .set('Idempotency-Key', 'replay-concurrent-confirm-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', otherUserCookies.csrf)
      .send({ code });
    expect(otherUserContext.status).toBe(403);
    expect(otherUserContext.body.error.code).toBe('FORBIDDEN');
    expect(otherUserContext.headers['set-cookie']).toBeUndefined();

    const state = await owner.query<{
      auditCount: string;
      batchCount: string;
      codeCount: string;
      idempotencyCount: string;
      sessionCount: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM "AuditLog"
           WHERE "adminUserId" = $1 AND "action" = 'ADMIN_TOTP_ENROLLMENT_CONFIRMED')
           AS "auditCount",
         (SELECT count(*)::text FROM "AdminRecoveryCodeBatch" WHERE "adminUserId" = $1)
           AS "batchCount",
         (SELECT count(*)::text FROM "AdminRecoveryCode" WHERE "adminUserId" = $1)
           AS "codeCount",
         (SELECT count(*)::text FROM "AdminIdempotencyRecord"
           WHERE "adminUserId" = $1 AND "operation" = 'confirmAdminTotpEnrollment')
           AS "idempotencyCount",
         (SELECT count(*)::text FROM "AdminSession" WHERE "adminUserId" = $1)
           AS "sessionCount"`,
      [ids.replayConcurrent],
    );
    expect(state.rows[0]).toEqual({
      auditCount: '1',
      batchCount: '1',
      codeCount: '10',
      idempotencyCount: '1',
      sessionCount: '1',
    });
  });

  it('returns exact 400 contract statuses for every invalid TOTP and recovery surface', async () => {
    const server = application.getHttpServer();
    const enrollmentCookies = await loginBrowser(server, 'invalid-confirm@example.invalid');
    const enrollment = await request(server)
      .post('/api/v1/admin/auth/totp/enrollments')
      .set('Cookie', enrollmentCookies.cookie)
      .set('Idempotency-Key', 'invalid-confirm-enrollment-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', enrollmentCookies.csrf);
    expect(enrollment.status).toBe(201);
    const enrollmentId = String(enrollment.body.data.enrollmentId);
    await request(server)
      .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/qr`)
      .set('Cookie', enrollmentCookies.cookie)
      .set('Idempotency-Key', 'invalid-confirm-qr-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', enrollmentCookies.csrf)
      .expect(200);
    const enrollmentSecret = await owner.query<{ secretEncrypted: string }>(
      `SELECT "secretEncrypted" FROM "AdminTotpEnrollment" WHERE "id" = $1`,
      [enrollmentId],
    );
    const decrypted = await crypto.decryptTotpSecret(
      enrollmentSecret.rows[0]!.secretEncrypted,
      ids.invalidConfirm,
    );
    const counter = BigInt(Math.floor(Date.now() / 30_000));
    const accepted = new Set([
      crypto.generateTotpCode(decrypted.secret, counter - 1n),
      crypto.generateTotpCode(decrypted.secret, counter),
      crypto.generateTotpCode(decrypted.secret, counter + 1n),
    ]);
    let invalidEnrollmentCode: string | undefined;
    for (let candidate = 0; candidate <= 999_999; candidate += 1) {
      const code = String(candidate).padStart(6, '0');
      if (!accepted.has(code)) {
        invalidEnrollmentCode = code;
        break;
      }
    }
    decrypted.secret.fill(0);
    if (invalidEnrollmentCode === undefined) throw new Error('Missing invalid enrollment code.');
    const invalidConfirmation = await request(server)
      .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/confirm`)
      .set('Content-Type', 'application/json')
      .set('Cookie', enrollmentCookies.cookie)
      .set('Idempotency-Key', 'invalid-confirm-confirm-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', enrollmentCookies.csrf)
      .send({ code: invalidEnrollmentCode });
    expect(invalidConfirmation.status).toBe(400);
    expect(invalidConfirmation.body.error.code).toBe('OTP_INVALID');

    const totpCookies = await loginBrowser(server, 'invalid-totp@example.invalid');
    const invalidVerification = await request(server)
      .post('/api/v1/admin/auth/totp/verify')
      .set('Content-Type', 'application/json')
      .set('Cookie', totpCookies.cookie)
      .set('Origin', origin)
      .set('X-Kora-Csrf', totpCookies.csrf)
      .send({ code: invalidTotp(ids.invalidTotp) });
    expect(invalidVerification.status).toBe(400);
    expect(invalidVerification.body.error.code).toBe('OTP_INVALID');

    const recoveryCookies = await loginBrowser(server, 'binding@example.invalid');
    const foreignRecovery = recoveryMaterials.get(ids.recovery);
    if (foreignRecovery === undefined) throw new Error('Missing recovery fixture material.');
    const invalidRecovery = await request(server)
      .post('/api/v1/admin/auth/recovery-codes/verify')
      .set('Content-Type', 'application/json')
      .set('Cookie', recoveryCookies.cookie)
      .set('Origin', origin)
      .set('X-Kora-Csrf', recoveryCookies.csrf)
      .send(foreignRecovery);
    expect(invalidRecovery.status).toBe(400);
    expect(invalidRecovery.body.error.code).toBe('ADMIN_RECOVERY_CODE_INVALID');

    const invalidRotation = await request(server)
      .post('/api/v1/admin/auth/recovery-codes/rotate')
      .set('Authorization', `Bearer ${accessTokens.get(ids.auditRotate)}`)
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', 'invalid-rotation-0001')
      .set('Origin', origin)
      .send({ code: invalidTotp(ids.auditRotate) });
    expect(invalidRotation.status).toBe(400);
    expect(invalidRotation.body.error.code).toBe('OTP_INVALID');

    const invalidStepUp = await request(server)
      .post('/api/v1/admin/auth/step-up')
      .set('Authorization', `Bearer ${accessTokens.get(ids.auditStepUp)}`)
      .set('Content-Type', 'application/json')
      .set('Origin', origin)
      .send({ purpose: 'SESSION_REVOCATION', totpCode: invalidTotp(ids.auditStepUp) });
    expect(invalidStepUp.status).toBe(400);
    expect(invalidStepUp.body.error.code).toBe('OTP_INVALID');
  });

  it('rejects one TOTP counter reused across operations', async () => {
    const server = application.getHttpServer();
    const cookies = await loginBrowser(server, 'double-totp@example.invalid');
    const code = currentTotp(ids.doubleTotp);
    const verified = await request(server)
      .post('/api/v1/admin/auth/totp/verify')
      .set('Content-Type', 'application/json')
      .set('Cookie', cookies.cookie)
      .set('Origin', origin)
      .set('X-Kora-Csrf', cookies.csrf)
      .send({ code });
    expect(verified.status).toBe(200);

    const reused = await request(server)
      .post('/api/v1/admin/auth/step-up')
      .set('Authorization', `Bearer ${String(verified.body.data.accessToken)}`)
      .set('Content-Type', 'application/json')
      .set('Origin', origin)
      .send({ purpose: 'SESSION_REVOCATION', totpCode: code });
    expect(reused.status).toBe(400);
    expect(reused.body.error.code).toBe('OTP_INVALID');

    const state = await owner.query<{ lastAcceptedTotpCounter: string }>(
      `SELECT "lastAcceptedTotpCounter"::text AS "lastAcceptedTotpCounter"
         FROM "AdminUser" WHERE "id" = $1`,
      [ids.doubleTotp],
    );
    expect(state.rows[0]!.lastAcceptedTotpCounter).not.toBeNull();
  });

  it('proves both serialized TOTP counter orders with exact durable outcomes', async () => {
    const server = application.getHttpServer();
    for (const scenario of [
      {
        adminUserId: ids.concurrentForward,
        email: 'concurrent-forward@example.invalid',
        firstSequence: 65,
        order: ['n', 'n+1'] as const,
      },
      {
        adminUserId: ids.concurrentReverse,
        email: 'concurrent-reverse@example.invalid',
        firstSequence: 68,
        order: ['n+1', 'n'] as const,
      },
    ]) {
      const first = await loginBrowser(server, scenario.email);
      const second = await loginBrowser(server, scenario.email);
      const pair = await stableTotpPair(scenario.adminUserId);
      const cookies = [first, second] as const;
      const codes = { n: pair.currentCode, 'n+1': pair.nextCode } as const;
      const outcomes: Array<{
        cookies: BrowserCookies;
        response: request.Response;
        slot: 'n' | 'n+1';
      }> = [];
      for (const [index, slot] of scenario.order.entries()) {
        outcomes.push({
          cookies: cookies[index]!,
          response: await totpVerification(server, cookies[index]!, codes[slot]),
          slot,
        });
      }
      expect(outcomes.map(({ response }) => response.status)).toEqual(
        scenario.order[0] === 'n' ? [200, 200] : [200, 400],
      );
      await expectTotpOrderState({
        adminUserId: scenario.adminUserId,
        counter: pair.counter,
        initialFamilyIds: [0, 1, 2].map((offset) =>
          deterministicUuid(1_000 + scenario.firstSequence + offset),
        ),
        outcomes,
      });
      process.stdout.write(
        `C1_R7_CONTROLLED_ORDER_PASS ${JSON.stringify({
          order: scenario.order,
          responses: outcomes.map(({ response, slot }) => ({
            code: response.body.error?.code ?? null,
            message: response.body.error?.message ?? null,
            slot,
            status: response.status,
          })),
        })}\n`,
      );
    }
  });

  it('keeps exact LRU state while real concurrent verifications request a fourth family', async () => {
    const server = application.getHttpServer();
    const first = await loginBrowser(server, 'concurrent@example.invalid');
    const second = await loginBrowser(server, 'concurrent@example.invalid');
    const pair = await stableTotpPair(ids.concurrent);
    const blocker = new Client({
      database: process.env.S1203C1_E2E_DATABASE,
      host: '127.0.0.1',
      password: process.env.S1203C1_E2E_OWNER_PASSWORD,
      port: Number(process.env.S1203C1_E2E_POSTGRES_PORT),
      user: process.env.S1203C1_E2E_OWNER_USER,
    });
    const observer = new Client({
      database: process.env.S1203C1_E2E_DATABASE,
      host: '127.0.0.1',
      password: process.env.S1203C1_E2E_OWNER_PASSWORD,
      port: Number(process.env.S1203C1_E2E_POSTGRES_PORT),
      user: process.env.S1203C1_E2E_OWNER_USER,
    });
    await Promise.all([blocker.connect(), observer.connect()]);
    let transactionOpen = false;
    let stopObserving = false;
    let maximumObserved = 0;
    let observation: Promise<void> | undefined;
    let requestResults: Promise<PromiseSettledResult<request.Response>[]> | undefined;
    const responses: request.Response[] = [];
    try {
      await blocker.query('BEGIN');
      transactionOpen = true;
      const blockerState = await blocker.query<{ pid: number }>(
        'SELECT pg_backend_pid()::int AS pid',
      );
      const blockerPid = blockerState.rows[0]!.pid;
      await blocker.query('SELECT "id" FROM "AdminUser" WHERE "id" = $1 FOR UPDATE', [
        ids.concurrent,
      ]);
      requestResults = Promise.allSettled([
        totpVerification(server, first, pair.currentCode),
        totpVerification(server, second, pair.nextCode),
      ]);

      const deadline = Date.now() + 5_000;
      let blockedWriterCount = 0;
      let directlyBlockedWriterCount = 0;
      while (blockedWriterCount < 2 && Date.now() < deadline) {
        const blocked = await observer.query<{ count: string; directCount: string }>(
          `SELECT count(*)::text AS count,
                  count(*) FILTER (
                    WHERE $1::int = ANY(pg_blocking_pids(pid))
                  )::text AS "directCount"
             FROM pg_stat_activity
            WHERE cardinality(pg_blocking_pids(pid)) > 0
              AND query LIKE '%FROM "AdminUser" WHERE "id" = $1 FOR UPDATE%'`,
          [blockerPid],
        );
        blockedWriterCount = Number(blocked.rows[0]!.count);
        directlyBlockedWriterCount = Number(blocked.rows[0]!.directCount);
        if (blockedWriterCount < 2) {
          await new Promise<void>((resolve) => setTimeout(resolve, 10));
        }
      }
      expect(blockedWriterCount).toBe(2);
      expect(directlyBlockedWriterCount).toBeGreaterThanOrEqual(1);

      observation = (async () => {
        const deadline = Date.now() + 10_000;
        while (!stopObserving && Date.now() < deadline) {
          const state = await observer.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM "AdminSession"
              WHERE "adminUserId" = $1 AND "revokedAt" IS NULL
                AND "expiresAt" > CURRENT_TIMESTAMP
                AND "absoluteExpiresAt" > CURRENT_TIMESTAMP`,
            [ids.concurrent],
          );
          maximumObserved = Math.max(maximumObserved, Number(state.rows[0]!.count));
          await new Promise<void>((resolve) => setTimeout(resolve, 1));
        }
        if (!stopObserving) throw new Error('Bounded family observer exceeded its deadline.');
      })();

      await blocker.query('COMMIT');
      transactionOpen = false;
      const settled = await requestResults;
      for (const result of settled) {
        if (result.status === 'rejected') throw result.reason;
        responses.push(result.value);
      }
    } finally {
      if (transactionOpen) await blocker.query('ROLLBACK');
      stopObserving = true;
      if (requestResults !== undefined) await requestResults;
      if (observation !== undefined) await observation;
      await Promise.all([blocker.end(), observer.end()]);
    }

    expect(responses[1]!.status).toBe(200);
    expect([200, 400]).toContain(responses[0]!.status);
    const outcomes = [
      { cookies: first, response: responses[0]!, slot: 'n' as const },
      { cookies: second, response: responses[1]!, slot: 'n+1' as const },
    ];
    await expectTotpOrderState({
      adminUserId: ids.concurrent,
      counter: pair.counter,
      initialFamilyIds: [20, 21, 22].map((sequence) => deterministicUuid(1_000 + sequence)),
      outcomes,
    });
    expect(maximumObserved).toBeLessThanOrEqual(3);
    process.stdout.write(
      `C1_R7_CONCURRENT_ORDER_PASS ${JSON.stringify({
        maximumObservedActiveFamilies: maximumObserved,
        responses: outcomes.map(({ response, slot }) => ({
          code: response.body.error?.code ?? null,
          message: response.body.error?.message ?? null,
          slot,
          status: response.status,
        })),
      })}\n`,
    );
  });

  it('enforces recovery-code single use, pre-auth expiry and user binding', async () => {
    const server = application.getHttpServer();
    const recovery = recoveryMaterials.get(ids.recovery);
    if (recovery === undefined) throw new Error('Missing recovery fixture material.');

    const expiredToken = crypto.randomOpaqueToken();
    await owner.query(
      `INSERT INTO "AdminPreAuthContext"
         ("id", "adminUserId", "tokenHash", "purpose", "authorizationVersion",
          "expiresAt", "consumedAt", "revokedAt", "createdAt")
       VALUES ($1, $2, $3, 'TOTP_VERIFY', 1,
               CURRENT_TIMESTAMP - INTERVAL '1 second', NULL, NULL,
               CURRENT_TIMESTAMP - INTERVAL '11 minutes')`,
      [
        deterministicUuid(5_001),
        ids.recovery,
        createHash('sha256').update(expiredToken).digest('hex'),
      ],
    );
    const policy = application.get<AdminRequestPolicy>(ADMIN_REQUEST_POLICY);
    const expiredCsrf = await policy.issueCsrfToken('PREAUTH', expiredToken);
    const expired: BrowserCookies = {
      cookie: `__Host-kora_admin_preauth=${expiredToken}; __Host-kora_admin_csrf=${expiredCsrf}`,
      csrf: expiredCsrf,
    };
    const expiredAttempt = await request(server)
      .post('/api/v1/admin/auth/recovery-codes/verify')
      .set('Content-Type', 'application/json')
      .set('Cookie', expired.cookie)
      .set('Origin', origin)
      .set('X-Kora-Csrf', expired.csrf)
      .send(recovery);
    expect(expiredAttempt.status).toBe(400);
    expect(expiredAttempt.body.error.code).toBe('ADMIN_RECOVERY_CODE_INVALID');

    const foreign = await loginBrowser(server, 'binding@example.invalid');
    const foreignAttempt = await request(server)
      .post('/api/v1/admin/auth/recovery-codes/verify')
      .set('Content-Type', 'application/json')
      .set('Cookie', foreign.cookie)
      .set('Origin', origin)
      .set('X-Kora-Csrf', foreign.csrf)
      .send(recovery);
    expect(foreignAttempt.status).toBe(400);
    expect(foreignAttempt.body.error.code).toBe('ADMIN_RECOVERY_CODE_INVALID');

    const valid = await loginBrowser(server, 'recovery@example.invalid');
    const consumed = await request(server)
      .post('/api/v1/admin/auth/recovery-codes/verify')
      .set('Content-Type', 'application/json')
      .set('Cookie', valid.cookie)
      .set('Origin', origin)
      .set('X-Kora-Csrf', valid.csrf)
      .send(recovery);
    expect(consumed.status).toBe(200);
    expect(consumed.body.data.nextStep).toBe('ENROLL_TOTP');

    const replayContext = await loginBrowser(server, 'recovery@example.invalid');
    const replay = await request(server)
      .post('/api/v1/admin/auth/recovery-codes/verify')
      .set('Content-Type', 'application/json')
      .set('Cookie', replayContext.cookie)
      .set('Origin', origin)
      .set('X-Kora-Csrf', replayContext.csrf)
      .send(recovery);
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe('ADMIN_RECOVERY_CODE_INVALID');
    expect(replay.body.data).toBeUndefined();

    const codeState = await owner.query<{ usedAt: Date | null }>(
      `SELECT "usedAt" FROM "AdminRecoveryCode" WHERE "selector" = $1`,
      [recovery.selector],
    );
    expect(codeState.rows[0]!.usedAt).not.toBeNull();
  });

  it('invalidates access on status, role, authorization version and session revocation changes', async () => {
    const server = application.getHttpServer();
    await owner.query(
      `UPDATE "AdminUser"
          SET "status" = 'DISABLED', "authorizationVersion" = "authorizationVersion" + 1
        WHERE "id" = $1`,
      [ids.invalidStatus],
    );
    await owner.query(`UPDATE "AdminUser" SET "role" = 'SUPPORT' WHERE "id" = $1`, [
      ids.invalidRole,
    ]);
    await owner.query(
      `UPDATE "AdminUser" SET "authorizationVersion" = "authorizationVersion" + 1
        WHERE "id" = $1`,
      [ids.invalidAuthorization],
    );
    const revokedClaims = await crypto.verifyAccessToken(
      accessTokens.get(ids.invalidRevocation)!,
      Math.floor(Date.now() / 1000),
    );
    await owner.query(`UPDATE "AdminSession" SET "revokedAt" = CURRENT_TIMESTAMP WHERE "id" = $1`, [
      revokedClaims.sessionId,
    ]);

    for (const id of [
      ids.invalidStatus,
      ids.invalidRole,
      ids.invalidAuthorization,
      ids.invalidRevocation,
    ]) {
      const response = await request(server)
        .get('/api/v1/admin/auth/sessions')
        .set('Authorization', `Bearer ${accessTokens.get(id)}`);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
    }
  });

  it('audits revokeOther success and refusals with exact subject and validated reason fields', async () => {
    const server = application.getHttpServer();
    const actorClaims = await crypto.verifyAccessToken(
      accessTokens.get(ids.revokeActor)!,
      Math.floor(Date.now() / 1000),
    );
    const targetClaims = await crypto.verifyAccessToken(
      accessTokens.get(ids.revokeTarget)!,
      Math.floor(Date.now() / 1000),
    );
    const supportClaims = await crypto.verifyAccessToken(
      accessTokens.get(ids.revokeSupport)!,
      Math.floor(Date.now() / 1000),
    );
    const initialSessions = await owner.query<{
      id: string;
      lastActivityAt: Date;
      revokedAt: Date | null;
    }>(
      `SELECT "id", "lastActivityAt", "revokedAt" FROM "AdminSession"
        WHERE "id" = ANY($1::text[]) ORDER BY "id"`,
      [[actorClaims.sessionId, targetClaims.sessionId, supportClaims.sessionId]],
    );

    const assertFailureAudit = async (
      response: request.Response,
      expected: {
        actorAdminUserId: string;
        actorSessionId: string;
        operatorReason: string;
        reasonCode: string;
        subjectAdminUserId?: string;
        targetSessionId: string;
      },
    ): Promise<void> => {
      const rows = await owner.query<{
        action: string;
        actorAdminUserId: string;
        adminSessionId: string;
        entityId: string;
        operatorReason: string;
        reasonCode: string;
        subjectAdminUserId: string | null;
      }>(
        `SELECT "action", "adminUserId" AS "actorAdminUserId",
                "adminSessionId", "entityId", "operatorReason",
                "reasonCode"::text AS "reasonCode", "subjectAdminUserId"
           FROM "AuditLog" WHERE "requestId" = $1`,
        [String(response.body.requestId)],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toEqual({
        action: 'ADMIN_SESSION_REVOCATION_REJECTED',
        actorAdminUserId: expected.actorAdminUserId,
        adminSessionId: expected.actorSessionId,
        entityId: expected.targetSessionId,
        operatorReason: expected.operatorReason,
        reasonCode: expected.reasonCode,
        subjectAdminUserId: expected.subjectAdminUserId ?? null,
      });
    };
    const revoke = (
      bearer: string,
      targetSessionId: string,
      reasonCode: string,
      operatorReason: string,
    ): request.Test =>
      request(server)
        .post(`/api/v1/admin/auth/sessions/${targetSessionId}/revocations`)
        .set('Authorization', `Bearer ${bearer}`)
        .set('Content-Type', 'application/json')
        .set('Origin', origin)
        .send({ operatorReason, reasonCode });

    const insufficientReason = 'Support role cannot revoke sessions';
    const insufficient = await revoke(
      accessTokens.get(ids.revokeSupport)!,
      targetClaims.sessionId,
      'ROLE_ADMINISTRATION',
      insufficientReason,
    );
    expect(insufficient.status).toBe(403);
    expect(insufficient.body.error.code).toBe('FORBIDDEN');
    await assertFailureAudit(insufficient, {
      actorAdminUserId: ids.revokeSupport,
      actorSessionId: supportClaims.sessionId,
      operatorReason: insufficientReason,
      reasonCode: 'ROLE_ADMINISTRATION',
      subjectAdminUserId: ids.revokeTarget,
      targetSessionId: targetClaims.sessionId,
    });
    const unauthorizedUnknownSessionId = deterministicUuid(99_998);
    const unauthorizedUnknown = await revoke(
      accessTokens.get(ids.revokeSupport)!,
      unauthorizedUnknownSessionId,
      'ROLE_ADMINISTRATION',
      insufficientReason,
    );
    expect(unauthorizedUnknown.status).toBe(403);
    expect(unauthorizedUnknown.body.error).toEqual(insufficient.body.error);
    await assertFailureAudit(unauthorizedUnknown, {
      actorAdminUserId: ids.revokeSupport,
      actorSessionId: supportClaims.sessionId,
      operatorReason: insufficientReason,
      reasonCode: 'ROLE_ADMINISTRATION',
      targetSessionId: unauthorizedUnknownSessionId,
    });

    const absentReason = 'Step-up proof is required';
    const absent = await revoke(
      accessTokens.get(ids.revokeActor)!,
      targetClaims.sessionId,
      'SECURITY_RESPONSE',
      absentReason,
    );
    expect(absent.status).toBe(403);
    await assertFailureAudit(absent, {
      actorAdminUserId: ids.revokeActor,
      actorSessionId: actorClaims.sessionId,
      operatorReason: absentReason,
      reasonCode: 'SECURITY_RESPONSE',
      subjectAdminUserId: ids.revokeTarget,
      targetSessionId: targetClaims.sessionId,
    });

    await owner.query(
      `UPDATE "AdminSession"
          SET "stepUpPurpose" = 'SESSION_REVOCATION',
              "stepUpVerifiedAt" = CURRENT_TIMESTAMP - INTERVAL '10 minutes',
              "stepUpExpiresAt" = CURRENT_TIMESTAMP - INTERVAL '5 minutes'
        WHERE "id" = $1`,
      [actorClaims.sessionId],
    );
    const expiredReason = 'Step-up proof has expired';
    const expired = await revoke(
      accessTokens.get(ids.revokeActor)!,
      targetClaims.sessionId,
      'STATUS_ADMINISTRATION',
      expiredReason,
    );
    expect(expired.status).toBe(403);
    await assertFailureAudit(expired, {
      actorAdminUserId: ids.revokeActor,
      actorSessionId: actorClaims.sessionId,
      operatorReason: expiredReason,
      reasonCode: 'STATUS_ADMINISTRATION',
      subjectAdminUserId: ids.revokeTarget,
      targetSessionId: targetClaims.sessionId,
    });

    await owner.query(
      `UPDATE "AdminSession"
          SET "stepUpPurpose" = 'SESSION_REVOCATION',
              "stepUpVerifiedAt" = CURRENT_TIMESTAMP,
              "stepUpExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
        WHERE "id" = $1`,
      [actorClaims.sessionId],
    );
    const selfReason = 'Self-target is forbidden';
    const self = await revoke(
      accessTokens.get(ids.revokeActor)!,
      actorClaims.sessionId,
      'ACCOUNT_RECOVERY',
      selfReason,
    );
    expect(self.status).toBe(403);
    await assertFailureAudit(self, {
      actorAdminUserId: ids.revokeActor,
      actorSessionId: actorClaims.sessionId,
      operatorReason: selfReason,
      reasonCode: 'ACCOUNT_RECOVERY',
      subjectAdminUserId: ids.revokeActor,
      targetSessionId: actorClaims.sessionId,
    });

    const unknownSessionId = deterministicUuid(99_999);
    const unknownReason = 'Unknown target requested';
    const unknown = await revoke(
      accessTokens.get(ids.revokeActor)!,
      unknownSessionId,
      'SECURITY_RESPONSE',
      unknownReason,
    );
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('ADMIN_SESSION_NOT_FOUND');
    await assertFailureAudit(unknown, {
      actorAdminUserId: ids.revokeActor,
      actorSessionId: actorClaims.sessionId,
      operatorReason: unknownReason,
      reasonCode: 'SECURITY_RESPONSE',
      targetSessionId: unknownSessionId,
    });

    const afterFailures = await owner.query<{
      id: string;
      lastActivityAt: Date;
      revokedAt: Date | null;
    }>(
      `SELECT "id", "lastActivityAt", "revokedAt" FROM "AdminSession"
        WHERE "id" = ANY($1::text[]) ORDER BY "id"`,
      [[actorClaims.sessionId, targetClaims.sessionId, supportClaims.sessionId]],
    );
    expect(afterFailures.rows).toEqual(initialSessions.rows);

    const successReason = 'Confirmed compromised target';
    const succeeded = await revoke(
      accessTokens.get(ids.revokeActor)!,
      targetClaims.sessionId,
      'SECURITY_RESPONSE',
      successReason,
    );
    expect(succeeded.status).toBe(204);
    const successAudit = await owner.query<{
      action: string;
      actorAdminUserId: string;
      adminSessionId: string;
      operatorReason: string;
      reasonCode: string;
      subjectAdminUserId: string;
    }>(
      `SELECT "action", "adminUserId" AS "actorAdminUserId", "adminSessionId",
              "operatorReason", "reasonCode"::text AS "reasonCode", "subjectAdminUserId"
         FROM "AuditLog"
        WHERE "action" = 'ADMIN_SESSION_REVOKED_BY_ADMIN' AND "entityId" = $1`,
      [targetClaims.sessionId],
    );
    expect(successAudit.rows).toEqual([
      {
        action: 'ADMIN_SESSION_REVOKED_BY_ADMIN',
        actorAdminUserId: ids.revokeActor,
        adminSessionId: actorClaims.sessionId,
        operatorReason: successReason,
        reasonCode: 'SECURITY_RESPONSE',
        subjectAdminUserId: ids.revokeTarget,
      },
    ]);
    const targetState = await owner.query<{ revokedAt: Date | null }>(
      `SELECT "revokedAt" FROM "AdminSession" WHERE "id" = $1`,
      [targetClaims.sessionId],
    );
    expect(targetState.rows[0]!.revokedAt).not.toBeNull();
  });

  it('serializes crossed session revocations without a PostgreSQL deadlock', async () => {
    const server = application.getHttpServer();
    const claimsA = await crypto.verifyAccessToken(
      accessTokens.get(ids.crossA)!,
      Math.floor(Date.now() / 1000),
    );
    const claimsB = await crypto.verifyAccessToken(
      accessTokens.get(ids.crossB)!,
      Math.floor(Date.now() / 1000),
    );
    await owner.query(
      `UPDATE "AdminSession"
          SET "stepUpPurpose" = 'SESSION_REVOCATION',
              "stepUpVerifiedAt" = CURRENT_TIMESTAMP,
              "stepUpExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
        WHERE "id" = ANY($1::text[])`,
      [[claimsA.sessionId, claimsB.sessionId]],
    );

    const responses = await Promise.all([
      request(server)
        .post(`/api/v1/admin/auth/sessions/${claimsB.sessionId}/revocations`)
        .set('Authorization', `Bearer ${accessTokens.get(ids.crossA)}`)
        .set('Content-Type', 'application/json')
        .set('Origin', origin)
        .send({ operatorReason: 'Concurrent revocation A', reasonCode: 'SECURITY_RESPONSE' }),
      request(server)
        .post(`/api/v1/admin/auth/sessions/${claimsA.sessionId}/revocations`)
        .set('Authorization', `Bearer ${accessTokens.get(ids.crossB)}`)
        .set('Content-Type', 'application/json')
        .set('Origin', origin)
        .send({ operatorReason: 'Concurrent revocation B', reasonCode: 'ACCOUNT_RECOVERY' }),
    ]);

    expect(responses.some(({ status }) => status === 204)).toBe(true);
    expect(responses.every(({ status }) => status === 204 || status === 401)).toBe(true);
    expect(responses.every(({ status }) => status !== 503)).toBe(true);
  });

  it('rejects malformed browser policy boundaries before authentication state is consulted', async () => {
    const server = application.getHttpServer();
    const loginBody = { email: 'totp@example.invalid', password };
    const wrongOrigin = await request(server)
      .post('/api/v1/admin/auth/login')
      .set('Content-Type', 'application/json')
      .set('Origin', 'https://attacker.invalid')
      .set('Sec-Fetch-Site', 'same-origin')
      .send(loginBody);
    expect(wrongOrigin.status).toBe(400);
    expect(wrongOrigin.body.error.code).toBe('VALIDATION_ERROR');

    const wrongFetchMetadata = await request(server)
      .post('/api/v1/admin/auth/login')
      .set('Content-Type', 'application/json')
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'cross-site')
      .send(loginBody);
    expect(wrongFetchMetadata.status).toBe(400);
    expect(wrongFetchMetadata.body.error.code).toBe('VALIDATION_ERROR');

    const nonJson = await request(server)
      .post('/api/v1/admin/auth/login')
      .set('Content-Type', 'text/plain')
      .set('Origin', origin)
      .set('Sec-Fetch-Site', 'same-origin')
      .send(JSON.stringify(loginBody));
    expect(nonJson.status).toBe(400);
    expect(nonJson.body.error.code).toBe('VALIDATION_ERROR');

    const contextToken = 'A'.repeat(43);
    const csrfCookie = `v1.${'B'.repeat(22)}.${'C'.repeat(43)}`;
    const baseCookie = `__Host-kora_admin_preauth=${contextToken}; __Host-kora_admin_csrf=${csrfCookie}`;
    const missingCookie = await request(server)
      .post('/api/v1/admin/auth/totp/enrollments')
      .set('Idempotency-Key', 'negative-cookie-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', csrfCookie);
    expect(missingCookie.status).toBe(401);
    expect(missingCookie.body.error.code).toBe('AUTH_REQUIRED');

    const mismatchedCsrf = await request(server)
      .post('/api/v1/admin/auth/totp/enrollments')
      .set('Cookie', baseCookie)
      .set('Idempotency-Key', 'negative-cookie-0002')
      .set('Origin', origin)
      .set('X-Kora-Csrf', `v1.${'D'.repeat(22)}.${'E'.repeat(43)}`);
    expect(mismatchedCsrf.status).toBe(401);
    expect(mismatchedCsrf.body.error.code).toBe('AUTH_REQUIRED');

    const duplicateCookie = await request(server)
      .post('/api/v1/admin/auth/totp/enrollments')
      .set('Cookie', `${baseCookie}; __Host-kora_admin_csrf=${csrfCookie}`)
      .set('Idempotency-Key', 'negative-cookie-0003')
      .set('Origin', origin)
      .set('X-Kora-Csrf', csrfCookie);
    expect(duplicateCookie.status).toBe(401);
    expect(duplicateCookie.body.error.code).toBe('AUTH_REQUIRED');

    const oversizedCookie = await request(server)
      .post('/api/v1/admin/auth/totp/enrollments')
      .set('Cookie', `${baseCookie}; filler=${'F'.repeat(4_096)}`)
      .set('Idempotency-Key', 'negative-cookie-0004')
      .set('Origin', origin)
      .set('X-Kora-Csrf', csrfCookie);
    expect(oversizedCookie.status).toBe(401);
    expect(oversizedCookie.body.error.code).toBe('AUTH_REQUIRED');

    const qrCookies = await loginBrowser(server, 'qr-failure@example.invalid');
    const invalidQrPath = await request(server)
      .post('/api/v1/admin/auth/totp/enrollments/not-a-uuid/qr')
      .set('Cookie', qrCookies.cookie)
      .set('Idempotency-Key', 'negative-qr-path-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', qrCookies.csrf);
    expect(invalidQrPath.status).toBe(403);
    expect(invalidQrPath.body.error.code).toBe('FORBIDDEN');

    const invalidRefreshOrigin = await request(server)
      .post('/api/v1/admin/auth/sessions/refresh')
      .set('Origin', 'https://attacker.invalid');
    expect(invalidRefreshOrigin.status).toBe(401);
    expect(invalidRefreshOrigin.body.error.code).toBe('AUTH_REFRESH_INVALID');

    const invalidRevokeOrigin = await request(server)
      .delete('/api/v1/admin/auth/sessions/current')
      .set('Origin', 'https://attacker.invalid');
    expect(invalidRevokeOrigin.status).toBe(401);
    expect(invalidRevokeOrigin.body.error.code).toBe('AUTH_REQUIRED');

    const requestIds = [
      wrongOrigin,
      wrongFetchMetadata,
      nonJson,
      missingCookie,
      mismatchedCsrf,
      duplicateCookie,
      oversizedCookie,
      invalidQrPath,
      invalidRefreshOrigin,
      invalidRevokeOrigin,
    ].map((response) => String(response.body.requestId));
    const durableFailures = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AdminSecurityEvent"
        WHERE "requestId" = ANY($1::text[]) AND "outcome" = 'FAILED'`,
      [requestIds],
    );
    expect(durableFailures.rows[0]!.count).toBe(String(requestIds.length));
  });

  it('rejects PUBLIC, grant-option, large-object and third-schema writer ACL drift', async () => {
    const writer = application.get(AdminWriterService);
    const writerRole = process.env.S1203C1_E2E_WRITER_USER;
    const database = process.env.S1203C1_E2E_DATABASE;
    if (
      writerRole === undefined ||
      database === undefined ||
      !/^[a-z][a-z0-9_]{0,62}$/u.test(writerRole) ||
      !/^[a-z][a-z0-9_]{0,62}$/u.test(database)
    ) {
      throw new Error('The isolated ACL target failed its identifier guard.');
    }
    const cases = [
      {
        cleanup: `REVOKE SELECT ("email") ON TABLE public."AdminUser" FROM PUBLIC`,
        setup: `GRANT SELECT ("email") ON TABLE public."AdminUser" TO PUBLIC`,
      },
      {
        cleanup: `REVOKE CONNECT ON DATABASE "${database}" FROM PUBLIC; GRANT CONNECT ON DATABASE "${database}" TO "${writerRole}"`,
        setup: `REVOKE CONNECT ON DATABASE "${database}" FROM "${writerRole}"; GRANT CONNECT ON DATABASE "${database}" TO PUBLIC`,
      },
      {
        cleanup: `REVOKE USAGE ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO "${writerRole}"`,
        setup: `REVOKE USAGE ON SCHEMA public FROM "${writerRole}"; GRANT USAGE ON SCHEMA public TO PUBLIC`,
      },
      {
        cleanup: `REVOKE EXECUTE ON FUNCTION pg_catalog.lo_create(oid) FROM PUBLIC`,
        setup: `GRANT EXECUTE ON FUNCTION pg_catalog.lo_create(oid) TO PUBLIC`,
      },
      {
        cleanup: `REVOKE GRANT OPTION FOR SELECT ("email") ON TABLE public."AdminUser" FROM "${writerRole}"`,
        setup: `GRANT SELECT ("email") ON TABLE public."AdminUser" TO "${writerRole}" WITH GRANT OPTION`,
      },
      {
        cleanup: `REVOKE USAGE ON SCHEMA c1_acl_intrusion FROM "${writerRole}"; DROP SCHEMA c1_acl_intrusion`,
        setup: `CREATE SCHEMA c1_acl_intrusion; GRANT USAGE ON SCHEMA c1_acl_intrusion TO "${writerRole}"`,
      },
    ] as const;

    for (const boundaryCase of cases) {
      await owner.query(boundaryCase.setup);
      try {
        await expect(writer.assertLeastPrivilege()).rejects.toThrow(
          'PostgreSQL admin writer boundary rejected',
        );
      } finally {
        await owner.query(boundaryCase.cleanup);
      }
      await expect(writer.assertLeastPrivilege()).resolves.toBeUndefined();
    }
  });

  it('rejects incoming reader and writer memberships on fresh application connections', async () => {
    const config = application.get<ConfigService<RuntimeConfig, true>>(ConfigService);
    const readerRole = process.env.S1203C1_E2E_READER_USER;
    const writerRole = process.env.S1203C1_E2E_WRITER_USER;
    if (
      readerRole === undefined ||
      writerRole === undefined ||
      !/^[a-z][a-z0-9_]{0,62}$/u.test(readerRole) ||
      !/^[a-z][a-z0-9_]{0,62}$/u.test(writerRole)
    ) {
      throw new Error('The isolated membership targets failed their identifier guard.');
    }

    const incomingMembershipCount = async (
      targetRole: string,
      probeRole: string,
    ): Promise<number> => {
      const result = await owner.query<{ count: string }>(
        `SELECT count(*)::text AS count
           FROM pg_catalog.pg_auth_members AS membership
           JOIN pg_catalog.pg_roles AS granted_role
             ON granted_role.oid = membership.roleid
           JOIN pg_catalog.pg_roles AS member_role
             ON member_role.oid = membership.member
          WHERE granted_role.rolname = $1 AND member_role.rolname = $2`,
        [targetRole, probeRole],
      );
      return Number(result.rows[0]!.count);
    };
    const assertFreshReader = async (): Promise<void> => {
      const prisma = new PrismaService(config);
      const writer = new AdminWriterService(config as unknown as ConfigService);
      const boundary = new PostgresqlRuntimeBoundary(prisma, writer, config);
      try {
        await boundary.assertLeastPrivilege();
      } finally {
        await prisma.onApplicationShutdown();
        await writer.onModuleDestroy();
      }
    };
    const assertFreshWriter = async (): Promise<void> => {
      const writer = new AdminWriterService(config as unknown as ConfigService);
      try {
        await writer.assertLeastPrivilege();
      } finally {
        await writer.onModuleDestroy();
      }
    };

    for (const [kind, targetRole] of [
      ['reader', readerRole],
      ['writer', writerRole],
    ] as const) {
      const probeRole = `c1_incoming_${kind}_${randomInt(100_000_000, 999_999_999)}`;
      if (!/^[a-z][a-z0-9_]{0,62}$/u.test(probeRole)) {
        throw new Error('The isolated membership probe failed its identifier guard.');
      }
      await owner.query(`CREATE ROLE "${probeRole}" NOLOGIN NOINHERIT`);
      try {
        await owner.query(`GRANT "${targetRole}" TO "${probeRole}"`);
        expect(await incomingMembershipCount(targetRole, probeRole)).toBe(1);

        let rejection: unknown;
        try {
          if (kind === 'reader') await assertFreshReader();
          else await assertFreshWriter();
        } catch (error: unknown) {
          rejection = error;
        }
        if (kind === 'reader') {
          expect(rejection).toBeInstanceOf(RuntimeDatabaseBoundaryError);
          expect((rejection as RuntimeDatabaseBoundaryError).violations).toContain(
            'role_membership_present',
          );
        } else {
          expect(rejection).toBeInstanceOf(AdminWriterBoundaryError);
          expect((rejection as AdminWriterBoundaryError).violations).toContain(
            'role_membership_present',
          );
        }
        expect(await incomingMembershipCount(targetRole, probeRole)).toBe(1);
      } finally {
        await owner.query(`REVOKE "${targetRole}" FROM "${probeRole}"`);
        await owner.query(`DROP ROLE "${probeRole}"`);
      }

      expect(await incomingMembershipCount(targetRole, probeRole)).toBe(0);
      if (kind === 'reader') await expect(assertFreshReader()).resolves.toBeUndefined();
      else await expect(assertFreshWriter()).resolves.toBeUndefined();
    }
  });

  it('rolls back all TOTP completion state when CSRF generation fails before COMMIT', async () => {
    const server = faultApplication.getHttpServer();
    const cookies = await loginBrowser(server, 'csrf-failure@example.invalid');
    const contextToken = cookieValue(cookies, '__Host-kora_admin_preauth');
    const code = currentTotp(ids.csrfFailure);
    faultKeys.failKeyedDigestDomain('ADMIN_CSRF_V1', 1);
    let failed: request.Response;
    try {
      failed = await request(server)
        .post('/api/v1/admin/auth/totp/verify')
        .set('Content-Type', 'application/json')
        .set('Cookie', cookies.cookie)
        .set('Origin', origin)
        .set('X-Kora-Csrf', cookies.csrf)
        .send({ code });
    } finally {
      faultKeys.recover();
    }
    expect(failed.status).toBe(503);
    expect(failed.body.error).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      details: {},
      message: 'Service temporairement indisponible.',
      retryable: false,
    });
    expect(failed.headers['set-cookie']).toBeUndefined();

    const state = await owner.query<{
      auditCount: string;
      consumedAt: Date | null;
      lastAcceptedTotpCounter: string | null;
      sessionCount: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM "AuditLog"
           WHERE "adminUserId" = $1 AND "action" = 'ADMIN_TOTP_VERIFIED') AS "auditCount",
         (SELECT "consumedAt" FROM "AdminPreAuthContext" WHERE "tokenHash" = $2) AS "consumedAt",
         (SELECT "lastAcceptedTotpCounter"::text FROM "AdminUser" WHERE "id" = $1)
           AS "lastAcceptedTotpCounter",
         (SELECT count(*)::text FROM "AdminSession" WHERE "adminUserId" = $1)
           AS "sessionCount"`,
      [ids.csrfFailure, createHash('sha256').update(contextToken).digest('hex')],
    );
    expect(state.rows[0]).toMatchObject({
      auditCount: '0',
      consumedAt: null,
      lastAcceptedTotpCounter: null,
      sessionCount: '0',
    });
  });

  it('fails closed when a keyed digest becomes unavailable after the provider preflight', async () => {
    const server = faultApplication.getHttpServer();

    faultKeys.failKeyedDigestDomain('ADMIN_LOGIN_SUBJECT_V1');
    let failedLogin: request.Response;
    try {
      failedLogin = await request(server)
        .post('/api/v1/admin/auth/login')
        .set('Content-Type', 'application/json')
        .set('Origin', origin)
        .set('Sec-Fetch-Site', 'same-origin')
        .send({ email: 'digest-failure@example.invalid', password });
    } finally {
      faultKeys.recover();
    }
    expect(failedLogin.status).toBe(503);
    expect(failedLogin.body.error).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      details: {},
      message: 'Service temporairement indisponible.',
      retryable: false,
    });
    expect(failedLogin.headers['set-cookie']).toBeUndefined();

    const cookies = await loginBrowser(server, 'digest-failure@example.invalid');
    const contextToken = cookieValue(cookies, '__Host-kora_admin_preauth');
    const enrollment = await request(server)
      .post('/api/v1/admin/auth/totp/enrollments')
      .set('Cookie', cookies.cookie)
      .set('Idempotency-Key', 'digest-failure-enrollment-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', cookies.csrf);
    expect(enrollment.status).toBe(201);
    const enrollmentId = String(enrollment.body.data.enrollmentId);
    await request(server)
      .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/qr`)
      .set('Cookie', cookies.cookie)
      .set('Idempotency-Key', 'digest-failure-qr-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', cookies.csrf)
      .expect(200);
    const stored = await owner.query<{ secretEncrypted: string }>(
      `SELECT "secretEncrypted" FROM "AdminTotpEnrollment" WHERE "id" = $1`,
      [enrollmentId],
    );
    const decrypted = await crypto.decryptTotpSecret(
      stored.rows[0]!.secretEncrypted,
      ids.digestFailure,
    );
    const code = crypto.generateTotpCode(decrypted.secret, BigInt(Math.floor(Date.now() / 30_000)));
    decrypted.secret.fill(0);

    faultKeys.failKeyedDigestDomain('ADMIN_IDEMPOTENCY_CONFIRM_V1');
    let failedConfirmation: request.Response;
    try {
      failedConfirmation = await request(server)
        .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/confirm`)
        .set('Content-Type', 'application/json')
        .set('Cookie', cookies.cookie)
        .set('Idempotency-Key', 'digest-failure-confirm-0001')
        .set('Origin', origin)
        .set('X-Kora-Csrf', cookies.csrf)
        .send({ code });
    } finally {
      faultKeys.recover();
    }
    expect(failedConfirmation.status).toBe(503);
    expect(failedConfirmation.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(failedConfirmation.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(failedConfirmation.body)).not.toMatch(
      /accessToken|refreshToken|recoveryCodes|selector|verifier/iu,
    );

    const state = await owner.query<{
      auditCount: string;
      batchCount: string;
      confirmedAt: Date | null;
      consumedAt: Date | null;
      idempotencyCount: string;
      sessionCount: string;
    }>(
      `SELECT
         (SELECT "confirmedAt" FROM "AdminTotpEnrollment" WHERE "id" = $1)
           AS "confirmedAt",
         (SELECT "consumedAt" FROM "AdminPreAuthContext" WHERE "tokenHash" = $2)
           AS "consumedAt",
         (SELECT count(*)::text FROM "AdminRecoveryCodeBatch" WHERE "adminUserId" = $3)
           AS "batchCount",
         (SELECT count(*)::text FROM "AdminSession" WHERE "adminUserId" = $3)
           AS "sessionCount",
         (SELECT count(*)::text FROM "AdminIdempotencyRecord"
           WHERE "adminUserId" = $3 AND "operation" = 'confirmAdminTotpEnrollment')
           AS "idempotencyCount",
         (SELECT count(*)::text FROM "AuditLog"
           WHERE "adminUserId" = $3 AND "action" = 'ADMIN_TOTP_ENROLLMENT_CONFIRMED')
           AS "auditCount"`,
      [enrollmentId, createHash('sha256').update(contextToken).digest('hex'), ids.digestFailure],
    );
    expect(state.rows[0]).toEqual({
      auditCount: '0',
      batchCount: '0',
      confirmedAt: null,
      consumedAt: null,
      idempotencyCount: '0',
      sessionCount: '0',
    });
    const preProofSinks = await owner.query<{ auditCount: string; securityCount: string }>(
      `SELECT
         (SELECT count(*)::text FROM "AuditLog" WHERE "requestId" = $1) AS "auditCount",
         (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "requestId" = $1)
           AS "securityCount"`,
      [String(failedConfirmation.body.requestId)],
    );
    expect(preProofSinks.rows[0]).toEqual({ auditCount: '0', securityCount: '1' });
  });

  it('rolls back TOTP state and audit atomically when RS256 signing fails', async () => {
    const server = faultApplication.getHttpServer();
    const cookies = await loginBrowser(server, 'signature-failure@example.invalid');
    const contextToken = cookieValue(cookies, '__Host-kora_admin_preauth');
    const code = currentTotp(ids.signatureFailure);
    faultKeys.fail('SIGN_RS256');
    let failed: request.Response;
    try {
      failed = await request(server)
        .post('/api/v1/admin/auth/totp/verify')
        .set('Content-Type', 'application/json')
        .set('Cookie', cookies.cookie)
        .set('Origin', origin)
        .set('X-Kora-Csrf', cookies.csrf)
        .send({ code });
    } finally {
      faultKeys.recover();
    }
    expect(failed.status).toBe(503);
    expect(failed.body.error.code).toBe('SERVICE_UNAVAILABLE');

    const rolledBack = await owner.query<{
      auditCount: string;
      consumedAt: Date | null;
      lastAcceptedTotpCounter: string | null;
      sessionCount: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM "AuditLog"
           WHERE "adminUserId" = $1 AND "action" = 'ADMIN_TOTP_VERIFIED') AS "auditCount",
         (SELECT "consumedAt" FROM "AdminPreAuthContext" WHERE "tokenHash" = $2) AS "consumedAt",
         (SELECT "lastAcceptedTotpCounter"::text FROM "AdminUser" WHERE "id" = $1)
           AS "lastAcceptedTotpCounter",
         (SELECT count(*)::text FROM "AdminSession" WHERE "adminUserId" = $1)
           AS "sessionCount"`,
      [ids.signatureFailure, createHash('sha256').update(contextToken).digest('hex')],
    );
    expect(rolledBack.rows[0]).toMatchObject({
      auditCount: '0',
      consumedAt: null,
      lastAcceptedTotpCounter: null,
      sessionCount: '0',
    });

    const retried = await request(server)
      .post('/api/v1/admin/auth/totp/verify')
      .set('Content-Type', 'application/json')
      .set('Cookie', cookies.cookie)
      .set('Origin', origin)
      .set('X-Kora-Csrf', cookies.csrf)
      .send({ code });
    expect(retried.status).toBe(200);

    const persistedText = await owner.query<Record<string, unknown>>(
      `SELECT "action", "entityType", "maskedBefore", "maskedAfter", "reason",
              "operatorReason", "requestId"
         FROM "AuditLog"
        WHERE "adminUserId" = $1 OR "subjectAdminUserId" = $1`,
      [ids.signatureFailure],
    );
    const serialized = JSON.stringify(persistedText.rows);
    expect(serialized).not.toContain(password);
    expect(serialized).not.toContain(code);
    expect(serialized).not.toContain(contextToken);
  });

  it('rolls back QR delivery markers and sinks when PNG generation fails', async () => {
    const server = application.getHttpServer();
    const applicationCrypto = application.get<AdminAuthCrypto>(ADMIN_AUTH_CRYPTO);
    const cookies = await loginBrowser(server, 'qr-failure@example.invalid');
    const enrollment = await request(server)
      .post('/api/v1/admin/auth/totp/enrollments')
      .set('Cookie', cookies.cookie)
      .set('Idempotency-Key', 'qr-failure-enrollment-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', cookies.csrf);
    expect(enrollment.status).toBe(201);
    const enrollmentId = String(enrollment.body.data.enrollmentId);
    const qrSpy = vi
      .spyOn(applicationCrypto, 'createTotpQrPng')
      .mockRejectedValueOnce(new Error('controlled QR generation failure'));
    let failed: request.Response;
    try {
      failed = await request(server)
        .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/qr`)
        .set('Cookie', cookies.cookie)
        .set('Idempotency-Key', 'qr-failure-delivery-0001')
        .set('Origin', origin)
        .set('X-Kora-Csrf', cookies.csrf);
    } finally {
      qrSpy.mockRestore();
    }
    expect(failed.status).toBe(503);
    expect(failed.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(failed.headers['content-type']).not.toMatch(/^image\/png/u);
    expect(JSON.stringify(failed.body)).not.toContain('controlled QR generation failure');

    const state = await owner.query<{
      auditCount: string;
      idempotencyCount: string;
      qrDeliveredAt: Date | null;
    }>(
      `SELECT
         (SELECT "qrDeliveredAt" FROM "AdminTotpEnrollment" WHERE "id" = $1)
           AS "qrDeliveredAt",
         (SELECT count(*)::text FROM "AuditLog"
           WHERE "entityId" = $1 AND "action" = 'ADMIN_TOTP_QR_DELIVERED') AS "auditCount",
         (SELECT count(*)::text FROM "AdminIdempotencyRecord"
           WHERE "resourceId" = $1 AND "operation" = 'deliverAdminTotpEnrollmentQr')
           AS "idempotencyCount"`,
      [enrollmentId],
    );
    expect(state.rows[0]).toMatchObject({
      auditCount: '0',
      idempotencyCount: '0',
      qrDeliveredAt: null,
    });
    const preauthSinks = await owner.query<{ auditCount: string; securityCount: string }>(
      `SELECT
         (SELECT count(*)::text FROM "AuditLog" WHERE "requestId" = $1) AS "auditCount",
         (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "requestId" = $1)
           AS "securityCount"`,
      [String(failed.body.requestId)],
    );
    expect(preauthSinks.rows[0]).toEqual({ auditCount: '0', securityCount: '1' });

    const retried = await request(server)
      .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/qr`)
      .set('Cookie', cookies.cookie)
      .set('Idempotency-Key', 'qr-failure-delivery-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', cookies.csrf);
    expect(retried.status).toBe(200);
    expect(retried.headers['content-type']).toMatch(/^image\/png/u);
  });

  it('returns 503 when JWT key resolution fails after provider availability succeeds', async () => {
    const server = faultApplication.getHttpServer();
    faultKeys.fail('RESOLVE_SIGNING_KEY');
    let response: request.Response;
    try {
      response = await request(server)
        .get('/api/v1/admin/auth/sessions')
        .set('Authorization', `Bearer ${accessTokens.get(ids.auditStepUp)}`);
    } finally {
      faultKeys.recover();
    }
    expect(response.status).toBe(503);
    expect(response.body.error).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      details: {},
      message: 'Service temporairement indisponible.',
      retryable: false,
    });
    expect(JSON.stringify(response.body)).not.toMatch(/adminUserId|sessionId/iu);
  });

  it('preserves proven recovery audit context across create, QR and confirmation failures', async () => {
    const writer = application.get(AdminWriterService);

    const createJourney = await beginRecoveryJourney(
      ids.r5RecoveryCreate,
      'r5-recovery-create@example.invalid',
    );
    const originalCreateTransaction = writer.transaction.bind(writer);
    let createPhaseReached = false;
    const createSpy = vi
      .spyOn(writer, 'transaction')
      .mockImplementation(
        async <T>(callback: (transaction: AdminWriterTransaction) => Promise<T>): Promise<T> =>
          originalCreateTransaction(async (transaction) =>
            callback({
              async query<Row extends QueryResultRow>(text: string, values: readonly unknown[]) {
                if (
                  !createPhaseReached &&
                  /FROM "AdminIdempotencyRecord"/u.test(text) &&
                  values[1] === 'createAdminTotpEnrollment'
                ) {
                  createPhaseReached = true;
                  throw new Error('controlled R5 recovery create post-proof failure');
                }
                return transaction.query<Row>(text, values);
              },
            }),
          ),
      );
    let failedCreate: request.Response;
    try {
      failedCreate = await request(application.getHttpServer())
        .post('/api/v1/admin/auth/totp/enrollments')
        .set('Cookie', createJourney.cookies.cookie)
        .set('Idempotency-Key', 'r5-recovery-create-0001')
        .set('Origin', origin)
        .set('X-Kora-Csrf', createJourney.cookies.csrf);
    } finally {
      createSpy.mockRestore();
    }
    expect(createPhaseReached).toBe(true);
    await expectR5RecoveryFailureAudit(failedCreate, {
      action: 'ADMIN_TOTP_ENROLLMENT_CREATE_REJECTED',
      actorAdminUserId: ids.r5RecoveryCreate,
      adminRecoveryContextId: createJourney.recoveryContextId,
      entityId: createJourney.recoveryContextId,
    });
    const createRollback = await owner.query<{ enrollmentCount: string; idempotencyCount: string }>(
      `SELECT
         (SELECT count(*)::text FROM "AdminTotpEnrollment" WHERE "adminUserId" = $1)
           AS "enrollmentCount",
         (SELECT count(*)::text FROM "AdminIdempotencyRecord" WHERE "adminUserId" = $1)
           AS "idempotencyCount"`,
      [ids.r5RecoveryCreate],
    );
    expect(createRollback.rows[0]).toEqual({ enrollmentCount: '0', idempotencyCount: '0' });
    const createRetry = await request(application.getHttpServer())
      .post('/api/v1/admin/auth/totp/enrollments')
      .set('Cookie', createJourney.cookies.cookie)
      .set('Idempotency-Key', 'r5-recovery-create-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', createJourney.cookies.csrf);
    expect(createRetry.status).toBe(201);

    const qrJourney = await beginRecoveryJourney(
      ids.r5RecoveryQr,
      'r5-recovery-qr@example.invalid',
    );
    const qrEnrollment = await request(application.getHttpServer())
      .post('/api/v1/admin/auth/totp/enrollments')
      .set('Cookie', qrJourney.cookies.cookie)
      .set('Idempotency-Key', 'r5-recovery-qr-create-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', qrJourney.cookies.csrf);
    expect(qrEnrollment.status).toBe(201);
    const qrEnrollmentId = String(qrEnrollment.body.data.enrollmentId);
    const applicationCrypto = application.get<AdminAuthCrypto>(ADMIN_AUTH_CRYPTO);
    const qrFailure = vi
      .spyOn(applicationCrypto, 'createTotpQrPng')
      .mockRejectedValueOnce(new Error('controlled R5 recovery QR post-proof failure'));
    let failedQr: request.Response;
    try {
      failedQr = await request(application.getHttpServer())
        .post(`/api/v1/admin/auth/totp/enrollments/${qrEnrollmentId}/qr`)
        .set('Cookie', qrJourney.cookies.cookie)
        .set('Idempotency-Key', 'r5-recovery-qr-delivery-0001')
        .set('Origin', origin)
        .set('X-Kora-Csrf', qrJourney.cookies.csrf);
    } finally {
      qrFailure.mockRestore();
    }
    await expectR5RecoveryFailureAudit(failedQr, {
      action: 'ADMIN_TOTP_QR_DELIVERY_REJECTED',
      actorAdminUserId: ids.r5RecoveryQr,
      adminRecoveryContextId: qrJourney.recoveryContextId,
      entityId: qrEnrollmentId,
    });
    expect(failedQr.headers['content-type']).not.toMatch(/^image\/png/u);
    const qrRollback = await owner.query<{ idempotencyCount: string; qrDeliveredAt: Date | null }>(
      `SELECT enrollment."qrDeliveredAt",
              (SELECT count(*)::text FROM "AdminIdempotencyRecord"
                WHERE "resourceId" = enrollment."id"
                  AND "operation" = 'deliverAdminTotpEnrollmentQr') AS "idempotencyCount"
         FROM "AdminTotpEnrollment" AS enrollment WHERE enrollment."id" = $1`,
      [qrEnrollmentId],
    );
    expect(qrRollback.rows[0]).toEqual({ idempotencyCount: '0', qrDeliveredAt: null });
    const qrRetry = await request(application.getHttpServer())
      .post(`/api/v1/admin/auth/totp/enrollments/${qrEnrollmentId}/qr`)
      .set('Cookie', qrJourney.cookies.cookie)
      .set('Idempotency-Key', 'r5-recovery-qr-delivery-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', qrJourney.cookies.csrf);
    expect(qrRetry.status).toBe(200);
    expect(qrRetry.headers['content-type']).toMatch(/^image\/png/u);
    const qrReplay = await request(application.getHttpServer())
      .post(`/api/v1/admin/auth/totp/enrollments/${qrEnrollmentId}/qr`)
      .set('Cookie', qrJourney.cookies.cookie)
      .set('Idempotency-Key', 'r5-recovery-qr-delivery-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', qrJourney.cookies.csrf);
    expect(qrReplay.status).toBe(409);
    expect(qrReplay.headers['content-type']).not.toMatch(/^image\/png/u);

    const confirmJourney = await beginRecoveryJourney(
      ids.r5RecoveryConfirm,
      'r5-recovery-confirm@example.invalid',
    );
    const confirmEnrollment = await request(application.getHttpServer())
      .post('/api/v1/admin/auth/totp/enrollments')
      .set('Cookie', confirmJourney.cookies.cookie)
      .set('Idempotency-Key', 'r5-recovery-confirm-create-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', confirmJourney.cookies.csrf);
    expect(confirmEnrollment.status).toBe(201);
    const confirmEnrollmentId = String(confirmEnrollment.body.data.enrollmentId);
    await request(application.getHttpServer())
      .post(`/api/v1/admin/auth/totp/enrollments/${confirmEnrollmentId}/qr`)
      .set('Cookie', confirmJourney.cookies.cookie)
      .set('Idempotency-Key', 'r5-recovery-confirm-qr-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', confirmJourney.cookies.csrf)
      .expect(200);
    const storedSecret = await owner.query<{ secretEncrypted: string }>(
      `SELECT "secretEncrypted" FROM "AdminTotpEnrollment" WHERE "id" = $1`,
      [confirmEnrollmentId],
    );
    const decrypted = await crypto.decryptTotpSecret(
      storedSecret.rows[0]!.secretEncrypted,
      ids.r5RecoveryConfirm,
    );
    const confirmCode = crypto.generateTotpCode(
      decrypted.secret,
      BigInt(Math.floor(Date.now() / 30_000)),
    );
    decrypted.secret.fill(0);
    const beforeConfirm = await owner.query<{
      authorizationVersion: number;
      batchCount: string;
      confirmedAt: Date | null;
      consumedAt: Date | null;
      idempotencyCount: string;
      lastAcceptedTotpCounter: string | null;
      sessionCount: string;
      status: string;
    }>(
      `SELECT user_record."status"::text AS "status",
              user_record."authorizationVersion", user_record."lastAcceptedTotpCounter"::text,
              context."consumedAt", enrollment."confirmedAt",
              (SELECT count(*)::text FROM "AdminRecoveryCodeBatch" WHERE "adminUserId" = $1)
                AS "batchCount",
              (SELECT count(*)::text FROM "AdminSession" WHERE "adminUserId" = $1)
                AS "sessionCount",
              (SELECT count(*)::text FROM "AdminIdempotencyRecord"
                WHERE "adminUserId" = $1 AND "operation" = 'confirmAdminTotpEnrollment')
                AS "idempotencyCount"
         FROM "AdminUser" AS user_record
         JOIN "AdminRecoveryContext" AS context ON context."id" = $2
         JOIN "AdminTotpEnrollment" AS enrollment ON enrollment."id" = $3
        WHERE user_record."id" = $1`,
      [ids.r5RecoveryConfirm, confirmJourney.recoveryContextId, confirmEnrollmentId],
    );
    const originalConfirmTransaction = writer.transaction.bind(writer);
    let confirmMutationReached = false;
    const confirmSpy = vi
      .spyOn(writer, 'transaction')
      .mockImplementation(
        async <T>(callback: (transaction: AdminWriterTransaction) => Promise<T>): Promise<T> =>
          originalConfirmTransaction(async (transaction) =>
            callback({
              async query<Row extends QueryResultRow>(text: string, values: readonly unknown[]) {
                const result = await transaction.query<Row>(text, values);
                if (
                  !confirmMutationReached &&
                  /UPDATE "AdminUser"[\s\S]*"totpSecretEncrypted"/u.test(text)
                ) {
                  confirmMutationReached = true;
                  throw new Error('controlled R5 recovery confirmation post-mutation failure');
                }
                return result;
              },
            }),
          ),
      );
    let failedConfirm: request.Response;
    try {
      failedConfirm = await request(application.getHttpServer())
        .post(`/api/v1/admin/auth/totp/enrollments/${confirmEnrollmentId}/confirm`)
        .set('Content-Type', 'application/json')
        .set('Cookie', confirmJourney.cookies.cookie)
        .set('Idempotency-Key', 'r5-recovery-confirm-finish-0001')
        .set('Origin', origin)
        .set('X-Kora-Csrf', confirmJourney.cookies.csrf)
        .send({ code: confirmCode });
    } finally {
      confirmSpy.mockRestore();
    }
    expect(confirmMutationReached).toBe(true);
    await expectR5RecoveryFailureAudit(failedConfirm, {
      action: 'ADMIN_TOTP_ENROLLMENT_CONFIRM_REJECTED',
      actorAdminUserId: ids.r5RecoveryConfirm,
      adminRecoveryContextId: confirmJourney.recoveryContextId,
      entityId: confirmEnrollmentId,
    });
    const afterConfirm = await owner.query<{
      authorizationVersion: number;
      batchCount: string;
      confirmedAt: Date | null;
      consumedAt: Date | null;
      idempotencyCount: string;
      lastAcceptedTotpCounter: string | null;
      sessionCount: string;
      status: string;
    }>(
      `SELECT user_record."status"::text AS "status",
              user_record."authorizationVersion", user_record."lastAcceptedTotpCounter"::text,
              context."consumedAt", enrollment."confirmedAt",
              (SELECT count(*)::text FROM "AdminRecoveryCodeBatch" WHERE "adminUserId" = $1)
                AS "batchCount",
              (SELECT count(*)::text FROM "AdminSession" WHERE "adminUserId" = $1)
                AS "sessionCount",
              (SELECT count(*)::text FROM "AdminIdempotencyRecord"
                WHERE "adminUserId" = $1 AND "operation" = 'confirmAdminTotpEnrollment')
                AS "idempotencyCount"
         FROM "AdminUser" AS user_record
         JOIN "AdminRecoveryContext" AS context ON context."id" = $2
         JOIN "AdminTotpEnrollment" AS enrollment ON enrollment."id" = $3
        WHERE user_record."id" = $1`,
      [ids.r5RecoveryConfirm, confirmJourney.recoveryContextId, confirmEnrollmentId],
    );
    expect(afterConfirm.rows).toEqual(beforeConfirm.rows);
    const confirmRetry = await request(application.getHttpServer())
      .post(`/api/v1/admin/auth/totp/enrollments/${confirmEnrollmentId}/confirm`)
      .set('Content-Type', 'application/json')
      .set('Cookie', confirmJourney.cookies.cookie)
      .set('Idempotency-Key', 'r5-recovery-confirm-finish-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', confirmJourney.cookies.csrf)
      .send({ code: confirmCode });
    expect(confirmRetry.status).toBe(200);
    expect(confirmRetry.body.data.recoveryCodes.codes).toHaveLength(10);
  });

  it('returns a neutral 503 without fallback when the recovery failure AuditLog sink is down', async () => {
    const journey = await beginRecoveryJourney(
      ids.r5RecoverySink,
      'r5-recovery-sink@example.invalid',
    );
    const writer = application.get(AdminWriterService);
    const originalTransaction = writer.transaction.bind(writer);
    let businessFailureReached = false;
    let failureSinkReached = false;
    const transactionSpy = vi
      .spyOn(writer, 'transaction')
      .mockImplementation(
        async <T>(callback: (transaction: AdminWriterTransaction) => Promise<T>): Promise<T> =>
          originalTransaction(async (transaction) =>
            callback({
              async query<Row extends QueryResultRow>(text: string, values: readonly unknown[]) {
                if (
                  !businessFailureReached &&
                  /FROM "AdminIdempotencyRecord"/u.test(text) &&
                  values[1] === 'createAdminTotpEnrollment'
                ) {
                  businessFailureReached = true;
                  throw new Error('controlled R5 recovery post-proof failure');
                }
                if (businessFailureReached && /INSERT INTO "AuditLog"/u.test(text)) {
                  failureSinkReached = true;
                  throw new Error('controlled R5 recovery failure sink outage');
                }
                return transaction.query<Row>(text, values);
              },
            }),
          ),
      );
    let response: request.Response;
    try {
      response = await request(application.getHttpServer())
        .post('/api/v1/admin/auth/totp/enrollments')
        .set('Cookie', journey.cookies.cookie)
        .set('Idempotency-Key', 'r5-recovery-sink-0001')
        .set('Origin', origin)
        .set('X-Kora-Csrf', journey.cookies.csrf);
    } finally {
      transactionSpy.mockRestore();
    }
    expect(businessFailureReached).toBe(true);
    expect(failureSinkReached).toBe(true);
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(response.headers['set-cookie']).toBeUndefined();
    const state = await owner.query<{
      auditCount: string;
      enrollmentCount: string;
      idempotencyCount: string;
      securityCount: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM "AuditLog" WHERE "requestId" = $1) AS "auditCount",
         (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "requestId" = $1)
           AS "securityCount",
         (SELECT count(*)::text FROM "AdminTotpEnrollment" WHERE "adminUserId" = $2)
           AS "enrollmentCount",
         (SELECT count(*)::text FROM "AdminIdempotencyRecord" WHERE "adminUserId" = $2)
           AS "idempotencyCount"`,
      [String(response.body.requestId), ids.r5RecoverySink],
    );
    expect(state.rows[0]).toEqual({
      auditCount: '0',
      enrollmentCount: '0',
      idempotencyCount: '0',
      securityCount: '0',
    });
  });

  it('enforces the list sink boundary before proof, after touch and after committed authentication', async () => {
    const token = accessTokens.get(ids.r5List)!;
    const fixtureSessionId = deterministicUuid(1_064);
    const writer = application.get(AdminWriterService);

    const mismatchedJtiToken = await crypto.issueAccessToken(
      {
        adminUserId: ids.r5List,
        authorizationVersion: 1,
        role: 'SUPER_ADMIN',
        sessionId: fixtureSessionId,
      },
      Math.floor(Date.now() / 1000),
    );
    const jtiMismatch = await request(application.getHttpServer())
      .get('/api/v1/admin/auth/sessions')
      .set('Authorization', `Bearer ${mismatchedJtiToken}`);
    expect(jtiMismatch.status).toBe(401);
    expect(jtiMismatch.body.error.code).toBe('AUTH_REQUIRED');
    const mismatchSinks = await owner.query<{
      action: string;
      auditCount: string;
      securityCount: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM "AuditLog" WHERE "requestId" = $1) AS "auditCount",
         min("action") AS "action", count(*)::text AS "securityCount"
         FROM "AdminSecurityEvent" WHERE "requestId" = $1`,
      [String(jtiMismatch.body.requestId)],
    );
    expect(mismatchSinks.rows[0]).toEqual({
      action: 'ADMIN_SESSION_AUTHENTICATION_REJECTED',
      auditCount: '0',
      securityCount: '1',
    });

    const originalPreProofTransaction = writer.transaction.bind(writer);
    let preProofReached = false;
    const preProofSpy = vi
      .spyOn(writer, 'transaction')
      .mockImplementation(
        async <T>(callback: (transaction: AdminWriterTransaction) => Promise<T>): Promise<T> =>
          originalPreProofTransaction(async (transaction) =>
            callback({
              async query<Row extends QueryResultRow>(text: string, values: readonly unknown[]) {
                if (!preProofReached) {
                  preProofReached = true;
                  throw new Error('controlled R5 list pre-proof failure');
                }
                return transaction.query<Row>(text, values);
              },
            }),
          ),
      );
    let preProofFailure: request.Response;
    try {
      preProofFailure = await request(application.getHttpServer())
        .get('/api/v1/admin/auth/sessions')
        .set('Authorization', `Bearer ${token}`);
    } finally {
      preProofSpy.mockRestore();
    }
    expect(preProofReached).toBe(true);
    expect(preProofFailure.status).toBe(503);
    const preProofSinks = await owner.query<{
      action: string;
      auditCount: string;
      securityCount: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM "AuditLog" WHERE "requestId" = $1) AS "auditCount",
         min("action") AS "action", count(*)::text AS "securityCount"
         FROM "AdminSecurityEvent" WHERE "requestId" = $1`,
      [String(preProofFailure.body.requestId)],
    );
    expect(preProofSinks.rows[0]).toEqual({
      action: 'ADMIN_SESSION_AUTHENTICATION_REJECTED',
      auditCount: '0',
      securityCount: '1',
    });

    const beforeTouchFailure = await owner.query<{ expiresAt: Date; lastActivityAt: Date }>(
      `SELECT "lastActivityAt", "expiresAt" FROM "AdminSession" WHERE "id" = $1`,
      [fixtureSessionId],
    );
    const originalTouchTransaction = writer.transaction.bind(writer);
    let touchUpdateReached = false;
    const touchSpy = vi
      .spyOn(writer, 'transaction')
      .mockImplementation(
        async <T>(callback: (transaction: AdminWriterTransaction) => Promise<T>): Promise<T> =>
          originalTouchTransaction(async (transaction) =>
            callback({
              async query<Row extends QueryResultRow>(text: string, values: readonly unknown[]) {
                const result = await transaction.query<Row>(text, values);
                if (
                  !touchUpdateReached &&
                  /UPDATE "AdminSession"[\s\S]*"lastActivityAt"/u.test(text)
                ) {
                  touchUpdateReached = true;
                  throw new Error('controlled R5 failure after real touch UPDATE');
                }
                return result;
              },
            }),
          ),
      );
    let touchFailure: request.Response;
    try {
      touchFailure = await request(application.getHttpServer())
        .get('/api/v1/admin/auth/sessions')
        .set('Authorization', `Bearer ${token}`);
    } finally {
      touchSpy.mockRestore();
    }
    expect(touchUpdateReached).toBe(true);
    expect(touchFailure.status).toBe(503);
    const afterTouchFailure = await owner.query<{ expiresAt: Date; lastActivityAt: Date }>(
      `SELECT "lastActivityAt", "expiresAt" FROM "AdminSession" WHERE "id" = $1`,
      [fixtureSessionId],
    );
    expect(afterTouchFailure.rows).toEqual(beforeTouchFailure.rows);
    const touchFailureSinks = await owner.query<{ auditCount: string; securityCount: string }>(
      `SELECT
         (SELECT count(*)::text FROM "AuditLog" WHERE "requestId" = $1) AS "auditCount",
         (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "requestId" = $1)
           AS "securityCount"`,
      [String(touchFailure.body.requestId)],
    );
    expect(touchFailureSinks.rows[0]).toEqual({ auditCount: '0', securityCount: '0' });

    const repository = application.get(AdminAuthRepository);
    const listSpy = vi
      .spyOn(repository, 'listSessions')
      .mockRejectedValueOnce(new Error('controlled R5 post-authentication list failure'));
    let listFailure: request.Response;
    try {
      listFailure = await request(application.getHttpServer())
        .get('/api/v1/admin/auth/sessions')
        .set('Authorization', `Bearer ${token}`);
    } finally {
      listSpy.mockRestore();
    }
    expect(listFailure.status).toBe(503);
    const afterCommittedAuthentication = await owner.query<{
      expiresAt: Date;
      lastActivityAt: Date;
    }>(`SELECT "lastActivityAt", "expiresAt" FROM "AdminSession" WHERE "id" = $1`, [
      fixtureSessionId,
    ]);
    expect(afterCommittedAuthentication.rows[0]!.lastActivityAt.getTime()).toBeGreaterThan(
      beforeTouchFailure.rows[0]!.lastActivityAt.getTime(),
    );
    const listFailureSinks = await owner.query<{ auditCount: string; securityCount: string }>(
      `SELECT
         (SELECT count(*)::text FROM "AuditLog" WHERE "requestId" = $1) AS "auditCount",
         (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "requestId" = $1)
           AS "securityCount"`,
      [String(listFailure.body.requestId)],
    );
    expect(listFailureSinks.rows[0]).toEqual({ auditCount: '0', securityCount: '0' });

    const invalidAuthorization = await request(application.getHttpServer())
      .get('/api/v1/admin/auth/sessions')
      .set('Authorization', `Bearer ${'x'.repeat(32)}`);
    expect(invalidAuthorization.status).toBe(401);
    const invalidAuthorizationSinks = await owner.query<{
      auditCount: string;
      securityCount: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM "AuditLog" WHERE "requestId" = $1) AS "auditCount",
         (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "requestId" = $1)
           AS "securityCount"`,
      [String(invalidAuthorization.body.requestId)],
    );
    expect(invalidAuthorizationSinks.rows[0]).toEqual({
      auditCount: '0',
      securityCount: '1',
    });

    const success = await request(application.getHttpServer())
      .get('/api/v1/admin/auth/sessions')
      .set('Authorization', `Bearer ${token}`);
    expect(success.status).toBe(200);
    expect(success.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ current: true, sessionId: fixtureSessionId }),
      ]),
    );
    const afterSuccess = await owner.query<{
      absoluteExpiresAt: Date;
      expiresAt: Date;
      lastActivityAt: Date;
    }>(
      `SELECT "absoluteExpiresAt", "expiresAt", "lastActivityAt"
         FROM "AdminSession" WHERE "id" = $1`,
      [fixtureSessionId],
    );
    expect(afterSuccess.rows[0]!.lastActivityAt.getTime()).toBeGreaterThan(
      afterCommittedAuthentication.rows[0]!.lastActivityAt.getTime(),
    );
    expect(afterSuccess.rows[0]!.expiresAt.getTime()).toBeLessThanOrEqual(
      afterSuccess.rows[0]!.absoluteExpiresAt.getTime(),
    );
  });

  it('keeps real committed success neutral when acknowledgement is lost on R5 paths', async () => {
    const writer = application.get(AdminWriterService);
    const withLostCommit = async (
      invoke: () => Promise<request.Response>,
    ): Promise<request.Response> => {
      const originalTransaction = writer.transaction.bind(writer);
      let callbackCommitted = false;
      const transactionSpy = vi
        .spyOn(writer, 'transaction')
        .mockImplementation(
          async <T>(callback: (transaction: AdminWriterTransaction) => Promise<T>): Promise<T> => {
            await originalTransaction(callback);
            callbackCommitted = true;
            throw new AdminWriterCommitUnknownError(
              new Error('controlled R5 lost COMMIT acknowledgement after real COMMIT'),
            );
          },
        );
      try {
        const response = await invoke();
        expect(callbackCommitted).toBe(true);
        return response;
      } finally {
        transactionSpy.mockRestore();
      }
    };
    const expectNeutralCommittedSuccess = async (
      response: request.Response,
      successAction: string,
    ): Promise<void> => {
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toMatch(
        /accessToken|refreshToken|recoveryCodes|selector|verifier/iu,
      );
      const sinks = await owner.query<{
        action: string;
        auditCount: string;
        securityCount: string;
      }>(
        `SELECT min("action") AS "action", count(*)::text AS "auditCount",
                (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "requestId" = $1)
                  AS "securityCount"
           FROM "AuditLog" WHERE "requestId" = $1`,
        [String(response.body.requestId)],
      );
      expect(sinks.rows[0]).toEqual({
        action: successAction,
        auditCount: '1',
        securityCount: '0',
      });
    };

    const createJourney = await beginRecoveryJourney(
      ids.r5CommitCreate,
      'r5-commit-create@example.invalid',
    );
    const create = await withLostCommit(() =>
      request(application.getHttpServer())
        .post('/api/v1/admin/auth/totp/enrollments')
        .set('Cookie', createJourney.cookies.cookie)
        .set('Idempotency-Key', 'r5-commit-create-0001')
        .set('Origin', origin)
        .set('X-Kora-Csrf', createJourney.cookies.csrf),
    );
    await expectNeutralCommittedSuccess(create, 'ADMIN_TOTP_ENROLLMENT_CREATED');
    const durableCreate = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AdminTotpEnrollment" WHERE "adminUserId" = $1`,
      [ids.r5CommitCreate],
    );
    expect(durableCreate.rows[0]!.count).toBe('1');

    const qrJourney = await beginRecoveryJourney(ids.r5CommitQr, 'r5-commit-qr@example.invalid');
    const qrEnrollment = await request(application.getHttpServer())
      .post('/api/v1/admin/auth/totp/enrollments')
      .set('Cookie', qrJourney.cookies.cookie)
      .set('Idempotency-Key', 'r5-commit-qr-create-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', qrJourney.cookies.csrf);
    const qrEnrollmentId = String(qrEnrollment.body.data.enrollmentId);
    const qr = await withLostCommit(() =>
      request(application.getHttpServer())
        .post(`/api/v1/admin/auth/totp/enrollments/${qrEnrollmentId}/qr`)
        .set('Cookie', qrJourney.cookies.cookie)
        .set('Idempotency-Key', 'r5-commit-qr-delivery-0001')
        .set('Origin', origin)
        .set('X-Kora-Csrf', qrJourney.cookies.csrf),
    );
    await expectNeutralCommittedSuccess(qr, 'ADMIN_TOTP_QR_DELIVERED');
    expect(qr.headers['content-type']).not.toMatch(/^image\/png/u);
    const durableQr = await owner.query<{ qrDeliveredAt: Date | null }>(
      `SELECT "qrDeliveredAt" FROM "AdminTotpEnrollment" WHERE "id" = $1`,
      [qrEnrollmentId],
    );
    expect(durableQr.rows[0]!.qrDeliveredAt).not.toBeNull();

    const confirmJourney = await beginRecoveryJourney(
      ids.r5CommitConfirm,
      'r5-commit-confirm@example.invalid',
    );
    const confirmEnrollment = await request(application.getHttpServer())
      .post('/api/v1/admin/auth/totp/enrollments')
      .set('Cookie', confirmJourney.cookies.cookie)
      .set('Idempotency-Key', 'r5-commit-confirm-create-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', confirmJourney.cookies.csrf);
    const confirmEnrollmentId = String(confirmEnrollment.body.data.enrollmentId);
    await request(application.getHttpServer())
      .post(`/api/v1/admin/auth/totp/enrollments/${confirmEnrollmentId}/qr`)
      .set('Cookie', confirmJourney.cookies.cookie)
      .set('Idempotency-Key', 'r5-commit-confirm-qr-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', confirmJourney.cookies.csrf)
      .expect(200);
    const secret = await owner.query<{ secretEncrypted: string }>(
      `SELECT "secretEncrypted" FROM "AdminTotpEnrollment" WHERE "id" = $1`,
      [confirmEnrollmentId],
    );
    const decrypted = await crypto.decryptTotpSecret(
      secret.rows[0]!.secretEncrypted,
      ids.r5CommitConfirm,
    );
    const code = crypto.generateTotpCode(decrypted.secret, BigInt(Math.floor(Date.now() / 30_000)));
    decrypted.secret.fill(0);
    const confirmation = await withLostCommit(() =>
      request(application.getHttpServer())
        .post(`/api/v1/admin/auth/totp/enrollments/${confirmEnrollmentId}/confirm`)
        .set('Content-Type', 'application/json')
        .set('Cookie', confirmJourney.cookies.cookie)
        .set('Idempotency-Key', 'r5-commit-confirm-finish-0001')
        .set('Origin', origin)
        .set('X-Kora-Csrf', confirmJourney.cookies.csrf)
        .send({ code }),
    );
    await expectNeutralCommittedSuccess(confirmation, 'ADMIN_TOTP_ENROLLMENT_CONFIRMED');
    const durableConfirmation = await owner.query<{
      batchCount: string;
      confirmedAt: Date | null;
      sessionCount: string;
    }>(
      `SELECT enrollment."confirmedAt",
              (SELECT count(*)::text FROM "AdminRecoveryCodeBatch" WHERE "adminUserId" = $1)
                AS "batchCount",
              (SELECT count(*)::text FROM "AdminSession" WHERE "adminUserId" = $1)
                AS "sessionCount"
         FROM "AdminTotpEnrollment" AS enrollment WHERE enrollment."id" = $2`,
      [ids.r5CommitConfirm, confirmEnrollmentId],
    );
    expect(durableConfirmation.rows[0]).toMatchObject({
      batchCount: '2',
      confirmedAt: expect.any(Date),
      sessionCount: '1',
    });

    const listSessionId = deterministicUuid(1_064);
    const beforeList = await owner.query<{ lastActivityAt: Date }>(
      `SELECT "lastActivityAt" FROM "AdminSession" WHERE "id" = $1`,
      [listSessionId],
    );
    const list = await withLostCommit(() =>
      request(application.getHttpServer())
        .get('/api/v1/admin/auth/sessions')
        .set('Authorization', `Bearer ${accessTokens.get(ids.r5List)}`),
    );
    expect(list.status).toBe(503);
    const listSinks = await owner.query<{ auditCount: string; securityCount: string }>(
      `SELECT
         (SELECT count(*)::text FROM "AuditLog" WHERE "requestId" = $1) AS "auditCount",
         (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "requestId" = $1)
           AS "securityCount"`,
      [String(list.body.requestId)],
    );
    expect(listSinks.rows[0]).toEqual({ auditCount: '0', securityCount: '0' });
    const afterList = await owner.query<{ lastActivityAt: Date }>(
      `SELECT "lastActivityAt" FROM "AdminSession" WHERE "id" = $1`,
      [listSessionId],
    );
    expect(afterList.rows[0]!.lastActivityAt.getTime()).toBeGreaterThanOrEqual(
      beforeList.rows[0]!.lastActivityAt.getTime(),
    );
  });

  it('destroys a real PostgreSQL backend after an unconfirmed rollback', async () => {
    const config = application.get<ConfigService<RuntimeConfig, true>>(ConfigService);
    const writer = new AdminWriterService(config as unknown as ConfigService);
    const writerFixture = writer as unknown as AdminWriterPoolFixture;
    const originalPool = writerFixture.pool;
    const dedicatedPool = new Pool({
      application_name: 'kora-plus-api-admin-writer-r6-test',
      connectionTimeoutMillis: 5_000,
      database: process.env.S1203C1_E2E_DATABASE,
      host: '127.0.0.1',
      max: 1,
      password: process.env.S1203C1_E2E_WRITER_PASSWORD,
      port: Number(process.env.S1203C1_E2E_POSTGRES_PORT),
      query_timeout: 5_000,
      statement_timeout: 5_000,
      user: process.env.S1203C1_E2E_WRITER_USER,
    });
    dedicatedPool.on('error', () => undefined);
    const businessError = new Error('controlled R6 business failure');
    const rollbackError = new Error('controlled R6 rollback acknowledgement failure');
    const abandonedEventId = deterministicUuid(9_001);
    const healthyEventId = deterministicUuid(9_002);
    let healthyBackendIdentity: BackendIdentity | undefined;
    let poisonedBackendIdentity: BackendIdentity | undefined;
    let poisonedBackendState: string | undefined;
    let rejectRollback = false;
    let rollbackRejectionCount = 0;
    let rejection: unknown;

    const poisonedClient: PoolClient = await dedicatedPool.connect();
    const originalQuery = poisonedClient.query;
    const executeOriginal = originalQuery.bind(poisonedClient) as unknown as TestClientQuery;
    const injectedQuery: TestClientQuery = async <Row extends QueryResultRow>(
      text: string,
      values?: readonly unknown[],
    ): Promise<QueryResult<Row>> => {
      if (text === 'ROLLBACK' && rejectRollback) {
        rejectRollback = false;
        rollbackRejectionCount += 1;
        throw rollbackError;
      }
      return executeOriginal<Row>(text, values);
    };
    Object.defineProperty(poisonedClient, 'query', {
      configurable: true,
      value: injectedQuery,
      writable: true,
    });
    poisonedClient.release();
    writerFixture.pool = dedicatedPool;
    try {
      try {
        await writer.transaction(async (transaction) => {
          const identity = await transaction.query<BackendIdentity>(
            `SELECT pg_backend_pid()::integer AS "pid", "backend_start" AS "backendStart"
             FROM pg_catalog.pg_stat_activity WHERE "pid" = pg_backend_pid()`,
            [],
          );
          poisonedBackendIdentity = identity.rows[0];
          await transaction.query(
            `INSERT INTO "AdminSecurityEvent"
               ("id", "adminUserId", "eventClass", "action", "outcome", "failureCode",
                "requestId", "subjectRefHash", "createdAt")
             VALUES ($1, $2, 'LOGIN', 'ADMIN_AUTH_R6_ABANDONED', 'FAILED',
                     'CONTROLLED_R6', $3, NULL, $4)`,
            [abandonedEventId, ids.r6Rollback, 'r6-pool-abandoned', new Date()],
          );
          const activity = await owner.query<{ state: string }>(
            `SELECT "state" FROM pg_catalog.pg_stat_activity
              WHERE "pid" = $1`,
            [poisonedBackendIdentity!.pid],
          );
          poisonedBackendState = activity.rows[0]?.state;
          rejectRollback = true;
          throw businessError;
        });
      } catch (error) {
        rejection = error;
      }

      await writer.transaction(async (transaction) => {
        const identity = await transaction.query<BackendIdentity>(
          `SELECT pg_backend_pid()::integer AS "pid", "backend_start" AS "backendStart"
             FROM pg_catalog.pg_stat_activity WHERE "pid" = pg_backend_pid()`,
          [],
        );
        healthyBackendIdentity = identity.rows[0];
        await transaction.query(
          `INSERT INTO "AdminSecurityEvent"
             ("id", "adminUserId", "eventClass", "action", "outcome", "failureCode",
              "requestId", "subjectRefHash", "createdAt")
           VALUES ($1, $2, 'LOGIN', 'ADMIN_AUTH_R6_HEALTHY', 'SUCCEEDED', NULL, $3, NULL, $4)`,
          [healthyEventId, ids.r6Rollback, 'r6-pool-healthy', new Date()],
        );
      });
    } finally {
      writerFixture.pool = originalPool;
      Object.defineProperty(poisonedClient, 'query', {
        configurable: true,
        value: originalQuery,
        writable: true,
      });
      try {
        await dedicatedPool.end();
      } finally {
        await writer.onModuleDestroy();
      }
    }

    expect(rejection).toBeInstanceOf(AggregateError);
    expect((rejection as AggregateError).errors).toEqual([businessError, rollbackError]);
    expect(poisonedBackendState).toBe('idle in transaction');
    expect(rollbackRejectionCount).toBe(1);
    expect(poisonedBackendIdentity).toBeDefined();
    expect(healthyBackendIdentity).toBeDefined();
    expect([
      healthyBackendIdentity!.pid,
      healthyBackendIdentity!.backendStart.toISOString(),
    ]).not.toEqual([
      poisonedBackendIdentity!.pid,
      poisonedBackendIdentity!.backendStart.toISOString(),
    ]);
    const durableState = await owner.query<{
      abandonedCount: string;
      healthyCount: string;
      retiredBackendCount: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "id" = $1)
           AS "abandonedCount",
         (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "id" = $2)
           AS "healthyCount",
         (SELECT count(*)::text FROM pg_catalog.pg_stat_activity
           WHERE "pid" = $3)
           AS "retiredBackendCount"`,
      [abandonedEventId, healthyEventId, poisonedBackendIdentity!.pid],
    );
    expect(durableState.rows[0]).toEqual({
      abandonedCount: '0',
      healthyCount: '1',
      retiredBackendCount: '0',
    });
  });

  it('records one contextual HTTP failure after rolling back the abandoned mutation', async () => {
    const journey = await beginRecoveryJourney(ids.r6Rollback, 'r6-rollback@example.invalid');
    const writer = application.get(AdminWriterService);
    const originalTransaction = writer.transaction.bind(writer);
    const callbackError = new Error('controlled R6 post-mutation HTTP failure');
    let capturedEnrollmentId: string | undefined;
    let failureInjected = false;
    let enrollmentRows = 0;
    let idempotencyRows = 0;
    let successAuditRows = 0;
    let insideTransactionState:
      | Readonly<{
          enrollmentCount: string;
          idempotencyCount: string;
          successAuditCount: string;
        }>
      | undefined;
    const transactionSpy = vi
      .spyOn(writer, 'transaction')
      .mockImplementation(
        async <T>(callback: (transaction: AdminWriterTransaction) => Promise<T>): Promise<T> =>
          originalTransaction(async (transaction) =>
            callback({
              async query<Row extends QueryResultRow>(text: string, values: readonly unknown[]) {
                const result = await transaction.query<Row>(text, values);
                if (
                  /INSERT INTO "AdminTotpEnrollment"/u.test(text) &&
                  values[1] === ids.r6Rollback
                ) {
                  capturedEnrollmentId = String(values[0]);
                  enrollmentRows = result.rowCount ?? 0;
                }
                if (
                  /INSERT INTO "AdminIdempotencyRecord"/u.test(text) &&
                  values[1] === ids.r6Rollback &&
                  values[2] === 'createAdminTotpEnrollment'
                ) {
                  idempotencyRows = result.rowCount ?? 0;
                }
                if (
                  !failureInjected &&
                  /INSERT INTO "AuditLog"/u.test(text) &&
                  values[7] === 'ADMIN_TOTP_ENROLLMENT_CREATED'
                ) {
                  failureInjected = true;
                  successAuditRows = result.rowCount ?? 0;
                  insideTransactionState = {
                    enrollmentCount: String(enrollmentRows),
                    idempotencyCount: String(idempotencyRows),
                    successAuditCount: String(successAuditRows),
                  };
                  throw callbackError;
                }
                return result;
              },
            }),
          ),
      );
    let response!: request.Response;
    try {
      response = await request(application.getHttpServer())
        .post('/api/v1/admin/auth/totp/enrollments')
        .set('Cookie', journey.cookies.cookie)
        .set('Idempotency-Key', 'r6-rollback-create-0001')
        .set('Origin', origin)
        .set('X-Kora-Csrf', journey.cookies.csrf);
    } finally {
      transactionSpy.mockRestore();
    }

    expect(failureInjected).toBe(true);
    expect(insideTransactionState).toEqual({
      enrollmentCount: '1',
      idempotencyCount: '1',
      successAuditCount: '1',
    });
    expect(capturedEnrollmentId).toBeDefined();
    await expectR5RecoveryFailureAudit(response, {
      action: 'ADMIN_TOTP_ENROLLMENT_CREATE_REJECTED',
      actorAdminUserId: ids.r6Rollback,
      adminRecoveryContextId: journey.recoveryContextId,
      entityId: capturedEnrollmentId!,
    });
    const durableState = await owner.query<{
      enrollmentCount: string;
      idempotencyCount: string;
      successAuditCount: string;
    }>(
      `SELECT
         (SELECT count(*)::text FROM "AdminTotpEnrollment" WHERE "adminUserId" = $1)
           AS "enrollmentCount",
         (SELECT count(*)::text FROM "AdminIdempotencyRecord"
           WHERE "adminUserId" = $1 AND "operation" = 'createAdminTotpEnrollment')
           AS "idempotencyCount",
         (SELECT count(*)::text FROM "AuditLog"
           WHERE "requestId" = $2 AND "action" = 'ADMIN_TOTP_ENROLLMENT_CREATED')
           AS "successAuditCount"`,
      [ids.r6Rollback, String(response.body.requestId)],
    );
    expect(durableState.rows[0]).toEqual({
      enrollmentCount: '0',
      idempotencyCount: '0',
      successAuditCount: '0',
    });
    await expect(writer.selectOne()).resolves.toBeUndefined();
  });

  it('records exactly one contextual AuditLog for post-session availability, crypto and transaction failures', async () => {
    const server = faultApplication.getHttpServer();
    const operations = [
      {
        action: 'ADMIN_RECOVERY_CODES_ROTATION_REJECTED',
        adminUserId: ids.auditRotate,
        invoke: (suffix: string) =>
          request(server)
            .post('/api/v1/admin/auth/recovery-codes/rotate')
            .set('Authorization', `Bearer ${accessTokens.get(ids.auditRotate)}`)
            .set('Content-Type', 'application/json')
            .set('Idempotency-Key', `audit-rotation-${suffix}-0001`)
            .set('Origin', origin)
            .send({ code: currentTotp(ids.auditRotate) }),
      },
      {
        action: 'ADMIN_SESSION_STEP_UP_REJECTED',
        adminUserId: ids.auditStepUp,
        invoke: (suffix: string) => {
          void suffix;
          return request(server)
            .post('/api/v1/admin/auth/step-up')
            .set('Authorization', `Bearer ${accessTokens.get(ids.auditStepUp)}`)
            .set('Content-Type', 'application/json')
            .set('Origin', origin)
            .send({ purpose: 'SESSION_REVOCATION', totpCode: currentTotp(ids.auditStepUp) });
        },
      },
    ] as const;
    const failures = ['availability', 'crypto', 'transaction'] as const;

    for (const operation of operations) {
      const claims = await crypto.verifyAccessToken(
        accessTokens.get(operation.adminUserId)!,
        Math.floor(Date.now() / 1000),
      );
      for (const failure of failures) {
        await rateLimitRedis.flushdb();
        let transactionSpy: MockInstance<AdminWriterService['transaction']> | undefined;
        if (failure === 'availability') faultKeys.failAssertAvailableAfter(1);
        if (failure === 'crypto') faultKeys.fail('UNWRAP_DEK');
        if (failure === 'transaction') {
          const writer = faultApplication.get(AdminWriterService);
          const originalTransaction = writer.transaction.bind(writer);
          let transactionCalls = 0;
          transactionSpy = vi
            .spyOn(writer, 'transaction')
            .mockImplementation(
              async <T>(
                callback: (transaction: AdminWriterTransaction) => Promise<T>,
              ): Promise<T> => {
                transactionCalls += 1;
                if (transactionCalls === 2) {
                  throw new Error('controlled post-session transaction failure');
                }
                return originalTransaction(callback);
              },
            );
        }

        let response: request.Response;
        try {
          response = await operation.invoke(failure);
        } finally {
          transactionSpy?.mockRestore();
          faultKeys.recover();
        }
        expect(response.status).toBe(503);
        expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(JSON.stringify(response.body)).not.toMatch(
          /accessToken|refreshToken|recoveryCodes|totpCode/iu,
        );

        const sink = await owner.query<{
          action: string;
          actorAdminUserId: string;
          adminSessionId: string;
          auditCount: string;
          reasonCode: string;
          securityCount: string;
          subjectAdminUserId: string;
        }>(
          `SELECT
             min("action") AS "action",
             min("adminUserId") AS "actorAdminUserId",
             min("adminSessionId") AS "adminSessionId",
             count(*)::text AS "auditCount",
             min("reasonCode"::text) AS "reasonCode",
             (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "requestId" = $1)
               AS "securityCount",
             min("subjectAdminUserId") AS "subjectAdminUserId"
           FROM "AuditLog" WHERE "requestId" = $1`,
          [String(response.body.requestId)],
        );
        expect(sink.rows[0]).toEqual({
          action: operation.action,
          actorAdminUserId: operation.adminUserId,
          adminSessionId: claims.sessionId,
          auditCount: '1',
          reasonCode: 'SECURITY_RESPONSE',
          securityCount: '0',
          subjectAdminUserId: operation.adminUserId,
        });
      }
    }

    const state = await owner.query<{
      recoveryBatchCount: string;
      rotateCounter: string | null;
      stepCounter: string | null;
      stepUpExpiresAt: Date | null;
      stepUpPurpose: string | null;
    }>(
      `SELECT
         (SELECT "lastAcceptedTotpCounter"::text FROM "AdminUser" WHERE "id" = $1)
           AS "rotateCounter",
         (SELECT count(*)::text FROM "AdminRecoveryCodeBatch" WHERE "adminUserId" = $1)
           AS "recoveryBatchCount",
         (SELECT "lastAcceptedTotpCounter"::text FROM "AdminUser" WHERE "id" = $2)
           AS "stepCounter",
         (SELECT "stepUpPurpose"::text FROM "AdminSession" WHERE "adminUserId" = $2)
           AS "stepUpPurpose",
         (SELECT "stepUpExpiresAt" FROM "AdminSession" WHERE "adminUserId" = $2)
           AS "stepUpExpiresAt"`,
      [ids.auditRotate, ids.auditStepUp],
    );
    expect(state.rows[0]).toEqual({
      recoveryBatchCount: '0',
      rotateCounter: null,
      stepCounter: null,
      stepUpExpiresAt: null,
      stepUpPurpose: null,
    });
  });

  it('preserves proven revocation context before and after target resolution with rollback', async () => {
    const server = application.getHttpServer();
    const writer = application.get(AdminWriterService);
    await enableR4RevocationStepUp(ids.r4EarlyActor);
    await enableR4RevocationStepUp(ids.r4LateActor);
    const operations = [
      {
        actorId: ids.r4Current,
        expected: {
          action: 'ADMIN_SESSION_REVOCATION_REJECTED',
          actorAdminUserId: ids.r4Current,
          adminSessionId: r4Sessions.get(ids.r4Current)!.sessionId,
          entityId: r4Sessions.get(ids.r4Current)!.sessionId,
          operatorReason: null,
          reasonCode: 'SECURITY_RESPONSE',
          subjectAdminUserId: ids.r4Current,
        },
        invoke: () =>
          request(server)
            .delete('/api/v1/admin/auth/sessions/current')
            .set('Authorization', `Bearer ${accessTokens.get(ids.r4Current)}`)
            .set('Origin', origin),
        mode: 'early' as const,
        sessionIds: [r4Sessions.get(ids.r4Current)!.sessionId],
      },
      {
        actorId: ids.r4EarlyActor,
        expected: {
          action: 'ADMIN_SESSION_REVOCATION_REJECTED',
          actorAdminUserId: ids.r4EarlyActor,
          adminSessionId: r4Sessions.get(ids.r4EarlyActor)!.sessionId,
          entityId: r4Sessions.get(ids.r4EarlyTarget)!.sessionId,
          operatorReason: 'Contexte R4 avant resolution',
          reasonCode: 'ACCOUNT_RECOVERY',
          subjectAdminUserId: null,
        },
        invoke: () =>
          request(server)
            .post(
              `/api/v1/admin/auth/sessions/${r4Sessions.get(ids.r4EarlyTarget)!.sessionId}/revocations`,
            )
            .set('Authorization', `Bearer ${accessTokens.get(ids.r4EarlyActor)}`)
            .set('Content-Type', 'application/json')
            .set('Origin', origin)
            .send({
              operatorReason: 'Contexte R4 avant resolution',
              reasonCode: 'ACCOUNT_RECOVERY',
            }),
        mode: 'early' as const,
        sessionIds: [
          r4Sessions.get(ids.r4EarlyActor)!.sessionId,
          r4Sessions.get(ids.r4EarlyTarget)!.sessionId,
        ],
      },
      {
        actorId: ids.r4LateActor,
        expected: {
          action: 'ADMIN_SESSION_REVOCATION_REJECTED',
          actorAdminUserId: ids.r4LateActor,
          adminSessionId: r4Sessions.get(ids.r4LateActor)!.sessionId,
          entityId: r4Sessions.get(ids.r4LateTarget)!.sessionId,
          operatorReason: 'Contexte R4 apres resolution',
          reasonCode: 'SECURITY_RESPONSE',
          subjectAdminUserId: ids.r4LateTarget,
        },
        invoke: () =>
          request(server)
            .post(
              `/api/v1/admin/auth/sessions/${r4Sessions.get(ids.r4LateTarget)!.sessionId}/revocations`,
            )
            .set('Authorization', `Bearer ${accessTokens.get(ids.r4LateActor)}`)
            .set('Content-Type', 'application/json')
            .set('Origin', origin)
            .send({
              operatorReason: 'Contexte R4 apres resolution',
              reasonCode: 'SECURITY_RESPONSE',
            }),
        mode: 'after-target' as const,
        sessionIds: [
          r4Sessions.get(ids.r4LateActor)!.sessionId,
          r4Sessions.get(ids.r4LateTarget)!.sessionId,
        ],
      },
    ];

    for (const operation of operations) {
      const before = await owner.query<{
        expiresAt: Date;
        id: string;
        lastActivityAt: Date;
        revokedAt: Date | null;
      }>(
        `SELECT "id", "expiresAt", "lastActivityAt", "revokedAt"
           FROM "AdminSession" WHERE "id" = ANY($1::text[]) ORDER BY "id"`,
        [operation.sessionIds],
      );
      const originalTransaction = writer.transaction.bind(writer);
      let transactionCalls = 0;
      const transactionSpy = vi
        .spyOn(writer, 'transaction')
        .mockImplementation(
          async <T>(callback: (transaction: AdminWriterTransaction) => Promise<T>): Promise<T> => {
            transactionCalls += 1;
            if (transactionCalls !== 2) return originalTransaction(callback);
            if (operation.mode === 'early') {
              throw new Error(`controlled ${operation.actorId} early transaction failure`);
            }
            return originalTransaction(async (transaction) => {
              const failingTransaction: AdminWriterTransaction = {
                async query<Row extends QueryResultRow>(text: string, values: readonly unknown[]) {
                  if (
                    /UPDATE "AdminSession" SET "revokedAt"/u.test(text) &&
                    values[0] === operation.expected.entityId
                  ) {
                    throw new Error('controlled post-target revocation failure');
                  }
                  return transaction.query<Row>(text, values);
                },
              };
              return callback(failingTransaction);
            });
          },
        );
      let response: request.Response;
      try {
        response = await operation.invoke();
      } finally {
        transactionSpy.mockRestore();
      }

      await expectR4FailureAudit(response, operation.expected);
      const after = await owner.query<{
        expiresAt: Date;
        id: string;
        lastActivityAt: Date;
        revokedAt: Date | null;
      }>(
        `SELECT "id", "expiresAt", "lastActivityAt", "revokedAt"
           FROM "AdminSession" WHERE "id" = ANY($1::text[]) ORDER BY "id"`,
        [operation.sessionIds],
      );
      expect(after.rows).toEqual(before.rows);
    }
  });

  it('routes refresh failures by proof phase and rolls back partial rotation', async () => {
    const refreshFailures = [
      { adminUserId: ids.r4RefreshCsrf, phase: 'csrf' as const },
      { adminUserId: ids.r4RefreshSignature, phase: 'signature' as const },
      { adminUserId: ids.r4RefreshRotation, phase: 'rotation' as const },
    ];

    for (const failure of refreshFailures) {
      const fixture = r4Sessions.get(failure.adminUserId)!;
      const cookies = await r4RefreshCookies(failure.adminUserId);
      const selectedApplication = failure.phase === 'rotation' ? application : faultApplication;
      const writer = selectedApplication.get(AdminWriterService);
      const before = await owner.query<{
        accessTokenJti: string;
        consumedAt: Date | null;
        expiresAt: Date;
        generation: number;
        id: string;
        lastActivityAt: Date;
        refreshTokenHash: string;
        refreshTokenVersion: number;
        tokenHash: string;
      }>(
        `SELECT session."accessTokenJti", session."refreshTokenHash",
                session."refreshTokenVersion", session."lastActivityAt", session."expiresAt",
                token."id", token."tokenHash", token."generation", token."consumedAt"
           FROM "AdminSession" AS session
           JOIN "AdminRefreshToken" AS token ON token."adminSessionId" = session."id"
          WHERE session."id" = $1 ORDER BY token."generation"`,
        [fixture.sessionId],
      );
      let transactionSpy: MockInstance<AdminWriterService['transaction']> | undefined;
      if (failure.phase === 'csrf') faultKeys.failKeyedDigestDomain('ADMIN_CSRF_V1', 1);
      if (failure.phase === 'signature') faultKeys.fail('SIGN_RS256');
      if (failure.phase === 'rotation') {
        const originalTransaction = writer.transaction.bind(writer);
        transactionSpy = vi
          .spyOn(writer, 'transaction')
          .mockImplementation(
            async <T>(callback: (transaction: AdminWriterTransaction) => Promise<T>): Promise<T> =>
              originalTransaction(async (transaction) => {
                const failingTransaction: AdminWriterTransaction = {
                  async query<Row extends QueryResultRow>(
                    text: string,
                    values: readonly unknown[],
                  ) {
                    if (/INSERT INTO "AdminRefreshToken"/u.test(text)) {
                      throw new Error('controlled refresh-chain insertion failure');
                    }
                    return transaction.query<Row>(text, values);
                  },
                };
                return callback(failingTransaction);
              }),
          );
      }

      let response: request.Response;
      try {
        response = await request(selectedApplication.getHttpServer())
          .post('/api/v1/admin/auth/sessions/refresh')
          .set('Cookie', cookies.cookie)
          .set('Origin', origin)
          .set('X-Kora-Csrf', cookies.csrf);
      } finally {
        transactionSpy?.mockRestore();
        faultKeys.recover();
      }
      await expectR4FailureAudit(response, {
        action: 'ADMIN_SESSION_REFRESH_REJECTED',
        actorAdminUserId: failure.adminUserId,
        adminSessionId: fixture.sessionId,
        entityId: fixture.sessionId,
        operatorReason: null,
        reasonCode: 'SECURITY_RESPONSE',
        subjectAdminUserId: failure.adminUserId,
      });
      const after = await owner.query<{
        accessTokenJti: string;
        consumedAt: Date | null;
        expiresAt: Date;
        generation: number;
        id: string;
        lastActivityAt: Date;
        refreshTokenHash: string;
        refreshTokenVersion: number;
        tokenHash: string;
      }>(
        `SELECT session."accessTokenJti", session."refreshTokenHash",
                session."refreshTokenVersion", session."lastActivityAt", session."expiresAt",
                token."id", token."tokenHash", token."generation", token."consumedAt"
           FROM "AdminSession" AS session
           JOIN "AdminRefreshToken" AS token ON token."adminSessionId" = session."id"
          WHERE session."id" = $1 ORDER BY token."generation"`,
        [fixture.sessionId],
      );
      expect(after.rows).toEqual(before.rows);
    }

    const unknownRefresh = 'r'.repeat(43);
    const unknownCsrf = await new AdminRequestPolicy({ keyProvider: keys, origin }).issueCsrfToken(
      'REFRESH',
      unknownRefresh,
    );
    const writer = application.get(AdminWriterService);
    const originalTransaction = writer.transaction.bind(writer);
    let transactionCalls = 0;
    const transactionSpy = vi
      .spyOn(writer, 'transaction')
      .mockImplementation(
        async <T>(callback: (transaction: AdminWriterTransaction) => Promise<T>): Promise<T> => {
          transactionCalls += 1;
          if (transactionCalls === 1) throw new Error('controlled pre-proof refresh failure');
          return originalTransaction(callback);
        },
      );
    let preProof: request.Response;
    try {
      preProof = await request(application.getHttpServer())
        .post('/api/v1/admin/auth/sessions/refresh')
        .set(
          'Cookie',
          `__Host-kora_admin_refresh=${unknownRefresh}; __Host-kora_admin_csrf=${unknownCsrf}`,
        )
        .set('Origin', origin)
        .set('X-Kora-Csrf', unknownCsrf);
    } finally {
      transactionSpy.mockRestore();
    }
    expect(preProof.status).toBe(503);
    expect(preProof.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(preProof.headers['set-cookie']).toBeUndefined();
    const preProofRequestId = String(preProof.body.requestId);
    const preProofAudit = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AuditLog" WHERE "requestId" = $1`,
      [preProofRequestId],
    );
    expect(preProofAudit.rows[0]!.count).toBe('0');
    const preProofSecurity = await owner.query<{
      action: string;
      adminUserId: string | null;
      count: string;
      subjectRefHash: string | null;
    }>(
      `SELECT min("action") AS "action", min("adminUserId") AS "adminUserId",
              min("subjectRefHash") AS "subjectRefHash", count(*)::text AS count
         FROM "AdminSecurityEvent" WHERE "requestId" = $1`,
      [preProofRequestId],
    );
    expect(preProofSecurity.rows[0]).toEqual({
      action: 'ADMIN_AUTH_REQUEST_REJECTED',
      adminUserId: null,
      count: '1',
      subjectRefHash: null,
    });
  });

  it('fails safely without fallback when the contextual AuditLog sink is unavailable', async () => {
    await enableR4RevocationStepUp(ids.r4SinkActor);
    const operations = [
      {
        invoke: () =>
          request(application.getHttpServer())
            .delete('/api/v1/admin/auth/sessions/current')
            .set('Authorization', `Bearer ${accessTokens.get(ids.r4SinkCurrent)}`)
            .set('Origin', origin),
        sessionIds: [r4Sessions.get(ids.r4SinkCurrent)!.sessionId],
      },
      {
        invoke: () =>
          request(application.getHttpServer())
            .post(
              `/api/v1/admin/auth/sessions/${r4Sessions.get(ids.r4SinkTarget)!.sessionId}/revocations`,
            )
            .set('Authorization', `Bearer ${accessTokens.get(ids.r4SinkActor)}`)
            .set('Content-Type', 'application/json')
            .set('Origin', origin)
            .send({ operatorReason: 'Sink R4 indisponible', reasonCode: 'SECURITY_RESPONSE' }),
        sessionIds: [
          r4Sessions.get(ids.r4SinkActor)!.sessionId,
          r4Sessions.get(ids.r4SinkTarget)!.sessionId,
        ],
      },
      {
        invoke: async () => {
          const cookies = await r4RefreshCookies(ids.r4SinkRefresh);
          return request(application.getHttpServer())
            .post('/api/v1/admin/auth/sessions/refresh')
            .set('Cookie', cookies.cookie)
            .set('Origin', origin)
            .set('X-Kora-Csrf', cookies.csrf);
        },
        sessionIds: [r4Sessions.get(ids.r4SinkRefresh)!.sessionId],
      },
    ];

    for (const operation of operations) {
      const before = await owner.query<{
        accessTokenJti: string;
        consumedRefreshCount: string;
        expiresAt: Date;
        id: string;
        lastActivityAt: Date;
        refreshTokenCount: string;
        refreshTokenHash: string;
        refreshTokenVersion: number;
        revokedAt: Date | null;
      }>(
        `SELECT session."id", session."accessTokenJti", session."refreshTokenHash",
                session."refreshTokenVersion", session."lastActivityAt", session."expiresAt",
                session."revokedAt",
                (SELECT count(*)::text FROM "AdminRefreshToken" AS token
                  WHERE token."adminSessionId" = session."id") AS "refreshTokenCount",
                (SELECT count(*)::text FROM "AdminRefreshToken" AS token
                  WHERE token."adminSessionId" = session."id" AND token."consumedAt" IS NOT NULL)
                  AS "consumedRefreshCount"
           FROM "AdminSession" AS session
          WHERE session."id" = ANY($1::text[]) ORDER BY session."id"`,
        [operation.sessionIds],
      );
      const writer = application.get(AdminWriterService);
      const originalTransaction = writer.transaction.bind(writer);
      const transactionSpy = vi
        .spyOn(writer, 'transaction')
        .mockImplementation(
          async <T>(callback: (transaction: AdminWriterTransaction) => Promise<T>): Promise<T> =>
            originalTransaction(async (transaction) => {
              const failingTransaction: AdminWriterTransaction = {
                async query<Row extends QueryResultRow>(text: string, values: readonly unknown[]) {
                  if (/INSERT INTO "AuditLog"/u.test(text)) {
                    throw new Error('controlled contextual AuditLog sink outage');
                  }
                  return transaction.query<Row>(text, values);
                },
              };
              return callback(failingTransaction);
            }),
        );
      let response: request.Response;
      try {
        response = await operation.invoke();
      } finally {
        transactionSpy.mockRestore();
      }
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toMatch(
        /accessToken|refreshToken|selector|verifier/iu,
      );
      const requestId = String(response.body.requestId);
      const sinks = await owner.query<{ auditCount: string; securityCount: string }>(
        `SELECT
           (SELECT count(*)::text FROM "AuditLog" WHERE "requestId" = $1) AS "auditCount",
           (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "requestId" = $1)
             AS "securityCount"`,
        [requestId],
      );
      expect(sinks.rows[0]).toEqual({ auditCount: '0', securityCount: '0' });
      const after = await owner.query<{
        accessTokenJti: string;
        consumedRefreshCount: string;
        expiresAt: Date;
        id: string;
        lastActivityAt: Date;
        refreshTokenCount: string;
        refreshTokenHash: string;
        refreshTokenVersion: number;
        revokedAt: Date | null;
      }>(
        `SELECT session."id", session."accessTokenJti", session."refreshTokenHash",
                session."refreshTokenVersion", session."lastActivityAt", session."expiresAt",
                session."revokedAt",
                (SELECT count(*)::text FROM "AdminRefreshToken" AS token
                  WHERE token."adminSessionId" = session."id") AS "refreshTokenCount",
                (SELECT count(*)::text FROM "AdminRefreshToken" AS token
                  WHERE token."adminSessionId" = session."id" AND token."consumedAt" IS NOT NULL)
                  AS "consumedRefreshCount"
           FROM "AdminSession" AS session
          WHERE session."id" = ANY($1::text[]) ORDER BY session."id"`,
        [operation.sessionIds],
      );
      expect(after.rows).toEqual(before.rows);
    }
  });

  it('preserves unknown-COMMIT semantics for refresh and both revocation operations', async () => {
    await enableR4RevocationStepUp(ids.r4CommitActor);
    const operations = [
      {
        action: 'ADMIN_SESSION_REVOKED',
        businessTransaction: 2,
        invoke: () =>
          request(application.getHttpServer())
            .delete('/api/v1/admin/auth/sessions/current')
            .set('Authorization', `Bearer ${accessTokens.get(ids.r4CommitCurrent)}`)
            .set('Origin', origin),
        kind: 'revoke' as const,
        targetSessionId: r4Sessions.get(ids.r4CommitCurrent)!.sessionId,
      },
      {
        action: 'ADMIN_SESSION_REVOKED_BY_ADMIN',
        businessTransaction: 2,
        invoke: () =>
          request(application.getHttpServer())
            .post(
              `/api/v1/admin/auth/sessions/${r4Sessions.get(ids.r4CommitTarget)!.sessionId}/revocations`,
            )
            .set('Authorization', `Bearer ${accessTokens.get(ids.r4CommitActor)}`)
            .set('Content-Type', 'application/json')
            .set('Origin', origin)
            .send({ operatorReason: 'Commit R4 inconnu', reasonCode: 'SECURITY_RESPONSE' }),
        kind: 'revoke' as const,
        targetSessionId: r4Sessions.get(ids.r4CommitTarget)!.sessionId,
      },
      {
        action: 'ADMIN_SESSION_REFRESHED',
        businessTransaction: 1,
        invoke: async () => {
          const cookies = await r4RefreshCookies(ids.r4CommitRefresh);
          return request(application.getHttpServer())
            .post('/api/v1/admin/auth/sessions/refresh')
            .set('Cookie', cookies.cookie)
            .set('Origin', origin)
            .set('X-Kora-Csrf', cookies.csrf);
        },
        kind: 'refresh' as const,
        targetSessionId: r4Sessions.get(ids.r4CommitRefresh)!.sessionId,
      },
    ];

    for (const operation of operations) {
      const writer = application.get(AdminWriterService);
      const originalTransaction = writer.transaction.bind(writer);
      let transactionCalls = 0;
      const transactionSpy = vi
        .spyOn(writer, 'transaction')
        .mockImplementation(
          async <T>(callback: (transaction: AdminWriterTransaction) => Promise<T>): Promise<T> => {
            transactionCalls += 1;
            const result = await originalTransaction(callback);
            if (transactionCalls === operation.businessTransaction) {
              throw new AdminWriterCommitUnknownError(
                new Error('controlled R4 lost COMMIT acknowledgement after callback'),
              );
            }
            return result;
          },
        );
      let response: request.Response;
      try {
        response = await operation.invoke();
      } finally {
        transactionSpy.mockRestore();
      }
      expect(response.status).toBe(503);
      expect(response.body.error).toEqual({
        code: 'SERVICE_UNAVAILABLE',
        details: {},
        message: 'Service temporairement indisponible.',
        retryable: false,
      });
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toMatch(
        /accessToken|refreshToken|selector|verifier/iu,
      );
      const requestId = String(response.body.requestId);
      const sinks = await owner.query<{ action: string; securityCount: string }>(
        `SELECT min("action") AS "action",
                (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "requestId" = $1)
                  AS "securityCount"
           FROM "AuditLog" WHERE "requestId" = $1`,
        [requestId],
      );
      expect(sinks.rows[0]).toEqual({ action: operation.action, securityCount: '0' });
      const state = await owner.query<{
        consumedRefreshCount: string;
        refreshTokenCount: string;
        refreshTokenVersion: number;
        revokedAt: Date | null;
      }>(
        `SELECT session."revokedAt", session."refreshTokenVersion",
                (SELECT count(*)::text FROM "AdminRefreshToken" AS token
                  WHERE token."adminSessionId" = session."id") AS "refreshTokenCount",
                (SELECT count(*)::text FROM "AdminRefreshToken" AS token
                  WHERE token."adminSessionId" = session."id" AND token."consumedAt" IS NOT NULL)
                  AS "consumedRefreshCount"
           FROM "AdminSession" AS session WHERE session."id" = $1`,
        [operation.targetSessionId],
      );
      if (operation.kind === 'revoke') {
        expect(state.rows[0]!.revokedAt).not.toBeNull();
      } else {
        expect(state.rows[0]).toMatchObject({
          consumedRefreshCount: '1',
          refreshTokenCount: '2',
          refreshTokenVersion: 2,
          revokedAt: null,
        });
      }
    }
  });

  it('does not assert a contradictory rejection when COMMIT acknowledgement is unknown', async () => {
    const server = application.getHttpServer();
    const writer = application.get(AdminWriterService);
    const originalTransaction = writer.transaction.bind(writer);
    let transactionCalls = 0;
    const transactionSpy = vi
      .spyOn(writer, 'transaction')
      .mockImplementation(
        async <T>(callback: (transaction: AdminWriterTransaction) => Promise<T>): Promise<T> => {
          transactionCalls += 1;
          const result = await originalTransaction(callback);
          if (transactionCalls === 2) {
            throw new AdminWriterCommitUnknownError(
              new Error('controlled lost COMMIT acknowledgement after callback'),
            );
          }
          return result;
        },
      );
    const code = currentTotp(ids.commitUnknown);
    let response: request.Response;
    try {
      response = await request(server)
        .post('/api/v1/admin/auth/step-up')
        .set('Authorization', `Bearer ${accessTokens.get(ids.commitUnknown)}`)
        .set('Content-Type', 'application/json')
        .set('Origin', origin)
        .send({ purpose: 'SESSION_REVOCATION', totpCode: code });
    } finally {
      transactionSpy.mockRestore();
    }
    expect(response.status).toBe(503);
    expect(response.body.error).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      details: {},
      message: 'Service temporairement indisponible.',
      retryable: false,
    });
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain(code);

    const state = await owner.query<{
      failureAuditCount: string;
      lastAcceptedTotpCounter: string | null;
      securityEventCount: string;
      successAuditCount: string;
      stepUpPurpose: string | null;
    }>(
      `SELECT
         (SELECT "lastAcceptedTotpCounter"::text FROM "AdminUser" WHERE "id" = $1)
           AS "lastAcceptedTotpCounter",
         (SELECT "stepUpPurpose"::text FROM "AdminSession" WHERE "adminUserId" = $1)
           AS "stepUpPurpose",
         (SELECT count(*)::text FROM "AuditLog"
           WHERE "adminUserId" = $1 AND "action" = 'ADMIN_SESSION_STEP_UP')
           AS "successAuditCount",
         (SELECT count(*)::text FROM "AuditLog"
           WHERE "adminUserId" = $1 AND "action" = 'ADMIN_SESSION_STEP_UP_REJECTED')
           AS "failureAuditCount",
         (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "adminUserId" = $1)
           AS "securityEventCount"`,
      [ids.commitUnknown],
    );
    expect(state.rows[0]).toEqual({
      failureAuditCount: '0',
      lastAcceptedTotpCounter: expect.any(String),
      securityEventCount: '0',
      stepUpPurpose: 'SESSION_REVOCATION',
      successAuditCount: '1',
    });
  });

  it('rolls back the privileged mutation when the AuditLog sink fails', async () => {
    const server = application.getHttpServer();
    const writer = application.get(AdminWriterService);
    const originalTransaction = writer.transaction.bind(writer);
    const transactionSpy = vi
      .spyOn(writer, 'transaction')
      .mockImplementation(
        async <T>(callback: (transaction: AdminWriterTransaction) => Promise<T>): Promise<T> =>
          originalTransaction(async (transaction) => {
            const failingTransaction: AdminWriterTransaction = {
              async query<Row extends QueryResultRow>(text: string, values: readonly unknown[]) {
                if (/INSERT INTO "AuditLog"/u.test(text)) {
                  throw new Error('controlled AuditLog sink failure');
                }
                return transaction.query<Row>(text, values);
              },
            };
            return callback(failingTransaction);
          }),
      );
    const code = currentTotp(ids.sinkFailure);
    let failed: request.Response;
    try {
      failed = await request(server)
        .post('/api/v1/admin/auth/step-up')
        .set('Authorization', `Bearer ${accessTokens.get(ids.sinkFailure)}`)
        .set('Content-Type', 'application/json')
        .set('Origin', origin)
        .send({ purpose: 'SESSION_REVOCATION', totpCode: code });
    } finally {
      transactionSpy.mockRestore();
    }
    expect(failed.status).toBe(503);
    expect(failed.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(JSON.stringify(failed.body)).not.toContain(code);

    const sessionClaims = await crypto.verifyAccessToken(
      accessTokens.get(ids.sinkFailure)!,
      Math.floor(Date.now() / 1000),
    );
    const rolledBack = await owner.query<{
      auditCount: string;
      failureAuditCount: string;
      lastAcceptedTotpCounter: string | null;
      securityEventCount: string;
      stepUpPurpose: string | null;
      stepUpVerifiedAt: Date | null;
    }>(
      `SELECT
         (SELECT "lastAcceptedTotpCounter"::text FROM "AdminUser" WHERE "id" = $1)
           AS "lastAcceptedTotpCounter",
         (SELECT "stepUpPurpose"::text FROM "AdminSession" WHERE "id" = $2)
           AS "stepUpPurpose",
         (SELECT "stepUpVerifiedAt" FROM "AdminSession" WHERE "id" = $2)
           AS "stepUpVerifiedAt",
         (SELECT count(*)::text FROM "AuditLog"
           WHERE "adminUserId" = $1 AND "action" = 'ADMIN_SESSION_STEP_UP') AS "auditCount",
         (SELECT count(*)::text FROM "AuditLog" WHERE "requestId" = $3)
           AS "failureAuditCount",
         (SELECT count(*)::text FROM "AdminSecurityEvent" WHERE "requestId" = $3)
           AS "securityEventCount"`,
      [ids.sinkFailure, sessionClaims.sessionId, String(failed.body.requestId)],
    );
    expect(rolledBack.rows[0]).toMatchObject({
      auditCount: '0',
      failureAuditCount: '0',
      lastAcceptedTotpCounter: null,
      securityEventCount: '0',
      stepUpPurpose: null,
      stepUpVerifiedAt: null,
    });
  });

  it('bounds PostgreSQL, Redis, key-provider and unknown-COMMIT failures behind 503', async () => {
    const server = application.getHttpServer();
    const writer = application.get(AdminWriterService);
    const writerRole = process.env.S1203C1_E2E_WRITER_USER;
    if (writerRole === undefined || !/^[a-z][a-z0-9_]{0,62}$/u.test(writerRole)) {
      throw new Error('The isolated writer role failed its identifier guard.');
    }
    const databaseStarted = Date.now();
    let unavailableDatabase: request.Response;
    await owner.query(`ALTER ROLE "${writerRole}" NOLOGIN`);
    try {
      await owner.query(
        `SELECT pg_terminate_backend("pid") FROM "pg_stat_activity"
          WHERE "usename" = $1 AND "pid" <> pg_backend_pid()`,
        [writerRole],
      );
      unavailableDatabase = await request(server)
        .post('/api/v1/admin/auth/login')
        .set('Content-Type', 'application/json')
        .set('Origin', origin)
        .set('Sec-Fetch-Site', 'same-origin')
        .send({ email: 'totp@example.invalid', password });
    } finally {
      await owner.query(`ALTER ROLE "${writerRole}" LOGIN`);
    }
    expect(unavailableDatabase.status).toBe(503);
    expect(unavailableDatabase.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(Date.now() - databaseStarted).toBeLessThan(2_000);

    const unknownCommit = vi
      .spyOn(writer, 'transaction')
      .mockRejectedValueOnce(
        new AdminWriterCommitUnknownError(new Error('controlled lost COMMIT acknowledgement')),
      );
    let unknownCommitResponse: request.Response;
    try {
      unknownCommitResponse = await request(server)
        .post('/api/v1/admin/auth/login')
        .set('Content-Type', 'application/json')
        .set('Origin', origin)
        .set('Sec-Fetch-Site', 'same-origin')
        .send({ email: 'totp@example.invalid', password });
    } finally {
      unknownCommit.mockRestore();
    }
    expect(unknownCommitResponse.status).toBe(503);
    expect(unknownCommitResponse.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(unknownCommitResponse.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(unknownCommitResponse.body)).not.toMatch(
      /accessToken|preAuthToken|refreshToken/iu,
    );

    keys.fail('KEYED_DIGEST');
    const keyStarted = Date.now();
    let unavailableKey: request.Response;
    try {
      unavailableKey = await request(server)
        .post('/api/v1/admin/auth/login')
        .set('Content-Type', 'application/json')
        .set('Origin', origin)
        .set('Sec-Fetch-Site', 'same-origin')
        .send({ email: 'totp@example.invalid', password });
    } finally {
      keys.recover();
    }
    expect(unavailableKey.status).toBe(503);
    expect(unavailableKey.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(Date.now() - keyStarted).toBeLessThan(2_000);

    const unavailableRedisApplication = await createApplication({
      adminKeyProvider: keys,
      environment: {
        ...runtimeEnvironment,
        ADMIN_REDIS_PORT: '1',
        READINESS_TIMEOUT_MS: '250',
      },
    });
    try {
      const redisStarted = Date.now();
      const unavailableRedis = await request(unavailableRedisApplication.getHttpServer())
        .post('/api/v1/admin/auth/login')
        .set('Content-Type', 'application/json')
        .set('Origin', origin)
        .set('Sec-Fetch-Site', 'same-origin')
        .send({ email: 'totp@example.invalid', password });
      expect(unavailableRedis.status).toBe(503);
      expect(unavailableRedis.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(Date.now() - redisStarted).toBeLessThan(2_000);
      await request(unavailableRedisApplication.getHttpServer()).get('/health/live').expect(200);
    } finally {
      await unavailableRedisApplication.close();
    }
    await request(server).get('/health/live').expect(200);
    await request(server).get('/health/ready').expect(200);
  });

  it('keeps public login failures uniform and reports timing distributions without a verdict', async () => {
    const redis = new Redis({
      enableOfflineQueue: false,
      host: '127.0.0.1',
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      port: Number(process.env.S1203C1_E2E_REDIS_PORT),
      retryStrategy: () => null,
    });
    await redis.connect();
    const cases = [
      ['unknown', 'unknown@example.invalid', password],
      ['bad_password', 'totp@example.invalid', 'wrong-password-value'],
      ['disabled', 'disabled@example.invalid', password],
      ['suspended', 'suspended@example.invalid', password],
      ['noise_control_bad_password', 'totp@example.invalid', 'wrong-password-value'],
    ] as const;
    const durations = new Map<string, number[]>();
    const executeCase = async (
      label: string,
      email: string,
      suppliedPassword: string,
      record: boolean,
    ): Promise<void> => {
      await redis.flushdb();
      const started = process.hrtime.bigint();
      const response = await request(application.getHttpServer())
        .post('/api/v1/admin/auth/login')
        .set('Content-Type', 'application/json')
        .set('Origin', origin)
        .set('Sec-Fetch-Site', 'same-origin')
        .send({ email, password: suppliedPassword });
      const elapsed = Number(process.hrtime.bigint() - started) / 1_000_000;
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('AUTH_INVALID_CREDENTIALS');
      if (record) durations.set(label, [...(durations.get(label) ?? []), elapsed]);
    };
    try {
      for (const [label, email, suppliedPassword] of cases) {
        await executeCase(label, email, suppliedPassword, false);
      }
      for (let round = 0; round < 8; round += 1) {
        const randomized = [...cases];
        for (let index = randomized.length - 1; index > 0; index -= 1) {
          const swapIndex = randomInt(index + 1);
          const current = randomized[index];
          const replacement = randomized[swapIndex];
          if (!current || !replacement) throw new Error('Anti-oracle shuffle index invalid.');
          randomized[index] = replacement;
          randomized[swapIndex] = current;
        }
        for (const [label, email, suppliedPassword] of randomized) {
          await executeCase(label, email, suppliedPassword, true);
        }
      }
    } finally {
      redis.disconnect(false);
    }
    const unknown = durations.get('unknown') ?? [];
    const cliffsDelta = (left: readonly number[], right: readonly number[]): number => {
      let score = 0;
      for (const leftValue of left) {
        for (const rightValue of right) score += Math.sign(leftValue - rightValue);
      }
      return score / (left.length * right.length);
    };
    const percentile = (values: readonly number[], fraction: number): number => {
      const ordered = [...values].sort((left, right) => left - right);
      const index = (ordered.length - 1) * fraction;
      const lower = Math.floor(index);
      const upper = Math.ceil(index);
      const lowerValue = ordered[lower];
      const upperValue = ordered[upper];
      if (lowerValue === undefined || upperValue === undefined) {
        throw new Error('Anti-oracle percentile requires a non-empty sample.');
      }
      return lowerValue + (upperValue - lowerValue) * (index - lower);
    };
    const bootstrapMedianInterval = (values: readonly number[]): readonly [number, number] => {
      let state = 0x31c1_2026;
      const nextIndex = (): number => {
        state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
        return Math.floor((state / 0x1_0000_0000) * values.length);
      };
      const medians = Array.from({ length: 2_000 }, () => {
        const sample = Array.from({ length: values.length }, () => {
          const value = values[nextIndex()];
          if (value === undefined) throw new Error('Anti-oracle bootstrap index invalid.');
          return value;
        });
        return percentile(sample, 0.5);
      });
      return [percentile(medians, 0.025), percentile(medians, 0.975)];
    };
    const noiseControl = durations.get('noise_control_bad_password') ?? [];
    const summary = Object.fromEntries(
      [...durations.entries()].map(([label, values]) => [
        label,
        {
          bootstrapMedian95IntervalMs: bootstrapMedianInterval(values),
          interquartileIntervalMs: [percentile(values, 0.25), percentile(values, 0.75)],
          maximumMs: Math.max(...values),
          medianMs: percentile(values, 0.5),
          minimumMs: Math.min(...values),
          samples: values.length,
          sortedMs: [...values].sort((left, right) => left - right),
          versusNoiseControlCliffsDelta: cliffsDelta(values, noiseControl),
          versusUnknownCliffsDelta: cliffsDelta(values, unknown),
        },
      ]),
    );
    process.stdout.write(`C1_ANTI_ORACLE_OBSERVATIONS ${JSON.stringify(summary)}\n`);
    expect([...durations.values()].every((values) => values.length === 8)).toBe(true);
  });

  it('fails C1 closed without a qualified key provider while preserving historical health', async () => {
    const unavailableApplication = await createApplication({
      environment: runtimeEnvironment,
    });
    try {
      const unavailable = await request(unavailableApplication.getHttpServer())
        .post('/api/v1/admin/auth/login')
        .set('Content-Type', 'application/json')
        .set('Origin', origin)
        .set('Sec-Fetch-Site', 'same-origin')
        .send({ email: 'totp@example.invalid', password });
      expect(unavailable.status).toBe(503);
      expect(unavailable.body).toMatchObject({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          details: {},
          message: 'Service temporairement indisponible.',
          retryable: false,
        },
      });
      await request(unavailableApplication.getHttpServer()).get('/health/live').expect(200);
      await request(unavailableApplication.getHttpServer()).get('/health/ready').expect(200);
    } finally {
      await unavailableApplication.close();
    }
  });

  it('rewraps an accepted TOTP envelope under the active rotated key', async () => {
    const server = application.getHttpServer();
    const before = await owner.query<{ totpSecretEncrypted: string }>(
      `SELECT "totpSecretEncrypted" FROM "AdminUser" WHERE "id" = $1`,
      [ids.rotateEnvelope],
    );
    const previousKeyId = (JSON.parse(before.rows[0]!.totpSecretEncrypted) as { keyId: string })
      .keyId;
    const activeKeyId = keys.rotateEnvelopeKey();
    expect(activeKeyId).not.toBe(previousKeyId);

    const cookies = await loginBrowser(server, 'rotate-envelope@example.invalid');
    const verified = await request(server)
      .post('/api/v1/admin/auth/totp/verify')
      .set('Content-Type', 'application/json')
      .set('Cookie', cookies.cookie)
      .set('Origin', origin)
      .set('X-Kora-Csrf', cookies.csrf)
      .send({ code: currentTotp(ids.rotateEnvelope) });
    expect(verified.status).toBe(200);

    const after = await owner.query<{ totpSecretEncrypted: string }>(
      `SELECT "totpSecretEncrypted" FROM "AdminUser" WHERE "id" = $1`,
      [ids.rotateEnvelope],
    );
    const envelope = after.rows[0]!.totpSecretEncrypted;
    expect((JSON.parse(envelope) as { keyId: string }).keyId).toBe(activeKeyId);
    const decrypted = await crypto.decryptTotpSecret(envelope, ids.rotateEnvelope);
    try {
      expect(decrypted.needsRewrap).toBe(false);
      expect(
        Buffer.from(decrypted.secret).equals(Buffer.from(seeds.get(ids.rotateEnvelope)!)),
      ).toBe(true);
    } finally {
      decrypted.secret.fill(0);
    }
  });
});
