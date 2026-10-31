import { createHmac, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';

import { test as base, type Page } from '@playwright/test';

const MAX_FILE_BYTES = 8192;
const REDACTED_ERROR_CONTEXT = '[C3_ERROR_CONTEXT_REDACTED]';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const C3_PRIVATE_REJECTION_CODES = new Set([
  'PASSWORD_ISOLATION_KEYS',
  'PASSWORD_ISOLATION_COUNT',
  'PASSWORD_ISOLATION_TARGET',
  'PASSWORD_ISOLATION_REDIS_COUNT',
  'PASSWORD_ISOLATION_REDIS_TTL',
  'PASSWORD_ISOLATION_REDIS_RESULT',
  'PASSWORD_ISOLATION_REDIS_INVARIANT',
  'PASSWORD_ISOLATION_WAITAOF_TIMEOUT',
  'PASSWORD_ISOLATION_WAITAOF_ERROR',
  'PASSWORD_ISOLATION_WAITAOF_RESULT',
  'RECOVERY_ISOLATION_KEYS',
  'RECOVERY_ISOLATION_COUNT',
  'RECOVERY_ISOLATION_TARGET',
  'RECOVERY_ISOLATION_REDIS_COUNT',
  'RECOVERY_ISOLATION_REDIS_TTL',
  'RECOVERY_ISOLATION_REDIS_RESULT',
  'RECOVERY_ISOLATION_REDIS_INVARIANT',
  'RECOVERY_ISOLATION_WAITAOF_TIMEOUT',
  'RECOVERY_ISOLATION_WAITAOF_ERROR',
  'RECOVERY_ISOLATION_WAITAOF_RESULT',
  'REFRESH_ISOLATION_KEYS',
  'REFRESH_ISOLATION_COUNT',
  'REFRESH_ISOLATION_TARGET',
  'REFRESH_ISOLATION_REDIS_COUNT',
  'REFRESH_ISOLATION_REDIS_TTL',
  'REFRESH_ISOLATION_REDIS_RESULT',
  'REFRESH_ISOLATION_REDIS_INVARIANT',
  'REFRESH_ISOLATION_WAITAOF_TIMEOUT',
  'REFRESH_ISOLATION_WAITAOF_ERROR',
  'REFRESH_ISOLATION_WAITAOF_RESULT',
  'TOTP_ISOLATION_KEYS',
  'TOTP_ISOLATION_COUNT',
  'TOTP_ISOLATION_TARGET',
  'TOTP_ISOLATION_REDIS_COUNT',
  'TOTP_ISOLATION_REDIS_TTL',
  'TOTP_ISOLATION_REDIS_RESULT',
  'TOTP_ISOLATION_REDIS_INVARIANT',
  'TOTP_ISOLATION_WAITAOF_TIMEOUT',
  'TOTP_ISOLATION_WAITAOF_ERROR',
  'TOTP_ISOLATION_WAITAOF_RESULT',
]);
const C3_PRIVATE_DIAGNOSTIC_ACTIONS = new Set([
  'configureHibp',
  'configureNextRefreshOffset',
  'createExpiredPreAuthFixture',
  'createInvitationFixture',
  'failNextLogout',
  'invitationFaultState',
  'isolatePasswordRateLimitScenario',
  'isolateRecoveryRateLimitScenario',
  'isolateRefreshRateLimitScenario',
  'isolateTotpRateLimitScenario',
  'logoutFaultState',
  'loseNextInvitationResponseAfterCommit',
  'loseNextLogoutResponseAfterCommit',
  'passwordDiagnostics',
  'refreshProbeState',
  'resetPasswordDiagnostics',
  'resetRefreshProbe',
]);

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`Missing ${name}.`);
  return value;
}

function assertInside(root: string, candidate: string): string {
  const fromRoot = relative(root, candidate);
  if (fromRoot === '' || (!fromRoot.startsWith(`..${sep}`) && fromRoot !== '..')) return candidate;
  throw new Error('Private channel path escaped its boundary.');
}

