const NONCE_PATTERN = /^[A-Za-z0-9_-]{22}$/u;

export function createAdminCsp(nonce: string): string {
  if (!NONCE_PATTERN.test(nonce)) throw new Error('Nonce CSP invalide.');
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "worker-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ');
}

export function createCspNonce(source: Crypto = crypto): string {
  const bytes = new Uint8Array(16);
  source.getRandomValues(bytes);
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function applyAdminSecurityHeaders(headers: Headers, nonce: string): void {
  headers.set('Content-Security-Policy', createAdminCsp(nonce));
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=(), payment=(), usb=()');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Strict-Transport-Security', 'max-age=63072000');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive, noimageindex, nosnippet');
}
