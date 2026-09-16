import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';

const { Client, Pool } = pg;
const prismaDirectory = dirname(fileURLToPath(import.meta.url));
const apiDirectory = resolve(prismaDirectory, '..');
const repositoryRoot = resolve(apiDirectory, '..', '..');
const prismaEntry = resolve(repositoryRoot, 'node_modules', 'prisma', 'build', 'index.js');
const SAFE_IDENTIFIER = /^kora_s1203a_(?:database|owner|runtime)_[ab]_[a-f0-9]{8}$/u;

function fail(message) {
  throw new Error(`S1.2-03A runtime boundary validation failed: ${message}`);
}

function quoteIdentifier(value) {
  if (!SAFE_IDENTIFIER.test(value)) {
    fail('a generated PostgreSQL identifier failed its destructive-operation guard');
  }
  return `"${value}"`;
}

function quoteSecret(value) {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) {
    fail('a generated PostgreSQL secret failed its in-memory format guard');
  }
  return `'${value}'`;
}

function normalizedOutput(value, secrets) {
  let normalized = value
    .replaceAll(repositoryRoot.split(sep).join('/'), '<repository>')
    .replaceAll(repositoryRoot, '<repository>')
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, '<redacted-database-url>');
  for (const secret of secrets) {
    normalized = normalized.replaceAll(secret, '<redacted-secret>');
  }
  return normalized;
}

function runPrisma(argumentsList, environment, secrets) {
  const result = spawnSync(process.execPath, [prismaEntry, ...argumentsList], {
    cwd: apiDirectory,
    encoding: 'utf8',
    env: environment,
    windowsHide: true,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stdout = normalizedOutput(result.stdout ?? '', secrets);
    const stderr = normalizedOutput(result.stderr ?? '', secrets);
    fail(`Prisma ${argumentsList.join(' ')} exited ${result.status}.\n${stdout}${stderr}`);
  }
}

function validationContainer() {
  const container = process.env.S1203A_VALIDATION_CONTAINER;
  if (!/^kora-s1203a-validation-[0-9]+-[0-9a-f]{8}$/u.test(container ?? '')) {
    fail('the validation container name failed its execution guard');
  }
  return container;
}

function runProvisioner(database, owner, runtime, secrets) {
  const result = spawnSync(
    'docker',
    [
      'exec',
      '--env',
      `POSTGRES_DB=${database}`,
      '--env',
      `POSTGRES_USER=${owner}`,
      '--env',
      `KORA_POSTGRES_RUNTIME_USER=${runtime}`,
      validationContainer(),
      'sh',
      '/usr/local/bin/kora-provision-postgresql-runtime.sh',
    ],
    { encoding: 'utf8', shell: false, windowsHide: true },
  );
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stdout = normalizedOutput(result.stdout ?? '', secrets);
    const stderr = normalizedOutput(result.stderr ?? '', secrets);
    fail(`the delivered provisioner exited ${result.status}.\n${stdout}${stderr}`);
  }
}

function adminConfiguration() {
  return {
    database: process.env.S1203A_ADMIN_DATABASE,
    host: process.env.S1203A_ADMIN_HOST,
    password: process.env.S1203A_ADMIN_PASSWORD,
    port: Number(process.env.S1203A_ADMIN_PORT),
    user: process.env.S1203A_ADMIN_USER,
  };
}

function databaseConfiguration(database, user, password) {
  const admin = adminConfiguration();
  return {
    database,
    host: admin.host,
    password,
    port: admin.port,
    user,
  };
}

function prismaEnvironment(database, owner, password) {
  const admin = adminConfiguration();
  return {
    ...process.env,
    DATABASE_HOST: admin.host,
    DATABASE_NAME: database,
    DATABASE_PASSWORD: password,
    DATABASE_PORT: String(admin.port),
    DATABASE_SSL: 'false',
    DATABASE_USER: owner,
  };
}

async function createOwnerRole(admin, role, password) {
  await admin.query(`
    CREATE ROLE ${quoteIdentifier(role)}
    LOGIN SUPERUSER CREATEDB CREATEROLE INHERIT NOREPLICATION NOBYPASSRLS
    PASSWORD ${quoteSecret(password)}
  `);
}

