import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const { Client } = pg;
const prismaDirectory = dirname(fileURLToPath(import.meta.url));
const apiDirectory = resolve(prismaDirectory, '..');
const repositoryRoot = resolve(apiDirectory, '..', '..');
const prismaEntry = resolve(repositoryRoot, 'node_modules', 'prisma', 'build', 'index.js');
const migrationsDirectory = resolve(prismaDirectory, 'migrations');
const HISTORICAL_MIGRATIONS = [
  {
    name: '20260914000000_canonical_postgresql_baseline',
    sha256: '37e97b5bb370447fdfa6cc856c44d8d25dd518b43879ff8cd04c951ad062c6f6',
  },
  {
    name: '20260914000100_canonical_sql_constraints',
    sha256: 'e316e5fcf0b452c003074ba7e6cf60a07384b68fb2d904cfd387cac54919ffb2',
  },
];
const C1_MIGRATION = '20261002170022_admin_auth_session_runtime';
const LOCK_SHA256 = '99836963713b4f5b269ad49af0ed3d7b0b2e336115c2f92dc9ac683d139d0900';
const EXPECTED_MODELS = 39;
const EXPECTED_TABLES_WITH_MIGRATION_HISTORY = 40;

function fail(message) {
  throw new Error(`S1.2-03C1 PostgreSQL validation failed: ${message}`);
}

function normalizeOutput(value) {
  let normalized = value
    .replaceAll(repositoryRoot.split(sep).join('/'), '<repository>')
    .replaceAll(repositoryRoot, '<repository>')
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, '<redacted-database-url>');
  for (const secretName of [
    'S1203C1_ADMIN_PASSWORD',
    'S1203C1_READER_PASSWORD',
    'S1203C1_WRITER_PASSWORD',
  ]) {
    const secret = process.env[secretName];
    if (secret !== undefined && secret.length > 0)
      normalized = normalized.replaceAll(secret, '<redacted>');
  }
  return normalized;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function migrationPath(name) {
  return resolve(migrationsDirectory, name, 'migration.sql');
}

function verifyImmutableHistory() {
  for (const migration of HISTORICAL_MIGRATIONS) {
    const contents = readFileSync(migrationPath(migration.name));
    if (sha256(contents) !== migration.sha256)
      fail(`historical migration changed: ${migration.name}`);
  }
  const lock = readFileSync(resolve(migrationsDirectory, 'migration_lock.toml'));
  if (sha256(lock) !== LOCK_SHA256) fail('migration_lock.toml changed');
  process.stdout.write('HISTORICAL_MIGRATIONS_IMMUTABLE_PASS migrations=2 lock=unchanged\n');
}

function databaseName(label) {
  const name = `kora_s1203c1_${label}_${process.pid}_${randomBytes(4).toString('hex')}`;
  if (!/^kora_s1203c1_[ab]_\d+_[a-f0-9]{8}$/u.test(name) || name.length > 63) {
    fail('generated database name failed its destructive-operation guard');
  }
  return name;
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(value)) fail('unsafe SQL identifier');
  return `"${value.replaceAll('"', '""')}"`;
}

function adminConfiguration(database = 'postgres') {
  return {
    database,
    host: process.env.S1203C1_ADMIN_HOST,
    password: process.env.S1203C1_ADMIN_PASSWORD,
    port: Number(process.env.S1203C1_ADMIN_PORT),
    user: process.env.S1203C1_ADMIN_USER,
  };
}

function roleConfiguration(database, role, password) {
  return {
    database,
    host: process.env.S1203C1_ADMIN_HOST,
    password,
    port: Number(process.env.S1203C1_ADMIN_PORT),
    user: role,
  };
}

function prismaEnvironment(database) {
  return {
    ...process.env,
    DATABASE_HOST: process.env.S1203C1_ADMIN_HOST,
    DATABASE_PORT: process.env.S1203C1_ADMIN_PORT,
    DATABASE_NAME: database,
    DATABASE_USER: process.env.S1203C1_ADMIN_USER,
    DATABASE_PASSWORD: process.env.S1203C1_ADMIN_PASSWORD,
    DATABASE_SSL: 'false',
  };
}

function runPrisma(argumentsList, database, allowedExitCodes = [0]) {
  const result = spawnSync(process.execPath, [prismaEntry, ...argumentsList], {
    cwd: apiDirectory,
    encoding: 'utf8',
    env: prismaEnvironment(database),
    windowsHide: true,
  });
  if (result.error !== undefined) throw result.error;
  if (!allowedExitCodes.includes(result.status)) {
    fail(
      `Prisma ${argumentsList.join(' ')} exited ${result.status}.\n${normalizeOutput(`${result.stdout ?? ''}${result.stderr ?? ''}`)}`,
    );
  }
  return { status: result.status, stderr: result.stderr ?? '', stdout: result.stdout ?? '' };
}

async function createDatabase(admin, name) {
  const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (existing.rowCount !== 0) fail('ephemeral database unexpectedly existed');
  await admin.query(`CREATE DATABASE ${quoteIdentifier(name)} ENCODING 'UTF8'`);
}

async function dropDatabase(admin, name) {
  if (!/^kora_s1203c1_[ab]_\d+_[a-f0-9]{8}$/u.test(name)) fail('refused unsafe cleanup target');
  await admin.query(`DROP DATABASE ${quoteIdentifier(name)} WITH (FORCE)`);
  process.stdout.write(`TARGETED_C1_DATABASE_REMOVED ${name}\n`);
}

