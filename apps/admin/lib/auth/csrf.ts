const ADMIN_CSRF_COOKIE = '__Host-kora_admin_csrf';
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u;
const COOKIE_VALUE = /^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/u;

export class CsrfCookieError extends Error {
  constructor() {
    super('Le contexte de sécurité du navigateur est invalide.');
    this.name = 'CsrfCookieError';
  }
}

export function readAdminCsrfCookie(cookieHeader: string): string {
  const matches: string[] = [];
  for (const rawPair of cookieHeader.split(';')) {
    const pair = rawPair.trim();
    if (pair === '') continue;
    const separator = pair.indexOf('=');
    if (separator <= 0) throw new CsrfCookieError();
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (!COOKIE_NAME.test(name) || !COOKIE_VALUE.test(value)) throw new CsrfCookieError();
    if (name === ADMIN_CSRF_COOKIE) matches.push(value);
  }
  if (matches.length !== 1 || !/^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/u.test(matches[0]!)) {
    throw new CsrfCookieError();
  }
  return matches[0]!;
}

export function browserAdminCsrfToken(): string {
  if (typeof document === 'undefined') throw new CsrfCookieError();
  return readAdminCsrfCookie(document.cookie);
}
