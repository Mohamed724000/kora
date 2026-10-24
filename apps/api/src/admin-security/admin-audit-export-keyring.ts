import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const ADMIN_AUDIT_EXPORT_KEYRING = Symbol('ADMIN_AUDIT_EXPORT_KEYRING');
const ENVELOPE_VERSION = 'KORA_ADMIN_AUDIT_EXPORT_STORAGE_V1';

export class AdminAuditExportKeyringUnavailableError extends Error {
  constructor() {
    super('Admin audit export storage keyring is unavailable.');
    this.name = 'AdminAuditExportKeyringUnavailableError';
  }
}

export class AdminAuditExportIntegrityError extends Error {
  constructor() {
    super('Admin audit export integrity verification failed.');
    this.name = 'AdminAuditExportIntegrityError';
  }
}

export interface AdminAuditExportStorageKeyring {
  activeKey(signal?: AbortSignal): Promise<Readonly<{ id: string; key: Uint8Array }>>;
  resolveKey(id: string, signal?: AbortSignal): Promise<Uint8Array | undefined>;
}

export interface AdminAuditExportEnvelopeMetadata {
  readonly attemptId: string;
  readonly contentSha256: string;
  readonly exportId: string;
  readonly generation: string;
  readonly plaintextBytes: number;
  readonly signatureKeyId: string;
}

interface EnvelopeV1 extends AdminAuditExportEnvelopeMetadata {
  readonly ciphertext: string;
  readonly keyId: string;
  readonly nonce: string;
  readonly tag: string;
  readonly version: typeof ENVELOPE_VERSION;
}

function canonicalAad(metadata: AdminAuditExportEnvelopeMetadata, keyId: string): Buffer {
  return Buffer.from(
    [
      ENVELOPE_VERSION,
      keyId,
      metadata.exportId,
      metadata.generation,
      metadata.attemptId,
      metadata.contentSha256,
      metadata.signatureKeyId,
      String(metadata.plaintextBytes),
    ].join('\0'),
    'utf8',
  );
}

function base64url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

function decode(value: unknown, size?: number): Buffer {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new AdminAuditExportIntegrityError();
  }
  const decoded = Buffer.from(value, 'base64url');
  if (
    decoded.toString('base64url') !== value ||
    (size !== undefined && decoded.byteLength !== size)
  ) {
    throw new AdminAuditExportIntegrityError();
  }
  return decoded;
}

export async function encryptAdminAuditExport(
  keyring: AdminAuditExportStorageKeyring,
  plaintext: Uint8Array,
  metadata: AdminAuditExportEnvelopeMetadata,
  signal?: AbortSignal,
): Promise<Readonly<{ bytes: Uint8Array; keyId: string }>> {
  signal?.throwIfAborted();
  const active = await keyring.activeKey(signal);
  if (active.key.byteLength !== 32 || !/^[A-Za-z0-9_-]{8,120}$/u.test(active.id)) {
    throw new AdminAuditExportKeyringUnavailableError();
  }
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', active.key, nonce, { authTagLength: 16 });
  cipher.setAAD(canonicalAad(metadata, active.id));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const envelope: EnvelopeV1 = {
    ...metadata,
    ciphertext: base64url(ciphertext),
    keyId: active.id,
    nonce: base64url(nonce),
    tag: base64url(cipher.getAuthTag()),
    version: ENVELOPE_VERSION,
  };
  signal?.throwIfAborted();
  return { bytes: Buffer.from(JSON.stringify(envelope), 'utf8'), keyId: active.id };
}

export async function decryptAdminAuditExport(
  keyring: AdminAuditExportStorageKeyring,
  serialized: Uint8Array,
  expected: AdminAuditExportEnvelopeMetadata,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  try {
    signal?.throwIfAborted();
    const envelope = JSON.parse(Buffer.from(serialized).toString('utf8')) as EnvelopeV1;
    const expectedKeys = [
      'attemptId',
      'ciphertext',
      'contentSha256',
      'exportId',
      'generation',
      'keyId',
      'nonce',
      'plaintextBytes',
      'signatureKeyId',
      'tag',
      'version',
    ].sort();
    if (
      envelope === null ||
      typeof envelope !== 'object' ||
      JSON.stringify(Object.keys(envelope).sort()) !== JSON.stringify(expectedKeys) ||
      envelope.version !== ENVELOPE_VERSION ||
      envelope.exportId !== expected.exportId ||
      envelope.generation !== expected.generation ||
      envelope.attemptId !== expected.attemptId ||
      envelope.contentSha256 !== expected.contentSha256 ||
      envelope.signatureKeyId !== expected.signatureKeyId ||
      envelope.plaintextBytes !== expected.plaintextBytes
    ) {
      throw new AdminAuditExportIntegrityError();
    }
    const key = await keyring.resolveKey(envelope.keyId, signal);
    if (key === undefined || key.byteLength !== 32)
      throw new AdminAuditExportKeyringUnavailableError();
    const decipher = createDecipheriv('aes-256-gcm', key, decode(envelope.nonce, 12), {
      authTagLength: 16,
    });
    decipher.setAAD(canonicalAad(expected, envelope.keyId));
    decipher.setAuthTag(decode(envelope.tag, 16));
    const plaintext = Buffer.concat([
      decipher.update(decode(envelope.ciphertext)),
      decipher.final(),
    ]);
    if (plaintext.byteLength !== expected.plaintextBytes) {
      plaintext.fill(0);
      throw new AdminAuditExportIntegrityError();
    }
    signal?.throwIfAborted();
    return plaintext;
  } catch (error: unknown) {
    if (
      error instanceof AdminAuditExportKeyringUnavailableError ||
      error instanceof AdminAuditExportIntegrityError
    ) {
      throw error;
    }
    throw new AdminAuditExportIntegrityError();
  }
}

export class UnavailableAdminAuditExportStorageKeyring implements AdminAuditExportStorageKeyring {
  async activeKey(signal?: AbortSignal): Promise<Readonly<{ id: string; key: Uint8Array }>> {
    signal?.throwIfAborted();
    throw new AdminAuditExportKeyringUnavailableError();
  }

  async resolveKey(_id: string, signal?: AbortSignal): Promise<Uint8Array | undefined> {
    signal?.throwIfAborted();
    throw new AdminAuditExportKeyringUnavailableError();
  }
}

export class TestAdminAuditExportStorageKeyring implements AdminAuditExportStorageKeyring {
  private readonly keys = new Map<string, Buffer>();
  private activeId = 'test-storage-key-v1';

  constructor(key = Buffer.alloc(32, 0x42)) {
    this.keys.set(this.activeId, Buffer.from(key));
  }

  async activeKey(signal?: AbortSignal): Promise<Readonly<{ id: string; key: Uint8Array }>> {
    signal?.throwIfAborted();
    return { id: this.activeId, key: Buffer.from(this.keys.get(this.activeId)!) };
  }

  async resolveKey(id: string, signal?: AbortSignal): Promise<Uint8Array | undefined> {
    signal?.throwIfAborted();
    const key = this.keys.get(id);
    return key === undefined ? undefined : Buffer.from(key);
  }
}
