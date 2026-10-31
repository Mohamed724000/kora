import { describe, expect, it } from 'vitest';

import { parseTotpEnrollmentUri } from './totp-qr-decoder';

const VALID =
  'otpauth://totp/KORA%2B%3Aadmin%40example.test?algorithm=SHA256&digits=6&issuer=KORA%2B&period=30&secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRST';

describe('parseTotpEnrollmentUri', () => {
  it('accepte uniquement le profil TOTP contractuel', () => {
    expect(parseTotpEnrollmentUri(VALID)).toEqual({
      accountLabel: 'KORA+:admin@example.test',
      issuer: 'KORA+',
      secret: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRST',
    });
  });

  it.each([
    VALID.replace('SHA256', 'SHA1'),
    VALID.replace('digits=6', 'digits=8'),
    VALID.replace('period=30', 'period=60'),
    VALID.replace('issuer=KORA%2B', 'issuer=AUTRE'),
    VALID.replace('KORA%2B%3Aadmin', 'AUTRE%3Aadmin'),
    VALID.replace(
      'secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRST',
      'secret=ABCDEFGHIJKLMNOP',
    ),
    VALID.replace('KORA%2B%3Aadmin', 'KORA%2B%3A%ZZ'),
    `${VALID}&image=https%3A%2F%2Fexample.test`,
    VALID.replace('otpauth://totp/', 'https://totp/'),
  ])('refuse les variantes hors contrat', (value) => {
    expect(() => parseTotpEnrollmentUri(value)).toThrow('QR TOTP invalide.');
  });
});
