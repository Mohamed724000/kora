import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';

export interface AdminWriterPostgresqlConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

interface AdminWriterRuntimeConfig {
  adminAuth: { postgresql: AdminWriterPostgresqlConfig };
  postgresql: AdminWriterPostgresqlConfig;
  readiness: { timeoutMs: number };
}

export interface AdminWriterTransaction {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[],
  ): Promise<QueryResult<Row>>;
}

export interface AdminWriterRuntimeBoundary {
  assertLeastPrivilege(): Promise<void>;
  selectOne(): Promise<void>;
  transaction<T>(callback: (transaction: AdminWriterTransaction) => Promise<T>): Promise<T>;
}

export interface AdminWriterBoundarySnapshot {
  canConnect: boolean;
  canCreateDatabaseObjects: boolean;
  canCreateSchemaObjects: boolean;
  canCreateTemporaryObjects: boolean;
  canUseSchema: boolean;
  columnPrivilegeMismatchCount: number;
  currentUser: string;
  defaultPrivilegeCount: number;
  directConnectPrivilegeCount: number;
  directMembershipCount: number;
  directSchemaUsagePrivilegeCount: number;
  grantOptionCount: number;
  largeObjectPrivilegeCount: number;
  largeObjectRoutineExecutePrivilegeCount: number;
  loCompatPrivilegesEnabled: boolean;
  ownedObjectCount: number;
  parameterPrivilegeCount: number;
  publicGrantCount: number;
  roleCanBypassRls: boolean;
  roleCanCreateDatabase: boolean;
  roleCanCreateRole: boolean;
  roleCanLogin: boolean;
  roleCanReplicate: boolean;
  roleInherits: boolean;
  roleIsSuperuser: boolean;
  routineExecutePrivilegeCount: number;
  sequencePrivilegeCount: number;
  sessionReplicationRole: string;
  sessionUser: string;
  tablePrivilegeCount: number;
  typePrivilegeCount: number;
  unexpectedSchemaPrivilegeCount: number;
}

type ColumnPrivilege = readonly [
  table: string,
  column: string,
  privilege: 'INSERT' | 'SELECT' | 'UPDATE',
];

const select = (table: string, columns: readonly string[]): ColumnPrivilege[] =>
  columns.map((column) => [table, column, 'SELECT'] as const);
const insert = (table: string, columns: readonly string[]): ColumnPrivilege[] =>
  columns.map((column) => [table, column, 'INSERT'] as const);
const update = (table: string, columns: readonly string[]): ColumnPrivilege[] =>
  columns.map((column) => [table, column, 'UPDATE'] as const);

