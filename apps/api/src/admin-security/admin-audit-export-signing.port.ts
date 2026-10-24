import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from 'node:crypto';

export const ADMIN_AUDIT_EXPORT_SIGNING = Symbol('ADMIN_AUDIT_EXPORT_SIGNING');

export class AdminAuditExportSigningUnavailableError extends Error {
  constructor() {
    super('Admin audit export signing key is unavailable.');
    this.name = 'AdminAuditExportSigningUnavailableError';
  }
}

export interface AdminAuditExportSigningPort {
  activeKeyId(signal?: AbortSignal): Promise<string>;
  sign(keyId: string, input: Uint8Array, signal?: AbortSignal): Promise<Uint8Array>;
  verify(
    keyId: string,
    input: Uint8Array,
    signature: Uint8Array,
    signal?: AbortSignal,
  ): Promise<boolean>;
}

export class UnavailableAdminAuditExportSigningPort implements AdminAuditExportSigningPort {
  async activeKeyId(): Promise<string> {
    throw new AdminAuditExportSigningUnavailableError();
  }

  async sign(): Promise<Uint8Array> {
    throw new AdminAuditExportSigningUnavailableError();
  }

  async verify(): Promise<boolean> {
    throw new AdminAuditExportSigningUnavailableError();
  }
}

export class TestEd25519AdminAuditExportSigningPort implements AdminAuditExportSigningPort {
  private readonly keyId = 'test-ed25519-key-v1';
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  constructor() {
    const seed = Buffer.from(
      '4b4f52412b5f4332425f544553545f454432353531395f4b45595f56315f3031',
      'hex',
    );
    const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
    this.privateKey = createPrivateKey({ format: 'der', key: pkcs8, type: 'pkcs8' });
    this.publicKey = createPublicKey(this.privateKey);
  }

  async activeKeyId(signal?: AbortSignal): Promise<string> {
    signal?.throwIfAborted();
    return this.keyId;
  }

  async sign(keyId: string, input: Uint8Array, signal?: AbortSignal): Promise<Uint8Array> {
    signal?.throwIfAborted();
    if (keyId !== this.keyId) throw new AdminAuditExportSigningUnavailableError();
    return sign(null, input, this.privateKey);
  }

  async verify(
    keyId: string,
    input: Uint8Array,
    signature: Uint8Array,
    signal?: AbortSignal,
  ): Promise<boolean> {
    signal?.throwIfAborted();
    return keyId === this.keyId && verify(null, input, this.publicKey, signature);
  }
}
