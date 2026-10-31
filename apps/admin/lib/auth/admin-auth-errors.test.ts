import { describe, expect, it } from 'vitest';

import { adminAuthErrorFromResponse } from './admin-auth-errors';

describe('mapping des erreurs Admin', () => {
  it('conserve un refus contractuel sans exposer le message amont', async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          code: 'AUTH_INVALID_CREDENTIALS',
          details: {},
          message: 'message interne',
          retryable: false,
        },
        requestId: 'req_test',
      }),
      { status: 401 },
    );

    const error = await adminAuthErrorFromResponse(response, false);
    expect(error.code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(error.message).toBe('Identifiants invalides.');
    expect(error.message).not.toContain('interne');
  });

  it('refuse une enveloppe contenant un détail non contractuel', async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          code: 'AUTH_INVALID_CREDENTIALS',
          details: { internal: 'secret' },
          message: 'message interne',
          retryable: false,
        },
        requestId: 'req_test',
      }),
      { status: 401 },
    );

    const error = await adminAuthErrorFromResponse(response, false);
    expect(error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('rend honnête une mutation incertaine et borne Retry-After', async () => {
    const uncertain = await adminAuthErrorFromResponse(new Response(null, { status: 503 }), true);
    expect(uncertain.outcome).toBe('UNKNOWN');

    const limited = await adminAuthErrorFromResponse(
      new Response(
        JSON.stringify({
          error: {
            code: 'RATE_LIMITED',
            details: { reason: 'RATE_LIMITED', retryAfterSeconds: 60 },
            message: 'Rate limited.',
            retryable: false,
          },
          requestId: 'req_test',
        }),
        {
          headers: { 'Retry-After': '60' },
          status: 429,
        },
      ),
      false,
    );
    expect(limited.retryAfterSeconds).toBe(60);
  });
});
