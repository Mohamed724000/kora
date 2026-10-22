import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AdminKeyedDigestProvider } from '../admin-auth/admin-key-provider';
import { AdminSecurityPagination, AdminSecurityPaginationError } from './admin-security.pagination';

class DigestProvider implements AdminKeyedDigestProvider {
  async keyedDigest(domain: string, value: Uint8Array): Promise<Uint8Array> {
    return createHmac('sha256', 'test-only-pagination-key').update(domain).update(value).digest();
  }
}

const cursor = {
  expiresAt: '2030-01-01T00:00:00.000Z',
  filtersDigest: 'a'.repeat(64),
  nextOrdinal: 50,
  operation: 'LIST_ADMIN_USERS' as const,
  principalAdminUserId: '22222222-2222-4222-8222-222222222222',
  snapshotId: '11111111-1111-4111-8111-111111111111',
};

describe('AdminSecurityPagination', () => {
  it('binds a bounded cursor to principal, operation, filters and expiry', async () => {
    const pagination = new AdminSecurityPagination(new DigestProvider());
    const encoded = await pagination.issue(cursor);
    expect(encoded.length).toBeLessThanOrEqual(512);
    await expect(
      pagination.verify(
        encoded,
        {
          filtersDigest: cursor.filtersDigest,
          operation: cursor.operation,
          principalAdminUserId: cursor.principalAdminUserId,
        },
        new Date('2029-01-01T00:00:00.000Z'),
      ),
    ).resolves.toEqual(cursor);
  });

  it('rejects substitutions, tampering and expiry', async () => {
    const pagination = new AdminSecurityPagination(new DigestProvider());
    const encoded = await pagination.issue(cursor);
    await expect(
      pagination.verify(
        encoded,
        {
          filtersDigest: 'b'.repeat(64),
          operation: cursor.operation,
          principalAdminUserId: cursor.principalAdminUserId,
        },
        new Date('2029-01-01T00:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(AdminSecurityPaginationError);
    await expect(
      pagination.verify(
        `${encoded.slice(0, -1)}${encoded.endsWith('A') ? 'B' : 'A'}`,
        {
          filtersDigest: cursor.filtersDigest,
          operation: cursor.operation,
          principalAdminUserId: cursor.principalAdminUserId,
        },
        new Date('2029-01-01T00:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(AdminSecurityPaginationError);
    await expect(
      pagination.verify(
        encoded,
        {
          filtersDigest: cursor.filtersDigest,
          operation: cursor.operation,
          principalAdminUserId: cursor.principalAdminUserId,
        },
        new Date('2030-01-01T00:00:00.000Z'),
      ),
    ).rejects.toBeInstanceOf(AdminSecurityPaginationError);
  });
});
