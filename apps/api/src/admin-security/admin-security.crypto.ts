import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { AdminNotificationPurpose } from './admin-notification.port';

export const ADMIN_SECURITY_CRYPTO = Symbol('ADMIN_SECURITY_CRYPTO');
export const ADMIN_SECURITY_OUTBOX_KEYRING = Symbol('ADMIN_SECURITY_OUTBOX_KEYRING');

const NON_AMBIGUOUS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/u;
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

export interface AdminSecurityOutboxKey {
  readonly id: string;
  readonly key: Uint8Array;
}

export interface AdminSecurityOutboxKeyring {
  assertAvailable(): Promise<void>;
  activeWriteKey(): Promise<AdminSecurityOutboxKey>;
  readKey(id: string): Promise<AdminSecurityOutboxKey | undefined>;
}

export interface AdminEncryptedOutboxPayload {
  readonly aadHash: string;
  readonly encryptedPayload: string;
  readonly encryptionKeyId: string;
  readonly encryptionNonce: string;
  readonly encryptionTag: string;
}

export interface AdminOutboxAadInput {
  readonly generation: number;
  readonly logicalDeliveryId: string;
  readonly outboxId: string;
  readonly purpose: AdminNotificationPurpose;
  readonly sourceId: string;
}

export class AdminSecurityCryptoError extends Error {
  constructor() {
    super('Admin C2a cryptography failed.');
    this.name = 'AdminSecurityCryptoError';
  }
}

export class AdminSecurityOutboxKeyringUnavailableError extends Error {
  constructor() {
    super('Admin C2a outbox keyring is unavailable.');
    this.name = 'AdminSecurityOutboxKeyringUnavailableError';
  }
}

export class UnavailableAdminSecurityOutboxKeyring implements AdminSecurityOutboxKeyring {
  async assertAvailable(): Promise<never> {
    throw new AdminSecurityOutboxKeyringUnavailableError();
  }

  async activeWriteKey(): Promise<never> {
    throw new AdminSecurityOutboxKeyringUnavailableError();
  }

  async readKey(): Promise<undefined> {
    return undefined;
  }
}

/** Test harness only. Production modules reject this keyring outside NODE_ENV=test. */
export class TestAdminSecurityOutboxKeyring implements AdminSecurityOutboxKeyring {
  private readonly keys: ReadonlyMap<string, Uint8Array>;

  constructor(
    private readonly activeId = 'test-c2a-key-v1',
    entries: readonly AdminSecurityOutboxKey[] = [
      { id: activeId, key: createHash('sha256').update(activeId, 'utf8').digest() },
    ],
  ) {
    this.keys = new Map(entries.map((entry) => [entry.id, Buffer.from(entry.key)]));
    this.requireKey(activeId);
  }

  async assertAvailable(): Promise<void> {
    this.requireKey(this.activeId);
  }

  async activeWriteKey(): Promise<AdminSecurityOutboxKey> {
    return this.requireKey(this.activeId);
  }

  async readKey(id: string): Promise<AdminSecurityOutboxKey | undefined> {
    const key = this.keys.get(id);
    return key === undefined ? undefined : { id, key: Buffer.from(key) };
  }

  private requireKey(id: string): AdminSecurityOutboxKey {
    const key = this.keys.get(id);
    if (!KEY_ID_PATTERN.test(id) || key?.byteLength !== KEY_BYTES) {
      throw new AdminSecurityOutboxKeyringUnavailableError();
    }
    return { id, key: Buffer.from(key) };
  }
}

function field(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.byteLength > 65_535) throw new AdminSecurityCryptoError();
  const length = Buffer.allocUnsafe(2);
  length.writeUInt16BE(bytes.byteLength);
  return Buffer.concat([length, bytes]);
}

function aad(input: AdminOutboxAadInput): Buffer {
  if (
    !/^[0-9a-f-]{36}$/iu.test(input.outboxId) ||
    !/^[0-9a-f-]{36}$/iu.test(input.logicalDeliveryId) ||
    input.sourceId.length < 1 ||
    !Number.isSafeInteger(input.generation) ||
    input.generation < 1
  ) {
    throw new AdminSecurityCryptoError();
  }
  return Buffer.concat([
    field('KORA_ADMIN_NOTIFICATION_OUTBOX_V1'),
    field(input.outboxId),
    field(input.logicalDeliveryId),
    field(input.purpose),
    field(input.sourceId),
    field(String(input.generation)),
  ]);
}

function decode(value: string, bytes?: number): Buffer {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new AdminSecurityCryptoError();
  const decoded = Buffer.from(value, 'base64url');
  if (
    (bytes !== undefined && decoded.byteLength !== bytes) ||
    decoded.toString('base64url') !== value
  ) {
    throw new AdminSecurityCryptoError();
  }
  return decoded;
}

function unbiasedCharacters(length: number): string {
  let output = '';
  const usable = Math.floor(256 / NON_AMBIGUOUS_ALPHABET.length) * NON_AMBIGUOUS_ALPHABET.length;
  while (output.length < length) {
    for (const byte of randomBytes(Math.max(32, length - output.length))) {
      if (byte >= usable) continue;
      output += NON_AMBIGUOUS_ALPHABET[byte % NON_AMBIGUOUS_ALPHABET.length];
      if (output.length === length) break;
    }
  }
  return output;
}