function readJson(path: string): unknown {
  const bytes = readFileSync(path);
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('Private channel file is oversized.');
  return JSON.parse(bytes.toString('utf8')) as unknown;
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid private channel record.');
  }
  return value as Record<string, unknown>;
}

function exactRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const candidate = record(value);
  if (JSON.stringify(Object.keys(candidate).sort()) !== JSON.stringify([...keys].sort())) {
    throw new Error('Invalid private channel record.');
  }
  return candidate;
}

function privateRejectionCode(value: unknown): string {
  let rejection: Record<string, unknown>;
  try {
    rejection = exactRecord(value, ['code']);
  } catch {
    return 'INVALID_REQUEST';
  }
  return typeof rejection.code === 'string' && C3_PRIVATE_REJECTION_CODES.has(rejection.code)
    ? rejection.code
    : 'INVALID_REQUEST';
}

function writeExclusiveJson(directory: string, filename: string, value: unknown): void {
  const target = join(directory, filename);
  const temporary = join(directory, `.${filename}.${randomUUID()}.tmp`);
  let descriptor: number | undefined;
  try {
    descriptor = openSync(temporary, 'wx', 0o600);
    writeSync(descriptor, `${JSON.stringify(value)}\n`, undefined, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporary, target);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    rmSync(temporary, { force: true });
  }
}

async function waitForFile(path: string, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(path)) {
    if (Date.now() >= deadline) throw new Error('Private channel response timed out.');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
}

export type DeliveryPurpose = 'INVITATION' | 'PASSWORD_RESET';

export interface PasswordDiagnostics {
  readonly hibpChecks: number;
  readonly hibpCompromisedResults: number;
  readonly lastConstraint: string | null;
  readonly lastPrimaryCode: string | null;
  readonly lastRateLimitFailure: string;
  readonly lastRateLimitStage: string;
  readonly lastTransactionCode: string | null;
  readonly rateLimitCalls: number;
  readonly rateLimitFailures: number;
  readonly transactionCalls: number;
  readonly transactionFailures: number;
}

export class C3PrivateChannel {
  private readonly campaignId = required('KORA_C3_CAMPAIGN_ID');
  private readonly capability: string;
  private readonly root: string;

  constructor() {
    this.root = realpathSync(required('KORA_C3_PRIVATE_DIR'));
    this.capability = readFileSync(required('KORA_C3_CAPABILITY_PATH'), 'utf8').trim();
    if (!/^[A-Za-z0-9_-]{43}$/u.test(this.capability)) {
      throw new Error('Invalid private channel capability.');
    }
    const manifest = exactRecord(readJson(join(this.root, 'campaign.json')), [
      'campaignId',
      'projectName',
      'version',
    ]);
    if (manifest.version !== 1 || manifest.campaignId !== this.campaignId) {
      throw new Error('Private channel campaign mismatch.');
    }
    for (const child of ['commands', 'deliveries', 'processing', 'responses', 'sentinels']) {
      assertInside(this.root, realpathSync(join(this.root, child)));
    }
  }

  registerSensitiveValues(values: readonly string[]): void {
    if (
      values.length === 0 ||
      values.length > 64 ||
      values.some(
        (value) =>
          typeof value !== 'string' || value.length < 6 || Buffer.byteLength(value, 'utf8') > 4096,
      )
    ) {
      throw new Error('Invalid dynamic sentinel registration.');
    }
    for (const value of values) {
      writeExclusiveJson(join(this.root, 'sentinels'), `${randomUUID()}.sentinel.json`, {
        value,
        version: 1,
      });
    }
  }

