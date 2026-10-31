import { describe, expect, it } from 'vitest';

import { safeAdminReturnTo } from './safe-return-to';

describe('safeAdminReturnTo', () => {
  it.each(['/', '/compte/securite'])('accepte la destination fermée %s', (value) => {
    expect(safeAdminReturnTo(value)).toBe(value);
  });

  it.each([
    'https://evil.invalid/',
    '//evil.invalid',
    '/api/v1/admin/auth/login',
    '/compte/%73ecurite',
    '/compte\\securite',
    '/inconnue',
    '/\u0000',
    null,
    undefined,
  ])('rabattre une destination ambiguë vers la racine', (value) => {
    expect(safeAdminReturnTo(value)).toBe('/');
  });
});