async function createDegradedRuntimeRole(admin, role, password, owner, database) {
  await admin.query(`
    CREATE ROLE ${quoteIdentifier(role)}
    LOGIN SUPERUSER CREATEDB CREATEROLE INHERIT REPLICATION BYPASSRLS
    PASSWORD ${quoteSecret(password)}
  `);
  await admin.query(`GRANT ${quoteIdentifier(owner)} TO ${quoteIdentifier(role)}`);
  await admin.query(
    `ALTER ROLE ${quoteIdentifier(role)} IN DATABASE ${quoteIdentifier(database)} SET statement_timeout = '0'`,
  );
}

async function createDatabase(admin, database, owner) {
  await admin.query(
    `CREATE DATABASE ${quoteIdentifier(database)} OWNER ${quoteIdentifier(owner)} ENCODING 'UTF8'`,
  );
}

async function privilegeSignature(ownerClient, runtime, database) {
  const acl = await ownerClient.query(`
    SELECT kind, object_name, grantee, privilege_type
    FROM (
      SELECT 'database' AS kind, database_entry.datname AS object_name,
             privilege.grantee::regrole::text AS grantee, privilege.privilege_type
      FROM pg_catalog.pg_database AS database_entry
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
      ) AS privilege
      WHERE database_entry.datname = current_database()
      UNION ALL
      SELECT 'schema', namespace_entry.nspname, privilege.grantee::regrole::text,
             privilege.privilege_type
      FROM pg_catalog.pg_namespace AS namespace_entry
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(namespace_entry.nspacl, pg_catalog.acldefault('n', namespace_entry.nspowner))
      ) AS privilege
      WHERE namespace_entry.nspname = 'public'
      UNION ALL
      SELECT 'column', relation_entry.relname || '.' || attribute_entry.attname,
             privilege.grantee::regrole::text, privilege.privilege_type
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
      UNION ALL
      SELECT 'relation', relation_entry.relname, privilege.grantee::regrole::text,
             privilege.privilege_type
      FROM pg_catalog.pg_class AS relation_entry
      JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(
          relation_entry.relacl,
          pg_catalog.acldefault(
            (CASE WHEN relation_entry.relkind = 'S' THEN 's' ELSE 'r' END)::"char",
            relation_entry.relowner
          )
        )
      ) AS privilege
      WHERE namespace_entry.nspname = 'public'
      UNION ALL
      SELECT 'routine', routine_entry.proname, privilege.grantee::regrole::text,
             privilege.privilege_type
      FROM pg_catalog.pg_proc AS routine_entry
      JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = routine_entry.pronamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(routine_entry.proacl, pg_catalog.acldefault('f', routine_entry.proowner))
      ) AS privilege
      WHERE namespace_entry.nspname = 'public'
    ) AS effective_acl
    ORDER BY kind, object_name, grantee, privilege_type
  `);
  const defaultAcl = await ownerClient.query(`
    SELECT default_acl.defaclobjtype AS object_type,
           COALESCE(namespace_entry.nspname, '') AS schema_name,
           privilege.grantee::regrole::text AS grantee,
           privilege.privilege_type
    FROM pg_catalog.pg_default_acl AS default_acl
    LEFT JOIN pg_catalog.pg_namespace AS namespace_entry
      ON namespace_entry.oid = default_acl.defaclnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
    WHERE default_acl.defaclrole = (
      SELECT role_entry.oid FROM pg_catalog.pg_roles AS role_entry
      WHERE role_entry.rolname = current_user
    )
    ORDER BY object_type, schema_name, grantee, privilege_type
  `);
  const role = await ownerClient.query(
    `
      SELECT rolbypassrls, rolcanlogin, rolconnlimit, rolcreatedb, rolcreaterole,
             rolinherit, rolreplication, rolsuper
      FROM pg_catalog.pg_roles
      WHERE rolname = $1
    `,
    [runtime],
  );
  const memberships = await ownerClient.query(
    `
      SELECT granted_role.rolname
      FROM pg_catalog.pg_auth_members AS membership
      JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
      JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
      WHERE member_role.rolname = $1
      ORDER BY granted_role.rolname
    `,
    [runtime],
  );
  const settings = await ownerClient.query(
    `
      SELECT database_entry.datname, setting_entry.setting
      FROM pg_catalog.pg_db_role_setting AS role_setting
      JOIN pg_catalog.pg_roles AS role_entry ON role_entry.oid = role_setting.setrole
      LEFT JOIN pg_catalog.pg_database AS database_entry
        ON database_entry.oid = role_setting.setdatabase
      CROSS JOIN LATERAL unnest(role_setting.setconfig) AS setting_entry(setting)
      WHERE role_entry.rolname = $1
        AND role_setting.setdatabase IN (
          0,
          (SELECT target_database.oid FROM pg_catalog.pg_database AS target_database
           WHERE target_database.datname = $2)
        )
      ORDER BY database_entry.datname NULLS FIRST, setting_entry.setting
    `,
    [runtime, database],
  );
  return JSON.stringify({
    acl: acl.rows,
    defaultAcl: defaultAcl.rows,
    memberships: memberships.rows,
    role: role.rows,
    settings: settings.rows,
  });
}