  redactTestErrors(errors: readonly unknown[]): void {
    const dynamicValues = readdirSync(join(this.root, 'sentinels'))
      .filter((name) => name.endsWith('.sentinel.json'))
      .map((name) => {
        const sentinel = exactRecord(readJson(join(this.root, 'sentinels', name)), [
          'value',
          'version',
        ]);
        if (sentinel.version !== 1 || typeof sentinel.value !== 'string') {
          throw new Error('Invalid dynamic sentinel record.');
        }
        return sentinel.value;
      });
    const browserFixtureValues = [
      process.env.KORA_C3_BOOTSTRAP_EMAIL,
      process.env.KORA_C3_BOOTSTRAP_PASSWORD,
    ].filter(
      (value): value is string =>
        typeof value === 'string' && value.length >= 6 && Buffer.byteLength(value, 'utf8') <= 4096,
    );
    const sensitiveValues = [...new Set([...dynamicValues, ...browserFixtureValues])].sort(
      (left, right) => right.length - left.length,
    );
    const seen = new Set<object>();
    const redact = (value: string): string =>
      sensitiveValues.reduce(
        (candidate, sensitive) => candidate.split(sensitive).join('[REDACTED_C3_SENTINEL]'),
        value,
      );
    const visit = (value: unknown): void => {
      if (value === null || typeof value !== 'object' || seen.has(value)) return;
      seen.add(value);
      for (const key of Reflect.ownKeys(value)) {
        const nested = Reflect.get(value, key) as unknown;
        if (typeof nested === 'string') {
          const redacted = redact(nested);
          if (redacted !== nested && !Reflect.set(value, key, redacted)) {
            throw new Error('Unable to redact a Playwright test error.');
          }
        } else {
          visit(nested);
        }
      }
    };
    for (const error of errors) visit(error);
  }

  finalizeTestErrors(errors: readonly unknown[]): void {
    if (errors.length === 0) return;
    this.redactTestErrors(errors);
    for (const error of errors) {
      if (error === null || typeof error !== 'object') {
        throw new Error('Invalid Playwright test error during final redaction.');
      }
      if (!Reflect.set(error, 'errorContext', REDACTED_ERROR_CONTEXT)) {
        throw new Error('Unable to neutralize a Playwright error context.');
      }
      if (!Reflect.set(error, 'stack', '')) {
        throw new Error('Unable to neutralize a Playwright error stack.');
      }
    }
    this.redactTestErrors(errors);
  }

  deliveryIds(): ReadonlySet<string> {
    return new Set(
      readdirSync(join(this.root, 'deliveries')).filter((name) => name.endsWith('.delivery.json')),
    );
  }

