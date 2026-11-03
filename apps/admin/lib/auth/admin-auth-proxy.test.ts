import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  ADMIN_AUTH_PROXY_OPERATIONS,
  resolveAdminAuthProxyOperation,
} from './admin-auth-proxy-policy';
import {
  adminAuthCookieHeader,
  adminAuthResponseBody,
  adminAuthResponseHeaders,
  AdminAuthProxyError,
  loadAdminAuthProxyConfig,
  proxyAdminAuthRequest,
} from './admin-auth-proxy';

describe('admin auth BFF policy', () => {
  it('verrouille exactement les treize opérations C3', () => {
    expect(ADMIN_AUTH_PROXY_OPERATIONS.map(({ operationId }) => operationId).sort()).toEqual([
      'acceptAdminInvitation',
      'confirmAdminTotpEnrollment',
      'createAdminTotpEnrollment',
      'deliverAdminTotpEnrollmentQr',
      'listAdminSessions',
      'loginAdmin',
      'refreshAdminSession',
      'requestAdminPasswordReset',
      'resetAdminPassword',
      'revokeCurrentAdminSession',
      'rotateAdminRecoveryCodes',
      'verifyAdminRecoveryCode',
      'verifyAdminTotp',
    ]);
  });

  it.each([
    ['POST', '/api/v1/admin/auth/step-up', ''],
    ['POST', '/api/v1/admin/auth/sessions/11111111-1111-4111-8111-111111111111/revocations', ''],
    ['GET', '/api/v1/admin/auth/sessions', '?cursor=forbidden'],
    ['GET', '/api/v1/admin/auth//sessions', ''],
    ['GET', '/api/v1/admin/auth/%2e%2e/sessions', ''],
    ['GET', '/api/v1/admin/auth/sessions%2fcurrent', ''],
    ['HEAD', '/api/v1/admin/auth/sessions', ''],
    ['OPTIONS', '/api/v1/admin/auth/login', ''],
  ])('refuse %s %s%s avant l’amont', (method, path, search) => {
    expect(resolveAdminAuthProxyOperation(method, path, search)).toBeUndefined();
  });

  it('accepte un enrollment UUID canonique et refuse un identifiant substitué', () => {
    const canonical = '/api/v1/admin/auth/totp/enrollments/11111111-1111-4111-8111-111111111111/qr';
    expect(resolveAdminAuthProxyOperation('POST', canonical, '')?.operationId).toBe(
      'deliverAdminTotpEnrollmentQr',
    );
    expect(resolveAdminAuthProxyOperation('GET', canonical, '')).toBeUndefined();
    expect(
      resolveAdminAuthProxyOperation(
        'POST',
        '/api/v1/admin/auth/totp/enrollments/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA/qr',
        '',
      )?.operationId,
    ).toBe('deliverAdminTotpEnrollmentQr');
    expect(
      resolveAdminAuthProxyOperation(
        'GET',
        '/api/v1/admin/auth/totp/enrollments/not-a-uuid/qr',
        '',
      ),
    ).toBeUndefined();
  });

  it.each([
    ['createAdminTotpEnrollment', 'POST', '/api/v1/admin/auth/totp/enrollments'],
    [
      'deliverAdminTotpEnrollmentQr',
      'POST',
      '/api/v1/admin/auth/totp/enrollments/11111111-1111-4111-8111-111111111111/qr',
    ],
    ['refreshAdminSession', 'POST', '/api/v1/admin/auth/sessions/refresh'],
  ])('accepte %s sans imposer de corps', (operationId, method, path) => {
    expect(resolveAdminAuthProxyOperation(method, path, '')).toMatchObject({
      body: 'FORBIDDEN',
      operationId,
    });
  });
});

