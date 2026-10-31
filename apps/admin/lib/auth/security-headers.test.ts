import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { proxy } from '../../proxy';
import { applyAdminSecurityHeaders, createAdminCsp } from './security-headers';

describe('security headers C3', () => {
  const nonce = 'Abcdefghijklmnopqrstuv';

  it('produit une CSP fermée avec nonce et sans unsafe-inline pour les scripts', () => {
    const policy = createAdminCsp(nonce);

    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain(`script-src 'nonce-${nonce}' 'strict-dynamic'`);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/u);
  });

  it('refuse un nonce non canonique', () => {
    expect(() => createAdminCsp("bad'nonce")).toThrow('Nonce CSP invalide');
  });

  it('applique les protections navigateur sans cache', () => {
    const headers = new Headers();
    applyAdminSecurityHeaders(headers, nonce);

    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('referrer-policy')).toBe('no-referrer');
    expect(headers.get('permissions-policy')).not.toContain('*');
  });

  it('transmet à Next la même CSP nonce que celle livrée au navigateur', () => {
    const response = proxy(new NextRequest('https://admin.c3.invalid/login'));
    const browserPolicy = response.headers.get('content-security-policy');
    const nextPolicy = response.headers.get('x-middleware-request-content-security-policy');

    expect(browserPolicy).toMatch(/script-src 'nonce-[A-Za-z0-9_-]{22}' 'strict-dynamic'/u);
    expect(nextPolicy).toBe(browserPolicy);
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(
      /'nonce-([A-Za-z0-9_-]{22})'/u.exec(browserPolicy ?? '')?.[1],
    );
  });
});
