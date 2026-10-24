import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolConfig, type QueryResult } from 'pg';
import {
  ADMIN_C2_TRANSACTION_BUDGETS,
  AdminC2TransactionService,
  type AdminC2PgClient,
  type AdminC2PgPool,
  type AdminC2Transaction,
} from './admin-c2-transaction.service';
import {
  ADMIN_C2B_DATABASE_USERS,
  ADMIN_C2B_PROFILE_DATABASE_ROLES,
  type AdminC2bDatabaseRole,
  type AdminC2bProcessProfile,
  type RuntimeConfig,
  type RuntimePostgresqlConfig,
} from '../config/runtime-config';

export class AdminC2bDisabledError extends Error {
  constructor() {
    super('Admin C2b database boundaries are disabled.');
    this.name = 'AdminC2bDisabledError';
  }
}

export class AdminC2bBoundaryError extends Error {
  constructor(readonly violations: readonly string[]) {
    super(`Admin C2b PostgreSQL boundary violation: ${violations.join(', ')}`);
    this.name = 'AdminC2bBoundaryError';
  }
}

type Privilege = 'INSERT' | 'SELECT' | 'UPDATE';
type ColumnAcl = readonly [relation: string, privilege: Privilege, columns: readonly string[]];

const API_COLUMN_ACL: readonly ColumnAcl[] = [
  [
    'AdminC2bAuditProjectionSource',
    'SELECT',
    [
      'version',
      'eventId',
      'action',
      'eventClass',
      'context',
      'actorAdminUserId',
      'subjectAdminUserId',
      'delegatedByAdminUserId',
      'adminSessionId',
      'adminRecoveryContextId',
      'systemExecutionRefHash',
      'entityType',
      'entityId',
      'maskedBefore',
      'maskedAfter',
      'reasonCode',
      'requestId',
      'causationEventId',
      'causationSecurityEventId',
      'createdAt',
      'outcome',
      'failureCode',
      'legacyReasonRedacted',
      'operatorReason',
      'operatorReasonRedacted',
      'outcomeProvenance',
    ],
  ],
  [
    'AdminAuditPaginationSnapshot',
    'SELECT',
    [
      'id',
      'principalAdminUserId',
      'operation',
      'filtersDigest',
      'projectionVersion',
      'entryCount',
      'utf8Bytes',
      'createdAt',
      'expiresAt',
    ],
  ],
  [
    'AdminAuditPaginationSnapshot',
    'INSERT',
    [
      'id',
      'principalAdminUserId',
      'operation',
      'filtersDigest',
      'projectionVersion',
      'entryCount',
      'utf8Bytes',
    ],
  ],
  [
    'AdminAuditPaginationSnapshotItem',
    'SELECT',
    ['snapshotId', 'ordinal', 'resourceId', 'sourceCreatedAt', 'projectionJson', 'utf8Bytes'],
  ],
  [
    'AdminAuditPaginationSnapshotItem',
    'INSERT',
    ['snapshotId', 'ordinal', 'resourceId', 'sourceCreatedAt', 'projectionJson', 'utf8Bytes'],
  ],
  [
    'AdminAuditExportIdempotencyRecord',
    'SELECT',
    [
      'id',
      'adminUserId',
      'operation',
      'idempotencyKey',
      'requestDigest',
      'responseCode',
      'exportId',
      'generation',
      'expiresAt',
      'createdAt',
    ],
  ],
  [
    'AdminAuditExportIdempotencyRecord',
    'INSERT',
    [
      'id',
      'adminUserId',
      'operation',
      'idempotencyKey',
      'requestDigest',
      'responseCode',
      'exportId',
    ],
  ],
  [
    'AdminAuditExport',
    'SELECT',
    [
      'id',
      'creatorAdminUserId',
      'snapshotId',
      'sourceAuditLogId',
      'state',
      'generation',
      'objectKey',
      'contentSha256',
      'signatureKeyId',
      'storageKeyId',
      'plaintextBytes',
      'failureCode',
      'createdAt',
      'readyAt',
      'expiresAt',
    ],
  ],
  ['AdminAuditExport', 'INSERT', ['id', 'creatorAdminUserId', 'snapshotId', 'sourceAuditLogId']],
  [
    'AdminAuditExportReadLease',
    'SELECT',
    [
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
    ],
  ],
  ['AdminAuditExportReadLease', 'INSERT', ['id', 'exportId', 'readerAdminUserId', 'ownerHash']],
  ['AdminAuditExportReadLease', 'UPDATE', ['expiresAt', 'lastHeartbeatAt', 'releasedAt']],
  [
    'AdminSecurityEvent',
    'INSERT',
    [
      'id',
      'adminUserId',
      'eventClass',
      'action',
      'outcome',
      'failureCode',
      'requestId',
      'subjectRefHash',
      'entityType',
      'entityId',
    ],
  ],
  [
    'AuditLog',
    'INSERT',
    [
      'id',
      'version',
      'adminUserId',
      'adminSessionId',
      'eventClass',
      'context',
      'outcome',
      'failureCode',
      'action',
      'entityType',
      'entityId',
      'reason',
      'reasonCode',
      'operatorReason',
      'requestId',
      'adminAuditExportId',
    ],
  ],
];

