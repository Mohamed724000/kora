import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod, type INestApplication } from '@nestjs/common';
import { execFileSync } from 'node:child_process';
import { createHash, randomInt, type KeyObject } from 'node:crypto';
import Redis from 'ioredis';
import pg, { type QueryResultRow } from 'pg';
import request from 'supertest';
import { AdminAuthController } from '../src/admin-auth/admin-auth.controller';
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
import {
  ADMIN_REQUEST_POLICY,
  type AdminRequestPolicy,
} from '../src/admin-auth/admin-request-policy';
import { createApplication } from '../src/app.factory';
import {
  AdminWriterCommitUnknownError,
  AdminWriterService,
  type AdminWriterTransaction,
} from '../src/database/admin-writer.service';

const { Client } = pg;

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

realRedis('Admin C1 real Redis durability', () => {
  jest.setTimeout(30_000);

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
  private failedDigestAfter = 0;
  private failedDigestDomain: string | undefined;
  private matchedDigestCalls = 0;

  constructor(private readonly delegate: AdminKeyProvider) {}

  fail(operation: AdminKeyProviderOperation): void {
    this.failed = operation;
  }

  failKeyedDigestDomain(domain: string, afterSuccessfulMatches = 0): void {
    this.failedDigestDomain = domain;
    this.failedDigestAfter = afterSuccessfulMatches;
    this.matchedDigestCalls = 0;
  }

  recover(): void {
    this.failed = undefined;
    this.failedDigestAfter = 0;
    this.failedDigestDomain = undefined;
    this.matchedDigestCalls = 0;
  }

  async assertAvailable(): Promise<void> {
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

realHttp('Admin C1 real HTTP/PostgreSQL/Redis journeys', () => {
  jest.setTimeout(300_000);

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
  } as const;
  const seeds = new Map<string, Uint8Array>();
  const keys = new TestEphemeralAdminKeyProvider();
  const faultKeys = new OperationFaultKeyProvider(keys);
  const crypto = new AdminAuthCrypto(keys);
  const accessTokens = new Map<string, string>();
  const recoveryMaterials = new Map<string, Readonly<{ selector: string; verifier: string }>>();
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
       VALUES ($1, $2, $3, 'SUPER_ADMIN', $4, 1, $5, $6, NULL, CURRENT_TIMESTAMP)`,
      [id, email, passwordHash, status, encrypted, withTotp ? new Date() : null],
    );
  }

  async function insertSession(adminUserId: string, sequence: number): Promise<string> {
    const sessionId = deterministicUuid(1_000 + sequence);
    const now = new Date();
    const accessToken = await crypto.issueAccessToken(
      {
        adminUserId,
        authorizationVersion: 1,
        role: 'SUPER_ADMIN',
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
        createHash('sha256').update(`fixture-refresh-${sequence}`).digest('hex'),
        now,
        new Date(now.getTime() + 8 * 60 * 60 * 1000),
        new Date(now.getTime() + 12 * 60 * 60 * 1000),
      ],
    );
    return accessToken;
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
    for (let index = 1; index <= 3; index += 1) await insertSession(ids.totp, index);
    for (let index = 20; index <= 22; index += 1) await insertSession(ids.concurrent, index);
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
    recoveryMaterials.set(ids.recovery, await insertRecoveryCode(ids.recovery, 1));
    recoveryMaterials.set(ids.binding, await insertRecoveryCode(ids.binding, 2));
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
  });

  beforeEach(async () => {
    await rateLimitRedis.flushdb();
    faultKeys.recover();
    keys.recover();
  });

  afterAll(async () => {
    rateLimitRedis?.disconnect(false);
    await faultApplication?.close();
    await application?.close();
    await owner.end();
    for (const seed of seeds.values()) seed.fill(0);
    delete process.env.S1203C1_ROTATE_TOKEN;
    delete process.env.S1203C1_STEP_UP_TOKEN;
    delete process.env.S1203C1_TARGET_TOKEN;
  });

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
    const confirmationReplay = await request(server)
      .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/confirm`)
      .set('Content-Type', 'application/json')
      .set('Cookie', firstCookies.cookie)
      .set('Idempotency-Key', 'enrollment-confirm-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', firstCookies.csrf)
      .send({ code: initialCode });
    expect(confirmationReplay.status).not.toBe(200);
    expect(confirmationReplay.body.data?.recoveryCodes).toBeUndefined();

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
    expect(reused.status).toBe(401);
    expect(reused.body.error.code).toBe('OTP_INVALID');

    const state = await owner.query<{ lastAcceptedTotpCounter: string }>(
      `SELECT "lastAcceptedTotpCounter"::text AS "lastAcceptedTotpCounter"
         FROM "AdminUser" WHERE "id" = $1`,
      [ids.doubleTotp],
    );
    expect(state.rows[0]!.lastAcceptedTotpCounter).not.toBeNull();
  });

  it('keeps at most three active families while concurrent verifications request a fourth', async () => {
    const server = application.getHttpServer();
    const first = await loginBrowser(server, 'concurrent@example.invalid');
    const second = await loginBrowser(server, 'concurrent@example.invalid');
    const seed = seeds.get(ids.concurrent);
    if (seed === undefined) throw new Error('Missing concurrent fixture TOTP seed.');
    const counter = BigInt(Math.floor(Date.now() / 30_000));
    const requests = Promise.all([
      request(server)
        .post('/api/v1/admin/auth/totp/verify')
        .set('Content-Type', 'application/json')
        .set('Cookie', first.cookie)
        .set('Origin', origin)
        .set('X-Kora-Csrf', first.csrf)
        .send({ code: crypto.generateTotpCode(seed, counter) }),
      request(server)
        .post('/api/v1/admin/auth/totp/verify')
        .set('Content-Type', 'application/json')
        .set('Cookie', second.cookie)
        .set('Origin', origin)
        .set('X-Kora-Csrf', second.csrf)
        .send({ code: crypto.generateTotpCode(seed, counter + 1n) }),
    ]);
    let settled = false;
    void requests.finally(() => {
      settled = true;
    });
    let maximumObserved = 0;
    while (!settled) {
      const observed = await owner.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM "AdminSession"
          WHERE "adminUserId" = $1 AND "revokedAt" IS NULL`,
        [ids.concurrent],
      );
      maximumObserved = Math.max(maximumObserved, Number(observed.rows[0]!.count));
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
    }
    const responses = await requests;
    const finalState = await owner.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "AdminSession"
        WHERE "adminUserId" = $1 AND "revokedAt" IS NULL`,
      [ids.concurrent],
    );
    maximumObserved = Math.max(maximumObserved, Number(finalState.rows[0]!.count));
    expect(responses.filter(({ status }) => status === 200).length).toBeGreaterThanOrEqual(1);
    expect(responses.every(({ status }) => status === 200 || status === 401)).toBe(true);
    expect(maximumObserved).toBeLessThanOrEqual(3);
    expect(Number(finalState.rows[0]!.count)).toBeLessThanOrEqual(3);
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
    expect(expiredAttempt.status).toBe(401);
    expect(expiredAttempt.body.error.code).toBe('ADMIN_RECOVERY_CODE_INVALID');

    const foreign = await loginBrowser(server, 'binding@example.invalid');
    const foreignAttempt = await request(server)
      .post('/api/v1/admin/auth/recovery-codes/verify')
      .set('Content-Type', 'application/json')
      .set('Cookie', foreign.cookie)
      .set('Origin', origin)
      .set('X-Kora-Csrf', foreign.csrf)
      .send(recovery);
    expect(foreignAttempt.status).toBe(401);
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
    expect(replay.status).toBe(401);
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
    const qrSpy = jest
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

    const retried = await request(server)
      .post(`/api/v1/admin/auth/totp/enrollments/${enrollmentId}/qr`)
      .set('Cookie', cookies.cookie)
      .set('Idempotency-Key', 'qr-failure-delivery-0001')
      .set('Origin', origin)
      .set('X-Kora-Csrf', cookies.csrf);
    expect(retried.status).toBe(200);
    expect(retried.headers['content-type']).toMatch(/^image\/png/u);
  });

  it('rolls back the privileged mutation when the AuditLog sink fails', async () => {
    const server = application.getHttpServer();
    const writer = application.get(AdminWriterService);
    const originalTransaction = writer.transaction.bind(writer);
    const transactionSpy = jest
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
      lastAcceptedTotpCounter: string | null;
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
           WHERE "adminUserId" = $1 AND "action" = 'ADMIN_SESSION_STEP_UP') AS "auditCount"`,
      [ids.sinkFailure, sessionClaims.sessionId],
    );
    expect(rolledBack.rows[0]).toMatchObject({
      auditCount: '0',
      lastAcceptedTotpCounter: null,
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

    const unknownCommit = jest
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
