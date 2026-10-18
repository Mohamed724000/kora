import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Readable } from 'node:stream';
import { ADMIN_AUTH_CRYPTO, type AdminAuthCrypto } from '../admin-auth/admin-auth.crypto';
import {
  AdminC2TransactionError,
  type AdminC2TransactionErrorCode,
} from '../database/admin-c2-transaction.service';
import {
  ADMIN_PASSWORD_COMPROMISE_PORT,
  AdminPasswordCompromiseUnavailableError,
  type AdminPasswordCompromisePort,
} from './admin-password-compromise.port';
import { AdminSecurityRepository } from './admin-security.repository';

export const ADMIN_BOOTSTRAP_STDIN_POLICY = Object.freeze({
  maximumBytes: 4_096,
  timeoutMs: 5_000,
});

const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_{}|~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u;
const PASSWORD_PATTERN = /^[\s\S]{12,128}$/u;

export interface AdminBootstrapInput {
  readonly email: string;
  readonly password: string;
}

export type AdminBootstrapReconciliation =
  'MATCHING_COMMIT_OBSERVED' | 'NO_COMMIT_OBSERVED' | 'CONFLICTING_STATE_OBSERVED' | 'INCONCLUSIVE';

export type AdminBootstrapOutcome =
  | Readonly<{
      adminUserId: string;
      exitCode: 0;
      nextStep: 'FIRST_TOTP_ENROLLMENT';
      status: 'CREATED';
    }>
  | Readonly<{ exitCode: 1; status: 'FAILED' }>
  | Readonly<{ exitCode: 2; status: 'INVALID_INPUT' }>
  | Readonly<{ exitCode: 3; status: 'ALREADY_BOOTSTRAPPED' }>
  | Readonly<{ exitCode: 4; status: 'DEPENDENCY_UNAVAILABLE' }>
  | Readonly<{
      exitCode: 5;
      reconciliation: AdminBootstrapReconciliation;
      status: 'COMMIT_UNKNOWN';
    }>;

interface BootstrapState {
  readonly auditLogId: string | null;
  readonly guardPresent: boolean;
  readonly guardUserId: string | null;
  readonly userId: string | null;
}

class AdminBootstrapInputError extends Error {
  constructor() {
    super('Invalid bootstrap input.');
    this.name = 'AdminBootstrapInputError';
  }
}

class AdminBootstrapStateConflictError extends Error {
  constructor() {
    super('Bootstrap state already exists.');
    this.name = 'AdminBootstrapStateConflictError';
  }
}

function canonicalEmail(value: unknown): string {
  if (typeof value !== 'string' || value.length < 3 || value.length > 254) {
    throw new AdminBootstrapInputError();
  }
  const canonical = value.replace(/[A-Z]/gu, (character) => character.toLowerCase());
  if (canonical.trim() !== canonical || !EMAIL_PATTERN.test(canonical)) {
    throw new AdminBootstrapInputError();
  }
  return canonical;
}

function jsonStringEnd(value: string, start: number): number {
  let escaped = false;
  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"') return index + 1;
  }
  throw new AdminBootstrapInputError();
}

function assertUniqueTopLevelJsonKeys(value: string): void {
  const whitespace = /\s/u;
  let index = 0;
  const skipWhitespace = (): void => {
    while (index < value.length && whitespace.test(value[index] ?? '')) index += 1;
  };
  skipWhitespace();
  if (value[index] !== '{') throw new AdminBootstrapInputError();
  index += 1;
  const keys = new Set<string>();
  while (true) {
    skipWhitespace();
    if (value[index] === '}') return;
    if (value[index] !== '"') throw new AdminBootstrapInputError();
    const keyEnd = jsonStringEnd(value, index);
    const key = JSON.parse(value.slice(index, keyEnd)) as unknown;
    if (typeof key !== 'string' || keys.has(key)) throw new AdminBootstrapInputError();
    keys.add(key);
    index = keyEnd;
    skipWhitespace();
    if (value[index] !== ':') throw new AdminBootstrapInputError();
    index += 1;
    skipWhitespace();
    let depth = 0;
    while (index < value.length) {
      const character = value[index];
      if (character === '"') {
        index = jsonStringEnd(value, index);
        continue;
      }
      if (character === '{' || character === '[') depth += 1;
      else if (character === '}' || character === ']') {
        if (depth === 0) break;
        depth -= 1;
      } else if (character === ',' && depth === 0) break;
      index += 1;
    }
    skipWhitespace();
    if (value[index] === ',') {
      index += 1;
      continue;
    }
    if (value[index] === '}') return;
    throw new AdminBootstrapInputError();
  }
}

