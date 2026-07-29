import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import pinoHttp from 'pino-http';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-id';

export interface RequestWithId extends IncomingMessage {
  id: string;
}

export type HttpMiddleware = (
  request: RequestWithId,
  response: ServerResponse,
  next: () => void,
) => void;

export function safePath(url: string | undefined): string {
  if (url === undefined) {
    return '/';
  }

  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

export function createHttpLogger(logger: Logger): HttpMiddleware {
  return pinoHttp({
    customProps(request) {
      return { requestId: request.id };
    },
    genReqId(request, response) {
      const requestId = resolveRequestId(request.headers);
      response.setHeader(REQUEST_ID_HEADER, requestId);
      return requestId;
    },
    logger,
    serializers: {
      req(request) {
        return {
          id: request.id,
          method: request.method,
          path: safePath(request.url),
        };
      },
      res(response) {
        return {
          statusCode: response.statusCode,
        };
      },
    },
    wrapSerializers: false,
  }) as HttpMiddleware;
}