const ADMIN_USER_SELECT = [
  'id',
  'email',
  'passwordHash',
  'role',
  'status',
  'authorizationVersion',
  'totpSecretEncrypted',
  'totpEnabledAt',
  'lastAcceptedTotpCounter',
  'createdAt',
] as const;
const ADMIN_USER_UPDATE = [
  'status',
  'authorizationVersion',
  'totpSecretEncrypted',
  'totpEnabledAt',
  'lastAcceptedTotpCounter',
] as const;
const ADMIN_SESSION_COLUMNS = [
  'id',
  'adminUserId',
  'tokenFamilyId',
  'accessTokenJti',
  'refreshTokenHash',
  'refreshTokenVersion',
  'lastTwoFactorAt',
  'lastActivityAt',
  'expiresAt',
  'absoluteExpiresAt',
  'authorizationVersion',
  'stepUpPurpose',
  'stepUpVerifiedAt',
  'stepUpExpiresAt',
  'revokedAt',
  'createdAt',
  'updatedAt',
] as const;
const ADMIN_SESSION_UPDATE = [
  'accessTokenJti',
  'refreshTokenHash',
  'refreshTokenVersion',
  'lastActivityAt',
  'expiresAt',
  'revokedAt',
  'updatedAt',
  'stepUpPurpose',
  'stepUpVerifiedAt',
  'stepUpExpiresAt',
] as const;
const RECOVERY_CODE_COLUMNS = [
  'id',
  'adminUserId',
  'batchId',
  'selector',
  'codeHash',
  'usedAt',
  'createdAt',
] as const;
const PRE_AUTH_COLUMNS = [
  'id',
  'adminUserId',
  'tokenHash',
  'purpose',
  'authorizationVersion',
  'expiresAt',
  'consumedAt',
  'revokedAt',
  'createdAt',
] as const;
const ENROLLMENT_COLUMNS = [
  'id',
  'adminUserId',
  'adminPreAuthContextId',
  'adminRecoveryContextId',
  'secretEncrypted',
  'authorizationVersion',
  'expiresAt',
  'qrDeliveredAt',
  'confirmedAt',
  'revokedAt',
  'createdAt',
] as const;
const RECOVERY_CONTEXT_COLUMNS = [
  'id',
  'adminUserId',
  'tokenHash',
  'recoveryCodeId',
  'authorizationVersion',
  'expiresAt',
  'consumedAt',
  'revokedAt',
  'createdAt',
] as const;
const REFRESH_TOKEN_COLUMNS = [
  'id',
  'adminUserId',
  'adminSessionId',
  'previousTokenId',
  'tokenHash',
  'generation',
  'expiresAt',
  'consumedAt',
  'createdAt',
] as const;
const RECOVERY_BATCH_COLUMNS = ['id', 'adminUserId', 'revokedAt', 'createdAt'] as const;
const IDEMPOTENCY_COLUMNS = [
  'id',
  'adminUserId',
  'operation',
  'idempotencyKey',
  'requestHash',
  'responseCode',
  'resourceType',
  'resourceId',
  'expiresAt',
  'createdAt',
] as const;
const AUDIT_INSERT_COLUMNS = [
  'id',
  'adminUserId',
  'subjectAdminUserId',
  'adminSessionId',
  'adminRecoveryContextId',
  'eventClass',
  'context',
  'action',
  'entityType',
  'entityId',
  'maskedBefore',
  'maskedAfter',
  'reason',
  'reasonCode',
  'operatorReason',
  'requestId',
  'createdAt',
] as const;
const SECURITY_EVENT_INSERT_COLUMNS = [
  'id',
  'adminUserId',
  'eventClass',
  'action',
  'outcome',
  'failureCode',
  'requestId',
  'subjectRefHash',
  'createdAt',
] as const;

export const ADMIN_WRITER_COLUMN_PRIVILEGES: readonly ColumnPrivilege[] = [
  ...select('AdminUser', ADMIN_USER_SELECT),
  ...update('AdminUser', ADMIN_USER_UPDATE),
  ...select('AdminSession', ADMIN_SESSION_COLUMNS),
  ...insert('AdminSession', ADMIN_SESSION_COLUMNS),
  ...update('AdminSession', ADMIN_SESSION_UPDATE),
  ...select('AdminRecoveryCode', RECOVERY_CODE_COLUMNS),
  ...insert('AdminRecoveryCode', RECOVERY_CODE_COLUMNS),
  ...update('AdminRecoveryCode', ['usedAt']),
  ...select('AdminPreAuthContext', PRE_AUTH_COLUMNS),
  ...insert('AdminPreAuthContext', PRE_AUTH_COLUMNS),
  ...update('AdminPreAuthContext', ['consumedAt', 'revokedAt']),
  ...select('AdminTotpEnrollment', ENROLLMENT_COLUMNS),
  ...insert('AdminTotpEnrollment', ENROLLMENT_COLUMNS),
  ...update('AdminTotpEnrollment', ['qrDeliveredAt', 'confirmedAt', 'revokedAt']),
  ...select('AdminRecoveryContext', RECOVERY_CONTEXT_COLUMNS),
  ...insert('AdminRecoveryContext', RECOVERY_CONTEXT_COLUMNS),
  ...update('AdminRecoveryContext', ['consumedAt', 'revokedAt']),
  ...select('AdminRefreshToken', REFRESH_TOKEN_COLUMNS),
  ...insert('AdminRefreshToken', REFRESH_TOKEN_COLUMNS),
  ...update('AdminRefreshToken', ['consumedAt']),
  ...select('AdminRecoveryCodeBatch', RECOVERY_BATCH_COLUMNS),
  ...insert('AdminRecoveryCodeBatch', RECOVERY_BATCH_COLUMNS),
  ...update('AdminRecoveryCodeBatch', ['revokedAt']),
  ...select('AdminIdempotencyRecord', IDEMPOTENCY_COLUMNS),
  ...insert('AdminIdempotencyRecord', IDEMPOTENCY_COLUMNS),
  ...insert('AuditLog', AUDIT_INSERT_COLUMNS),
  ...insert('AdminSecurityEvent', SECURITY_EVENT_INSERT_COLUMNS),
];

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

