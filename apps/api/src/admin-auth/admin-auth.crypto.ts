import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { argon2id, hash as argonHash, verify as argonVerify } from 'argon2';
import { jwtVerify, type JWTPayload } from 'jose';
import QRCode from 'qrcode';
import type { AdminKeyProvider, WrappedAdminDek } from './admin-key-provider';

export const ADMIN_JWT_ISSUER = 'kora-plus-admin-api';
export const ADMIN_JWT_AUDIENCE = 'kora-plus-admin';
export const ADMIN_JWT_TYPE = 'JWT';
export const ADMIN_AUTH_CRYPTO = Symbol('ADMIN_AUTH_CRYPTO');
export const ADMIN_ACCESS_TOKEN_MAX_SECONDS = 15 * 60;
export const ADMIN_TOTP_PERIOD_SECONDS = 30;
export const ADMIN_TOTP_DIGITS = 6;
export const ADMIN_TOTP_SECRET_BYTES = 32;
export const ADMIN_RECOVERY_CODE_COUNT = 10;

const ARGON_MEMORY_KIB = 65_536;
const ARGON_ITERATIONS = 3;
const ARGON_PARALLELISM = 1;
const ARGON_HASH_BYTES = 32;
const ARGON_SALT_BYTES = 16;
const NON_AMBIGUOUS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_UINT64 = 0xffff_ffff_ffff_ffffn;

export class AdminAuthCryptoError extends Error {
  constructor() {
    super('Admin authentication cryptography failed.');
    this.name = 'AdminAuthCryptoError';
  }
}

export interface AdminRecoveryCodeMaterial {
  selector: string;
  verifier: string;
}

export interface AdminAccessTokenClaims {
  adminUserId: string;
  authorizationVersion: number;
  role: string;
  sessionId: string;
}

export interface VerifiedAdminAccessToken extends AdminAccessTokenClaims {
  expiresAtSeconds: number;
  issuedAtSeconds: number;
  tokenId: string;
}

interface TotpEnvelopeV1 {
  ciphertext: string;
  keyId: string;
  nonce: string;
  tag: string;
  version: 1;
  wrappedDek: string;
}

export interface DecryptedTotpSecret {
  needsRewrap: boolean;
  secret: Uint8Array;
}

function base64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

function decodeBase64Url(value: unknown, minimum: number, maximum: number): Buffer {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new AdminAuthCryptoError();
  }
  const decoded = Buffer.from(value, 'base64url');
  if (
    decoded.byteLength < minimum ||
    decoded.byteLength > maximum ||
    decoded.toString('base64url') !== value
  ) {
    throw new AdminAuthCryptoError();
  }
  return decoded;
}

function aadForTotp(adminUserId: string): Buffer {
  if (!/^[0-9a-f-]{36}$/iu.test(adminUserId)) {
    throw new AdminAuthCryptoError();
  }
  const domain = Buffer.from('KORA_ADMIN_TOTP_ENVELOPE_V1', 'ascii');
  const subject = Buffer.from(adminUserId, 'utf8');
  const purpose = Buffer.from('TOTP', 'ascii');
  const lengths = Buffer.allocUnsafe(6);
  lengths.writeUInt16BE(domain.byteLength, 0);
  lengths.writeUInt16BE(subject.byteLength, 2);
  lengths.writeUInt16BE(purpose.byteLength, 4);
  return Buffer.concat([lengths, domain, subject, purpose]);
}

function exactObject(value: unknown, expectedKeys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AdminAuthCryptoError();
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...expectedKeys].sort())) {
    throw new AdminAuthCryptoError();
  }
  return record;
}

