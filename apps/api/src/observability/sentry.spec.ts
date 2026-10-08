import type { ErrorEvent, EventHint, NodeOptions } from '@sentry/node';
import {
  captureSentryException,
  initializeSentry,
  sanitizeSentryEvent,
  type SentryAdapter,
} from './sentry';

function adapter(): SentryAdapter {
  return {
    captureException: vi.fn((exception: unknown, hint?: EventHint) => {
      void exception;
      void hint;
      return 'event-id';
    }),
    init: vi.fn((options: NodeOptions) => {
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
    const initializedOptions = vi.mocked(sdk.init).mock.calls[0]?.[0];
    expect(initializedOptions?.beforeSend).toEqual(expect.any(Function));
    const sanitized = await initializedOptions!.beforeSend!(
      {
        extra: { otp: '123456', qrPng: 'private-qr-png', refreshToken: 'private-refresh' },
        request: { cookies: { session: 'private-cookie' } },
        user: { email: 'private@example.test' },
      } as unknown as ErrorEvent,
      {} as EventHint,
    );
    const serialized = JSON.stringify(sanitized);
    expect(serialized).toContain('[REDACTED]');
    expect(serialized).not.toMatch(/123456|private/);
  });

  it('supprime la requête et l’utilisateur puis masque les valeurs sensibles', () => {
    const event = sanitizeSentryEvent({
      extra: {
        nested: {
          csrf: 'private-csrf',
          seed: 'private-seed',
          token: 'private-token',
          verifier: 'private-verifier',
          wrappedDek: 'private-wrapped-dek',
        },
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