const EXPECTED_COLUMN_PRIVILEGES_SQL = ADMIN_WRITER_COLUMN_PRIVILEGES.map(
  ([table, column, privilege]) =>
    `(${sqlLiteral(table)}, ${sqlLiteral(column)}, ${sqlLiteral(privilege)})`,
).join(',\n        ');

const ADMIN_WRITER_BOUNDARY_SQL = `
  WITH writer_role AS (
    SELECT oid, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole,
           rolinherit, rolreplication, rolsuper
    FROM pg_catalog.pg_roles
    WHERE rolname = current_user
  ), expected_column_privileges(table_name, column_name, privilege_type) AS (
    VALUES ${EXPECTED_COLUMN_PRIVILEGES_SQL}
  ), actual_column_privileges AS (
    SELECT class_entry.relname AS table_name,
           attribute_entry.attname AS column_name,
           privilege.privilege_type
    FROM pg_catalog.pg_attribute AS attribute_entry
    JOIN pg_catalog.pg_class AS class_entry ON class_entry.oid = attribute_entry.attrelid
    JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = class_entry.relnamespace
    CROSS JOIN writer_role
    CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
    WHERE namespace_entry.nspname = 'public'
      AND class_entry.relkind IN ('r', 'p')
      AND attribute_entry.attnum > 0
      AND NOT attribute_entry.attisdropped
      AND privilege.grantee = writer_role.oid
  ), column_privilege_mismatches AS (
    (SELECT * FROM expected_column_privileges EXCEPT SELECT * FROM actual_column_privileges)
    UNION ALL
    (SELECT * FROM actual_column_privileges EXCEPT SELECT * FROM expected_column_privileges)
  ), non_system_schemas AS (
    SELECT oid, nspname
    FROM pg_catalog.pg_namespace
    WHERE nspname <> 'information_schema' AND nspname !~ '^pg_'
  ), current_database_entry AS (
    SELECT oid, datacl, datdba
    FROM pg_catalog.pg_database
    WHERE datname = current_database()
  ), large_object_routines AS (
    SELECT routine_entry.oid
    FROM pg_catalog.pg_proc AS routine_entry
    JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = routine_entry.pronamespace
    WHERE namespace_entry.nspname = 'pg_catalog'
      AND (routine_entry.proname ~ '^lo_' OR routine_entry.proname IN ('loread', 'lowrite'))
  )
  SELECT
    current_user AS "currentUser",
    session_user AS "sessionUser",
    writer_role.rolsuper AS "roleIsSuperuser",
    writer_role.rolcreaterole AS "roleCanCreateRole",
    writer_role.rolcreatedb AS "roleCanCreateDatabase",
    writer_role.rolreplication AS "roleCanReplicate",
    writer_role.rolbypassrls AS "roleCanBypassRls",
    writer_role.rolcanlogin AS "roleCanLogin",
    writer_role.rolinherit AS "roleInherits",
    pg_catalog.current_setting('session_replication_role') AS "sessionReplicationRole",
    pg_catalog.current_setting('lo_compat_privileges') = 'on' AS "loCompatPrivilegesEnabled",
    pg_catalog.has_database_privilege(current_user, current_database(), 'CONNECT') AS "canConnect",
    pg_catalog.has_database_privilege(current_user, current_database(), 'CREATE') AS "canCreateDatabaseObjects",
    pg_catalog.has_database_privilege(current_user, current_database(), 'TEMPORARY') AS "canCreateTemporaryObjects",
    pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE') AS "canUseSchema",
    pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE') AS "canCreateSchemaObjects",
    (SELECT count(*)::integer
       FROM current_database_entry AS database_entry
       CROSS JOIN writer_role
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
       ) AS privilege
       WHERE privilege.grantee = writer_role.oid
         AND privilege.privilege_type = 'CONNECT') AS "directConnectPrivilegeCount",
    (SELECT count(*)::integer
       FROM pg_catalog.pg_namespace AS namespace_entry
       CROSS JOIN writer_role
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(namespace_entry.nspacl, pg_catalog.acldefault('n', namespace_entry.nspowner))
       ) AS privilege
       WHERE namespace_entry.nspname = 'public'
         AND privilege.grantee = writer_role.oid
         AND privilege.privilege_type = 'USAGE') AS "directSchemaUsagePrivilegeCount",
    (SELECT count(*)::integer FROM column_privilege_mismatches) AS "columnPrivilegeMismatchCount",
    (SELECT count(*)::integer FROM pg_catalog.pg_auth_members AS membership
      WHERE membership.member = writer_role.oid
         OR membership.roleid = writer_role.oid) AS "directMembershipCount",
    (SELECT count(*)::integer
       FROM pg_catalog.pg_shdepend AS dependency
       WHERE dependency.refclassid = 'pg_catalog.pg_authid'::regclass
         AND dependency.refobjid = writer_role.oid
         AND dependency.deptype = 'o') AS "ownedObjectCount",
    (SELECT count(*)::integer FROM non_system_schemas AS namespace_entry
      WHERE namespace_entry.nspname <> 'public'
        AND pg_catalog.has_schema_privilege(current_user, namespace_entry.oid, 'USAGE,CREATE'))
      AS "unexpectedSchemaPrivilegeCount",
    (SELECT count(*)::integer
       FROM pg_catalog.pg_class AS class_entry
       JOIN non_system_schemas AS namespace_entry ON namespace_entry.oid = class_entry.relnamespace
       CROSS JOIN writer_role
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         COALESCE(class_entry.relacl, pg_catalog.acldefault('r', class_entry.relowner))
       ) AS privilege
       WHERE class_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND privilege.grantee = writer_role.oid) AS "tablePrivilegeCount",
    (SELECT count(*)::integer
       FROM pg_catalog.pg_class AS class_entry
       JOIN non_system_schemas AS namespace_entry ON namespace_entry.oid = class_entry.relnamespace
       WHERE class_entry.relkind = 'S'
         AND pg_catalog.has_sequence_privilege(current_user, class_entry.oid, 'USAGE,SELECT,UPDATE'))
      AS "sequencePrivilegeCount",
    (SELECT count(*)::integer
       FROM pg_catalog.pg_proc AS routine_entry
       JOIN non_system_schemas AS namespace_entry ON namespace_entry.oid = routine_entry.pronamespace
       WHERE pg_catalog.has_function_privilege(current_user, routine_entry.oid, 'EXECUTE'))
      AS "routineExecutePrivilegeCount",
    (SELECT count(*)::integer
       FROM pg_catalog.pg_type AS type_entry
       JOIN non_system_schemas AS namespace_entry ON namespace_entry.oid = type_entry.typnamespace
       LEFT JOIN pg_catalog.pg_class AS composite_entry ON composite_entry.oid = type_entry.typrelid
       WHERE type_entry.typisdefined AND type_entry.typelem = 0
         AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c')
         AND pg_catalog.has_type_privilege(current_user, type_entry.oid, 'USAGE'))
      AS "typePrivilegeCount",
    (SELECT count(*)::integer FROM pg_catalog.pg_largeobject_metadata AS large_object
      WHERE large_object.lomowner = writer_role.oid
         OR pg_catalog.has_largeobject_privilege(current_user, large_object.oid, 'SELECT,UPDATE'))
      AS "largeObjectPrivilegeCount",
    (SELECT count(*)::integer
       FROM large_object_routines AS routine_entry
       WHERE pg_catalog.has_function_privilege(current_user, routine_entry.oid, 'EXECUTE'))
      AS "largeObjectRoutineExecutePrivilegeCount",
    (SELECT count(*)::integer FROM pg_catalog.pg_parameter_acl AS parameter_acl
      WHERE pg_catalog.has_parameter_privilege(current_user, parameter_acl.parname, 'SET')
         OR pg_catalog.has_parameter_privilege(current_user, parameter_acl.parname, 'ALTER SYSTEM'))
      AS "parameterPrivilegeCount",
    (SELECT count(*)::integer
       FROM pg_catalog.pg_default_acl AS default_acl
       CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
       WHERE privilege.grantee IN (0, writer_role.oid)) AS "defaultPrivilegeCount",
    ((SELECT count(*) FROM actual_column_privileges AS privilege
       JOIN pg_catalog.pg_attribute AS attribute_entry
         ON attribute_entry.attname = privilege.column_name
       JOIN pg_catalog.pg_class AS class_entry
         ON class_entry.oid = attribute_entry.attrelid AND class_entry.relname = privilege.table_name
       CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS raw_privilege
       WHERE raw_privilege.grantee = writer_role.oid AND raw_privilege.is_grantable)
      + CASE WHEN pg_catalog.has_database_privilege(current_user, current_database(), 'CONNECT WITH GRANT OPTION') THEN 1 ELSE 0 END
      + CASE WHEN pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE WITH GRANT OPTION') THEN 1 ELSE 0 END
    )::integer AS "grantOptionCount",
    ((SELECT count(*)
        FROM current_database_entry AS database_entry
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
        ) AS privilege
       WHERE privilege.grantee = 0)
     + (SELECT count(*)
          FROM non_system_schemas AS namespace_entry
          JOIN pg_catalog.pg_namespace AS raw_namespace ON raw_namespace.oid = namespace_entry.oid
          CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(raw_namespace.nspacl, pg_catalog.acldefault('n', raw_namespace.nspowner))
          ) AS privilege
         WHERE privilege.grantee = 0)
     + (SELECT count(*)
          FROM pg_catalog.pg_class AS class_entry
          JOIN non_system_schemas AS namespace_entry ON namespace_entry.oid = class_entry.relnamespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(
              class_entry.relacl,
              pg_catalog.acldefault(
                CASE WHEN class_entry.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
                class_entry.relowner
              )
            )
          ) AS privilege
         WHERE class_entry.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
           AND privilege.grantee = 0)
     + (SELECT count(*)
          FROM pg_catalog.pg_attribute AS attribute_entry
          JOIN pg_catalog.pg_class AS class_entry ON class_entry.oid = attribute_entry.attrelid
          JOIN non_system_schemas AS namespace_entry ON namespace_entry.oid = class_entry.relnamespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
         WHERE attribute_entry.attnum > 0
           AND NOT attribute_entry.attisdropped
           AND privilege.grantee = 0)
     + (SELECT count(*)
          FROM pg_catalog.pg_proc AS routine_entry
          JOIN pg_catalog.pg_namespace AS namespace_entry
            ON namespace_entry.oid = routine_entry.pronamespace
          CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(routine_entry.proacl, pg_catalog.acldefault('f', routine_entry.proowner))
          ) AS privilege
         WHERE privilege.grantee = 0
           AND (
             (namespace_entry.nspname <> 'information_schema' AND namespace_entry.nspname !~ '^pg_')
             OR routine_entry.oid IN (SELECT oid FROM large_object_routines)
           ))
     + (SELECT count(*)
          FROM pg_catalog.pg_type AS type_entry
          JOIN non_system_schemas AS namespace_entry ON namespace_entry.oid = type_entry.typnamespace
          LEFT JOIN pg_catalog.pg_class AS composite_entry ON composite_entry.oid = type_entry.typrelid
          CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(type_entry.typacl, pg_catalog.acldefault('T', type_entry.typowner))
          ) AS privilege
         WHERE type_entry.typisdefined
           AND type_entry.typelem = 0
           AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c')
           AND privilege.grantee = 0)
     + (SELECT count(*)
          FROM pg_catalog.pg_largeobject_metadata AS large_object
          CROSS JOIN LATERAL pg_catalog.aclexplode(
            COALESCE(large_object.lomacl, pg_catalog.acldefault('L', large_object.lomowner))
          ) AS privilege
         WHERE privilege.grantee = 0)
     + (SELECT count(*)
          FROM pg_catalog.pg_parameter_acl AS parameter_acl
          CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_acl.paracl) AS privilege
         WHERE privilege.grantee = 0)
     + (SELECT count(*)
          FROM pg_catalog.pg_default_acl AS default_acl
          CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
         WHERE privilege.grantee = 0))::integer AS "publicGrantCount"
  FROM writer_role
`;

