import { describe, expect, it } from 'vitest';
import {
  AdminSecurityCrypto,
  AdminSecurityCryptoError,
  TestAdminSecurityOutboxKeyring,
} from './admin-security.crypto';

const aad = {
  generation: 1,
  logicalDeliveryId: '22222222-2222-4222-8222-222222222222',
  outboxId: '11111111-1111-4111-8111-111111111111',
  purpose: 'INVITATION' as const,
  sourceId: '33333333-3333-4333-8333-333333333333',
};

describe('AdminSecurityCrypto', () => {
  it('round-trips an authenticated outbox payload with explicit AAD', async () => {
    const crypto = new AdminSecurityCrypto(new TestAdminSecurityOutboxKeyring());
    const encrypted = await crypto.encryptOutboxPayload(aad, {
      code: 'ABCDEFGHJKLMNPQRSTUVWXYZ2345',
      email: 'admin@example.test',
    });

    const clear = await crypto.decryptOutboxPayload(aad, encrypted);
    expect(clear.toString('utf8')).toContain('KORA_ADMIN_NOTIFICATION_PAYLOAD_V1');
    expect(encrypted.encryptionKeyId).toBe('test-c2a-key-v1');
    expect(encrypted.aadHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('rejects ciphertext replayed under another generation or source', async () => {
    const crypto = new AdminSecurityCrypto(new TestAdminSecurityOutboxKeyring());
    const encrypted = await crypto.encryptOutboxPayload(aad, { code: 'SECRET' });

    await expect(
      crypto.decryptOutboxPayload({ ...aad, generation: 2 }, encrypted),
    ).rejects.toBeInstanceOf(AdminSecurityCryptoError);
    await expect(
      crypto.decryptOutboxPayload({ ...aad, sourceId: 'other-source' }, encrypted),
    ).rejects.toBeInstanceOf(AdminSecurityCryptoError);
  });

  it('keeps canonical digests order-sensitive and generates contract-safe codes', () => {
    const crypto = new AdminSecurityCrypto(new TestAdminSecurityOutboxKeyring());
    expect(
      crypto.canonicalDigest('TEST', [
        ['a', '1'],
        ['b', '2'],
      ]),
    ).not.toBe(
      crypto.canonicalDigest('TEST', [
        ['b', '2'],
        ['a', '1'],
      ]),
    );
    expect(crypto.randomCode()).toMatch(/^[A-HJ-NP-Z2-9]{28}$/u);
  });
});
