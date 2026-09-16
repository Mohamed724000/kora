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
  directMembershipCount: number;
  ownedObjectCount: number;
  publicGrantCount: number;
  roleCanBypassRls: boolean;
  roleCanCreateDatabase: boolean;
  roleCanCreateRole: boolean;
  roleCanLogin: boolean;
  roleCanReplicate: boolean;
  roleInherits: boolean;
  roleIsSuperuser: boolean;
  routineExecutePrivilegeCount: number;
  sessionUser: string;
  tableCount: number;
  tablePrivilegeViolationCount: number;
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
      ), public_grants AS (
        SELECT 1
        FROM pg_catalog.pg_database AS database_entry
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
        ) AS privilege
        WHERE database_entry.datname = current_database() AND privilege.grantee = 0
        UNION ALL
        SELECT 1
        FROM pg_catalog.pg_namespace AS namespace_entry
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(namespace_entry.nspacl, pg_catalog.acldefault('n', namespace_entry.nspowner))
        ) AS privilege
        WHERE namespace_entry.nspname = 'public' AND privilege.grantee = 0
        UNION ALL
        SELECT 1
        FROM pg_catalog.pg_class AS relation_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry
          ON namespace_entry.oid = relation_entry.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(relation_entry.relacl, pg_catalog.acldefault('r', relation_entry.relowner))
        ) AS privilege
        WHERE namespace_entry.nspname = 'public'
          AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND privilege.grantee = 0
        UNION ALL
        SELECT 1
        FROM pg_catalog.pg_class AS sequence_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry
          ON namespace_entry.oid = sequence_entry.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(sequence_entry.relacl, pg_catalog.acldefault('s', sequence_entry.relowner))
        ) AS privilege
        WHERE namespace_entry.nspname = 'public'
          AND sequence_entry.relkind = 'S'
          AND privilege.grantee = 0
        UNION ALL
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_entry
        JOIN pg_catalog.pg_class AS relation_entry
          ON relation_entry.oid = attribute_entry.attrelid
        JOIN pg_catalog.pg_namespace AS namespace_entry
          ON namespace_entry.oid = relation_entry.relnamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
        WHERE namespace_entry.nspname = 'public'
          AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND attribute_entry.attnum > 0
          AND NOT attribute_entry.attisdropped
          AND privilege.grantee = 0
        UNION ALL
        SELECT 1
        FROM pg_catalog.pg_proc AS routine_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry
          ON namespace_entry.oid = routine_entry.pronamespace
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(routine_entry.proacl, pg_catalog.acldefault('f', routine_entry.proowner))
        ) AS privilege
        WHERE namespace_entry.nspname = 'public' AND privilege.grantee = 0
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
        pg_catalog.has_database_privilege(current_user, current_database(), 'CONNECT') AS "canConnect",
        pg_catalog.has_database_privilege(current_user, current_database(), 'CREATE') AS "canCreateDatabaseObjects",
        pg_catalog.has_database_privilege(current_user, current_database(), 'TEMPORARY') AS "canCreateTemporaryObjects",
        pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE') AS "canUseSchema",
        pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE') AS "canCreateSchemaObjects",
        (
          SELECT count(*)::integer
          FROM pg_catalog.pg_auth_members AS membership
          WHERE membership.member = runtime_role.oid
        ) AS "directMembershipCount",
        (
          SELECT count(*)::integer
          FROM (
            SELECT database_entry.oid
            FROM pg_catalog.pg_database AS database_entry
            WHERE database_entry.datname = current_database()
              AND database_entry.datdba = runtime_role.oid
            UNION ALL
            SELECT namespace_entry.oid
            FROM pg_catalog.pg_namespace AS namespace_entry
            WHERE namespace_entry.nspname = 'public'
              AND namespace_entry.nspowner = runtime_role.oid
            UNION ALL
            SELECT relation_entry.oid
            FROM pg_catalog.pg_class AS relation_entry
            JOIN pg_catalog.pg_namespace AS namespace_entry
              ON namespace_entry.oid = relation_entry.relnamespace
            WHERE namespace_entry.nspname = 'public'
              AND relation_entry.relowner = runtime_role.oid
            UNION ALL
            SELECT routine_entry.oid
            FROM pg_catalog.pg_proc AS routine_entry
            JOIN pg_catalog.pg_namespace AS namespace_entry
              ON namespace_entry.oid = routine_entry.pronamespace
            WHERE namespace_entry.nspname = 'public'
              AND routine_entry.proowner = runtime_role.oid
            UNION ALL
            SELECT type_entry.oid
            FROM pg_catalog.pg_type AS type_entry
            JOIN pg_catalog.pg_namespace AS namespace_entry
              ON namespace_entry.oid = type_entry.typnamespace
            WHERE namespace_entry.nspname = 'public'
              AND type_entry.typowner = runtime_role.oid
          ) AS owned_object
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
          JOIN pg_catalog.pg_namespace AS namespace_entry
            ON namespace_entry.oid = table_entry.relnamespace
          WHERE namespace_entry.nspname = 'public'
            AND table_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
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
        ) AS "tablePrivilegeViolationCount",
        (
          SELECT count(*)::integer
          FROM pg_catalog.pg_class AS sequence_entry
          JOIN pg_catalog.pg_namespace AS namespace_entry
            ON namespace_entry.oid = sequence_entry.relnamespace
          WHERE namespace_entry.nspname = 'public'
            AND sequence_entry.relkind = 'S'
            AND pg_catalog.has_sequence_privilege(
              current_user,
              sequence_entry.oid,
              'USAGE,SELECT,UPDATE'
            )
        ) AS "sequencePrivilegeCount",
        (
          SELECT count(*)::integer
          FROM pg_catalog.pg_proc AS routine_entry
          JOIN pg_catalog.pg_namespace AS namespace_entry
            ON namespace_entry.oid = routine_entry.pronamespace
          WHERE namespace_entry.nspname = 'public'
            AND pg_catalog.has_function_privilege(current_user, routine_entry.oid, 'EXECUTE')
        ) AS "routineExecutePrivilegeCount",
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