describe('admin auth BFF cookie boundary', () => {
  const preauth = 'A'.repeat(43);
  const refresh = 'B'.repeat(43);
  const csrf = `v1.${'C'.repeat(22)}.${'D'.repeat(43)}`;
  const create = ADMIN_AUTH_PROXY_OPERATIONS.find(
    ({ operationId }) => operationId === 'createAdminTotpEnrollment',
  )!;
  const deliverQr = ADMIN_AUTH_PROXY_OPERATIONS.find(
    ({ operationId }) => operationId === 'deliverAdminTotpEnrollmentQr',
  )!;
  const confirm = ADMIN_AUTH_PROXY_OPERATIONS.find(
    ({ operationId }) => operationId === 'confirmAdminTotpEnrollment',
  )!;
  const login = ADMIN_AUTH_PROXY_OPERATIONS.find(
    ({ operationId }) => operationId === 'loginAdmin',
  )!;
  const refreshOperation = ADMIN_AUTH_PROXY_OPERATIONS.find(
    ({ operationId }) => operationId === 'refreshAdminSession',
  )!;

  it('reconstruit uniquement les cookies préauth et CSRF requis', () => {
    const request = new Request('https://admin.c3.invalid/api/v1/admin/auth/totp/enrollments', {
      headers: {
        Cookie: `theme=light; __Host-kora_admin_preauth=${preauth}; __Host-kora_admin_csrf=${csrf}`,
        'X-Kora-CSRF': csrf,
      },
      method: 'POST',
    });
    expect(adminAuthCookieHeader(request, create)).toBe(
      `__Host-kora_admin_preauth=${preauth}; __Host-kora_admin_csrf=${csrf}`,
    );
  });

  it.each([
    [
      `__Host-kora_admin_preauth=${preauth}; __Host-kora_admin_preauth=${preauth}; __Host-kora_admin_csrf=${csrf}`,
      csrf,
    ],
    [
      `__Host-kora_admin_preauth=${preauth}; __Host-kora_admin_csrf=${csrf}; __Host-kora_admin_refresh=${refresh}`,
      csrf,
    ],
    [
      `__Host-kora_admin_preauth=${preauth}; __Host-kora_admin_csrf=${csrf}`,
      `v1.${'E'.repeat(22)}.${'F'.repeat(43)}`,
    ],
  ])('refuse doublon, contexte interdit ou double soumission divergente', (cookie, header) => {
    const request = new Request('https://admin.c3.invalid/api/v1/admin/auth/totp/enrollments', {
      headers: { Cookie: cookie, 'X-Kora-CSRF': header },
      method: 'POST',
    });
    expect(() => adminAuthCookieHeader(request, create)).toThrow(AdminAuthProxyError);
  });

  it('ne relaie aucun cookie pour une connexion publique et refuse un refresh présent', () => {
    const preauthRequest = new Request('https://admin.c3.invalid/api/v1/admin/auth/login', {
      headers: { Cookie: `__Host-kora_admin_preauth=${preauth}` },
      method: 'POST',
    });
    expect(adminAuthCookieHeader(preauthRequest, login)).toBeUndefined();
    const refreshRequest = new Request('https://admin.c3.invalid/api/v1/admin/auth/login', {
      headers: { Cookie: `__Host-kora_admin_refresh=${refresh}` },
      method: 'POST',
    });
    expect(() => adminAuthCookieHeader(refreshRequest, login)).toThrow(AdminAuthProxyError);
  });

  it('accepte seulement la paire Set-Cookie attendue avec les attributs stricts', () => {
    const headers = adminAuthResponseHeaders(login, 200, {
      'content-type': 'application/json; charset=utf-8',
      'set-cookie': [
        `__Host-kora_admin_preauth=${preauth}; Max-Age=600; Path=/; Secure; SameSite=Strict; HttpOnly`,
        `__Host-kora_admin_csrf=${csrf}; Max-Age=600; Path=/; Secure; SameSite=Strict`,
      ],
    });
    expect(headers.get('set-cookie')).toContain('__Host-kora_admin_preauth=');
    expect(headers.get('set-cookie')).toContain('__Host-kora_admin_csrf=');
  });

  it.each([
    [
      'Domain interdit',
      [
        `__Host-kora_admin_preauth=${preauth}; Max-Age=600; Path=/; Secure; SameSite=Strict; HttpOnly; Domain=invalid`,
        `__Host-kora_admin_csrf=${csrf}; Max-Age=600; Path=/; Secure; SameSite=Strict`,
      ],
    ],
    [
      'cookie inattendu',
      [
        `__Host-kora_admin_refresh=${refresh}; Max-Age=600; Path=/; Secure; SameSite=Strict; HttpOnly`,
      ],
    ],
  ])('refuse une réponse Set-Cookie non conforme: %s', (_label, cookies) => {
    expect(() =>
      adminAuthResponseHeaders(login, 200, {
        'content-type': 'application/json; charset=utf-8',
        'set-cookie': cookies,
      }),
    ).toThrow(AdminAuthProxyError);
  });

  it('refuse une durée refresh plausible appliquée au contexte préauth', () => {
    expect(() =>
      adminAuthResponseHeaders(login, 200, {
        'content-type': 'application/json; charset=utf-8',
        'set-cookie': [
          `__Host-kora_admin_preauth=${preauth}; Max-Age=43200; Path=/; Secure; SameSite=Strict; HttpOnly`,
          `__Host-kora_admin_csrf=${csrf}; Max-Age=600; Path=/; Secure; SameSite=Strict`,
        ],
      }),
    ).toThrow(AdminAuthProxyError);
  });

  it('refuse une durée préauth plausible appliquée au refresh', () => {
    expect(() =>
      adminAuthResponseHeaders(refreshOperation, 200, {
        'content-type': 'application/json; charset=utf-8',
        'set-cookie': [
          `__Host-kora_admin_refresh=${refresh}; Max-Age=600; Path=/; Secure; SameSite=Strict; HttpOnly`,
          `__Host-kora_admin_csrf=${csrf}; Max-Age=43200; Path=/; Secure; SameSite=Strict`,
        ],
      }),
    ).toThrow(AdminAuthProxyError);
  });

  it('expire les trois cookies après un refresh terminal invalide', () => {
    const headers = adminAuthResponseHeaders(refreshOperation, 401, {
      'content-type': 'application/json; charset=utf-8',
    });
    const value = headers.get('set-cookie') ?? '';
    expect(value).toContain('__Host-kora_admin_preauth=');
    expect(value).toContain('__Host-kora_admin_refresh=');
    expect(value).toContain('__Host-kora_admin_csrf=');
    expect(value.match(/Max-Age=0/gu)).toHaveLength(3);
  });

  it.each([
    [create, 201, 'application/json'],
    [deliverQr, 200, 'image/png'],
  ])('conserve le contexte préauth après le succès de %s', (operation, status, contentType) => {
    const headers = adminAuthResponseHeaders(operation, status, {
      'content-type': contentType,
    });
    expect(headers.get('set-cookie')).toBeNull();
  });

  it.each([create, deliverQr])(
    'expire préauth et CSRF après un refus terminal de %s',
    (operation) => {
      const headers = adminAuthResponseHeaders(operation, 401, {
        'content-type': 'application/json',
      });
      const value = headers.get('set-cookie') ?? '';
      expect(value).toContain('__Host-kora_admin_preauth=');
      expect(value).toContain('__Host-kora_admin_csrf=');
      expect(value.match(/Max-Age=0/gu)).toHaveLength(2);
    },
  );

  it.each([401, 410])('expire préauth et CSRF après confirm terminal %i', (status) => {
    const headers = adminAuthResponseHeaders(confirm, status, {
      'content-type': 'application/json',
    });
    const value = headers.get('set-cookie') ?? '';
    expect(value).toContain('__Host-kora_admin_preauth=');
    expect(value).toContain('__Host-kora_admin_csrf=');
    expect(value.match(/Max-Age=0/gu)).toHaveLength(2);
  });

  it('utilise un corps nul pour 204 et refuse des octets amont inattendus', () => {
    expect(adminAuthResponseBody(204, Buffer.alloc(0))).toBeNull();
    expect(() => adminAuthResponseBody(204, Buffer.from('unexpected'))).toThrow(
      AdminAuthProxyError,
    );
  });

  it('refuse un statut, un type média ou un Retry-After hors contrat', () => {
    expect(() =>
      adminAuthResponseHeaders(login, 302, { 'content-type': 'application/json' }),
    ).toThrow(AdminAuthProxyError);
    expect(() => adminAuthResponseHeaders(login, 200, { 'content-type': 'text/html' })).toThrow(
      AdminAuthProxyError,
    );
    expect(() =>
      adminAuthResponseHeaders(login, 429, {
        'content-type': 'application/json',
        'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT',
      }),
    ).toThrow(AdminAuthProxyError);
    expect(
      adminAuthResponseHeaders(login, 429, {
        'content-type': 'application/json',
        'retry-after': '17',
      }).get('retry-after'),
    ).toBe('17');
  });
});