export class AdminWriterBoundaryError extends Error {
  constructor(readonly violations: readonly string[]) {
    super(`PostgreSQL admin writer boundary rejected: ${violations.join(', ')}`);
    this.name = 'AdminWriterBoundaryError';
  }
}

export class AdminWriterCommitUnknownError extends Error {
  constructor(cause: unknown) {
    super('PostgreSQL admin writer COMMIT result is unknown.', { cause });
    this.name = 'AdminWriterCommitUnknownError';
  }
}

export function adminWriterConfigurationViolations(
  reader: AdminWriterPostgresqlConfig,
  writer: AdminWriterPostgresqlConfig,
): string[] {
  const violations: string[] = [];
  if (
    reader.host !== writer.host ||
    reader.port !== writer.port ||
    reader.database !== writer.database ||
    reader.ssl !== writer.ssl
  ) {
    violations.push('writer_database_target_mismatch');
  }
  if (reader.user === writer.user) violations.push('writer_identity_not_distinct');
  if (reader.password === writer.password) violations.push('writer_secret_not_distinct');
  return violations;
}

export function adminWriterBoundaryViolations(
  snapshot: AdminWriterBoundarySnapshot,
  expectedUser: string,
): string[] {
  const violations: string[] = [];
  if (snapshot.currentUser !== expectedUser || snapshot.sessionUser !== expectedUser)
    violations.push('unexpected_identity');
  if (
    snapshot.roleIsSuperuser ||
    snapshot.roleCanCreateRole ||
    snapshot.roleCanCreateDatabase ||
    snapshot.roleCanReplicate ||
    snapshot.roleCanBypassRls
  )
    violations.push('administrative_role_attribute');
  if (!snapshot.roleCanLogin) violations.push('login_disabled');
  if (snapshot.roleInherits) violations.push('role_inheritance_enabled');
  if (snapshot.directMembershipCount !== 0) violations.push('role_membership_present');
  if (snapshot.ownedObjectCount !== 0) violations.push('writer_owns_database_object');
  if (snapshot.sessionReplicationRole !== 'origin')
    violations.push('unexpected_session_replication_role');
  if (snapshot.loCompatPrivilegesEnabled) violations.push('unsafe_large_object_compatibility_mode');
  if (!snapshot.canConnect || !snapshot.canUseSchema)
    violations.push('required_connection_privilege_missing');
  if (snapshot.directConnectPrivilegeCount !== 1 || snapshot.directSchemaUsagePrivilegeCount !== 1)
    violations.push('required_direct_privilege_missing');
  if (
    snapshot.canCreateDatabaseObjects ||
    snapshot.canCreateSchemaObjects ||
    snapshot.canCreateTemporaryObjects
  )
    violations.push('database_or_schema_creation_privilege');
  if (snapshot.unexpectedSchemaPrivilegeCount !== 0) violations.push('unexpected_schema_privilege');
  if (snapshot.tablePrivilegeCount !== 0 || snapshot.columnPrivilegeMismatchCount !== 0)
    violations.push('unexpected_column_privilege_matrix');
  if (snapshot.sequencePrivilegeCount !== 0) violations.push('unexpected_sequence_privilege');
  if (snapshot.routineExecutePrivilegeCount !== 0) violations.push('unexpected_routine_privilege');
  if (snapshot.typePrivilegeCount !== 0) violations.push('unexpected_type_privilege');
  if (snapshot.largeObjectPrivilegeCount !== 0)
    violations.push('unexpected_large_object_privilege');
  if (snapshot.largeObjectRoutineExecutePrivilegeCount !== 0)
    violations.push('unexpected_large_object_routine_privilege');
  if (snapshot.parameterPrivilegeCount !== 0) violations.push('unexpected_parameter_privilege');
  if (snapshot.defaultPrivilegeCount !== 0) violations.push('unexpected_default_privilege');
  if (snapshot.grantOptionCount !== 0) violations.push('unexpected_grant_option');
  if (snapshot.publicGrantCount !== 0) violations.push('public_privilege_present');
  return violations;
}

