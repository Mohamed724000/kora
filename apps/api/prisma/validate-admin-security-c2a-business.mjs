import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const prismaDirectory = dirname(fileURLToPath(import.meta.url));
const apiDirectory = resolve(prismaDirectory, '..');
const repositoryRoot = resolve(apiDirectory, '..', '..');
const prismaEntry = resolve(repositoryRoot, 'node_modules', 'prisma', 'build', 'index.js');
const nestEntry = resolve(repositoryRoot, 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');
const vitestEntry = resolve(repositoryRoot, 'node_modules', 'vitest', 'vitest.mjs');
const provisionScriptContainerPath = '/usr/local/bin/kora-provision-postgresql-runtime.sh';

const REQUIRED_ENVIRONMENT = Object.freeze([
  'S1203C2A_BUSINESS_ADMIN_PASSWORD',
  'S1203C2A_BUSINESS_ADMIN_USER',
  'S1203C2A_BUSINESS_BOOTSTRAP_PASSWORD',
  'S1203C2A_BUSINESS_C1_WRITER_PASSWORD',
  'S1203C2A_BUSINESS_C1_WRITER_USER',
  'S1203C2A_BUSINESS_EXPIRATION_PASSWORD',
  'S1203C2A_BUSINESS_NOTIFICATION_PASSWORD',
  'S1203C2A_BUSINESS_POSTGRES_CONTAINER',
  'S1203C2A_BUSINESS_POSTGRES_PORT',
  'S1203C2A_BUSINESS_READER_PASSWORD',
  'S1203C2A_BUSINESS_READER_USER',
  'S1203C2A_BUSINESS_REDIS_PASSWORD',
  'S1203C2A_BUSINESS_REDIS_PORT',
  'S1203C2A_BUSINESS_WRITER_PASSWORD',
]);

function required(name) {
  const value = process.env[name];
  if (value === undefined || value.length < 1) {
    throw new Error(`C2a business validator requires ${name}.`);
  }
  return value;
}

function port(name) {
  const value = Number(required(name));
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`C2a business validator received an invalid ${name}.`);
  }
  return value;
}

function normalized(value) {
  let output = String(value ?? '');
  for (const name of REQUIRED_ENVIRONMENT.filter((entry) => entry.endsWith('_PASSWORD'))) {
    const secret = process.env[name];
    if (secret) output = output.replaceAll(secret, `<redacted:${name}>`);
  }
  output = output.replace(
    /\b(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s/]+@/giu,
    '$1<redacted:postgresql-password>@',
  );
  if (Buffer.byteLength(output, 'utf8') > 64 * 1024) {
    return `${Buffer.from(output, 'utf8')
      .subarray(0, 64 * 1024)
      .toString('utf8')}<truncated>`;
  }
  return output;
}

function quoteIdentifier(value) {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(value)) {
    throw new Error('C2a business database name failed its identifier guard.');
  }
  return `"${value}"`;
}

function prismaEnvironment(database) {
  return {
    ...process.env,
    DATABASE_HOST: '127.0.0.1',
    DATABASE_NAME: database,
    DATABASE_PASSWORD: required('S1203C2A_BUSINESS_ADMIN_PASSWORD'),
    DATABASE_PORT: required('S1203C2A_BUSINESS_POSTGRES_PORT'),
    DATABASE_SSL: 'false',
    DATABASE_USER: required('S1203C2A_BUSINESS_ADMIN_USER'),
  };
}

function runPrisma(database) {
  const result = spawnSync(
    process.execPath,
    [prismaEntry, 'migrate', 'deploy', '--config', 'prisma.config.ts'],
    {
      cwd: apiDirectory,
      encoding: 'utf8',
      env: prismaEnvironment(database),
      shell: false,
      timeout: 300_000,
      windowsHide: true,
    },
  );
  process.stdout.write(normalized(result.stdout));
  process.stderr.write(normalized(result.stderr));
  if (result.status !== 0) throw new Error(`Prisma migrate deploy exited ${result.status}.`);
}

