import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import { AdminC1HttpError } from '../../admin-auth/admin-session.service';
import { createStructuredLogger } from '../../observability/structured-logger';
import {
  GlobalExceptionFilter,
  isMalformedJsonParserError,
  normalizeAdminC1MalformedJsonError,
} from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  it('classifie uniquement le SyntaxError entity.parse.failed 400 de body-parser', () => {
    const canary = 'R12_UNIT_CANARY_2f8a91';
    const parserError = Object.assign(new SyntaxError(`internal ${canary}`), {
      body: `{"secret":"${canary}`,
      status: 400,
      statusCode: 400,
      type: 'entity.parse.failed',
    });
    expect(isMalformedJsonParserError(parserError)).toBe(true);

    const next = vi.fn();
    normalizeAdminC1MalformedJsonError(parserError, { method: 'POST', url: '/' }, {}, next);
    expect(next).toHaveBeenCalledTimes(1);
    const normalized = next.mock.calls[0]?.[0];
    expect(normalized).toBeInstanceOf(AdminC1HttpError);
    expect(normalized).not.toBe(parserError);
    expect(normalized).toMatchObject({
      auditAction: undefined,
      auditContext: undefined,
      auditRecorded: false,
      code: 'VALIDATION_ERROR',
      details: {},
      message: 'Requête invalide.',
      retryable: false,
      status: 400,
    });
    expect(JSON.stringify(normalized)).not.toContain(canary);
  });

  it('préserve par identité les erreurs hors classificateur JSON borné', () => {
    const cases: readonly unknown[] = [
      new URIError('invalid URI'),
      new BadRequestException('application failure'),
      Object.assign(new SyntaxError('too large'), {
        status: 413,
        type: 'entity.too.large',
      }),
      Object.assign(new SyntaxError('wrong status'), {
        status: 413,
        type: 'entity.parse.failed',
      }),
      Object.assign(new SyntaxError('unsupported encoding'), {
        status: 415,
        type: 'encoding.unsupported',
      }),
      new AdminC1HttpError(400, 'VALIDATION_ERROR'),
      new Error('unrelated failure'),
    ];

    for (const exception of cases) {
      expect(isMalformedJsonParserError(exception)).toBe(false);
      const next = vi.fn();
      normalizeAdminC1MalformedJsonError(exception, { method: 'POST', url: '/' }, {}, next);
      expect(next).toHaveBeenCalledExactlyOnceWith(exception);
    }

    for (const request of [
      { method: 'GET', url: '/' },
      { method: 'POST', url: '/extra' },
      { method: 'POST', url: '/extra?query=ignored' },
    ]) {
      const parserError = Object.assign(new SyntaxError('parse failure'), {
        status: 400,
        type: 'entity.parse.failed',
      });
      const next = vi.fn();
      normalizeAdminC1MalformedJsonError(parserError, request, {}, next);
      expect(next).toHaveBeenCalledExactlyOnceWith(parserError);
    }
  });

  it('compose normalisation, sink et filtre sans exposer le corps ou message du parseur', async () => {
    const canary = 'R12_LOG_CANARY_854c0e';
    const parserError = Object.assign(new SyntaxError(`parser detail ${canary}`), {
      body: `{"canary":"${canary}`,
      status: 400,
      statusCode: 400,
      type: 'entity.parse.failed',
    });
    let body = '';
    const response = {
      end(payload: string): void {
        body = payload;
      },
      setHeader: vi.fn(),
      statusCode: 0,
    } as unknown as ServerResponse;
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({
          id: 'request-r12-composition',
          method: 'POST',
          url: '/api/v1/admin/auth/login?query=safe',
        }),
        getResponse: () => response,
      }),
    } as ArgumentsHost;
    const loggerError = vi.fn();
    const logger = { error: loggerError } as unknown as Logger;
    const recorder = vi.fn().mockResolvedValue(undefined);
    const reporter = vi.fn();
    const filter = new GlobalExceptionFilter(logger, reporter, recorder);
    let completion: void | Promise<void> = undefined;

    normalizeAdminC1MalformedJsonError(
      parserError,
      { method: 'POST', url: '/' },
      {},
      (normalized) => {
        completion = filter.catch(normalized, host);
      },
    );
    await completion;

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(body)).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        details: {},
        message: 'Requête invalide.',
        retryable: false,
      },
      requestId: 'request-r12-composition',
    });
    expect(recorder).toHaveBeenCalledTimes(1);
    expect(recorder.mock.calls[0]?.[1]).toBe('request-r12-composition');
    expect(loggerError).toHaveBeenCalledTimes(1);
    expect(reporter).not.toHaveBeenCalled();
    expect(body).not.toContain(canary);
    expect(JSON.stringify(recorder.mock.calls)).not.toContain(canary);
    expect(JSON.stringify(loggerError.mock.calls)).not.toContain(canary);
  });

  it('retourne une erreur structurée sans stack ni message interne', () => {
    let body = '';
    const response = {
      end(payload: string): void {
        body = payload;
      },
      setHeader: vi.fn(),
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
    const reportException = vi.fn();
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
      setHeader: vi.fn(),
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
    const reportException = vi.fn();

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
      end: vi.fn(),
      setHeader: vi.fn(),
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
      setHeader: vi.fn(),
      statusCode: 0,
    } as unknown as ServerResponse;
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ id: 'request-audit-1', method: 'POST', url: '/api/v1/admin/auth' }),
        getResponse: () => response,
      }),
    } as ArgumentsHost;
    const recorder = vi.fn().mockResolvedValue(undefined);
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