function parseTotpEnvelope(serialized: string): TotpEnvelopeV1 {
  if (Buffer.byteLength(serialized, 'utf8') > 4096) {
    throw new AdminAuthCryptoError();
  }
  try {
    const record = exactObject(JSON.parse(serialized), [
      'ciphertext',
      'keyId',
      'nonce',
      'tag',
      'version',
      'wrappedDek',
    ]);
    if (
      record.version !== 1 ||
      typeof record.keyId !== 'string' ||
      !/^[A-Za-z0-9_-]{8,128}$/u.test(record.keyId)
    ) {
      throw new AdminAuthCryptoError();
    }
    decodeBase64Url(record.nonce, 12, 12);
    decodeBase64Url(record.tag, 16, 16);
    decodeBase64Url(record.ciphertext, ADMIN_TOTP_SECRET_BYTES, ADMIN_TOTP_SECRET_BYTES);
    decodeBase64Url(record.wrappedDek, 128, 1024);
    return record as unknown as TotpEnvelopeV1;
  } catch (error: unknown) {
    if (error instanceof AdminAuthCryptoError) {
      throw error;
    }
    throw new AdminAuthCryptoError();
  }
}

function unbiasedCharacters(length: number): string {
  let output = '';
  const usableByteLimit =
    Math.floor(256 / NON_AMBIGUOUS_ALPHABET.length) * NON_AMBIGUOUS_ALPHABET.length;
  while (output.length < length) {
    for (const byte of randomBytes(Math.max(32, length - output.length))) {
      if (byte >= usableByteLimit) {
        continue;
      }
      output += NON_AMBIGUOUS_ALPHABET[byte % NON_AMBIGUOUS_ALPHABET.length];
      if (output.length === length) {
        break;
      }
    }
  }
  return output;
}

function recoveryInput(selector: string, verifier: string): Buffer {
  if (!/^[A-HJ-NP-Z2-9]{8,16}$/u.test(selector) || !/^[A-HJ-NP-Z2-9]{26,32}$/u.test(verifier)) {
    throw new AdminAuthCryptoError();
  }
  return Buffer.from(`KORA_ADMIN_RECOVERY_V1\0${selector}\0${verifier}`, 'utf8');
}

function validBoundedPhc(value: string): boolean {
  const parts = value.split('$');
  if (
    parts.length !== 6 ||
    parts[0] !== '' ||
    parts[1] !== 'argon2id' ||
    parts[2] !== 'v=19' ||
    !/^[A-Za-z0-9+/]{22}$/u.test(parts[4] ?? '') ||
    !/^[A-Za-z0-9+/]{43}$/u.test(parts[5] ?? '')
  ) {
    return false;
  }
  const parameters = (parts[3] ?? '').split(',');
  if (parameters.length !== 3 || new Set(parameters).size !== 3) {
    return false;
  }
  const expected = new Set(['m=65536', 'p=1', 't=3']);
  if (parameters.some((parameter) => !expected.has(parameter))) {
    return false;
  }
  try {
    return (
      Buffer.from(parts[4]!, 'base64').byteLength === ARGON_SALT_BYTES &&
      Buffer.from(parts[5]!, 'base64').byteLength === ARGON_HASH_BYTES
    );
  } catch {
    return false;
  }
}

function constantTimeCodeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'ascii');
  const rightBytes = Buffer.from(right, 'ascii');
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

export class AdminAuthCrypto {
  constructor(private readonly keyProvider: AdminKeyProvider) {}

  randomOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  randomTotpSecret(): Uint8Array {
    return randomBytes(ADMIN_TOTP_SECRET_BYTES);
  }

  generateRecoveryCode(): AdminRecoveryCodeMaterial {
    return {
      selector: unbiasedCharacters(12),
      verifier: unbiasedCharacters(28),
    };
  }

  generateRecoveryCodes(): AdminRecoveryCodeMaterial[] {
    const seen = new Set<string>();
    const codes: AdminRecoveryCodeMaterial[] = [];
    while (codes.length < ADMIN_RECOVERY_CODE_COUNT) {
      const code = this.generateRecoveryCode();
      const serialized = `${code.selector}:${code.verifier}`;
      if (!seen.has(serialized)) {
        seen.add(serialized);
        codes.push(code);
      }
    }
    return codes;
  }

