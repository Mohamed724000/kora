import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DestinationStream } from 'pino';
import { createHttpLogger, type RequestWithId } from './http-logger';
import { createStructuredLogger } from './structured-logger';

describe('createHttpLogger', () => {
  it('journalise uniquement méthode, chemin sûr, statut et requestId', async () => {
    const lines: string[] = [];
    const destination: DestinationStream = {
      write(message: string): void {
        lines.push(message);
      },
    };
    const middleware = createHttpLogger(createStructuredLogger('info', destination));
    const secrets = {
      authorization: 'Bearer private-jwt-value',
      cookie: '__Host-kora_admin_refresh=private-refresh-cookie',
      csrf: 'private-csrf-token',
      envelope: 'private-wrapped-dek-envelope',
      otp: '912345',
      otpauth: 'otpauth://totp/KORA:admin?secret=PRIVATESEED',
      password: 'private-password',
      query: 'private-query-token',
      recovery: 'PRIVATE-RECOVERY-VERIFIER',
    } as const;
    const server = createServer((request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk: string) => {
        body += chunk;
      });
      request.on('end', () => {
        middleware(request as RequestWithId, response, () => {
          expect(body).toContain(secrets.password);
          response.statusCode = 204;
          response.end();
        });
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    try {
      const address = server.address() as AddressInfo;
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/v1/admin/auth/login?token=${secrets.query}`,
        {
          body: JSON.stringify({
            envelope: secrets.envelope,
            otp: secrets.otp,
            otpauthUri: secrets.otpauth,
            password: secrets.password,
            recoveryVerifier: secrets.recovery,
          }),
          headers: {
            authorization: secrets.authorization,
            cookie: secrets.cookie,
            'content-type': 'application/json',
            'x-kora-csrf': secrets.csrf,
          },
          method: 'POST',
        },
      );
      expect(response.status).toBe(204);
      await new Promise<void>((resolve) => setImmediate(resolve));

      const output = lines.join('');
      expect(output).toContain('/api/v1/admin/auth/login');
      expect(output).toContain('POST');
      expect(output).toContain('204');
      for (const secret of Object.values(secrets)) {
        expect(output).not.toContain(secret);
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    }
  });
});
