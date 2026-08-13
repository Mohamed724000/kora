import type { ErrorEvent } from '@sentry/react';
import { describe, expect, it, vi } from 'vitest';
import {
  captureSentryException,
  createSentryOptions,
  initializeSentry,
  sanitizeSentryEvent,
  type SentryAdapter,
} from './sentry';

describe('observabilité Sentry', () => {
  it('ne démarre ni ne capture sans DSN', () => {
    const sdk = {
      captureException: vi.fn(),
      init: vi.fn(),
    } satisfies SentryAdapter;

    expect(initializeSentry(sdk, { environment: 'test' })).toBe(false);
    captureSentryException(sdk, { environment: 'test' }, new Error('not-sent'));

    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it('verrouille PII, logs et traces', () => {
    const options = createSentryOptions({
      dsn: 'https://public-key@sentry.example.test/42',
      environment: 'test',
      release: 's0.5-test.1',
    });

    expect(options).toMatchObject({
      enableLogs: false,
      environment: 'test',
      release: 's0.5-test.1',
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
  });

  it('supprime requête et utilisateur puis masque les secrets', () => {
    const event = sanitizeSentryEvent({
      extra: {
        note: 'email=private@example.test phone=+22370000000',
        token: 'private-token',
      },
      message: 'Bearer private-credential',
      request: { headers: { authorization: 'private-credential' } },
      user: { email: 'private@example.test', id: 'private-user' },
    } as unknown as ErrorEvent);

    const serialized = JSON.stringify(event);
    expect(event.request).toBeUndefined();
    expect(event.user).toBeUndefined();
    expect(serialized).toContain('[REDACTED]');
    expect(serialized).not.toMatch(/private|22370000000/);
  });
});