describe('admin auth BFF configuration', () => {
  let directory: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'kora-c3-proxy-'));
    for (const name of ['ca.pem', 'client.pem', 'client-key.pem']) {
      writeFileSync(join(directory, name), `${name}-fixture`, { flag: 'wx', mode: 0o600 });
    }
  });

  afterEach(() => rmSync(directory, { force: true, recursive: true }));

  it('charge uniquement une origine API exacte et des fichiers absolus', () => {
    const config = loadAdminAuthProxyConfig({
      ADMIN_API_CA_PATH: join(directory, 'ca.pem'),
      ADMIN_API_ORIGIN: 'https://api.c3.internal:3001',
      ADMIN_API_SERVER_CERTIFICATE_SHA256: 'ab'.repeat(32),
      ADMIN_BFF_CLIENT_CERTIFICATE_PATH: join(directory, 'client.pem'),
      ADMIN_BFF_CLIENT_PRIVATE_KEY_PATH: join(directory, 'client-key.pem'),
      ADMIN_ORIGIN: 'https://admin.c3.invalid:8443',
    });
    expect(config.apiOrigin.origin).toBe('https://api.c3.internal:3001');
    expect(config.publicOrigin).toBe('https://admin.c3.invalid:8443');
  });

  it.each([
    ['http://api.c3.internal:3001', 'ab'],
    ['https://other.c3.internal:3001', 'ab'],
    ['https://api.c3.internal:3001/path', 'ab'],
    ['https://api.c3.internal:3001', 'not-a-fingerprint'],
  ])('refuse origine ou empreinte non conforme', (origin, fingerprint) => {
    expect(() =>
      loadAdminAuthProxyConfig({
        ADMIN_API_CA_PATH: join(directory, 'ca.pem'),
        ADMIN_API_ORIGIN: origin,
        ADMIN_API_SERVER_CERTIFICATE_SHA256: fingerprint,
        ADMIN_BFF_CLIENT_CERTIFICATE_PATH: join(directory, 'client.pem'),
        ADMIN_BFF_CLIENT_PRIVATE_KEY_PATH: join(directory, 'client-key.pem'),
        ADMIN_ORIGIN: 'https://admin.c3.invalid:8443',
      }),
    ).toThrow(AdminAuthProxyError);
  });

  it('refuse les opérations exclues sans lire la configuration TLS', async () => {
    const response = await proxyAdminAuthRequest(
      new Request('https://admin.c3.invalid/api/v1/admin/auth/step-up', {
        method: 'POST',
      }),
      {},
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBeNull();
    expect(await response.text()).toBe('');
  });

  it.each([
    [
      403,
      'FORBIDDEN',
      new Request('https://admin.c3.invalid/api/v1/admin/auth/login', {
        headers: {
          'content-type': 'application/json',
          origin: 'https://forged.invalid',
          'sec-fetch-site': 'same-origin',
          'x-kora-admin-client-ip': '192.0.2.10',
        },
        method: 'POST',
        body: '{}',
      }),
    ],
    [
      401,
      'AUTH_REQUIRED',
      new Request('https://admin.c3.invalid/api/v1/admin/auth/totp/enrollments', {
        headers: {
          origin: 'https://admin.c3.invalid:8443',
          'sec-fetch-site': 'same-origin',
          'x-kora-admin-client-ip': '192.0.2.10',
        },
        method: 'POST',
      }),
    ],
    [
      400,
      'VALIDATION_ERROR',
      new Request('https://admin.c3.invalid/api/v1/admin/auth/login', {
        headers: {
          'content-type': 'application/json',
          origin: 'https://admin.c3.invalid:8443',
          'sec-fetch-site': 'same-origin',
          'x-kora-admin-client-ip': '192.0.2.10',
        },
        method: 'POST',
      }),
    ],
  ])('retourne une enveloppe locale contractuelle pour %i', async (status, code, request) => {
    const response = await proxyAdminAuthRequest(request, {
      ADMIN_API_CA_PATH: join(directory, 'ca.pem'),
      ADMIN_API_ORIGIN: 'https://api.c3.internal:3001',
      ADMIN_API_SERVER_CERTIFICATE_SHA256: 'ab'.repeat(32),
      ADMIN_BFF_CLIENT_CERTIFICATE_PATH: join(directory, 'client.pem'),
      ADMIN_BFF_CLIENT_PRIVATE_KEY_PATH: join(directory, 'client-key.pem'),
      ADMIN_ORIGIN: 'https://admin.c3.invalid:8443',
    });
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8');
    const payload = (await response.json()) as { error: { code: string }; requestId: string };
    expect(payload.error.code).toBe(code);
    expect(payload.requestId).toMatch(/^bff_[0-9a-f-]{36}$/u);
  });
});
