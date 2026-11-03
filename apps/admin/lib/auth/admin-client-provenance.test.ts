import { createHash } from 'node:crypto';
import type { PeerCertificate } from 'node:tls';
import { describe, expect, it } from 'vitest';
import {
  ADMIN_API_SERVER_NAME,
  ADMIN_CLIENT_PROVENANCE_HEADER,
  AdminClientProvenanceError,
  canonicalizeNginxClientIp,
  exactAdminApiServerIdentity,
  resolveNginxClientProvenance,
} from './admin-client-provenance';

const RAW = Buffer.from('c3-api-server-certificate-fixture', 'utf8');
const SHA256 = createHash('sha256').update(RAW).digest('hex');

function certificate(overrides: Partial<PeerCertificate> = {}): PeerCertificate {
  return {
    ca: false,
    exponent: '0x10001',
    ext_key_usage: ['1.3.6.1.5.5.7.3.1'],
    fingerprint: '',
    fingerprint256: '',
    fingerprint512: '',
    issuer: {},
    modulus: '',
    raw: RAW,
    serialNumber: '01',
    subject: {},
    subjectaltname: `DNS:${ADMIN_API_SERVER_NAME}`,
    valid_from: 'Oct 26 00:00:00 2026 GMT',
    valid_to: 'Oct 26 00:00:00 2027 GMT',
    ...overrides,
  } as unknown as PeerCertificate;
}

describe('admin BFF client provenance', () => {
  it.each([
    ['192.0.2.20', '192.0.2.20'],
    ['2001:0DB8:0:0:0:0:0:20', '2001:db8::20'],
    ['::ffff:192.0.2.20', '192.0.2.20'],
  ])('canonicalise %s vers %s', (candidate, expected) => {
    expect(canonicalizeNginxClientIp(candidate)).toBe(expected);
  });

  it.each(['192.0.002.20', '192.0.2.20, 198.51.100.1', '[2001:db8::1]', 'host.test'])(
    'refuse une valeur ambiguë : %s',
    (candidate) => {
      expect(() => canonicalizeNginxClientIp(candidate)).toThrow(AdminClientProvenanceError);
    },
  );

  it('utilise uniquement le header interne et ignore les métadonnées Next sans leur faire confiance', () => {
    const headers = new Headers([
      [ADMIN_CLIENT_PROVENANCE_HEADER, '2001:db8::20'],
      ['Forwarded', 'for=192.0.2.99'],
      ['X-Forwarded-For', '192.0.2.99'],
      ['X-Forwarded-Host', 'admin.c3.invalid'],
      ['X-Forwarded-Proto', 'https'],
      ['X-Real-IP', '192.0.2.99'],
    ]);
    expect(resolveNginxClientProvenance(headers)).toBe('2001:db8::20');
  });

  it('exige SAN DNS, EKU et empreinte leaf exacts après la validation TLS standard', () => {
    expect(
      exactAdminApiServerIdentity(ADMIN_API_SERVER_NAME, certificate(), SHA256),
    ).toBeUndefined();
    expect(
      exactAdminApiServerIdentity(
        ADMIN_API_SERVER_NAME,
        certificate({ subjectaltname: 'DNS:*.c3.internal' }),
        SHA256,
      ),
    ).toBeInstanceOf(Error);
    expect(
      exactAdminApiServerIdentity(ADMIN_API_SERVER_NAME, certificate(), '00'.repeat(32)),
    ).toBeInstanceOf(AdminClientProvenanceError);
  });
});