async function runtimeSnapshot(client) {
  const result = await client.query(`
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
      FROM pg_catalog.pg_class AS relation_entry
      JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(
          relation_entry.relacl,
          pg_catalog.acldefault(
            (CASE WHEN relation_entry.relkind = 'S' THEN 's' ELSE 'r' END)::"char",
            relation_entry.relowner
          )
        )
      ) AS privilege
      WHERE namespace_entry.nspname = 'public'
        AND relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
        AND privilege.grantee = 0
      UNION ALL
      SELECT 1
      FROM pg_catalog.pg_proc AS routine_entry
      JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = routine_entry.pronamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(routine_entry.proacl, pg_catalog.acldefault('f', routine_entry.proowner))
      ) AS privilege
      WHERE namespace_entry.nspname = 'public' AND privilege.grantee = 0
    )
    SELECT
      current_user = session_user AS identity_unchanged,
      NOT runtime_role.rolsuper AND NOT runtime_role.rolcreaterole
        AND NOT runtime_role.rolcreatedb AND NOT runtime_role.rolreplication
        AND NOT runtime_role.rolbypassrls AND runtime_role.rolcanlogin
        AND NOT runtime_role.rolinherit AS role_attributes_valid,
      (
        SELECT count(*)::integer
        FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.member = runtime_role.oid
      ) AS membership_count,
      (
        SELECT count(*)::integer
        FROM pg_catalog.pg_class AS relation_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = relation_entry.relnamespace
        WHERE namespace_entry.nspname = 'public' AND relation_entry.relowner = runtime_role.oid
      ) + (
        SELECT count(*)::integer
        FROM pg_catalog.pg_proc AS routine_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = routine_entry.pronamespace
        WHERE namespace_entry.nspname = 'public' AND routine_entry.proowner = runtime_role.oid
      ) + (
        SELECT count(*)::integer
        FROM pg_catalog.pg_database AS database_entry
        WHERE database_entry.datname = current_database() AND database_entry.datdba = runtime_role.oid
      ) + (
        SELECT count(*)::integer
        FROM pg_catalog.pg_namespace AS namespace_entry
        WHERE namespace_entry.nspname = 'public'
          AND namespace_entry.nspowner = runtime_role.oid
      ) + (
        SELECT count(*)::integer
        FROM pg_catalog.pg_type AS type_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry
          ON namespace_entry.oid = type_entry.typnamespace
        WHERE namespace_entry.nspname = 'public'
          AND type_entry.typowner = runtime_role.oid
      ) AS owned_object_count,
      pg_catalog.has_database_privilege(current_user, current_database(), 'CONNECT') AS can_connect,
      pg_catalog.has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_database,
      pg_catalog.has_database_privilege(current_user, current_database(), 'TEMPORARY') AS can_create_temporary,
      pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE') AS can_use_schema,
      pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_schema,
      (
        SELECT count(*)::integer
        FROM pg_catalog.pg_class AS table_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = table_entry.relnamespace
        WHERE namespace_entry.nspname = 'public' AND table_entry.relkind IN ('r', 'p')
      ) AS table_count,
      (
        SELECT count(*)::integer
        FROM pg_catalog.pg_class AS table_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = table_entry.relnamespace
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
      ) AS table_violation_count,
      (
        SELECT count(*)::integer
        FROM pg_catalog.pg_class AS sequence_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = sequence_entry.relnamespace
        WHERE namespace_entry.nspname = 'public' AND sequence_entry.relkind = 'S'
          AND pg_catalog.has_sequence_privilege(
            current_user,
            sequence_entry.oid,
            'USAGE,SELECT,UPDATE'
          )
      ) AS sequence_privilege_count,
      (
        SELECT count(*)::integer
        FROM pg_catalog.pg_proc AS routine_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = routine_entry.pronamespace
        WHERE namespace_entry.nspname = 'public'
          AND pg_catalog.has_function_privilege(current_user, routine_entry.oid, 'EXECUTE')
      ) AS routine_privilege_count,
      (SELECT count(*)::integer FROM public_grants) AS public_grant_count
    FROM runtime_role
  `);
  if (result.rowCount !== 1) {
    fail('runtime catalog inspection did not return exactly one role');
  }
  return result.rows[0];
}

