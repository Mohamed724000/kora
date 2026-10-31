import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, sep } from 'node:path';

const WORKSPACE_ROOT = '/workspace';
const BUILT_SOURCE_ROOT = '/workspace/apps/api/dist/src';
const CHANNEL_ROOT = '/run/kora-c3-private';
const MAX_CHANNEL_FILE_BYTES = 8192;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const TOTP_PATTERN = /^\d{6}$/u;
const IDEMPOTENCY_PATTERN = /^[\x21-\x7e]{16,128}$/u;
const runtimeRequire = createRequire(__filename);

type HarnessMode = 'api' | 'notification';
type JsonRecord = Record<string, unknown>;
type C3PrivateRejectionCode =
  | 'PASSWORD_ISOLATION_KEYS'
  | 'PASSWORD_ISOLATION_COUNT'
  | 'PASSWORD_ISOLATION_TARGET'
  | 'PASSWORD_ISOLATION_REDIS_COUNT'
  | 'PASSWORD_ISOLATION_REDIS_TTL'
  | 'PASSWORD_ISOLATION_REDIS_RESULT'
  | 'PASSWORD_ISOLATION_REDIS_INVARIANT'
  | 'PASSWORD_ISOLATION_WAITAOF_TIMEOUT'
  | 'PASSWORD_ISOLATION_WAITAOF_ERROR'
  | 'PASSWORD_ISOLATION_WAITAOF_RESULT'
  | 'RECOVERY_ISOLATION_KEYS'
  | 'RECOVERY_ISOLATION_COUNT'
  | 'RECOVERY_ISOLATION_TARGET'
  | 'RECOVERY_ISOLATION_REDIS_COUNT'
  | 'RECOVERY_ISOLATION_REDIS_TTL'
  | 'RECOVERY_ISOLATION_REDIS_RESULT'
  | 'RECOVERY_ISOLATION_REDIS_INVARIANT'
  | 'RECOVERY_ISOLATION_WAITAOF_TIMEOUT'
  | 'RECOVERY_ISOLATION_WAITAOF_ERROR'
  | 'RECOVERY_ISOLATION_WAITAOF_RESULT'
  | 'REFRESH_ISOLATION_KEYS'
  | 'REFRESH_ISOLATION_COUNT'
  | 'REFRESH_ISOLATION_TARGET'
  | 'REFRESH_ISOLATION_REDIS_COUNT'
  | 'REFRESH_ISOLATION_REDIS_TTL'
  | 'REFRESH_ISOLATION_REDIS_RESULT'
  | 'REFRESH_ISOLATION_REDIS_INVARIANT'
  | 'REFRESH_ISOLATION_WAITAOF_TIMEOUT'
  | 'REFRESH_ISOLATION_WAITAOF_ERROR'
  | 'REFRESH_ISOLATION_WAITAOF_RESULT'
  | 'TOTP_ISOLATION_KEYS'
  | 'TOTP_ISOLATION_COUNT'
  | 'TOTP_ISOLATION_TARGET'
  | 'TOTP_ISOLATION_REDIS_COUNT'
  | 'TOTP_ISOLATION_REDIS_TTL'
  | 'TOTP_ISOLATION_REDIS_RESULT'
  | 'TOTP_ISOLATION_REDIS_INVARIANT'
  | 'TOTP_ISOLATION_WAITAOF_TIMEOUT'
  | 'TOTP_ISOLATION_WAITAOF_ERROR'
  | 'TOTP_ISOLATION_WAITAOF_RESULT';

class C3PrivateRejection extends Error {
  readonly code: C3PrivateRejectionCode;

  constructor(code: C3PrivateRejectionCode) {
    super('C3 private fixture rejected.');
    this.name = 'C3PrivateRejection';
    this.code = code;
  }
}

interface NestApplicationLike {
  close(): Promise<void>;
  get<T>(token: unknown): T;
  listen(port: number, host: string): Promise<unknown>;
}

interface ApplicationContextLike {
  close(): Promise<void>;
  get<T>(token: unknown): T;
}

interface PasswordCompromisePortLike {
  checkPassword(
    passwordUtf8: string,
    options: Readonly<{ signal: AbortSignal; timeoutMs: 3000 }>,
  ): Promise<'SAFE' | 'COMPROMISED'>;
}

interface NotificationDeliveryLike {
  readonly logicalDeliveryId: string;
  readonly payload: Readonly<Record<string, string>>;
  readonly purpose: 'PASSWORD_RESET' | 'INVITATION';
  readonly signal: AbortSignal;
}

interface NotificationPortLike {
  assertConfigured(): Promise<void>;
  deliver(
    delivery: NotificationDeliveryLike,
  ): Promise<
    | { readonly acknowledgement: string; readonly kind: 'ACCEPTED' }
    | { readonly kind: 'ACKNOWLEDGEMENT_UNUSABLE' }
    | { readonly kind: 'NOT_ACCEPTED'; readonly retryable: boolean }
  >;
  reconcile(
    logicalDeliveryId: string,
    signal: AbortSignal,
  ): Promise<'ACCEPTED' | 'NOT_FOUND' | 'UNKNOWN'>;
}

interface AdminPrincipalLike {
  readonly adminUserId: string;
  readonly authorizationVersion: number;
  readonly role: string;
  readonly sessionId: string;
}

interface AdminSessionServiceLike {
  authenticate(
    authorization: string | undefined,
    now?: Date,
    updateActivity?: boolean,
  ): Promise<AdminPrincipalLike>;
  revokeCurrent(principal: AdminPrincipalLike, requestId: string): Promise<void>;
  refresh(refreshToken: string, requestId: string, ipAddress: string, now?: Date): Promise<unknown>;
}

interface AdminAuthServiceLike {
  login(
    input: Readonly<{ email: string; password: string }>,
    execution: Readonly<{ ipAddress: string; requestId: string }>,
    now?: Date,
  ): Promise<
    Readonly<{
      challengeId: string;
      csrfToken: string;
      expiresAt: string;
      nextStep: 'FIRST_TOTP_ENROLLMENT' | 'TOTP_VERIFY';
      preAuthToken: string;
    }>
  >;
  stepUp(
    principal: AdminPrincipalLike,
    input: Readonly<{ purpose: 'INVITATION'; totpCode: string }>,
    execution: Readonly<{ ipAddress: string; requestId: string }>,
    now?: Date,
  ): Promise<unknown>;
}

interface AdminSecurityServiceLike {
  acceptInvitation(
    input: Readonly<{ invitationCode: string; password: string }>,
    execution: Readonly<{ ipAddress: string; requestId: string }>,
    now?: Date,
  ): Promise<unknown>;
  createInvitation(
    authorization: string | undefined,
    idempotencyKey: string,
    input: Readonly<{
      deliveryEmail: string;
      emailCanonical: string;
      operatorReason: string;
      reasonCode: 'INVITATION_ADMINISTRATION';
      role: 'SUPPORT';
    }>,
    execution: Readonly<{ requestId: string }>,
    now?: Date,
  ): Promise<Readonly<{ invitationId: string }>>;
}

interface AdminRateLimitServiceLike {
  consume(scope: string, ipAddress: string, subject: string): Promise<unknown>;
}

interface AdminRateLimitRedisClientLike {
  call(command: string, ...args: unknown[]): Promise<unknown>;
  eval(script: string, numberOfKeys: number, ...args: unknown[]): Promise<unknown>;
}

interface AdminSecurityRepositoryLike {
  transaction<T>(callback: (transaction: unknown) => Promise<T>): Promise<T>;
}

interface SafeTransactionFailure {
  readonly constraint: string | null;
  readonly primaryCode: string | null;
  readonly transactionCode: string | null;
}

function safeDiagnosticField(value: unknown, key: string, pattern: RegExp): string | null {
  if (value === null || typeof value !== 'object') return null;
  const candidate = Reflect.get(value, key) as unknown;
  return typeof candidate === 'string' && pattern.test(candidate) ? candidate : null;
}

function safeTransactionFailure(error: unknown): SafeTransactionFailure {
  const primaryError =
    error !== null && typeof error === 'object'
      ? (Reflect.get(error, 'primaryError') as unknown)
      : undefined;
  return {
    constraint: safeDiagnosticField(primaryError, 'constraint', /^[A-Za-z0-9_]{1,128}$/u),
    primaryCode: safeDiagnosticField(primaryError, 'code', /^[0-9A-Z]{5}$/u),
    transactionCode: safeDiagnosticField(error, 'code', /^[A-Z_]{3,64}$/u),
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`Missing ${name}.`);
  return value;
}

function exactRecord(value: unknown, keys: readonly string[]): JsonRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid channel message.');
  }
  const record = value as JsonRecord;
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error('Invalid channel message.');
  }
  return record;
}

