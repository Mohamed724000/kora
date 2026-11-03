import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TLSSocket } from 'node:tls';
import { AdminRequestPolicyError } from './admin-request-policy';
import {
  ADMIN_BFF_CLIENT_IDENTITY,
  ADMIN_CLIENT_PROVENANCE_HEADER,
  canonicalizeAdminClientIp,
  createAdminClientProvenanceMiddleware,
  getResolvedAdminClientAddress,
  resolveAdminClientProvenance,
} from './admin-client-provenance';

const CERTIFICATE = Buffer.from('c3-bff-client-certificate-fixture', 'utf8');
const FINGERPRINT = createHash('sha256').update(CERTIFICATE).digest('hex');

function request(
  options: {
    authorized?: boolean;
    headers?: readonly [string, string][];
    remoteAddress?: string;
    san?: string;
  } = {},
): IncomingMessage {
  const rawHeaders = (options.headers ?? []).flatMap(([name, value]) => [name, value]);
  const headers = Object.fromEntries(
    (options.headers ?? []).map(([name, value]) => [name.toLowerCase(), value]),
  );
  const socket = {
    authorized: options.authorized ?? true,
    encrypted: true,
    getPeerCertificate: () => ({
      ext_key_usage: ['1.3.6.1.5.5.7.3.2'],
      raw: CERTIFICATE,
      subjectaltname: options.san ?? `URI:${ADMIN_BFF_CLIENT_IDENTITY}`,
    }),
    remoteAddress: options.remoteAddress ?? '172.30.0.4',
  } as unknown as TLSSocket;
  return { headers, rawHeaders, socket } as unknown as IncomingMessage;
}

const MTLS_CONFIG = {
  clientCaPath: '/run/secrets/c3-client-ca.pem',
  clientCertificateSha256: FINGERPRINT,
  mode: 'MTLS_BFF' as const,
  serverCertificatePath: '/run/secrets/c3-api-cert.pem',
  serverPrivateKeyPath: '/run/secrets/c3-api-key.pem',
};

describe('admin client provenance', () => {
  it.each([
    ['192.0.2.7', '192.0.2.7'],
    ['2001:0DB8:0:0:0:0:0:1', '2001:db8::1'],
    ['::ffff:192.0.2.7', '192.0.2.7'],
    ['0:0:0:0:0:ffff:c000:207', '192.0.2.7'],
  ])('canonicalise %s en %s de façon idempotente', (candidate, expected) => {
    const canonical = canonicalizeAdminClientIp(candidate);
    expect(canonical).toBe(expected);
    expect(canonicalizeAdminClientIp(canonical)).toBe(expected);
  });

  it.each([
    '192.168.001.1',
    '2001:db8::1%eth0',
    '[2001:db8::1]',
    '[2001:db8::1]:443',
    '2001:db8::1, 192.0.2.1',
    ' 192.0.2.1',
    'api.c3.internal',
    'unavailable',
  ])('refuse une provenance ambiguë ou non littérale : %s', (candidate) => {
    expect(() => canonicalizeAdminClientIp(candidate)).toThrow(AdminRequestPolicyError);
  });

  it('préserve le mode DIRECT historique mais refuse le header interne', () => {
    const direct = request({ remoteAddress: '::ffff:127.0.0.1' });
    expect(resolveAdminClientProvenance(direct, { mode: 'DIRECT' })).toBe('::ffff:127.0.0.1');
    expect(getResolvedAdminClientAddress(direct)).toBe('::ffff:127.0.0.1');

    const forged = request({ headers: [[ADMIN_CLIENT_PROVENANCE_HEADER, '192.0.2.8']] });
    expect(() => resolveAdminClientProvenance(forged, { mode: 'DIRECT' })).toThrow(
      AdminRequestPolicyError,
    );
  });

  it('attache la provenance canonique seulement après identité TLS exacte', () => {
    const candidate = request({
      headers: [[ADMIN_CLIENT_PROVENANCE_HEADER, '2001:0DB8:0:0:0:0:0:7']],
    });
    expect(resolveAdminClientProvenance(candidate, MTLS_CONFIG)).toBe('2001:db8::7');
    expect(getResolvedAdminClientAddress(candidate)).toBe('2001:db8::7');
  });

  it.each([
    [
      'pair non autorisé',
      request({ authorized: false, headers: [[ADMIN_CLIENT_PROVENANCE_HEADER, '192.0.2.7']] }),
    ],
    [
      'SAN différent',
      request({
        san: 'URI:spiffe://kora.local/c3/other',
        headers: [[ADMIN_CLIENT_PROVENANCE_HEADER, '192.0.2.7']],
      }),
    ],
    ['header absent', request()],
    [
      'header dupliqué',
      request({
        headers: [
          [ADMIN_CLIENT_PROVENANCE_HEADER, '192.0.2.7'],
          [ADMIN_CLIENT_PROVENANCE_HEADER, '192.0.2.8'],
        ],
      }),
    ],
    [
      'header public',
      request({
        headers: [
          [ADMIN_CLIENT_PROVENANCE_HEADER, '192.0.2.7'],
          ['X-Forwarded-Attacker', '192.0.2.9'],
        ],
      }),
    ],
  ])('refuse %s', (_label, candidate) => {
    expect(() => resolveAdminClientProvenance(candidate, MTLS_CONFIG)).toThrow(
      AdminRequestPolicyError,
    );
  });

  it('refuse une empreinte leaf différente même avec le bon SAN', () => {
    const candidate = request({ headers: [[ADMIN_CLIENT_PROVENANCE_HEADER, '192.0.2.7']] });
    expect(() =>
      resolveAdminClientProvenance(candidate, {
        ...MTLS_CONFIG,
        clientCertificateSha256: '00'.repeat(32),
      }),
    ).toThrow(AdminRequestPolicyError);
  });

  it('répond minimalement no-store avant tout middleware suivant', () => {
    const candidate = request();
    const headers = new Map<string, string>();
    const response = {
      end: vi.fn(),
      setHeader(name: string, value: string) {
        headers.set(name, value);
      },
      statusCode: 0,
    } as unknown as ServerResponse;
    const next = vi.fn();

    createAdminClientProvenanceMiddleware(MTLS_CONFIG)(candidate, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(403);
    expect(headers).toEqual(
      new Map([
        ['Cache-Control', 'no-store'],
        ['Content-Length', '0'],
        ['X-Content-Type-Options', 'nosniff'],
      ]),
    );
    expect(response.end).toHaveBeenCalledExactlyOnceWith();
  });
});