  async hashPassword(password: string): Promise<string> {
    return this.argonHash(Buffer.from(password, 'utf8'));
  }

  async verifyPassword(passwordHash: string, password: string): Promise<boolean> {
    return this.argonVerify(passwordHash, Buffer.from(password, 'utf8'));
  }

  async hashRecoveryCode(code: AdminRecoveryCodeMaterial): Promise<string> {
    return this.argonHash(recoveryInput(code.selector, code.verifier));
  }

  async verifyRecoveryCode(
    codeHash: string,
    candidate: AdminRecoveryCodeMaterial,
  ): Promise<boolean> {
    return this.argonVerify(codeHash, recoveryInput(candidate.selector, candidate.verifier));
  }

  generateTotpCode(secret: Uint8Array, counter: bigint, digits = ADMIN_TOTP_DIGITS): string {
    if (
      secret.byteLength < 20 ||
      secret.byteLength > 64 ||
      counter < 0n ||
      counter > MAX_UINT64 ||
      !Number.isInteger(digits) ||
      digits < 6 ||
      digits > 8
    ) {
      throw new AdminAuthCryptoError();
    }
    const counterBytes = Buffer.alloc(8);
    counterBytes.writeBigUInt64BE(counter);
    const digest = createHmac('sha256', secret).update(counterBytes).digest();
    const offset = (digest.at(-1) ?? 0) & 0x0f;
    const binary =
      (((digest[offset] ?? 0) & 0x7f) << 24) |
      ((digest[offset + 1] ?? 0) << 16) |
      ((digest[offset + 2] ?? 0) << 8) |
      (digest[offset + 3] ?? 0);
    return (binary % 10 ** digits).toString().padStart(digits, '0');
  }

  verifyTotp(
    secret: Uint8Array,
    code: string,
    unixSeconds: number,
    lastAcceptedCounter: bigint | null,
  ): bigint | undefined {
    if (!/^\d{6}$/u.test(code) || !Number.isSafeInteger(unixSeconds) || unixSeconds < 0) {
      return undefined;
    }
    const current = BigInt(Math.floor(unixSeconds / ADMIN_TOTP_PERIOD_SECONDS));
    const candidates = [current - 1n, current, current + 1n];
    let accepted: bigint | undefined;
    for (const candidate of candidates) {
      const safeCandidate = candidate < 0n ? 0n : candidate;
      const expected = this.generateTotpCode(secret, safeCandidate);
      const matches = constantTimeCodeEqual(expected, code);
      if (
        matches &&
        candidate >= 0n &&
        candidate <= MAX_UINT64 &&
        (lastAcceptedCounter === null || candidate > lastAcceptedCounter) &&
        (accepted === undefined || candidate > accepted)
      ) {
        accepted = candidate;
      }
    }
    return accepted;
  }

  buildTotpProvisioningUri(secret: Uint8Array, accountLabel: string): string {
    if (
      secret.byteLength !== ADMIN_TOTP_SECRET_BYTES ||
      accountLabel.length < 1 ||
      accountLabel.length > 254 ||
      /\p{Cc}/u.test(accountLabel)
    ) {
      throw new AdminAuthCryptoError();
    }
    const label = encodeURIComponent(`KORA+:${accountLabel}`);
    const query = new URLSearchParams({
      algorithm: 'SHA256',
      digits: String(ADMIN_TOTP_DIGITS),
      issuer: 'KORA+',
      period: String(ADMIN_TOTP_PERIOD_SECONDS),
      secret: this.base32(secret),
    });
    return `otpauth://totp/${label}?${query.toString()}`;
  }

  async createTotpQrPng(secret: Uint8Array, accountLabel: string): Promise<Buffer> {
    const uri = this.buildTotpProvisioningUri(secret, accountLabel);
    try {
      return await QRCode.toBuffer(uri, {
        errorCorrectionLevel: 'M',
        margin: 4,
        type: 'png',
        width: 320,
      });
    } catch {
      throw new AdminAuthCryptoError();
    }
  }