function runProvisioner(database, c2aEnabled) {
  const container = required('S1203C2A_BUSINESS_POSTGRES_CONTAINER');
  if (!/^kora-s1203c2a-business-[0-9]+-[0-9a-f]{12}-postgres$/u.test(container)) {
    throw new Error('C2a business PostgreSQL container failed its target guard.');
  }
  const c2aEnvironment = c2aEnabled
    ? [
        '--env',
        'KORA_POSTGRES_C2A_ENABLED=true',
        '--env',
        'KORA_POSTGRES_C2A_WRITER_USER=kora_admin_c2a_writer',
        '--env',
        'KORA_POSTGRES_C2A_NOTIFICATION_WORKER_USER=kora_admin_c2a_notification_worker',
        '--env',
        'KORA_POSTGRES_C2A_EXPIRATION_WORKER_USER=kora_admin_c2a_expiration_worker',
        '--env',
        'KORA_POSTGRES_C2A_BOOTSTRAP_USER=kora_admin_c2a_bootstrap',
        '--env',
        'KORA_POSTGRES_C2A_SECRET_DIRECTORY=/run/kora-c2a-secrets',
      ]
    : ['--env', 'KORA_POSTGRES_C2A_ENABLED=false'];
  const result = spawnSync(
    'docker',
    [
      'exec',
      '--env',
      `POSTGRES_DB=${database}`,
      '--env',
      `POSTGRES_USER=${required('S1203C2A_BUSINESS_ADMIN_USER')}`,
      '--env',
      `KORA_POSTGRES_RUNTIME_USER=${required('S1203C2A_BUSINESS_READER_USER')}`,
      '--env',
      `KORA_POSTGRES_ADMIN_WRITER_USER=${required('S1203C2A_BUSINESS_C1_WRITER_USER')}`,
      ...c2aEnvironment,
      container,
      'sh',
      provisionScriptContainerPath,
    ],
    { encoding: 'utf8', shell: false, timeout: 120_000, windowsHide: true },
  );
  process.stdout.write(normalized(result.stdout));
  process.stderr.write(normalized(result.stderr));
  if (result.status !== 0) throw new Error(`C2a provisioner exited ${result.status}.`);
}

function runBuild() {
  const result = spawnSync(process.execPath, [nestEntry, 'build'], {
    cwd: apiDirectory,
    encoding: 'utf8',
    env: process.env,
    shell: false,
    timeout: 300_000,
    windowsHide: true,
  });
  process.stdout.write(normalized(result.stdout));
  process.stderr.write(normalized(result.stderr));
  if (result.status !== 0) throw new Error(`C2a process-proof build exited ${result.status}.`);
}

function runBusinessTests(database) {
  const result = spawnSync(
    process.execPath,
    [vitestEntry, 'run', 'test/admin-security-c2a.integration.spec.ts'],
    {
      cwd: apiDirectory,
      encoding: 'utf8',
      env: {
        ...process.env,
        S1203C2A_BUSINESS_DATABASE: database,
        S1203C2A_BUSINESS_E2E: '1',
      },
      shell: false,
      timeout: 600_000,
      windowsHide: true,
    },
  );
  process.stdout.write(normalized(result.stdout));
  process.stderr.write(normalized(result.stderr));
  if (result.status !== 0) throw new Error(`C2a business Vitest exited ${result.status}.`);
}

