import type { ConfigService } from '@nestjs/config';
import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { RuntimeConfig } from '../config/runtime-config';
import {
  AdminC2bBoundariesService,
  AdminC2bDisabledError,
  type AdminC2bPoolFactory,
} from './admin-c2b-boundaries.service';

function columnAcl(relation: string, privilege: string, columns: readonly string[]): string[] {
  return columns.map((column) => `COLUMN|${relation}|${privilege}|${column}`);
}

const WORKER_ACL = [
  ...columnAcl('AdminAuditPaginationSnapshot', 'SELECT', [
    'id',
    'principalAdminUserId',
    'operation',
    'filtersDigest',
    'projectionVersion',
    'entryCount',
    'utf8Bytes',
    'createdAt',
    'expiresAt',
  ]),
  ...columnAcl('AdminAuditPaginationSnapshotItem', 'SELECT', [
    'snapshotId',
    'ordinal',
    'resourceId',
    'sourceCreatedAt',
    'projectionJson',
    'utf8Bytes',
  ]),
  ...columnAcl('AdminAuditExport', 'SELECT', [
    'id',
    'creatorAdminUserId',
    'snapshotId',
    'sourceAuditLogId',
    'state',
    'generation',
    'attemptNumber',
    'attemptId',
    'claimOwnerHash',
    'attemptStartedAt',
    'attemptDeadline',
    'leaseExpiresAt',
    'nextAttemptAt',
    'stagingObjectKey',
    'objectKey',
    'contentSha256',
    'signatureKeyId',
    'storageKeyId',
    'plaintextBytes',
    'encryptedBytes',
    'failureCode',
    'lastTransitionRefHash',
    'createdAt',
    'readyAt',
    'failedAt',
    'expiresAt',
    'expiredAt',
  ]),
  ...columnAcl('AdminAuditExport', 'UPDATE', [
    'state',
    'generation',
    'attemptNumber',
    'attemptId',
    'claimOwnerHash',
    'attemptStartedAt',
    'attemptDeadline',
    'leaseExpiresAt',
    'nextAttemptAt',
    'stagingObjectKey',
    'objectKey',
    'contentSha256',
    'signatureKeyId',
    'storageKeyId',
    'plaintextBytes',
    'encryptedBytes',
    'failureCode',
    'lastTransitionRefHash',
    'readyAt',
    'failedAt',
    'expiresAt',
    'expiredAt',
  ]),
  ...columnAcl('AdminAuditExportReadLease', 'SELECT', [
    'id',
    'exportId',
    'exportGeneration',
    'readerAdminUserId',
    'ownerHash',
    'expiresAt',
    'maximumExpiresAt',
    'lastHeartbeatAt',
    'releasedAt',
    'createdAt',
  ]),
  ...columnAcl('AuditLog', 'INSERT', [
    'id',
    'version',
    'delegatedByAdminUserId',
    'eventClass',
    'context',
    'outcome',
    'failureCode',
    'action',
    'entityType',
    'entityId',
    'reason',
    'reasonCode',
    'requestId',
    'causationEventId',
    'systemExecutionRefHash',
    'adminAuditExportId',
  ]),
  'FUNCTION|kora_lock_admin_c2b_export_lifecycle|EXECUTE',
  'TABLE|AdminAuditExportReadLease|DELETE',
  'TABLE|AdminAuditPaginationSnapshot|DELETE',
].sort();

const WORKER_IDENTITY = {
  c2aIdempotencySelect: false,
  c2aSnapshotSelect: false,
  currentUser: 'kora_admin_c2b_export_worker',
  databaseCreate: false,
  databaseTemp: false,
  directMembershipCount: 0,
  ownedObjectCount: 0,
  rawAuditSelect: false,
  roleCanBypassRls: false,
  roleCanCreateDatabase: false,
  roleCanCreateRole: false,
  roleCanLogin: true,
  roleCanReplicate: false,
  roleConfigCount: 0,
  roleConnectionLimit: -1,
  roleInherits: false,
  roleIsSuperuser: false,
  roleValidUntil: null,
  schemaCreate: false,
  sessionUser: 'kora_admin_c2b_export_worker',
  transactionIsolation: 'read committed',
};