  async encryptTotpSecret(secret: Uint8Array, adminUserId: string): Promise<string> {
    if (secret.byteLength !== ADMIN_TOTP_SECRET_BYTES) {
      throw new AdminAuthCryptoError();
    }
    const dek = randomBytes(32);
    try {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', dek, nonce, { authTagLength: 16 });
      cipher.setAAD(aadForTotp(adminUserId));
      const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
      const wrapped = await this.keyProvider.wrapDek(dek);
      const envelope: TotpEnvelopeV1 = {
        ciphertext: base64Url(ciphertext),
        keyId: wrapped.keyId,
        nonce: base64Url(nonce),
        tag: base64Url(cipher.getAuthTag()),
        version: 1,
        wrappedDek: base64Url(wrapped.wrappedDek),
      };
      return JSON.stringify(envelope);
    } catch (error: unknown) {
      if (error instanceof AdminAuthCryptoError) {
        throw error;
      }
      throw new AdminAuthCryptoError();
    } finally {
      dek.fill(0);
    }
  }

  async decryptTotpSecret(serialized: string, adminUserId: string): Promise<DecryptedTotpSecret> {
    const envelope = parseTotpEnvelope(serialized);
    let dek: Buffer | undefined;
    try {
      const wrapped: WrappedAdminDek = {
        keyId: envelope.keyId,
        wrappedDek: decodeBase64Url(envelope.wrappedDek, 128, 1024),
      };
      dek = Buffer.from(await this.keyProvider.unwrapDek(wrapped));
      if (dek.byteLength !== 32) {
        throw new AdminAuthCryptoError();
      }
      const decipher = createDecipheriv(
        'aes-256-gcm',
        dek,
        decodeBase64Url(envelope.nonce, 12, 12),
        { authTagLength: 16 },
      );
      decipher.setAAD(aadForTotp(adminUserId));
      decipher.setAuthTag(decodeBase64Url(envelope.tag, 16, 16));
      const secret = Buffer.concat([
        decipher.update(decodeBase64Url(envelope.ciphertext, 32, 32)),
        decipher.final(),
      ]);
      if (secret.byteLength !== ADMIN_TOTP_SECRET_BYTES) {
        secret.fill(0);
        throw new AdminAuthCryptoError();
      }
      const activeKeyId = await this.keyProvider.activeEnvelopeKeyId();
      return {
        needsRewrap: activeKeyId !== envelope.keyId,
        secret,
      };
    } catch {
      throw new AdminAuthCryptoError();
    } finally {
      dek?.fill(0);
    }
  }

  async issueAccessToken(
    claims: AdminAccessTokenClaims,
    nowSeconds: number,
    lifetimeSeconds = ADMIN_ACCESS_TOKEN_MAX_SECONDS,
  ): Promise<string> {
    if (
      !Number.isSafeInteger(nowSeconds) ||
      nowSeconds < 0 ||
      !Number.isSafeInteger(lifetimeSeconds) ||
      lifetimeSeconds < 1 ||
      lifetimeSeconds > ADMIN_ACCESS_TOKEN_MAX_SECONDS ||
      !Number.isSafeInteger(claims.authorizationVersion) ||
      claims.authorizationVersion < 1
    ) {
      throw new AdminAuthCryptoError();
    }
    const keyId = await this.keyProvider.activeSigningKeyId();
    const protectedHeader = { alg: 'RS256', kid: keyId, typ: ADMIN_JWT_TYPE };
    const payload: JWTPayload & Record<string, unknown> = {
      aud: ADMIN_JWT_AUDIENCE,
      authorizationVersion: claims.authorizationVersion,
      exp: nowSeconds + lifetimeSeconds,
      iat: nowSeconds,
      iss: ADMIN_JWT_ISSUER,
      jti: randomBytes(16).toString('base64url'),
      role: claims.role,
      sid: claims.sessionId,
      sub: claims.adminUserId,
    };
    const encodedHeader = base64Url(Buffer.from(JSON.stringify(protectedHeader), 'utf8'));
    const encodedPayload = base64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
    const signingInput = Buffer.from(`${encodedHeader}.${encodedPayload}`, 'ascii');
    const signed = await this.keyProvider.signRs256(signingInput);
    if (signed.keyId !== keyId) {
      throw new AdminAuthCryptoError();
    }
    return `${signingInput.toString('ascii')}.${base64Url(signed.signature)}`;
  }

