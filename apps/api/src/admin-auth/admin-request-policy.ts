import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { AdminKeyedDigestProvider } from './admin-key-provider';

export const ADMIN_PREAUTH_COOKIE = '__Host-kora_admin_preauth';
export const ADMIN_REFRESH_COOKIE = '__Host-kora_admin_refresh';
export const ADMIN_CSRF_COOKIE = '__Host-kora_admin_csrf';
export const ADMIN_CSRF_HEADER = 'x-kora-csrf';
export const ADMIN_REQUEST_POLICY = Symbol('ADMIN_REQUEST_POLICY');

const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;
const COOKIE_VALUE_PATTERN = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]*$/u;
const OPAQUE_COOKIE_PATTERN = /^[A-Za-z0-9_-]{32,256}$/u;
const CSRF_TOKEN_PATTERN = /^v1\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/u;

export type AdminRequestHeaders = Readonly<Record<string, string | readonly string[] | undefined>>;

export type AdminBrowserContext = 'PREAUTH' | 'REFRESH';

export interface ValidatedAdminBrowserContext {
  contextToken: string;
  csrfToken: string;
}

export interface AdminRequestPolicyOptions {
  keyProvider: AdminKeyedDigestProvider;
  maxCookieBytes?: number;
  maxCookiePairs?: number;
  origin: string;
}

export class AdminRequestPolicyError extends Error {
  constructor(
    readonly reason: 'AUTH_REQUIRED' | 'FORBIDDEN' | 'SERVICE_UNAVAILABLE' | 'VALIDATION_ERROR',
  ) {
    super('Admin request rejected.');
    this.name = 'AdminRequestPolicyError';
  }
}

function normalizedHeaderName(name: string): string {
  return name.toLowerCase();
}

function singleHeader(headers: AdminRequestHeaders, name: string): string | undefined {
  const target = normalizedHeaderName(name);
  const entries = Object.entries(headers).filter(
    ([candidate]) => normalizedHeaderName(candidate) === target,
  );
  if (entries.length !== 1) {
    return undefined;
  }
  const value = entries[0]![1];
  return typeof value === 'string' ? value : undefined;
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}

function validHttpsOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return (
      parsed.protocol === 'https:' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.pathname === '/' &&
      parsed.search === '' &&
      parsed.hash === '' &&
      parsed.origin === origin
    );
  } catch {
    return false;
  }
}

export function parseAdminCookies(
  header: string,
  maxBytes = 4096,
  maxPairs = 32,
): ReadonlyMap<string, string> {
  if (Buffer.byteLength(header, 'utf8') > maxBytes || /\p{Cc}/u.test(header)) {
    throw new AdminRequestPolicyError('AUTH_REQUIRED');
  }
  const cookies = new Map<string, string>();
  const pairs = header.split(';');
  if (pairs.length > maxPairs) {
    throw new AdminRequestPolicyError('AUTH_REQUIRED');
  }
  for (const rawPair of pairs) {
    const pair = rawPair.trim();
    const separator = pair.indexOf('=');
    if (separator <= 0) {
      throw new AdminRequestPolicyError('AUTH_REQUIRED');
    }
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (
      !COOKIE_NAME_PATTERN.test(name) ||
      !COOKIE_VALUE_PATTERN.test(value) ||
      value.includes('"') ||
      value.includes('\\') ||
      cookies.has(name)
    ) {
      throw new AdminRequestPolicyError('AUTH_REQUIRED');
    }
    cookies.set(name, value);
  }
  return cookies;
}

export function serializeAdminCookie(
  name: typeof ADMIN_PREAUTH_COOKIE | typeof ADMIN_REFRESH_COOKIE | typeof ADMIN_CSRF_COOKIE,
  value: string,
  maxAgeSeconds: number,
): string {
  if (
    (!OPAQUE_COOKIE_PATTERN.test(value) && !CSRF_TOKEN_PATTERN.test(value)) ||
    !Number.isSafeInteger(maxAgeSeconds) ||
    maxAgeSeconds < 1 ||
    maxAgeSeconds > 12 * 60 * 60
  ) {
    throw new AdminRequestPolicyError('VALIDATION_ERROR');
  }
  const httpOnly = name === ADMIN_CSRF_COOKIE ? '' : '; HttpOnly';
  return `${name}=${value}; Max-Age=${maxAgeSeconds}; Path=/; Secure; SameSite=Strict${httpOnly}`;
}

export function clearAdminCookie(
  name: typeof ADMIN_PREAUTH_COOKIE | typeof ADMIN_REFRESH_COOKIE | typeof ADMIN_CSRF_COOKIE,
): string {
  const httpOnly = name === ADMIN_CSRF_COOKIE ? '' : '; HttpOnly';
  return `${name}=; Max-Age=0; Path=/; Secure; SameSite=Strict${httpOnly}`;
}

