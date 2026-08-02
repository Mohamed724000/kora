import { randomUUID } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

export function resolveRequestId(headers: IncomingHttpHeaders): string {
  const candidate = headers[REQUEST_ID_HEADER];
  return isValidRequestId(candidate) ? candidate : randomUUID();
}