  async verifyAccessToken(token: string, nowSeconds: number): Promise<VerifiedAdminAccessToken> {
    if (token.length < 32 || token.length > 4096 || !Number.isSafeInteger(nowSeconds)) {
      throw new AdminAuthCryptoError();
    }
    try {
      const result = await jwtVerify(
        token,
        async (header) => {
          const keys = Object.keys(header).sort();
          if (
            JSON.stringify(keys) !== JSON.stringify(['alg', 'kid', 'typ']) ||
            header.alg !== 'RS256' ||
            header.typ !== ADMIN_JWT_TYPE ||
            typeof header.kid !== 'string'
          ) {
            throw new AdminAuthCryptoError();
          }
          const key = await this.keyProvider.resolveJwtVerificationKey(header.kid);
          if (key === undefined) {
            throw new AdminAuthCryptoError();
          }
          return key;
        },
        {
          algorithms: ['RS256'],
          audience: ADMIN_JWT_AUDIENCE,
          currentDate: new Date(nowSeconds * 1000),
          issuer: ADMIN_JWT_ISSUER,
          typ: ADMIN_JWT_TYPE,
        },
      );
      const payload = result.payload;
      if (
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        typeof payload.role !== 'string' ||
        typeof payload.authorizationVersion !== 'number' ||
        !Number.isSafeInteger(payload.authorizationVersion) ||
        payload.authorizationVersion < 1 ||
        typeof payload.iat !== 'number' ||
        !Number.isSafeInteger(payload.iat) ||
        typeof payload.exp !== 'number' ||
        !Number.isSafeInteger(payload.exp) ||
        payload.exp <= payload.iat ||
        payload.exp - payload.iat > ADMIN_ACCESS_TOKEN_MAX_SECONDS ||
        typeof payload.jti !== 'string'
      ) {
        throw new AdminAuthCryptoError();
      }
      return {
        adminUserId: payload.sub,
        authorizationVersion: payload.authorizationVersion,
        expiresAtSeconds: payload.exp,
        issuedAtSeconds: payload.iat,
        role: payload.role,
        sessionId: payload.sid,
        tokenId: payload.jti,
      };
    } catch {
      throw new AdminAuthCryptoError();
    }
  }

  private async argonHash(input: Uint8Array): Promise<string> {
    try {
      return await argonHash(Buffer.from(input), {
        hashLength: ARGON_HASH_BYTES,
        memoryCost: ARGON_MEMORY_KIB,
        parallelism: ARGON_PARALLELISM,
        salt: randomBytes(ARGON_SALT_BYTES),
        timeCost: ARGON_ITERATIONS,
        type: argon2id,
        version: 0x13,
      });
    } catch {
      throw new AdminAuthCryptoError();
    }
  }

  private async argonVerify(phc: string, input: Uint8Array): Promise<boolean> {
    if (!validBoundedPhc(phc)) {
      return false;
    }
    try {
      return await argonVerify(phc, Buffer.from(input));
    } catch {
      return false;
    }
  }

  private base32(value: Uint8Array): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let accumulator = 0;
    let bits = 0;
    let output = '';
    for (const byte of value) {
      accumulator = (accumulator << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        output += alphabet[(accumulator >>> bits) & 31];
      }
      accumulator &= (1 << bits) - 1;
    }
    if (bits > 0) {
      output += alphabet[(accumulator << (5 - bits)) & 31];
    }
    return output;
  }
}