async function applyMigrationSql(client, name) {
  await client.query(readFileSync(migrationPath(name), 'utf8'));
}

function runDocker(argumentsList, allowedExitCodes = [0]) {
  const result = spawnSync('docker', argumentsList, { encoding: 'utf8', windowsHide: true });
  if (result.error !== undefined) throw result.error;
  if (!allowedExitCodes.includes(result.status)) {
    fail(
      `docker ${argumentsList[0]} exited ${result.status}.\n${normalizeOutput(`${result.stdout ?? ''}${result.stderr ?? ''}`)}`,
    );
  }
  return result;
}

function provisionerArguments(database) {
  return [
    'exec',
    '--env',
    `POSTGRES_DB=${database}`,
    '--env',
    `POSTGRES_USER=${process.env.S1203C1_ADMIN_USER}`,
    '--env',
    `KORA_POSTGRES_RUNTIME_USER=${process.env.S1203C1_READER_USER}`,
    '--env',
    `KORA_POSTGRES_ADMIN_WRITER_USER=${process.env.S1203C1_WRITER_USER}`,
    process.env.S1203C1_VALIDATION_CONTAINER,
    '/usr/local/bin/kora-provision-postgresql-runtime.sh',
  ];
}

function runProvisioner(database) {
  runDocker(provisionerArguments(database));
}

async function writerRefusalStateSignature(client) {
  const roles = [process.env.S1203C1_READER_USER, process.env.S1203C1_WRITER_USER];
  const queries = [
    {
      sql: `
        SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin,
               rolreplication, rolbypassrls, rolconnlimit, rolvaliduntil,
               pg_catalog.md5(COALESCE(rolpassword, '')) AS credential_fingerprint
        FROM pg_catalog.pg_authid WHERE rolname = ANY($1::text[]) ORDER BY rolname
      `,
      values: [roles],
    },
    {
      sql: `
        SELECT granted.rolname AS granted_role, member.rolname AS member_role,
               membership.admin_option, membership.inherit_option, membership.set_option
        FROM pg_catalog.pg_auth_members AS membership
        JOIN pg_catalog.pg_roles AS granted ON granted.oid = membership.roleid
        JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
        WHERE granted.rolname = ANY($1::text[]) OR member.rolname = ANY($1::text[])
        ORDER BY granted.rolname, member.rolname
      `,
      values: [roles],
    },
    {
      sql: `
        SELECT COALESCE(database_entry.datname, '') AS database_name,
               role_entry.rolname, setting_entry.setting
        FROM pg_catalog.pg_db_role_setting AS role_setting
        LEFT JOIN pg_catalog.pg_database AS database_entry
          ON database_entry.oid = role_setting.setdatabase
        JOIN pg_catalog.pg_roles AS role_entry ON role_entry.oid = role_setting.setrole
        CROSS JOIN LATERAL unnest(role_setting.setconfig) AS setting_entry(setting)
        WHERE role_entry.rolname = ANY($1::text[])
        ORDER BY database_name, role_entry.rolname, setting_entry.setting
      `,
      values: [roles],
    },
    {
      sql: `
        SELECT datname, datdba::text, COALESCE(datacl::text, '') AS acl
        FROM pg_catalog.pg_database WHERE datname = current_database()
      `,
      values: [],
    },
    {
      sql: `
        SELECT nspname, nspowner::text, COALESCE(nspacl::text, '') AS acl
        FROM pg_catalog.pg_namespace
        WHERE nspname <> 'information_schema' AND nspname !~ '^pg_'
        ORDER BY nspname
      `,
      values: [],
    },
    {
      sql: `
        SELECT namespace_entry.nspname, class_entry.relname, class_entry.relkind,
               class_entry.relowner::text, COALESCE(class_entry.relacl::text, '') AS acl
        FROM pg_catalog.pg_class AS class_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry
          ON namespace_entry.oid = class_entry.relnamespace
        WHERE namespace_entry.nspname <> 'information_schema'
          AND namespace_entry.nspname !~ '^pg_'
        ORDER BY namespace_entry.nspname, class_entry.relname, class_entry.relkind
      `,
      values: [],
    },
    {
      sql: `
        SELECT namespace_entry.nspname, class_entry.relname, attribute_entry.attname,
               COALESCE(attribute_entry.attacl::text, '') AS acl
        FROM pg_catalog.pg_attribute AS attribute_entry
        JOIN pg_catalog.pg_class AS class_entry ON class_entry.oid = attribute_entry.attrelid
        JOIN pg_catalog.pg_namespace AS namespace_entry
          ON namespace_entry.oid = class_entry.relnamespace
        WHERE namespace_entry.nspname <> 'information_schema'
          AND namespace_entry.nspname !~ '^pg_'
          AND attribute_entry.attnum > 0 AND NOT attribute_entry.attisdropped
        ORDER BY namespace_entry.nspname, class_entry.relname, attribute_entry.attnum
      `,
      values: [],
    },
    {
      sql: `
        SELECT namespace_entry.nspname, routine_entry.proname,
               pg_catalog.pg_get_function_identity_arguments(routine_entry.oid) AS arguments,
               routine_entry.proowner::text, COALESCE(routine_entry.proacl::text, '') AS acl
        FROM pg_catalog.pg_proc AS routine_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry
          ON namespace_entry.oid = routine_entry.pronamespace
        WHERE (namespace_entry.nspname <> 'information_schema'
               AND namespace_entry.nspname !~ '^pg_')
           OR (namespace_entry.nspname = 'pg_catalog'
               AND (routine_entry.proname ~ '^lo_'
                    OR routine_entry.proname IN ('loread', 'lowrite')))
        ORDER BY namespace_entry.nspname, routine_entry.proname, arguments
      `,
      values: [],
    },
    {
      sql: `
        SELECT namespace_entry.nspname, type_entry.typname, type_entry.typowner::text,
               COALESCE(type_entry.typacl::text, '') AS acl
        FROM pg_catalog.pg_type AS type_entry
        JOIN pg_catalog.pg_namespace AS namespace_entry
          ON namespace_entry.oid = type_entry.typnamespace
        WHERE namespace_entry.nspname <> 'information_schema'
          AND namespace_entry.nspname !~ '^pg_'
        ORDER BY namespace_entry.nspname, type_entry.typname
      `,
      values: [],
    },
    {
      sql: `
        SELECT owner_role.rolname AS owner_role, COALESCE(namespace_entry.nspname, '') AS schema_name,
               default_acl.defaclobjtype, default_acl.defaclacl::text AS acl
        FROM pg_catalog.pg_default_acl AS default_acl
        JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = default_acl.defaclrole
        LEFT JOIN pg_catalog.pg_namespace AS namespace_entry
          ON namespace_entry.oid = default_acl.defaclnamespace
        ORDER BY owner_role.rolname, schema_name, default_acl.defaclobjtype
      `,
      values: [],
    },
    {
      sql: `
        SELECT parname, paracl::text AS acl FROM pg_catalog.pg_parameter_acl ORDER BY parname
      `,
      values: [],
    },
    {
      sql: `
        SELECT oid::text, lomowner::text, COALESCE(lomacl::text, '') AS acl
        FROM pg_catalog.pg_largeobject_metadata ORDER BY oid
      `,
      values: [],
    },
  ];
  const sections = [];
  for (const query of queries) sections.push((await client.query(query.sql, query.values)).rows);
  if (sections[0].length !== 2) fail('refusal signature did not cover both runtime credentials');
  return sha256(JSON.stringify(sections));
}