const WORKER_COLUMN_ACL: readonly ColumnAcl[] = [
  [
    'AdminAuditPaginationSnapshot',
    'SELECT',
    [
      'id',
      'principalAdminUserId',
      'operation',
      'filtersDigest',
      'projectionVersion',
      'entryCount',
      'utf8Bytes',
      'createdAt',
      'expiresAt',
    ],
  ],
  [
    'AdminAuditPaginationSnapshotItem',
    'SELECT',
    ['snapshotId', 'ordinal', 'resourceId', 'sourceCreatedAt', 'projectionJson', 'utf8Bytes'],
  ],
  [
    'AdminAuditExport',
    'SELECT',
    [
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
      'createdAt',
      'readyAt',
      'failedAt',
      'expiresAt',
      'expiredAt',
    ],
  ],
  [
    'AdminAuditExport',
    'UPDATE',
    [
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
      'readyAt',
      'failedAt',
      'expiresAt',
      'expiredAt',
    ],
  ],
  [
    'AdminAuditExportReadLease',
    'SELECT',
    [
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
    ],
  ],
  [
    'AuditLog',
    'INSERT',
    [
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
    ],
  ],
];

const EXPECTED_COLUMN_ACL: Readonly<Record<AdminC2bDatabaseRole, readonly ColumnAcl[]>> =
  Object.freeze({ auditApi: API_COLUMN_ACL, exportWorker: WORKER_COLUMN_ACL });
const EXPECTED_RELATION_ACL: Readonly<Record<AdminC2bDatabaseRole, readonly string[]>> =
  Object.freeze({
    auditApi: [
      'FUNCTION|kora_lock_admin_c2b_export_idempotency|EXECUTE',
      'FUNCTION|kora_lock_admin_c2b_export_lifecycle|EXECUTE',
      'FUNCTION|kora_lock_admin_c2b_principal|EXECUTE',
    ],
    exportWorker: [
      'FUNCTION|kora_lock_admin_c2b_export_lifecycle|EXECUTE',
      'TABLE|AdminAuditExportReadLease|DELETE',
      'TABLE|AdminAuditPaginationSnapshot|DELETE',
    ],
  });

function expectedAcl(role: AdminC2bDatabaseRole): string[] {
  const columns = EXPECTED_COLUMN_ACL[role].flatMap(([relation, privilege, names]) =>
    names.map((name) => `COLUMN|${relation}|${privilege}|${name}`),
  );
  return [...columns, ...EXPECTED_RELATION_ACL[role]].sort();
}

interface BoundarySnapshot {
  currentUser: string;
  sessionUser: string;
  roleIsSuperuser: boolean;
  roleCanCreateRole: boolean;
  roleCanCreateDatabase: boolean;
  roleCanReplicate: boolean;
  roleCanBypassRls: boolean;
  roleCanLogin: boolean;
  roleInherits: boolean;
  roleConnectionLimit: number;
  roleValidUntil: Date | null;
  roleConfigCount: number;
  transactionIsolation: string;
  directMembershipCount: number;
  ownedObjectCount: number;
  databaseCreate: boolean;
  databaseTemp: boolean;
  schemaCreate: boolean;
  rawAuditSelect: boolean;
  c2aSnapshotSelect: boolean;
  c2aIdempotencySelect: boolean;
}

