import type { DestinationStream } from 'pino';
import { createStructuredLogger, REDACTED_VALUE } from './structured-logger';

describe('createStructuredLogger', () => {
  it('masque les en-têtes, secrets, OTP, emails, téléphones et DSN', () => {
    const lines: string[] = [];
    const destination: DestinationStream = {
      write(message: string): void {
        lines.push(message);
      },
    };
    const logger = createStructuredLogger('info', destination);

    logger.info({
      DSN: 'provider-sensitive-location',
      authorization: 'Bearer private-credential',
      cookie: 'session=private-cookie',
      credentials: {
        password: 'private-password',
        token: 'private-token',
      },
      verification: {
        email: 'private@example.test',
        otp: '123456',
      },
      profile: {
        phone: '+22370000000',
      },
    });

    const output = lines.join('');
    expect(output).toContain(REDACTED_VALUE);
    expect(output).not.toContain('provider-sensitive-location');
    expect(output).not.toContain('private-credential');
    expect(output).not.toContain('private-cookie');
    expect(output).not.toContain('private-password');
    expect(output).not.toContain('private-token');
    expect(output).not.toContain('private@example.test');
    expect(output).not.toContain('123456');
    expect(output).not.toContain('+22370000000');
  });
});
