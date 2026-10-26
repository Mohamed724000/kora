import { timingSafeEqual } from 'node:crypto';
import type { AdminKeyedDigestProvider } from '../admin-auth/admin-key-provider';

export const ADMIN_SECURITY_PAGINATION = Symbol('ADMIN_SECURITY_PAGINATION');

export type AdminSnapshotOperation =
  'LIST_ADMIN_RECOVERY_CASES' | 'LIST_ADMIN_USERS' | 'LIST_ADMIN_AUDIT_LOGS';

export interface AdminSnapshotCursor {
  readonly expiresAt: string;
  readonly filtersDigest: string;
  readonly nextOrdinal: number;
  readonly operation: AdminSnapshotOperation;
  readonly principalAdminUserId: string;
  readonly snapshotId: string;
}

interface CursorEnvelopeV1 extends AdminSnapshotCursor {
  readonly signature: string;
  readonly version: 1;
}

export class AdminSecurityPaginationError extends Error {
  constructor() {
    super('Admin C2a pagination cursor is invalid.');
    this.name = 'AdminSecurityPaginationError';
  }
}

function exactRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AdminSecurityPaginationError();
  }
  const record = value as Record<string, unknown>;
  const expected = [
    'expiresAt',
    'filtersDigest',
    'nextOrdinal',
    'operation',
    'principalAdminUserId',
    'signature',
    'snapshotId',
    'version',
  ].sort();
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(expected)) {
    throw new AdminSecurityPaginationError();
  }
  return record;
}

function unsigned(cursor: AdminSnapshotCursor): Buffer {
  return Buffer.from(
    [
      'KORA_ADMIN_C2_CURSOR_V1',
      cursor.snapshotId,
      String(cursor.nextOrdinal),
      cursor.principalAdminUserId,
      cursor.operation,
      cursor.filtersDigest,
      cursor.expiresAt,
    ].join('\0'),
    'utf8',
  );
}

function decodeCursor(value: string): Record<string, unknown> {
  if (value.length < 1 || value.length > 512 || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new AdminSecurityPaginationError();
  }
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.toString('base64url') !== value || bytes.byteLength > 384) {
    throw new AdminSecurityPaginationError();
  }
  try {
    return exactRecord(JSON.parse(bytes.toString('utf8')));
  } catch (error: unknown) {
    if (error instanceof AdminSecurityPaginationError) throw error;
    throw new AdminSecurityPaginationError();
  }
}

export class AdminSecurityPagination {
  constructor(private readonly digestProvider: AdminKeyedDigestProvider) {}

  async issue(cursor: AdminSnapshotCursor): Promise<string> {
    this.assertShape(cursor);
    const signature = await this.signature(cursor);
    const envelope: CursorEnvelopeV1 = { ...cursor, signature, version: 1 };
    const encoded = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url');
    if (encoded.length > 512) throw new AdminSecurityPaginationError();
    return encoded;
  }

  async verify(
    value: string,
    expected: Readonly<{
      filtersDigest: string;
      operation: AdminSnapshotOperation;
      principalAdminUserId: string;
    }>,
    now = new Date(),
  ): Promise<AdminSnapshotCursor> {
    const record = decodeCursor(value);
    const cursor: AdminSnapshotCursor = {
      expiresAt: String(record.expiresAt),
      filtersDigest: String(record.filtersDigest),
      nextOrdinal: Number(record.nextOrdinal),
      operation: record.operation as AdminSnapshotOperation,
      principalAdminUserId: String(record.principalAdminUserId),
      snapshotId: String(record.snapshotId),
    };
    this.assertShape(cursor);
    if (
      record.version !== 1 ||
      typeof record.signature !== 'string' ||
      cursor.filtersDigest !== expected.filtersDigest ||
      cursor.operation !== expected.operation ||
      cursor.principalAdminUserId !== expected.principalAdminUserId ||
      new Date(cursor.expiresAt).getTime() <= now.getTime()
    ) {
      throw new AdminSecurityPaginationError();
    }
    const actual = Buffer.from(await this.signature(cursor), 'ascii');
    const claimed = Buffer.from(record.signature, 'ascii');
    if (actual.byteLength !== claimed.byteLength || !timingSafeEqual(actual, claimed)) {
      throw new AdminSecurityPaginationError();
    }
    return cursor;
  }

  private async signature(cursor: AdminSnapshotCursor): Promise<string> {
    const digest = await this.digestProvider.keyedDigest('ADMIN_C2_CURSOR_V1', unsigned(cursor));
    if (digest.byteLength !== 32) throw new AdminSecurityPaginationError();
    return Buffer.from(digest).toString('base64url');
  }

  private assertShape(cursor: AdminSnapshotCursor): void {
    if (
      !/^[0-9a-f-]{36}$/iu.test(cursor.snapshotId) ||
      !/^[0-9a-f-]{36}$/iu.test(cursor.principalAdminUserId) ||
      !/^[a-f0-9]{64}$/u.test(cursor.filtersDigest) ||
      !['LIST_ADMIN_RECOVERY_CASES', 'LIST_ADMIN_USERS', 'LIST_ADMIN_AUDIT_LOGS'].includes(
        cursor.operation,
      ) ||
      !Number.isSafeInteger(cursor.nextOrdinal) ||
      cursor.nextOrdinal < 0 ||
      !Number.isFinite(new Date(cursor.expiresAt).getTime())
    ) {
      throw new AdminSecurityPaginationError();
    }
  }
}
