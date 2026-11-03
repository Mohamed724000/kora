import { readFileSync } from 'node:fs';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { isAbsolute } from 'node:path';
import type { IncomingHttpHeaders } from 'node:http';
import {
  ADMIN_API_SERVER_NAME,
  ADMIN_CLIENT_PROVENANCE_HEADER,
  exactAdminApiServerIdentity,
  resolveNginxClientProvenance,
} from './admin-client-provenance';
import {
  resolveAdminAuthProxyOperation,
  type AdminAuthProxyOperation,
} from './admin-auth-proxy-policy';

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_COOKIE_BYTES = 4_096;
const MAX_COOKIE_PAIRS = 32;

const ADMIN_PREAUTH_COOKIE = '__Host-kora_admin_preauth';
const ADMIN_REFRESH_COOKIE = '__Host-kora_admin_refresh';
const ADMIN_CSRF_COOKIE = '__Host-kora_admin_csrf';
const ADMIN_COOKIE_NAMES = [ADMIN_PREAUTH_COOKIE, ADMIN_REFRESH_COOKIE, ADMIN_CSRF_COOKIE] as const;

type AdminCookieName = (typeof ADMIN_COOKIE_NAMES)[number];

const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;
const COOKIE_VALUE_PATTERN = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/u;
const OPAQUE_COOKIE_PATTERN = /^[A-Za-z0-9_-]{32,256}$/u;
const CSRF_TOKEN_PATTERN = /^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/u;

export interface AdminAuthProxyEnvironment extends Record<string, string | undefined> {
  ADMIN_API_CA_PATH?: string;
  ADMIN_API_ORIGIN?: string;
  ADMIN_API_SERVER_CERTIFICATE_SHA256?: string;
  ADMIN_BFF_CLIENT_CERTIFICATE_PATH?: string;
  ADMIN_BFF_CLIENT_PRIVATE_KEY_PATH?: string;
  ADMIN_ORIGIN?: string;
}

interface ProxyConfig {
  apiOrigin: URL;
  apiServerCertificateSha256: string;
  ca: Buffer;
  certificate: Buffer;
  key: Buffer;
  publicOrigin: string;
}

export class AdminAuthProxyError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 413 | 503,
    readonly code:
      | 'AUTH_REFRESH_INVALID'
      | 'AUTH_REQUIRED'
      | 'FORBIDDEN'
      | 'SERVICE_UNAVAILABLE'
      | 'VALIDATION_ERROR' = status === 401
      ? 'AUTH_REQUIRED'
      : status === 403
        ? 'FORBIDDEN'
        : status === 503
          ? 'SERVICE_UNAVAILABLE'
          : 'VALIDATION_ERROR',
  ) {
    super('Admin authentication request rejected.');
    this.name = 'AdminAuthProxyError';
  }
}

function browserContextError(operation: AdminAuthProxyOperation): AdminAuthProxyError {
  return operation.operationId === 'refreshAdminSession'
    ? new AdminAuthProxyError(401, 'AUTH_REFRESH_INVALID')
    : new AdminAuthProxyError(401, 'AUTH_REQUIRED');
}

function exactHttpsOrigin(value: string | undefined, expectedHostname?: string): URL {
  if (value === undefined) throw new AdminAuthProxyError(503);
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      parsed.origin !== value ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      (expectedHostname !== undefined && parsed.hostname !== expectedHostname)
    ) {
      throw new AdminAuthProxyError(503);
    }
    return parsed;
  } catch (error: unknown) {
    if (error instanceof AdminAuthProxyError) throw error;
    throw new AdminAuthProxyError(503);
  }
}

function file(
  environment: AdminAuthProxyEnvironment,
  field: keyof AdminAuthProxyEnvironment,
): Buffer {
  const path = environment[field];
  if (path === undefined || !isAbsolute(path)) throw new AdminAuthProxyError(503);
  try {
    return readFileSync(path);
  } catch {
    throw new AdminAuthProxyError(503);
  }
}