export function parseAdminBootstrapInput(bytes: Uint8Array): AdminBootstrapInput {
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new AdminBootstrapInputError();
  }
  assertUniqueTopLevelJsonKeys(decoded);
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded) as unknown;
  } catch {
    throw new AdminBootstrapInputError();
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AdminBootstrapInputError();
  }
  const record = parsed as Record<string, unknown>;
  if (JSON.stringify(Object.keys(record).sort()) !== '["email","password"]') {
    throw new AdminBootstrapInputError();
  }
  if (typeof record.password !== 'string' || !PASSWORD_PATTERN.test(record.password)) {
    throw new AdminBootstrapInputError();
  }
  return { email: canonicalEmail(record.email), password: record.password };
}

export function readAdminBootstrapStdin(
  stream: Readable,
  policy: Readonly<{ maximumBytes: number; timeoutMs: number }> = ADMIN_BOOTSTRAP_STDIN_POLICY,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let byteLength = 0;
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
      stream.pause();
      if (error === undefined) resolve(Buffer.concat(chunks, byteLength));
      else reject(error);
    };
    const onData = (chunk: Buffer | string): void => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8');
      byteLength += bytes.byteLength;
      if (byteLength > policy.maximumBytes) {
        finish(new AdminBootstrapInputError());
        return;
      }
      chunks.push(bytes);
    };
    const onEnd = (): void => finish();
    const onError = (): void => finish(new AdminBootstrapInputError());
    const timer = setTimeout(() => finish(new AdminBootstrapInputError()), policy.timeoutMs);
    stream.on('data', onData);
    stream.once('end', onEnd);
    stream.once('error', onError);
  });
}

function passwordBinding(password: string): Buffer {
  return createHash('sha256')
    .update('KORA_ADMIN_BOOTSTRAP_PASSWORD_PREPARATION_V1\0', 'utf8')
    .update(password, 'utf8')
    .digest();
}

function matchesBinding(password: string, expected: Uint8Array): boolean {
  const actual = passwordBinding(password);
  return actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected);
}

function executionReference(): string {
  return createHash('sha256')
    .update(`KORA_ADMIN_BOOTSTRAP_EXECUTION_V1\0${randomUUID()}`, 'utf8')
    .digest('hex');
}

function isPresent(state: BootstrapState): boolean {
  return state.guardPresent || state.userId !== null;
}

function transactionCode(error: unknown): AdminC2TransactionErrorCode | undefined {
  return error instanceof AdminC2TransactionError ? error.code : undefined;
}

function isDependencyFailure(error: unknown): boolean {
  return (
    error instanceof AdminPasswordCompromiseUnavailableError ||
    [
      'ACQUISITION_FAILED',
      'ACQUISITION_TIMEOUT',
      'BEGIN_FAILED',
      'BEGIN_TIMEOUT',
      'DRIVER_CONTRACT_VIOLATION',
    ].includes(transactionCode(error) ?? '')
  );
}

@Injectable()
export class AdminBootstrapCommand {
  constructor(
    @Inject(AdminSecurityRepository) private readonly repository: AdminSecurityRepository,
    @Inject(ADMIN_AUTH_CRYPTO) private readonly authCrypto: AdminAuthCrypto,
    @Inject(ADMIN_PASSWORD_COMPROMISE_PORT)
    private readonly passwordCompromise: AdminPasswordCompromisePort,
  ) {}