function poolOptions(config: AdminWriterPostgresqlConfig, timeoutMs: number): PoolConfig {
  return {
    application_name: 'kora-plus-api-admin-writer',
    connectionTimeoutMillis: timeoutMs,
    database: config.database,
    host: config.host,
    password: config.password,
    port: config.port,
    query_timeout: timeoutMs,
    statement_timeout: timeoutMs,
    user: config.user,
    ...(config.ssl ? { ssl: { rejectUnauthorized: true } } : {}),
  };
}

@Injectable()
export class AdminWriterService implements AdminWriterRuntimeBoundary, OnModuleDestroy {
  private readonly expectedUser: string;
  private readonly pool: Pool;

  constructor(@Inject(ConfigService) configService: ConfigService) {
    const reader = configService.getOrThrow<AdminWriterPostgresqlConfig>('postgresql');
    const adminAuth = configService.getOrThrow<AdminWriterRuntimeConfig['adminAuth']>('adminAuth');
    const readiness = configService.getOrThrow<AdminWriterRuntimeConfig['readiness']>('readiness');
    const violations = adminWriterConfigurationViolations(reader, adminAuth.postgresql);
    if (violations.length > 0) throw new AdminWriterBoundaryError(violations);
    this.expectedUser = adminAuth.postgresql.user;
    this.pool = new Pool(poolOptions(adminAuth.postgresql, readiness.timeoutMs));
    this.pool.on('error', () => undefined);
  }