function workerBoundaries(signatures: readonly string[]): AdminC2bBoundariesService {
  const pool = {
    on: vi.fn(),
    query: vi.fn(async (sql: string) =>
      sql.includes('FROM pg_catalog.pg_roles')
        ? { rowCount: 1, rows: [WORKER_IDENTITY] }
        : { rowCount: signatures.length, rows: signatures.map((signature) => ({ signature })) },
    ),
  } as unknown as Pool;
  return new AdminC2bBoundariesService(
    config({
      enabled: true,
      profile: 'EXPORT_WORKER',
      pool: {
        database: 'kora_test',
        host: '127.0.0.1',
        password: 'separate-secret',
        port: 5432,
        ssl: false,
        user: 'kora_admin_c2b_export_worker',
      },
    }),
    vi.fn<AdminC2bPoolFactory>().mockReturnValue(pool),
  );
}

function config(adminC2b: RuntimeConfig['adminC2b']): ConfigService<RuntimeConfig, true> {
  return {
    getOrThrow: vi.fn().mockReturnValue(adminC2b),
  } as unknown as ConfigService<RuntimeConfig, true>;
}

describe('AdminC2bBoundariesService', () => {
  it('reste fail-closed lorsque C2b est désactivé', async () => {
    const poolFactory = vi.fn<AdminC2bPoolFactory>();
    const boundaries = new AdminC2bBoundariesService(config({ enabled: false }), poolFactory);

    expect(boundaries.enabled).toBe(false);
    expect(poolFactory).not.toHaveBeenCalled();
    await expect(boundaries.assertIdentity()).rejects.toBeInstanceOf(AdminC2bDisabledError);
  });

  it.each([
    ['HTTP', 'auditApi', 'kora_admin_c2b_audit_api'],
    ['EXPORT_WORKER', 'exportWorker', 'kora_admin_c2b_export_worker'],
  ] as const)('crée un seul pool pour %s', (profile, role, user) => {
    const pool = {
      on: vi.fn(),
    } as unknown as Pool;
    const poolFactory = vi.fn<AdminC2bPoolFactory>().mockReturnValue(pool);

    const boundaries = new AdminC2bBoundariesService(
      config({
        enabled: true,
        profile,
        pool: {
          database: 'kora_test',
          host: '127.0.0.1',
          password: 'separate-secret',
          port: 5432,
          ssl: false,
          user,
        },
      }),
      poolFactory,
    );

    expect(boundaries.enabled).toBe(true);
    expect(boundaries.profile).toBe(profile);
    expect(poolFactory).toHaveBeenCalledOnce();
    expect(poolFactory).toHaveBeenCalledWith(role, expect.objectContaining({ user }));
  });

  it('accepte uniquement la matrice worker exacte avec le marqueur durable', async () => {
    await expect(workerBoundaries(WORKER_ACL).assertIdentity()).resolves.toBeUndefined();
  });

  it.each([
    'COLUMN|AdminAuditExport|SELECT|lastTransitionRefHash',
    'COLUMN|AdminAuditExport|UPDATE|lastTransitionRefHash',
  ])('refuse la matrice worker privée de %s', async (missing) => {
    const boundaries = workerBoundaries(WORKER_ACL.filter((signature) => signature !== missing));
    await expect(boundaries.assertIdentity()).rejects.toMatchObject({
      violations: ['direct_acl_shape'],
    });
  });

  it('refuse tout privilège worker supplémentaire', async () => {
    const boundaries = workerBoundaries([...WORKER_ACL, 'TABLE|AdminAuditExport|SELECT']);
    await expect(boundaries.assertIdentity()).rejects.toMatchObject({
      violations: ['direct_acl_shape'],
    });
  });
});
