import type { DestinationStream } from 'pino';
import { createStructuredLogger, NestStructuredLogger, REDACTED_VALUE } from './structured-logger';

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

  it('neutralise les données sensibles placées directement dans les messages Nest', () => {
    const lines: string[] = [];
    const destination: DestinationStream = {
      write(message: string): void {
        lines.push(message);
      },
    };
    const logger = new NestStructuredLogger(createStructuredLogger('trace', destination));
    const sensitiveValues = [
      'direct-token-value',
      'postgresql://db-user:db-password@database.internal/kora',
      'direct-password-value',
      '912345',
      'direct@example.test',
      '+22370000000',
    ] as const;
    const message = [
      'Échec contrôlé',
      `token=${sensitiveValues[0]}`,
      `DSN=${sensitiveValues[1]}`,
      `password=${sensitiveValues[2]}`,
      `OTP=${sensitiveValues[3]}`,
      `email=${sensitiveValues[4]}`,
      `phone=${sensitiveValues[5]}`,
    ].join(' ');

    logger.log(message, 'SafeContext');
    logger.error(message, 'ignored stack', 'SafeContext');
    logger.warn(message, 'SafeContext');
    logger.debug(message, 'SafeContext');
    logger.verbose(message, 'SafeContext');
    logger.fatal(message, 'SafeContext');

    const output = lines.join('');
    expect(lines).toHaveLength(6);
    expect(output).toContain(REDACTED_VALUE);
    expect(output).toContain('Échec contrôlé');
    expect(output).toContain('nest.log');
    expect(output).toContain('nest.error');
    expect(output).not.toContain('ignored stack');
    for (const sensitiveValue of sensitiveValues) {
      expect(output).not.toContain(sensitiveValue);
    }
  });
});
