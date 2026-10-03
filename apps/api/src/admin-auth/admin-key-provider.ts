import {
  constants,
  createHmac,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto';

export const ADMIN_KEY_PROVIDER = Symbol('ADMIN_KEY_PROVIDER');

export type AdminKeyProviderOperation =
  'KEYED_DIGEST' | 'RESOLVE_SIGNING_KEY' | 'SIGN_RS256' | 'UNWRAP_DEK' | 'WRAP_DEK';

export class AdminKeyProviderUnavailableError extends Error {
  constructor() {
    super('Admin key provider unavailable.');
    this.name = 'AdminKeyProviderUnavailableError';
  }
}

export interface WrappedAdminDek {
  keyId: string;
  wrappedDek: Uint8Array;
}

export interface AdminRs256Signature {
  keyId: string;
  signature: Uint8Array;
}

export interface AdminKeyedDigestProvider {
  keyedDigest(domain: string, value: Uint8Array): Promise<Uint8Array>;
}

export interface AdminKeyProvider extends AdminKeyedDigestProvider {
  activeEnvelopeKeyId(): Promise<string>;
  activeSigningKeyId(): Promise<string>;
  assertAvailable(): Promise<void>;
  resolveJwtVerificationKey(keyId: string): Promise<KeyObject | undefined>;
  signRs256(signingInput: Uint8Array): Promise<AdminRs256Signature>;
  unwrapDek(wrapped: WrappedAdminDek): Promise<Uint8Array>;
  wrapDek(dek: Uint8Array): Promise<WrappedAdminDek>;
}

export class UnavailableAdminKeyProvider implements AdminKeyProvider {
  async activeEnvelopeKeyId(): Promise<string> {
    throw new AdminKeyProviderUnavailableError();
  }

  async activeSigningKeyId(): Promise<string> {
    throw new AdminKeyProviderUnavailableError();
  }

  async assertAvailable(): Promise<void> {
    throw new AdminKeyProviderUnavailableError();
  }

  async keyedDigest(domain: string, value: Uint8Array): Promise<Uint8Array> {
    void domain;
    void value;
    throw new AdminKeyProviderUnavailableError();
  }

  async resolveJwtVerificationKey(keyId: string): Promise<KeyObject | undefined> {
    void keyId;
    throw new AdminKeyProviderUnavailableError();
  }

  async signRs256(signingInput: Uint8Array): Promise<AdminRs256Signature> {
    void signingInput;
    throw new AdminKeyProviderUnavailableError();
  }

  async unwrapDek(wrapped: WrappedAdminDek): Promise<Uint8Array> {
    void wrapped;
    throw new AdminKeyProviderUnavailableError();
  }

  async wrapDek(dek: Uint8Array): Promise<WrappedAdminDek> {
    void dek;
    throw new AdminKeyProviderUnavailableError();
  }
}

interface RsaKeyPair {
  privateKey: KeyObject;
  publicKey: KeyObject;
}

function createRsaKeyPair(): RsaKeyPair {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicExponent: 0x10001,
  });
}

function newKeyId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

function requireDomain(domain: string): void {
  if (!/^[A-Z0-9_:-]{1,96}$/u.test(domain)) {
    throw new TypeError('Invalid key-provider digest domain.');
  }
}

/**
 * Test-only adapter. It is intentionally constructed and injected directly by a
 * harness; no environment switch or production factory can activate it.
 */
export class TestEphemeralAdminKeyProvider implements AdminKeyProvider {
  private activeEnvelopeKey: string;
  private activeSigningKey: string;
  private readonly envelopeKeys = new Map<string, RsaKeyPair>();
  private readonly signingKeys = new Map<string, RsaKeyPair>();
  private readonly digestKey = randomBytes(32);
  private readonly failures = new Set<AdminKeyProviderOperation>();

  constructor() {
    this.activeEnvelopeKey = this.addEnvelopeKey();
    this.activeSigningKey = this.addSigningKey();
  }

  async assertAvailable(): Promise<void> {
    if (this.failures.size > 0) {
      throw new AdminKeyProviderUnavailableError();
    }
  }

  fail(operation: AdminKeyProviderOperation): void {
    this.failures.add(operation);
  }

