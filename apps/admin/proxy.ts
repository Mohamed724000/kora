import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  applyAdminSecurityHeaders,
  createAdminCsp,
  createCspNonce,
} from './lib/auth/security-headers';
import { safeAdminReturnTo } from './lib/auth/safe-return-to';

const REFRESH_COOKIE = '__Host-kora_admin_refresh';

function secured(response: NextResponse, nonce: string): NextResponse {
  applyAdminSecurityHeaders(response.headers, nonce);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function protectedPath(pathname: string): boolean {
  return pathname === '/' || pathname === '/acces-refuse' || pathname === '/compte/securite';
}

export function proxy(request: NextRequest): NextResponse {
  const nonce = createCspNonce();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('content-security-policy', createAdminCsp(nonce));
  requestHeaders.set('x-nonce', nonce);

  if (
    protectedPath(request.nextUrl.pathname) &&
    request.cookies.get(REFRESH_COOKIE) === undefined
  ) {
    const login = new URL('/login', process.env.ADMIN_ORIGIN);
    login.searchParams.set('returnTo', safeAdminReturnTo(request.nextUrl.pathname));
    return secured(NextResponse.redirect(login, 307), nonce);
  }

  return secured(
    NextResponse.next({
      request: { headers: requestHeaders },
    }),
    nonce,
  );
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