export function loadAdminAuthProxyConfig(environment: AdminAuthProxyEnvironment): ProxyConfig {
  const apiOrigin = exactHttpsOrigin(environment.ADMIN_API_ORIGIN, ADMIN_API_SERVER_NAME);
  const publicOrigin = exactHttpsOrigin(environment.ADMIN_ORIGIN).origin;
  const apiServerCertificateSha256 = environment.ADMIN_API_SERVER_CERTIFICATE_SHA256;
  if (
    apiServerCertificateSha256 === undefined ||
    !/^[a-f0-9]{64}$/u.test(apiServerCertificateSha256)
  ) {
    throw new AdminAuthProxyError(503);
  }
  return {
    apiOrigin,
    apiServerCertificateSha256,
    ca: file(environment, 'ADMIN_API_CA_PATH'),
    certificate: file(environment, 'ADMIN_BFF_CLIENT_CERTIFICATE_PATH'),
    key: file(environment, 'ADMIN_BFF_CLIENT_PRIVATE_KEY_PATH'),
    publicOrigin,
  };
}

function single(headers: Headers, name: string): string | undefined {
  const value = headers.get(name);
  if (value === null || value.includes(',') || /[\r\n]/u.test(value)) return undefined;
  return value;
}

function equal(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

function cookieValueIsValid(name: AdminCookieName, value: string): boolean {
  return (name === ADMIN_CSRF_COOKIE ? CSRF_TOKEN_PATTERN : OPAQUE_COOKIE_PATTERN).test(value);
}

function parseBrowserCookies(header: string): ReadonlyMap<string, string> {
  if (Buffer.byteLength(header, 'utf8') > MAX_COOKIE_BYTES || /\p{Cc}/u.test(header)) {
    throw new AdminAuthProxyError(403);
  }
  const pairs = header.split(';');
  if (pairs.length > MAX_COOKIE_PAIRS) throw new AdminAuthProxyError(403);
  const cookies = new Map<string, string>();
  for (const rawPair of pairs) {
    const pair = rawPair.trim();
    const separator = pair.indexOf('=');
    if (separator <= 0) throw new AdminAuthProxyError(403);
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (
      !COOKIE_NAME_PATTERN.test(name) ||
      !COOKIE_VALUE_PATTERN.test(value) ||
      value.includes('"') ||
      value.includes('\\') ||
      cookies.has(name)
    ) {
      throw new AdminAuthProxyError(403);
    }
    if (
      (ADMIN_COOKIE_NAMES as readonly string[]).includes(name) &&
      !cookieValueIsValid(name as AdminCookieName, value)
    ) {
      throw new AdminAuthProxyError(403);
    }
    cookies.set(name, value);
  }
  return cookies;
}

interface CookieRequestPolicy {
  forbidden: readonly AdminCookieName[];
  required: readonly AdminCookieName[];
}

function cookieRequestPolicy(operation: AdminAuthProxyOperation): CookieRequestPolicy {
  switch (operation.operationId) {
    case 'createAdminTotpEnrollment':
    case 'deliverAdminTotpEnrollmentQr':
    case 'confirmAdminTotpEnrollment':
    case 'verifyAdminRecoveryCode':
    case 'verifyAdminTotp':
      return {
        forbidden: [ADMIN_REFRESH_COOKIE],
        required: [ADMIN_PREAUTH_COOKIE, ADMIN_CSRF_COOKIE],
      };
    case 'refreshAdminSession':
      return {
        forbidden: [ADMIN_PREAUTH_COOKIE],
        required: [ADMIN_REFRESH_COOKIE, ADMIN_CSRF_COOKIE],
      };
    case 'loginAdmin':
      return { forbidden: [ADMIN_REFRESH_COOKIE], required: [] };
    case 'acceptAdminInvitation':
      return {
        forbidden: [ADMIN_PREAUTH_COOKIE, ADMIN_REFRESH_COOKIE],
        required: [],
      };
    default:
      return { forbidden: [], required: [] };
  }
}

export function adminAuthCookieHeader(
  request: Request,
  operation: AdminAuthProxyOperation,
): string | undefined {
  const rawCookie = request.headers.get('cookie');
  const oneCookie = single(request.headers, 'cookie');
  const policy = cookieRequestPolicy(operation);
  if (rawCookie !== null && oneCookie === undefined) {
    throw policy.required.length === 0
      ? new AdminAuthProxyError(403)
      : browserContextError(operation);
  }
  let cookies: ReadonlyMap<string, string>;
  try {
    cookies = oneCookie === undefined ? new Map<string, string>() : parseBrowserCookies(oneCookie);
  } catch {
    throw policy.required.length === 0
      ? new AdminAuthProxyError(403)
      : browserContextError(operation);
  }
  if (policy.forbidden.some((name) => cookies.has(name))) throw new AdminAuthProxyError(403);
  for (const name of policy.required) {
    if (!cookies.has(name)) throw browserContextError(operation);
  }
  if (policy.required.includes(ADMIN_CSRF_COOKIE)) {
    const csrfCookie = cookies.get(ADMIN_CSRF_COOKIE)!;
    const csrfHeader = single(request.headers, 'x-kora-csrf');
    if (csrfHeader === undefined || !equal(csrfCookie, csrfHeader)) {
      throw browserContextError(operation);
    }
  }
  return policy.required.length === 0
    ? undefined
    : policy.required.map((name) => `${name}=${cookies.get(name)!}`).join('; ');
}

function assertBrowserBoundary(
  request: Request,
  operation: AdminAuthProxyOperation,
  publicOrigin: string,
): void {
  if (operation.method === 'GET') return;
  if (
    single(request.headers, 'origin') !== publicOrigin ||
    single(request.headers, 'sec-fetch-site') !== 'same-origin'
  ) {
    throw new AdminAuthProxyError(403);
  }
}

function forwardHeaders(
  request: Request,
  operation: AdminAuthProxyOperation,
  clientAddress: string,
  cookieHeader: string | undefined,
): Record<string, string> {
  const headers: Record<string, string> = { [ADMIN_CLIENT_PROVENANCE_HEADER]: clientAddress };
  const names = ['accept'];
  if (operation.body === 'JSON') names.push('content-type');
  if (operation.method !== 'GET') {
    names.push('origin', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site');
  }
  if (
    operation.operationId === 'listAdminSessions' ||
    operation.operationId === 'revokeCurrentAdminSession' ||
    operation.operationId === 'rotateAdminRecoveryCodes'
  ) {
    names.push('authorization');
  }
  if (
    operation.operationId === 'createAdminTotpEnrollment' ||
    operation.operationId === 'deliverAdminTotpEnrollmentQr' ||
    operation.operationId === 'confirmAdminTotpEnrollment' ||
    operation.operationId === 'rotateAdminRecoveryCodes'
  ) {
    names.push('idempotency-key');
  }
  if (cookieRequestPolicy(operation).required.includes(ADMIN_CSRF_COOKIE)) {
    names.push('x-kora-csrf');
  }
  for (const name of names) {
    const value = single(request.headers, name);
    if (value !== undefined) headers[name] = value;
  }
  if (names.includes('authorization') && headers.authorization === undefined) {
    throw new AdminAuthProxyError(401, 'AUTH_REQUIRED');
  }
  if (
    names.includes('idempotency-key') &&
    (headers['idempotency-key'] === undefined ||
      !/^[\x21-\x7e]{16,128}$/u.test(headers['idempotency-key']))
  ) {
    throw operation.operationId === 'deliverAdminTotpEnrollmentQr'
      ? new AdminAuthProxyError(403, 'FORBIDDEN')
      : new AdminAuthProxyError(400, 'VALIDATION_ERROR');
  }
  if (cookieHeader !== undefined) headers.cookie = cookieHeader;
  return headers;
}

async function boundedRequestBytes(request: Request): Promise<Buffer> {
  if (request.body === null) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new AdminAuthProxyError(413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    size,
  );
}

async function requestBody(
  request: Request,
  operation: AdminAuthProxyOperation,
): Promise<Buffer | undefined> {
  const contentLength = single(request.headers, 'content-length');
  if (
    contentLength !== undefined &&
    (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAX_REQUEST_BYTES)
  ) {
    throw new AdminAuthProxyError(413);
  }
  if (operation.body === 'FORBIDDEN') {
    const body = await boundedRequestBytes(request);
    if (body.byteLength !== 0) throw new AdminAuthProxyError(400);
    return undefined;
  }
  if (single(request.headers, 'content-type')?.split(';', 1)[0]?.trim() !== 'application/json') {
    throw new AdminAuthProxyError(400, 'VALIDATION_ERROR');
  }
  const body = await boundedRequestBytes(request);
  if (body.byteLength === 0 || body.byteLength > MAX_REQUEST_BYTES)
    throw new AdminAuthProxyError(body.byteLength === 0 ? 400 : 413);
  return body;
}

function expectedSetCookies(
  operation: AdminAuthProxyOperation,
  status: number,
): readonly AdminCookieName[] {
  if (status < 200 || status >= 300) return [];
  switch (operation.operationId) {
    case 'loginAdmin':
    case 'verifyAdminRecoveryCode':
    case 'acceptAdminInvitation':
      return [ADMIN_PREAUTH_COOKIE, ADMIN_CSRF_COOKIE];
    case 'confirmAdminTotpEnrollment':
    case 'verifyAdminTotp':
    case 'refreshAdminSession':
      return [ADMIN_REFRESH_COOKIE, ADMIN_CSRF_COOKIE];
    default:
      return [];
  }
}

const RESPONSE_STATUSES: Readonly<
  Record<AdminAuthProxyOperation['operationId'], readonly number[]>
> = {
  acceptAdminInvitation: [200, 400, 429, 503],
  confirmAdminTotpEnrollment: [200, 400, 401, 403, 409, 410, 429, 503],
  createAdminTotpEnrollment: [201, 400, 401, 403, 409, 503],
  deliverAdminTotpEnrollmentQr: [200, 401, 403, 409, 503],
  listAdminSessions: [200, 401, 503],
  loginAdmin: [200, 400, 401, 429, 503],
  refreshAdminSession: [200, 401, 429, 503],
  requestAdminPasswordReset: [202, 400, 429, 503],
  resetAdminPassword: [204, 400, 429, 503],
  revokeCurrentAdminSession: [204, 401, 503],
  rotateAdminRecoveryCodes: [200, 400, 401, 403, 409, 429, 503],
  verifyAdminRecoveryCode: [200, 400, 401, 429, 503],
  verifyAdminTotp: [200, 400, 401, 410, 429, 503],
};

function expectedContentType(operation: AdminAuthProxyOperation, status: number): string | null {
  if (status === 204) return null;
  if (operation.operationId === 'deliverAdminTotpEnrollmentQr' && status === 200) {
    return 'image/png';
  }
  return 'application/json';
}

function assertUpstreamResponsePolicy(
  operation: AdminAuthProxyOperation,
  status: number,
  headers: IncomingHttpHeaders,
): void {
  if (!RESPONSE_STATUSES[operation.operationId].includes(status)) {
    throw new AdminAuthProxyError(503);
  }
  const expectedMediaType = expectedContentType(operation, status);
  const rawContentType = headers['content-type'];
  if (Array.isArray(rawContentType)) throw new AdminAuthProxyError(503);
  const mediaType = rawContentType?.split(';', 1)[0]?.trim().toLowerCase();
  if (
    (expectedMediaType === null && rawContentType !== undefined) ||
    (expectedMediaType !== null && mediaType !== expectedMediaType)
  ) {
    throw new AdminAuthProxyError(503);
  }
  const retryAfter = headers['retry-after'];
  if (Array.isArray(retryAfter)) throw new AdminAuthProxyError(503);
  if (status === 429) {
    if (
      retryAfter === undefined ||
      !/^[1-9]\d{0,4}$/u.test(retryAfter) ||
      Number(retryAfter) > 86_400
    ) {
      throw new AdminAuthProxyError(503);
    }
  } else if (retryAfter !== undefined) {
    throw new AdminAuthProxyError(503);
  }
}

function validateSetCookie(value: string, expectedMaxAge: number): AdminCookieName {
  if (/\r|\n/u.test(value)) throw new AdminAuthProxyError(503);
  const segments = value.split(';').map((segment) => segment.trim());
  const first = segments.shift();
  const separator = first?.indexOf('=') ?? -1;
  if (first === undefined || separator <= 0) throw new AdminAuthProxyError(503);
  const name = first.slice(0, separator);
  const cookieValue = first.slice(separator + 1);
  if (!(ADMIN_COOKIE_NAMES as readonly string[]).includes(name)) {
    throw new AdminAuthProxyError(503);
  }
  const typedName = name as AdminCookieName;
  if (!cookieValueIsValid(typedName, cookieValue)) throw new AdminAuthProxyError(503);

  const attributes = new Map<string, string | true>();
  for (const segment of segments) {
    const equals = segment.indexOf('=');
    const key = (equals === -1 ? segment : segment.slice(0, equals)).toLowerCase();
    const attributeValue = equals === -1 ? true : segment.slice(equals + 1);
    if (key === '' || attributes.has(key)) throw new AdminAuthProxyError(503);
    attributes.set(key, attributeValue);
  }
  const maxAge = attributes.get('max-age');
  const allowed = new Set(['max-age', 'path', 'secure', 'samesite']);
  if (typedName !== ADMIN_CSRF_COOKIE) allowed.add('httponly');
  if (
    [...attributes.keys()].some((key) => !allowed.has(key)) ||
    typeof maxAge !== 'string' ||
    !/^\d+$/u.test(maxAge) ||
    Number(maxAge) !== expectedMaxAge ||
    attributes.get('path') !== '/' ||
    attributes.get('secure') !== true ||
    attributes.get('samesite') !== 'Strict' ||
    (typedName === ADMIN_CSRF_COOKIE
      ? attributes.has('httponly')
      : attributes.get('httponly') !== true)
  ) {
    throw new AdminAuthProxyError(503);
  }
  return typedName;
}

function clearCookie(name: AdminCookieName): string {
  const httpOnly = name === ADMIN_CSRF_COOKIE ? '' : '; HttpOnly';
  return `${name}=; Max-Age=0; Path=/; Secure; SameSite=Strict${httpOnly}`;
}

function localCookieExpirations(
  operation: AdminAuthProxyOperation,
  status: number,
): readonly AdminCookieName[] {
  switch (operation.operationId) {
    case 'createAdminTotpEnrollment':
    case 'deliverAdminTotpEnrollmentQr':
      return status === 401 ? [ADMIN_PREAUTH_COOKIE, ADMIN_CSRF_COOKIE] : [];
    case 'confirmAdminTotpEnrollment':
    case 'verifyAdminTotp':
      return status >= 200 && status < 300
        ? [ADMIN_PREAUTH_COOKIE]
        : status === 401 || status === 410
          ? [ADMIN_PREAUTH_COOKIE, ADMIN_CSRF_COOKIE]
          : [];
    case 'verifyAdminRecoveryCode':
      return status >= 200 && status < 300
        ? [ADMIN_REFRESH_COOKIE]
        : status === 401
          ? [ADMIN_PREAUTH_COOKIE, ADMIN_CSRF_COOKIE]
          : [];
    case 'refreshAdminSession':
      return status >= 200 && status < 300
        ? [ADMIN_PREAUTH_COOKIE]
        : status === 401 || status >= 500
          ? ADMIN_COOKIE_NAMES
          : [];
    case 'revokeCurrentAdminSession':
      return ADMIN_COOKIE_NAMES;
    case 'resetAdminPassword':
      return status === 204 || status >= 500 ? ADMIN_COOKIE_NAMES : [];
    case 'acceptAdminInvitation':
      return status >= 200 && status < 300 ? [ADMIN_REFRESH_COOKIE] : [];
    default:
      return [];
  }
}

export function adminAuthResponseHeaders(
  operation: AdminAuthProxyOperation,
  status: number,
  headers: IncomingHttpHeaders,
): Headers {
  assertUpstreamResponsePolicy(operation, status, headers);
  const result = new Headers();
  for (const name of ['cache-control', 'content-type', 'retry-after', 'x-content-type-options']) {
    const value = headers[name];
    if (typeof value === 'string') result.set(name, value);
  }
  const upstreamCookies = headers['set-cookie'] ?? [];
  const expected = expectedSetCookies(operation, status);
  const seen = new Map<AdminCookieName, string>();
  for (const cookie of upstreamCookies) {
    const hintedName = cookie.slice(0, cookie.indexOf('=')) as AdminCookieName;
    const expectedMaxAge =
      hintedName === ADMIN_PREAUTH_COOKIE ||
      (hintedName === ADMIN_CSRF_COOKIE && expected.includes(ADMIN_PREAUTH_COOKIE))
        ? 600
        : 43_200;
    const name = validateSetCookie(cookie, expectedMaxAge);
    if (seen.has(name)) throw new AdminAuthProxyError(503);
    seen.set(name, cookie);
  }
  if (
    seen.size !== expected.length ||
    expected.some((name) => !seen.has(name)) ||
    [...seen.keys()].some((name) => !expected.includes(name))
  ) {
    throw new AdminAuthProxyError(503);
  }
  for (const name of expected) result.append('set-cookie', seen.get(name)!);
  for (const name of localCookieExpirations(operation, status)) {
    if (!seen.has(name)) result.append('set-cookie', clearCookie(name));
  }
  result.set('cache-control', 'no-store');
  result.set('x-content-type-options', 'nosniff');
  return result;
}

export function adminAuthResponseBody(status: number, body: Buffer): Buffer | null {
  if (status === 204 || status === 205 || status === 304) {
    if (body.byteLength !== 0) throw new AdminAuthProxyError(503);
    return null;
  }
  return body;
}

async function callApi(
  request: Request,
  operation: AdminAuthProxyOperation,
  config: ProxyConfig,
  body: Buffer | undefined,
  clientAddress: string,
  cookieHeader: string | undefined,
): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const options: RequestOptions = {
    ca: config.ca,
    cert: config.certificate,
    checkServerIdentity: (hostname, certificate) =>
      exactAdminApiServerIdentity(hostname, certificate, config.apiServerCertificateSha256),
    headers: forwardHeaders(request, operation, clientAddress, cookieHeader),
    hostname: config.apiOrigin.hostname,
    key: config.key,
    method: operation.method,
    minVersion: 'TLSv1.3',
    path: incomingUrl.pathname,
    port: config.apiOrigin.port === '' ? 443 : Number(config.apiOrigin.port),
    rejectUnauthorized: true,
    servername: ADMIN_API_SERVER_NAME,
  };
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    const settleReject = (error: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(wallDeadline);
      reject(error);
    };
    const upstream = httpsRequest(options, (upstreamResponse) => {
      const chunks: Buffer[] = [];
      let size = 0;
      upstreamResponse.on('data', (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > MAX_RESPONSE_BYTES) {
          upstreamResponse.destroy(new AdminAuthProxyError(503));
          return;
        }
        chunks.push(chunk);
      });
      upstreamResponse.on('error', settleReject);
      upstreamResponse.on('end', () => {
        if (settled) return;
        try {
          const status = upstreamResponse.statusCode ?? 503;
          const responseBody = adminAuthResponseBody(status, Buffer.concat(chunks));
          const response = new Response(
            responseBody === null ? null : new Uint8Array(responseBody),
            {
              headers: adminAuthResponseHeaders(operation, status, upstreamResponse.headers),
              status,
            },
          );
          settled = true;
          clearTimeout(wallDeadline);
          resolve(response);
        } catch (error: unknown) {
          settleReject(error);
        }
      });
    });
    const wallDeadline = setTimeout(
      () => upstream.destroy(new AdminAuthProxyError(503)),
      REQUEST_TIMEOUT_MS,
    );
    upstream.once('error', settleReject);
    upstream.setTimeout(REQUEST_TIMEOUT_MS, () => upstream.destroy(new AdminAuthProxyError(503)));
    if (body !== undefined) upstream.write(body);
    upstream.end();
  });
}