function assertRuntimeSnapshot(snapshot) {
  const expectedTrue = [
    'identity_unchanged',
    'role_attributes_valid',
    'can_connect',
    'can_use_schema',
  ];
  for (const field of expectedTrue) {
    if (snapshot[field] !== true) {
      fail(`runtime catalog assertion failed: ${field}`);
    }
  }
  const expectedFalse = ['can_create_database', 'can_create_temporary', 'can_create_schema'];
  for (const field of expectedFalse) {
    if (snapshot[field] !== false) {
      fail(`runtime catalog assertion failed: ${field}`);
    }
  }
  if (snapshot.table_count !== 34) {
    fail(`runtime expected 34 readable tables, received ${snapshot.table_count}`);
  }
  for (const field of [
    'membership_count',
    'owned_object_count',
    'table_violation_count',
    'sequence_privilege_count',
    'routine_privilege_count',
    'public_grant_count',
  ]) {
    if (snapshot[field] !== 0) {
      fail(`runtime catalog assertion failed: ${field}`);
    }
  }
}

async function injectDefaultAndColumnDrift(ownerClient, runtime) {
  const quotedRuntime = quoteIdentifier(runtime);
  await ownerClient.query(
    `GRANT UPDATE ("updatedAt") ON TABLE public."Customer" TO ${quotedRuntime}`,
  );
  await ownerClient.query('GRANT UPDATE ("updatedAt") ON TABLE public."Customer" TO PUBLIC');
  await ownerClient.query(
    `ALTER DEFAULT PRIVILEGES GRANT INSERT, UPDATE ON TABLES TO ${quotedRuntime}`,
  );
  await ownerClient.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT UPDATE ON TABLES TO ${quotedRuntime}`,
  );
  await ownerClient.query(`ALTER DEFAULT PRIVILEGES GRANT USAGE ON SEQUENCES TO ${quotedRuntime}`);
  await ownerClient.query(
    `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO ${quotedRuntime}`,
  );
  await ownerClient.query('ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC');
}

async function assertDefaultPrivilegeBoundary(ownerClient, runtime) {
  const result = await ownerClient.query(
    `
      SELECT default_acl.defaclobjtype AS object_type,
             COALESCE(namespace_entry.nspname, '') AS schema_name,
             privilege.grantee = 0 AS is_public,
             grantee_role.rolname AS grantee,
             privilege.privilege_type
      FROM pg_catalog.pg_default_acl AS default_acl
      LEFT JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = default_acl.defaclnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = privilege.grantee
      WHERE default_acl.defaclrole = (
        SELECT owner_role.oid FROM pg_catalog.pg_roles AS owner_role
        WHERE owner_role.rolname = current_user
      )
      ORDER BY object_type, schema_name, grantee, privilege_type
    `,
  );
  if (result.rows.some((row) => row.is_public === true)) {
    fail('PUBLIC retained an owner default privilege after provisioning');
  }
  const runtimeGrants = result.rows.filter((row) => row.grantee === runtime);
  if (
    runtimeGrants.length !== 1 ||
    runtimeGrants[0]?.object_type !== 'r' ||
    runtimeGrants[0]?.schema_name !== 'public' ||
    runtimeGrants[0]?.privilege_type !== 'SELECT'
  ) {
    fail('runtime owner default privileges are not exactly public-table SELECT');
  }
}

async function verifyFutureObjectPrivileges(ownerClient, runtime) {
  await ownerClient.query(`
    CREATE TABLE public.s1203a_default_acl_probe (
      id bigserial PRIMARY KEY,
      value text NOT NULL
    );
    CREATE FUNCTION public.s1203a_default_acl_probe_function()
    RETURNS integer LANGUAGE sql AS 'SELECT 1';
  `);
  try {
    const result = await ownerClient.query(
      `
        SELECT
          pg_catalog.has_table_privilege(
            $1, 'public.s1203a_default_acl_probe', 'SELECT'
          ) AS can_select_table,
          pg_catalog.has_table_privilege(
            $1,
            'public.s1203a_default_acl_probe',
            'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
          ) AS can_write_table,
          pg_catalog.has_any_column_privilege(
            $1, 'public.s1203a_default_acl_probe', 'INSERT,UPDATE,REFERENCES'
          ) AS can_write_column,
          pg_catalog.has_sequence_privilege(
            $1, 'public.s1203a_default_acl_probe_id_seq', 'USAGE,SELECT,UPDATE'
          ) AS can_use_sequence,
          pg_catalog.has_function_privilege(
            $1, 'public.s1203a_default_acl_probe_function()', 'EXECUTE'
          ) AS can_execute_function
      `,
      [runtime],
    );
    const row = result.rows[0];
    if (
      row?.can_select_table !== true ||
      row.can_write_table !== false ||
      row.can_write_column !== false ||
      row.can_use_sequence !== false ||
      row.can_execute_function !== false
    ) {
      fail('post-provisioning object defaults escaped the runtime boundary');
    }
  } finally {
    await ownerClient.query(`
      DROP FUNCTION IF EXISTS public.s1203a_default_acl_probe_function();
      DROP TABLE IF EXISTS public.s1203a_default_acl_probe CASCADE;
    `);
  }
}

async function assertDenied(client, label, sql) {
  try {
    await client.query(sql);
    fail(`${label} unexpectedly succeeded`);
  } catch (error) {
    if (error?.code !== '42501') {
      fail(`${label} failed with unexpected SQLSTATE ${error?.code ?? 'unknown'}`);
    }
  }
  process.stdout.write(`RUNTIME_DENIAL_PASS operation=${label} sqlstate=42501\n`);
}

async function verifyPrismaAdapter(configuration) {
  const pool = new Pool({
    ...configuration,
    application_name: 'kora-s1203a-validation-prisma',
    max: 2,
  });
  pool.on('error', () => undefined);
  const prisma = new PrismaClient({
    adapter: new PrismaPg(pool, { disposeExternalPool: false, schema: 'public' }),
  });
  try {
    const rows = await prisma.$queryRaw`SELECT 1 AS value`;
    if (rows.length !== 1 || rows[0]?.value !== 1) {
      fail('Prisma adapter SELECT 1 did not return the expected value');
    }
    await prisma.customer.findMany({ take: 1 });
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

function apiEnvironment(configuration) {
  return {
    API_HOST: '127.0.0.1',
    API_PORT: '3103',
    DATABASE_HOST: configuration.host,
    DATABASE_NAME: configuration.database,
    DATABASE_PASSWORD: configuration.password,
    DATABASE_PORT: String(configuration.port),
    DATABASE_SSL: 'false',
    DATABASE_USER: configuration.user,
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
    READINESS_TIMEOUT_MS: '5000',
    REDIS_HOST: '127.0.0.1',
    REDIS_PASSWORD: '',
    REDIS_PORT: '16379',
    REDIS_TLS: 'false',
  };
}

function inertReadinessChecks() {
  return [
    { async check() {}, name: 'postgresql' },
    { async check() {}, name: 'redis' },
  ];
}

async function verifyApiStartupBoundary(ownerConfiguration, runtimeConfiguration) {
  const factoryPath = resolve(apiDirectory, 'dist', 'src', 'app.factory.js');
  const { createApplication } = await import(pathToFileURL(factoryPath).href);
  let privilegedApplication;
  try {
    privilegedApplication = await createApplication({
      environment: apiEnvironment(ownerConfiguration),
      readinessChecks: inertReadinessChecks(),
    });
    fail('API startup unexpectedly accepted the owner/migrator role');
  } catch (error) {
    if (error?.name !== 'RuntimeDatabaseBoundaryError') {
      throw error;
    }
  } finally {
    if (privilegedApplication !== undefined) {
      await privilegedApplication.close();
    }
  }

  const runtimeApplication = await createApplication({
    environment: apiEnvironment(runtimeConfiguration),
    readinessChecks: inertReadinessChecks(),
  });
  await runtimeApplication.close();
  process.stdout.write('API_STARTUP_BOUNDARY_PASS privileged=refused runtime=accepted\n');
}

async function verifyApiRejectsColumnPrivilege(runtimeConfiguration) {
  const factoryPath = resolve(apiDirectory, 'dist', 'src', 'app.factory.js');
  const { createApplication } = await import(pathToFileURL(factoryPath).href);
  let application;
  try {
    application = await createApplication({
      environment: apiEnvironment(runtimeConfiguration),
      readinessChecks: inertReadinessChecks(),
    });
    fail('API startup unexpectedly accepted a runtime column-write privilege');
  } catch (error) {
    if (
      error?.name !== 'RuntimeDatabaseBoundaryError' ||
      !error.violations?.includes('unexpected_table_privilege')
    ) {
      throw error;
    }
  } finally {
    if (application !== undefined) {
      await application.close();
    }
  }
  process.stdout.write('API_COLUMN_PRIVILEGE_REJECTION_PASS\n');
}

async function validateDatabase(admin, label, suffix, cleanup) {
  const database = `kora_s1203a_database_${label}_${suffix}`;
  const owner = `kora_s1203a_owner_${label}_${suffix}`;
  const runtime = `kora_s1203a_runtime_${label}_${suffix}`;
  const ownerPassword = adminConfiguration().password;
  const runtimePassword = process.env.S1203A_RUNTIME_PASSWORD;
  const secrets = [ownerPassword, runtimePassword];
  await createOwnerRole(admin, owner, ownerPassword);
  cleanup.roles.push(owner);
  await createDatabase(admin, database, owner);
  cleanup.databases.push(database);
  cleanup.roles.unshift(runtime);
  if (label === 'b') {
    await createDegradedRuntimeRole(admin, runtime, runtimePassword, owner, database);
  }

  const environment = prismaEnvironment(database, owner, ownerPassword);
  runPrisma(['migrate', 'deploy', '--config', 'prisma.config.ts'], environment, secrets);
  runPrisma(['migrate', 'status', '--config', 'prisma.config.ts'], environment, secrets);

  const ownerClient = new Client(databaseConfiguration(database, owner, ownerPassword));
  await ownerClient.connect();
  try {
    if (label === 'b') {
      await injectDefaultAndColumnDrift(ownerClient, runtime);
    }
    runProvisioner(database, owner, runtime, secrets);
    await assertDefaultPrivilegeBoundary(ownerClient, runtime);
    await verifyFutureObjectPrivileges(ownerClient, runtime);
    const firstSignature = await privilegeSignature(ownerClient, runtime, database);
    runProvisioner(database, owner, runtime, secrets);
    const secondSignature = await privilegeSignature(ownerClient, runtime, database);
    if (firstSignature !== secondSignature) {
      fail(`database ${label.toUpperCase()} provisioning was not idempotent`);
    }

    await ownerClient.query(
      `GRANT UPDATE ("updatedAt") ON TABLE public."Customer" TO ${quoteIdentifier(runtime)}`,
    );
    await verifyApiRejectsColumnPrivilege(
      databaseConfiguration(database, runtime, runtimePassword),
    );
    runProvisioner(database, owner, runtime, secrets);
    const recoverySignature = await privilegeSignature(ownerClient, runtime, database);
    if (firstSignature !== recoverySignature) {
      fail(`database ${label.toUpperCase()} drift recovery did not converge`);
    }
  } finally {
    await ownerClient.end();
  }

  const runtimeConfiguration = databaseConfiguration(database, runtime, runtimePassword);
  const runtimeClient = new Client(runtimeConfiguration);
  await runtimeClient.connect();
  try {
    const selectOne = await runtimeClient.query('SELECT 1 AS value');
    if (selectOne.rows[0]?.value !== 1) {
      fail('runtime SELECT 1 did not return the expected value');
    }
    assertRuntimeSnapshot(await runtimeSnapshot(runtimeClient));
    await assertDenied(runtimeClient, 'ddl', 'CREATE TABLE public.s1203a_forbidden(id integer)');
    await assertDenied(runtimeClient, 'truncate', 'TRUNCATE TABLE public."Customer"');
    await assertDenied(
      runtimeClient,
      'trigger_change',
      'ALTER TABLE public."Order" DISABLE TRIGGER "Order_immutable"',
    );
    await assertDenied(runtimeClient, 'set_role', `SET ROLE ${quoteIdentifier(owner)}`);
    await assertDenied(runtimeClient, 'insert', 'INSERT INTO public."Customer" DEFAULT VALUES');
    await assertDenied(
      runtimeClient,
      'update',
      'UPDATE public."Customer" SET "updatedAt" = now() WHERE false',
    );
    await assertDenied(runtimeClient, 'delete', 'DELETE FROM public."Customer" WHERE false');
  } finally {
    await runtimeClient.end();
  }

  await verifyPrismaAdapter(runtimeConfiguration);
  await verifyApiStartupBoundary(
    databaseConfiguration(database, owner, ownerPassword),
    runtimeConfiguration,
  );
  process.stdout.write(
    `RUNTIME_DATABASE_${label.toUpperCase()}_PASS tables=34 provisioning_runs=3 prisma_adapter=7.9.1 public_grants=0\n`,
  );
}

async function cleanupResources(admin, cleanup) {
  const cleanupErrors = [];
  for (const database of [...cleanup.databases].reverse()) {
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`);
      process.stdout.write('TARGETED_RUNTIME_DATABASE_REMOVED\n');
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  for (const role of cleanup.roles) {
    try {
      await admin.query(`DROP ROLE IF EXISTS ${quoteIdentifier(role)}`);
      process.stdout.write('TARGETED_RUNTIME_ROLE_REMOVED\n');
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Targeted PostgreSQL cleanup failed.');
  }
}