interface AclRow {
  signature: string;
}

interface Queryable {
  query<T extends object>(text: string, values?: readonly unknown[]): Promise<QueryResult<T>>;
}

const IDENTITY_SQL = `
  SELECT
    current_user AS "currentUser",
    session_user AS "sessionUser",
    role_entry.rolsuper AS "roleIsSuperuser",
    role_entry.rolcreaterole AS "roleCanCreateRole",
    role_entry.rolcreatedb AS "roleCanCreateDatabase",
    role_entry.rolreplication AS "roleCanReplicate",
    role_entry.rolbypassrls AS "roleCanBypassRls",
    role_entry.rolcanlogin AS "roleCanLogin",
    role_entry.rolinherit AS "roleInherits",
    role_entry.rolconnlimit AS "roleConnectionLimit",
    role_entry.rolvaliduntil AS "roleValidUntil",
    COALESCE(cardinality(role_entry.rolconfig), 0) AS "roleConfigCount",
    current_setting('transaction_isolation') AS "transactionIsolation",
    (SELECT count(*)::integer FROM pg_catalog.pg_auth_members m
      WHERE m.member = role_entry.oid OR m.roleid = role_entry.oid) AS "directMembershipCount",
    ((SELECT count(*)::integer FROM pg_catalog.pg_class c WHERE c.relowner = role_entry.oid)
      + (SELECT count(*)::integer FROM pg_catalog.pg_proc p WHERE p.proowner = role_entry.oid)
      + (SELECT count(*)::integer FROM pg_catalog.pg_namespace n WHERE n.nspowner = role_entry.oid)
      + (SELECT count(*)::integer FROM pg_catalog.pg_type t WHERE t.typowner = role_entry.oid))
      AS "ownedObjectCount",
    has_database_privilege(current_user, current_database(), 'CREATE') AS "databaseCreate",
    has_database_privilege(current_user, current_database(), 'TEMP') AS "databaseTemp",
    has_schema_privilege(current_user, 'public', 'CREATE') AS "schemaCreate",
    has_table_privilege(current_user, 'public."AuditLog"', 'SELECT') AS "rawAuditSelect",
    has_table_privilege(current_user, 'public."AdminPaginationSnapshot"', 'SELECT')
      AS "c2aSnapshotSelect",
    has_table_privilege(current_user, 'public."AdminC2IdempotencyRecord"', 'SELECT')
      AS "c2aIdempotencySelect"
  FROM pg_catalog.pg_roles role_entry
  WHERE role_entry.rolname = current_user
`;

const ACL_SQL = `
  SELECT signature
  FROM (
    SELECT 'COLUMN|' || table_name || '|' || privilege_type || '|' || column_name AS signature
    FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND grantee = current_user
    UNION ALL
    SELECT 'TABLE|' || table_name || '|' || privilege_type AS signature
    FROM information_schema.table_privileges
    WHERE table_schema = 'public' AND grantee = current_user
    UNION ALL
    SELECT 'FUNCTION|' || routine_name || '|' || privilege_type AS signature
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' AND grantee = current_user
  ) acl
  ORDER BY signature
`;