  recover(operation?: AdminKeyProviderOperation): void {
    if (operation === undefined) {
      this.failures.clear();
      return;
    }
    this.failures.delete(operation);
  }

  rotateEnvelopeKey(): string {
    this.activeEnvelopeKey = this.addEnvelopeKey();
    return this.activeEnvelopeKey;
  }

  rotateSigningKey(): string {
    this.activeSigningKey = this.addSigningKey();
    return this.activeSigningKey;
  }

  currentEnvelopeKeyId(): string {
    return this.activeEnvelopeKey;
  }

  currentSigningKeyId(): string {
    return this.activeSigningKey;
  }

  async activeEnvelopeKeyId(): Promise<string> {
    this.assertOperationAvailable('WRAP_DEK');
    return this.activeEnvelopeKey;
  }

  async activeSigningKeyId(): Promise<string> {
    this.assertOperationAvailable('SIGN_RS256');
    return this.activeSigningKey;
  }

  async keyedDigest(domain: string, value: Uint8Array): Promise<Uint8Array> {
    this.assertOperationAvailable('KEYED_DIGEST');
    requireDomain(domain);
    const domainBytes = Buffer.from(domain, 'utf8');
    const prefix = Buffer.allocUnsafe(2);
    prefix.writeUInt16BE(domainBytes.length);
    return createHmac('sha256', this.digestKey)
      .update(prefix)
      .update(domainBytes)
      .update(value)
      .digest();
  }

  async resolveJwtVerificationKey(keyId: string): Promise<KeyObject | undefined> {
    this.assertOperationAvailable('RESOLVE_SIGNING_KEY');
    return this.signingKeys.get(keyId)?.publicKey;
  }

  async signRs256(signingInput: Uint8Array): Promise<AdminRs256Signature> {
    this.assertOperationAvailable('SIGN_RS256');
    const pair = this.signingKeys.get(this.activeSigningKey);
    if (pair === undefined) {
      throw new AdminKeyProviderUnavailableError();
    }
    return {
      keyId: this.activeSigningKey,
      signature: sign('RSA-SHA256', signingInput, {
        key: pair.privateKey,
        padding: constants.RSA_PKCS1_PADDING,
      }),
    };
  }

  async unwrapDek(wrapped: WrappedAdminDek): Promise<Uint8Array> {
    this.assertOperationAvailable('UNWRAP_DEK');
    const pair = this.envelopeKeys.get(wrapped.keyId);
    if (pair === undefined) {
      throw new AdminKeyProviderUnavailableError();
    }
    try {
      return privateDecrypt(
        {
          key: pair.privateKey,
          oaepHash: 'sha256',
          padding: constants.RSA_PKCS1_OAEP_PADDING,
        },
        wrapped.wrappedDek,
      );
    } catch {
      throw new AdminKeyProviderUnavailableError();
    }
  }

  async wrapDek(dek: Uint8Array): Promise<WrappedAdminDek> {
    this.assertOperationAvailable('WRAP_DEK');
    if (dek.byteLength !== 32) {
      throw new TypeError('A data-encryption key must contain exactly 32 bytes.');
    }
    const pair = this.envelopeKeys.get(this.activeEnvelopeKey);
    if (pair === undefined) {
      throw new AdminKeyProviderUnavailableError();
    }
    return {
      keyId: this.activeEnvelopeKey,
      wrappedDek: publicEncrypt(
        {
          key: pair.publicKey,
          oaepHash: 'sha256',
          padding: constants.RSA_PKCS1_OAEP_PADDING,
        },
        dek,
      ),
    };
  }

  private addEnvelopeKey(): string {
    const keyId = newKeyId('test-envelope');
    this.envelopeKeys.set(keyId, createRsaKeyPair());
    return keyId;
  }

  private addSigningKey(): string {
    const keyId = newKeyId('test-signing');
    this.signingKeys.set(keyId, createRsaKeyPair());
    return keyId;
  }

  private assertOperationAvailable(operation: AdminKeyProviderOperation): void {
    if (this.failures.has(operation)) {
      throw new AdminKeyProviderUnavailableError();
    }
  }
}
