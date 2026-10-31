import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminAuthClient, validAdminPasswordLength } from './admin-auth-client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AdminAuthClient', () => {
  it('applique les bornes de mot de passe en points de code', () => {
    expect(validAdminPasswordLength('😀'.repeat(11))).toBe(false);
    expect(validAdminPasswordLength('😀'.repeat(12))).toBe(true);
    expect(validAdminPasswordLength('😀'.repeat(128))).toBe(true);
    expect(validAdminPasswordLength('😀'.repeat(129))).toBe(false);
  });

  it('transporte un login exact sans stockage navigateur durable', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(init?.credentials).toBe('same-origin');
      expect(JSON.parse(String(init?.body))).toEqual({
        email: 'admin@example.test',
        password: ' mot-de-passe exact ',
      });
      return new Response(
        JSON.stringify({
          data: {
            challengeId: '00000000-0000-4000-8000-000000000001',
            expiresAt: '2026-10-26T23:30:00.000Z',
            nextStep: 'TOTP_VERIFY',
          },
          meta: { requestId: 'req_test' },
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetch);
    const localStorageSpy = vi.spyOn(Storage.prototype, 'setItem');

    const result = await new AdminAuthClient().login('admin@example.test', ' mot-de-passe exact ');

    expect(result.nextStep).toBe('TOTP_VERIFY');
    expect(localStorageSpy).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('ajoute le CSRF lu du cookie pour un refresh sans corps ni retry', async () => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      value:
        '__Host-kora_admin_csrf=v1.abcdefghijklmnopqrstuv.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const requestHeaders = new Headers(init?.headers);
      expect(requestHeaders.get('x-kora-csrf')).toMatch(/^v1\./u);
      expect(init?.body).toBeUndefined();
      return new Response(
        JSON.stringify({
          data: {
            absoluteExpiresAt: '2026-10-27T11:00:00.000Z',
            accessExpiresAt: '2026-10-26T23:10:00.000Z',
            accessToken: 'memory-only-token-memory-only-token',
            authorizationVersion: 1,
            idleExpiresAt: '2026-10-26T23:30:00.000Z',
            role: 'SUPER_ADMIN',
            sessionId: '00000000-0000-4000-8000-000000000002',
          },
          meta: { requestId: 'req_test' },
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetch);

    await expect(new AdminAuthClient().refresh()).resolves.toMatchObject({
      role: 'SUPER_ADMIN',
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('refuse une enveloppe ou un code d’erreur hors contrat de l’opération', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              challengeId: '00000000-0000-4000-8000-000000000001',
              expiresAt: '2026-10-26T23:30:00.000Z',
              nextStep: 'TOTP_VERIFY',
              unexpected: true,
            },
            meta: { requestId: 'req_test' },
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'ADMIN_INVITATION_INVALID' } }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400,
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const client = new AdminAuthClient();

    await expect(client.login('admin@example.test', 'a'.repeat(12))).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
    await expect(client.login('admin@example.test', 'a'.repeat(12))).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('préserve le refus FORBIDDEN de la frontière BFF pour une opération publique', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'FORBIDDEN',
                details: {},
                message: 'Accès refusé.',
                retryable: false,
              },
              requestId: 'bff_request_0001',
            }),
            { headers: { 'Content-Type': 'application/json' }, status: 403 },
          ),
      ),
    );

    await expect(
      new AdminAuthClient().login('admin@example.test', 'a'.repeat(12)),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('préserve UNKNOWN pour toute mutation 5xx dont la réponse est malformée', async () => {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      value:
        '__Host-kora_admin_csrf=v1.abcdefghijklmnopqrstuv.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    const fetch = vi.fn(async () => new Response('<invalid>', { status: 503 }));
    vi.stubGlobal('fetch', fetch);
    const client = new AdminAuthClient();

    await expect(client.login('admin@example.test', 'a'.repeat(12))).rejects.toMatchObject({
      code: 'UNKNOWN',
      outcome: 'UNKNOWN',
    });
    await expect(client.refresh()).rejects.toMatchObject({
      code: 'UNKNOWN',
      outcome: 'UNKNOWN',
    });
    await expect(
      client.rotateRecoveryCodes('a'.repeat(32), '123456', 'idempotency-key-0001'),
    ).rejects.toMatchObject({ code: 'UNKNOWN', outcome: 'UNKNOWN' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('extrait exactement dix codes single-display et la liste bornée des sessions', async () => {
    const suffixes = ['H', 'J', 'K', 'M', 'N', 'P', 'Q', 'R', 'S', 'T'] as const;
    const codes = suffixes.map((suffix) => ({
      selector: `ABCDEFG${suffix}`,
      verifier: `ABCDEFGHJKLMNPQRSTUVWXYZ23${suffix}`,
    }));
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { codes }, meta: { requestId: 'req_test' } }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                absoluteExpiresAt: '2026-10-27T11:00:00.000Z',
                createdAt: '2026-10-26T20:00:00.000Z',
                current: true,
                idleExpiresAt: '2026-10-26T23:30:00.000Z',
                lastSeenAt: '2026-10-26T22:00:00.000Z',
                sessionId: '00000000-0000-4000-8000-000000000002',
              },
            ],
            meta: { hasMore: false, nextCursor: null },
          }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetch);
    const client = new AdminAuthClient();

    await expect(
      client.rotateRecoveryCodes('a'.repeat(32), '123456', 'idempotency-key-0001'),
    ).resolves.toEqual(codes);
    await expect(client.listSessions('a'.repeat(32))).resolves.toHaveLength(1);
  });
});
