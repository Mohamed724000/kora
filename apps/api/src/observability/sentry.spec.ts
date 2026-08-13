import type { ErrorEvent, EventHint, NodeOptions } from '@sentry/node';
import {
  captureSentryException,
  initializeSentry,
  sanitizeSentryEvent,
  type SentryAdapter,
} from './sentry';

function adapter(): SentryAdapter {
  return {
    captureException: jest.fn((exception: unknown, hint?: EventHint) => {
      void exception;
      void hint;
      return 'event-id';
    }),
    init: jest.fn((options: NodeOptions) => {
      void options;
    }),
  };
}

describe('Sentry API', () => {
  it('reste entièrement inactif sans DSN', async () => {
    const sdk = adapter();

    await expect(initializeSentry({ environment: 'test' }, sdk)).resolves.toBe(false);
    captureSentryException(new Error('not-sent'), {}, sdk);

    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it('configure un envoi sans PII, logs ni traces', async () => {
    const sdk = adapter();

    await expect(
      initializeSentry(
        {
          dsn: 'https://public-key@sentry.example.test/42',
          environment: 'test',
          release: 's0.5-test.1',
        },
        sdk,
      ),
    ).resolves.toBe(true);

    expect(sdk.init).toHaveBeenCalledWith(
      expect.objectContaining({
        enableLogs: false,
        environment: 'test',
        release: 's0.5-test.1',
        sendDefaultPii: false,
        tracesSampleRate: 0,
      }),
    );
  });

  it('supprime la requête et l’utilisateur puis masque les valeurs sensibles', () => {
    const event = sanitizeSentryEvent({
      extra: {
        nested: { token: 'private-token' },
        note: 'email=private@example.test phone=+22370000000',
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