export class AdminRequestPolicy {
  private readonly maxCookieBytes: number;
  private readonly maxCookiePairs: number;

  constructor(private readonly options: AdminRequestPolicyOptions) {
    if (!validHttpsOrigin(options.origin)) {
      throw new TypeError('Admin origin must be one exact HTTPS origin.');
    }
    this.maxCookieBytes = options.maxCookieBytes ?? 4096;
    this.maxCookiePairs = options.maxCookiePairs ?? 32;
  }

  assertExactOrigin(headers: AdminRequestHeaders): void {
    const origin = singleHeader(headers, 'origin');
    if (origin === undefined || !safeEqual(origin, this.options.origin)) {
      throw new AdminRequestPolicyError('FORBIDDEN');
    }
  }

  assertJson(headers: AdminRequestHeaders): void {
    if (singleHeader(headers, 'content-type') !== 'application/json') {
      throw new AdminRequestPolicyError('VALIDATION_ERROR');
    }
  }

  assertLoginRequest(headers: AdminRequestHeaders): void {
    this.assertExactOrigin(headers);
    this.assertJson(headers);
    if (singleHeader(headers, 'sec-fetch-site') !== 'same-origin') {
      throw new AdminRequestPolicyError('FORBIDDEN');
    }
  }

  assertMutationRequest(headers: AdminRequestHeaders, hasJsonBody: boolean): void {
    this.assertExactOrigin(headers);
    if (hasJsonBody) {
      this.assertJson(headers);
    }
  }

  async issueCsrfToken(context: AdminBrowserContext, contextToken: string): Promise<string> {
    if (!OPAQUE_COOKIE_PATTERN.test(contextToken)) {
      throw new AdminRequestPolicyError('AUTH_REQUIRED');
    }
    const nonce = randomBytes(16);
    const encodedNonce = nonce.toString('base64url');
    let digest: Uint8Array;
    try {
      digest = await this.options.keyProvider.keyedDigest(
        'ADMIN_CSRF_V1',
        Buffer.from(`${context}\0${contextToken}\0${encodedNonce}`, 'utf8'),
      );
    } catch {
      throw new AdminRequestPolicyError('SERVICE_UNAVAILABLE');
    }
    if (digest.byteLength !== 32) {
      throw new AdminRequestPolicyError('AUTH_REQUIRED');
    }
    return `v1.${encodedNonce}.${Buffer.from(digest).toString('base64url')}`;
  }

  async validateBrowserContext(
    headers: AdminRequestHeaders,
    context: AdminBrowserContext,
  ): Promise<ValidatedAdminBrowserContext> {
    const cookieHeader = singleHeader(headers, 'cookie');
    const csrfHeader = singleHeader(headers, ADMIN_CSRF_HEADER);
    if (cookieHeader === undefined || csrfHeader === undefined) {
      throw new AdminRequestPolicyError('AUTH_REQUIRED');
    }
    const cookies = parseAdminCookies(cookieHeader, this.maxCookieBytes, this.maxCookiePairs);
    const contextCookieName = context === 'PREAUTH' ? ADMIN_PREAUTH_COOKIE : ADMIN_REFRESH_COOKIE;
    const contextToken = cookies.get(contextCookieName);
    const csrfCookie = cookies.get(ADMIN_CSRF_COOKIE);
    if (
      contextToken === undefined ||
      csrfCookie === undefined ||
      !OPAQUE_COOKIE_PATTERN.test(contextToken) ||
      !CSRF_TOKEN_PATTERN.test(csrfCookie) ||
      !safeEqual(csrfCookie, csrfHeader)
    ) {
      throw new AdminRequestPolicyError('AUTH_REQUIRED');
    }
    const match = CSRF_TOKEN_PATTERN.exec(csrfCookie);
    if (match === null) {
      throw new AdminRequestPolicyError('AUTH_REQUIRED');
    }
    let digest: Uint8Array;
    try {
      digest = await this.options.keyProvider.keyedDigest(
        'ADMIN_CSRF_V1',
        Buffer.from(`${context}\0${contextToken}\0${match[1]}`, 'utf8'),
      );
    } catch {
      throw new AdminRequestPolicyError('SERVICE_UNAVAILABLE');
    }
    if (digest.byteLength !== 32) {
      throw new AdminRequestPolicyError('AUTH_REQUIRED');
    }
    const expected = `v1.${match[1]}.${Buffer.from(digest).toString('base64url')}`;
    if (!safeEqual(expected, csrfCookie)) {
      throw new AdminRequestPolicyError('AUTH_REQUIRED');
    }
    return { contextToken, csrfToken: csrfCookie };
  }
}