function rejected(
  status: number,
  operation?: AdminAuthProxyOperation,
  cause?: AdminAuthProxyError,
): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (operation !== undefined) {
    for (const name of localCookieExpirations(operation, status)) {
      headers.append('set-cookie', clearCookie(name));
    }
  }
  if (status === 404) return new Response(null, { headers, status });
  const error =
    cause ??
    (status === 401 && operation?.operationId === 'refreshAdminSession'
      ? new AdminAuthProxyError(401, 'AUTH_REFRESH_INVALID')
      : new AdminAuthProxyError(
          status === 401 ||
            status === 400 ||
            status === 403 ||
            status === 404 ||
            status === 413 ||
            status === 503
            ? status
            : 503,
        ));
  const messages = {
    AUTH_REFRESH_INVALID: 'Actualisation de session invalide.',
    AUTH_REQUIRED: 'Authentification requise.',
    FORBIDDEN: 'Accès refusé.',
    SERVICE_UNAVAILABLE: 'Service temporairement indisponible.',
    VALIDATION_ERROR: 'Requête invalide.',
  } as const;
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(
    JSON.stringify({
      error: { code: error.code, details: {}, message: messages[error.code], retryable: false },
      requestId: `bff_${randomUUID()}`,
    }),
    {
      headers,
      status,
    },
  );
}

export async function proxyAdminAuthRequest(
  request: Request,
  environment: AdminAuthProxyEnvironment = process.env,
): Promise<Response> {
  let operation: AdminAuthProxyOperation | undefined;
  try {
    const incomingUrl = new URL(request.url);
    operation = resolveAdminAuthProxyOperation(
      request.method,
      incomingUrl.pathname,
      incomingUrl.search,
    );
    if (operation === undefined) throw new AdminAuthProxyError(404);
    const config = loadAdminAuthProxyConfig(environment);
    assertBrowserBoundary(request, operation, config.publicOrigin);
    const clientAddress = resolveNginxClientProvenance(request.headers);
    const cookieHeader = adminAuthCookieHeader(request, operation);
    const body = await requestBody(request, operation);
    return await callApi(request, operation, config, body, clientAddress, cookieHeader);
  } catch (error: unknown) {
    if (error instanceof AdminAuthProxyError) {
      return rejected(error.status, operation, error);
    }
    return rejected(503, operation);
  }
}
