import { TestEphemeralAdminKeyProvider } from './admin-key-provider';
import {
  ADMIN_JWT_AUDIENCE,
  ADMIN_JWT_ISSUER,
  AdminAuthCrypto,
  AdminAuthCryptoError,
} from './admin-auth.crypto';

describe('AdminAuthCrypto', () => {
  let provider: TestEphemeralAdminKeyProvider;
  let crypto: AdminAuthCrypto;

  beforeEach(() => {
    provider = new TestEphemeralAdminKeyProvider();
    crypto = new AdminAuthCrypto(provider);
  });

  it('reproduit les vecteurs RFC 6238 SHA-256 indépendants', () => {
    const secret = Buffer.from('12345678901234567890123456789012', 'ascii');
    const vectors: ReadonlyArray<readonly [number, string]> = [
      [59, '46119246'],
      [1_111_111_109, '68084774'],
      [1_111_111_111, '67062674'],
      [1_234_567_890, '91819424'],
      [2_000_000_000, '90698825'],
      [20_000_000_000, '77737706'],
    ];
    for (const [seconds, expected] of vectors) {
      expect(crypto.generateTotpCode(secret, BigInt(Math.floor(seconds / 30)), 8)).toBe(expected);
    }
  });

  it('accepte ±1 pas une fois et refuse le rejeu global', () => {
    const secret = crypto.randomTotpSecret();
    const now = 1_800_000_000;
    const current = BigInt(now / 30);
    const previousCode = crypto.generateTotpCode(secret, current - 1n);

    expect(crypto.verifyTotp(secret, previousCode, now, null)).toBe(current - 1n);
    expect(crypto.verifyTotp(secret, previousCode, now, current - 1n)).toBeUndefined();
    expect(crypto.verifyTotp(secret, '12345x', now, null)).toBeUndefined();
  });

  it('chiffre le seed sous AES-256-GCM avec AAD, détecte les altérations et la rotation', async () => {
    const adminUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const secret = crypto.randomTotpSecret();
    const envelope = await crypto.encryptTotpSecret(secret, adminUserId);

    await expect(crypto.decryptTotpSecret(envelope, adminUserId)).resolves.toMatchObject({
      needsRewrap: false,
      secret,
    });
    await expect(
      crypto.decryptTotpSecret(envelope, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    ).rejects.toBeInstanceOf(AdminAuthCryptoError);

    const parsed = JSON.parse(envelope) as Record<string, unknown>;
    const originalTag = String(parsed.tag);
    parsed.tag = `${originalTag.slice(0, -1)}${originalTag.endsWith('A') ? 'B' : 'A'}`;
    await expect(
      crypto.decryptTotpSecret(JSON.stringify(parsed), adminUserId),
    ).rejects.toBeInstanceOf(AdminAuthCryptoError);

    const wrongVersion = JSON.parse(envelope) as Record<string, unknown>;
    wrongVersion.version = 2;
    await expect(
      crypto.decryptTotpSecret(JSON.stringify(wrongVersion), adminUserId),
    ).rejects.toBeInstanceOf(AdminAuthCryptoError);
    const wrongKey = JSON.parse(envelope) as Record<string, unknown>;
    wrongKey.keyId = 'unknown-envelope-key';
    await expect(
      crypto.decryptTotpSecret(JSON.stringify(wrongKey), adminUserId),
    ).rejects.toBeInstanceOf(AdminAuthCryptoError);

    provider.rotateEnvelopeKey();
    await expect(crypto.decryptTotpSecret(envelope, adminUserId)).resolves.toMatchObject({
      needsRewrap: true,
      secret,
    });
  });

  it('génère un QR PNG borné sans exposer le seed dans une structure JSON', async () => {
    const secret = crypto.randomTotpSecret();
    const uri = crypto.buildTotpProvisioningUri(secret, 'admin@example.invalid');
    const png = await crypto.createTotpQrPng(secret, 'admin@example.invalid');

    expect(uri).toMatch(/^otpauth:\/\/totp\//u);
    expect(uri).toContain('algorithm=SHA256');
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });

  it('génère dix codes non ambigus et borne strictement les PHC Argon2id', async () => {
    const codes = crypto.generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes.map((code) => `${code.selector}:${code.verifier}`)).size).toBe(10);
    for (const code of codes) {
      expect(code.selector).toMatch(/^[A-HJ-NP-Z2-9]{12}$/u);
      expect(code.verifier).toMatch(/^[A-HJ-NP-Z2-9]{28}$/u);
    }

    const selected = codes[0]!;
    const phc = await crypto.hashRecoveryCode(selected);
    await expect(crypto.verifyRecoveryCode(phc, selected)).resolves.toBe(true);
    await expect(
      crypto.verifyRecoveryCode(phc, { ...selected, verifier: codes[1]!.verifier }),
    ).resolves.toBe(false);
    await expect(
      crypto.verifyRecoveryCode(phc.replace('m=65536', 'm=1048576'), selected),
    ).resolves.toBe(false);
  });

  it('émet et vérifie une vraie signature JWT RS256 avec claims exacts', async () => {
    const now = 1_800_000_000;
    const token = await crypto.issueAccessToken(
      {
        adminUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        authorizationVersion: 7,
        role: 'SUPER_ADMIN',
        sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
      now,
    );
    const verified = await crypto.verifyAccessToken(token, now + 1);

    expect(verified).toMatchObject({
      adminUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      authorizationVersion: 7,
      expiresAtSeconds: now + 900,
      issuedAtSeconds: now,
      role: 'SUPER_ADMIN',
      sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    });
    const [header, payload] = token.split('.');
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString('utf8'))).toMatchObject({
      alg: 'RS256',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8'))).toMatchObject({
      aud: ADMIN_JWT_AUDIENCE,
      iss: ADMIN_JWT_ISSUER,
    });
  });

  it('rejette signature altérée, algorithme et expiration', async () => {
    const now = 1_800_000_000;
    const token = await crypto.issueAccessToken(
      {
        adminUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        authorizationVersion: 1,
        role: 'SUPPORT',
        sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
      now,
      10,
    );
    const parts = token.split('.');
    const alteredSignatureBytes = Buffer.from(parts[2]!, 'base64url');
    alteredSignatureBytes[0] = (alteredSignatureBytes[0] ?? 0) ^ 1;
    const alteredSignature = alteredSignatureBytes.toString('base64url');
    await expect(
      crypto.verifyAccessToken(`${parts[0]}.${parts[1]}.${alteredSignature}`, now + 1),
    ).rejects.toBeInstanceOf(AdminAuthCryptoError);

    const badHeader = Buffer.from(
      JSON.stringify({ alg: 'PS256', kid: provider.currentSigningKeyId(), typ: 'JWT' }),
    ).toString('base64url');
    const badInput = Buffer.from(`${badHeader}.${parts[1]}`, 'ascii');
    const badSigned = await provider.signRs256(badInput);
    await expect(
      crypto.verifyAccessToken(
        `${badInput.toString('ascii')}.${Buffer.from(badSigned.signature).toString('base64url')}`,
        now + 1,
      ),
    ).rejects.toBeInstanceOf(AdminAuthCryptoError);
    await expect(crypto.verifyAccessToken(token, now + 11)).rejects.toBeInstanceOf(
      AdminAuthCryptoError,
    );
  });

  it('rejette issuer et audience non exacts avec une signature pourtant valide', async () => {
    const now = 1_800_000_000;
    const valid = await crypto.issueAccessToken(
      {
        adminUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        authorizationVersion: 1,
        role: 'SUPPORT',
        sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
      now,
    );
    const [encodedHeader, encodedPayload] = valid.split('.');
    const payload = JSON.parse(
      Buffer.from(encodedPayload!, 'base64url').toString('utf8'),
    ) as Record<string, unknown>;

    for (const mutation of [
      { ...payload, iss: 'wrong-issuer' },
      { ...payload, aud: 'wrong-audience' },
    ]) {
      const changedPayload = Buffer.from(JSON.stringify(mutation), 'utf8').toString('base64url');
      const signingInput = Buffer.from(`${encodedHeader}.${changedPayload}`, 'ascii');
      const signed = await provider.signRs256(signingInput);
      const token = `${signingInput.toString('ascii')}.${Buffer.from(signed.signature).toString('base64url')}`;
      await expect(crypto.verifyAccessToken(token, now + 1)).rejects.toBeInstanceOf(
        AdminAuthCryptoError,
      );
    }
  });
});