function poolOptions(role: AdminC2bDatabaseRole, config: RuntimePostgresqlConfig): PoolConfig {
  return {
    application_name: `kora-plus-api-admin-c2b-${role}`,
    connectionTimeoutMillis: ADMIN_C2_TRANSACTION_BUDGETS.acquireMs,
    database: config.database,
    host: config.host,
    max: 1,
    password: config.password,
    port: config.port,
    user: config.user,
    ...(config.ssl ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}

export type AdminC2bPoolFactory = (
  role: AdminC2bDatabaseRole,
  config: RuntimePostgresqlConfig,
) => Pool;

export const ADMIN_C2B_POOL_FACTORY = Symbol('ADMIN_C2B_POOL_FACTORY');
export const createAdminC2bPgPool: AdminC2bPoolFactory = (role, config) =>
  new Pool(poolOptions(role, config));

function poolAdapter(pool: Pool): AdminC2PgPool {
  return { connect: async () => (await pool.connect()) as unknown as AdminC2PgClient };
}

@Injectable()
export class AdminC2bBoundariesService implements OnModuleDestroy {
  private readonly poolInstance?: Pool;
  private readonly executorInstance?: AdminC2TransactionService;
  private readonly role?: AdminC2bDatabaseRole;
  readonly enabled: boolean;
  readonly profile?: AdminC2bProcessProfile;

  constructor(
    @Inject(ConfigService) configService: ConfigService<RuntimeConfig, true>,
    @Inject(ADMIN_C2B_POOL_FACTORY) poolFactory: AdminC2bPoolFactory,
  ) {
    const config = configService.getOrThrow<RuntimeConfig['adminC2b']>('adminC2b');
    this.enabled = config.enabled;
    if (!config.enabled) return;
    this.profile = config.profile;
    this.role = ADMIN_C2B_PROFILE_DATABASE_ROLES[config.profile];
    this.poolInstance = poolFactory(this.role, config.pool);
    this.poolInstance.on('error', () => undefined);
    this.executorInstance = new AdminC2TransactionService(poolAdapter(this.poolInstance));
  }

  private activeRole(): AdminC2bDatabaseRole {
    if (this.role === undefined) throw new AdminC2bDisabledError();
    return this.role;
  }

  private pool(): Pool {
    if (this.poolInstance === undefined) throw new AdminC2bDisabledError();
    return this.poolInstance;
  }

  private executor(): AdminC2TransactionService {
    if (this.executorInstance === undefined) throw new AdminC2bDisabledError();
    return this.executorInstance;
  }

  private async assertQueryBoundary(queryable: Queryable): Promise<void> {
    const role = this.activeRole();
    const [identityResult, aclResult] = await Promise.all([
      queryable.query<BoundarySnapshot>(IDENTITY_SQL),
      queryable.query<AclRow>(ACL_SQL),
    ]);
    const identity = identityResult.rows[0];
    const violations: string[] = [];
    const expectedUser = ADMIN_C2B_DATABASE_USERS[role];
    if (identityResult.rows.length !== 1 || identity === undefined) {
      violations.push('identity_snapshot_unavailable');
    } else {
      if (identity.currentUser !== expectedUser || identity.sessionUser !== expectedUser) {
        violations.push('identity_mismatch');
      }
      if (
        identity.roleIsSuperuser ||
        identity.roleCanCreateRole ||
        identity.roleCanCreateDatabase ||
        identity.roleCanReplicate ||
        identity.roleCanBypassRls
      ) {
        violations.push('administrative_attribute');
      }
      if (
        !identity.roleCanLogin ||
        identity.roleInherits ||
        identity.roleConnectionLimit !== -1 ||
        identity.roleValidUntil !== null ||
        identity.roleConfigCount !== 0
      ) {
        violations.push('login_or_role_configuration');
      }
      if (identity.transactionIsolation !== 'read committed')
        violations.push('transaction_isolation');
      if (identity.directMembershipCount !== 0) violations.push('membership');
      if (identity.ownedObjectCount !== 0) violations.push('ownership');
      if (identity.databaseCreate || identity.databaseTemp || identity.schemaCreate) {
        violations.push('database_or_schema_capability');
      }
      if (identity.rawAuditSelect || identity.c2aSnapshotSelect || identity.c2aIdempotencySelect) {
        violations.push('cross_boundary_or_raw_audit_access');
      }
    }
    const actualAcl = aclResult.rows.map(({ signature }) => signature).sort();
    const requiredAcl = expectedAcl(role);
    if (
      actualAcl.length !== requiredAcl.length ||
      actualAcl.some((signature, index) => signature !== requiredAcl[index])
    ) {
      violations.push('direct_acl_shape');
    }
    if (violations.length > 0) throw new AdminC2bBoundaryError(violations);
  }

  async assertIdentity(): Promise<void> {
    await this.assertQueryBoundary(this.pool());
  }

  async transaction<T>(callback: (transaction: AdminC2Transaction) => Promise<T>): Promise<T> {
    return this.executor().transaction(async (transaction) => {
      await this.assertQueryBoundary(transaction as unknown as Queryable);
      return callback(transaction);
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.poolInstance !== undefined) await this.poolInstance.end();
  }
}