function constantTimeTextEqual(left: string, right: string): boolean {
  const leftDigest = createHash('sha256').update(left, 'utf8').digest();
  const rightDigest = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function assertInside(root: string, candidate: string): string {
  const resolvedRoot = realpathSync(root);
  const resolvedCandidate = realpathSync(candidate);
  const pathFromRoot = relative(resolvedRoot, resolvedCandidate);
  if (pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..')) {
    return resolvedCandidate;
  }
  throw new Error('Resolved path escaped its boundary.');
}

function assertDirectory(root: string, path: string): void {
  const entry = lstatSync(path);
  if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error('Invalid channel directory.');
  assertInside(root, path);
}

function loadBuiltModule<T>(path: string): T {
  if (!/^[a-z0-9./-]+\.js$/u.test(path) || path.includes('..')) {
    throw new Error('Invalid built module path.');
  }
  const builtRoot = realpathSync(BUILT_SOURCE_ROOT);
  const builtFile = assertInside(builtRoot, resolve(builtRoot, path));
  if (lstatSync(builtFile).isSymbolicLink() || !statSync(builtFile).isFile()) {
    throw new Error('Invalid built module.');
  }
  return runtimeRequire(builtFile) as T;
}

function readBoundedJson(path: string): unknown {
  const entry = lstatSync(path);
  if (entry.isSymbolicLink() || !entry.isFile() || entry.size > MAX_CHANNEL_FILE_BYTES) {
    throw new Error('Invalid channel file.');
  }
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

function writeAtomicJson(directory: string, filename: string, value: unknown): void {
  if (!/^[a-zA-Z0-9._-]+\.json$/u.test(filename)) throw new Error('Invalid output filename.');
  const target = join(directory, filename);
  if (existsSync(target)) throw new Error('Channel output already exists.');
  const temporary = join(directory, `.${filename}.${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeSync(descriptor, `${JSON.stringify(value)}\n`, undefined, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporary, target);
    const directoryDescriptor = openSync(directory, 'r');
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporary, { force: true });
  }
}

function claimFile(source: string, target: string): boolean {
  try {
    linkSync(source, target);
    unlinkSync(source);
    return true;
  } catch {
    return false;
  }
}

class HarnessChannel {
  readonly commands: string;
  readonly deliveries: string;
  readonly processing: string;
  readonly responses: string;
  private readonly campaignId: string;
  private readonly capability: string;
  private timer: ReturnType<typeof setInterval> | undefined;
  private polling = false;

  constructor() {
    if (resolve(required('KORA_C3_PRIVATE_DIRECTORY')) !== CHANNEL_ROOT) {
      throw new Error('The C3 harness filesystem boundary is invalid.');
    }
    assertDirectory(CHANNEL_ROOT, CHANNEL_ROOT);
    this.commands = join(CHANNEL_ROOT, 'commands');
    this.processing = join(CHANNEL_ROOT, 'processing');
    this.responses = join(CHANNEL_ROOT, 'responses');
    this.deliveries = join(CHANNEL_ROOT, 'deliveries');
    for (const directory of [this.commands, this.processing, this.responses, this.deliveries]) {
      assertDirectory(CHANNEL_ROOT, directory);
    }
    const manifest = exactRecord(readBoundedJson(join(CHANNEL_ROOT, 'campaign.json')), [
      'campaignId',
      'projectName',
      'version',
    ]);
    const project = required('KORA_C3_PROJECT_NAME');
    this.campaignId = required('KORA_C3_CAMPAIGN_ID');
    this.capability = readFileSync('/run/secrets/c3_harness_capability', 'utf8').trim();
    if (
      manifest.version !== 1 ||
      manifest.projectName !== project ||
      manifest.campaignId !== this.campaignId ||
      !/^[A-Za-z0-9_-]{43}$/u.test(this.capability)
    ) {
      throw new Error('The C3 harness channel identity is invalid.');
    }
  }

  assertCapability(value: unknown): void {
    if (typeof value !== 'string' || !constantTimeTextEqual(value, this.capability)) {
      throw new Error('Invalid channel capability.');
    }
  }

  start(handler: (action: string, payload: unknown, requestId: string) => Promise<unknown>): void {
    if (this.timer !== undefined) throw new Error('Channel already started.');
    this.timer = setInterval(() => void this.poll(handler), 100);
  }

  close(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async poll(
    handler: (action: string, payload: unknown, requestId: string) => Promise<unknown>,
  ): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const names = readdirSync(this.commands).filter((name) =>
        /^[-0-9a-f]{36}\.request\.json$/iu.test(name),
      );
      for (const name of names.sort()) await this.process(name, handler);
    } finally {
      this.polling = false;
    }
  }

  private async process(
    name: string,
    handler: (action: string, payload: unknown, requestId: string) => Promise<unknown>,
  ): Promise<void> {
    const requestId = name.slice(0, -'.request.json'.length);
    if (!UUID_PATTERN.test(requestId)) return;
    const responseName = `${requestId}.response.json`;
    if (existsSync(join(this.responses, responseName))) return;
    const processing = join(this.processing, name);
    if (!claimFile(join(this.commands, name), processing)) return;
    let result: unknown;
    let status: 'OK' | 'REJECTED' = 'REJECTED';
    try {
      const command = exactRecord(readBoundedJson(processing), [
        'action',
        'campaignId',
        'capability',
        'payload',
        'requestId',
        'version',
      ]);
      if (
        command.version !== 1 ||
        command.campaignId !== this.campaignId ||
        command.requestId !== requestId ||
        typeof command.action !== 'string'
      ) {
        throw new Error('Invalid channel command identity.');
      }
      this.assertCapability(command.capability);
      result = await handler(command.action, command.payload, requestId);
      status = 'OK';
    } catch (error: unknown) {
      result = {
        code: error instanceof C3PrivateRejection ? error.code : 'INVALID_REQUEST',
      };
    }
    try {
      writeAtomicJson(this.responses, responseName, {
        campaignId: this.campaignId,
        requestId,
        result,
        status,
        version: 1,
      });
    } finally {
      rmSync(processing, { force: true });
    }
  }
}

class ConfiguredNotificationPort implements NotificationPortLike {
  async assertConfigured(): Promise<void> {}
  async deliver(): Promise<{ readonly kind: 'NOT_ACCEPTED'; readonly retryable: false }> {
    return { kind: 'NOT_ACCEPTED', retryable: false };
  }
  async reconcile(): Promise<'UNKNOWN'> {
    return 'UNKNOWN';
  }
}

class StatefulPasswordCompromisePort implements PasswordCompromisePortLike {
  private available = true;
  private checks = 0;
  private compromisedResults = 0;
  private compromised = new Set<string>();

  async checkPassword(
    passwordUtf8: string,
    options: Readonly<{ signal: AbortSignal; timeoutMs: 3000 }>,
  ): Promise<'SAFE' | 'COMPROMISED'> {
    this.checks += 1;
    if (!this.available || options.signal.aborted) throw new Error('Password check unavailable.');
    const result = this.compromised.has(passwordUtf8) ? 'COMPROMISED' : 'SAFE';
    if (result === 'COMPROMISED') this.compromisedResults += 1;
    return result;
  }

  diagnostics(): Readonly<{ checks: number; compromisedResults: number }> {
    return { checks: this.checks, compromisedResults: this.compromisedResults };
  }

  resetDiagnostics(): void {
    this.checks = 0;
    this.compromisedResults = 0;
  }

  configure(payload: unknown): Readonly<{ configured: true }> {
    const record = exactRecord(payload, ['available', 'compromisedPasswords']);
    if (
      typeof record.available !== 'boolean' ||
      !Array.isArray(record.compromisedPasswords) ||
      record.compromisedPasswords.length > 8 ||
      !record.compromisedPasswords.every(
        (password) =>
          typeof password === 'string' &&
          [...password].length >= 12 &&
          [...password].length <= 128 &&
          Buffer.byteLength(password, 'utf8') <= 1024,
      )
    ) {
      throw new Error('Invalid password-compromise fixture.');
    }
    this.available = record.available;
    this.compromised = new Set(record.compromisedPasswords as string[]);
    return { configured: true };
  }
}

class FileNotificationPort implements NotificationPortLike {
  constructor(
    private readonly channel: HarnessChannel,
    private readonly campaignId: string,
  ) {}

  async assertConfigured(): Promise<void> {
    assertDirectory(CHANNEL_ROOT, this.channel.deliveries);
  }

  async deliver(
    delivery: NotificationDeliveryLike,
  ): Promise<
    | { readonly acknowledgement: string; readonly kind: 'ACCEPTED' }
    | { readonly kind: 'ACKNOWLEDGEMENT_UNUSABLE' }
    | { readonly kind: 'NOT_ACCEPTED'; readonly retryable: false }
  > {
    if (delivery.signal.aborted) return { kind: 'NOT_ACCEPTED', retryable: false };
    if (!UUID_PATTERN.test(delivery.logicalDeliveryId)) return { kind: 'ACKNOWLEDGEMENT_UNUSABLE' };
    if (delivery.purpose !== 'PASSWORD_RESET' && delivery.purpose !== 'INVITATION') {
      return { kind: 'ACKNOWLEDGEMENT_UNUSABLE' };
    }
    const payload = exactRecord(delivery.payload, ['code', 'email']);
    if (
      typeof payload.code !== 'string' ||
      typeof payload.email !== 'string' ||
      !EMAIL_PATTERN.test(payload.email) ||
      Buffer.byteLength(payload.code, 'utf8') > 256
    ) {
      return { kind: 'ACKNOWLEDGEMENT_UNUSABLE' };
    }
    const acknowledgement = `c3-file-${delivery.logicalDeliveryId}`;
    const record = {
      acknowledgement,
      campaignId: this.campaignId,
      logicalDeliveryId: delivery.logicalDeliveryId,
      payload: { code: payload.code, email: payload.email },
      purpose: delivery.purpose,
      version: 1,
    };
    const filename = `${delivery.logicalDeliveryId}.delivery.json`;
    const target = join(this.channel.deliveries, filename);
    if (existsSync(target)) {
      const existing = readFileSync(target, 'utf8');
      return constantTimeTextEqual(existing, `${JSON.stringify(record)}\n`)
        ? { acknowledgement, kind: 'ACCEPTED' }
        : { kind: 'ACKNOWLEDGEMENT_UNUSABLE' };
    }
    try {
      writeAtomicJson(this.channel.deliveries, filename, record);
    } catch {
      if (!existsSync(target)) return { kind: 'ACKNOWLEDGEMENT_UNUSABLE' };
      const existing = readFileSync(target, 'utf8');
      return constantTimeTextEqual(existing, `${JSON.stringify(record)}\n`)
        ? { acknowledgement, kind: 'ACCEPTED' }
        : { kind: 'ACKNOWLEDGEMENT_UNUSABLE' };
    }
    return { acknowledgement, kind: 'ACCEPTED' };
  }

  async reconcile(
    logicalDeliveryId: string,
    signal: AbortSignal,
  ): Promise<'ACCEPTED' | 'NOT_FOUND' | 'UNKNOWN'> {
    if (signal.aborted || !UUID_PATTERN.test(logicalDeliveryId)) return 'UNKNOWN';
    const target = join(this.channel.deliveries, `${logicalDeliveryId}.delivery.json`);
    if (!existsSync(target)) return 'NOT_FOUND';
    try {
      const record = exactRecord(readBoundedJson(target), [
        'acknowledgement',
        'campaignId',
        'logicalDeliveryId',
        'payload',
        'purpose',
        'version',
      ]);
      return record.version === 1 &&
        record.campaignId === this.campaignId &&
        record.logicalDeliveryId === logicalDeliveryId &&
        record.acknowledgement === `c3-file-${logicalDeliveryId}` &&
        (record.purpose === 'PASSWORD_RESET' || record.purpose === 'INVITATION') &&
        (() => {
          try {
            const payload = exactRecord(record.payload, ['code', 'email']);
            return (
              typeof payload.code === 'string' &&
              Buffer.byteLength(payload.code, 'utf8') <= 256 &&
              typeof payload.email === 'string' &&
              EMAIL_PATTERN.test(payload.email)
            );
          } catch {
            return false;
          }
        })()
        ? 'ACCEPTED'
        : 'UNKNOWN';
    } catch {
      return 'UNKNOWN';
    }
  }
}

function assertHarnessBoundary(mode: HarnessMode): void {
  if (
    process.env.KORA_C3_BROWSER_HARNESS !== '1' ||
    process.env.NODE_ENV !== 'test' ||
    process.env.ADMIN_C2A_ENABLED !== 'true' ||
    process.env.ADMIN_C2B_ENABLED !== 'false'
  ) {
    throw new Error('The C3 browser harness is restricted to the isolated test profile.');
  }
  if (process.env.ADMIN_C2A_PROFILE !== (mode === 'api' ? 'HTTP' : 'NOTIFICATION')) {
    throw new Error('The C3 browser harness process profile is invalid.');
  }
  if (mode === 'api' && process.env.ADMIN_CLIENT_PROVENANCE_MODE !== 'MTLS_BFF') {
    throw new Error('The C3 API harness requires authenticated BFF provenance.');
  }
  const project = required('KORA_C3_PROJECT_NAME');
  const campaign = required('KORA_C3_CAMPAIGN_ID');
  if (
    project === 'kora-plus-local' ||
    !/^kora-c3-[a-z0-9-]{8,64}$/u.test(project) ||
    !/^c3-browser-[a-z0-9-]{8,64}$/u.test(campaign) ||
    realpathSync(WORKSPACE_ROOT) !== WORKSPACE_ROOT
  ) {
    throw new Error('The C3 browser harness campaign identity is invalid.');
  }
}

function invitationFixturePayload(value: unknown): Readonly<{
  accessToken: string;
  email: string;
  idempotencyKey: string;
  totpCode: string;
}> {
  const record = exactRecord(value, ['accessToken', 'email', 'idempotencyKey', 'totpCode']);
  if (
    typeof record.accessToken !== 'string' ||
    record.accessToken.length < 32 ||
    record.accessToken.length > 4096 ||
    typeof record.email !== 'string' ||
    !EMAIL_PATTERN.test(record.email) ||
    typeof record.idempotencyKey !== 'string' ||
    !IDEMPOTENCY_PATTERN.test(record.idempotencyKey) ||
    typeof record.totpCode !== 'string' ||
    !TOTP_PATTERN.test(record.totpCode)
  ) {
    throw new Error('Invalid invitation fixture.');
  }
  return {
    accessToken: record.accessToken,
    email: record.email,
    idempotencyKey: record.idempotencyKey,
    totpCode: record.totpCode,
  };
}

function expiredPreAuthFixturePayload(
  value: unknown,
): Readonly<{ email: string; password: string }> {
  const record = exactRecord(value, ['email', 'password']);
  if (
    typeof record.email !== 'string' ||
    !EMAIL_PATTERN.test(record.email) ||
    typeof record.password !== 'string' ||
    [...record.password].length < 12 ||
    [...record.password].length > 128 ||
    Buffer.byteLength(record.password, 'utf8') > 1024
  ) {
    throw new Error('Invalid expired-preauth fixture.');
  }
  return { email: record.email, password: record.password };
}

async function runApi(): Promise<void> {
  assertHarnessBoundary('api');
  const channel = new HarnessChannel();
  const compromise = new StatefulPasswordCompromisePort();
  const { createApplication } = loadBuiltModule<{
    createApplication(
      options: Readonly<Record<string, unknown>>,
      transport: Readonly<Record<string, unknown>>,
    ): Promise<NestApplicationLike>;
  }>('app.factory.js');
  const { TestEphemeralAdminKeyProvider } = loadBuiltModule<{
    TestEphemeralAdminKeyProvider: new () => unknown;
  }>('admin-auth/admin-key-provider.js');
  const { TestAdminSecurityOutboxKeyring } = loadBuiltModule<{
    TestAdminSecurityOutboxKeyring: new (activeId?: string) => unknown;
  }>('admin-security/admin-security.crypto.js');
  const { AdminSessionService } = loadBuiltModule<{ AdminSessionService: unknown }>(
    'admin-auth/admin-session.service.js',
  );
  const { ADMIN_RATE_LIMITER } = loadBuiltModule<{ ADMIN_RATE_LIMITER: unknown }>(
    'admin-auth/admin-rate-limit.service.js',
  );
  const { AdminAuthService, parseAdminLogin, parseAdminStepUp } = loadBuiltModule<{
    AdminAuthService: unknown;
    parseAdminLogin(value: unknown): Readonly<{ email: string; password: string }>;
    parseAdminStepUp(value: unknown): Readonly<{ purpose: 'INVITATION'; totpCode: string }>;
  }>('admin-auth/admin-auth.service.js');
  const { AdminSecurityService } = loadBuiltModule<{ AdminSecurityService: unknown }>(
    'admin-security/admin-security.service.js',
  );
  const { AdminSecurityRepository } = loadBuiltModule<{ AdminSecurityRepository: unknown }>(
    'admin-security/admin-security.repository.js',
  );
  const { assertAdminC2IdempotencyKey, parseInvitationCreate } = loadBuiltModule<{
    assertAdminC2IdempotencyKey(
      operationId: 'createAdminInvitation',
      value: string | undefined,
    ): string;
    parseInvitationCreate(
      value: unknown,
    ): Parameters<AdminSecurityServiceLike['createInvitation']>[2];
  }>('admin-security/admin-security.types.js');
  const application = await createApplication(
    {
      adminKeyProvider: new TestEphemeralAdminKeyProvider(),
      adminSecurity: {
        notificationPort: new ConfiguredNotificationPort(),
        outboxKeyring: new TestAdminSecurityOutboxKeyring('test-c2a-key-v1'),
        passwordCompromisePort: compromise,
      },
      environment: process.env,
    },
    {
      httpsOptions: {
        ca: readFileSync(required('API_TLS_CLIENT_CA_PATH')),
        cert: readFileSync(required('API_TLS_CERTIFICATE_PATH')),
        key: readFileSync(required('API_TLS_PRIVATE_KEY_PATH')),
        rejectUnauthorized: true,
        requestCert: true,
      },
    },
  );
  const sessions = application.get<AdminSessionServiceLike>(AdminSessionService);
  const rateLimiter = application.get<AdminRateLimitServiceLike>(ADMIN_RATE_LIMITER);
  const auth = application.get<AdminAuthServiceLike>(AdminAuthService);
  const security = application.get<AdminSecurityServiceLike>(AdminSecurityService);
  const securityRepository = application.get<AdminSecurityRepositoryLike>(AdminSecurityRepository);
  const revokeCurrent = sessions.revokeCurrent.bind(sessions);
  const refresh = sessions.refresh.bind(sessions);
  const consumeRateLimit = rateLimiter.consume.bind(rateLimiter);
  const acceptInvitation = security.acceptInvitation.bind(security);
  const securityTransaction = securityRepository.transaction.bind(securityRepository);
  const rateLimitRedisClientCandidate = Reflect.get(rateLimiter, 'client') as unknown;
  if (
    rateLimitRedisClientCandidate === null ||
    typeof rateLimitRedisClientCandidate !== 'object' ||
    typeof Reflect.get(rateLimitRedisClientCandidate, 'call') !== 'function' ||
    typeof Reflect.get(rateLimitRedisClientCandidate, 'eval') !== 'function'
  ) {
    throw new Error('C3 rate-limit diagnostic client is unavailable.');
  }
  const rateLimitRedisClient = rateLimitRedisClientCandidate as AdminRateLimitRedisClientLike;
  const callRateLimitRedis = rateLimitRedisClient.call.bind(rateLimitRedisClient);
  const evalRateLimitRedis = rateLimitRedisClient.eval.bind(rateLimitRedisClient);
  const rateLimitWaitAofTimeoutMs = Number(required('ADMIN_REDIS_WAIT_AOF_TIMEOUT_MS'));
  if (
    !Number.isSafeInteger(rateLimitWaitAofTimeoutMs) ||
    rateLimitWaitAofTimeoutMs < 1 ||
    rateLimitWaitAofTimeoutMs > 10_000
  ) {
    throw new Error('Invalid C3 rate-limit durability timeout.');
  }
  let failNextLogout = false;
  let loseNextLogoutResponseAfterCommit = false;
  let logoutCalls = 0;
  let committedResponseLosses = 0;
  let invitationAcceptanceCalls = 0;
  let committedInvitationResponseLosses = 0;
  let loseNextInvitationResponseAfterCommit = false;
  let refreshActive = 0;
  let refreshCalls = 0;
  let refreshMaxConcurrency = 0;
  let nextRefreshOffsetSeconds: number | undefined;
  let rateLimitCalls = 0;
  let rateLimitFailures = 0;
  let lastRateLimitFailure = 'NONE';
  let lastRateLimitStage = 'NOT_CALLED';
  let transactionCalls = 0;
  let transactionFailures = 0;
  const passwordRateLimitIpCounts = new Map<string, number>();
  const passwordRateLimitSubjectCounts = new Map<string, number>();
  let passwordRateLimitCalls = 0;
  let passwordRateLimitIsolationActive = false;
  const recoveryRateLimitIpKeys = new Set<string>();
  let recoveryRateLimitCalls = 0;
  const refreshRateLimitIpKeys = new Set<string>();
  let refreshRateLimitCalls = 0;
  const totpRateLimitIpCounts = new Map<string, number>();
  const totpRateLimitSubjectCounts = new Map<string, number>();
  let totpRateLimitCalls = 0;
  let totpRateLimitIsolationActive = false;
  let lastTransactionFailure: SafeTransactionFailure = {
    constraint: null,
    primaryCode: null,
    transactionCode: null,
  };
  rateLimiter.consume = async (scope, ipAddress, subject): Promise<unknown> => {
    rateLimitCalls += 1;
    lastRateLimitStage = 'BEFORE_WAITAOF';
    try {
      return await consumeRateLimit(scope, ipAddress, subject);
    } catch (error: unknown) {
      rateLimitFailures += 1;
      lastRateLimitFailure =
        error instanceof Error && /^[A-Za-z][A-Za-z0-9]{0,63}$/u.test(error.name)
          ? error.name
          : 'UnknownError';
      throw error;
    }
  };
  rateLimitRedisClient.call = async (command, ...args): Promise<unknown> => {
    if (command !== 'WAITAOF') return callRateLimitRedis(command, ...args);
    try {
      const result = await callRateLimitRedis(command, ...args);
      const local = Array.isArray(result) && result.length === 2 ? Number(result[0]) : Number.NaN;
      lastRateLimitStage = Number.isSafeInteger(local)
        ? local >= 1
          ? 'WAITAOF_LOCAL_DURABLE'
          : 'WAITAOF_LOCAL_ZERO'
        : 'WAITAOF_MALFORMED';
      return result;
    } catch (error: unknown) {
      lastRateLimitStage =
        error instanceof Error && error.message === 'Command timed out'
          ? 'WAITAOF_COMMAND_TIMEOUT'
          : 'WAITAOF_ERROR';
      throw error;
    }
  };
  rateLimitRedisClient.eval = async (script, numberOfKeys, ...args): Promise<unknown> => {
    const firstKey = args[0];
    const secondKey = args[1];
    const passwordPrefix = 'kora:admin-auth:rate:password:';
    const recoveryPrefix = 'kora:admin-auth:rate:recovery:';
    const refreshPrefix = 'kora:admin-auth:rate:refresh:';
    const totpPrefix = 'kora:admin-auth:rate:totp:';
    if (
      numberOfKeys === 2 &&
      typeof firstKey === 'string' &&
      typeof secondKey === 'string' &&
      (firstKey.startsWith(passwordPrefix) || secondKey.startsWith(passwordPrefix))
    ) {
      if (passwordRateLimitIsolationActive) {
        throw new Error('C3 password rate-limit isolation is active.');
      }
      if (
        !/^kora:admin-auth:rate:password:ip:[0-9a-f]{64}$/u.test(firstKey) ||
        !/^kora:admin-auth:rate:password:subject:[0-9a-f]{64}$/u.test(secondKey)
      ) {
        throw new Error('Invalid C3 password rate-limit key pair.');
      }
      passwordRateLimitIpCounts.set(firstKey, (passwordRateLimitIpCounts.get(firstKey) ?? 0) + 1);
      passwordRateLimitSubjectCounts.set(
        secondKey,
        (passwordRateLimitSubjectCounts.get(secondKey) ?? 0) + 1,
      );
      passwordRateLimitCalls += 1;
    }
    if (
      numberOfKeys === 2 &&
      typeof firstKey === 'string' &&
      typeof secondKey === 'string' &&
      (firstKey.startsWith(recoveryPrefix) || secondKey.startsWith(recoveryPrefix))
    ) {
      if (
        !/^kora:admin-auth:rate:recovery:ip:[0-9a-f]{64}$/u.test(firstKey) ||
        !/^kora:admin-auth:rate:recovery:subject:[0-9a-f]{64}$/u.test(secondKey)
      ) {
        throw new Error('Invalid C3 recovery rate-limit key pair.');
      }
      recoveryRateLimitIpKeys.add(firstKey);
      recoveryRateLimitCalls += 1;
    }
    if (
      numberOfKeys === 2 &&
      typeof firstKey === 'string' &&
      typeof secondKey === 'string' &&
      (firstKey.startsWith(refreshPrefix) || secondKey.startsWith(refreshPrefix))
    ) {
      if (
        !/^kora:admin-auth:rate:refresh:ip:[0-9a-f]{64}$/u.test(firstKey) ||
        !/^kora:admin-auth:rate:refresh:subject:[0-9a-f]{64}$/u.test(secondKey)
      ) {
        throw new Error('Invalid C3 refresh rate-limit key pair.');
      }
      refreshRateLimitIpKeys.add(firstKey);
      refreshRateLimitCalls += 1;
    }
    if (
      numberOfKeys === 2 &&
      typeof firstKey === 'string' &&
      typeof secondKey === 'string' &&
      (firstKey.startsWith(totpPrefix) || secondKey.startsWith(totpPrefix))
    ) {
      if (totpRateLimitIsolationActive) {
        throw new Error('C3 TOTP rate-limit isolation is active.');
      }
      if (
        !/^kora:admin-auth:rate:totp:ip:[0-9a-f]{64}$/u.test(firstKey) ||
        !/^kora:admin-auth:rate:totp:subject:[0-9a-f]{64}$/u.test(secondKey)
      ) {
        throw new Error('Invalid C3 TOTP rate-limit key pair.');
      }
      totpRateLimitIpCounts.set(firstKey, (totpRateLimitIpCounts.get(firstKey) ?? 0) + 1);
      totpRateLimitSubjectCounts.set(
        secondKey,
        (totpRateLimitSubjectCounts.get(secondKey) ?? 0) + 1,
      );
      totpRateLimitCalls += 1;
    }
    return evalRateLimitRedis(script, numberOfKeys, ...args);
  };
  securityRepository.transaction = async <T>(
    callback: (transaction: unknown) => Promise<T>,
  ): Promise<T> => {
    transactionCalls += 1;
    try {
      return await securityTransaction(callback);
    } catch (error: unknown) {
      transactionFailures += 1;
      lastTransactionFailure = safeTransactionFailure(error);
      throw error;
    }
  };
  security.acceptInvitation = async (...args): Promise<unknown> => {
    invitationAcceptanceCalls += 1;
    const loseResponse = loseNextInvitationResponseAfterCommit;
    loseNextInvitationResponseAfterCommit = false;
    const result = await acceptInvitation(...args);
    if (loseResponse) {
      committedInvitationResponseLosses += 1;
      throw new Error('C3 deterministic invitation response failure after commit.');
    }
    return result;
  };
  sessions.revokeCurrent = async (principal, requestId): Promise<void> => {
    logoutCalls += 1;
    if (failNextLogout) {
      failNextLogout = false;
      throw new Error('C3 deterministic logout fault.');
    }
    await revokeCurrent(principal, requestId);
    if (loseNextLogoutResponseAfterCommit) {
      loseNextLogoutResponseAfterCommit = false;
      committedResponseLosses += 1;
      throw new Error('C3 deterministic logout response loss after commit.');
    }
  };
  sessions.refresh = async (refreshToken, requestId, ipAddress, now): Promise<unknown> => {
    refreshCalls += 1;
    refreshActive += 1;
    refreshMaxConcurrency = Math.max(refreshMaxConcurrency, refreshActive);
    const configuredOffset = nextRefreshOffsetSeconds;
    nextRefreshOffsetSeconds = undefined;
    try {
      return await refresh(
        refreshToken,
        requestId,
        ipAddress,
        configuredOffset === undefined ? now : new Date(Date.now() + configuredOffset * 1000),
      );
    } finally {
      refreshActive -= 1;
    }
  };
  channel.start(async (action, payload, requestId) => {
    if (action === 'configureHibp') return compromise.configure(payload);
    if (action === 'resetPasswordDiagnostics') {
      const fixture = exactRecord(payload, []);
      if (Object.keys(fixture).length !== 0) throw new Error('Invalid password diagnostic reset.');
      compromise.resetDiagnostics();
      rateLimitCalls = 0;
      rateLimitFailures = 0;
      lastRateLimitFailure = 'NONE';
      lastRateLimitStage = 'NOT_CALLED';
      transactionCalls = 0;
      transactionFailures = 0;
      lastTransactionFailure = { constraint: null, primaryCode: null, transactionCode: null };
      return { reset: true };
    }
    if (action === 'passwordDiagnostics') {
      const fixture = exactRecord(payload, []);
      if (Object.keys(fixture).length !== 0)
        throw new Error('Invalid password diagnostic request.');
      const compromiseDiagnostics = compromise.diagnostics();
      return {
        hibpChecks: compromiseDiagnostics.checks,
        hibpCompromisedResults: compromiseDiagnostics.compromisedResults,
        lastConstraint: lastTransactionFailure.constraint,
        lastPrimaryCode: lastTransactionFailure.primaryCode,
        lastRateLimitFailure,
        lastRateLimitStage,
        lastTransactionCode: lastTransactionFailure.transactionCode,
        rateLimitCalls,
        rateLimitFailures,
        transactionCalls,
        transactionFailures,
      };
    }
    if (action === 'isolatePasswordRateLimitScenario') {
      const fixture = exactRecord(payload, []);
      if (Object.keys(fixture).length !== 0) {
        throw new Error('Invalid password rate-limit isolation fixture.');
      }
      if (passwordRateLimitIsolationActive) {
        throw new C3PrivateRejection('PASSWORD_ISOLATION_REDIS_INVARIANT');
      }
      if (passwordRateLimitCalls !== 5) {
        throw new C3PrivateRejection('PASSWORD_ISOLATION_COUNT');
      }
      const observedIpCounts = [...passwordRateLimitIpCounts.values()].sort(
        (left, right) => left - right,
      );
      const observedSubjectCounts = [...passwordRateLimitSubjectCounts.values()].sort(
        (left, right) => left - right,
      );
      const initialPhase =
        JSON.stringify(observedIpCounts) === JSON.stringify([5]) &&
        JSON.stringify(observedSubjectCounts) === JSON.stringify([1, 4]);
      const sessionPhase =
        JSON.stringify(observedIpCounts) === JSON.stringify([1, 4]) &&
        JSON.stringify(observedSubjectCounts) === JSON.stringify([5]);
      if (
        (!initialPhase && !sessionPhase) ||
        observedIpCounts.reduce((total, count) => total + count, 0) !== passwordRateLimitCalls ||
        observedSubjectCounts.reduce((total, count) => total + count, 0) !== passwordRateLimitCalls
      ) {
        throw new C3PrivateRejection('PASSWORD_ISOLATION_COUNT');
      }
      const ipKeys = [...passwordRateLimitIpCounts.keys()].sort();
      const subjectKeys = [...passwordRateLimitSubjectCounts.keys()].sort();
      if (
        (initialPhase && (ipKeys.length !== 1 || subjectKeys.length !== 2)) ||
        (sessionPhase && (ipKeys.length !== 2 || subjectKeys.length !== 1))
      ) {
        throw new C3PrivateRejection('PASSWORD_ISOLATION_KEYS');
      }
      if (
        ipKeys.some((key) => !/^kora:admin-auth:rate:password:ip:[0-9a-f]{64}$/u.test(key)) ||
        subjectKeys.some(
          (key) => !/^kora:admin-auth:rate:password:subject:[0-9a-f]{64}$/u.test(key),
        )
      ) {
        throw new C3PrivateRejection('PASSWORD_ISOLATION_TARGET');
      }
      const targetKeys = [...ipKeys, ...subjectKeys];
      if (new Set(targetKeys).size !== targetKeys.length) {
        throw new C3PrivateRejection('PASSWORD_ISOLATION_TARGET');
      }
      const expectedCounts = [
        ...ipKeys.map((key) => passwordRateLimitIpCounts.get(key)),
        ...subjectKeys.map((key) => passwordRateLimitSubjectCounts.get(key)),
      ];
      if (expectedCounts.some((count) => count === undefined)) {
        throw new C3PrivateRejection('PASSWORD_ISOLATION_COUNT');
      }
      passwordRateLimitIsolationActive = true;
      try {
        let result: unknown;
        try {
          result = await evalRateLimitRedis(
            `
local expected_ip_keys = tonumber(ARGV[1])
local ip_prefix = 'kora:admin-auth:rate:password:ip:'
local subject_prefix = 'kora:admin-auth:rate:password:subject:'
local function valid_target(key, prefix)
  if string.sub(key, 1, string.len(prefix)) ~= prefix then
    return false
  end
  local digest = string.sub(key, string.len(prefix) + 1)
  return string.len(digest) == 64 and string.match(digest, '^[0-9a-f]+$') ~= nil
end
if expected_ip_keys == nil or expected_ip_keys < 1 or expected_ip_keys > 2 then
  return 'C3_PASSWORD_RATE_LIMIT_TARGET_MISMATCH'
end
if #KEYS ~= 3 or #ARGV ~= 4 then
  return 'C3_PASSWORD_RATE_LIMIT_TARGET_MISMATCH'
end
for index = 1, #KEYS do
  local prefix = index <= expected_ip_keys and ip_prefix or subject_prefix
  if not valid_target(KEYS[index], prefix) then
    return 'C3_PASSWORD_RATE_LIMIT_TARGET_MISMATCH'
  end
end
for left = 1, #KEYS do
  for right = left + 1, #KEYS do
    if KEYS[left] == KEYS[right] then
      return 'C3_PASSWORD_RATE_LIMIT_TARGET_MISMATCH'
    end
  end
end
for index = 1, #KEYS do
  local key_type = redis.call('TYPE', KEYS[index])
  if type(key_type) ~= 'table' or key_type.ok ~= 'string' then
    return 'C3_PASSWORD_RATE_LIMIT_COUNT_MISMATCH'
  end
  local previous_count = redis.call('GET', KEYS[index])
  if previous_count == false or string.match(previous_count, '^[1-9][0-9]*$') == nil then
    return 'C3_PASSWORD_RATE_LIMIT_COUNT_MISMATCH'
  end
  local expected_count = tonumber(ARGV[index + 1])
  if expected_count == nil or tonumber(previous_count) ~= expected_count then
    return 'C3_PASSWORD_RATE_LIMIT_COUNT_MISMATCH'
  end
  local previous_ttl = redis.call('PTTL', KEYS[index])
  if previous_ttl < 1 or previous_ttl > 900000 then
    return 'C3_PASSWORD_RATE_LIMIT_TTL_MISMATCH'
  end
end
local database_keys_before = redis.call('DBSIZE')
local deleted_keys = redis.call('DEL', unpack(KEYS))
local remaining_keys = redis.call('EXISTS', unpack(KEYS))
local database_keys_after = redis.call('DBSIZE')
return {database_keys_before - database_keys_after, deleted_keys, #KEYS, remaining_keys}
`,
            targetKeys.length,
            ...targetKeys,
            ipKeys.length,
            ...expectedCounts.map(Number),
          );
        } catch {
          throw new C3PrivateRejection('PASSWORD_ISOLATION_REDIS_RESULT');
        }
        if (result === 'C3_PASSWORD_RATE_LIMIT_TARGET_MISMATCH') {
          throw new C3PrivateRejection('PASSWORD_ISOLATION_TARGET');
        }
        if (result === 'C3_PASSWORD_RATE_LIMIT_COUNT_MISMATCH') {
          throw new C3PrivateRejection('PASSWORD_ISOLATION_REDIS_COUNT');
        }
        if (result === 'C3_PASSWORD_RATE_LIMIT_TTL_MISMATCH') {
          throw new C3PrivateRejection('PASSWORD_ISOLATION_REDIS_TTL');
        }
        if (
          !Array.isArray(result) ||
          result.length !== 4 ||
          result.some((value) => !Number.isSafeInteger(Number(value)))
        ) {
          throw new C3PrivateRejection('PASSWORD_ISOLATION_REDIS_RESULT');
        }
        const [databaseKeyDelta, deletedKeys, targetKeyCount, remainingKeys] = result.map(Number);
        if (
          databaseKeyDelta !== targetKeys.length ||
          deletedKeys !== targetKeys.length ||
          targetKeyCount !== targetKeys.length ||
          remainingKeys !== 0
        ) {
          throw new C3PrivateRejection('PASSWORD_ISOLATION_REDIS_INVARIANT');
        }
        let waitAof: unknown;
        try {
          waitAof = await rateLimitRedisClient.call('WAITAOF', 1, 0, rateLimitWaitAofTimeoutMs);
        } catch {
          throw new C3PrivateRejection(
            lastRateLimitStage === 'WAITAOF_COMMAND_TIMEOUT'
              ? 'PASSWORD_ISOLATION_WAITAOF_TIMEOUT'
              : 'PASSWORD_ISOLATION_WAITAOF_ERROR',
          );
        }
        const localAof =
          Array.isArray(waitAof) && waitAof.length === 2 ? Number(waitAof[0]) : Number.NaN;
        const replicaAof =
          Array.isArray(waitAof) && waitAof.length === 2 ? Number(waitAof[1]) : Number.NaN;
        if (localAof !== 1 || !Number.isSafeInteger(replicaAof) || replicaAof < 0) {
          throw new C3PrivateRejection('PASSWORD_ISOLATION_WAITAOF_RESULT');
        }
        const observedPasswordCalls = passwordRateLimitCalls;
        passwordRateLimitIpCounts.clear();
        passwordRateLimitSubjectCounts.clear();
        passwordRateLimitCalls = 0;
        return {
          databaseKeyDelta,
          deletedKeys,
          ipCounts: observedIpCounts,
          localAof,
          observedPasswordCalls,
          remainingKeys,
          subjectCounts: observedSubjectCounts,
          targetKeys: targetKeyCount,
        };
      } finally {
        passwordRateLimitIsolationActive = false;
      }
    }
    if (action === 'isolateTotpRateLimitScenario') {
      const fixture = exactRecord(payload, []);
      if (Object.keys(fixture).length !== 0) {
        throw new Error('Invalid TOTP rate-limit isolation fixture.');
      }
      if (totpRateLimitIsolationActive) {
        throw new C3PrivateRejection('TOTP_ISOLATION_REDIS_INVARIANT');
      }
      if (totpRateLimitCalls !== 6) {
        throw new C3PrivateRejection('TOTP_ISOLATION_COUNT');
      }
      const observedIpCounts = [...totpRateLimitIpCounts.values()].sort(
        (left, right) => left - right,
      );
      const observedSubjectCounts = [...totpRateLimitSubjectCounts.values()].sort(
        (left, right) => left - right,
      );
      if (
        JSON.stringify(observedIpCounts) !== JSON.stringify([1, 5]) ||
        JSON.stringify(observedSubjectCounts) !== JSON.stringify([1, 1, 1, 1, 2]) ||
        observedIpCounts.reduce((total, count) => total + count, 0) !== totpRateLimitCalls ||
        observedSubjectCounts.reduce((total, count) => total + count, 0) !== totpRateLimitCalls
      ) {
        throw new C3PrivateRejection('TOTP_ISOLATION_COUNT');
      }
      const ipKeys = [...totpRateLimitIpCounts.keys()].sort();
      const subjectKeys = [...totpRateLimitSubjectCounts.keys()].sort();
      if (ipKeys.length !== 2 || subjectKeys.length !== 5) {
        throw new C3PrivateRejection('TOTP_ISOLATION_KEYS');
      }
      if (
        ipKeys.some((key) => !/^kora:admin-auth:rate:totp:ip:[0-9a-f]{64}$/u.test(key)) ||
        subjectKeys.some((key) => !/^kora:admin-auth:rate:totp:subject:[0-9a-f]{64}$/u.test(key))
      ) {
        throw new C3PrivateRejection('TOTP_ISOLATION_TARGET');
      }
      const targetKeys = [...ipKeys, ...subjectKeys];
      if (new Set(targetKeys).size !== targetKeys.length) {
        throw new C3PrivateRejection('TOTP_ISOLATION_TARGET');
      }
      const expectedCounts = [
        ...ipKeys.map((key) => totpRateLimitIpCounts.get(key)),
        ...subjectKeys.map((key) => totpRateLimitSubjectCounts.get(key)),
      ];
      if (expectedCounts.some((count) => count === undefined)) {
        throw new C3PrivateRejection('TOTP_ISOLATION_COUNT');
      }
      totpRateLimitIsolationActive = true;
      try {
        let result: unknown;
        try {
          result = await evalRateLimitRedis(
            `
local expected_ip_keys = tonumber(ARGV[1])
local ip_prefix = 'kora:admin-auth:rate:totp:ip:'
local subject_prefix = 'kora:admin-auth:rate:totp:subject:'
local function valid_target(key, prefix)
  if string.sub(key, 1, string.len(prefix)) ~= prefix then
    return false
  end
  local digest = string.sub(key, string.len(prefix) + 1)
  return string.len(digest) == 64 and string.match(digest, '^[0-9a-f]+$') ~= nil
end
if expected_ip_keys ~= 2 or #KEYS ~= 7 or #ARGV ~= 8 then
  return 'C3_TOTP_RATE_LIMIT_TARGET_MISMATCH'
end
for index = 1, #KEYS do
  local prefix = index <= expected_ip_keys and ip_prefix or subject_prefix
  if not valid_target(KEYS[index], prefix) then
    return 'C3_TOTP_RATE_LIMIT_TARGET_MISMATCH'
  end
end
for left = 1, #KEYS do
  for right = left + 1, #KEYS do
    if KEYS[left] == KEYS[right] then
      return 'C3_TOTP_RATE_LIMIT_TARGET_MISMATCH'
    end
  end
end
local browser_ip_index = nil
for index = 1, #KEYS do
  local key_type = redis.call('TYPE', KEYS[index])
  if type(key_type) ~= 'table' or key_type.ok ~= 'string' then
    return 'C3_TOTP_RATE_LIMIT_COUNT_MISMATCH'
  end
  local previous_count = redis.call('GET', KEYS[index])
  local expected_count = tonumber(ARGV[index + 1])
  if previous_count == false or string.match(previous_count, '^[1-9][0-9]*$') == nil then
    return 'C3_TOTP_RATE_LIMIT_COUNT_MISMATCH'
  end
  if expected_count == nil or tonumber(previous_count) ~= expected_count then
    return 'C3_TOTP_RATE_LIMIT_COUNT_MISMATCH'
  end
  if index <= expected_ip_keys and expected_count == 5 then
    if browser_ip_index ~= nil then
      return 'C3_TOTP_RATE_LIMIT_COUNT_MISMATCH'
    end
    browser_ip_index = index
  end
  local previous_ttl = redis.call('PTTL', KEYS[index])
  if previous_ttl < 1 or previous_ttl > 300000 then
    return 'C3_TOTP_RATE_LIMIT_TTL_MISMATCH'
  end
end
if browser_ip_index == nil then
  return 'C3_TOTP_RATE_LIMIT_COUNT_MISMATCH'
end
local database_keys_before = redis.call('DBSIZE')
local deleted_keys = redis.call('DEL', KEYS[browser_ip_index])
local remaining_keys = redis.call('EXISTS', KEYS[browser_ip_index])
local database_keys_after = redis.call('DBSIZE')
return {database_keys_before - database_keys_after, deleted_keys, #KEYS, remaining_keys}
`,
            targetKeys.length,
            ...targetKeys,
            ipKeys.length,
            ...expectedCounts.map(Number),
          );
        } catch {
          throw new C3PrivateRejection('TOTP_ISOLATION_REDIS_RESULT');
        }
        if (result === 'C3_TOTP_RATE_LIMIT_TARGET_MISMATCH') {
          throw new C3PrivateRejection('TOTP_ISOLATION_TARGET');
        }
        if (result === 'C3_TOTP_RATE_LIMIT_COUNT_MISMATCH') {
          throw new C3PrivateRejection('TOTP_ISOLATION_REDIS_COUNT');
        }
        if (result === 'C3_TOTP_RATE_LIMIT_TTL_MISMATCH') {
          throw new C3PrivateRejection('TOTP_ISOLATION_REDIS_TTL');
        }
        if (
          !Array.isArray(result) ||
          result.length !== 4 ||
          result.some((value) => !Number.isSafeInteger(Number(value)))
        ) {
          throw new C3PrivateRejection('TOTP_ISOLATION_REDIS_RESULT');
        }
        const [databaseKeyDelta, deletedKeys, targetKeyCount, remainingKeys] = result.map(Number);
        if (
          databaseKeyDelta !== 1 ||
          deletedKeys !== 1 ||
          targetKeyCount !== targetKeys.length ||
          remainingKeys !== 0
        ) {
          throw new C3PrivateRejection('TOTP_ISOLATION_REDIS_INVARIANT');
        }
        let waitAof: unknown;
        try {
          waitAof = await rateLimitRedisClient.call('WAITAOF', 1, 0, rateLimitWaitAofTimeoutMs);
        } catch {
          throw new C3PrivateRejection(
            lastRateLimitStage === 'WAITAOF_COMMAND_TIMEOUT'
              ? 'TOTP_ISOLATION_WAITAOF_TIMEOUT'
              : 'TOTP_ISOLATION_WAITAOF_ERROR',
          );
        }
        const localAof =
          Array.isArray(waitAof) && waitAof.length === 2 ? Number(waitAof[0]) : Number.NaN;
        const replicaAof =
          Array.isArray(waitAof) && waitAof.length === 2 ? Number(waitAof[1]) : Number.NaN;
        if (localAof !== 1 || !Number.isSafeInteger(replicaAof) || replicaAof < 0) {
          throw new C3PrivateRejection('TOTP_ISOLATION_WAITAOF_RESULT');
        }
        const observedTotpCalls = totpRateLimitCalls;
        totpRateLimitIpCounts.clear();
        totpRateLimitSubjectCounts.clear();
        totpRateLimitCalls = 0;
        return {
          databaseKeyDelta,
          deletedKeys,
          ipCounts: observedIpCounts,
          localAof,
          observedTotpCalls,
          remainingKeys,
          subjectCounts: observedSubjectCounts,
          targetKeys: targetKeyCount,
        };
      } finally {
        totpRateLimitIsolationActive = false;
      }
    }
    if (action === 'isolateRefreshRateLimitScenario') {
      const fixture = exactRecord(payload, []);
      if (Object.keys(fixture).length !== 0) {
        throw new Error('Invalid refresh rate-limit isolation fixture.');
      }
      if (refreshRateLimitIpKeys.size !== 1) {
        throw new C3PrivateRejection('REFRESH_ISOLATION_KEYS');
      }
      if (!Number.isSafeInteger(refreshRateLimitCalls) || refreshRateLimitCalls < 1) {
        throw new C3PrivateRejection('REFRESH_ISOLATION_COUNT');
      }
      const [ipKey] = refreshRateLimitIpKeys;
      if (ipKey === undefined || !/^kora:admin-auth:rate:refresh:ip:[0-9a-f]{64}$/u.test(ipKey)) {
        throw new C3PrivateRejection('REFRESH_ISOLATION_TARGET');
      }
      const maximumObservedRefreshCalls = refreshRateLimitCalls;
      let result: unknown;
      try {
        result = await evalRateLimitRedis(
          `
local database_keys_before = redis.call('DBSIZE')
local max_observed_calls = tonumber(ARGV[1])
local previous_count = redis.call('GET', KEYS[1])
local previous_ttl = redis.call('PTTL', KEYS[1])
if previous_count == false or string.match(previous_count, '^[1-9][0-9]*$') == nil then
  return 'C3_REFRESH_RATE_LIMIT_COUNT_MISMATCH'
end
local current_count = tonumber(previous_count)
if current_count == nil or current_count < 1 or current_count > max_observed_calls then
  return 'C3_REFRESH_RATE_LIMIT_COUNT_MISMATCH'
end
if previous_ttl < 1 or previous_ttl > 60000 then
  return 'C3_REFRESH_RATE_LIMIT_TTL_MISMATCH'
end
local deleted_keys = redis.call('DEL', KEYS[1])
local remaining_keys = redis.call('EXISTS', KEYS[1])
local database_keys_after = redis.call('DBSIZE')
return {database_keys_before - database_keys_after, deleted_keys, current_count, remaining_keys}
`,
          1,
          ipKey,
          maximumObservedRefreshCalls,
        );
      } catch {
        throw new C3PrivateRejection('REFRESH_ISOLATION_REDIS_RESULT');
      }
      if (result === 'C3_REFRESH_RATE_LIMIT_COUNT_MISMATCH') {
        throw new C3PrivateRejection('REFRESH_ISOLATION_REDIS_COUNT');
      }
      if (result === 'C3_REFRESH_RATE_LIMIT_TTL_MISMATCH') {
        throw new C3PrivateRejection('REFRESH_ISOLATION_REDIS_TTL');
      }
      if (
        !Array.isArray(result) ||
        result.length !== 4 ||
        result.some((value) => !Number.isSafeInteger(Number(value)))
      ) {
        throw new C3PrivateRejection('REFRESH_ISOLATION_REDIS_RESULT');
      }
      const [databaseKeyDelta, deletedKeys, previousCount, remainingKeys] = result.map(Number);
      if (
        databaseKeyDelta !== 1 ||
        deletedKeys !== 1 ||
        previousCount === undefined ||
        previousCount < 1 ||
        previousCount > maximumObservedRefreshCalls ||
        remainingKeys !== 0
      ) {
        throw new C3PrivateRejection('REFRESH_ISOLATION_REDIS_INVARIANT');
      }
      let waitAof: unknown;
      try {
        waitAof = await rateLimitRedisClient.call('WAITAOF', 1, 0, rateLimitWaitAofTimeoutMs);
      } catch {
        throw new C3PrivateRejection(
          lastRateLimitStage === 'WAITAOF_COMMAND_TIMEOUT'
            ? 'REFRESH_ISOLATION_WAITAOF_TIMEOUT'
            : 'REFRESH_ISOLATION_WAITAOF_ERROR',
        );
      }
      const localAof =
        Array.isArray(waitAof) && waitAof.length === 2 ? Number(waitAof[0]) : Number.NaN;
      const replicaAof =
        Array.isArray(waitAof) && waitAof.length === 2 ? Number(waitAof[1]) : Number.NaN;
      if (localAof !== 1 || !Number.isSafeInteger(replicaAof) || replicaAof < 0) {
        throw new C3PrivateRejection('REFRESH_ISOLATION_WAITAOF_RESULT');
      }
      refreshRateLimitIpKeys.clear();
      refreshRateLimitCalls = 0;
      return {
        databaseKeyDelta,
        deletedKeys,
        localAof,
        observedRefreshCalls: previousCount,
        previousCount,
        remainingKeys,
      };
    }
    if (action === 'isolateRecoveryRateLimitScenario') {
      const fixture = exactRecord(payload, []);
      if (Object.keys(fixture).length !== 0) {
        throw new Error('Invalid recovery rate-limit isolation fixture.');
      }
      if (recoveryRateLimitIpKeys.size !== 1) {
        throw new C3PrivateRejection('RECOVERY_ISOLATION_KEYS');
      }
      if (recoveryRateLimitCalls !== 5) {
        throw new C3PrivateRejection('RECOVERY_ISOLATION_COUNT');
      }
      const [ipKey] = recoveryRateLimitIpKeys;
      if (ipKey === undefined || !/^kora:admin-auth:rate:recovery:ip:[0-9a-f]{64}$/u.test(ipKey)) {
        throw new C3PrivateRejection('RECOVERY_ISOLATION_TARGET');
      }
      let result: unknown;
      try {
        result = await evalRateLimitRedis(
          `
local database_keys_before = redis.call('DBSIZE')
local previous_count = redis.call('GET', KEYS[1])
local previous_ttl = redis.call('PTTL', KEYS[1])
if previous_count ~= '5' then
  return 'C3_RECOVERY_RATE_LIMIT_COUNT_MISMATCH'
end
if previous_ttl < 1 or previous_ttl > 3600000 then
  return 'C3_RECOVERY_RATE_LIMIT_TTL_MISMATCH'
end
local deleted_keys = redis.call('DEL', KEYS[1])
local remaining_keys = redis.call('EXISTS', KEYS[1])
local database_keys_after = redis.call('DBSIZE')
return {database_keys_before - database_keys_after, deleted_keys, tonumber(previous_count), remaining_keys}
`,
          1,
          ipKey,
        );
      } catch {
        throw new C3PrivateRejection('RECOVERY_ISOLATION_REDIS_RESULT');
      }
      if (result === 'C3_RECOVERY_RATE_LIMIT_COUNT_MISMATCH') {
        throw new C3PrivateRejection('RECOVERY_ISOLATION_REDIS_COUNT');
      }
      if (result === 'C3_RECOVERY_RATE_LIMIT_TTL_MISMATCH') {
        throw new C3PrivateRejection('RECOVERY_ISOLATION_REDIS_TTL');
      }
      if (
        !Array.isArray(result) ||
        result.length !== 4 ||
        result.some((value) => !Number.isSafeInteger(Number(value)))
      ) {
        throw new C3PrivateRejection('RECOVERY_ISOLATION_REDIS_RESULT');
      }
      const [databaseKeyDelta, deletedKeys, previousCount, remainingKeys] = result.map(Number);
      if (
        databaseKeyDelta !== 1 ||
        deletedKeys !== 1 ||
        previousCount !== 5 ||
        remainingKeys !== 0
      ) {
        throw new C3PrivateRejection('RECOVERY_ISOLATION_REDIS_INVARIANT');
      }
      let waitAof: unknown;
      try {
        waitAof = await rateLimitRedisClient.call('WAITAOF', 1, 0, rateLimitWaitAofTimeoutMs);
      } catch {
        throw new C3PrivateRejection(
          lastRateLimitStage === 'WAITAOF_COMMAND_TIMEOUT'
            ? 'RECOVERY_ISOLATION_WAITAOF_TIMEOUT'
            : 'RECOVERY_ISOLATION_WAITAOF_ERROR',
        );
      }
      const localAof =
        Array.isArray(waitAof) && waitAof.length === 2 ? Number(waitAof[0]) : Number.NaN;
      const replicaAof =
        Array.isArray(waitAof) && waitAof.length === 2 ? Number(waitAof[1]) : Number.NaN;
      if (localAof !== 1 || !Number.isSafeInteger(replicaAof) || replicaAof < 0) {
        throw new C3PrivateRejection('RECOVERY_ISOLATION_WAITAOF_RESULT');
      }
      recoveryRateLimitIpKeys.clear();
      recoveryRateLimitCalls = 0;
      return {
        databaseKeyDelta,
        deletedKeys,
        localAof,
        observedRecoveryCalls: 5,
        previousCount,
        remainingKeys,
      };
    }
    if (action === 'failNextLogout') {
      const fixture = exactRecord(payload, []);
      if (Object.keys(fixture).length !== 0) throw new Error('Invalid logout fault fixture.');
      failNextLogout = true;
      return { configured: true };
    }
    if (action === 'loseNextLogoutResponseAfterCommit') {
      const fixture = exactRecord(payload, []);
      if (Object.keys(fixture).length !== 0) throw new Error('Invalid logout fault fixture.');
      loseNextLogoutResponseAfterCommit = true;
      return { configured: true };
    }
    if (action === 'logoutFaultState') {
      const fixture = exactRecord(payload, []);
      if (Object.keys(fixture).length !== 0) throw new Error('Invalid logout state fixture.');
      return { calls: logoutCalls, committedResponseLosses };
    }
    if (action === 'loseNextInvitationResponseAfterCommit') {
      const fixture = exactRecord(payload, []);
      if (Object.keys(fixture).length !== 0 || loseNextInvitationResponseAfterCommit) {
        throw new Error('Invalid invitation response-loss fixture.');
      }
      loseNextInvitationResponseAfterCommit = true;
      return { configured: true };
    }
    if (action === 'invitationFaultState') {
      const fixture = exactRecord(payload, []);
      if (Object.keys(fixture).length !== 0) {
        throw new Error('Invalid invitation response-loss state fixture.');
      }
      return {
        calls: invitationAcceptanceCalls,
        committedResponseLosses: committedInvitationResponseLosses,
        pending: loseNextInvitationResponseAfterCommit,
      };
    }
    if (action === 'createExpiredPreAuthFixture') {
      const fixture = expiredPreAuthFixturePayload(payload);
      const historicalNow = new Date(Date.now() - 11 * 60 * 1000);
      return auth.login(
        parseAdminLogin(fixture),
        { ipAddress: '127.0.0.1', requestId },
        historicalNow,
      );
    }
    if (action === 'resetRefreshProbe') {
      const fixture = exactRecord(payload, []);
      if (Object.keys(fixture).length !== 0 || refreshActive !== 0) {
        throw new Error('Invalid refresh probe reset.');
      }
      refreshCalls = 0;
      refreshMaxConcurrency = 0;
      return { reset: true };
    }
    if (action === 'refreshProbeState') {
      const fixture = exactRecord(payload, []);
      if (Object.keys(fixture).length !== 0) throw new Error('Invalid refresh probe fixture.');
      return { active: refreshActive, calls: refreshCalls, maxConcurrency: refreshMaxConcurrency };
    }
    if (action === 'configureNextRefreshOffset') {
      const fixture = exactRecord(payload, ['seconds']);
      const allowedOffsets = new Set([16 * 60, (8 * 60 + 17) * 60, (12 * 60 + 1) * 60]);
      if (
        !Number.isSafeInteger(fixture.seconds) ||
        !allowedOffsets.has(fixture.seconds as number) ||
        nextRefreshOffsetSeconds !== undefined
      ) {
        throw new Error('Invalid refresh clock fixture.');
      }
      nextRefreshOffsetSeconds = fixture.seconds as number;
      return { configured: true };
    }
    if (action !== 'createInvitationFixture') throw new Error('Unknown command.');
    const fixture = invitationFixturePayload(payload);
    const authorization = `Bearer ${fixture.accessToken}`;
    const now = new Date();
    const principal = await sessions.authenticate(authorization, now, false);
    await auth.stepUp(
      principal,
      parseAdminStepUp({ purpose: 'INVITATION', totpCode: fixture.totpCode }),
      { ipAddress: '127.0.0.1', requestId },
      now,
    );
    const invitation = await security.createInvitation(
      authorization,
      assertAdminC2IdempotencyKey('createAdminInvitation', fixture.idempotencyKey),
      parseInvitationCreate({
        email: fixture.email,
        operatorReason: 'C3 browser invitation fixture',
        reasonCode: 'INVITATION_ADMINISTRATION',
        role: 'SUPPORT',
      }),
      { requestId },
      now,
    );
    return { invitationId: invitation.invitationId, kind: 'INVITATION_CREATED' };
  });

  let stopping = false;
  const stop = (): void => {
    if (stopping) return;
    stopping = true;
    channel.close();
    const force = setTimeout(() => process.exit(1), 30_000);
    void application.close().then(
      () => {
        clearTimeout(force);
        process.exit(0);
      },
      () => {
        clearTimeout(force);
        process.exit(1);
      },
    );
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  await application.listen(Number(required('API_PORT')), required('API_HOST'));
  process.stdout.write(
    `${JSON.stringify({ event: 'c3_browser_harness_ready', mode: 'api', profile: 'HTTP' })}\n`,
  );
}

async function runNotification(): Promise<void> {
  assertHarnessBoundary('notification');
  const channel = new HarnessChannel();
  const { NestFactory } = runtimeRequire('@nestjs/core') as {
    NestFactory: {
      createApplicationContext(
        module: unknown,
        options: Readonly<{ logger: false }>,
      ): Promise<ApplicationContextLike>;
    };
  };
  const { AdminNotificationModule } = loadBuiltModule<{
    AdminNotificationModule: { register(options: Readonly<Record<string, unknown>>): unknown };
  }>('admin-security/admin-notification.module.js');
  const { TestAdminSecurityOutboxKeyring } = loadBuiltModule<{
    TestAdminSecurityOutboxKeyring: new (activeId?: string) => unknown;
  }>('admin-security/admin-security.crypto.js');
  const { runAdminNotificationMain } = loadBuiltModule<{
    runAdminNotificationMain(dependencies: Readonly<Record<string, unknown>>): Promise<{
      failed: boolean;
      forceExit: boolean;
    }>;
  }>('admin-security/admin-notification.main.js');
  const outcome = await runAdminNotificationMain({
    createApplicationContext: () =>
      NestFactory.createApplicationContext(
        AdminNotificationModule.register({
          notificationPort: new FileNotificationPort(channel, required('KORA_C3_CAMPAIGN_ID')),
          outboxKeyring: new TestAdminSecurityOutboxKeyring('test-c2a-key-v1'),
        }),
        { logger: false },
      ),
    onReady: () =>
      process.stdout.write(
        `${JSON.stringify({ event: 'c3_browser_harness_ready', mode: 'notification', profile: 'NOTIFICATION' })}\n`,
      ),
  });
  if (outcome.failed || outcome.forceExit) process.exitCode = 1;
}

async function main(): Promise<void> {
  if (process.argv.length !== 3 || !['api', 'notification'].includes(process.argv[2] ?? '')) {
    throw new Error('Exactly one closed harness mode is required.');
  }
  if (process.argv[2] === 'api') await runApi();
  else await runNotification();
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      event: 'c3_browser_harness_startup_failed',
      exceptionType: error instanceof Error ? error.name : 'UnknownError',
    })}\n`,
  );
  process.exitCode = 1;
});