  async waitForDelivery(
    purpose: DeliveryPurpose,
    previous: ReadonlySet<string>,
  ): Promise<Readonly<{ code: string; email: string }>> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      for (const filename of readdirSync(join(this.root, 'deliveries')).sort()) {
        if (previous.has(filename) || !/^[-0-9a-f]{36}\.delivery\.json$/iu.test(filename)) {
          continue;
        }
        const delivery = exactRecord(readJson(join(this.root, 'deliveries', filename)), [
          'acknowledgement',
          'campaignId',
          'logicalDeliveryId',
          'payload',
          'purpose',
          'version',
        ]);
        if (delivery.campaignId !== this.campaignId || delivery.purpose !== purpose) continue;
        const payload = exactRecord(delivery.payload, ['code', 'email']);
        if (typeof payload.code !== 'string' || typeof payload.email !== 'string') {
          throw new Error('Invalid deterministic delivery payload.');
        }
        this.registerSensitiveValues([payload.code, payload.email]);
        return { code: payload.code, email: payload.email };
      }
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    }
    throw new Error('Deterministic delivery timed out.');
  }

  async configureHibp(available: boolean, compromisedPasswords: readonly string[]): Promise<void> {
    await this.command('configureHibp', { available, compromisedPasswords });
  }

  async resetPasswordDiagnostics(): Promise<void> {
    const result = exactRecord(await this.command('resetPasswordDiagnostics', {}), ['reset']);
    if (result.reset !== true) throw new Error('Password diagnostic reset was rejected.');
  }

  async passwordDiagnostics(): Promise<PasswordDiagnostics> {
    const keys = [
      'hibpChecks',
      'hibpCompromisedResults',
      'lastConstraint',
      'lastPrimaryCode',
      'lastRateLimitFailure',
      'lastRateLimitStage',
      'lastTransactionCode',
      'rateLimitCalls',
      'rateLimitFailures',
      'transactionCalls',
      'transactionFailures',
    ] as const;
    const result = exactRecord(await this.command('passwordDiagnostics', {}), keys);
    for (const key of [
      'hibpChecks',
      'hibpCompromisedResults',
      'rateLimitCalls',
      'rateLimitFailures',
      'transactionCalls',
      'transactionFailures',
    ] as const) {
      if (!Number.isSafeInteger(result[key]) || (result[key] as number) < 0) {
        throw new Error('Invalid password diagnostic counter.');
      }
    }
    if (
      (result.lastConstraint !== null &&
        (typeof result.lastConstraint !== 'string' ||
          !/^[A-Za-z0-9_]{1,128}$/u.test(result.lastConstraint))) ||
      (result.lastPrimaryCode !== null &&
        (typeof result.lastPrimaryCode !== 'string' ||
          !/^[0-9A-Z]{5}$/u.test(result.lastPrimaryCode))) ||
      typeof result.lastRateLimitFailure !== 'string' ||
      !/^(?:NONE|[A-Za-z][A-Za-z0-9]{0,63})$/u.test(result.lastRateLimitFailure) ||
      typeof result.lastRateLimitStage !== 'string' ||
      !/^(?:NOT_CALLED|BEFORE_WAITAOF|WAITAOF_LOCAL_DURABLE|WAITAOF_LOCAL_ZERO|WAITAOF_MALFORMED|WAITAOF_COMMAND_TIMEOUT|WAITAOF_ERROR)$/u.test(
        result.lastRateLimitStage,
      ) ||
      (result.lastTransactionCode !== null &&
        (typeof result.lastTransactionCode !== 'string' ||
          !/^[A-Z_]{3,64}$/u.test(result.lastTransactionCode)))
    ) {
      throw new Error('Invalid password diagnostic classification.');
    }
    return result as unknown as PasswordDiagnostics;
  }

  async isolateRecoveryRateLimitScenario(): Promise<
    Readonly<{
      databaseKeyDelta: 1;
      deletedKeys: 1;
      localAof: 1;
      observedRecoveryCalls: 5;
      previousCount: 5;
      remainingKeys: 0;
    }>
  > {
    const result = exactRecord(await this.command('isolateRecoveryRateLimitScenario', {}), [
      'databaseKeyDelta',
      'deletedKeys',
      'localAof',
      'observedRecoveryCalls',
      'previousCount',
      'remainingKeys',
    ]);
    if (
      result.databaseKeyDelta !== 1 ||
      result.deletedKeys !== 1 ||
      result.localAof !== 1 ||
      result.observedRecoveryCalls !== 5 ||
      result.previousCount !== 5 ||
      result.remainingKeys !== 0
    ) {
      throw new Error('Recovery rate-limit isolation was rejected.');
    }
    return result as {
      databaseKeyDelta: 1;
      deletedKeys: 1;
      localAof: 1;
      observedRecoveryCalls: 5;
      previousCount: 5;
      remainingKeys: 0;
    };
  }

  async isolatePasswordRateLimitScenario(): Promise<
    Readonly<{
      databaseKeyDelta: 3;
      deletedKeys: 3;
      ipCounts: readonly [5] | readonly [1, 4];
      localAof: 1;
      observedPasswordCalls: 5;
      remainingKeys: 0;
      subjectCounts: readonly [1, 4] | readonly [5];
      targetKeys: 3;
    }>
  > {
    const result = exactRecord(await this.command('isolatePasswordRateLimitScenario', {}), [
      'databaseKeyDelta',
      'deletedKeys',
      'ipCounts',
      'localAof',
      'observedPasswordCalls',
      'remainingKeys',
      'subjectCounts',
      'targetKeys',
    ]);
    const initialPhase =
      JSON.stringify(result.ipCounts) === JSON.stringify([5]) &&
      JSON.stringify(result.subjectCounts) === JSON.stringify([1, 4]);
    const sessionPhase =
      JSON.stringify(result.ipCounts) === JSON.stringify([1, 4]) &&
      JSON.stringify(result.subjectCounts) === JSON.stringify([5]);
    if (
      result.observedPasswordCalls !== 5 ||
      !Array.isArray(result.ipCounts) ||
      result.ipCounts.some((count) => !Number.isSafeInteger(count) || count < 1) ||
      !Array.isArray(result.subjectCounts) ||
      result.subjectCounts.some((count) => !Number.isSafeInteger(count) || count < 1) ||
      (!initialPhase && !sessionPhase) ||
      result.databaseKeyDelta !== 3 ||
      result.deletedKeys !== 3 ||
      result.targetKeys !== 3 ||
      result.localAof !== 1 ||
      result.remainingKeys !== 0
    ) {
      throw new Error('Password rate-limit isolation was rejected.');
    }
    return result as {
      databaseKeyDelta: 3;
      deletedKeys: 3;
      ipCounts: [5] | [1, 4];
      localAof: 1;
      observedPasswordCalls: 5;
      remainingKeys: 0;
      subjectCounts: [1, 4] | [5];
      targetKeys: 3;
    };
  }

  async isolateTotpRateLimitScenario(): Promise<
    Readonly<{
      databaseKeyDelta: 1;
      deletedKeys: 1;
      ipCounts: readonly [1, 5];
      localAof: 1;
      observedTotpCalls: 6;
      remainingKeys: 0;
      subjectCounts: readonly [1, 1, 1, 1, 2];
      targetKeys: 7;
    }>
  > {
    const result = exactRecord(await this.command('isolateTotpRateLimitScenario', {}), [
      'databaseKeyDelta',
      'deletedKeys',
      'ipCounts',
      'localAof',
      'observedTotpCalls',
      'remainingKeys',
      'subjectCounts',
      'targetKeys',
    ]);
    if (
      result.databaseKeyDelta !== 1 ||
      result.deletedKeys !== 1 ||
      JSON.stringify(result.ipCounts) !== JSON.stringify([1, 5]) ||
      result.localAof !== 1 ||
      result.observedTotpCalls !== 6 ||
      result.remainingKeys !== 0 ||
      JSON.stringify(result.subjectCounts) !== JSON.stringify([1, 1, 1, 1, 2]) ||
      result.targetKeys !== 7
    ) {
      throw new Error('Invalid TOTP rate-limit isolation result.');
    }
    return result as {
      databaseKeyDelta: 1;
      deletedKeys: 1;
      ipCounts: [1, 5];
      localAof: 1;
      observedTotpCalls: 6;
      remainingKeys: 0;
      subjectCounts: [1, 1, 1, 1, 2];
      targetKeys: 7;
    };
  }

  async isolateRefreshRateLimitScenario(): Promise<
    Readonly<{
      databaseKeyDelta: 1;
      deletedKeys: 1;
      localAof: 1;
      observedRefreshCalls: number;
      previousCount: number;
      remainingKeys: 0;
    }>
  > {
    const result = exactRecord(await this.command('isolateRefreshRateLimitScenario', {}), [
      'databaseKeyDelta',
      'deletedKeys',
      'localAof',
      'observedRefreshCalls',
      'previousCount',
      'remainingKeys',
    ]);
    if (
      result.databaseKeyDelta !== 1 ||
      result.deletedKeys !== 1 ||
      result.localAof !== 1 ||
      !Number.isSafeInteger(result.observedRefreshCalls) ||
      (result.observedRefreshCalls as number) < 1 ||
      result.previousCount !== result.observedRefreshCalls ||
      result.remainingKeys !== 0
    ) {
      throw new Error('Refresh rate-limit isolation was rejected.');
    }
    return result as {
      databaseKeyDelta: 1;
      deletedKeys: 1;
      localAof: 1;
      observedRefreshCalls: number;
      previousCount: number;
      remainingKeys: 0;
    };
  }

  async failNextLogout(): Promise<void> {
    const result = exactRecord(await this.command('failNextLogout', {}), ['configured']);
    if (result.configured !== true) throw new Error('Logout fault fixture was rejected.');
  }

  async loseNextLogoutResponseAfterCommit(): Promise<void> {
    const result = exactRecord(await this.command('loseNextLogoutResponseAfterCommit', {}), [
      'configured',
    ]);
    if (result.configured !== true) throw new Error('Logout response-loss fixture was rejected.');
  }

  async logoutFaultState(): Promise<Readonly<{ committedResponseLosses: number; calls: number }>> {
    const result = exactRecord(await this.command('logoutFaultState', {}), [
      'calls',
      'committedResponseLosses',
    ]);
    if (
      !Number.isSafeInteger(result.calls) ||
      (result.calls as number) < 0 ||
      !Number.isSafeInteger(result.committedResponseLosses) ||
      (result.committedResponseLosses as number) < 0
    ) {
      throw new Error('Invalid logout fault state.');
    }
    return {
      calls: result.calls as number,
      committedResponseLosses: result.committedResponseLosses as number,
    };
  }

  async loseNextInvitationResponseAfterCommit(): Promise<void> {
    const result = exactRecord(await this.command('loseNextInvitationResponseAfterCommit', {}), [
      'configured',
    ]);
    if (result.configured !== true) {
      throw new Error('Invitation response-loss fixture was rejected.');
    }
  }

  async invitationFaultState(): Promise<
    Readonly<{ calls: number; committedResponseLosses: number; pending: boolean }>
  > {
    const result = exactRecord(await this.command('invitationFaultState', {}), [
      'calls',
      'committedResponseLosses',
      'pending',
    ]);
    if (
      !Number.isSafeInteger(result.calls) ||
      (result.calls as number) < 0 ||
      !Number.isSafeInteger(result.committedResponseLosses) ||
      (result.committedResponseLosses as number) < 0 ||
      typeof result.pending !== 'boolean'
    ) {
      throw new Error('Invalid invitation response-loss state.');
    }
    return {
      calls: result.calls as number,
      committedResponseLosses: result.committedResponseLosses as number,
      pending: result.pending,
    };
  }

  async createExpiredPreAuth(
    email: string,
    password: string,
  ): Promise<
    Readonly<{
      challengeId: string;
      csrfToken: string;
      expiresAt: string;
      nextStep: 'FIRST_TOTP_ENROLLMENT' | 'TOTP_VERIFY';
      preAuthToken: string;
    }>
  > {
    const result = exactRecord(
      await this.command('createExpiredPreAuthFixture', { email, password }),
      ['challengeId', 'csrfToken', 'expiresAt', 'nextStep', 'preAuthToken'],
    );
    if (
      typeof result.challengeId !== 'string' ||
      !UUID.test(result.challengeId) ||
      typeof result.csrfToken !== 'string' ||
      result.csrfToken.length < 32 ||
      typeof result.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(result.expiresAt)) ||
      result.nextStep !== 'TOTP_VERIFY' ||
      typeof result.preAuthToken !== 'string' ||
      result.preAuthToken.length < 32
    ) {
      throw new Error('Expired-preauth fixture was rejected.');
    }
    this.registerSensitiveValues([result.csrfToken, result.preAuthToken]);
    return result as {
      challengeId: string;
      csrfToken: string;
      expiresAt: string;
      nextStep: 'TOTP_VERIFY';
      preAuthToken: string;
    };
  }

  async resetRefreshProbe(): Promise<void> {
    const result = exactRecord(await this.command('resetRefreshProbe', {}), ['reset']);
    if (result.reset !== true) throw new Error('Refresh probe reset was rejected.');
  }

  async refreshProbeState(): Promise<
    Readonly<{ active: number; calls: number; maxConcurrency: number }>
  > {
    const result = exactRecord(await this.command('refreshProbeState', {}), [
      'active',
      'calls',
      'maxConcurrency',
    ]);
    if (
      !Number.isSafeInteger(result.active) ||
      !Number.isSafeInteger(result.calls) ||
      !Number.isSafeInteger(result.maxConcurrency)
    ) {
      throw new Error('Invalid refresh probe state.');
    }
    return result as { active: number; calls: number; maxConcurrency: number };
  }

  async configureNextRefreshOffset(seconds: 960 | 29_820 | 43_260): Promise<void> {
    const result = exactRecord(await this.command('configureNextRefreshOffset', { seconds }), [
      'configured',
    ]);
    if (result.configured !== true) throw new Error('Refresh clock fixture was rejected.');
  }

  async createInvitation(
    options: Readonly<{
      accessToken: string;
      email: string;
      idempotencyKey: string;
      totpCode: string;
    }>,
  ): Promise<string> {
    const result = record(await this.command('createInvitationFixture', options));
    if (
      result.kind !== 'INVITATION_CREATED' ||
      typeof result.invitationId !== 'string' ||
      !UUID.test(result.invitationId)
    ) {
      throw new Error('Invitation fixture was rejected.');
    }
    return result.invitationId;
  }

  private async command(action: string, payload: unknown): Promise<unknown> {
    const requestId = randomUUID();
    const filename = `${requestId}.request.json`;
    writeExclusiveJson(join(this.root, 'commands'), filename, {
      action,
      campaignId: this.campaignId,
      capability: this.capability,
      payload,
      requestId,
      version: 1,
    });
    const responsePath = join(this.root, 'responses', `${requestId}.response.json`);
    await waitForFile(responsePath);
    const response = exactRecord(readJson(responsePath), [
      'campaignId',
      'requestId',
      'result',
      'status',
      'version',
    ]);
    if (
      response.version !== 1 ||
      response.campaignId !== this.campaignId ||
      response.requestId !== requestId
    ) {
      throw new Error('Private channel command failed.');
    }
    if (response.status !== 'OK') {
      if (!C3_PRIVATE_DIAGNOSTIC_ACTIONS.has(action)) {
        throw new Error('Private channel command failed.');
      }
      throw new Error(
        `Private channel command failed (${action}:${privateRejectionCode(response.result)}).`,
      );
    }
    return response.result;
  }
}