  async execute(rawInput: Uint8Array): Promise<AdminBootstrapOutcome> {
    let input: AdminBootstrapInput;
    try {
      input = parseAdminBootstrapInput(rawInput);
    } catch {
      return { exitCode: 2, status: 'INVALID_INPUT' };
    }

    let preliminary: BootstrapState;
    try {
      preliminary = await this.readState();
    } catch (error: unknown) {
      return isDependencyFailure(error)
        ? { exitCode: 4, status: 'DEPENDENCY_UNAVAILABLE' }
        : { exitCode: 1, status: 'FAILED' };
    }
    if (isPresent(preliminary)) {
      return { exitCode: 3, status: 'ALREADY_BOOTSTRAPPED' };
    }

    const binding = passwordBinding(input.password);
    let passwordHash: string;
    try {
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new AdminPasswordCompromiseUnavailableError());
        }, 3_000);
      });
      const check = this.passwordCompromise.checkPassword(input.password, {
        signal: controller.signal,
        timeoutMs: 3_000,
      });
      const compromise = await Promise.race([check, deadline]).finally(() => {
        if (timeout !== undefined) clearTimeout(timeout);
      });
      if (compromise === 'COMPROMISED') {
        return { exitCode: 2, status: 'INVALID_INPUT' };
      }
      passwordHash = await this.authCrypto.hashPassword(input.password);
    } catch {
      return { exitCode: 4, status: 'DEPENDENCY_UNAVAILABLE' };
    }
    const auditId = randomUUID();
    const requestId = randomUUID();
    const userId = randomUUID();
    try {
      const created = await this.repository.transaction(async (transaction) => {
        await transaction.acquireBootstrapGuard(userId, auditId);
        const current = await transaction.readBootstrapState();
        if (
          current.userId !== null ||
          !current.guardPresent ||
          current.guardUserId !== userId ||
          current.auditLogId !== auditId
        ) {
          throw new AdminBootstrapStateConflictError();
        }
        if (!matchesBinding(input.password, binding)) {
          throw new Error('Bootstrap password preparation integrity failure.');
        }
        await transaction.bootstrapAdmin({
          auditId,
          email: input.email,
          passwordHash,
          requestId,
          systemExecutionRefHash: executionReference(),
          userId,
        });
        return true as const;
      });
      void created;
      return {
        adminUserId: userId,
        exitCode: 0,
        nextStep: 'FIRST_TOTP_ENROLLMENT',
        status: 'CREATED',
      };
    } catch (error: unknown) {
      if (transactionCode(error) === 'COMMIT_UNKNOWN') {
        return {
          exitCode: 5,
          reconciliation: await this.reconcile(userId, auditId),
          status: 'COMMIT_UNKNOWN',
        };
      }
      const reconciled = await this.safeReadState();
      if (reconciled !== undefined && isPresent(reconciled)) {
        return { exitCode: 3, status: 'ALREADY_BOOTSTRAPPED' };
      }
      return isDependencyFailure(error)
        ? { exitCode: 4, status: 'DEPENDENCY_UNAVAILABLE' }
        : { exitCode: 1, status: 'FAILED' };
    }
  }

  private async readState(): Promise<BootstrapState> {
    return this.repository.transaction((transaction) => transaction.readBootstrapState());
  }

  private async safeReadState(): Promise<BootstrapState | undefined> {
    try {
      return await this.readState();
    } catch {
      return undefined;
    }
  }

  private async reconcile(userId: string, auditId: string): Promise<AdminBootstrapReconciliation> {
    const state = await this.safeReadState();
    if (state === undefined) return 'INCONCLUSIVE';
    if (!isPresent(state)) return 'NO_COMMIT_OBSERVED';
    return state.guardPresent &&
      state.guardUserId === userId &&
      state.userId === userId &&
      state.auditLogId === auditId
      ? 'MATCHING_COMMIT_OBSERVED'
      : 'CONFLICTING_STATE_OBSERVED';
  }
}
