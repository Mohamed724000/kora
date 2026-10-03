import type { ArgumentsHost } from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import { AdminC1HttpError } from '../../admin-auth/admin-session.service';
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
    const reportException = jest.fn();
    const filter = new GlobalExceptionFilter(createStructuredLogger('silent'), reportException);

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
    expect(reportException).toHaveBeenCalledWith(expect.any(Error), {
      path: '/api/v1/failure',
      requestId: 'request-test-123',
    });
  });

  it('rend les erreurs C1 exactement ferm\u00e9es sans champs historiques', () => {
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
          id: 'request-c1-503',
          method: 'POST',
          url: '/api/v1/admin/auth/login?password=hidden',
        }),
        getResponse: () => response,
      }),
    } as ArgumentsHost;
    const reportException = jest.fn();

    new GlobalExceptionFilter(createStructuredLogger('silent'), reportException).catch(
      new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE'),
      host,
    );

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(body)).toEqual({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        details: {},
        message: 'Service temporairement indisponible.',
        retryable: false,
      },
      requestId: 'request-c1-503',
    });
    expect(body).not.toContain('path');
    expect(body).not.toContain('timestamp');
    expect(body).not.toContain('hidden');
    expect(reportException).toHaveBeenCalledTimes(1);
  });

  it('ajoute Retry-After uniquement depuis une erreur C1 born\u00e9e', () => {
    const response = {
      end: jest.fn(),
      setHeader: jest.fn(),
      statusCode: 0,
    } as unknown as ServerResponse;
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ id: 'request-c1-429', method: 'POST', url: '/api/v1/admin/auth' }),
        getResponse: () => response,
      }),
    } as ArgumentsHost;

    new GlobalExceptionFilter(createStructuredLogger('silent')).catch(
      new AdminC1HttpError(429, 'RATE_LIMITED', { retryAfterSeconds: 17 }),
      host,
    );

    expect(response.setHeader).toHaveBeenCalledWith('retry-after', '17');
  });

  it('persiste un sink C1 avant la rÃ©ponse et neutralise un Ã©chec du sink en 503', async () => {
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
        getRequest: () => ({ id: 'request-audit-1', method: 'POST', url: '/api/v1/admin/auth' }),
        getResponse: () => response,
      }),
    } as ArgumentsHost;
    const recorder = jest.fn().mockResolvedValue(undefined);
    const filter = new GlobalExceptionFilter(createStructuredLogger('silent'), undefined, recorder);

    await filter.catch(new AdminC1HttpError(401, 'AUTH_REQUIRED'), host);
    expect(recorder).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(401);

    recorder.mockRejectedValueOnce(new Error('controlled sink failure'));
    await filter.catch(new AdminC1HttpError(403, 'FORBIDDEN'), host);
    expect(response.statusCode).toBe(503);
    expect(JSON.parse(body)).toEqual({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        details: {},
        message: 'Service temporairement indisponible.',
        retryable: false,
      },
      requestId: 'request-audit-1',
    });
  });
});