async function verifyWriterRefusalWithoutMutation(database) {
  const owner = new Client(adminConfiguration(database));
  const schema = 'c1_writer_refusal_probe';
  const quotedSchema = quoteIdentifier(schema);
  const quotedWriter = quoteIdentifier(process.env.S1203C1_WRITER_USER);
  await owner.connect();
  try {
    await owner.query(`CREATE SCHEMA ${quotedSchema}`);
    await owner.query(`GRANT USAGE ON SCHEMA ${quotedSchema} TO ${quotedWriter}`);
    const signatureBefore = await writerRefusalStateSignature(owner);
    const result = spawnSync('docker', provisionerArguments(database), {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.error !== undefined) throw result.error;
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    for (const secret of [
      process.env.S1203C1_READER_PASSWORD,
      process.env.S1203C1_WRITER_PASSWORD,
    ]) {
      if (output.includes(secret)) fail('refused provisioner output exposed a runtime credential');
    }
    const normalized = normalizeOutput(output).trim();
    if (
      result.status === 0 ||
      !/PostgreSQL admin writer provisioning refused unsafe pre-existing state count=[1-9][0-9]*\./u.test(
        normalized,
      )
    ) {
      fail(
        `writer provisioner did not deterministically refuse unsafe state; exit=${result.status ?? 'unknown'}; diagnostic=${normalized.slice(-1_000) || '<empty>'}`,
      );
    }
    if (normalized.length > 2_000) fail('writer refusal diagnostic was not bounded');
    const signatureAfter = await writerRefusalStateSignature(owner);
    if (signatureBefore !== signatureAfter)
      fail(
        'refused writer provisioner mutated ACL, role, setting, membership, or credential state',
      );
    process.stdout.write(
      'C1_WRITER_REFUSAL_NO_MUTATION_PASS credentials=2 acl_role_setting_signature=unchanged diagnostic=bounded\n',
    );
  } finally {
    await owner.query(`REVOKE ALL PRIVILEGES ON SCHEMA ${quotedSchema} FROM ${quotedWriter}`);
    await owner.query(`DROP SCHEMA ${quotedSchema}`);
    await owner.end();
  }
}

async function catalogSignature(client) {
  const queries = [
    `SELECT table_name, column_name, ordinal_position, is_nullable, data_type, udt_name, COALESCE(column_default, '') AS column_default
       FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`,
    `SELECT conname, contype, condeferrable, condeferred, conrelid::regclass::text AS relation,
            pg_get_constraintdef(oid, true) AS definition
       FROM pg_catalog.pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY conname`,
    `SELECT indexname, indexdef FROM pg_catalog.pg_indexes WHERE schemaname = 'public' ORDER BY indexname`,
    `SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
            pg_get_functiondef(p.oid) AS definition
       FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname LIKE 'kora_%' ORDER BY p.proname, arguments`,
    `SELECT t.tgname, c.relname, pg_get_triggerdef(t.oid, true) AS definition
       FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND NOT t.tgisinternal ORDER BY t.tgname`,
    `SELECT t.typname, e.enumsortorder, e.enumlabel
       FROM pg_catalog.pg_type t JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid
       JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' ORDER BY t.typname, e.enumsortorder`,
  ];
  const sections = [];
  for (const query of queries) sections.push((await client.query(query)).rows);
  return sha256(JSON.stringify(sections));
}

async function assertCatalogInventory(client) {
  const tables = await client.query(`
    SELECT tablename FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' ORDER BY tablename
  `);
  if (tables.rowCount !== EXPECTED_TABLES_WITH_MIGRATION_HISTORY) {
    fail(
      `expected ${EXPECTED_TABLES_WITH_MIGRATION_HISTORY} tables including migration history, received ${tables.rowCount}`,
    );
  }
  const models = tables.rows.filter(({ tablename }) => tablename !== '_prisma_migrations');
  if (models.length !== EXPECTED_MODELS)
    fail(`expected ${EXPECTED_MODELS} physical models, received ${models.length}`);
  for (const table of [
    'AdminPreAuthContext',
    'AdminTotpEnrollment',
    'AdminRecoveryContext',
    'AdminRefreshToken',
    'AdminRecoveryCodeBatch',
    'AdminSecurityEvent',
  ]) {
    if (!models.some(({ tablename }) => tablename === table)) fail(`missing C1 table ${table}`);
  }
  const migrations = await client.query(`
    SELECT migration_name FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY started_at
  `);
  if (
    JSON.stringify(migrations.rows.map(({ migration_name }) => migration_name)) !==
    JSON.stringify([...HISTORICAL_MIGRATIONS.map(({ name }) => name), C1_MIGRATION])
  )
    fail('migration history is not the exact three-migration chain');
  process.stdout.write('C1_CATALOG_INVENTORY_PASS models=39 tables=40 migrations=3\n');
}

function comparePrismaProjection(database) {
  const result = runPrisma(
    [
      'migrate',
      'diff',
      '--config',
      'prisma.config.ts',
      '--from-schema',
      'prisma/schema.prisma',
      '--to-config-datasource',
      '--exit-code',
    ],
    database,
    [0, 2],
  );
  const forbidden =
    /Added tables|Removed tables|Added columns|Removed columns|Changed the .* column|Changed the .* enum/iu;
  if (forbidden.test(result.stdout) || forbidden.test(result.stderr)) {
    fail(`Prisma projection drift.\n${normalizeOutput(`${result.stdout}${result.stderr}`)}`);
  }
  process.stdout.write(`C1_PRISMA_PROJECTION_PASS postgresqlExtensions=${result.status === 2}\n`);
}

async function expectFailure(client, label, callback, expectedCodes = ['23514']) {
  await client.query('BEGIN');
  let caught;
  try {
    await callback();
    await client.query('COMMIT');
  } catch (error) {
    caught = error;
    await client.query('ROLLBACK');
  }
  if (caught === undefined) fail(`${label} unexpectedly succeeded`);
  if (!expectedCodes.includes(caught.code)) {
    fail(
      `${label} failed with SQLSTATE ${caught.code ?? 'unknown'} instead of ${expectedCodes.join('|')}`,
    );
  }
}

async function installHistoricalChain(database) {
  const client = new Client(adminConfiguration(database));
  await client.connect();
  try {
    for (const migration of HISTORICAL_MIGRATIONS) {
      await applyMigrationSql(client, migration.name);
      runPrisma(
        ['migrate', 'resolve', '--applied', migration.name, '--config', 'prisma.config.ts'],
        database,
      );
    }
  } finally {
    await client.end();
  }
}

async function insertLegacyAuditFixture(client) {
  await client.query(`
    INSERT INTO "AdminUser" ("id", "email", "passwordHash", "role", "createdAt")
      VALUES ('legacy-admin', 'legacy@example.invalid', 'legacy-password-hash', 'SUPER_ADMIN',
              TIMESTAMP '2026-09-14 00:00:00');
    INSERT INTO "AdminSession" (
      "id", "adminUserId", "tokenFamilyId", "accessTokenJti", "refreshTokenHash",
      "lastTwoFactorAt", "expiresAt", "createdAt", "updatedAt"
    ) VALUES (
      'legacy-session', 'legacy-admin', 'legacy-family', 'legacy-jti', 'legacy-refresh',
      TIMESTAMP '2026-09-14 00:00:00', TIMESTAMP '2026-09-14 08:00:00',
      TIMESTAMP '2026-09-14 00:00:00', TIMESTAMP '2026-09-14 00:00:00'
    );
    INSERT INTO "AuditLog" (
      "id", "adminUserId", "adminSessionId", "action", "entityType", "entityId",
      "maskedBefore", "maskedAfter", "reason", "requestId", "createdAt"
    ) VALUES (
      'legacy-audit', 'legacy-admin', 'legacy-session', 'LEGACY_ACTION', 'LegacyEntity',
      'legacy-entity', '{"state":"before"}'::jsonb, '{"state":"after"}'::jsonb,
      'legacy reason', 'legacy-request-0001', TIMESTAMP '2026-09-14 00:01:00'
    );
  `);
  return (
    await client.query(`
    SELECT "id", "adminUserId", "adminSessionId", "action", "entityType", "entityId",
           "maskedBefore", "maskedAfter", "reason", "requestId", "createdAt"
    FROM "AuditLog" WHERE "id" = 'legacy-audit'
  `)
  ).rows[0];
}

async function verifyLegacyAuditUpgrade(client, before) {
  const after = await client.query(`
    SELECT "id", "adminUserId", "adminSessionId", "action", "entityType", "entityId",
           "maskedBefore", "maskedAfter", "reason", "requestId", "createdAt",
           "version", "eventClass", "context", "subjectAdminUserId",
           "delegatedByAdminUserId", "adminRecoveryContextId", "systemExecutionRefHash",
           "reasonCode", "operatorReason", "causationEventId"
    FROM "AuditLog" WHERE "id" = 'legacy-audit'
  `);
  if (after.rowCount !== 1) fail('legacy AuditLog row was lost during upgrade');
  const row = after.rows[0];
  const preserved = Object.fromEntries(Object.keys(before).map((key) => [key, row[key]]));
  if (JSON.stringify(preserved) !== JSON.stringify(before))
    fail('legacy AuditLog physical values changed');
  if (row.version !== 1) fail('legacy AuditLog did not retain version 1');
  for (const field of [
    'eventClass',
    'context',
    'subjectAdminUserId',
    'delegatedByAdminUserId',
    'adminRecoveryContextId',
    'systemExecutionRefHash',
    'reasonCode',
    'operatorReason',
    'causationEventId',
  ]) {
    if (row[field] !== null) fail(`legacy AuditLog invented ${field}`);
  }
  const admin = await client.query(`
    SELECT "status", "authorizationVersion", "lastAcceptedTotpCounter"
    FROM "AdminUser" WHERE "id" = 'legacy-admin'
  `);
  if (
    JSON.stringify(admin.rows[0]) !==
    JSON.stringify({
      status: 'DISABLED',
      authorizationVersion: 1,
      lastAcceptedTotpCounter: null,
    })
  )
    fail('legacy AdminUser conservative defaults are incorrect');
  process.stdout.write(
    'LEGACY_AUDIT_UPGRADE_PASS version=1 metadata=absent dml=none status=DISABLED\n',
  );
}

async function insertC1PositiveFixture(client) {
  await client.query(`
    INSERT INTO "AdminUser" (
      "id", "email", "passwordHash", "role", "status", "authorizationVersion",
      "totpSecretEncrypted", "totpEnabledAt", "createdAt"
    ) VALUES (
      'c1-admin', 'c1@example.invalid', 'c1-password-hash', 'SUPER_ADMIN', 'ACTIVE', 1,
      'envelope-v1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
    INSERT INTO "AdminPreAuthContext" (
      "id", "adminUserId", "tokenHash", "purpose", "authorizationVersion", "expiresAt"
    ) VALUES (
      'c1-preauth', 'c1-admin', repeat('a', 64), 'TOTP_VERIFY', 1,
      CURRENT_TIMESTAMP + INTERVAL '10 minutes'
    );
    INSERT INTO "AdminTotpEnrollment" (
      "id", "adminUserId", "adminPreAuthContextId", "secretEncrypted",
      "authorizationVersion", "expiresAt"
    ) VALUES (
      'c1-enrollment', 'c1-admin', 'c1-preauth', 'envelope-v2', 1,
      CURRENT_TIMESTAMP + INTERVAL '10 minutes'
    );
  `);

  await client.query('BEGIN');
  try {
    const selectorAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    await client.query(`
      INSERT INTO "AdminRecoveryCodeBatch" ("id", "adminUserId")
      VALUES ('c1-batch', 'c1-admin')
    `);
    for (let index = 0; index < 10; index += 1) {
      await client.query(
        `
        INSERT INTO "AdminRecoveryCode" (
          "id", "adminUserId", "batchId", "selector", "codeHash"
        ) VALUES ($1, 'c1-admin', 'c1-batch', $2, $3)
      `,
        [
          `c1-code-${index}`,
          `ABCDEFGH${selectorAlphabet[index]}2`,
          `$argon2id$v=19$m=65536,t=3,p=1$fixture${index}`,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  await client.query(`
    UPDATE "AdminRecoveryCode" SET "usedAt" = CURRENT_TIMESTAMP WHERE "id" = 'c1-code-0';
    INSERT INTO "AdminRecoveryContext" (
      "id", "adminUserId", "tokenHash", "recoveryCodeId", "authorizationVersion", "expiresAt"
    ) VALUES (
      'c1-recovery', 'c1-admin', repeat('b', 64), 'c1-code-0', 1,
      CURRENT_TIMESTAMP + INTERVAL '10 minutes'
    );
    INSERT INTO "AdminSession" (
      "id", "adminUserId", "tokenFamilyId", "accessTokenJti", "refreshTokenHash",
      "refreshTokenVersion", "lastTwoFactorAt", "lastActivityAt", "expiresAt",
      "absoluteExpiresAt", "authorizationVersion", "createdAt", "updatedAt"
    ) VALUES (
      'c1-session', 'c1-admin', 'c1-family', 'c1-jti-1', repeat('c', 64), 1,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '8 hours',
      CURRENT_TIMESTAMP + INTERVAL '12 hours', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
    INSERT INTO "AdminRefreshToken" (
      "id", "adminUserId", "adminSessionId", "tokenHash", "generation", "expiresAt"
    ) VALUES (
      'c1-refresh-1', 'c1-admin', 'c1-session', repeat('d', 64), 1,
      CURRENT_TIMESTAMP + INTERVAL '12 hours'
    );
    UPDATE "AdminRefreshToken" SET "consumedAt" = CURRENT_TIMESTAMP WHERE "id" = 'c1-refresh-1';
    INSERT INTO "AdminRefreshToken" (
      "id", "adminUserId", "adminSessionId", "previousTokenId", "tokenHash",
      "generation", "expiresAt"
    ) VALUES (
      'c1-refresh-2', 'c1-admin', 'c1-session', 'c1-refresh-1', repeat('e', 64), 2,
      CURRENT_TIMESTAMP + INTERVAL '12 hours'
    );
    INSERT INTO "AuditLog" (
      "id", "adminUserId", "subjectAdminUserId", "adminSessionId", "eventClass",
      "context", "action", "entityType", "entityId", "reason", "reasonCode",
      "requestId", "createdAt"
    ) VALUES (
      'c1-audit', 'c1-admin', 'c1-admin', 'c1-session', 'SESSION', 'ADMIN_SESSION',
      'ADMIN_SESSION_CREATED', 'AdminSession', 'c1-session', 'SECURITY_RESPONSE',
      'SECURITY_RESPONSE', 'c1-request-0001', CURRENT_TIMESTAMP
    );
    INSERT INTO "AdminSecurityEvent" (
      "id", "adminUserId", "eventClass", "action", "outcome", "requestId",
      "subjectRefHash"
    ) VALUES (
      'c1-security-event', 'c1-admin', 'LOGIN', 'ADMIN_LOGIN', 'SUCCEEDED',
      'c1-request-0002', repeat('f', 64)
    );
  `);
  process.stdout.write(
    'C1_POSITIVE_STORAGE_PASS recovery_codes=10 refresh_generation=2 audit_v2=true\n',
  );
}

async function runConstraintSuite(client) {
  let count = 0;
  const reject = async (label, callback, codes) => {
    await expectFailure(client, label, callback, codes);
    count += 1;
  };

  await reject('selector-profile', () =>
    client.query(`
    INSERT INTO "AdminRecoveryCode" ("id", "adminUserId", "batchId", "selector", "codeHash")
    VALUES ('bad-selector', 'c1-admin', 'c1-batch', 'I00000000000', '$argon2id$bad')
  `),
  );
  await reject('batch-exactly-ten', async () => {
    const selectorAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    await client.query(
      `INSERT INTO "AdminRecoveryCodeBatch" ("id", "adminUserId") VALUES ('bad-batch', 'legacy-admin')`,
    );
    for (let index = 0; index < 9; index += 1) {
      await client.query(
        `
        INSERT INTO "AdminRecoveryCode" ("id", "adminUserId", "batchId", "selector", "codeHash")
        VALUES ($1, 'legacy-admin', 'bad-batch', $2, $3)
      `,
        [`bad-code-${index}`, `ABCDEFGH${selectorAlphabet[index]}3`, `$argon2id$bad${index}`],
      );
    }
  });
  await reject('enrollment-xor', () =>
    client.query(`
    INSERT INTO "AdminTotpEnrollment" (
      "id", "adminUserId", "secretEncrypted", "authorizationVersion", "expiresAt"
    ) VALUES ('bad-enrollment', 'c1-admin', 'envelope', 1, CURRENT_TIMESTAMP + INTERVAL '10 minutes')
  `),
  );
  await client.query(`
    INSERT INTO "AdminPreAuthContext" (
      "id", "adminUserId", "tokenHash", "purpose", "authorizationVersion", "expiresAt"
    ) VALUES (
      'c1-preauth-binding', 'c1-admin', repeat('b', 64), 'FIRST_TOTP_ENROLLMENT', 1,
      CURRENT_TIMESTAMP + INTERVAL '10 minutes'
    )
  `);
  await reject(
    'context-user-binding',
    () =>
      client.query(`
    INSERT INTO "AdminTotpEnrollment" (
      "id", "adminUserId", "adminPreAuthContextId", "secretEncrypted",
      "authorizationVersion", "expiresAt"
    ) VALUES (
      'bad-binding', 'legacy-admin', 'c1-preauth-binding', 'envelope', 1,
      CURRENT_TIMESTAMP + INTERVAL '10 minutes'
    )
  `),
    ['23503'],
  );
  await reject('totp-counter-replay', async () => {
    await client.query(
      `UPDATE "AdminUser" SET "lastAcceptedTotpCounter" = 100 WHERE "id" = 'c1-admin'`,
    );
    await client.query(
      `UPDATE "AdminUser" SET "lastAcceptedTotpCounter" = 99 WHERE "id" = 'c1-admin'`,
    );
  });
  await client.query(`
    UPDATE "AdminUser"
       SET "lastAcceptedTotpCounter" = 100,
           "totpSecretEncrypted" = 'rewrapped-envelope'
     WHERE "id" = 'c1-admin'
  `);
  await reject('totp-rewrap-without-counter', () =>
    client.query(`
      UPDATE "AdminUser"
         SET "totpSecretEncrypted" = 'unbound-rewrapped-envelope'
       WHERE "id" = 'c1-admin'
    `),
  );
  await reject('refresh-predecessor-not-consumed', async () => {
    await client.query(`
      INSERT INTO "AdminRefreshToken" (
        "id", "adminUserId", "adminSessionId", "previousTokenId", "tokenHash",
        "generation", "expiresAt"
      ) VALUES (
        'bad-refresh', 'c1-admin', 'c1-session', 'c1-refresh-2', repeat('1', 64), 3,
        CURRENT_TIMESTAMP + INTERVAL '12 hours'
      )
    `);
  });
  await reject('audit-version-one-new-row', () =>
    client.query(`
    INSERT INTO "AuditLog" (
      "id", "version", "adminUserId", "adminSessionId", "action", "entityType",
      "entityId", "reason", "requestId"
    ) VALUES (
      'bad-audit-v1', 1, 'c1-admin', 'c1-session', 'BAD', 'AdminSession',
      'c1-session', 'bad', 'bad-request-0001'
    )
  `),
  );
  await reject('audit-context-xor', () =>
    client.query(`
    INSERT INTO "AuditLog" (
      "id", "adminUserId", "adminSessionId", "adminRecoveryContextId", "eventClass",
      "context", "action", "entityType", "entityId", "reason", "reasonCode", "requestId"
    ) VALUES (
      'bad-audit-xor', 'c1-admin', 'c1-session', 'c1-recovery', 'SESSION',
      'ADMIN_SESSION', 'BAD', 'AdminSession', 'c1-session', 'SECURITY_RESPONSE',
      'SECURITY_RESPONSE', 'bad-request-0002'
    )
  `),
  );
  await reject('audit-append-only', () =>
    client.query(`UPDATE "AuditLog" SET "action" = 'MUTATED' WHERE "id" = 'c1-audit'`),
  );
  await reject('security-event-append-only', () =>
    client.query(`DELETE FROM "AdminSecurityEvent" WHERE "id" = 'c1-security-event'`),
  );
  await reject('session-family-cap', async () => {
    for (let index = 2; index <= 4; index += 1) {
      await client.query(
        `
        INSERT INTO "AdminSession" (
          "id", "adminUserId", "tokenFamilyId", "accessTokenJti", "refreshTokenHash",
          "lastTwoFactorAt", "lastActivityAt", "expiresAt", "absoluteExpiresAt",
          "authorizationVersion", "createdAt", "updatedAt"
        ) VALUES (
          $1, 'c1-admin', $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP + INTERVAL '8 hours', CURRENT_TIMESTAMP + INTERVAL '12 hours',
          1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
      `,
        [`c1-session-${index}`, `c1-family-${index}`, `c1-jti-${index}`, String(index).repeat(64)],
      );
    }
  });
  process.stdout.write(`C1_NEGATIVE_CONSTRAINTS_PASS tests=${count}\n`);
}

async function expectDenied(client, label, sql, values = []) {
  await expectFailure(client, label, () => client.query(sql, values), ['42501']);
}

async function verifyRuntimeAcl(database) {
  const reader = new Client(
    roleConfiguration(
      database,
      process.env.S1203C1_READER_USER,
      process.env.S1203C1_READER_PASSWORD,
    ),
  );
  const writer = new Client(
    roleConfiguration(
      database,
      process.env.S1203C1_WRITER_USER,
      process.env.S1203C1_WRITER_PASSWORD,
    ),
  );
  await reader.connect();
  await writer.connect();
  try {
    await reader.query('SELECT "id" FROM "Customer" LIMIT 1');
    await reader.query(
      'SELECT "id", "role", "status", "authorizationVersion", "totpEnabledAt" FROM "AdminUser" LIMIT 1',
    );
    await reader.query(
      'SELECT "id", "adminUserId", "authorizationVersion", "lastTwoFactorAt", "lastActivityAt", "expiresAt", "absoluteExpiresAt", "revokedAt", "createdAt", "updatedAt", "stepUpPurpose", "stepUpVerifiedAt", "stepUpExpiresAt" FROM "AdminSession" LIMIT 1',
    );
    await expectDenied(reader, 'reader-email', 'SELECT "email" FROM "AdminUser" LIMIT 1');
    await expectDenied(reader, 'reader-context', 'SELECT "id" FROM "AdminPreAuthContext" LIMIT 1');
    await expectDenied(
      reader,
      'reader-write',
      'UPDATE "AdminSession" SET "revokedAt" = CURRENT_TIMESTAMP WHERE false',
    );

    await writer.query(
      'SELECT "id", "email", "passwordHash", "role", "status", "authorizationVersion", "totpSecretEncrypted", "totpEnabledAt", "lastAcceptedTotpCounter", "createdAt" FROM "AdminUser" LIMIT 1',
    );
    await writer.query(
      `
      INSERT INTO "AdminSecurityEvent" (
        "id", "adminUserId", "eventClass", "action", "outcome", "requestId", "subjectRefHash"
      ) VALUES ($1, 'c1-admin', 'LOGIN', 'ACL_PROBE', 'SUCCEEDED', 'acl-request-0001', repeat('9', 64))
    `,
      [`acl-event-${database}`],
    );
    await expectDenied(
      writer,
      'sink-returning',
      `
      INSERT INTO "AdminSecurityEvent" (
        "id", "adminUserId", "eventClass", "action", "outcome", "requestId"
      ) VALUES ($1, 'c1-admin', 'LOGIN', 'ACL_RETURNING', 'SUCCEEDED', 'acl-request-0002')
      RETURNING "id"
    `,
      [`acl-returning-${database}`],
    );
    await expectDenied(writer, 'sink-select', 'SELECT "id" FROM "AdminSecurityEvent" LIMIT 1');
    await expectDenied(
      writer,
      'sink-update',
      'UPDATE "AdminSecurityEvent" SET "action" = "action" WHERE false',
    );
    await expectDenied(writer, 'sink-delete', 'DELETE FROM "AdminSecurityEvent" WHERE false');
    await expectDenied(writer, 'writer-customer', 'SELECT "id" FROM "Customer" LIMIT 1');
    await expectDenied(writer, 'writer-ddl', 'CREATE TABLE c1_forbidden(id integer)');

    for (const client of [reader, writer]) {
      const boundary = await client.query(`
        SELECT
          current_user AS role_name,
          current_setting('session_replication_role') = 'origin' AS replication_safe,
          current_setting('lo_compat_privileges') = 'off' AS lo_safe,
          NOT has_database_privilege(current_user, current_database(), 'CREATE,TEMPORARY') AS database_safe,
          NOT has_schema_privilege(current_user, 'public', 'CREATE') AS schema_safe,
          NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_default_acl AS default_acl
            CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
            WHERE privilege.grantee = (SELECT oid FROM pg_roles WHERE rolname = current_user)
          ) AS defaults_safe,
          NOT EXISTS (
            SELECT 1 FROM pg_catalog.pg_type AS type_entry
            JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = type_entry.typnamespace
            LEFT JOIN pg_catalog.pg_class AS composite_entry ON composite_entry.oid = type_entry.typrelid
            WHERE namespace_entry.nspname = 'public' AND type_entry.typisdefined
              AND type_entry.typelem = 0
              AND (type_entry.typrelid = 0 OR composite_entry.relkind = 'c')
              AND has_type_privilege(current_user, type_entry.oid, 'USAGE')
          ) AS types_safe
      `);
      const { role_name: roleName, ...capabilities } = boundary.rows[0];
      const violations = Object.entries(capabilities)
        .filter(([, value]) => value !== true)
        .map(([key]) => key);
      if (violations.length > 0) {
        fail(
          `runtime role ${roleName} retained forbidden non-column capabilities: ${violations.join(',')}`,
        );
      }
    }
    process.stdout.write(
      'C1_RUNTIME_ACL_PASS reader=3-projections writer=column-only sinks=insert-only returning=denied enumDml=true typeUsage=0\n',
    );
  } finally {
    await reader.end();
    await writer.end();
  }
}

async function prepareUpgradeDatabase(database) {
  await installHistoricalChain(database);
  const client = new Client(adminConfiguration(database));
  await client.connect();
  try {
    const legacy = await insertLegacyAuditFixture(client);
    await applyMigrationSql(client, C1_MIGRATION);
    runPrisma(
      ['migrate', 'resolve', '--applied', C1_MIGRATION, '--config', 'prisma.config.ts'],
      database,
    );
    await verifyLegacyAuditUpgrade(client, legacy);
    await assertCatalogInventory(client);
    comparePrismaProjection(database);
    await insertC1PositiveFixture(client);
    await runConstraintSuite(client);
    return await catalogSignature(client);
  } finally {
    await client.end();
  }
}

async function prepareEmptyDatabase(database) {
  runPrisma(['migrate', 'deploy', '--config', 'prisma.config.ts'], database);
  runPrisma(['migrate', 'status', '--config', 'prisma.config.ts'], database);
  runPrisma(['migrate', 'deploy', '--config', 'prisma.config.ts'], database);
  const client = new Client(adminConfiguration(database));
  await client.connect();
  try {
    await assertCatalogInventory(client);
    comparePrismaProjection(database);
    await insertC1PositiveFixture(client);
    return await catalogSignature(client);
  } finally {
    await client.end();
  }
}

function assertEnvironment() {
  if (process.env.S1203C1_EPHEMERAL_POSTGRES !== '1')
    fail('S1203C1_EPHEMERAL_POSTGRES=1 is required');
  if (!new Set(['127.0.0.1', 'localhost']).has(process.env.S1203C1_ADMIN_HOST))
    fail('administrative host must be loopback');
  for (const name of [
    'S1203C1_ADMIN_PORT',
    'S1203C1_ADMIN_USER',
    'S1203C1_ADMIN_PASSWORD',
    'S1203C1_READER_USER',
    'S1203C1_READER_PASSWORD',
    'S1203C1_WRITER_USER',
    'S1203C1_WRITER_PASSWORD',
    'S1203C1_VALIDATION_CONTAINER',
  ]) {
    if (process.env[name] === undefined || process.env[name].length === 0)
      fail(`${name} is required`);
  }
  if (process.env.S1203C1_READER_USER === process.env.S1203C1_WRITER_USER)
    fail('reader and writer identities must differ');
  if (process.env.S1203C1_READER_PASSWORD === process.env.S1203C1_WRITER_PASSWORD)
    fail('reader and writer secrets must differ');
}

async function main() {
  assertEnvironment();
  verifyImmutableHistory();
  const admin = new Client(adminConfiguration());
  const databases = [];
  await admin.connect();
  try {
    const version = await admin.query(
      `SELECT current_setting('server_version_num')::integer AS number`,
    );
    if (version.rows[0]?.number < 180_000 || version.rows[0]?.number >= 190_000)
      fail('PostgreSQL 18.x is required');
    const first = databaseName('a');
    const second = databaseName('b');
    await createDatabase(admin, first);
    databases.push(first);
    const firstSignature = await prepareUpgradeDatabase(first);
    await createDatabase(admin, second);
    databases.push(second);
    const secondSignature = await prepareEmptyDatabase(second);
    if (firstSignature !== secondSignature)
      fail('upgrade and empty database catalog signatures differ');
    process.stdout.write(`C1_DATABASE_A_B_PROJECTION_PASS sha256=${firstSignature}\n`);
    for (const [index, database] of databases.entries()) {
      runProvisioner(database);
      runProvisioner(database);
      if (index === 0) await verifyWriterRefusalWithoutMutation(database);
      await verifyRuntimeAcl(database);
    }
  } finally {
    const cleanupErrors = [];
    for (const database of [...databases].reverse()) {
      try {
        await dropDatabase(admin, database);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await admin.end();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length > 0)
      throw new AggregateError(cleanupErrors, 'targeted C1 cleanup failed');
  }
  process.stdout.write(
    'S1.2-03C1_ADMIN_AUTH_POSTGRESQL_PASS databases=2 models=39 tables=40 provisioner_successes=4 provisioner_refusals=1\n',
  );
}

main().catch((error) => {
  process.stderr.write(`${normalizeOutput(error.stack ?? error.message)}\n`);
  process.exitCode = 1;
});
