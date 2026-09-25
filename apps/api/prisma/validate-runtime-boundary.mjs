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
const SAFE_IDENTIFIER = /^kora_s1203a_(?:database|owner|runtime|thirdparty)_[ab]_[a-f0-9]{8}$/u;

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

function executeProvisioner(database, owner, runtime) {
  return spawnSync(
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
}

function runProvisioner(database, owner, runtime, secrets) {
  const result = executeProvisioner(database, owner, runtime);
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stdout = normalizedOutput(result.stdout ?? '', secrets);
    const stderr = normalizedOutput(result.stderr ?? '', secrets);
    fail(`the delivered provisioner exited ${result.status}.\n${stdout}${stderr}`);
  }
}

async function assertProvisionerRefusesUnsafeState(
  database,
  owner,
  runtime,
  ownerClient,
  secrets,
  scenario,
  diagnosticPattern = /PostgreSQL runtime provisioning refused unsafe pre-existing database state count=[1-9][0-9]*\./u,
) {
  const signatureBefore = await refusalStateSignature(ownerClient, runtime, database);
  const result = executeProvisioner(database, owner, runtime);
  if (result.error !== undefined) {
    throw result.error;
  }
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (secrets.some((secret) => output.includes(secret))) {
    fail('the refused provisioner output exposed an ephemeral credential');
  }
  const normalized = normalizedOutput(output, secrets).trim();
  if (result.status === 0 || !diagnosticPattern.test(normalized)) {
    fail(
      `the delivered provisioner did not deterministically refuse ${scenario}; exit=${result.status ?? 'unknown'}; diagnostic=${normalized.slice(-1_000) || '<empty>'}`,
    );
  }
  if (normalized.length > 1_000) {
    fail(`the delivered provisioner diagnostic was not bounded for ${scenario}`);
  }
  const signatureAfter = await refusalStateSignature(ownerClient, runtime, database);
  if (signatureBefore !== signatureAfter) {
    fail(`the refused provisioner mutated the pre-existing state for ${scenario}`);
  }
  process.stdout.write(
    `PROVISIONING_REFUSAL_PASS scenario=${scenario} diagnostic=bounded state_unchanged=true\n`,
  );
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

async function createThirdPartyRole(admin, role) {
  await admin.query(`
    CREATE ROLE ${quoteIdentifier(role)}
    NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS
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
    WITH non_system_schemas AS (
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
    )
    SELECT kind, object_name, grantee, privilege_type, is_grantable
    FROM (
      SELECT 'database' AS kind, database_entry.datname AS object_name,
             privilege.grantee::regrole::text AS grantee, privilege.privilege_type,
             privilege.is_grantable
      FROM pg_catalog.pg_database AS database_entry
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(database_entry.datacl, pg_catalog.acldefault('d', database_entry.datdba))
      ) AS privilege
      WHERE database_entry.datname = current_database()
      UNION ALL
      SELECT 'schema', namespace_entry.nspname, privilege.grantee::regrole::text,
             privilege.privilege_type, privilege.is_grantable
      FROM non_system_schemas AS namespace_entry
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(namespace_entry.nspacl, pg_catalog.acldefault('n', namespace_entry.nspowner))
      ) AS privilege
      UNION ALL
      SELECT 'column', namespace_entry.nspname || '.' || relation_entry.relname || '.' || attribute_entry.attname,
             privilege.grantee::regrole::text, privilege.privilege_type,
             privilege.is_grantable
      FROM pg_catalog.pg_attribute AS attribute_entry
      JOIN pg_catalog.pg_class AS relation_entry
        ON relation_entry.oid = attribute_entry.attrelid
      JOIN non_system_schemas AS namespace_entry
        ON namespace_entry.oid = relation_entry.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
      WHERE relation_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND attribute_entry.attnum > 0
        AND NOT attribute_entry.attisdropped
      UNION ALL
      SELECT 'relation', namespace_entry.nspname || '.' || relation_entry.relname,
             privilege.grantee::regrole::text, privilege.privilege_type,
             privilege.is_grantable
      FROM pg_catalog.pg_class AS relation_entry
      JOIN non_system_schemas AS namespace_entry
        ON namespace_entry.oid = relation_entry.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(
          relation_entry.relacl,
          pg_catalog.acldefault(
            (CASE WHEN relation_entry.relkind = 'S' THEN 's' ELSE 'r' END)::"char",
            relation_entry.relowner
          )
        )
      ) AS privilege
      UNION ALL
      SELECT 'routine', namespace_entry.nspname || '.' || routine_entry.oid::regprocedure::text,
             privilege.grantee::regrole::text, privilege.privilege_type,
             privilege.is_grantable
      FROM pg_catalog.pg_proc AS routine_entry
      JOIN non_system_schemas AS namespace_entry
        ON namespace_entry.oid = routine_entry.pronamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(routine_entry.proacl, pg_catalog.acldefault('f', routine_entry.proowner))
      ) AS privilege
      UNION ALL
      SELECT 'type', namespace_entry.nspname || '.' || type_entry.typname,
             privilege.grantee::regrole::text, privilege.privilege_type,
             privilege.is_grantable
      FROM privilege_bearing_types AS type_entry
      JOIN non_system_schemas AS namespace_entry
        ON namespace_entry.oid = type_entry.typnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(type_entry.typacl, pg_catalog.acldefault('T', type_entry.typowner))
      ) AS privilege
    ) AS effective_acl
    ORDER BY kind, object_name, grantee, privilege_type, is_grantable
  `);
  const defaultAcl = await ownerClient.query(`
    WITH non_system_schemas AS (
      SELECT oid, nspname
      FROM pg_catalog.pg_namespace
      WHERE nspname <> 'information_schema'
        AND nspname !~ '^pg_'
    )
    SELECT owner_role.rolname AS owner,
           default_acl.defaclobjtype AS object_type,
           COALESCE(namespace_entry.nspname, '') AS schema_name,
           privilege.grantee::regrole::text AS grantee,
           privilege.privilege_type,
           privilege.is_grantable
    FROM pg_catalog.pg_default_acl AS default_acl
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = default_acl.defaclrole
    LEFT JOIN non_system_schemas AS namespace_entry
      ON namespace_entry.oid = default_acl.defaclnamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
    WHERE (
      default_acl.defaclnamespace = 0
      OR namespace_entry.oid IS NOT NULL
    )
    ORDER BY owner, object_type, schema_name, grantee, privilege_type, is_grantable
  `);
  const owners = await ownerClient.query(
    `
      WITH runtime_role AS (
        SELECT oid FROM pg_catalog.pg_roles WHERE rolname = $1
      ), current_database_entry AS (
        SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database()
      )
      SELECT dependency.classid::regclass::text AS catalog,
             dependency.objid,
             dependency.objsubid
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
      ORDER BY catalog, dependency.objid, dependency.objsubid
    `,
    [runtime],
  );
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
  const parameterAcl = await ownerClient.query(`
    SELECT parameter_entry.parname AS parameter_name,
           privilege.grantee::regrole::text AS grantee,
           privilege.privilege_type,
           privilege.is_grantable
    FROM pg_catalog.pg_parameter_acl AS parameter_entry
    CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_entry.paracl) AS privilege
    ORDER BY parameter_name, grantee, privilege_type, is_grantable
  `);
  return JSON.stringify({
    acl: acl.rows,
    defaultAcl: defaultAcl.rows,
    memberships: memberships.rows,
    owners: owners.rows,
    parameterAcl: parameterAcl.rows,
    role: role.rows,
    settings: settings.rows,
  });
}

async function refusalStateSignature(ownerClient, runtime, database) {
  const credential = await ownerClient.query(
    `
      SELECT pg_catalog.md5(COALESCE(rolpassword, '')) AS credential_fingerprint
      FROM pg_catalog.pg_authid
      WHERE rolname = $1
    `,
    [runtime],
  );
  return JSON.stringify({
    credential: credential.rows,
    operationalState: await privilegeSignature(ownerClient, runtime, database),
  });
}

async function runtimeSnapshot(client) {
  const result = await client.query(`
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
      FROM pg_catalog.pg_class AS relation_entry
      JOIN non_system_schemas AS namespace_entry
        ON namespace_entry.oid = relation_entry.relnamespace
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
      FROM pg_catalog.pg_parameter_acl AS parameter_entry
      CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_entry.paracl) AS privilege
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
      FROM pg_catalog.pg_parameter_acl AS parameter_entry
      CROSS JOIN runtime_role
      CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_entry.paracl) AS privilege
      WHERE privilege.grantee = runtime_role.oid
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
        FROM pg_catalog.pg_shdepend AS dependency
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
      ) AS owned_object_count,
      pg_catalog.has_database_privilege(current_user, current_database(), 'CONNECT') AS can_connect,
      pg_catalog.has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_database,
      pg_catalog.has_database_privilege(current_user, current_database(), 'TEMPORARY') AS can_create_temporary,
      pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE') AS can_use_schema,
      pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE') AS can_create_schema,
      (
        SELECT count(*)::integer
        FROM non_system_schemas AS namespace_entry
        WHERE namespace_entry.nspname <> 'public'
          AND pg_catalog.has_schema_privilege(
            current_user,
            namespace_entry.oid,
            'USAGE,CREATE'
          )
      ) AS unexpected_schema_privilege_count,
      (
        SELECT count(*)::integer
        FROM pg_catalog.pg_class AS table_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = table_entry.relnamespace
        WHERE namespace_entry.nspname = 'public' AND table_entry.relkind IN ('r', 'p')
      ) AS table_count,
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
      ) AS table_violation_count,
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
      ) AS sequence_privilege_count,
      (
        SELECT count(*)::integer
        FROM pg_catalog.pg_proc AS routine_entry
        JOIN non_system_schemas AS namespace_entry
          ON namespace_entry.oid = routine_entry.pronamespace
        WHERE pg_catalog.has_function_privilege(current_user, routine_entry.oid, 'EXECUTE')
      ) AS routine_privilege_count,
      (
        SELECT count(*)::integer
        FROM privilege_bearing_types AS type_entry
        WHERE pg_catalog.has_type_privilege(current_user, type_entry.oid, 'USAGE')
      ) AS type_privilege_count,
      (SELECT count(*)::integer FROM default_privilege_violations)
        AS default_privilege_violation_count,
      (SELECT count(*)::integer FROM grant_option_violations)
        AS grant_option_violation_count,
      (
        SELECT count(*)::integer
        FROM pg_catalog.pg_parameter_acl AS parameter_entry
        WHERE pg_catalog.has_parameter_privilege(
                current_user,
                parameter_entry.parname,
                'SET'
              )
           OR pg_catalog.has_parameter_privilege(
                current_user,
                parameter_entry.parname,
                'ALTER SYSTEM'
              )
      ) AS parameter_privilege_count,
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
    'unexpected_schema_privilege_count',
    'table_violation_count',
    'sequence_privilege_count',
    'routine_privilege_count',
    'type_privilege_count',
    'default_privilege_violation_count',
    'grant_option_violation_count',
    'parameter_privilege_count',
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
             privilege.privilege_type,
             privilege.is_grantable
      FROM pg_catalog.pg_default_acl AS default_acl
      LEFT JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = default_acl.defaclnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
      LEFT JOIN pg_catalog.pg_roles AS grantee_role ON grantee_role.oid = privilege.grantee
      WHERE default_acl.defaclrole = (
        SELECT database_entry.datdba
        FROM pg_catalog.pg_database AS database_entry
        WHERE database_entry.datname = current_database()
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
    runtimeGrants[0]?.privilege_type !== 'SELECT' ||
    runtimeGrants[0]?.is_grantable !== false
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
    CREATE TYPE public.s1203a_default_acl_probe_type AS ENUM ('safe');
    CREATE TABLE s1203a_safe.s1203a_external_default_acl_probe (
      id bigserial PRIMARY KEY,
      value text NOT NULL
    );
    CREATE FUNCTION s1203a_safe.s1203a_external_default_acl_probe_function()
    RETURNS integer LANGUAGE sql AS 'SELECT 1';
    CREATE TYPE s1203a_safe.s1203a_external_default_acl_probe_type AS ENUM ('safe');
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
          ) AS can_execute_function,
          pg_catalog.has_type_privilege(
            $1, 'public.s1203a_default_acl_probe_type', 'USAGE'
          ) AS can_use_type,
          pg_catalog.has_schema_privilege(
            $1, 's1203a_safe', 'USAGE,CREATE'
          ) AS can_use_external_schema,
          pg_catalog.has_table_privilege(
            $1,
            's1203a_safe.s1203a_external_default_acl_probe',
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
          ) AS can_access_external_table,
          pg_catalog.has_sequence_privilege(
            $1,
            's1203a_safe.s1203a_external_default_acl_probe_id_seq',
            'USAGE,SELECT,UPDATE'
          ) AS can_access_external_sequence,
          pg_catalog.has_function_privilege(
            $1,
            's1203a_safe.s1203a_external_default_acl_probe_function()',
            'EXECUTE'
          ) AS can_execute_external_function,
          pg_catalog.has_type_privilege(
            $1, 's1203a_safe.s1203a_external_default_acl_probe_type', 'USAGE'
          ) AS can_use_external_type
      `,
      [runtime],
    );
    const row = result.rows[0];
    if (
      row?.can_select_table !== true ||
      row.can_write_table !== false ||
      row.can_write_column !== false ||
      row.can_use_sequence !== false ||
      row.can_execute_function !== false ||
      row.can_use_type !== false ||
      row.can_use_external_schema !== false ||
      row.can_access_external_table !== false ||
      row.can_access_external_sequence !== false ||
      row.can_execute_external_function !== false ||
      row.can_use_external_type !== false
    ) {
      fail('post-provisioning object defaults escaped the runtime boundary');
    }
  } finally {
    await ownerClient.query(`
      DROP TYPE IF EXISTS public.s1203a_default_acl_probe_type;
      DROP FUNCTION IF EXISTS public.s1203a_default_acl_probe_function();
      DROP TABLE IF EXISTS public.s1203a_default_acl_probe CASCADE;
      DROP TYPE IF EXISTS s1203a_safe.s1203a_external_default_acl_probe_type;
      DROP FUNCTION IF EXISTS s1203a_safe.s1203a_external_default_acl_probe_function();
      DROP TABLE IF EXISTS s1203a_safe.s1203a_external_default_acl_probe CASCADE;
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

async function verifyApiRejectsPrivileges(runtimeConfiguration, expectedViolations, scenario) {
  const factoryPath = resolve(apiDirectory, 'dist', 'src', 'app.factory.js');
  const { createApplication } = await import(pathToFileURL(factoryPath).href);
  let application;
  try {
    application = await createApplication({
      environment: apiEnvironment(runtimeConfiguration),
      readinessChecks: inertReadinessChecks(),
    });
    fail(`API startup unexpectedly accepted ${scenario}`);
  } catch (error) {
    if (
      error?.name !== 'RuntimeDatabaseBoundaryError' ||
      !expectedViolations.every((violation) => error.violations?.includes(violation))
    ) {
      throw error;
    }
  } finally {
    if (application !== undefined) {
      await application.close();
    }
  }
  process.stdout.write(`API_RUNTIME_BOUNDARY_REJECTION_PASS scenario=${scenario}\n`);
}

async function verifyRuntimeOwnedSchemaRejected({
  database,
  owner,
  ownerClient,
  runtime,
  runtimeConfiguration,
  secrets,
}) {
  await ownerClient.query(
    `CREATE SCHEMA s1203a_runtime_owned AUTHORIZATION ${quoteIdentifier(runtime)}`,
  );
  try {
    await verifyApiRejectsPrivileges(
      runtimeConfiguration,
      ['runtime_owns_database_object', 'unexpected_schema_privilege'],
      'runtime_owned_external_schema',
    );
    await assertProvisionerRefusesUnsafeState(
      database,
      owner,
      runtime,
      ownerClient,
      secrets,
      'runtime_owned_external_schema',
    );
  } finally {
    await ownerClient.query(
      `ALTER SCHEMA s1203a_runtime_owned OWNER TO ${quoteIdentifier(owner)};
       DROP SCHEMA s1203a_runtime_owned;`,
    );
  }
}

async function verifyPublicCreateSchemaRejected({
  database,
  owner,
  ownerClient,
  runtime,
  runtimeConfiguration,
  secrets,
}) {
  await ownerClient.query(
    `CREATE SCHEMA s1203a_public_create AUTHORIZATION ${quoteIdentifier(owner)};
     GRANT CREATE ON SCHEMA s1203a_public_create TO PUBLIC;`,
  );
  try {
    await verifyApiRejectsPrivileges(
      runtimeConfiguration,
      ['unexpected_schema_privilege', 'public_privilege_present'],
      'public_create_external_schema',
    );
    await assertProvisionerRefusesUnsafeState(
      database,
      owner,
      runtime,
      ownerClient,
      secrets,
      'public_create_external_schema',
    );
  } finally {
    await ownerClient.query(
      `REVOKE ALL PRIVILEGES ON SCHEMA s1203a_public_create FROM PUBLIC;
       DROP SCHEMA s1203a_public_create;`,
    );
  }
}

async function verifyIsolatedUnsafeState({
  cleanupSql,
  database,
  diagnosticPattern,
  expectedViolations,
  owner,
  ownerClient,
  runtime,
  runtimeConfiguration,
  scenario,
  secrets,
  setupSql,
}) {
  await ownerClient.query(setupSql);
  try {
    await verifyApiRejectsPrivileges(runtimeConfiguration, expectedViolations, scenario);
    await assertProvisionerRefusesUnsafeState(
      database,
      owner,
      runtime,
      ownerClient,
      secrets,
      scenario,
      diagnosticPattern,
    );
  } finally {
    await ownerClient.query(cleanupSql);
  }
}

async function verifyRuntimeOwnedPublicObjectRejected(context) {
  await verifyIsolatedUnsafeState({
    ...context,
    cleanupSql: `
      ALTER TABLE public.s1203a_runtime_owned_probe
        OWNER TO ${quoteIdentifier(context.owner)};
      DROP TABLE public.s1203a_runtime_owned_probe;
    `,
    expectedViolations: ['runtime_owns_database_object', 'unexpected_table_privilege'],
    scenario: 'runtime_owned_public_object',
    setupSql: `
      CREATE TABLE public.s1203a_runtime_owned_probe (id integer);
      ALTER TABLE public.s1203a_runtime_owned_probe
        OWNER TO ${quoteIdentifier(context.runtime)};
    `,
  });
}

async function verifyRuntimeOwnedCollationRejected(context) {
  await verifyIsolatedUnsafeState({
    ...context,
    cleanupSql: `
      ALTER COLLATION s1203a_safe.s1203a_runtime_owned_collation
        OWNER TO ${quoteIdentifier(context.owner)};
      DROP COLLATION s1203a_safe.s1203a_runtime_owned_collation;
    `,
    expectedViolations: ['runtime_owns_database_object'],
    scenario: 'runtime_owned_non_catalogued_object',
    setupSql: `
      CREATE COLLATION s1203a_safe.s1203a_runtime_owned_collation FROM "C";
      ALTER COLLATION s1203a_safe.s1203a_runtime_owned_collation
        OWNER TO ${quoteIdentifier(context.runtime)};
    `,
  });
}

async function verifyExternalTablePrivilegeRejected(context) {
  await verifyIsolatedUnsafeState({
    ...context,
    cleanupSql: 'DROP SCHEMA s1203a_table_acl CASCADE;',
    expectedViolations: ['unexpected_table_privilege'],
    scenario: 'external_table_privilege',
    setupSql: `
      CREATE SCHEMA s1203a_table_acl AUTHORIZATION ${quoteIdentifier(context.owner)};
      CREATE TABLE s1203a_table_acl.boundary_probe (id integer);
      GRANT SELECT ON TABLE s1203a_table_acl.boundary_probe
        TO ${quoteIdentifier(context.runtime)};
    `,
  });
}

async function verifyExternalColumnPrivilegeRejected(context) {
  await verifyIsolatedUnsafeState({
    ...context,
    cleanupSql: 'DROP SCHEMA s1203a_column_acl CASCADE;',
    expectedViolations: ['unexpected_table_privilege', 'public_privilege_present'],
    scenario: 'external_column_privilege',
    setupSql: `
      CREATE SCHEMA s1203a_column_acl AUTHORIZATION ${quoteIdentifier(context.owner)};
      CREATE TABLE s1203a_column_acl.boundary_probe (value text);
      GRANT UPDATE (value) ON TABLE s1203a_column_acl.boundary_probe TO PUBLIC;
    `,
  });
}

async function verifyExternalSequencePrivilegeRejected(context) {
  await verifyIsolatedUnsafeState({
    ...context,
    cleanupSql: 'DROP SCHEMA s1203a_sequence_acl CASCADE;',
    expectedViolations: ['unexpected_sequence_privilege'],
    scenario: 'external_sequence_privilege',
    setupSql: `
      CREATE SCHEMA s1203a_sequence_acl AUTHORIZATION ${quoteIdentifier(context.owner)};
      CREATE SEQUENCE s1203a_sequence_acl.boundary_probe;
      GRANT USAGE ON SEQUENCE s1203a_sequence_acl.boundary_probe
        TO ${quoteIdentifier(context.runtime)};
    `,
  });
}

async function verifyExternalRoutinePrivilegeRejected(context) {
  await verifyIsolatedUnsafeState({
    ...context,
    cleanupSql: 'DROP SCHEMA s1203a_routine_acl CASCADE;',
    expectedViolations: ['unexpected_routine_privilege'],
    scenario: 'external_routine_privilege',
    setupSql: `
      CREATE SCHEMA s1203a_routine_acl AUTHORIZATION ${quoteIdentifier(context.owner)};
      CREATE FUNCTION s1203a_routine_acl.boundary_probe()
      RETURNS integer LANGUAGE sql AS 'SELECT 1';
      REVOKE ALL PRIVILEGES ON FUNCTION s1203a_routine_acl.boundary_probe() FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION s1203a_routine_acl.boundary_probe()
        TO ${quoteIdentifier(context.runtime)};
    `,
  });
}

async function verifyExternalTypePrivilegeRejected(context) {
  await verifyIsolatedUnsafeState({
    ...context,
    cleanupSql: 'DROP SCHEMA s1203a_type_acl CASCADE;',
    expectedViolations: ['unexpected_type_privilege', 'public_privilege_present'],
    scenario: 'external_type_privilege',
    setupSql: `
      CREATE SCHEMA s1203a_type_acl AUTHORIZATION ${quoteIdentifier(context.owner)};
      CREATE TYPE s1203a_type_acl.boundary_probe AS ENUM ('unsafe');
      GRANT USAGE ON TYPE s1203a_type_acl.boundary_probe TO PUBLIC;
    `,
  });
}

async function verifyExternalDefaultPrivilegeRejected(context) {
  const quotedRuntime = quoteIdentifier(context.runtime);
  await verifyIsolatedUnsafeState({
    ...context,
    cleanupSql: `
      ALTER DEFAULT PRIVILEGES IN SCHEMA s1203a_default_acl
        REVOKE ALL PRIVILEGES ON TABLES FROM ${quotedRuntime};
      DROP SCHEMA s1203a_default_acl;
    `,
    expectedViolations: ['unexpected_default_privilege'],
    scenario: 'external_default_privilege',
    setupSql: `
      CREATE SCHEMA s1203a_default_acl AUTHORIZATION ${quoteIdentifier(context.owner)};
      ALTER DEFAULT PRIVILEGES IN SCHEMA s1203a_default_acl
        GRANT UPDATE ON TABLES TO ${quotedRuntime};
    `,
  });
}

async function verifyThirdPartyPublicDefaultPrivilegeRejected(context) {
  const quotedRuntime = quoteIdentifier(context.runtime);
  const quotedThirdParty = quoteIdentifier(context.thirdParty);
  await verifyIsolatedUnsafeState({
    ...context,
    cleanupSql: `
      ALTER DEFAULT PRIVILEGES FOR ROLE ${quotedThirdParty} IN SCHEMA public
        REVOKE ALL PRIVILEGES ON TABLES FROM ${quotedRuntime};
    `,
    expectedViolations: ['unexpected_default_privilege'],
    scenario: 'third_party_runtime_default_select_privilege',
    setupSql: `
      ALTER DEFAULT PRIVILEGES FOR ROLE ${quotedThirdParty} IN SCHEMA public
        GRANT SELECT ON TABLES TO ${quotedRuntime};
    `,
  });

  await context.ownerClient.query(`
    GRANT USAGE, CREATE ON SCHEMA public TO ${quotedThirdParty};
    SET ROLE ${quotedThirdParty};
    CREATE TABLE public.s1203a_thirdparty_future_probe (id integer);
    RESET ROLE;
  `);
  try {
    const result = await context.ownerClient.query(
      `SELECT pg_catalog.has_table_privilege(
         $1,
         'public.s1203a_thirdparty_future_probe',
         'SELECT'
       ) AS can_select`,
      [context.runtime],
    );
    if (result.rows[0]?.can_select !== false) {
      fail('a future third-party table remained readable after explicit ACL remediation');
    }
    process.stdout.write('THIRD_PARTY_FUTURE_TABLE_AFTER_REMEDIATION_PASS runtime_select=false\n');
  } finally {
    await context.ownerClient.query(`
      DROP TABLE IF EXISTS public.s1203a_thirdparty_future_probe;
      REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${quotedThirdParty};
    `);
  }
}

async function verifyParameterPrivilegeRejected(context, scenario) {
  const scenarios = {
    parameter_direct_alter_system: {
      cleanup: `REVOKE ALL PRIVILEGES ON PARAMETER work_mem FROM ${quoteIdentifier(context.runtime)}`,
      expected: ['unexpected_parameter_privilege'],
      setup: `GRANT ALTER SYSTEM ON PARAMETER work_mem TO ${quoteIdentifier(context.runtime)}`,
    },
    parameter_direct_set: {
      cleanup: `REVOKE ALL PRIVILEGES ON PARAMETER session_replication_role FROM ${quoteIdentifier(context.runtime)}`,
      expected: ['unexpected_parameter_privilege'],
      setup: `GRANT SET ON PARAMETER session_replication_role TO ${quoteIdentifier(context.runtime)}`,
    },
    parameter_public_alter_system: {
      cleanup: 'REVOKE ALL PRIVILEGES ON PARAMETER work_mem FROM PUBLIC',
      expected: ['unexpected_parameter_privilege', 'public_privilege_present'],
      setup: 'GRANT ALTER SYSTEM ON PARAMETER work_mem TO PUBLIC',
    },
    parameter_public_set: {
      cleanup: 'REVOKE ALL PRIVILEGES ON PARAMETER session_replication_role FROM PUBLIC',
      expected: ['unexpected_parameter_privilege', 'public_privilege_present'],
      setup: 'GRANT SET ON PARAMETER session_replication_role TO PUBLIC',
    },
    parameter_set_grant_option: {
      cleanup: `REVOKE ALL PRIVILEGES ON PARAMETER work_mem FROM ${quoteIdentifier(context.runtime)}`,
      expected: ['unexpected_parameter_privilege', 'unexpected_grant_option'],
      setup: `GRANT SET ON PARAMETER work_mem TO ${quoteIdentifier(context.runtime)} WITH GRANT OPTION`,
    },
  };
  const definition = scenarios[scenario];
  if (definition === undefined) {
    fail(`unknown parameter ACL scenario ${scenario}`);
  }
  await verifyIsolatedUnsafeState({
    ...context,
    cleanupSql: `${definition.cleanup};`,
    diagnosticPattern:
      /PostgreSQL runtime provisioning refused unsafe cluster parameter ACL count=[1-9][0-9]*\./u,
    expectedViolations: definition.expected,
    scenario,
    setupSql: `${definition.setup};`,
  });
}

async function verifyGrantOptionRepair({
  database,
  expectedAdditionalViolations = [],
  owner,
  ownerClient,
  runtime,
  runtimeConfiguration,
  scenario,
  secrets,
  setupSql,
}) {
  await ownerClient.query(setupSql);
  await verifyApiRejectsPrivileges(
    runtimeConfiguration,
    ['unexpected_grant_option', ...expectedAdditionalViolations],
    scenario,
  );
  runProvisioner(database, owner, runtime, secrets);
  process.stdout.write(`GRANT_OPTION_REPAIR_PASS scenario=${scenario}\n`);
}

async function validateDatabase(admin, label, suffix, cleanup) {
  const database = `kora_s1203a_database_${label}_${suffix}`;
  const owner = `kora_s1203a_owner_${label}_${suffix}`;
  const runtime = `kora_s1203a_runtime_${label}_${suffix}`;
  const thirdParty = `kora_s1203a_thirdparty_${label}_${suffix}`;
  const ownerPassword = adminConfiguration().password;
  const runtimePassword = process.env.S1203A_RUNTIME_PASSWORD;
  const secrets = [ownerPassword, runtimePassword];
  await createOwnerRole(admin, owner, ownerPassword);
  cleanup.roles.push(owner);
  await createThirdPartyRole(admin, thirdParty);
  cleanup.roles.push(thirdParty);
  await createDatabase(admin, database, owner);
  cleanup.databases.push(database);
  cleanup.roles.unshift(runtime);
  if (label === 'b') {
    await createDegradedRuntimeRole(admin, runtime, runtimePassword, owner, database);
  }

  const environment = prismaEnvironment(database, owner, ownerPassword);
  const runtimeConfiguration = databaseConfiguration(database, runtime, runtimePassword);
  runPrisma(['migrate', 'deploy', '--config', 'prisma.config.ts'], environment, secrets);
  runPrisma(['migrate', 'status', '--config', 'prisma.config.ts'], environment, secrets);

  const ownerClient = new Client(databaseConfiguration(database, owner, ownerPassword));
  await ownerClient.connect();
  try {
    await ownerClient.query(`CREATE SCHEMA s1203a_safe AUTHORIZATION ${quoteIdentifier(owner)}`);
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
    await verifyApiRejectsPrivileges(
      runtimeConfiguration,
      ['unexpected_table_privilege'],
      'public_column_write_privilege',
    );
    runProvisioner(database, owner, runtime, secrets);
    const recoverySignature = await privilegeSignature(ownerClient, runtime, database);
    if (firstSignature !== recoverySignature) {
      fail(`database ${label.toUpperCase()} drift recovery did not converge`);
    }

    const unsafeScenarios = [
      verifyRuntimeOwnedSchemaRejected,
      verifyPublicCreateSchemaRejected,
      verifyRuntimeOwnedPublicObjectRejected,
      verifyRuntimeOwnedCollationRejected,
      verifyExternalTablePrivilegeRejected,
      verifyExternalColumnPrivilegeRejected,
      verifyExternalSequencePrivilegeRejected,
      verifyExternalRoutinePrivilegeRejected,
      verifyExternalTypePrivilegeRejected,
      verifyExternalDefaultPrivilegeRejected,
      verifyThirdPartyPublicDefaultPrivilegeRejected,
      (context) => verifyParameterPrivilegeRejected(context, 'parameter_direct_set'),
      (context) => verifyParameterPrivilegeRejected(context, 'parameter_public_set'),
      (context) => verifyParameterPrivilegeRejected(context, 'parameter_direct_alter_system'),
      (context) => verifyParameterPrivilegeRejected(context, 'parameter_public_alter_system'),
      (context) => verifyParameterPrivilegeRejected(context, 'parameter_set_grant_option'),
    ];
    for (const verifyScenario of unsafeScenarios) {
      await verifyScenario({
        database,
        owner,
        ownerClient,
        runtime,
        runtimeConfiguration,
        secrets,
        thirdParty,
      });
      runProvisioner(database, owner, runtime, secrets);
      const repairedSignature = await privilegeSignature(ownerClient, runtime, database);
      if (firstSignature !== repairedSignature) {
        fail(`database ${label.toUpperCase()} unsafe-state refusal recovery did not converge`);
      }
    }

    const grantOptionScenarios = [
      {
        scenario: 'database_connect_grant_option',
        setupSql: `GRANT CONNECT ON DATABASE ${quoteIdentifier(database)} TO ${quoteIdentifier(runtime)} WITH GRANT OPTION`,
      },
      {
        scenario: 'public_schema_usage_grant_option',
        setupSql: `GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(runtime)} WITH GRANT OPTION`,
      },
      {
        scenario: 'public_table_select_grant_option',
        setupSql: `GRANT SELECT ON TABLE public."Customer" TO ${quoteIdentifier(runtime)} WITH GRANT OPTION`,
      },
      {
        expectedAdditionalViolations: ['unexpected_default_privilege'],
        scenario: 'public_default_select_grant_option',
        setupSql: `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${quoteIdentifier(runtime)} WITH GRANT OPTION`,
      },
    ];
    for (const grantOptionScenario of grantOptionScenarios) {
      await verifyGrantOptionRepair({
        database,
        owner,
        ownerClient,
        runtime,
        runtimeConfiguration,
        secrets,
        ...grantOptionScenario,
      });
      const repairedSignature = await privilegeSignature(ownerClient, runtime, database);
      if (firstSignature !== repairedSignature) {
        fail(`database ${label.toUpperCase()} grant-option recovery did not converge`);
      }
    }

    process.stdout.write(
      `RUNTIME_DATABASE_${label.toUpperCase()}_SCENARIOS provisioning_runs=${3 + unsafeScenarios.length + grantOptionScenarios.length} refused_unsafe_states=${unsafeScenarios.length} grant_option_repairs=${grantOptionScenarios.length}\n`,
    );
  } finally {
    await ownerClient.end();
  }

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
    await assertDenied(
      runtimeClient,
      'set_session_replication_role',
      'SET session_replication_role = replica',
    );
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
    `RUNTIME_DATABASE_${label.toUpperCase()}_PASS tables=34 prisma_adapter=7.9.1 public_grants=0 type_privileges=0 parameter_privileges=0 grant_options=0\n`,
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
      'S1.2-03A_RUNTIME_BOUNDARY_PASS databases=2 idempotent=true prisma_select=true denials=16 successful_provisioning_runs=46 unsafe_state_rejections=32 grant_option_repairs=8\n',
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