function decodeBase32(value: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of value) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('Invalid TOTP fixture secret.');
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

export function totp(secret: string, now = Date.now()): string {
  const counter = BigInt(Math.floor(now / 30_000));
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);
  const digest = createHmac('sha256', decodeBase32(secret)).update(message).digest();
  const offset = (digest.at(-1) ?? 0) & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

type C3Fixtures = {
  artifactRedactionGuard: void;
  privateChannel: C3PrivateChannel;
};

type C3WorkerFixtures = {
  chainPage: Page;
};

export const test = base.extend<C3Fixtures, C3WorkerFixtures>({
  artifactRedactionGuard: [
    async ({ browserName }, provide, testInfo) => {
      await provide();
      if (
        browserName === 'chromium' &&
        process.env.KORA_C3_VISUAL_FIXTURE_MODE !== '1' &&
        testInfo.errors.length > 0
      ) {
        new C3PrivateChannel().finalizeTestErrors(testInfo.errors);
      }
    },
    { auto: true },
  ],
  chainPage: [
    async ({ browser, browserName }, provide) => {
      if (browserName !== 'chromium') {
        throw new Error('The stateful C3 chain is restricted to Chromium.');
      }
      const context = await browser.newContext({
        baseURL: required('KORA_C3_BASE_URL'),
        serviceWorkers: 'block',
      });
      const page = await context.newPage();
      try {
        await provide(page);
      } finally {
        await context.close();
      }
    },
    { scope: 'worker' },
  ],
  privateChannel: async ({ browserName }, provide) => {
    if (browserName !== 'chromium') {
      throw new Error('The private C3 channel is restricted to the Chromium qualification.');
    }
    await provide(new C3PrivateChannel());
  },
});

export { expect } from '@playwright/test';