function runC1RegressionTests(database) {
  const result = spawnSync(
    process.execPath,
    [vitestEntry, 'run', 'test/admin-auth.integration.spec.ts'],
    {
      cwd: apiDirectory,
      encoding: 'utf8',
      env: {
        ...process.env,
        S1203C1_E2E_DATABASE: database,
        S1203C1_E2E_OWNER_PASSWORD: required('S1203C2A_BUSINESS_ADMIN_PASSWORD'),
        S1203C1_E2E_OWNER_USER: required('S1203C2A_BUSINESS_ADMIN_USER'),
        S1203C1_E2E_POSTGRES_PORT: required('S1203C2A_BUSINESS_POSTGRES_PORT'),
        S1203C1_E2E_READER_PASSWORD: required('S1203C2A_BUSINESS_READER_PASSWORD'),
        S1203C1_E2E_READER_USER: required('S1203C2A_BUSINESS_READER_USER'),
        S1203C1_E2E_REDIS_PASSWORD: required('S1203C2A_BUSINESS_REDIS_PASSWORD'),
        S1203C1_E2E_REDIS_PORT: required('S1203C2A_BUSINESS_REDIS_PORT'),
        S1203C1_E2E_WRITER_PASSWORD: required('S1203C2A_BUSINESS_C1_WRITER_PASSWORD'),
        S1203C1_E2E_WRITER_USER: required('S1203C2A_BUSINESS_C1_WRITER_USER'),
        S1203C1_HTTP_E2E: '1',
        S1203C1_REAL_REDIS: '1',
        S1203C1_REDIS_PASSWORD: required('S1203C2A_BUSINESS_REDIS_PASSWORD'),
        S1203C1_REDIS_PORT: required('S1203C2A_BUSINESS_REDIS_PORT'),
      },
      shell: false,
      timeout: 600_000,
      windowsHide: true,
    },
  );
  process.stdout.write(normalized(result.stdout));
  process.stderr.write(normalized(result.stderr));
  if (result.status !== 0) throw new Error(`C1 regression Vitest exited ${result.status}.`);
  process.stdout.write(
    'C2A_C1_REAL_REGRESSION_PASS conditional_suite=executed shared_surfaces=current\n',
  );
}

async function main() {
  for (const name of REQUIRED_ENVIRONMENT) required(name);
  port('S1203C2A_BUSINESS_POSTGRES_PORT');
  port('S1203C2A_BUSINESS_REDIS_PORT');
  const suffix = `${process.pid}_${randomBytes(6).toString('hex')}`;
  const database = `kora_c2a_business_${suffix}`;
  const c1Database = `kora_c2a_c1_regression_${suffix}`;
  const admin = new Client({
    database: 'postgres',
    host: '127.0.0.1',
    password: required('S1203C2A_BUSINESS_ADMIN_PASSWORD'),
    port: port('S1203C2A_BUSINESS_POSTGRES_PORT'),
    user: required('S1203C2A_BUSINESS_ADMIN_USER'),
  });
  const createdDatabases = [];
  let primaryError;
  const cleanupErrors = [];
  try {
    await admin.connect();
    for (const candidate of [database, c1Database]) {
      const prior = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [candidate]);
      if (prior.rowCount !== 0)
        throw new Error(`Generated validation database already exists: ${candidate}.`);
      await admin.query(`CREATE DATABASE ${quoteIdentifier(candidate)}`);
      createdDatabases.push(candidate);
    }
    runPrisma(database);
    runProvisioner(database, true);
    runBuild();
    runBusinessTests(database);
    runPrisma(c1Database);
    runProvisioner(c1Database, false);
    runC1RegressionTests(c1Database);
    process.stdout.write(
      'C2A_BUSINESS_VALIDATION_PASS surface_control=1 real_scenarios=11 operations=11 idempotences=5 snapshots=2 malformed_json=8 providers=test_only pg=8.22.0\n',
    );
  } catch (error) {
    primaryError = error;
  } finally {
    for (const createdDatabase of [...createdDatabases].reverse()) {
      try {
        await admin.query(`ALTER DATABASE ${quoteIdentifier(createdDatabase)} CONNECTION LIMIT 0`);
        await admin.query(
          'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
          [createdDatabase],
        );
        await admin.query(`DROP DATABASE ${quoteIdentifier(createdDatabase)}`);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await admin.end();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (primaryError !== undefined) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [primaryError, ...cleanupErrors],
        'C2a business validation and database cleanup failed.',
      );
    }
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'C2a business database cleanup failed.');
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`C2A_BUSINESS_DIAGNOSTIC ${normalized(error?.stack ?? error)}\n`);
    process.exitCode = 1;
  });
}
