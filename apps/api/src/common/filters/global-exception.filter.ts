import {
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
} from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import { AdminC1HttpError } from '../../admin-auth/admin-session.service';
import { safePath, type RequestWithId } from '../../observability/http-logger';

interface ErrorDefinition {
  code: string;
  message: string;
}

interface ErrorResponse {
  error: ErrorDefinition;
  path: string;
  requestId: string;
  timestamp: string;
}

interface AdminC1ErrorResponse {
  error: {
    code: string;
    details: Readonly<Record<string, unknown>>;
    message: string;
    retryable: false;
  };
  requestId: string;
}

type ExceptionReporter = (
  exception: unknown,
  context: Readonly<{ path: string; requestId: string }>,
) => void;
type AdminFailureAuditRecorder = (exception: AdminC1HttpError, requestId: string) => Promise<void>;
type ErrorMiddlewareNext = (exception: unknown) => void;

interface BodyParserError extends SyntaxError {
  status?: unknown;
  type?: unknown;
}

interface MountedRequest {
  method?: unknown;
  url?: unknown;
}

export function isMalformedJsonParserError(exception: unknown): exception is BodyParserError {
  if (!(exception instanceof SyntaxError)) return false;
  const candidate = exception as BodyParserError;
  return candidate.status === HttpStatus.BAD_REQUEST && candidate.type === 'entity.parse.failed';
}

export function normalizeAdminC1MalformedJsonError(
  exception: unknown,
  request: MountedRequest,
  _response: unknown,
  next: ErrorMiddlewareNext,
): void {
  next(
    request.method === 'POST' &&
      typeof request.url === 'string' &&
      safePath(request.url) === '/' &&
      isMalformedJsonParserError(exception)
      ? new AdminC1HttpError(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR')
      : exception,
  );
}

const PUBLIC_ERRORS: Readonly<Record<number, ErrorDefinition>> = {
  [HttpStatus.BAD_REQUEST]: {
    code: 'BAD_REQUEST',
    message: 'Requête invalide.',
  },
  [HttpStatus.UNAUTHORIZED]: {
    code: 'UNAUTHORIZED',
    message: 'Authentification requise.',
  },
  [HttpStatus.FORBIDDEN]: {
    code: 'FORBIDDEN',
    message: 'Accès refusé.',
  },
  [HttpStatus.NOT_FOUND]: {
    code: 'NOT_FOUND',
    message: 'Ressource introuvable.',
  },
  [HttpStatus.METHOD_NOT_ALLOWED]: {
    code: 'METHOD_NOT_ALLOWED',
    message: 'Méthode non autorisée.',
  },
  [HttpStatus.CONFLICT]: {
    code: 'CONFLICT',
    message: 'Conflit de requête.',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: 'RATE_LIMITED',
    message: 'Trop de requêtes.',
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    code: 'SERVICE_UNAVAILABLE',
    message: 'Service temporairement indisponible.',
  },
};

const INTERNAL_ERROR: ErrorDefinition = {
  code: 'INTERNAL_SERVER_ERROR',
  message: 'Une erreur interne est survenue.',
};

function statusFor(exception: unknown): number {
  if (exception instanceof AdminC1HttpError) {
    return exception.status;
  }
  return exception instanceof HttpException
    ? exception.getStatus()
    : HttpStatus.INTERNAL_SERVER_ERROR;
}

function publicError(status: number): ErrorDefinition {
  if (status >= 500) {
    return PUBLIC_ERRORS[status] ?? INTERNAL_ERROR;
  }

  return (
    PUBLIC_ERRORS[status] ?? {
      code: 'HTTP_ERROR',
      message: 'La requête ne peut pas être traitée.',
    }
  );
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly logger: Logger,
    private readonly reportException: ExceptionReporter = () => undefined,
    private readonly recordAdminFailure?: AdminFailureAuditRecorder,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void | Promise<void> {
    if (
      exception instanceof AdminC1HttpError &&
      !exception.auditRecorded &&
      this.recordAdminFailure !== undefined
    ) {
      return this.auditThenRespond(exception, host);
    }
    this.respond(exception, host);
  }

  private async auditThenRespond(exception: AdminC1HttpError, host: ArgumentsHost): Promise<void> {
    const request = host.switchToHttp().getRequest<RequestWithId>();
    const recorder = this.recordAdminFailure;
    if (recorder === undefined) {
      this.respond(exception, host);
      return;
    }
    try {
      await recorder(exception, request.id ?? 'unavailable');
      this.respond(exception, host);
    } catch {
      this.respond(new AdminC1HttpError(503, 'SERVICE_UNAVAILABLE', { auditRecorded: true }), host);
    }
  }

  private respond(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<ServerResponse>();
    const status = statusFor(exception);
    const path = safePath(request.url);
    const requestId = request.id ?? 'unavailable';

    const body: ErrorResponse | AdminC1ErrorResponse =
      exception instanceof AdminC1HttpError
        ? {
            error: {
              code: exception.code,
              details: exception.details,
              message: exception.message,
              retryable: exception.retryable,
            },
            requestId,
          }
        : {
            error: publicError(status),
            path,
            requestId,
            timestamp: new Date().toISOString(),
          };

    this.logger.error(
      {
        event: 'request_failed',
        exceptionType:
          exception instanceof Error && exception.name.length > 0 ? exception.name : 'UnknownError',
        method: request.method,
        path,
        requestId,
        statusCode: status,
      },
      'Request failed',
    );

    if (status >= 500) {
      this.reportException(exception, { path, requestId });
    }

    response.statusCode = status;
    if (exception instanceof AdminC1HttpError && exception.retryAfterSeconds !== undefined) {
      response.setHeader('retry-after', String(exception.retryAfterSeconds));
    }
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(body));
  }
}
