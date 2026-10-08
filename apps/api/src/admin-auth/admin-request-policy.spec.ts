import { TestEphemeralAdminKeyProvider } from './admin-key-provider';
import {
  ADMIN_CSRF_COOKIE,
  ADMIN_PREAUTH_COOKIE,
  ADMIN_REFRESH_COOKIE,
  AdminRequestPolicy,
  AdminRequestPolicyError,
  clearAdminCookie,
  parseAdminCookies,
  serializeAdminCookie,
  type AdminRequestHeaders,
} from './admin-request-policy';

describe('AdminRequestPolicy', () => {
  const origin = 'https://admin.kora.invalid';
  let policy: AdminRequestPolicy;

  beforeEach(() => {
    policy = new AdminRequestPolicy({
      keyProvider: new TestEphemeralAdminKeyProvider(),
      origin,
    });
  });

  it('impose Origin, JSON et Fetch Metadata exacts au login', () => {
    const valid: AdminRequestHeaders = {
      'content-type': 'application/json',
      origin,
      'sec-fetch-site': 'same-origin',
    };
    expect(() => policy.assertLoginRequest(valid)).not.toThrow();

    for (const mutation of [
      { ...valid, origin: 'https://evil.invalid' },
      { ...valid, 'content-type': 'application/json; charset=utf-8' },
      { ...valid, 'sec-fetch-site': 'cross-site' },
      { ...valid, 'sec-fetch-site': undefined },
    ]) {
      expect(() => policy.assertLoginRequest(mutation)).toThrow(AdminRequestPolicyError);
    }
  });

  it('lie le double-submit CSRF au contexte opaque', async () => {
    const preauth = 'A'.repeat(43);
    const csrf = await policy.issueCsrfToken('PREAUTH', preauth);
    const headers = {
      cookie: `${ADMIN_PREAUTH_COOKIE}=${preauth}; ${ADMIN_CSRF_COOKIE}=${csrf}`,
      'x-kora-csrf': csrf,
    };

    await expect(policy.validateBrowserContext(headers, 'PREAUTH')).resolves.toEqual({
      contextToken: preauth,
      csrfToken: csrf,
    });
    await expect(policy.validateBrowserContext(headers, 'REFRESH')).rejects.toBeInstanceOf(
      AdminRequestPolicyError,
    );

    const otherContext = 'B'.repeat(43);
    await expect(
      policy.validateBrowserContext(
        {
          cookie: `${ADMIN_PREAUTH_COOKIE}=${otherContext}; ${ADMIN_CSRF_COOKIE}=${csrf}`,
          'x-kora-csrf': csrf,
        },
        'PREAUTH',
      ),
    ).rejects.toBeInstanceOf(AdminRequestPolicyError);
  });

  it('rejette cookies dupliqués, contrôles, quotes et surdimensionnement', () => {
    expect(() => parseAdminCookies('a=one; a=two')).toThrow(AdminRequestPolicyError);
    expect(() => parseAdminCookies('a="quoted"')).toThrow(AdminRequestPolicyError);
    expect(() => parseAdminCookies('a=one\u0000')).toThrow(AdminRequestPolicyError);
    expect(() => parseAdminCookies(`a=${'x'.repeat(4097)}`)).toThrow(AdminRequestPolicyError);
    expect(parseAdminCookies('unrelated=safe; target=value').get('target')).toBe('value');
  });

  it('sérialise plusieurs cookies __Host séparément et sans Domain', async () => {
    const contextToken = 'A'.repeat(43);
    const csrf = await policy.issueCsrfToken('REFRESH', contextToken);
    const cookies = [
      serializeAdminCookie(ADMIN_REFRESH_COOKIE, contextToken, 28_800),
      serializeAdminCookie(ADMIN_CSRF_COOKIE, csrf, 28_800),
    ];

    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain('; HttpOnly');
    expect(cookies[1]).not.toContain('; HttpOnly');
    for (const cookie of cookies) {
      expect(cookie).toContain('; Path=/; Secure; SameSite=Strict');
      expect(cookie).not.toContain('Domain=');
    }
    expect(clearAdminCookie(ADMIN_PREAUTH_COOKIE)).toContain('Max-Age=0');
  });

  it('traduit une panne de digest CSRF en indisponibilite fermee', async () => {
    const provider = new TestEphemeralAdminKeyProvider();
    vi.spyOn(provider, 'keyedDigest').mockRejectedValueOnce(new Error('controlled key failure'));
    const failingPolicy = new AdminRequestPolicy({ keyProvider: provider, origin });

    await expect(failingPolicy.issueCsrfToken('PREAUTH', 'A'.repeat(43))).rejects.toMatchObject({
      reason: 'SERVICE_UNAVAILABLE',
    });
  });

  it('refuse qu’une variable ou origine non HTTPS active un relâchement de test', () => {
    for (const invalid of [
      'http://admin.kora.invalid',
      'https://admin.kora.invalid/path',
      'https://user@admin.kora.invalid',
      'https://admin.kora.invalid/',
    ]) {
      expect(
        () =>
          new AdminRequestPolicy({
            keyProvider: new TestEphemeralAdminKeyProvider(),
            origin: invalid,
          }),
      ).toThrow(TypeError);
    }
  });
});
