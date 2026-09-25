import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool, type PoolConfig } from 'pg';
import type { RuntimeConfig } from '../config/runtime-config';

export interface RuntimeBoundarySnapshot {
  canConnect: boolean;
  canCreateDatabaseObjects: boolean;
  canCreateSchemaObjects: boolean;
  canCreateTemporaryObjects: boolean;
  canUseSchema: boolean;
  currentUser: string;
  defaultPrivilegeViolationCount: number;
  directMembershipCount: number;
  grantOptionViolationCount: number;
  largeObjectRoutineExecutePrivilegeCount: number;
  largeObjectPrivilegeCount: number;
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
  sessionReplicationRole: string;
  sessionUser: string;
  tableCount: number;
  tablePrivilegeViolationCount: number;
  typePrivilegeCount: number;
  unexpectedSchemaPrivilegeCount: number;
  sequencePrivilegeCount: number;
}

function poolOptions(
  postgresql: RuntimeConfig['postgresql'],
  readiness: RuntimeConfig['readiness'],
): PoolConfig {
  const options: PoolConfig = {
    application_name: 'kora-plus-api-prisma',
    connectionTimeoutMillis: readiness.timeoutMs,
    database: postgresql.database,
    host: postgresql.host,
    password: postgresql.password,
    port: postgresql.port,
    query_timeout: readiness.timeoutMs,
    statement_timeout: readiness.timeoutMs,
    user: postgresql.user,
  };

  if (postgresql.ssl) {
    options.ssl = { rejectUnauthorized: true };
  }

  return options;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationShutdown {
  private readonly pool: Pool;

  constructor(@Inject(ConfigService) configService: ConfigService<RuntimeConfig, true>) {
    const postgresql = configService.get('postgresql', { infer: true });
    const readiness = configService.get('readiness', { infer: true });
    const pool = new Pool(poolOptions(postgresql, readiness));
    pool.on('error', () => undefined);
    super({
      adapter: new PrismaPg(pool, {
        disposeExternalPool: false,
        schema: 'public',
      }),
    });
    this.pool = pool;
  }

  async selectOne(): Promise<void> {
    const rows = await this.$queryRaw<Array<{ value: number }>>`SELECT 1 AS value`;
    if (rows.length !== 1 || rows[0]?.value !== 1) {
      throw new Error('PostgreSQL runtime connection check failed.');
    }
  }

  async runtimeBoundarySnapshot(): Promise<RuntimeBoundarySnapshot> {
    const rows = await this.$queryRaw<RuntimeBoundarySnapshot[]>`
      WITH runtime_role AS (
        SELECT oid, rolbypassrls, rolcanlogin, rolcreatedb, rolcreaterole,
               rolinherit, rolreplication, rolsuper
        FROM pg_catalog.pg_roles
        WHERE rolname = current_user
      ), current_database_entry AS (
        SELECT oid, datdba
        FROM pg_catalog.pg_database
        WHERE datname = current_database()
      ), non_system_schemas AS (
        SELECT oid, nspacl, nspname, nspowner
        FROM pg_catalog.pg_namespace
        WHERE nspname <> 'information_schema'
          AND nspname !~ '^pg_'
      ), privilege_bearing_types AS (
        SELECT type_entry.oid, type_entry.typacl, type_entry.typname,
               type_entry.typnamespace, type_entry.typowner
        FROM pg_catalog.pg_type AS type_entry
        JOIN non_system_schemas AS namespace_entry
          ON namespace_entry.oid = type_entry.typnamespace
        LEFT JOIN pg_catalog.pg_class AS composite_entry
          ON composite_entry.oid = type_entry.typrelid
        WHERE type_entry.typisdefined
          AND type_entry.typelem = 0
          AND (
            type_entry.typrelid = 0
            OR composite_entry.relkind = 'c'
          )
      ), public_grants AS (
        SELECT 1
        FROM pg_catalog.pg_database AS database_entry
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
        ) AS privilege
        WHERE database_entry.datname = current_database() AND privilege.grantee = 0
        UNION ALL
        SELECT 1
        FROM non_system_schemas AS namespace_entry
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(namespace_entry.nspacl, pg_catalog.acldefault('n', namespace_entry.nspowner))
        ) AS privilege
        WHERE privilege.grantee = 0
        UNION ALL
        SELECT 1
        FROM pg_catalog.pg_class AS relation_entry
        JOIN non_system_schemas AS namespace_entry
          ON namespace_entry.oid = relation_entry.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(relation_entry.relacl, pg_catalog.acldefault('r', relation_entry.relowner))
        ) AS privilege
        WHERE relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND privilege.grantee = 0
        UNION ALL
        SELECT 1
        FROM pg_catalog.pg_class AS sequence_entry
        JOIN non_system_schemas AS namespace_entry
          ON namespace_entry.oid = sequence_entry.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(sequence_entry.relacl, pg_catalog.acldefault('s', sequence_entry.relowner))
        ) AS privilege
        WHERE sequence_entry.relkind = 'S'
          AND privilege.grantee = 0
        UNION ALL
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_entry
        JOIN pg_catalog.pg_class AS relation_entry
          ON relation_entry.oid = attribute_entry.attrelid
        JOIN non_system_schemas AS namespace_entry
          ON namespace_entry.oid = relation_entry.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
        WHERE relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND attribute_entry.attnum > 0
          AND NOT attribute_entry.attisdropped
          AND privilege.grantee = 0
        UNION ALL
        SELECT 1
        FROM pg_catalog.pg_proc AS routine_entry
        JOIN non_system_schemas AS namespace_entry
          ON namespace_entry.oid = routine_entry.pronamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(routine_entry.proacl, pg_catalog.acldefault('f', routine_entry.proowner))
        ) AS privilege
        WHERE privilege.grantee = 0
        UNION ALL
        SELECT 1
        FROM privilege_bearing_types AS type_entry
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(type_entry.typacl, pg_catalog.acldefault('T', type_entry.typowner))
        ) AS privilege
        WHERE privilege.grantee = 0
        UNION ALL
        SELECT 1
        FROM pg_catalog.pg_largeobject_metadata AS large_object
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            large_object.lomacl,
            pg_catalog.acldefault('L', large_object.lomowner)
          )
        ) AS privilege
        WHERE privilege.grantee = 0
        UNION ALL
        SELECT 1
        FROM pg_catalog.pg_default_acl AS default_acl
        LEFT JOIN non_system_schemas AS namespace_entry
          ON namespace_entry.oid = default_acl.defaclnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
        WHERE privilege.grantee = 0
          AND (
            default_acl.defaclnamespace = 0
            OR namespace_entry.oid IS NOT NULL
          )
        UNION ALL
        SELECT 1
        FROM pg_catalog.pg_parameter_acl AS parameter_acl
        CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_acl.paracl) AS privilege
        WHERE privilege.grantee = 0
      ), default_privilege_violations AS (
        SELECT 1
        FROM pg_catalog.pg_default_acl AS default_acl
        LEFT JOIN non_system_schemas AS namespace_entry
          ON namespace_entry.oid = default_acl.defaclnamespace
        CROSS JOIN runtime_role
        CROSS JOIN current_database_entry
        CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
        WHERE (
            default_acl.defaclnamespace = 0
            OR namespace_entry.oid IS NOT NULL
          )
          AND privilege.grantee IN (0, runtime_role.oid)
          AND NOT (
            privilege.grantee = runtime_role.oid
            AND default_acl.defaclobjtype = 'r'
            AND default_acl.defaclrole = current_database_entry.datdba
            AND namespace_entry.nspname = 'public'
            AND privilege.privilege_type = 'SELECT'
            AND NOT privilege.is_grantable
          )
      ), grant_option_violations AS (
        SELECT 1
        FROM pg_catalog.pg_database AS database_entry
        CROSS JOIN runtime_role
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
        ) AS privilege
        WHERE database_entry.datname = current_database()
          AND privilege.grantee = runtime_role.oid
          AND privilege.is_grantable
        UNION ALL
        SELECT 1
        FROM non_system_schemas AS namespace_entry
        CROSS JOIN runtime_role
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(namespace_entry.nspacl, pg_catalog.acldefault('n', namespace_entry.nspowner))
        ) AS privilege
        WHERE privilege.grantee = runtime_role.oid
          AND privilege.is_grantable
        UNION ALL
        SELECT 1
        FROM pg_catalog.pg_class AS relation_entry
        JOIN non_system_schemas AS namespace_entry
          ON namespace_entry.oid = relation_entry.relnamespace
        CROSS JOIN runtime_role
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            relation_entry.relacl,
            pg_catalog.acldefault(
              (CASE WHEN relation_entry.relkind = 'S' THEN 's' ELSE 'r' END)::"char",
              relation_entry.relowner
            )
          )
        ) AS privilege
        WHERE relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
          AND privilege.grantee = runtime_role.oid
          AND privilege.is_grantable
        UNION ALL
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_entry
        JOIN pg_catalog.pg_class AS relation_entry
          ON relation_entry.oid = attribute_entry.attrelid
        JOIN non_system_schemas AS namespace_entry
          ON namespace_entry.oid = relation_entry.relnamespace
        CROSS JOIN runtime_role
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
        WHERE relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND attribute_entry.attnum > 0
          AND NOT attribute_entry.attisdropped
          AND privilege.grantee = runtime_role.oid
          AND privilege.is_grantable
        UNION ALL
        SELECT 1
        FROM pg_catalog.pg_proc AS routine_entry
        JOIN non_system_schemas AS namespace_entry
          ON namespace_entry.oid = routine_entry.pronamespace
        CROSS JOIN runtime_role
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(routine_entry.proacl, pg_catalog.acldefault('f', routine_entry.proowner))
        ) AS privilege
        WHERE privilege.grantee = runtime_role.oid
          AND privilege.is_grantable
        UNION ALL
        SELECT 1
        FROM privilege_bearing_types AS type_entry
        CROSS JOIN runtime_role
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(type_entry.typacl, pg_catalog.acldefault('T', type_entry.typowner))
        ) AS privilege
        WHERE privilege.grantee = runtime_role.oid
          AND privilege.is_grantable
        UNION ALL
        SELECT 1
        FROM pg_catalog.pg_largeobject_metadata AS large_object
        CROSS JOIN runtime_role
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(
            large_object.lomacl,
            pg_catalog.acldefault('L', large_object.lomowner)
          )
        ) AS privilege
        WHERE privilege.grantee = runtime_role.oid
          AND privilege.is_grantable
        UNION ALL
        SELECT 1
        FROM pg_catalog.pg_default_acl AS default_acl
        LEFT JOIN non_system_schemas AS namespace_entry
          ON namespace_entry.oid = default_acl.defaclnamespace
        CROSS JOIN runtime_role
        CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
        WHERE (
            default_acl.defaclnamespace = 0
            OR namespace_entry.oid IS NOT NULL
          )
          AND privilege.grantee = runtime_role.oid
          AND privilege.is_grantable
        UNION ALL
        SELECT 1
        FROM pg_catalog.pg_parameter_acl AS parameter_acl
        CROSS JOIN runtime_role
        CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_acl.paracl) AS privilege
        WHERE privilege.grantee = runtime_role.oid
          AND privilege.is_grantable
      )
      SELECT
        current_user AS "currentUser",
        session_user AS "sessionUser",
        runtime_role.rolsuper AS "roleIsSuperuser",
        runtime_role.rolcreaterole AS "roleCanCreateRole",
        runtime_role.rolcreatedb AS "roleCanCreateDatabase",
        runtime_role.rolreplication AS "roleCanReplicate",
        runtime_role.rolbypassrls AS "roleCanBypassRls",
        runtime_role.rolcanlogin AS "roleCanLogin",
        runtime_role.rolinherit AS "roleInherits",
        pg_catalog.current_setting('session_replication_role') AS "sessionReplicationRole",
        pg_catalog.current_setting('lo_compat_privileges') = 'on' AS "loCompatPrivilegesEnabled",
        pg_catalog.has_database_privilege(current_user, current_database(), 'CONNECT') AS "canConnect",
        pg_catalog.has_database_privilege(current_user, current_database(), 'CREATE') AS "canCreateDatabaseObjects",
        pg_catalog.has_database_privilege(current_user, current_database(), 'TEMPORARY') AS "canCreateTemporaryObjects",
        pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE') AS "canUseSchema",
        pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE') AS "canCreateSchemaObjects",
        (
          SELECT count(*)::integer
          FROM non_system_schemas AS namespace_entry
          WHERE namespace_entry.nspname <> 'public'
            AND pg_catalog.has_schema_privilege(
              current_user,
              namespace_entry.oid,
              'USAGE,CREATE'
            )
        ) AS "unexpectedSchemaPrivilegeCount",
        (
          SELECT count(*)::integer
          FROM pg_catalog.pg_auth_members AS membership
          WHERE membership.member = runtime_role.oid
        ) AS "directMembershipCount",
        (
          SELECT count(*)::integer
          FROM pg_catalog.pg_shdepend AS dependency
          CROSS JOIN runtime_role
          CROSS JOIN current_database_entry
          WHERE dependency.refclassid = 'pg_catalog.pg_authid'::regclass
            AND dependency.refobjid = runtime_role.oid
            AND dependency.deptype = 'o'
            AND (
              dependency.dbid = current_database_entry.oid
              OR (
                dependency.dbid = 0
                AND dependency.classid = 'pg_catalog.pg_database'::regclass
                AND dependency.objid = current_database_entry.oid
              )
            )
        ) AS "ownedObjectCount",
        (
          SELECT count(*)::integer
          FROM pg_catalog.pg_class AS table_entry
          JOIN pg_catalog.pg_namespace AS namespace_entry
            ON namespace_entry.oid = table_entry.relnamespace
          WHERE namespace_entry.nspname = 'public' AND table_entry.relkind IN ('r', 'p')
        ) AS "tableCount",
        (
          SELECT count(*)::integer
          FROM pg_catalog.pg_class AS table_entry
          JOIN non_system_schemas AS namespace_entry
            ON namespace_entry.oid = table_entry.relnamespace
          WHERE table_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
            AND (
              (
                namespace_entry.nspname = 'public'
                AND (
                  NOT pg_catalog.has_table_privilege(current_user, table_entry.oid, 'SELECT')
                  OR pg_catalog.has_table_privilege(
                    current_user,
                    table_entry.oid,
                    'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
                  )
                  OR pg_catalog.has_any_column_privilege(
                    current_user,
                    table_entry.oid,
                    'INSERT,UPDATE,REFERENCES'
                  )
                )
              )
              OR (
                namespace_entry.nspname <> 'public'
                AND (
                  pg_catalog.has_table_privilege(
                    current_user,
                    table_entry.oid,
                    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
                  )
                  OR pg_catalog.has_any_column_privilege(
                    current_user,
                    table_entry.oid,
                    'SELECT,INSERT,UPDATE,REFERENCES'
                  )
                )
              )
            )
        ) AS "tablePrivilegeViolationCount",
        (
          SELECT count(*)::integer
          FROM pg_catalog.pg_class AS sequence_entry
          JOIN non_system_schemas AS namespace_entry
            ON namespace_entry.oid = sequence_entry.relnamespace
          WHERE sequence_entry.relkind = 'S'
            AND pg_catalog.has_sequence_privilege(
              current_user,
              sequence_entry.oid,
              'USAGE,SELECT,UPDATE'
            )
        ) AS "sequencePrivilegeCount",
        (
          SELECT count(*)::integer
          FROM pg_catalog.pg_proc AS routine_entry
          JOIN non_system_schemas AS namespace_entry
            ON namespace_entry.oid = routine_entry.pronamespace
          WHERE pg_catalog.has_function_privilege(current_user, routine_entry.oid, 'EXECUTE')
        ) AS "routineExecutePrivilegeCount",
        (
          SELECT count(*)::integer
          FROM privilege_bearing_types AS type_entry
          WHERE pg_catalog.has_type_privilege(current_user, type_entry.oid, 'USAGE')
        ) AS "typePrivilegeCount",
        (
          SELECT count(*)::integer
          FROM pg_catalog.pg_largeobject_metadata AS large_object
          WHERE large_object.lomowner = runtime_role.oid
            OR pg_catalog.has_largeobject_privilege(
              current_user,
              large_object.oid,
              'SELECT,UPDATE'
            )
        ) AS "largeObjectPrivilegeCount",
        (
          SELECT count(*)::integer
          FROM pg_catalog.pg_proc AS routine_entry
          JOIN pg_catalog.pg_namespace AS namespace_entry
            ON namespace_entry.oid = routine_entry.pronamespace
          WHERE namespace_entry.nspname = 'pg_catalog'
            AND (
              routine_entry.proname ~ '^lo_'
              OR routine_entry.proname IN ('loread', 'lowrite')
            )
            AND pg_catalog.has_function_privilege(
              current_user,
              routine_entry.oid,
              'EXECUTE'
            )
        ) AS "largeObjectRoutineExecutePrivilegeCount",
        (
          SELECT count(*)::integer
          FROM pg_catalog.pg_parameter_acl AS parameter_acl
          WHERE pg_catalog.has_parameter_privilege(current_user, parameter_acl.parname, 'SET')
            OR pg_catalog.has_parameter_privilege(
              current_user,
              parameter_acl.parname,
              'ALTER SYSTEM'
            )
        ) AS "parameterPrivilegeCount",
        (
          SELECT count(*)::integer
          FROM default_privilege_violations
        ) AS "defaultPrivilegeViolationCount",
        (
          SELECT count(*)::integer
          FROM grant_option_violations
        ) AS "grantOptionViolationCount",
        (SELECT count(*)::integer FROM public_grants) AS "publicGrantCount"
      FROM runtime_role
    `;

    if (rows.length !== 1 || rows[0] === undefined) {
      throw new Error('PostgreSQL runtime privilege inspection failed.');
    }

    return rows[0];
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}