  async selectOne(): Promise<void> {
    const result = await this.pool.query<{ value: number }>('SELECT 1 AS value');
    if (result.rows.length !== 1 || result.rows[0]?.value !== 1) {
      throw new Error('PostgreSQL admin writer connection check failed.');
    }
  }

  async assertLeastPrivilege(): Promise<void> {
    await this.selectOne();
    const result = await this.pool.query<AdminWriterBoundarySnapshot>(ADMIN_WRITER_BOUNDARY_SQL);
    if (result.rows.length !== 1 || result.rows[0] === undefined) {
      throw new AdminWriterBoundaryError(['privilege_inspection_failed']);
    }
    const violations = adminWriterBoundaryViolations(result.rows[0], this.expectedUser);
    if (violations.length > 0) throw new AdminWriterBoundaryError(violations);
  }

  async transaction<T>(callback: (transaction: AdminWriterTransaction) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    let commitAttempted = false;
    let commitConfirmed = false;
    let destroyClient = false;
    try {
      await client.query('BEGIN');
      const transaction: AdminWriterTransaction = {
        query: <Row extends QueryResultRow>(text: string, values: readonly unknown[]) =>
          client.query<Row>(text, [...values]),
      };
      const result = await callback(transaction);
      commitAttempted = true;
      await client.query('COMMIT');
      commitConfirmed = true;
      return result;
    } catch (error: unknown) {
      if (commitAttempted && !commitConfirmed) {
        throw new AdminWriterCommitUnknownError(error);
      }
      if (!commitAttempted) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError: unknown) {
          destroyClient = true;
          throw new AggregateError(
            [error, rollbackError],
            'Admin writer transaction and rollback failed.',
          );
        }
      }
      throw error;
    } finally {
      client.release(destroyClient || (commitAttempted && !commitConfirmed));
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
