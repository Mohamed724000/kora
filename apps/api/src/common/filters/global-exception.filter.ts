import {
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
} from '@nestjs/common';
import type { ServerResponse } from 'node:http';
import type { Logger } from 'pino';
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

type ExceptionReporter = (
  exception: unknown,
  context: Readonly<{ path: string; requestId: string }>,
) => void;

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
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<ServerResponse>();
    const status = statusFor(exception);
    const path = safePath(request.url);
    const requestId = request.id ?? 'unavailable';

    const body: ErrorResponse = {
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
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify(body));
  }
}