function stableRecord(record: Readonly<Record<string, string>>): Buffer {
  const keys = Object.keys(record).sort();
  if (
    keys.length === 0 ||
    keys.some((key) => key.length === 0 || typeof record[key] !== 'string')
  ) {
    throw new AdminSecurityCryptoError();
  }
  return Buffer.concat([
    field('KORA_ADMIN_NOTIFICATION_PAYLOAD_V1'),
    ...keys.flatMap((key) => [field(key), field(record[key]!)]),
  ]);
}

function parseStableRecord(bytes: Buffer): Readonly<Record<string, string>> {
  let offset = 0;
  const read = (): string => {
    if (offset + 2 > bytes.byteLength) throw new AdminSecurityCryptoError();
    const length = bytes.readUInt16BE(offset);
    offset += 2;
    if (offset + length > bytes.byteLength) throw new AdminSecurityCryptoError();
    const value = bytes.subarray(offset, offset + length).toString('utf8');
    offset += length;
    return value;
  };
  if (read() !== 'KORA_ADMIN_NOTIFICATION_PAYLOAD_V1') {
    throw new AdminSecurityCryptoError();
  }
  const record: Record<string, string> = {};
  while (offset < bytes.byteLength) {
    const key = read();
    const value = read();
    if (key.length === 0 || Object.hasOwn(record, key)) throw new AdminSecurityCryptoError();
    record[key] = value;
  }
  return Object.freeze(record);
}

export class AdminSecurityCrypto {
  constructor(private readonly keyring: AdminSecurityOutboxKeyring) {}

  async assertOutboxAvailable(): Promise<void> {
    await this.keyring.assertAvailable();
    const active = await this.keyring.activeWriteKey();
    if (!KEY_ID_PATTERN.test(active.id) || active.key.byteLength !== KEY_BYTES) {
      throw new AdminSecurityOutboxKeyringUnavailableError();
    }
  }

  randomCode(length = 28): string {
    if (!Number.isSafeInteger(length) || length < 26 || length > 64) {
      throw new AdminSecurityCryptoError();
    }
    return unbiasedCharacters(length);
  }

  sha256(value: string | Uint8Array): string {
    return createHash('sha256').update(value).digest('hex');
  }

  canonicalDigest(domain: string, fields: readonly (readonly [string, string])[]): string {
    const names = new Set<string>();
    const parts: Buffer[] = [field(domain)];
    for (const [name, value] of fields) {
      if (name.length === 0 || names.has(name)) throw new AdminSecurityCryptoError();
      names.add(name);
      parts.push(field(name), field(value));
    }
    return this.sha256(Buffer.concat(parts));
  }

  passwordBinding(password: string): string {
    return this.canonicalDigest('KORA_ADMIN_PASSWORD_PREPARATION_V1', [['password', password]]);
  }

  bindingMatches(password: string, expected: string): boolean {
    const actual = Buffer.from(this.passwordBinding(password), 'ascii');
    const wanted = Buffer.from(expected, 'ascii');
    return actual.byteLength === wanted.byteLength && timingSafeEqual(actual, wanted);
  }

  async encryptOutboxPayload(
    input: AdminOutboxAadInput,
    payload: Readonly<Record<string, string>>,
  ): Promise<AdminEncryptedOutboxPayload> {
    await this.assertOutboxAvailable();
    const active = await this.keyring.activeWriteKey();
    if (!KEY_ID_PATTERN.test(active.id) || active.key.byteLength !== KEY_BYTES) {
      throw new AdminSecurityOutboxKeyringUnavailableError();
    }
    const associatedData = aad(input);
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv('aes-256-gcm', active.key, nonce, { authTagLength: TAG_BYTES });
    cipher.setAAD(associatedData);
    const ciphertext = Buffer.concat([cipher.update(stableRecord(payload)), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      aadHash: this.sha256(associatedData),
      encryptedPayload: ciphertext.toString('base64url'),
      encryptionKeyId: active.id,
      encryptionNonce: nonce.toString('base64url'),
      encryptionTag: tag.toString('base64url'),
    };
  }

  async decryptOutboxPayload(
    input: AdminOutboxAadInput,
    encrypted: AdminEncryptedOutboxPayload,
  ): Promise<Buffer> {
    const key = await this.keyring.readKey(encrypted.encryptionKeyId);
    if (key === undefined || key.key.byteLength !== KEY_BYTES) {
      throw new AdminSecurityOutboxKeyringUnavailableError();
    }
    const associatedData = aad(input);
    const actualHash = Buffer.from(this.sha256(associatedData), 'ascii');
    const expectedHash = Buffer.from(encrypted.aadHash, 'ascii');
    if (
      actualHash.byteLength !== expectedHash.byteLength ||
      !timingSafeEqual(actualHash, expectedHash)
    ) {
      throw new AdminSecurityCryptoError();
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key.key,
        decode(encrypted.encryptionNonce, NONCE_BYTES),
        { authTagLength: TAG_BYTES },
      );
      decipher.setAAD(associatedData);
      decipher.setAuthTag(decode(encrypted.encryptionTag, TAG_BYTES));
      return Buffer.concat([decipher.update(decode(encrypted.encryptedPayload)), decipher.final()]);
    } catch (error: unknown) {
      if (error instanceof AdminSecurityOutboxKeyringUnavailableError) throw error;
      throw new AdminSecurityCryptoError();
    }
  }

  async decryptOutboxPayloadRecord(
    input: AdminOutboxAadInput,
    encrypted: AdminEncryptedOutboxPayload,
  ): Promise<Readonly<Record<string, string>>> {
    return parseStableRecord(await this.decryptOutboxPayload(input, encrypted));
  }
}
