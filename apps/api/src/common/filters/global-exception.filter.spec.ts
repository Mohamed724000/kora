import type { ArgumentsHost } from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { createStructuredLogger } from '../../observability/structured-logger';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  it('retourne une erreur structurée sans stack ni message interne', () => {
    let body = '';
    const response = {
      end(payload: string): void {
        body = payload;
      },
      setHeader: jest.fn(),
      statusCode: 0,
    } as unknown as ServerResponse;
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          id: 'request-test-123',
          method: 'GET',
          url: '/api/v1/failure?token=hidden',
        }),
        getResponse: () => response,
      }),
    } as ArgumentsHost;
    const filter = new GlobalExceptionFilter(createStructuredLogger('silent'));

    filter.catch(new Error('private internal detail'), host);

    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(response.statusCode).toBe(500);
    expect(parsed).toMatchObject({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Une erreur interne est survenue.',
      },
      path: '/api/v1/failure',
      requestId: 'request-test-123',
    });
    expect(body).not.toContain('private internal detail');
    expect(body).not.toContain('hidden');
    expect(body).not.toContain('stack');
  });
});