function assertEnvironment() {
  if (process.env.S1203A_EPHEMERAL_POSTGRES !== '1') {
    fail('S1203A_EPHEMERAL_POSTGRES=1 is required');
  }
  if (!new Set(['127.0.0.1', 'localhost']).has(process.env.S1203A_ADMIN_HOST)) {
    fail('the administrative PostgreSQL host must be loopback');
  }
  if (process.env.S1203A_ADMIN_DATABASE !== 'postgres') {
    fail('the administrative connection must target postgres');
  }
  for (const name of [
    'S1203A_ADMIN_PORT',
    'S1203A_ADMIN_USER',
    'S1203A_ADMIN_PASSWORD',
    'S1203A_RUNTIME_PASSWORD',
    'S1203A_VALIDATION_CONTAINER',
  ]) {
    if (process.env[name] === undefined || process.env[name].length === 0) {
      fail(`${name} is required`);
    }
  }
  if (!/^[A-Za-z0-9_-]{43}$/u.test(process.env.S1203A_RUNTIME_PASSWORD)) {
    fail('S1203A_RUNTIME_PASSWORD failed its in-memory format guard');
  }
  validationContainer();
}

async function main() {
  assertEnvironment();
  const suffix = randomBytes(4).toString('hex');
  const cleanup = { databases: [], roles: [] };
  const admin = new Client(adminConfiguration());
  await admin.connect();
  let validationError;
  try {
    await validateDatabase(admin, 'a', suffix, cleanup);
    await validateDatabase(admin, 'b', suffix, cleanup);
    process.stdout.write(
      'S1.2-03A_RUNTIME_BOUNDARY_PASS databases=2 idempotent=true prisma_select=true denials=14\n',
    );
  } catch (error) {
    validationError = error;
  }

  try {
    await cleanupResources(admin, cleanup);
  } catch (cleanupError) {
    if (validationError !== undefined) {
      throw new AggregateError([validationError, cleanupError], 'Validation and cleanup failed.');
    }
    throw cleanupError;
  } finally {
    await admin.end();
  }

  if (validationError !== undefined) {
    throw validationError;
  }
}

await main();
