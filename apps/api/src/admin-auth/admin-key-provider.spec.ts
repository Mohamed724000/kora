import { constants, verify } from 'node:crypto';
import {
  AdminKeyProviderUnavailableError,
  TestEphemeralAdminKeyProvider,
  UnavailableAdminKeyProvider,
} from './admin-key-provider';

describe('admin key provider', () => {
  it('enveloppe une vraie DEK, conserve les anciennes clés et détecte les altérations', async () => {
    const provider = new TestEphemeralAdminKeyProvider();
    const dek = Buffer.alloc(32, 0x5a);
    const wrapped = await provider.wrapDek(dek);

    await expect(provider.unwrapDek(wrapped)).resolves.toEqual(dek);
    provider.rotateEnvelopeKey();
    await expect(provider.unwrapDek(wrapped)).resolves.toEqual(dek);

    const altered = Buffer.from(wrapped.wrappedDek);
    altered[0] = (altered[0] ?? 0) ^ 1;
    await expect(provider.unwrapDek({ ...wrapped, wrappedDek: altered })).rejects.toBeInstanceOf(
      AdminKeyProviderUnavailableError,
    );
  });

  it('signe réellement en RSASSA-PKCS1-v1_5/SHA-256 et garde le trust overlap', async () => {
    const provider = new TestEphemeralAdminKeyProvider();
    const input = Buffer.from('protected.payload', 'ascii');
    const signed = await provider.signRs256(input);
    const publicKey = await provider.resolveJwtVerificationKey(signed.keyId);

    expect(publicKey).toBeDefined();
    expect(
      verify(
        'RSA-SHA256',
        input,
        { key: publicKey!, padding: constants.RSA_PKCS1_PADDING },
        signed.signature,
      ),
    ).toBe(true);

    provider.rotateSigningKey();
    expect(await provider.resolveJwtVerificationKey(signed.keyId)).toBe(publicKey);
    expect((await provider.signRs256(input)).keyId).not.toBe(signed.keyId);
  });

  it('sépare les domaines HMAC et injecte des pannes sans exposer de secret', async () => {
    const provider = new TestEphemeralAdminKeyProvider();
    const value = Buffer.from('private-value');
    const first = await provider.keyedDigest('CSRF_V1', value);
    const second = await provider.keyedDigest('RATE_LIMIT_V1', value);

    expect(first).not.toEqual(second);
    provider.fail('KEYED_DIGEST');
    await expect(provider.keyedDigest('CSRF_V1', value)).rejects.toThrow(
      'Admin key provider unavailable.',
    );
    provider.recover('KEYED_DIGEST');
    await expect(provider.keyedDigest('CSRF_V1', value)).resolves.toEqual(first);
  });

  it('ferme toutes les opérations quand aucun fournisseur n’est qualifié', async () => {
    const provider = new UnavailableAdminKeyProvider();
    await expect(provider.assertAvailable()).rejects.toBeInstanceOf(
      AdminKeyProviderUnavailableError,
    );
    await expect(provider.signRs256(Buffer.from('input'))).rejects.toBeInstanceOf(
      AdminKeyProviderUnavailableError,
    );
    await expect(provider.keyedDigest('CSRF_V1', Buffer.from('input'))).rejects.toBeInstanceOf(
      AdminKeyProviderUnavailableError,
    );
  });
});
