import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import {
  validateQualifiedPrismaToolchainLock,
  waitForPostgresReadiness,
} from './validate-admin-auth-runtime.mjs';

const { Client } = pg;
const prismaDirectory = dirname(fileURLToPath(import.meta.url));
const apiDirectory = resolve(prismaDirectory, '..');
const repositoryRoot = resolve(apiDirectory, '..', '..');
const prismaEntry = resolve(repositoryRoot, 'node_modules', 'prisma', 'build', 'index.js');
const vitestEntry = resolve(repositoryRoot, 'node_modules', 'vitest', 'vitest.mjs');
const migrationsDirectory = resolve(prismaDirectory, 'migrations');
const provisionScriptContainerPath = '/usr/local/bin/kora-provision-postgresql-runtime.sh';
const lockPath = resolve(repositoryRoot, 'package-lock.json');
const prismaPackagePath = resolve(repositoryRoot, 'node_modules', 'prisma', 'package.json');
const pgPackagePath = resolve(repositoryRoot, 'node_modules', 'pg', 'package.json');
const vitestPackagePath = resolve(repositoryRoot, 'node_modules', 'vitest', 'package.json');
const EXPECTED_PRISMA_VERSION = '7.9.1';
const EXPECTED_PG_VERSION = '8.22.0';
const EXPECTED_PG_TOOLCHAIN_PACKAGES = 14;
const EXPECTED_PG_TOOLCHAIN_SHA256 =
  '27d546111f7b0947315339dd6bc6f1d852398ed00d8ab0b2b5fa15166f1b7b26';
const EXPECTED_VITEST_VERSION = '4.1.12';
const EXPECTED_VITEST_INTEGRITY =
  'sha512-5eWdz2yb3ajxWF3C8C4TjkXl7FGm3n2E/VlazALrQHzK7nYMSGFnCZto0bbPNl77AwkOZVLk0YnBAejUu0NiWA==';
const EXPECTED_VITEST_ENTRY_SHA256 =
  '42482ad2b55f0e22b07e2a01237dc34a2cf23b804b75ee8dcd3dc7ee5d675568';
const HISTORICAL_MIGRATIONS = Object.freeze([
  [
    '20260914000000_canonical_postgresql_baseline',
    '37e97b5bb370447fdfa6cc856c44d8d25dd518b43879ff8cd04c951ad062c6f6',
  ],
  [
    '20260914000100_canonical_sql_constraints',
    'e316e5fcf0b452c003074ba7e6cf60a07384b68fb2d904cfd387cac54919ffb2',
  ],
  [
    '20261002170022_admin_auth_session_runtime',
    'e04f8f340cfb8ad00a059a9a6132104bad872cc3bb5bcafeaa02f13c00b18631',
  ],
]);
const C2A_MIGRATION = 'admin_security_c2a_runtime';
const C2A_MIGRATION_SHA256 = 'eba1a1e4729b57041d681ea7beafa8608d0e7731be94afa014f0e6171f415c8a';
const ROLE_ENVIRONMENT = Object.freeze({
  bootstrap: ['S1203C2A_BOOTSTRAP_USER', 'S1203C2A_BOOTSTRAP_PASSWORD'],
  expiration: ['S1203C2A_EXPIRATION_USER', 'S1203C2A_EXPIRATION_PASSWORD'],
  notification: ['S1203C2A_NOTIFICATION_USER', 'S1203C2A_NOTIFICATION_PASSWORD'],
  writer: ['S1203C2A_WRITER_USER', 'S1203C2A_WRITER_PASSWORD'],
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fail(message) {
  throw new Error(`S1.2-03C2a PostgreSQL validation failed: ${message}`);
}

function canonicalJsonValue(value) {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right, 'en'))
        .map((key) => [key, canonicalJsonValue(value[key])]),
    );
  return value;
}

function parseSupportedPackageLock(packageLock) {
  let parsed;
  try {
    parsed = JSON.parse(Buffer.isBuffer(packageLock) ? packageLock.toString('utf8') : packageLock);
  } catch {
    fail('package-lock.json is not valid JSON');
  }
  if (
    parsed.lockfileVersion !== 3 ||
    parsed.packages === null ||
    typeof parsed.packages !== 'object'
  )
    fail('package-lock.json is not a supported npm lockfile');
  return parsed;
}

function resolveLockedDependency(packages, fromPath, dependency) {
  let cursor = fromPath;
  for (;;) {
    const candidate = cursor
      ? `${cursor}/node_modules/${dependency}`
      : `node_modules/${dependency}`;
    if (Object.hasOwn(packages, candidate)) return candidate;
    const nestedMarker = cursor.lastIndexOf('/node_modules/');
    if (nestedMarker >= 0) {
      cursor = cursor.slice(0, nestedMarker);
      continue;
    }
    if (cursor.startsWith('node_modules/')) {
      cursor = '';
      continue;
    }
    return undefined;
  }
}

export function qualifiedPgToolchainProjection(packageLock) {
  const parsed = parseSupportedPackageLock(packageLock);
  const apiWorkspace = parsed.packages['apps/api'];
  if (apiWorkspace?.dependencies?.pg !== EXPECTED_PG_VERSION)
    fail(`API pg declaration ${EXPECTED_PG_VERSION} is required`);

  const pending = ['node_modules/pg'];
  const visited = new Set();
  while (pending.length > 0) {
    const packagePath = pending.pop();
    if (visited.has(packagePath)) continue;
    const entry = parsed.packages[packagePath];
    if (entry === undefined) fail(`protected pg toolchain package is missing: ${packagePath}`);
    visited.add(packagePath);
    for (const collection of ['dependencies', 'optionalDependencies']) {
      for (const dependency of Object.keys(entry[collection] ?? {}).sort()) {
        const resolved = resolveLockedDependency(parsed.packages, packagePath, dependency);
        if (resolved === undefined)
          fail(`protected pg toolchain dependency is unresolved: ${packagePath} -> ${dependency}`);
        pending.push(resolved);
      }
    }
  }

  return canonicalJsonValue({
    lockfileVersion: parsed.lockfileVersion,
    packages: [...visited]
      .sort((left, right) => left.localeCompare(right, 'en'))
      .map((path) => ({ path, value: parsed.packages[path] })),
    workspace: { pg: apiWorkspace.dependencies.pg },
  });
}

export function validateQualifiedFoundationsToolchainLock(packageLock) {
  let prisma;
  try {
    prisma = validateQualifiedPrismaToolchainLock(packageLock);
  } catch (error) {
    fail(`protected Prisma toolchain rejected: ${String(error?.message ?? error)}`);
  }

  const parsed = parseSupportedPackageLock(packageLock);
  const pgProjection = qualifiedPgToolchainProjection(packageLock);
  const pgProjectionSha256 = sha256(JSON.stringify(pgProjection));
  if (
    pgProjection.packages.length !== EXPECTED_PG_TOOLCHAIN_PACKAGES ||
    pgProjectionSha256 !== EXPECTED_PG_TOOLCHAIN_SHA256
  )
    fail('protected pg toolchain projection changed');
  const pgEntry = pgProjection.packages.find(({ path }) => path === 'node_modules/pg');
  if (pgEntry?.value?.version !== EXPECTED_PG_VERSION)
    fail(`locked pg ${EXPECTED_PG_VERSION} is required`);

  const apiWorkspace = parsed.packages['apps/api'];
  if (apiWorkspace?.devDependencies?.vitest !== EXPECTED_VITEST_VERSION)
    fail(`API Vitest declaration ${EXPECTED_VITEST_VERSION} is required`);
  const vitestEntry = parsed.packages['node_modules/vitest'];
  if (
    vitestEntry?.version !== EXPECTED_VITEST_VERSION ||
    vitestEntry.integrity !== EXPECTED_VITEST_INTEGRITY ||
    sha256(JSON.stringify(canonicalJsonValue(vitestEntry))) !== EXPECTED_VITEST_ENTRY_SHA256
  )
    fail('protected Vitest entry changed');

  return {
    pg: {
      packageCount: pgProjection.packages.length,
      projectionSha256: pgProjectionSha256,
      version: pgEntry.value.version,
    },
    prisma,
    vitest: {
      entrySha256: EXPECTED_VITEST_ENTRY_SHA256,
      integrity: vitestEntry.integrity,
      version: vitestEntry.version,
    },
  };
}

function assertRegularFile(path, label) {
  let stats;
  try {
    stats = lstatSync(path);
  } catch (error) {
    fail(`${label} is missing: ${error.code ?? error.name}`);
  }
  if (!stats.isFile() || stats.isSymbolicLink()) fail(`${label} is not a regular file`);
  if (realpathSync(path) !== resolve(path))
    fail(`${label} resolves through a link or reparse point`);
}

function filesystemIdentity(path, label) {
  let stats;
  try {
    stats = lstatSync(path, { bigint: true });
  } catch (error) {
    fail(`${label} identity is unavailable: ${error.code ?? error.name}`);
  }
  if (!stats.isFile() || stats.isSymbolicLink()) fail(`${label} identity changed type`);
  if (stats.ino === 0n) fail(`${label} has no stable filesystem identity`);
  return {
    birthtimeNs: stats.birthtimeNs.toString(),
    dev: stats.dev.toString(),
    ino: stats.ino.toString(),
    kind: 'file',
    mode: stats.mode.toString(),
  };
}

function installedPackageState(path, expectedVersion, label) {
  const resolvedPath = resolve(path);
  assertRegularFile(resolvedPath, label);
  const bytes = readFileSync(resolvedPath);
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(`${label} is not valid JSON`);
  }
  if (manifest.version !== expectedVersion) fail(`${label} ${expectedVersion} is required`);
  return {
    identity: filesystemIdentity(resolvedPath, label),
    path: resolvedPath,
    sha256: sha256(bytes),
    version: manifest.version,
  };
}

export function captureQualifiedFoundationsToolchainState({
  emit = true,
  migrationsRoot = migrationsDirectory,
  packageLockPath = lockPath,
  pgManifestPath = pgPackagePath,
  prismaManifestPath = prismaPackagePath,
  vitestManifestPath = vitestPackagePath,
} = {}) {
  const resolvedLockPath = resolve(packageLockPath);
  assertRegularFile(resolvedLockPath, 'package-lock.json');
  const packageLock = readFileSync(resolvedLockPath);
  const toolchain = validateQualifiedFoundationsToolchainLock(packageLock);
  const historicalMigrations = HISTORICAL_MIGRATIONS.map(([name, expectedSha256]) => {
    const path = resolve(migrationsRoot, name, 'migration.sql');
    assertRegularFile(path, `historical migration ${name}`);
    const bytes = readFileSync(path);
    const actualSha256 = sha256(bytes);
    if (actualSha256 !== expectedSha256) fail(`historical migration changed: ${name}`);
    return {
      identity: filesystemIdentity(path, `historical migration ${name}`),
      name,
      path,
      sha256: actualSha256,
    };
  });
  const c2aMigrationPath = resolve(migrationsRoot, C2A_MIGRATION, 'migration.sql');
  assertRegularFile(c2aMigrationPath, `historical C2a migration ${C2A_MIGRATION}`);
  const c2aMigrationBytes = readFileSync(c2aMigrationPath);
  const c2aMigrationSha256 = sha256(c2aMigrationBytes);
  if (c2aMigrationSha256 !== C2A_MIGRATION_SHA256) {
    fail(`historical C2a migration changed: ${C2A_MIGRATION}`);
  }
  const state = {
    c2aMigration: {
      identity: filesystemIdentity(c2aMigrationPath, `historical C2a migration ${C2A_MIGRATION}`),
      name: C2A_MIGRATION,
      path: c2aMigrationPath,
      sha256: c2aMigrationSha256,
    },
    historicalMigrations,
    packageLock: {
      identity: filesystemIdentity(resolvedLockPath, 'package-lock.json'),
      path: resolvedLockPath,
      sha256: sha256(packageLock),
    },
    packages: {
      pg: installedPackageState(pgManifestPath, EXPECTED_PG_VERSION, 'installed pg package'),
      prisma: installedPackageState(
        prismaManifestPath,
        EXPECTED_PRISMA_VERSION,
        'installed Prisma package',
      ),
      vitest: installedPackageState(
        vitestManifestPath,
        EXPECTED_VITEST_VERSION,
        'installed Vitest package',
      ),
    },
    toolchain,
  };
  if (emit) {
    process.stdout.write(
      `C2A_QUALIFIED_TOOLCHAIN_PASS prisma=${toolchain.prisma.prismaVersion} prisma_packages=${toolchain.prisma.packageCount} pg=${toolchain.pg.version} pg_packages=${toolchain.pg.packageCount} vitest=${toolchain.vitest.version} package_lock_sha256=${state.packageLock.sha256}\n`,
    );
    process.stdout.write('C2A_IMMUTABLE_INPUTS_PASS history=3 lock=captured\n');
  }
  return state;
}

export function assertQualifiedFoundationsToolchainStateUnchanged(state) {
  const current = captureQualifiedFoundationsToolchainState({
    emit: false,
    migrationsRoot: dirname(dirname(state.historicalMigrations[0].path)),
    packageLockPath: state.packageLock.path,
    pgManifestPath: state.packages.pg.path,
    prismaManifestPath: state.packages.prisma.path,
    vitestManifestPath: state.packages.vitest.path,
  });
  if (
    JSON.stringify(current.packageLock.identity) !== JSON.stringify(state.packageLock.identity) ||
    current.packageLock.sha256 !== state.packageLock.sha256
  )
    fail('package-lock.json changed during validation');
  for (const name of ['pg', 'prisma', 'vitest']) {
    if (
      JSON.stringify(current.packages[name].identity) !==
        JSON.stringify(state.packages[name].identity) ||
      current.packages[name].sha256 !== state.packages[name].sha256
    )
      fail(`installed ${name} package changed during validation`);
  }
  if (JSON.stringify(current.historicalMigrations) !== JSON.stringify(state.historicalMigrations))
    fail('historical migration state changed during validation');
  if (JSON.stringify(current.c2aMigration) !== JSON.stringify(state.c2aMigration)) {
    fail('historical C2a migration state changed during validation');
  }
  process.stdout.write(
    `C2A_TOOLCHAIN_STATE_UNCHANGED_PASS package_lock_sha256=${state.packageLock.sha256} prisma_package_sha256=${state.packages.prisma.sha256} pg_package_sha256=${state.packages.pg.sha256} vitest_package_sha256=${state.packages.vitest.sha256}\n`,
  );
}

export async function runWithProtectedFoundationsInputs(run, captureOptions = {}) {
  const immutableState = captureQualifiedFoundationsToolchainState(captureOptions);
  let validationError;
  try {
    await run();
  } catch (error) {
    validationError = error;
  }

  let immutabilityError;
  try {
    assertQualifiedFoundationsToolchainStateUnchanged(immutableState);
  } catch (error) {
    immutabilityError = error;
  }

  if (validationError !== undefined && immutabilityError !== undefined)
    throw new AggregateError(
      [validationError, immutabilityError],
      'C2a validation failed and protected inputs changed during the campaign',
      { cause: validationError },
    );
  if (validationError !== undefined) throw validationError;
  if (immutabilityError !== undefined) throw immutabilityError;
}

function normalized(value) {
  let result = String(value);
  for (const name of [
    'S1203C2A_ADMIN_PASSWORD',
    'S1203C2A_READER_PASSWORD',
    'S1203C2A_C1_WRITER_PASSWORD',
    'S1203C2A_WRITER_PASSWORD',
    'S1203C2A_NOTIFICATION_PASSWORD',
    'S1203C2A_EXPIRATION_PASSWORD',
    'S1203C2A_BOOTSTRAP_PASSWORD',
  ]) {
    const secret = process.env[name];
    if (secret) result = result.replaceAll(secret, `<redacted:${name}>`);
  }
  result = result.replace(
    /\b(postgres(?:ql)?:\/\/[^:\s/@]+:)[^@\s/]+@/giu,
    '$1<redacted:postgresql-password>@',
  );
  return result;
}

const DIAGNOSTIC_LIMITS = Object.freeze({
  aggregateChildren: 16,
  depth: 6,
  messageBytes: 2 * 1024,
  nodes: 32,
  stackBytes: 8 * 1024,
  stackFrames: 32,
  textBudgetBytes: 44 * 1024,
  totalBytes: 64 * 1024,
});

function readDiagnosticProperty(value, property) {
  try {
    return value?.[property];
  } catch {
    return undefined;
  }
}

function redactedDiagnosticText(value, maximumBytes, budget) {
  const redacted = normalized(value ?? '');
  const available = Math.max(0, Math.min(maximumBytes, budget.remaining));
  let output = redacted;
  let truncated = false;
  while (Buffer.byteLength(output, 'utf8') > available && output.length > 0) {
    output = output.slice(0, Math.floor(output.length / 2));
    truncated = true;
  }
  if (truncated) {
    const marker = '<truncated>';
    while (output.length > 0 && Buffer.byteLength(`${output}${marker}`, 'utf8') > available) {
      output = output.slice(0, -1);
    }
    output = available >= Buffer.byteLength(marker, 'utf8') ? `${output}${marker}` : '';
  }
  budget.remaining -= Buffer.byteLength(output, 'utf8');
  return output;
}

export function renderDiagnosticError(rootError) {
  try {
    const seen = new WeakSet();
    const budget = { remaining: DIAGNOSTIC_LIMITS.textBudgetBytes };
    let nodeCount = 0;

    const visit = (value, depth) => {
      if (nodeCount >= DIAGNOSTIC_LIMITS.nodes) return { truncated: 'node-limit' };
      if ((typeof value === 'object' && value !== null) || typeof value === 'function') {
        if (seen.has(value)) return { truncated: 'cycle-or-duplicate' };
        seen.add(value);
      }
      nodeCount += 1;

      const name = readDiagnosticProperty(value, 'name');
      const code = readDiagnosticProperty(value, 'code');
      const message = readDiagnosticProperty(value, 'message');
      const stack = readDiagnosticProperty(value, 'stack');
      const node = {
        name: redactedDiagnosticText(name ?? 'Error', 256, budget),
        message: redactedDiagnosticText(
          message ?? String(value),
          DIAGNOSTIC_LIMITS.messageBytes,
          budget,
        ),
      };
      if (typeof code === 'string' || typeof code === 'number') {
        node.code = redactedDiagnosticText(code, 256, budget);
      }
      if (typeof stack === 'string') {
        const frames = normalized(stack)
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter((line) => line.startsWith('at '))
          .slice(0, DIAGNOSTIC_LIMITS.stackFrames);
        const renderedFrames = [];
        let stackBudget = DIAGNOSTIC_LIMITS.stackBytes;
        for (const frame of frames) {
          if (stackBudget <= 0 || budget.remaining <= 0) break;
          const frameBudget = {
            remaining: Math.min(stackBudget, budget.remaining),
          };
          const rendered = redactedDiagnosticText(frame, frameBudget.remaining, frameBudget);
          stackBudget -= Buffer.byteLength(rendered, 'utf8');
          budget.remaining -= Buffer.byteLength(rendered, 'utf8');
          renderedFrames.push(rendered);
        }
        if (renderedFrames.length > 0) node.stack = renderedFrames;
        if (frames.length === DIAGNOSTIC_LIMITS.stackFrames) node.stackTruncated = true;
      }

      if (depth >= DIAGNOSTIC_LIMITS.depth) {
        const cause = readDiagnosticProperty(value, 'cause');
        if (cause !== undefined || value instanceof AggregateError) node.truncated = 'depth-limit';
        return node;
      }

      const cause = readDiagnosticProperty(value, 'cause');
      if (cause !== undefined) node.cause = visit(cause, depth + 1);

      if (value instanceof AggregateError) {
        const errors = readDiagnosticProperty(value, 'errors');
        if (Array.isArray(errors)) {
          node.errors = errors
            .slice(0, DIAGNOSTIC_LIMITS.aggregateChildren)
            .map((error, index) => ({ index, error: visit(error, depth + 1) }));
          if (errors.length > DIAGNOSTIC_LIMITS.aggregateChildren) {
            node.errorsTruncated = errors.length - DIAGNOSTIC_LIMITS.aggregateChildren;
          }
        }
      }
      return node;
    };

    const payload = {
      format: 'kora-c2a-diagnostic-error-v1',
      limits: DIAGNOSTIC_LIMITS,
      error: visit(rootError, 0),
    };
    const rendered = JSON.stringify(payload);
    if (Buffer.byteLength(rendered, 'utf8') <= DIAGNOSTIC_LIMITS.totalBytes) return rendered;
    return JSON.stringify({
      format: 'kora-c2a-diagnostic-error-v1',
      outputTruncated: true,
      error: {
        name: redactedDiagnosticText(readDiagnosticProperty(rootError, 'name') ?? 'Error', 256, {
          remaining: 256,
        }),
        message: redactedDiagnosticText(
          readDiagnosticProperty(rootError, 'message') ?? 'diagnostic output exceeded limit',
          1024,
          { remaining: 1024 },
        ),
      },
    });
  } catch {
    let summary = 'original error unavailable';
    try {
      summary = redactedDiagnosticText(
        readDiagnosticProperty(rootError, 'message') ?? 'original error unavailable',
        1024,
        { remaining: 1024 },
      );
    } catch {
      // The constant fallback is intentionally bounded and contains no raw error object.
    }
    return JSON.stringify({
      format: 'kora-c2a-diagnostic-error-v1',
      rendererFailure: true,
      error: { message: summary },
    });
  }
}

async function withPostgresClient(configuration, operation) {
  const client = new Client(configuration);
  let operationError;
  try {
    await client.connect();
    return await operation(client);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      await client.end();
    } catch (endError) {
      if (operationError !== undefined) {
        throw new AggregateError(
          [operationError, endError],
          'PostgreSQL client operation and closure both failed',
          { cause: operationError },
        );
      }
      throw endError;
    }
  }
}

function quoteIdentifier(value) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) fail('unsafe SQL identifier');
  return `"${value.replaceAll('"', '""')}"`;
}

function databaseName(label) {
  return `kora_c2a_${label}_${process.pid}_${randomBytes(4).toString('hex')}`;
}

function adminConfiguration(database = 'postgres') {
  return {
    database,
    host: process.env.S1203C2A_ADMIN_HOST,
    password: process.env.S1203C2A_ADMIN_PASSWORD,
    port: Number(process.env.S1203C2A_ADMIN_PORT),
    ssl: false,
    user: process.env.S1203C2A_ADMIN_USER,
  };
}

function roleConfiguration(database, role) {
  const [userEnvironment, passwordEnvironment] = ROLE_ENVIRONMENT[role];
  return {
    ...adminConfiguration(database),
    password: process.env[passwordEnvironment],
    user: process.env[userEnvironment],
  };
}

function prismaEnvironment(database) {
  return {
    ...process.env,
    DATABASE_HOST: process.env.S1203C2A_ADMIN_HOST,
    DATABASE_NAME: database,
    DATABASE_PASSWORD: process.env.S1203C2A_ADMIN_PASSWORD,
    DATABASE_PORT: process.env.S1203C2A_ADMIN_PORT,
    DATABASE_SSL: 'false',
    DATABASE_USER: process.env.S1203C2A_ADMIN_USER,
  };
}

function historicalC2aMigrationNames() {
  return [...HISTORICAL_MIGRATIONS.map(([name]) => name), C2A_MIGRATION];
}

function runHistoricalC2aMigrateDeploy(database) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'kora-c2a-historical-migrations-'));
  const resolvedTemporaryRoot = resolve(temporaryRoot);
  const resolvedTemporaryDirectory = resolve(tmpdir());
  if (!resolvedTemporaryRoot.startsWith(`${resolvedTemporaryDirectory}${sep}`)) {
    fail('historical C2a migration workspace escaped the operating-system temporary directory');
  }
  try {
    const temporaryPrismaDirectory = resolve(resolvedTemporaryRoot, 'prisma');
    const temporaryMigrationsDirectory = resolve(temporaryPrismaDirectory, 'migrations');
    mkdirSync(temporaryMigrationsDirectory, { recursive: true });
    const schemaPath = resolve(temporaryPrismaDirectory, 'schema.prisma');
    writeFileSync(schemaPath, 'datasource db {\n  provider = "postgresql"\n}\n', {
      encoding: 'utf8',
      flag: 'wx',
    });
    for (const name of historicalC2aMigrationNames()) {
      const source = resolve(migrationsDirectory, name, 'migration.sql');
      const destinationDirectory = resolve(temporaryMigrationsDirectory, name);
      mkdirSync(destinationDirectory);
      copyFileSync(source, resolve(destinationDirectory, 'migration.sql'));
    }
    const configPath = resolve(resolvedTemporaryRoot, 'prisma.config.mjs');
    writeFileSync(
      configPath,
      [
        'export default {',
        '  datasource: { url: process.env.DATABASE_URL },',
        `  migrations: { path: ${JSON.stringify(temporaryMigrationsDirectory)} },`,
        `  schema: ${JSON.stringify(schemaPath)},`,
        '};',
        '',
      ].join('\n'),
      { encoding: 'utf8', flag: 'wx' },
    );
    const environment = prismaEnvironment(database);
    environment.DATABASE_URL = `postgresql://${encodeURIComponent(environment.DATABASE_USER)}:${encodeURIComponent(environment.DATABASE_PASSWORD)}@${environment.DATABASE_HOST}:${environment.DATABASE_PORT}/${encodeURIComponent(environment.DATABASE_NAME)}`;
    const result = spawnSync(
      process.execPath,
      [prismaEntry, 'migrate', 'deploy', '--config', configPath, '--schema', schemaPath],
      {
        cwd: apiDirectory,
        encoding: 'utf8',
        env: environment,
        shell: false,
        windowsHide: true,
      },
    );
    if (result.status !== 0) {
      fail(
        `Prisma historical C2a migrate deploy exited ${result.status}.\n${normalized(
          `${result.stdout ?? ''}${result.stderr ?? ''}`,
        )}`,
      );
    }
  } finally {
    if (resolve(temporaryRoot) !== resolvedTemporaryRoot) {
      fail('historical C2a migration workspace identity changed before cleanup');
    }
    rmSync(resolvedTemporaryRoot, { force: false, recursive: true });
  }
}

function provisionerArguments(database) {
  return [
    'exec',
    '--env',
    `POSTGRES_DB=${database}`,
    '--env',
    `POSTGRES_USER=${process.env.S1203C2A_ADMIN_USER}`,
    '--env',
    `KORA_POSTGRES_RUNTIME_USER=${process.env.S1203C2A_READER_USER}`,
    '--env',
    `KORA_POSTGRES_ADMIN_WRITER_USER=${process.env.S1203C2A_C1_WRITER_USER}`,
    '--env',
    'KORA_POSTGRES_C2A_ENABLED=true',
    '--env',
    `KORA_POSTGRES_C2A_WRITER_USER=${process.env.S1203C2A_WRITER_USER}`,
    '--env',
    `KORA_POSTGRES_C2A_NOTIFICATION_WORKER_USER=${process.env.S1203C2A_NOTIFICATION_USER}`,
    '--env',
    `KORA_POSTGRES_C2A_EXPIRATION_WORKER_USER=${process.env.S1203C2A_EXPIRATION_USER}`,
    '--env',
    `KORA_POSTGRES_C2A_BOOTSTRAP_USER=${process.env.S1203C2A_BOOTSTRAP_USER}`,
    '--env',
    'KORA_POSTGRES_C2A_SECRET_DIRECTORY=/run/kora-c2a-secrets',
    process.env.S1203C2A_VALIDATION_CONTAINER,
    'sh',
    provisionScriptContainerPath,
  ];
}

function runProvisioner(database, allowedExitCodes = [0]) {
  const result = spawnSync('docker', provisionerArguments(database), {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  if (!allowedExitCodes.includes(result.status)) {
    fail(
      `provisioner exited ${result.status}.\n${normalized(
        `${result.stdout ?? ''}${result.stderr ?? ''}`,
      )}`,
    );
  }
  return result;
}

function runRealTransactionTests(database) {
  const result = spawnSync(
    process.execPath,
    [
      vitestEntry,
      'run',
      'src/database/admin-c2-transaction.service.spec.ts',
      'src/database/admin-c2a-boundaries.service.spec.ts',
    ],
    {
      cwd: apiDirectory,
      encoding: 'utf8',
      env: {
        ...process.env,
        S1203C2A_REAL_TRANSACTION: '1',
        S1203C2A_REAL_TRANSACTION_DATABASE: database,
      },
      shell: false,
      windowsHide: true,
    },
  );
  process.stdout.write(normalized(result.stdout ?? ''));
  process.stderr.write(normalized(result.stderr ?? ''));
  if (result.status !== 0) {
    fail(`real pg@8.22.0 transaction tests exited ${result.status}`);
  }
  process.stdout.write(
    'C2A_REAL_TRANSACTION_PASS pg=8.22.0 pool_max=1 ready_for_query=causal discarded_client_reused=false role_boundaries=4\n',
  );
}

async function createDatabase(admin, name) {
  await admin.query(`CREATE DATABASE ${quoteIdentifier(name)}`);
}

async function dropDatabase(admin, name) {
  const timeoutNanoseconds = 5_000_000_000n;
  const startedAt = process.hrtime.bigint();
  let activeSessionCount;
  let attempts = 0;
  while (true) {
    attempts += 1;
    const sessions = await admin.query(
      `SELECT count(*)::integer AS count
       FROM pg_catalog.pg_stat_activity
       WHERE datname = $1
         AND backend_type = 'client backend'
         AND pid <> pg_catalog.pg_backend_pid()`,
      [name],
    );
    activeSessionCount = sessions.rows[0]?.count;
    if (!Number.isInteger(activeSessionCount) || activeSessionCount < 0) {
      fail('database quiescence probe returned an invalid session count');
    }
    if (activeSessionCount === 0) break;

    const elapsedNanoseconds = process.hrtime.bigint() - startedAt;
    if (elapsedNanoseconds >= timeoutNanoseconds) {
      fail(`database quiescence deadline exceeded active_sessions=${activeSessionCount}`);
    }
    const remainingMilliseconds = Number((timeoutNanoseconds - elapsedNanoseconds) / 1_000_000n);
    await new Promise((resolvePromise) =>
      setTimeout(resolvePromise, Math.min(100, Math.max(1, remainingMilliseconds))),
    );
  }

  await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)}`);
  const postcondition = await admin.query(
    `SELECT NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_database WHERE datname = $1
     ) AS absent`,
    [name],
  );
  if (postcondition.rows[0]?.absent !== true) {
    fail('database drop postcondition failed');
  }
  const elapsedMilliseconds = Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
  process.stdout.write(
    `C2A_DATABASE_QUIESCENCE_PASS attempts=${attempts} elapsed_ms=${elapsedMilliseconds} active_sessions=0\n`,
  );
}

async function dropEphemeralRuntimeRoles(admin) {
  const roleNames = [
    process.env.S1203C2A_READER_USER,
    process.env.S1203C2A_C1_WRITER_USER,
    ...Object.values(ROLE_ENVIRONMENT).map(([name]) => process.env[name]),
  ];
  await admin.query(`DROP ROLE ${roleNames.map(quoteIdentifier).join(', ')}`);
}

async function applyMigration(client, name) {
  const sql = readFileSync(resolve(migrationsDirectory, name, 'migration.sql'), 'utf8');
  await client.query(sql);
}

async function expectDenied(client, label, sql, values = [], expectedCodes = ['42501']) {
  try {
    await client.query(sql, values);
  } catch (error) {
    if (expectedCodes.includes(String(error?.code))) return;
    fail(`${label} failed with unexpected PostgreSQL code ${String(error?.code)}`);
  }
  fail(`${label} unexpectedly succeeded`);
}

async function expectTransactionDenied(client, label, callback, expectedCodes = ['23514']) {
  await client.query('BEGIN');
  try {
    await callback();
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (expectedCodes.includes(String(error?.code))) return;
    fail(`${label} failed with unexpected PostgreSQL code ${String(error?.code)}`);
  }
  fail(`${label} unexpectedly committed`);
}

async function catalogSignature(client) {
  const result = await client.query(`
    WITH inventory AS (
      SELECT 'column' AS kind,
             namespace_entry.nspname || '.' || class_entry.relname || '.' ||
             attribute_entry.attname || ':' ||
             pg_catalog.format_type(attribute_entry.atttypid, attribute_entry.atttypmod) || ':' ||
             attribute_entry.attnotnull::text || ':' ||
             COALESCE(pg_catalog.pg_get_expr(default_entry.adbin, default_entry.adrelid), '')
               AS value
      FROM pg_catalog.pg_attribute AS attribute_entry
      JOIN pg_catalog.pg_class AS class_entry
        ON class_entry.oid = attribute_entry.attrelid
      JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = class_entry.relnamespace
      LEFT JOIN pg_catalog.pg_attrdef AS default_entry
        ON default_entry.adrelid = attribute_entry.attrelid
       AND default_entry.adnum = attribute_entry.attnum
      WHERE namespace_entry.nspname = 'public'
        AND class_entry.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND class_entry.relname <> '_prisma_migrations'
        AND attribute_entry.attnum > 0
        AND NOT attribute_entry.attisdropped
      UNION ALL
      SELECT 'constraint',
             namespace_entry.nspname || '.' || class_entry.relname || '.' ||
             constraint_entry.conname || ':' ||
             pg_catalog.pg_get_constraintdef(constraint_entry.oid, true)
      FROM pg_catalog.pg_constraint AS constraint_entry
      JOIN pg_catalog.pg_class AS class_entry ON class_entry.oid = constraint_entry.conrelid
      JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = class_entry.relnamespace
      WHERE namespace_entry.nspname = 'public'
        AND class_entry.relname <> '_prisma_migrations'
      UNION ALL
      SELECT 'index', pg_catalog.pg_get_indexdef(index_entry.indexrelid)
      FROM pg_catalog.pg_index AS index_entry
      JOIN pg_catalog.pg_class AS class_entry ON class_entry.oid = index_entry.indrelid
      JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = class_entry.relnamespace
      WHERE namespace_entry.nspname = 'public'
        AND class_entry.relname <> '_prisma_migrations'
      UNION ALL
      SELECT 'trigger',
             namespace_entry.nspname || '.' || class_entry.relname || '.' ||
             trigger_entry.tgname || ':' || pg_catalog.pg_get_triggerdef(trigger_entry.oid, true)
      FROM pg_catalog.pg_trigger AS trigger_entry
      JOIN pg_catalog.pg_class AS class_entry ON class_entry.oid = trigger_entry.tgrelid
      JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = class_entry.relnamespace
      WHERE namespace_entry.nspname = 'public' AND NOT trigger_entry.tgisinternal
      UNION ALL
      SELECT 'function',
             namespace_entry.nspname || '.' || routine_entry.oid::regprocedure::text || ':' ||
             routine_entry.prosecdef::text || ':' ||
             pg_catalog.pg_get_userbyid(routine_entry.proowner) || ':' ||
             COALESCE(pg_catalog.array_to_string(routine_entry.proconfig, ','), '') || ':' ||
             pg_catalog.pg_get_functiondef(routine_entry.oid)
      FROM pg_catalog.pg_proc AS routine_entry
      JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = routine_entry.pronamespace
      WHERE namespace_entry.nspname = 'public'
      UNION ALL
      SELECT 'view', schemaname || '.' || viewname || ':' || definition
      FROM pg_catalog.pg_views WHERE schemaname = 'public'
      UNION ALL
      SELECT 'enum', namespace_entry.nspname || '.' || type_entry.typname || ':' ||
             string_agg(enum_entry.enumlabel, ',' ORDER BY enum_entry.enumsortorder)
      FROM pg_catalog.pg_type AS type_entry
      JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = type_entry.typnamespace
      JOIN pg_catalog.pg_enum AS enum_entry ON enum_entry.enumtypid = type_entry.oid
      WHERE namespace_entry.nspname = 'public'
      GROUP BY namespace_entry.nspname, type_entry.typname
    )
    SELECT string_agg(kind || ':' || value, E'\n' ORDER BY kind, value) AS signature
    FROM inventory
  `);
  return sha256(result.rows[0]?.signature ?? '');
}

async function provisioningSurfaceSignature(client) {
  const roleNames = [
    process.env.S1203C2A_ADMIN_USER,
    process.env.S1203C2A_READER_USER,
    process.env.S1203C2A_C1_WRITER_USER,
    ...Object.values(ROLE_ENVIRONMENT).map(([name]) => process.env[name]),
  ];
  const result = await client.query(
    `
    WITH target_roles AS (
      SELECT oid, rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
             rolinherit, rolreplication, rolbypassrls, rolconnlimit,
             rolvaliduntil, rolpassword
      FROM pg_catalog.pg_authid
      WHERE rolname = ANY($1::text[])
    ), inventory AS (
      SELECT 'role' AS kind,
             role_entry.rolname || ':' || role_entry.rolcanlogin::text || ':' ||
             role_entry.rolsuper::text || ':' || role_entry.rolcreatedb::text || ':' ||
             role_entry.rolcreaterole::text || ':' || role_entry.rolinherit::text || ':' ||
             role_entry.rolreplication::text || ':' || role_entry.rolbypassrls::text || ':' ||
             role_entry.rolconnlimit::text || ':' || COALESCE(role_entry.rolvaliduntil::text, '') || ':' ||
             pg_catalog.md5(COALESCE(role_entry.rolpassword, '')) AS value
      FROM target_roles AS role_entry
      UNION ALL
      SELECT 'role-setting',
             target_role.rolname || ':' || role_setting.setdatabase::text || ':' ||
             pg_catalog.md5(COALESCE(role_setting.setconfig::text, ''))
      FROM pg_catalog.pg_db_role_setting AS role_setting
      JOIN target_roles AS target_role ON target_role.oid = role_setting.setrole
      UNION ALL
      SELECT 'membership', roleid::text || ':' || member::text || ':' || admin_option::text
      FROM pg_catalog.pg_auth_members
      WHERE roleid IN (SELECT oid FROM target_roles) OR member IN (SELECT oid FROM target_roles)
      UNION ALL
      SELECT 'database-acl', database_entry.datname || ':' || privilege.grantee::text || ':' ||
             privilege.privilege_type || ':' || privilege.is_grantable::text
      FROM pg_catalog.pg_database AS database_entry
      CROSS JOIN LATERAL pg_catalog.aclexplode(database_entry.datacl) AS privilege
      WHERE database_entry.datname = current_database()
      UNION ALL
      SELECT 'schema-acl', namespace_entry.nspname || ':' || privilege.grantee::text || ':' ||
             privilege.privilege_type || ':' || privilege.is_grantable::text
      FROM pg_catalog.pg_namespace AS namespace_entry
      CROSS JOIN LATERAL pg_catalog.aclexplode(namespace_entry.nspacl) AS privilege
      WHERE namespace_entry.nspname = 'public'
      UNION ALL
      SELECT 'class-acl', namespace_entry.nspname || '.' || class_entry.relname || ':' ||
             privilege.grantee::text || ':' || privilege.privilege_type || ':' ||
             privilege.is_grantable::text
      FROM pg_catalog.pg_class AS class_entry
      JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = class_entry.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(class_entry.relacl) AS privilege
      WHERE namespace_entry.nspname = 'public'
      UNION ALL
      SELECT 'column-acl', namespace_entry.nspname || '.' || class_entry.relname || '.' ||
             attribute_entry.attname || ':' || privilege.grantee::text || ':' ||
             privilege.privilege_type || ':' || privilege.is_grantable::text
      FROM pg_catalog.pg_attribute AS attribute_entry
      JOIN pg_catalog.pg_class AS class_entry ON class_entry.oid = attribute_entry.attrelid
      JOIN pg_catalog.pg_namespace AS namespace_entry ON namespace_entry.oid = class_entry.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
      WHERE namespace_entry.nspname = 'public'
        AND attribute_entry.attnum > 0 AND NOT attribute_entry.attisdropped
      UNION ALL
      SELECT 'routine-acl', routine_entry.oid::regprocedure::text || ':' ||
             privilege.grantee::text || ':' || privilege.privilege_type || ':' ||
             privilege.is_grantable::text
      FROM pg_catalog.pg_proc AS routine_entry
      CROSS JOIN LATERAL pg_catalog.aclexplode(routine_entry.proacl) AS privilege
      UNION ALL
      SELECT 'type-acl', type_entry.oid::regtype::text || ':' || privilege.grantee::text || ':' ||
             privilege.privilege_type || ':' || privilege.is_grantable::text
      FROM pg_catalog.pg_type AS type_entry
      CROSS JOIN LATERAL pg_catalog.aclexplode(type_entry.typacl) AS privilege
      UNION ALL
      SELECT 'large-object-acl', large_object.oid::text || ':' || privilege.grantee::text || ':' ||
             privilege.privilege_type || ':' || privilege.is_grantable::text
      FROM pg_catalog.pg_largeobject_metadata AS large_object
      CROSS JOIN LATERAL pg_catalog.aclexplode(large_object.lomacl) AS privilege
      UNION ALL
      SELECT 'parameter-acl', parameter_acl.parname || ':' || privilege.grantee::text || ':' ||
             privilege.privilege_type || ':' || privilege.is_grantable::text
      FROM pg_catalog.pg_parameter_acl AS parameter_acl
      CROSS JOIN LATERAL pg_catalog.aclexplode(parameter_acl.paracl) AS privilege
      UNION ALL
      SELECT 'default-acl', default_acl.oid::text || ':' || default_acl.defaclrole::text || ':' ||
             default_acl.defaclnamespace::text || ':' || default_acl.defaclobjtype::text || ':' ||
             privilege.grantee::text || ':' || privilege.privilege_type || ':' ||
             privilege.is_grantable::text
      FROM pg_catalog.pg_default_acl AS default_acl
      CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS privilege
      UNION ALL
      SELECT 'ownership', dependency.dbid::text || ':' || dependency.classid::text || ':' ||
             dependency.objid::text || ':' || dependency.refobjid::text
      FROM pg_catalog.pg_shdepend AS dependency
      WHERE dependency.refclassid = 'pg_catalog.pg_authid'::regclass
        AND dependency.refobjid IN (SELECT oid FROM target_roles)
        AND dependency.deptype = 'o'
    )
    SELECT kind, value FROM inventory ORDER BY kind, value
  `,
    [roleNames],
  );
  return sha256(JSON.stringify(result.rows));
}

async function installHistoricalChain(client) {
  for (const [name] of HISTORICAL_MIGRATIONS) await applyMigration(client, name);
}

async function insertUpgradeFixtures(client) {
  await applyMigration(client, HISTORICAL_MIGRATIONS[0][0]);
  await applyMigration(client, HISTORICAL_MIGRATIONS[1][0]);
  await client.query(`
    INSERT INTO "AdminUser" ("id", "email", "passwordHash", "role", "createdAt")
    VALUES (
      'legacy-admin', 'legacy@example.invalid', 'legacy-password-hash',
      'SUPER_ADMIN', TIMESTAMP '2026-09-14 00:00:00'
    );
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
      'legacy-audit', 'legacy-admin', 'legacy-session', 'LEGACY_ACTION',
      'LegacyEntity', 'legacy-entity', '{"state":"before"}'::jsonb,
      '{"state":"after"}'::jsonb, 'legacy reason', 'legacy-request-0001',
      TIMESTAMP '2026-09-14 00:01:00'
    );
  `);
  await applyMigration(client, HISTORICAL_MIGRATIONS[2][0]);
  await client.query(`
    INSERT INTO "AdminUser" (
      "id", "email", "passwordHash", "role", "status", "authorizationVersion",
      "totpSecretEncrypted", "totpEnabledAt", "createdAt"
    ) VALUES (
      'c1-admin', 'c1@example.invalid', 'c1-password-hash', 'SUPER_ADMIN',
      'ACTIVE', 1, 'c1-totp-envelope', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
    INSERT INTO "AdminSession" (
      "id", "adminUserId", "tokenFamilyId", "accessTokenJti", "refreshTokenHash",
      "refreshTokenVersion", "lastTwoFactorAt", "lastActivityAt", "expiresAt",
      "absoluteExpiresAt", "authorizationVersion", "createdAt", "updatedAt"
    ) VALUES (
      'c1-session', 'c1-admin', 'c1-family', 'c1-jti', repeat('c', 64), 1,
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '8 hours',
      CURRENT_TIMESTAMP + INTERVAL '12 hours', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    );
  `);
  await client.query('BEGIN');
  try {
    await client.query(`
      INSERT INTO "AdminRecoveryCodeBatch" ("id", "adminUserId")
      VALUES ('c1-batch', 'c1-admin')
    `);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let index = 0; index < 10; index += 1) {
      await client.query(
        `INSERT INTO "AdminRecoveryCode" (
           "id", "adminUserId", "batchId", "selector", "codeHash"
         ) VALUES ($1, 'c1-admin', 'c1-batch', $2, $3)`,
        [
          `c1-code-${index}`,
          `ABCDEFGH${alphabet[index]}2`,
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
    UPDATE "AdminRecoveryCode"
    SET "usedAt" = CURRENT_TIMESTAMP
    WHERE "id" = 'c1-code-0';
    INSERT INTO "AdminRecoveryContext" (
      "id", "adminUserId", "tokenHash", "recoveryCodeId",
      "authorizationVersion", "expiresAt"
    ) VALUES (
      'c1-recovery', 'c1-admin', repeat('b', 64), 'c1-code-0', 1,
      CURRENT_TIMESTAMP + INTERVAL '10 minutes'
    );
    INSERT INTO "AuditLog" (
      "id", "adminUserId", "subjectAdminUserId", "adminSessionId",
      "eventClass", "context", "action", "entityType", "entityId",
      "reason", "reasonCode", "requestId"
    ) VALUES (
      'c1-audit', 'c1-admin', 'c1-admin', 'c1-session', 'SESSION',
      'ADMIN_SESSION', 'ADMIN_SESSION_CREATED', 'AdminSession', 'c1-session',
      'SECURITY_RESPONSE', 'SECURITY_RESPONSE', 'c1-request-0001'
    );
    INSERT INTO "AdminSecurityEvent" (
      "id", "adminUserId", "eventClass", "action", "outcome", "requestId",
      "subjectRefHash"
    ) VALUES (
      'c1-security-event', 'c1-admin', 'LOGIN', 'ADMIN_LOGIN', 'SUCCEEDED',
      'c1-request-0002', repeat('f', 64)
    );
  `);
}

async function verifyUpgradePreservation(client) {
  const result = await client.query(`
    SELECT
      (SELECT "version" FROM "AuditLog" WHERE "id" = 'legacy-audit') AS legacy_version,
      (SELECT "version" FROM "AuditLog" WHERE "id" = 'c1-audit') AS c1_version,
      (SELECT "recoveryCodeId" FROM "AdminRecoveryContext"
        WHERE "id" = 'c1-recovery') AS recovery_code_id,
      (SELECT count(*)::integer FROM "AdminRecoveryCode"
        WHERE "batchId" = 'c1-batch') AS recovery_code_count,
      (SELECT count(*)::integer FROM "AdminUser"
        WHERE "id" IN ('legacy-admin', 'c1-admin')) AS admin_count
  `);
  const row = result.rows[0];
  if (
    row?.legacy_version !== 1 ||
    row?.c1_version !== 2 ||
    row?.recovery_code_id !== 'c1-code-0' ||
    row?.recovery_code_count !== 10 ||
    row?.admin_count !== 2
  ) {
    fail('C1/v1/v2/MFA fixtures were not preserved by the C2a migration');
  }
  await client.query(`
    INSERT INTO "AuditLog" (
      "id", "adminUserId", "subjectAdminUserId", "adminSessionId",
      "eventClass", "context", "action", "entityType", "entityId",
      "reason", "reasonCode", "requestId"
    ) VALUES (
      'c1-default-after-c2a', 'c1-admin', 'c1-admin', 'c1-session',
      'SESSION', 'ADMIN_SESSION', 'C1_DEFAULT_AFTER_C2A', 'AdminSession',
      'c1-session', 'SECURITY_RESPONSE', 'SECURITY_RESPONSE',
      'c1-request-after-c2a'
    )
  `);
  const defaultResult = await client.query(
    `SELECT "version", "outcome" FROM "AuditLog" WHERE "id" = 'c1-default-after-c2a'`,
  );
  if (defaultResult.rows[0]?.version !== 2 || defaultResult.rows[0]?.outcome !== null)
    fail('C1 AuditLog default is no longer v2');
  process.stdout.write(
    'C2A_UPGRADE_PRESERVATION_PASS audit_v1=true audit_v2=true mfa_recovery_link=true rows=preserved\n',
  );
}

async function prepareUpgradeDatabase(database) {
  const client = new Client(adminConfiguration(database));
  await client.connect();
  try {
    await insertUpgradeFixtures(client);
    await applyMigration(client, C2A_MIGRATION);
    await verifyUpgradePreservation(client);
    return await catalogSignature(client);
  } finally {
    await client.end();
  }
}

async function prepareEmptyDatabase(database) {
  runHistoricalC2aMigrateDeploy(database);
  const client = new Client(adminConfiguration(database));
  await client.connect();
  try {
    const migrations = await client.query(
      `SELECT migration_name, finished_at IS NOT NULL AS finished
       FROM "_prisma_migrations" ORDER BY started_at`,
    );
    const expectedMigrations = historicalC2aMigrationNames();
    if (
      migrations.rowCount !== expectedMigrations.length ||
      migrations.rows.some((row) => row.finished !== true) ||
      JSON.stringify(migrations.rows.map((row) => row.migration_name)) !==
        JSON.stringify(expectedMigrations)
    ) {
      fail('Prisma did not deploy the four-migration chain in the expected order');
    }
    const inventory = await client.query(`
      SELECT
        count(*) FILTER (WHERE class_entry.relkind IN ('r', 'p'))::integer AS tables,
        count(*) FILTER (WHERE class_entry.relkind = 'v')::integer AS views
      FROM pg_catalog.pg_class AS class_entry
      JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = class_entry.relnamespace
      WHERE namespace_entry.nspname = 'public'
    `);
    if (inventory.rows[0]?.tables !== 49 || inventory.rows[0]?.views !== 2)
      fail('empty database physical inventory is unexpected');
    return await catalogSignature(client);
  } finally {
    await client.end();
  }
}

async function verifyCollisionRefusal(admin, databases) {
  const database = databaseName('collision');
  await createDatabase(admin, database);
  databases.push(database);
  const client = new Client(adminConfiguration(database));
  await client.connect();
  try {
    await installHistoricalChain(client);
    await client.query(`
      INSERT INTO "AdminUser" ("id", "email", "passwordHash", "role")
      VALUES
        ('collision-a', 'CaseCollision@example.invalid', 'hash-a', 'SUPER_ADMIN'),
        ('collision-b', 'casecollision@example.invalid', 'hash-b', 'SUPER_ADMIN')
    `);
    const before = await catalogSignature(client);
    await expectDenied(
      client,
      'case-insensitive email collision preflight',
      readFileSync(resolve(migrationsDirectory, C2A_MIGRATION, 'migration.sql'), 'utf8'),
      [],
      ['23505'],
    );
    const after = await catalogSignature(client);
    const residue = await client.query(`
      SELECT
        (SELECT count(*)::integer FROM "AdminUser") AS users,
        to_regclass('public."AdminPasswordResetRequest"') IS NULL AS no_c2_table,
        to_regclass('public."AdminUser_email_login_ci_key"') IS NULL AS no_c2_index
    `);
    if (
      before !== after ||
      residue.rows[0]?.users !== 2 ||
      residue.rows[0]?.no_c2_table !== true ||
      residue.rows[0]?.no_c2_index !== true
    ) {
      fail('email-collision refusal left a partial C2a mutation');
    }
    process.stdout.write(
      'C2A_EMAIL_COLLISION_REFUSAL_PASS code=23505 partial_mutation=false rows=preserved\n',
    );
  } finally {
    await client.end();
  }
}

async function c2aIdentitySignature(client, includeCredential = true) {
  const roles = Object.values(ROLE_ENVIRONMENT).map(([name]) => process.env[name]);
  const result = await client.query(
    `
    WITH target_roles AS (
      SELECT oid, rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
             rolinherit, rolreplication, rolbypassrls, rolpassword
      FROM pg_catalog.pg_authid
      WHERE rolname = ANY($1::text[])
    ), inventory AS (
      SELECT 'role' AS kind,
             role_entry.rolname || ':' || role_entry.rolcanlogin::text || ':' ||
             role_entry.rolsuper::text || ':' || role_entry.rolcreatedb::text || ':' ||
             role_entry.rolcreaterole::text || ':' || role_entry.rolinherit::text || ':' ||
             role_entry.rolreplication::text || ':' || role_entry.rolbypassrls::text || ':' ||
             CASE WHEN $2::boolean
               THEN pg_catalog.md5(COALESCE(role_entry.rolpassword, ''))
               ELSE '<semantic>'
             END AS value
      FROM target_roles AS role_entry
      UNION ALL
      SELECT 'membership',
             granted_role.rolname || '->' || member_role.rolname
      FROM pg_catalog.pg_auth_members AS membership
      JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
      JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
      WHERE membership.roleid IN (SELECT oid FROM target_roles)
         OR membership.member IN (SELECT oid FROM target_roles)
      UNION ALL
      SELECT 'class-acl',
             namespace_entry.nspname || '.' || class_entry.relname || ':' ||
             target_role.rolname || ':' || privilege.privilege_type || ':' ||
             privilege.is_grantable::text
      FROM pg_catalog.pg_class AS class_entry
      JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = class_entry.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(class_entry.relacl) AS privilege
      JOIN target_roles AS target_role ON target_role.oid = privilege.grantee
      UNION ALL
      SELECT 'column-acl',
             namespace_entry.nspname || '.' || class_entry.relname || '.' ||
             attribute_entry.attname || ':' || target_role.rolname || ':' ||
             privilege.privilege_type || ':' || privilege.is_grantable::text
      FROM pg_catalog.pg_attribute AS attribute_entry
      JOIN pg_catalog.pg_class AS class_entry ON class_entry.oid = attribute_entry.attrelid
      JOIN pg_catalog.pg_namespace AS namespace_entry
        ON namespace_entry.oid = class_entry.relnamespace
      CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_entry.attacl) AS privilege
      JOIN target_roles AS target_role ON target_role.oid = privilege.grantee
      WHERE attribute_entry.attnum > 0 AND NOT attribute_entry.attisdropped
      UNION ALL
      SELECT 'ownership',
             dependency.dbid::text || ':' || dependency.classid::text || ':' ||
             dependency.objid::text || ':' || target_role.rolname
      FROM pg_catalog.pg_shdepend AS dependency
      JOIN target_roles AS target_role ON target_role.oid = dependency.refobjid
      WHERE dependency.refclassid = 'pg_catalog.pg_authid'::regclass
        AND dependency.deptype = 'o'
    )
    SELECT kind, value FROM inventory ORDER BY kind, value
  `,
    [roles, includeCredential],
  );
  return sha256(JSON.stringify(result.rows));
}

function runExpectedProvisionerRefusal(database, label) {
  const result = spawnSync('docker', provisionerArguments(database), {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  if (result.status === 0) fail(`${label} contamination was accepted`);
  const output = normalized(`${result.stdout ?? ''}${result.stderr ?? ''}`);
  if (!output.includes('C2a provisioning refused')) {
    fail(`${label} failed without the expected C2a pre-refusal diagnostic`);
  }
}

async function verifyContaminationRefusals(database) {
  const owner = new Client(adminConfiguration(database));
  await owner.connect();
  const writer = quoteIdentifier(process.env.S1203C2A_WRITER_USER);
  try {
    const exercise = async (label, contaminate, restore) => {
      await contaminate();
      const before = await provisioningSurfaceSignature(owner);
      runExpectedProvisionerRefusal(database, label);
      const after = await provisioningSurfaceSignature(owner);
      if (before !== after) fail(`${label} refusal mutated the database or role catalog`);
      await restore();
    };

    await owner.query('CREATE ROLE kora_c2a_validation_contaminant NOLOGIN');
    await exercise(
      'membership-roleid',
      () => owner.query(`GRANT ${writer} TO kora_c2a_validation_contaminant`),
      () => owner.query(`REVOKE ${writer} FROM kora_c2a_validation_contaminant`),
    );
    await exercise(
      'membership-member',
      () => owner.query(`GRANT kora_c2a_validation_contaminant TO ${writer}`),
      () => owner.query(`REVOKE kora_c2a_validation_contaminant FROM ${writer}`),
    );
    await exercise(
      'administrative-attribute',
      () => owner.query(`ALTER ROLE ${writer} CREATEROLE`),
      () => owner.query(`ALTER ROLE ${writer} NOCREATEROLE`),
    );
    await exercise(
      'connection-limit',
      () => owner.query(`ALTER ROLE ${writer} CONNECTION LIMIT 1`),
      () => owner.query(`ALTER ROLE ${writer} CONNECTION LIMIT -1`),
    );
    await exercise(
      'role-setting',
      () => owner.query(`ALTER ROLE ${writer} SET application_name = 'contaminated'`),
      () => owner.query(`ALTER ROLE ${writer} RESET application_name`),
    );
    await exercise(
      'unexpected-table-acl',
      () => owner.query(`GRANT SELECT ON TABLE "AdminUser" TO ${writer}`),
      () => owner.query(`REVOKE SELECT ON TABLE "AdminUser" FROM ${writer}`),
    );
    await owner.query('CREATE SCHEMA c2a_acl_shadow');
    await owner.query('CREATE TABLE c2a_acl_shadow."AdminUser" ("createdAt" text)');
    await exercise(
      'off-public-column-acl',
      () =>
        owner.query(`GRANT SELECT ("createdAt") ON TABLE c2a_acl_shadow."AdminUser" TO ${writer}`),
      () =>
        owner.query(
          `REVOKE SELECT ("createdAt") ON TABLE c2a_acl_shadow."AdminUser" FROM ${writer}`,
        ),
    );
    await owner.query('DROP TABLE c2a_acl_shadow."AdminUser"');
    await owner.query('DROP SCHEMA c2a_acl_shadow');
    let alternateGrantorError;
    try {
      await owner.query('GRANT USAGE ON SCHEMA public TO kora_c2a_validation_contaminant');
      await owner.query(
        'GRANT SELECT ("createdAt") ON TABLE public."AdminUser" TO kora_c2a_validation_contaminant WITH GRANT OPTION',
      );
      await exercise(
        'alternate-grantor-column-acl',
        async () => {
          await owner.query('SET ROLE kora_c2a_validation_contaminant');
          try {
            await owner.query(
              `GRANT SELECT ("createdAt") ON TABLE public."AdminUser" TO ${writer}`,
            );
          } finally {
            await owner.query('RESET ROLE');
          }
        },
        async () => {
          await owner.query('SET ROLE kora_c2a_validation_contaminant');
          try {
            await owner.query(
              `REVOKE SELECT ("createdAt") ON TABLE public."AdminUser" FROM ${writer}`,
            );
          } finally {
            await owner.query('RESET ROLE');
          }
        },
      );
    } catch (error) {
      alternateGrantorError = error;
    }
    const alternateGrantorCleanupErrors = [];
    try {
      await owner.query('RESET ROLE');
    } catch (error) {
      alternateGrantorCleanupErrors.push(error);
    }
    let cleanupRoleSet = false;
    try {
      await owner.query('SET ROLE kora_c2a_validation_contaminant');
      cleanupRoleSet = true;
    } catch (error) {
      alternateGrantorCleanupErrors.push(error);
    }
    if (cleanupRoleSet) {
      try {
        await owner.query(`REVOKE SELECT ("createdAt") ON TABLE public."AdminUser" FROM ${writer}`);
      } catch (error) {
        alternateGrantorCleanupErrors.push(error);
      }
      try {
        await owner.query('RESET ROLE');
      } catch (error) {
        alternateGrantorCleanupErrors.push(error);
      }
    }
    try {
      await owner.query(
        'REVOKE SELECT ("createdAt") ON TABLE public."AdminUser" FROM kora_c2a_validation_contaminant',
      );
    } catch (error) {
      alternateGrantorCleanupErrors.push(error);
    }
    try {
      await owner.query('REVOKE USAGE ON SCHEMA public FROM kora_c2a_validation_contaminant');
    } catch (error) {
      alternateGrantorCleanupErrors.push(error);
    }
    if (alternateGrantorError !== undefined) {
      if (alternateGrantorCleanupErrors.length > 0) {
        throw new AggregateError(
          [alternateGrantorError, ...alternateGrantorCleanupErrors],
          'Alternate-grantor contamination and cleanup both failed',
          { cause: alternateGrantorError },
        );
      }
      throw alternateGrantorError;
    }
    if (alternateGrantorCleanupErrors.length > 0) {
      throw new AggregateError(
        alternateGrantorCleanupErrors,
        'Alternate-grantor contamination cleanup failed',
      );
    }
    await exercise(
      'routine-acl',
      () => owner.query(`GRANT EXECUTE ON FUNCTION public.kora_reject_row_mutation() TO ${writer}`),
      () =>
        owner.query(`REVOKE EXECUTE ON FUNCTION public.kora_reject_row_mutation() FROM ${writer}`),
    );
    await exercise(
      'type-acl',
      () => owner.query(`GRANT USAGE ON TYPE public."AdminRole" TO ${writer}`),
      () => owner.query(`REVOKE USAGE ON TYPE public."AdminRole" FROM ${writer}`),
    );
    const largeObject = await owner.query('SELECT pg_catalog.lo_create(0) AS oid');
    const largeObjectOid = Number(largeObject.rows[0]?.oid);
    if (!Number.isInteger(largeObjectOid)) fail('large-object contamination fixture failed');
    await exercise(
      'large-object-acl',
      () => owner.query(`GRANT SELECT ON LARGE OBJECT ${largeObjectOid} TO ${writer}`),
      () => owner.query(`REVOKE SELECT ON LARGE OBJECT ${largeObjectOid} FROM ${writer}`),
    );
    await owner.query('SELECT pg_catalog.lo_unlink($1)', [largeObjectOid]);
    await exercise(
      'parameter-acl',
      () => owner.query(`GRANT SET ON PARAMETER work_mem TO ${writer}`),
      () => owner.query(`REVOKE SET ON PARAMETER work_mem FROM ${writer}`),
    );
    await exercise(
      'default-acl',
      () =>
        owner.query(
          `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${writer}`,
        ),
      () =>
        owner.query(
          `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM ${writer}`,
        ),
    );
    await exercise(
      'public-routine-acl',
      () => owner.query('GRANT EXECUTE ON FUNCTION public.kora_reject_row_mutation() TO PUBLIC'),
      () => owner.query('REVOKE EXECUTE ON FUNCTION public.kora_reject_row_mutation() FROM PUBLIC'),
    );
    await exercise(
      'public-type-acl',
      () => owner.query('GRANT USAGE ON TYPE public."AdminRole" TO PUBLIC'),
      () => owner.query('REVOKE USAGE ON TYPE public."AdminRole" FROM PUBLIC'),
    );
    await exercise(
      'public-default-type-acl',
      () => owner.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON TYPES TO PUBLIC'),
      () =>
        owner.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE ON TYPES FROM PUBLIC'),
    );
    await owner.query('CREATE TABLE "C2aOwnershipContamination" ("id" integer)');
    await exercise(
      'ownership',
      () => owner.query(`ALTER TABLE "C2aOwnershipContamination" OWNER TO ${writer}`),
      async () => {
        await owner.query(
          `ALTER TABLE "C2aOwnershipContamination" OWNER TO ${quoteIdentifier(
            process.env.S1203C2A_ADMIN_USER,
          )}`,
        );
      },
    );
    await owner.query('DROP TABLE "C2aOwnershipContamination"');
    await owner.query('DROP ROLE kora_c2a_validation_contaminant');
    process.stdout.write(
      'C2A_CONTAMINATION_REFUSAL_PASS memberships=2 attributes=3 acl_surfaces=11 ownership=1 catalog_mutation=false\n',
    );
  } finally {
    await owner.end();
  }
}

const C2A_IDEMPOTENCY_LOCK_SQL = `
  SELECT pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.jsonb_build_array(
        'KORA_ADMIN_C2_IDEMPOTENCY_LOCK_V2'::text,
        $1::text,
        $2::text,
        $3::text
      )::text,
      0
    )
  )
`;

const C2A_ACTIVE_IDEMPOTENCY_SQL = `
  WITH database_clock AS MATERIALIZED (
    SELECT (
      pg_catalog.clock_timestamp() AT TIME ZONE 'UTC'
    )::timestamp(3) AS database_now
  )
  SELECT record."requestDigest", record."resourceId", record."expiresAt"
  FROM "AdminC2IdempotencyRecord" AS record
  CROSS JOIN database_clock
  WHERE record."adminUserId" = $1
    AND record."operation" = $2
    AND record."idempotencyKey" = $3
    AND record."expiresAt" > database_clock.database_now
`;

async function insertC2aIdempotency(client, id, key, digest, resourceId) {
  return client.query(
    `INSERT INTO "AdminC2IdempotencyRecord" (
       "id", "adminUserId", "operation", "idempotencyKey", "requestDigest",
       "responseCode", "resourceType", "resourceId"
     ) VALUES ($1, 'c1-admin', 'CREATE_ADMIN_INVITATION', $2, $3, 201,
               'ADMIN_INVITATION', $4)`,
    [id, key, digest, resourceId],
  );
}

async function seedExpiredIdempotency(owner, id, key, digest, resourceId) {
  await owner.query('BEGIN');
  try {
    await owner.query('SET LOCAL session_replication_role = replica');
    await owner.query(
      `WITH database_clock AS MATERIALIZED (
         SELECT (
           pg_catalog.clock_timestamp() AT TIME ZONE 'UTC'
         )::timestamp(3) AS database_now
       )
       INSERT INTO "AdminC2IdempotencyRecord" (
         "id", "adminUserId", "operation", "idempotencyKey", "requestDigest",
         "responseCode", "resourceType", "resourceId", "generation",
         "createdAt", "expiresAt"
       )
       SELECT $1, 'c1-admin', 'CREATE_ADMIN_INVITATION', $2, $3, 201,
              'ADMIN_INVITATION', $4, 1,
              database_clock.database_now - INTERVAL '25 hours',
              database_clock.database_now - INTERVAL '1 hour'
       FROM database_clock`,
      [id, key, digest, resourceId],
    );
    await owner.query('SET LOCAL session_replication_role = origin');
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function verifyC2aIdempotency(database) {
  const owner = new Client(adminConfiguration(database));
  const writerA = new Client(roleConfiguration(database, 'writer'));
  const writerB = new Client(roleConfiguration(database, 'writer'));
  await Promise.all([owner.connect(), writerA.connect(), writerB.connect()]);
  try {
    const runtimeRoles = Object.values(ROLE_ENVIRONMENT).map(([name]) => process.env[name]);
    const routine = await owner.query(
      `SELECT routine_entry.oid,
              routine_entry.prosecdef AS "securityDefiner",
              pg_catalog.pg_get_userbyid(routine_entry.proowner) AS owner,
              routine_entry.proconfig AS config,
              pg_catalog.pg_get_functiondef(routine_entry.oid) AS definition
       FROM pg_catalog.pg_proc AS routine_entry
       JOIN pg_catalog.pg_namespace AS namespace_entry
         ON namespace_entry.oid = routine_entry.pronamespace
       WHERE namespace_entry.nspname = 'public'
         AND routine_entry.proname = 'kora_guard_admin_c2_idempotency_insert'
         AND pg_catalog.pg_get_function_identity_arguments(routine_entry.oid) = ''`,
    );
    const guard = routine.rows[0];
    if (
      routine.rowCount !== 1 ||
      guard?.securityDefiner !== true ||
      runtimeRoles.includes(guard?.owner) ||
      JSON.stringify(guard?.config) !== JSON.stringify(['search_path=pg_catalog']) ||
      !guard?.definition.includes('pg_catalog.clock_timestamp()') ||
      !guard?.definition.includes('AdminC2IdempotencyRecord_active_key') ||
      !guard?.definition.includes('KORA_ADMIN_C2_IDEMPOTENCY_LOCK_V2')
    ) {
      fail('C2 idempotency guard function properties differ from the qualified definition');
    }
    const trigger = await owner.query(
      `SELECT trigger_entry.tgenabled AS enabled,
              trigger_entry.tgfoid = $1::oid AS "guardLinked"
       FROM pg_catalog.pg_trigger AS trigger_entry
       WHERE trigger_entry.tgrelid = 'public."AdminC2IdempotencyRecord"'::regclass
         AND trigger_entry.tgname = 'AdminC2IdempotencyRecord_insert_guard'
         AND NOT trigger_entry.tgisinternal`,
      [guard.oid],
    );
    if (
      trigger.rowCount !== 1 ||
      trigger.rows[0]?.enabled !== 'O' ||
      trigger.rows[0]?.guardLinked !== true
    ) {
      fail('C2 idempotency insert guard trigger is not active or linked');
    }
    const executable = await owner.query(
      `SELECT EXISTS (
                SELECT 1
                FROM pg_catalog.pg_proc AS guarded_routine
                CROSS JOIN LATERAL pg_catalog.aclexplode(
                  COALESCE(
                    guarded_routine.proacl,
                    pg_catalog.acldefault('f', guarded_routine.proowner)
                  )
                ) AS privilege
                WHERE guarded_routine.oid = $1::oid
                  AND privilege.grantee = 0
                  AND privilege.privilege_type = 'EXECUTE'
              ) AS "publicExecutable",
              ARRAY(
                SELECT role_name
                FROM unnest($2::text[]) AS role_name
                WHERE pg_catalog.has_function_privilege(
                  role_name,
                  $1::oid,
                  'EXECUTE'
                )
                ORDER BY role_name
              ) AS "runtimeExecutors"`,
      [guard.oid, runtimeRoles],
    );
    if (
      executable.rows[0]?.publicExecutable === true ||
      executable.rows[0]?.runtimeExecutors?.length !== 0
    ) {
      fail('C2 idempotency guard is executable by PUBLIC or a runtime identity');
    }

    await expectDenied(
      writerA,
      'writer idempotency generation projection',
      `SELECT "generation" FROM "AdminC2IdempotencyRecord" LIMIT 1`,
    );
    await expectDenied(
      writerA,
      'writer idempotency generation insertion',
      `INSERT INTO "AdminC2IdempotencyRecord" (
         "id", "adminUserId", "operation", "idempotencyKey", "requestDigest",
         "responseCode", "resourceType", "resourceId", "generation"
       ) VALUES ('forged-generation', 'c1-admin', 'CREATE_ADMIN_INVITATION',
                 'forged-generation-key', repeat('a', 64), 201,
                 'ADMIN_INVITATION', 'forged-generation-resource', 99)`,
    );
    await expectDenied(
      writerA,
      'writer idempotency timestamp insertion',
      `INSERT INTO "AdminC2IdempotencyRecord" (
         "id", "adminUserId", "operation", "idempotencyKey", "requestDigest",
         "responseCode", "resourceType", "resourceId", "createdAt", "expiresAt"
       ) VALUES ('forged-clock', 'c1-admin', 'CREATE_ADMIN_INVITATION',
                 'forged-clock-key', repeat('b', 64), 201,
                 'ADMIN_INVITATION', 'forged-clock-resource',
                 CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '24 hours')`,
    );

    await writerA.query(`SET TIME ZONE 'Pacific/Honolulu'`);
    await writerB.query(`SET TIME ZONE 'Asia/Tokyo'`);
    const activeKey = 'c05-active-window';
    await insertC2aIdempotency(
      writerA,
      'c05-active-record',
      activeKey,
      'a'.repeat(64),
      'c05-active-resource',
    );
    const activeState = await owner.query(
      `SELECT "generation",
              EXTRACT(EPOCH FROM ("expiresAt" - "createdAt"))::integer AS seconds
       FROM "AdminC2IdempotencyRecord"
       WHERE "id" = 'c05-active-record'`,
    );
    if (activeState.rows[0]?.generation !== '1' || activeState.rows[0]?.seconds !== 86_400) {
      fail('C2 idempotency guard did not establish generation 1 and an exact 24-hour window');
    }
    try {
      await insertC2aIdempotency(
        writerB,
        'c05-active-conflict',
        activeKey,
        'b'.repeat(64),
        'c05-active-conflict-resource',
      );
      fail('a second active C2 idempotency generation unexpectedly succeeded');
    } catch (error) {
      if (
        String(error?.code) !== '23505' ||
        String(error?.constraint) !== 'AdminC2IdempotencyRecord_active_key'
      ) {
        throw error;
      }
    }

    const rollbackKey = 'c05-rollback-window';
    await writerA.query('BEGIN');
    await writerA.query(C2A_IDEMPOTENCY_LOCK_SQL, [
      'c1-admin',
      'CREATE_ADMIN_INVITATION',
      rollbackKey,
    ]);
    await insertC2aIdempotency(
      writerA,
      'c05-rollback-record',
      rollbackKey,
      'c'.repeat(64),
      'c05-rollback-resource',
    );
    await writerA.query('ROLLBACK');
    const rollbackState = await owner.query(
      `SELECT count(*)::integer AS count
       FROM "AdminC2IdempotencyRecord" WHERE "idempotencyKey" = $1`,
      [rollbackKey],
    );
    if (rollbackState.rows[0]?.count !== 0) {
      fail('rolled-back C2 idempotency generation remained durable');
    }

    await owner.query('BEGIN');
    let boundary;
    try {
      await owner.query('SET LOCAL session_replication_role = replica');
      boundary = await owner.query(
        `WITH database_clock AS MATERIALIZED (
           SELECT (
             pg_catalog.clock_timestamp() AT TIME ZONE 'UTC'
           )::timestamp(3) AS database_now
         ),
         boundary_case AS (
           SELECT *
           FROM (VALUES
             ('before', '-1 millisecond'::interval),
             ('equal', '0 milliseconds'::interval),
             ('after', '1 millisecond'::interval)
           ) AS value(label, clock_delta)
         ),
         inserted AS (
           INSERT INTO "AdminC2IdempotencyRecord" (
             "id", "adminUserId", "operation", "idempotencyKey", "requestDigest",
             "responseCode", "resourceType", "resourceId", "generation",
             "createdAt", "expiresAt"
           )
           SELECT 'c05-boundary-' || boundary_case.label,
                  'c1-admin', 'CREATE_ADMIN_INVITATION',
                  'c05-boundary-' || boundary_case.label,
                  repeat('f', 64), 201, 'ADMIN_INVITATION',
                  'c05-boundary-resource-' || boundary_case.label, 1,
                  database_clock.database_now + boundary_case.clock_delta - INTERVAL '24 hours',
                  database_clock.database_now + boundary_case.clock_delta
           FROM database_clock
           CROSS JOIN boundary_case
           RETURNING "id", "createdAt", "expiresAt"
         )
         SELECT boundary_case.label,
                inserted."expiresAt" > database_clock.database_now AS active,
                EXTRACT(EPOCH FROM (
                  inserted."expiresAt" - inserted."createdAt"
                ))::integer AS seconds
         FROM inserted
         JOIN boundary_case
           ON inserted."id" = 'c05-boundary-' || boundary_case.label
         CROSS JOIN database_clock
         ORDER BY boundary_case.label`,
      );
      await owner.query('SET LOCAL session_replication_role = origin');
    } finally {
      await owner.query('ROLLBACK').catch(() => undefined);
    }
    if (
      JSON.stringify(
        boundary.rows.map(({ active, label, seconds }) => [label, active, seconds]),
      ) !==
      JSON.stringify([
        ['after', true, 86_400],
        ['before', false, 86_400],
        ['equal', false, 86_400],
      ])
    ) {
      fail('C2 idempotency active predicate is not half-open before/at/after the boundary');
    }
    const boundaryTriggerState = await owner.query(
      `SELECT trigger_entry.tgname AS name, trigger_entry.tgenabled AS enabled
       FROM pg_catalog.pg_trigger AS trigger_entry
       WHERE trigger_entry.tgrelid = 'public."AdminC2IdempotencyRecord"'::regclass
         AND trigger_entry.tgname IN (
           'AdminC2IdempotencyRecord_append_only',
           'AdminC2IdempotencyRecord_insert_guard'
         )
         AND NOT trigger_entry.tgisinternal
       ORDER BY trigger_entry.tgname`,
    );
    if (
      JSON.stringify(boundaryTriggerState.rows.map(({ enabled, name }) => [name, enabled])) !==
      JSON.stringify([
        ['AdminC2IdempotencyRecord_append_only', 'O'],
        ['AdminC2IdempotencyRecord_insert_guard', 'O'],
      ])
    ) {
      fail('C2 idempotency triggers were not restored after boundary fixtures');
    }

    const reuseKey = 'c05-expired-reuse';
    await seedExpiredIdempotency(
      owner,
      'c05-expired-generation-1',
      reuseKey,
      'd'.repeat(64),
      'c05-expired-resource-1',
    );
    await writerA.query('BEGIN');
    await writerA.query(C2A_IDEMPOTENCY_LOCK_SQL, [
      'c1-admin',
      'CREATE_ADMIN_INVITATION',
      reuseKey,
    ]);
    const beforeReuse = await writerA.query(C2A_ACTIVE_IDEMPOTENCY_SQL, [
      'c1-admin',
      'CREATE_ADMIN_INVITATION',
      reuseKey,
    ]);
    if (beforeReuse.rowCount !== 0) fail('expired C2 idempotency generation remained active');
    await insertC2aIdempotency(
      writerA,
      'c05-expired-generation-2',
      reuseKey,
      'e'.repeat(64),
      'c05-expired-resource-2',
    );

    await writerB.query('BEGIN');
    let secondLockAcquired = false;
    const secondLock = writerB
      .query(C2A_IDEMPOTENCY_LOCK_SQL, ['c1-admin', 'CREATE_ADMIN_INVITATION', reuseKey])
      .then(() => {
        secondLockAcquired = true;
      });
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
    if (secondLockAcquired) fail('concurrent C2 idempotency key did not block');
    await writerA.query('COMMIT');
    await Promise.race([
      secondLock,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('concurrent idempotency lock deadline exceeded')), 2_000),
      ),
    ]);
    const replay = await writerB.query(C2A_ACTIVE_IDEMPOTENCY_SQL, [
      'c1-admin',
      'CREATE_ADMIN_INVITATION',
      reuseKey,
    ]);
    if (
      replay.rowCount !== 1 ||
      replay.rows[0]?.requestDigest !== 'e'.repeat(64) ||
      replay.rows[0]?.resourceId !== 'c05-expired-resource-2'
    ) {
      fail('second concurrent invocation did not observe the committed replacement generation');
    }
    await writerB.query('ROLLBACK');

    const generations = await owner.query(
      `SELECT "generation", "resourceId"
       FROM "AdminC2IdempotencyRecord"
       WHERE "idempotencyKey" = $1 ORDER BY "generation"`,
      [reuseKey],
    );
    if (
      JSON.stringify(generations.rows) !==
      JSON.stringify([
        { generation: '1', resourceId: 'c05-expired-resource-1' },
        { generation: '2', resourceId: 'c05-expired-resource-2' },
      ])
    ) {
      fail('C2 idempotency historical generations were not preserved exactly');
    }
    await expectDenied(
      writerA,
      'writer overwrite of an older idempotency generation',
      `UPDATE "AdminC2IdempotencyRecord"
       SET "resourceId" = 'forged-overwrite'
       WHERE "id" = 'c05-expired-generation-1'`,
    );

    process.stdout.write(
      'C2A_IDEMPOTENCY_C05_PASS pg_clock=true window_seconds=86400 boundary=half_open boundary_cases=3 generations=2 concurrency=serialized history=append_only acl=least_privilege timezones=2 rollback=true\n',
    );
  } finally {
    await Promise.allSettled([writerA.query('ROLLBACK'), writerB.query('ROLLBACK')]);
    await Promise.allSettled([owner.end(), writerA.end(), writerB.end()]);
  }
}

async function verifyAclAndBehavior(database) {
  const owner = new Client(adminConfiguration(database));
  const writer = new Client(roleConfiguration(database, 'writer'));
  const notification = new Client(roleConfiguration(database, 'notification'));
  const expiration = new Client(roleConfiguration(database, 'expiration'));
  const bootstrap = new Client(roleConfiguration(database, 'bootstrap'));
  await Promise.all([
    owner.connect(),
    writer.connect(),
    notification.connect(),
    expiration.connect(),
    bootstrap.connect(),
  ]);
  try {
    await owner.query(`
      INSERT INTO "AdminUser" (
        "id", "email", "passwordHash", "role", "status", "authorizationVersion"
      ) VALUES (
        'preexisting-invite-admin', 'preexisting@example.invalid',
        'preexisting-password-hash', 'SUPPORT', 'PENDING_MFA', 1
      )
    `);
    await owner.query(`
      INSERT INTO "AdminRecoveryCase" (
        "id", "subjectAdminUserId", "creatorAdminUserId", "expiresAt", "createdAt"
      ) VALUES (
        'expiration-case', 'c1-admin', 'legacy-admin',
        CURRENT_TIMESTAMP - INTERVAL '1 minute', CURRENT_TIMESTAMP - INTERVAL '1 hour'
      ), (
        'premature-expiration-case', 'legacy-admin', 'c1-admin',
        CURRENT_TIMESTAMP + INTERVAL '10 minutes', CURRENT_TIMESTAMP
      )
    `);

    const visibleAdmin = await writer.query(`
      SELECT "id", "email", "role", "status", "authorizationVersion"
      FROM "AdminUser" WHERE "id" = 'c1-admin'
    `);
    if (visibleAdmin.rowCount !== 1) fail('writer positive AdminUser projection failed');
    const sessionProof = await writer.query(`
      SELECT "accessTokenJti", "stepUpPurpose", "stepUpExpiresAt"
      FROM "AdminSession" WHERE "id" = 'c1-session'
    `);
    if (sessionProof.rowCount !== 1) fail('writer positive AdminSession proof projection failed');
    for (const forbiddenColumn of [
      'stepUpVerifiedAt',
      'refreshTokenHash',
      'tokenFamilyId',
      'lastActivityAt',
      'createdAt',
    ]) {
      await expectDenied(
        writer,
        `writer AdminSession ${forbiddenColumn} read`,
        `SELECT "${forbiddenColumn}" FROM "AdminSession"`,
      );
    }
    await expectDenied(writer, 'writer AdminSession global read', 'SELECT * FROM "AdminSession"');
    await expectDenied(
      writer,
      'writer AdminSession step-up mutation',
      `UPDATE "AdminSession"
       SET "stepUpPurpose" = 'RECOVERY_APPROVAL'
       WHERE "id" = 'c1-session'`,
    );
    await expectDenied(
      writer,
      'writer passwordHash read',
      'SELECT "passwordHash" FROM "AdminUser"',
    );
    await expectDenied(writer, 'writer table delete', 'DELETE FROM "AdminUser"');

    await writer.query('BEGIN');
    try {
      await writer.query(`
        INSERT INTO "AdminSecurityEvent" (
          "id", "adminUserId", "eventClass", "action", "outcome", "requestId",
          "subjectRefHash", "entityType", "entityId"
        ) VALUES (
          'reset-event', 'c1-admin', 'LOGIN', 'requestAdminPasswordReset',
          'SUCCEEDED', 'c2-reset-request', repeat('1', 64),
          'ADMIN_PASSWORD_RESET_REQUEST', 'reset-request'
        )
      `);
      await writer.query(`
        INSERT INTO "AdminPasswordResetRequest" (
          "id", "adminUserId", "securityEventId", "expiresAt"
        ) VALUES (
          'reset-request', 'c1-admin', 'reset-event',
          CURRENT_TIMESTAMP + INTERVAL '10 minutes'
        )
      `);
      await writer.query(`
        INSERT INTO "AdminNotificationOutbox" (
          "id", "purpose", "encryptedPayload", "encryptionKeyId",
          "encryptionNonce", "encryptionTag", "aadHash", "sourceSecurityEventId",
          "passwordResetRequestId"
        ) VALUES (
          'reset-outbox', 'PASSWORD_RESET', 'ciphertext', 'test-key',
          'nonce', 'tag', repeat('2', 64), 'reset-event', 'reset-request'
        )
      `);
      await writer.query('COMMIT');
    } catch (error) {
      await writer.query('ROLLBACK');
      throw error;
    }

    await expectTransactionDenied(
      writer,
      'successful password-reset event without request',
      () =>
        writer.query(`
          INSERT INTO "AdminSecurityEvent" (
            "id", "adminUserId", "eventClass", "action", "outcome", "requestId",
            "subjectRefHash", "entityType", "entityId"
          ) VALUES (
            'reset-event-only', 'legacy-admin', 'LOGIN', 'requestAdminPasswordReset',
            'SUCCEEDED', 'reset-event-only-request', repeat('8', 64),
            'ADMIN_PASSWORD_RESET_REQUEST', 'reset-event-only-request-row'
          )
        `),
      ['23514'],
    );
    await expectTransactionDenied(
      writer,
      'successful password-reset event with a non-contractual event class',
      () =>
        writer.query(`
          INSERT INTO "AdminSecurityEvent" (
            "id", "adminUserId", "eventClass", "action", "outcome", "requestId",
            "subjectRefHash", "entityType", "entityId"
          ) VALUES (
            'reset-wrong-class-event', 'legacy-admin', 'BUSINESS',
            'requestAdminPasswordReset', 'SUCCEEDED', 'reset-wrong-class-request',
            repeat('8', 64), 'ADMIN_PASSWORD_RESET_REQUEST', 'reset-wrong-class-row'
          )
        `),
      ['23514'],
    );
    await expectTransactionDenied(
      writer,
      'password-reset subject mismatch across a complete triple',
      async () => {
        await writer.query(`
          INSERT INTO "AdminSecurityEvent" (
            "id", "adminUserId", "eventClass", "action", "outcome", "requestId",
            "subjectRefHash", "entityType", "entityId"
          ) VALUES (
            'reset-subject-event', 'c1-admin', 'LOGIN', 'requestAdminPasswordReset',
            'SUCCEEDED', 'reset-subject-request-id', repeat('9', 64),
            'ADMIN_PASSWORD_RESET_REQUEST', 'reset-subject-request'
          )
        `);
        await writer.query(`
          INSERT INTO "AdminPasswordResetRequest" (
            "id", "adminUserId", "securityEventId", "expiresAt"
          ) VALUES (
            'reset-subject-request', 'legacy-admin', 'reset-subject-event',
            CURRENT_TIMESTAMP + INTERVAL '10 minutes'
          )
        `);
        await writer.query(`
          INSERT INTO "AdminNotificationOutbox" (
            "id", "purpose", "encryptedPayload", "encryptionKeyId",
            "encryptionNonce", "encryptionTag", "aadHash", "sourceSecurityEventId",
            "passwordResetRequestId"
          ) VALUES (
            'reset-subject-outbox', 'PASSWORD_RESET', 'ciphertext', 'test-key',
            'nonce', 'tag', repeat('7', 64), 'reset-subject-event',
            'reset-subject-request'
          )
        `);
      },
      ['23514'],
    );
    await writer.query(`
      INSERT INTO "AdminPasswordResetContext" (
        "id", "passwordResetRequestId", "adminUserId", "tokenHash",
        "authorizationVersion", "expiresAt"
      ) VALUES (
        'expired-reset-context', 'reset-request', 'c1-admin', repeat('6', 64),
        1, CURRENT_TIMESTAMP + INTERVAL '20 milliseconds'
      )
    `);
    await writer.query('SELECT pg_sleep(0.05)');
    await expectDenied(
      writer,
      'expired password-reset context consumption',
      `UPDATE "AdminPasswordResetContext"
       SET "consumedAt" = CURRENT_TIMESTAMP
       WHERE "id" = 'expired-reset-context'`,
      [],
      ['23514'],
    );

    await expectTransactionDenied(
      writer,
      'password-reset request without atomic outbox',
      async () => {
        await writer.query(`
          INSERT INTO "AdminSecurityEvent" (
            "id", "adminUserId", "eventClass", "action", "outcome", "requestId",
            "subjectRefHash", "entityType", "entityId"
          ) VALUES (
            'reset-event-missing', 'legacy-admin', 'LOGIN', 'requestAdminPasswordReset',
            'SUCCEEDED', 'c2-reset-request-missing', repeat('a', 64),
            'ADMIN_PASSWORD_RESET_REQUEST', 'reset-request-missing'
          )
        `);
        await writer.query(`
          INSERT INTO "AdminPasswordResetRequest" (
            "id", "adminUserId", "securityEventId", "expiresAt"
          ) VALUES (
            'reset-request-missing', 'legacy-admin', 'reset-event-missing',
            CURRENT_TIMESTAMP + INTERVAL '10 minutes'
          )
        `);
      },
      ['23514'],
    );
    await expectTransactionDenied(
      writer,
      'swapped password-reset causal source',
      async () => {
        await writer.query(`
          INSERT INTO "AdminSecurityEvent" (
            "id", "adminUserId", "eventClass", "action", "outcome", "requestId",
            "subjectRefHash", "entityType", "entityId"
          ) VALUES
            ('reset-event-2', 'legacy-admin', 'LOGIN', 'requestAdminPasswordReset',
             'SUCCEEDED', 'c2-reset-request-2', repeat('a', 64),
             'ADMIN_PASSWORD_RESET_REQUEST', 'reset-request-2'),
            ('reset-event-wrong', 'legacy-admin', 'LOGIN', 'requestAdminPasswordReset',
             'SUCCEEDED', 'c2-reset-request-wrong', repeat('b', 64),
             'ADMIN_PASSWORD_RESET_REQUEST', 'different-reset-request')
        `);
        await writer.query(`
          INSERT INTO "AdminPasswordResetRequest" (
            "id", "adminUserId", "securityEventId", "expiresAt"
          ) VALUES (
            'reset-request-2', 'legacy-admin', 'reset-event-2',
            CURRENT_TIMESTAMP + INTERVAL '10 minutes'
          )
        `);
        await writer.query(`
          INSERT INTO "AdminNotificationOutbox" (
            "id", "purpose", "encryptedPayload", "encryptionKeyId",
            "encryptionNonce", "encryptionTag", "aadHash", "sourceSecurityEventId",
            "passwordResetRequestId"
          ) VALUES (
            'swapped-reset-outbox', 'PASSWORD_RESET', 'ciphertext', 'test-key',
            'nonce', 'tag', repeat('c', 64), 'reset-event-wrong', 'reset-request-2'
          )
        `);
      },
      ['23503', '23514'],
    );
    await expectTransactionDenied(
      writer,
      'password-reset replacement without coherent outbox replacement',
      async () => {
        await writer.query(`
          UPDATE "AdminPasswordResetRequest"
          SET "revokedAt" = CURRENT_TIMESTAMP
          WHERE "id" = 'reset-request'
        `);
        await writer.query(`
          UPDATE "AdminNotificationOutbox"
          SET "state" = 'CANCELLED',
              "generation" = "generation" + 1,
              "cancelledAt" = CURRENT_TIMESTAMP
          WHERE "id" = 'reset-outbox'
        `);
        await writer.query(`
          INSERT INTO "AdminSecurityEvent" (
            "id", "adminUserId", "eventClass", "action", "outcome", "requestId",
            "subjectRefHash", "entityType", "entityId"
          ) VALUES (
            'reset-replacement-event', 'c1-admin', 'LOGIN',
            'requestAdminPasswordReset', 'SUCCEEDED', 'reset-replacement-request-id',
            repeat('d', 64), 'ADMIN_PASSWORD_RESET_REQUEST', 'reset-replacement-request'
          )
        `);
        await writer.query(`
          INSERT INTO "AdminPasswordResetRequest" (
            "id", "adminUserId", "securityEventId", "replacedRequestId", "expiresAt"
          ) VALUES (
            'reset-replacement-request', 'c1-admin', 'reset-replacement-event',
            'reset-request', CURRENT_TIMESTAMP + INTERVAL '10 minutes'
          )
        `);
        await writer.query(`
          INSERT INTO "AdminNotificationOutbox" (
            "id", "purpose", "encryptedPayload", "encryptionKeyId",
            "encryptionNonce", "encryptionTag", "aadHash", "sourceSecurityEventId",
            "passwordResetRequestId"
          ) VALUES (
            'reset-replacement-outbox', 'PASSWORD_RESET', 'ciphertext', 'test-key',
            'nonce', 'tag', repeat('e', 64), 'reset-replacement-event',
            'reset-replacement-request'
          )
        `);
      },
      ['23514'],
    );

    await expectTransactionDenied(
      writer,
      'successful invitation audit without invitation',
      () =>
        writer.query(`
          INSERT INTO "AuditLog" (
            "id", "version", "adminUserId", "subjectAdminUserId", "adminSessionId",
            "eventClass", "context", "outcome", "action", "entityType", "entityId",
            "reason", "reasonCode", "requestId"
          ) VALUES (
            'invitation-audit-only', 3, 'c1-admin', 'c1-admin', 'c1-session',
            'BUSINESS', 'ADMIN_SESSION', 'SUCCESS', 'createAdminInvitation',
            'ADMIN_INVITATION', 'invitation-audit-only-row', 'C2_RUNTIME',
            'SECURITY_RESPONSE', 'invitation-audit-only-request'
          )
        `),
      ['23514'],
    );

    await writer.query('BEGIN');
    try {
      await writer.query(`
        INSERT INTO "AuditLog" (
          "id", "version", "adminUserId", "subjectAdminUserId", "adminSessionId",
          "eventClass", "context", "outcome", "action", "entityType", "entityId",
          "reason", "reasonCode", "requestId"
        ) VALUES
          ('invitation-create-audit', 3, 'c1-admin', 'c1-admin', 'c1-session',
           'BUSINESS', 'ADMIN_SESSION', 'SUCCESS', 'createAdminInvitation',
           'ADMIN_INVITATION', 'invitation-valid', 'C2_RUNTIME', 'SECURITY_RESPONSE',
           'invitation-create-request'),
          ('invitation-partial-audit', 3, 'c1-admin', 'c1-admin', 'c1-session',
           'BUSINESS', 'ADMIN_SESSION', 'SUCCESS', 'createAdminInvitation',
           'ADMIN_INVITATION', 'invitation-partial', 'C2_RUNTIME', 'SECURITY_RESPONSE',
           'invitation-partial-request')
      `);
      await writer.query(`
        INSERT INTO "AdminInvitation" (
          "id", "emailCanonical", "deliveryEmailEncrypted", "codeHash", "proposedRole",
          "creatorAdminUserId", "createdByAuditLogId", "expiresAt"
        ) VALUES
          ('invitation-valid', 'accepted@example.invalid', 'encrypted-email-a', repeat('d', 64),
           'SUPPORT', 'c1-admin', 'invitation-create-audit', CURRENT_TIMESTAMP + INTERVAL '1 hour'),
          ('invitation-partial', 'partial@example.invalid', 'encrypted-email-b', repeat('e', 64),
           'SUPPORT', 'c1-admin', 'invitation-partial-audit', CURRENT_TIMESTAMP + INTERVAL '1 hour')
      `);
      await writer.query(`
        INSERT INTO "AdminNotificationOutbox" (
          "id", "purpose", "encryptedPayload", "encryptionKeyId", "encryptionNonce",
          "encryptionTag", "aadHash", "sourceAuditLogId", "adminInvitationId"
        ) VALUES
          ('invitation-valid-outbox', 'INVITATION', 'ciphertext-a', 'test-key', 'nonce-a',
           'tag-a', repeat('2', 64), 'invitation-create-audit', 'invitation-valid'),
          ('invitation-cancel-outbox', 'INVITATION', 'ciphertext-b', 'test-key', 'nonce-b',
           'tag-b', repeat('3', 64), 'invitation-partial-audit', 'invitation-partial')
      `);
      await writer.query('COMMIT');
    } catch (error) {
      await writer.query('ROLLBACK');
      throw error;
    }
    await writer.query('BEGIN');
    try {
      await writer.query(`
        INSERT INTO "AuditLog" (
          "id", "version", "adminUserId", "subjectAdminUserId", "adminSessionId",
          "eventClass", "context", "outcome", "action", "entityType", "entityId",
          "reason", "reasonCode", "requestId"
        ) VALUES
          ('expired-invitation-audit', 3, 'c1-admin', 'c1-admin', 'c1-session',
           'BUSINESS', 'ADMIN_SESSION', 'SUCCESS', 'createAdminInvitation',
           'ADMIN_INVITATION', 'expired-invitation', 'C2_RUNTIME', 'SECURITY_RESPONSE',
           'expired-invitation-request'),
          ('preexisting-invitation-audit', 3, 'c1-admin', 'c1-admin', 'c1-session',
           'BUSINESS', 'ADMIN_SESSION', 'SUCCESS', 'createAdminInvitation',
           'ADMIN_INVITATION', 'preexisting-invitation', 'C2_RUNTIME', 'SECURITY_RESPONSE',
           'preexisting-invitation-request')
      `);
      await writer.query(`
        INSERT INTO "AdminInvitation" (
          "id", "emailCanonical", "deliveryEmailEncrypted", "codeHash", "proposedRole",
          "creatorAdminUserId", "createdByAuditLogId", "expiresAt"
        ) VALUES
          ('expired-invitation', 'expired@example.invalid', 'encrypted-expired',
           repeat('6', 64), 'SUPPORT', 'c1-admin', 'expired-invitation-audit',
           CURRENT_TIMESTAMP + INTERVAL '20 milliseconds'),
          ('preexisting-invitation', 'preexisting@example.invalid', 'encrypted-preexisting',
           repeat('7', 64), 'SUPPORT', 'c1-admin', 'preexisting-invitation-audit',
           CURRENT_TIMESTAMP + INTERVAL '1 hour')
      `);
      await writer.query(`
        INSERT INTO "AdminNotificationOutbox" (
          "id", "purpose", "encryptedPayload", "encryptionKeyId", "encryptionNonce",
          "encryptionTag", "aadHash", "sourceAuditLogId", "adminInvitationId"
        ) VALUES
          ('expired-invitation-outbox', 'INVITATION', 'ciphertext', 'test-key',
           'nonce', 'tag', repeat('8', 64), 'expired-invitation-audit',
           'expired-invitation'),
          ('preexisting-invitation-outbox', 'INVITATION', 'ciphertext', 'test-key',
           'nonce', 'tag', repeat('9', 64), 'preexisting-invitation-audit',
           'preexisting-invitation')
      `);
      await writer.query('COMMIT');
    } catch (error) {
      await writer.query('ROLLBACK');
      throw error;
    }
    await writer.query('SELECT pg_sleep(0.05)');
    await expectTransactionDenied(writer, 'expired invitation acceptance', async () => {
      await writer.query(`
        INSERT INTO "AdminUser" (
          "id", "email", "passwordHash", "role", "status", "authorizationVersion"
        ) VALUES (
          'expired-invited-admin', 'expired@example.invalid', 'expired-password-hash',
          'SUPPORT', 'PENDING_MFA', 1
        )
      `);
      await writer.query(`
        INSERT INTO "AdminPreAuthContext" (
          "id", "adminUserId", "tokenHash", "purpose", "authorizationVersion", "expiresAt"
        ) VALUES (
          'expired-invited-preauth', 'expired-invited-admin', repeat('a', 64),
          'FIRST_TOTP_ENROLLMENT', 1, CURRENT_TIMESTAMP + INTERVAL '5 minutes'
        )
      `);
      await writer.query(`
        INSERT INTO "AdminSecurityEvent" (
          "id", "adminUserId", "eventClass", "action", "outcome", "requestId",
          "subjectRefHash", "entityType", "entityId", "adminInvitationId"
        ) VALUES (
          'expired-invitation-event', 'expired-invited-admin', 'BUSINESS',
          'acceptAdminInvitation', 'SUCCEEDED', 'expired-invitation-accept-request',
          repeat('b', 64), 'ADMIN_INVITATION', 'expired-invitation', 'expired-invitation'
        )
      `);
      await writer.query(`
        UPDATE "AdminInvitation"
        SET "state" = 'ACCEPTED',
            "stateGeneration" = "stateGeneration" + 1,
            "acceptedAdminUserId" = 'expired-invited-admin',
            "acceptedAt" = CURRENT_TIMESTAMP
        WHERE "id" = 'expired-invitation'
      `);
    });
    await expectTransactionDenied(
      writer,
      'invitation acceptance with a preexisting administrator',
      async () => {
        await writer.query(`
          UPDATE "AdminUser"
          SET "status" = "status"
          WHERE "id" = 'preexisting-invite-admin'
        `);
        await writer.query(`
          INSERT INTO "AdminPreAuthContext" (
            "id", "adminUserId", "tokenHash", "purpose", "authorizationVersion", "expiresAt"
          ) VALUES (
            'preexisting-invited-preauth', 'preexisting-invite-admin', repeat('c', 64),
            'FIRST_TOTP_ENROLLMENT', 1, CURRENT_TIMESTAMP + INTERVAL '5 minutes'
          )
        `);
        await writer.query(`
          INSERT INTO "AdminSecurityEvent" (
            "id", "adminUserId", "eventClass", "action", "outcome", "requestId",
            "subjectRefHash", "entityType", "entityId", "adminInvitationId"
          ) VALUES (
            'preexisting-invitation-event', 'preexisting-invite-admin', 'BUSINESS',
            'acceptAdminInvitation', 'SUCCEEDED', 'preexisting-invitation-accept-request',
            repeat('d', 64), 'ADMIN_INVITATION', 'preexisting-invitation',
            'preexisting-invitation'
          )
        `);
        await writer.query(`
          UPDATE "AdminInvitation"
          SET "state" = 'ACCEPTED',
              "stateGeneration" = "stateGeneration" + 1,
              "acceptedAdminUserId" = 'preexisting-invite-admin',
              "acceptedAt" = CURRENT_TIMESTAMP
          WHERE "id" = 'preexisting-invitation'
        `);
      },
      ['23514'],
    );
    await writer.query('BEGIN');
    try {
      await writer.query(`
        UPDATE "AdminInvitation"
        SET "state" = 'REVOKED',
            "stateGeneration" = "stateGeneration" + 1,
            "revokedAt" = CURRENT_TIMESTAMP
        WHERE "id" = 'preexisting-invitation'
      `);
      await writer.query(`
        UPDATE "AdminNotificationOutbox"
        SET "state" = 'CANCELLED',
            "generation" = "generation" + 1,
            "cancelledAt" = CURRENT_TIMESTAMP
        WHERE "id" = 'preexisting-invitation-outbox'
      `);
      await writer.query('COMMIT');
    } catch (error) {
      await writer.query('ROLLBACK');
      throw error;
    }
    await expectTransactionDenied(
      writer,
      'successful invitation-acceptance event without accepted invitation bundle',
      () =>
        writer.query(`
          INSERT INTO "AdminSecurityEvent" (
            "id", "adminUserId", "eventClass", "action", "outcome", "requestId",
            "subjectRefHash", "entityType", "entityId", "adminInvitationId"
          ) VALUES (
            'invitation-event-only', 'c1-admin', 'BUSINESS', 'acceptAdminInvitation',
            'SUCCEEDED', 'invitation-event-only-request', repeat('e', 64),
            'ADMIN_INVITATION', 'invitation-partial', 'invitation-partial'
          )
        `),
      ['23514'],
    );
    await expectTransactionDenied(
      writer,
      'successful invitation-acceptance event with a non-contractual event class',
      () =>
        writer.query(`
          INSERT INTO "AdminSecurityEvent" (
            "id", "adminUserId", "eventClass", "action", "outcome", "requestId",
            "subjectRefHash", "entityType", "entityId", "adminInvitationId"
          ) VALUES (
            'invitation-wrong-class-event', 'c1-admin', 'LOGIN',
            'acceptAdminInvitation', 'SUCCEEDED', 'invitation-wrong-class-request',
            repeat('e', 64), 'ADMIN_INVITATION', 'invitation-partial',
            'invitation-partial'
          )
        `),
      ['23514'],
    );
    await expectTransactionDenied(writer, 'partial invitation acceptance', () =>
      writer.query(`
          INSERT INTO "AdminUser" (
            "id", "email", "passwordHash", "role", "status", "authorizationVersion"
          ) VALUES (
            'partial-invited-admin', 'partial@example.invalid', 'partial-password-hash',
            'SUPPORT', 'PENDING_MFA', 1
          )
        `),
    );
    await expectTransactionDenied(writer, 'partial invitation state acceptance', () =>
      writer.query(`
        UPDATE "AdminInvitation"
        SET "state" = 'ACCEPTED',
            "stateGeneration" = "stateGeneration" + 1,
            "acceptedAdminUserId" = 'c1-admin',
            "acceptedAt" = CURRENT_TIMESTAMP
        WHERE "id" = 'invitation-partial'
      `),
    );
    await expectTransactionDenied(
      writer,
      'invitation replacement without coherent outbox replacement',
      async () => {
        await writer.query(`
          UPDATE "AdminInvitation"
          SET "state" = 'REVOKED',
              "stateGeneration" = "stateGeneration" + 1,
              "revokedAt" = CURRENT_TIMESTAMP
          WHERE "id" = 'invitation-partial'
        `);
        await writer.query(`
          UPDATE "AdminNotificationOutbox"
          SET "state" = 'CANCELLED',
              "generation" = "generation" + 1,
              "cancelledAt" = CURRENT_TIMESTAMP
          WHERE "id" = 'invitation-cancel-outbox'
        `);
        await writer.query(`
          INSERT INTO "AuditLog" (
            "id", "version", "adminUserId", "subjectAdminUserId", "adminSessionId",
            "eventClass", "context", "outcome", "action", "entityType", "entityId",
            "reason", "reasonCode", "requestId"
          ) VALUES (
            'invitation-replacement-audit', 3, 'c1-admin', 'c1-admin', 'c1-session',
            'BUSINESS', 'ADMIN_SESSION', 'SUCCESS', 'createAdminInvitation',
            'ADMIN_INVITATION', 'invitation-replacement', 'C2_RUNTIME',
            'SECURITY_RESPONSE', 'invitation-replacement-request'
          )
        `);
        await writer.query(`
          INSERT INTO "AdminInvitation" (
            "id", "emailCanonical", "deliveryEmailEncrypted", "codeHash", "proposedRole",
            "creatorAdminUserId", "createdByAuditLogId", "replacedInvitationId", "expiresAt"
          ) VALUES (
            'invitation-replacement', 'partial@example.invalid', 'encrypted-replacement',
            repeat('c', 64), 'SUPPORT', 'c1-admin', 'invitation-replacement-audit',
            'invitation-partial', CURRENT_TIMESTAMP + INTERVAL '1 hour'
          )
        `);
        await writer.query(`
          INSERT INTO "AdminNotificationOutbox" (
            "id", "purpose", "encryptedPayload", "encryptionKeyId", "encryptionNonce",
            "encryptionTag", "aadHash", "sourceAuditLogId", "adminInvitationId"
          ) VALUES (
            'invitation-replacement-outbox', 'INVITATION', 'ciphertext', 'test-key',
            'nonce', 'tag', repeat('d', 64), 'invitation-replacement-audit',
            'invitation-replacement'
          )
        `);
      },
      ['23514'],
    );
    await expectTransactionDenied(
      writer,
      'swapped invitation causal source',
      async () => {
        await writer.query(`
          INSERT INTO "AuditLog" (
            "id", "version", "adminUserId", "subjectAdminUserId", "adminSessionId",
            "eventClass", "context", "outcome", "action", "entityType", "entityId",
            "reason", "reasonCode", "requestId"
          ) VALUES
            ('invitation-swap-audit-a', 3, 'c1-admin', 'c1-admin', 'c1-session',
             'BUSINESS', 'ADMIN_SESSION', 'SUCCESS', 'createAdminInvitation',
             'ADMIN_INVITATION', 'invitation-swap-a', 'C2_RUNTIME', 'SECURITY_RESPONSE',
             'invitation-swap-request-a'),
            ('invitation-swap-audit-b', 3, 'c1-admin', 'c1-admin', 'c1-session',
             'BUSINESS', 'ADMIN_SESSION', 'SUCCESS', 'createAdminInvitation',
             'ADMIN_INVITATION', 'invitation-swap-b', 'C2_RUNTIME', 'SECURITY_RESPONSE',
             'invitation-swap-request-b')
        `);
        await writer.query(`
          INSERT INTO "AdminInvitation" (
            "id", "emailCanonical", "deliveryEmailEncrypted", "codeHash", "proposedRole",
            "creatorAdminUserId", "createdByAuditLogId", "expiresAt"
          ) VALUES
            ('invitation-swap-a', 'swap-a@example.invalid', 'encrypted-a', repeat('a', 64),
             'SUPPORT', 'c1-admin', 'invitation-swap-audit-a', CURRENT_TIMESTAMP + INTERVAL '1 hour'),
            ('invitation-swap-b', 'swap-b@example.invalid', 'encrypted-b', repeat('b', 64),
             'SUPPORT', 'c1-admin', 'invitation-swap-audit-b', CURRENT_TIMESTAMP + INTERVAL '1 hour')
        `);
        await writer.query(`
          INSERT INTO "AdminNotificationOutbox" (
            "id", "purpose", "encryptedPayload", "encryptionKeyId", "encryptionNonce",
            "encryptionTag", "aadHash", "sourceAuditLogId", "adminInvitationId"
          ) VALUES
            ('swapped-invitation-outbox-a', 'INVITATION', 'ciphertext-a', 'test-key',
             'nonce-a', 'tag-a', repeat('4', 64), 'invitation-swap-audit-a',
             'invitation-swap-b'),
            ('swapped-invitation-outbox-b', 'INVITATION', 'ciphertext-b', 'test-key',
             'nonce-b', 'tag-b', repeat('5', 64), 'invitation-swap-audit-b',
             'invitation-swap-a')
        `);
      },
      ['23503', '23514'],
    );
    await writer.query(`
      UPDATE "AdminNotificationOutbox"
      SET "state" = 'CANCELLED',
          "generation" = "generation" + 1,
          "cancelledAt" = CURRENT_TIMESTAMP
      WHERE "id" = 'invitation-cancel-outbox'
    `);

    await writer.query(`
      INSERT INTO "AuditLog" (
        "id", "version", "adminUserId", "subjectAdminUserId", "adminSessionId",
        "eventClass", "context", "outcome", "action", "entityType", "entityId",
        "reason", "reasonCode", "requestId"
      ) VALUES (
        'writer-audit-v3', 3, 'c1-admin', 'c1-admin', 'c1-session',
        'BUSINESS', 'ADMIN_SESSION', 'SUCCESS', 'changeAdminUserRole',
        'ADMIN_USER', 'c1-admin', 'C2_RUNTIME', 'ROLE_ADMINISTRATION',
        'writer-audit-request'
      )
    `);
    await expectDenied(
      writer,
      'AdminSecurityEvent RETURNING',
      `INSERT INTO "AdminSecurityEvent" (
         "id", "eventClass", "action", "outcome", "requestId"
       ) VALUES (
         'returning-security-event', 'LOGIN', 'REJECTED_TEST', 'FAILED',
         'returning-security-request'
       ) RETURNING "id"`,
    );
    await expectDenied(
      writer,
      'AuditLog RETURNING',
      `INSERT INTO "AuditLog" (
         "id", "version", "adminUserId", "subjectAdminUserId", "adminSessionId",
         "eventClass", "context", "outcome", "action", "entityType", "entityId",
         "reason", "reasonCode", "requestId"
       ) VALUES (
         'returning-audit', 3, 'c1-admin', 'c1-admin', 'c1-session',
         'BUSINESS', 'ADMIN_SESSION', 'SUCCESS', 'changeAdminUserStatus',
         'ADMIN_USER', 'c1-admin', 'C2_RUNTIME', 'STATUS_ADMINISTRATION',
         'returning-audit-request'
       ) RETURNING "id"`,
    );
    await expectDenied(writer, 'AuditLog global read', 'SELECT * FROM "AuditLog"');
    await expectDenied(
      writer,
      'AdminSecurityEvent global read',
      'SELECT * FROM "AdminSecurityEvent"',
    );

    const securityEventSource = await notification.query(
      'SELECT "id" FROM "AdminC2NotificationSecurityEventSource" WHERE "id" = $1',
      ['reset-event'],
    );
    const auditSource = await notification.query(
      'SELECT "id" FROM "AdminC2NotificationAuditSource"',
    );
    const notificationOutbox = await notification.query(
      'SELECT "id", "encryptedPayload" FROM "AdminNotificationOutbox" WHERE "id" = $1',
      ['reset-outbox'],
    );
    const causalSources = [securityEventSource, auditSource, notificationOutbox];
    if (
      causalSources[0].rowCount !== 1 ||
      causalSources[1].rowCount !== 1 ||
      causalSources[2].rowCount !== 1
    )
      fail('notification limited causal boundary failed');
    await expectDenied(
      notification,
      'notification base security-event read',
      'SELECT * FROM "AdminSecurityEvent"',
    );
    await expectDenied(notification, 'notification base audit read', 'SELECT * FROM "AuditLog"');
    await expectDenied(
      notification,
      'notification arbitrary audit action',
      `INSERT INTO "AuditLog" (
         "id", "version", "systemExecutionRefHash", "eventClass", "context",
         "outcome", "action", "entityType", "entityId", "reason", "reasonCode",
         "requestId", "notificationOutboxId"
       ) VALUES (
         'notification-forged-audit', 3, repeat('9', 64), 'BUSINESS', 'SYSTEM',
         'SUCCESS', 'changeAdminUserRole', 'ADMIN_USER', 'c1-admin', 'C2_RUNTIME',
         'SECURITY_RESPONSE', 'notification-forged-request', 'reset-outbox'
       )`,
      [],
      ['23514'],
    );
    await notification.query(`
      UPDATE "AdminNotificationOutbox"
      SET "state" = 'CLAIMED',
          "generation" = "generation" + 1,
          "claimOwnerHash" = repeat('3', 64),
          "leaseExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '1 minute',
          "attemptCount" = "attemptCount" + 1
      WHERE "id" = 'reset-outbox'
    `);
    await notification.query(`
      UPDATE "AdminNotificationOutbox"
      SET "state" = 'DELIVERED',
          "generation" = "generation" + 1,
          "claimOwnerHash" = NULL,
          "leaseExpiresAt" = NULL,
          "providerAcknowledgementHash" = repeat('4', 64),
          "deliveredAt" = CURRENT_TIMESTAMP
      WHERE "id" = 'reset-outbox'
    `);
    await notification.query(`
      INSERT INTO "AuditLog" (
        "id", "version", "systemExecutionRefHash", "eventClass", "context",
        "outcome", "action", "entityType", "entityId", "reason", "reasonCode",
        "requestId", "causationSecurityEventId", "notificationOutboxId"
      ) VALUES (
        'notification-audit-v3', 3, repeat('5', 64), 'LOGIN', 'SYSTEM',
        'SUCCESS', 'deliverAdminPasswordResetNotification',
        'ADMIN_PASSWORD_RESET_REQUEST', 'reset-request', 'C2_RUNTIME',
        'SECURITY_RESPONSE', 'notification-audit-request', 'reset-event',
        'reset-outbox'
      )
    `);

    await notification.query(`
      UPDATE "AdminNotificationOutbox"
      SET "state" = 'CLAIMED',
          "generation" = "generation" + 1,
          "claimOwnerHash" = repeat('6', 64),
          "leaseExpiresAt" = CURRENT_TIMESTAMP + INTERVAL '1 minute',
          "attemptCount" = "attemptCount" + 1
      WHERE "id" = 'invitation-valid-outbox'
    `);
    await notification.query(`
      UPDATE "AdminNotificationOutbox"
      SET "state" = 'DELIVERED',
          "generation" = "generation" + 1,
          "claimOwnerHash" = NULL,
          "leaseExpiresAt" = NULL,
          "providerAcknowledgementHash" = repeat('7', 64),
          "deliveredAt" = CURRENT_TIMESTAMP
      WHERE "id" = 'invitation-valid-outbox'
    `);
    await expectDenied(
      notification,
      'invitation notification divergent delegating administrator',
      `INSERT INTO "AuditLog" (
         "id", "version", "systemExecutionRefHash", "eventClass", "context",
         "outcome", "action", "entityType", "entityId", "reason", "reasonCode",
         "requestId", "causationEventId", "delegatedByAdminUserId",
         "adminInvitationId", "notificationOutboxId"
       ) VALUES (
         'invitation-notification-divergent', 3, repeat('8', 64), 'BUSINESS', 'SYSTEM',
         'SUCCESS', 'deliverAdminInvitationNotification', 'ADMIN_INVITATION',
         'invitation-valid', 'C2_RUNTIME', 'SECURITY_RESPONSE',
         'invitation-notification-divergent-request', 'invitation-create-audit',
         'legacy-admin', 'invitation-valid', 'invitation-valid-outbox'
       )`,
      [],
      ['23514'],
    );
    await notification.query(`
      INSERT INTO "AuditLog" (
        "id", "version", "systemExecutionRefHash", "eventClass", "context",
        "outcome", "action", "entityType", "entityId", "reason", "reasonCode",
        "requestId", "causationEventId", "delegatedByAdminUserId",
        "adminInvitationId", "notificationOutboxId"
      ) VALUES (
        'invitation-notification-audit', 3, repeat('9', 64), 'BUSINESS', 'SYSTEM',
        'SUCCESS', 'deliverAdminInvitationNotification', 'ADMIN_INVITATION',
        'invitation-valid', 'C2_RUNTIME', 'SECURITY_RESPONSE',
        'invitation-notification-request', 'invitation-create-audit',
        'c1-admin', 'invitation-valid', 'invitation-valid-outbox'
      )
    `);

    await writer.query('BEGIN');
    try {
      await writer.query(`
        INSERT INTO "AdminUser" (
          "id", "email", "passwordHash", "role", "status", "authorizationVersion"
        ) VALUES (
          'accepted-admin', 'accepted@example.invalid', 'accepted-password-hash',
          'SUPPORT', 'PENDING_MFA', 1
        )
      `);
      await writer.query(`
        INSERT INTO "AdminPreAuthContext" (
          "id", "adminUserId", "tokenHash", "purpose", "authorizationVersion", "expiresAt"
        ) VALUES (
          'accepted-preauth', 'accepted-admin', repeat('f', 64),
          'FIRST_TOTP_ENROLLMENT', 1, CURRENT_TIMESTAMP + INTERVAL '5 minutes'
        )
      `);
      await writer.query(`
        INSERT INTO "AdminSecurityEvent" (
          "id", "adminUserId", "eventClass", "action", "outcome", "requestId",
          "subjectRefHash", "entityType", "entityId", "adminInvitationId"
        ) VALUES (
          'invitation-accepted-event', 'accepted-admin', 'BUSINESS', 'acceptAdminInvitation',
          'SUCCEEDED', 'invitation-accepted-request', repeat('1', 64),
          'ADMIN_INVITATION', 'invitation-valid', 'invitation-valid'
        )
      `);
      await writer.query(`
        UPDATE "AdminInvitation"
        SET "state" = 'ACCEPTED',
            "stateGeneration" = "stateGeneration" + 1,
            "acceptedAdminUserId" = 'accepted-admin',
            "acceptedAt" = CURRENT_TIMESTAMP
        WHERE "id" = 'invitation-valid'
      `);
      await writer.query('COMMIT');
    } catch (error) {
      await writer.query('ROLLBACK');
      throw error;
    }

    await writer.query('BEGIN');
    try {
      await writer.query(`
        INSERT INTO "AuditLog" (
          "id", "version", "adminUserId", "subjectAdminUserId", "adminSessionId",
          "eventClass", "context", "outcome", "action", "entityType", "entityId",
          "reason", "reasonCode", "requestId", "adminRecoveryCaseId"
        ) VALUES (
          'expired-approval-create-audit', 3, 'c1-admin',
          'preexisting-invite-admin', 'c1-session', 'BUSINESS', 'ADMIN_SESSION',
          'SUCCESS', 'createAdminRecoveryCase', 'ADMIN_RECOVERY_CASE',
          'expired-approval-case', 'C2_RUNTIME', 'ACCOUNT_RECOVERY',
          'expired-approval-create-request', 'expired-approval-case'
        )
      `);
      await writer.query(`
        INSERT INTO "AdminRecoveryCase" (
          "id", "subjectAdminUserId", "creatorAdminUserId", "expiresAt"
        ) VALUES (
          'expired-approval-case', 'preexisting-invite-admin', 'c1-admin',
          CURRENT_TIMESTAMP + INTERVAL '20 milliseconds'
        )
      `);
      await writer.query('COMMIT');
    } catch (error) {
      await writer.query('ROLLBACK');
      throw error;
    }
    await writer.query('SELECT pg_sleep(0.05)');
    await expectDenied(
      writer,
      'expired recovery case approval',
      `UPDATE "AdminRecoveryCase"
       SET "state" = 'APPROVED',
           "stateGeneration" = "stateGeneration" + 1,
           "approverAdminUserId" = 'legacy-admin',
           "approvedAt" = CURRENT_TIMESTAMP
       WHERE "id" = 'expired-approval-case'`,
      [],
      ['23514'],
    );

    const expirationVisible = await expiration.query(
      `SELECT "id", "state", "stateGeneration", "expiresAt"
       FROM "AdminRecoveryCase" WHERE "id" = 'expiration-case'`,
    );
    if (expirationVisible.rowCount !== 1) fail('expiration projection failed');
    await expectDenied(
      expiration,
      'premature recovery expiration',
      `UPDATE "AdminRecoveryCase"
       SET "state" = 'EXPIRED', "stateGeneration" = "stateGeneration" + 1,
           "expiredAt" = CURRENT_TIMESTAMP
       WHERE "id" = 'premature-expiration-case'`,
      [],
      ['23514'],
    );
    await expectDenied(
      expiration,
      'expiration approvedAt write',
      `UPDATE "AdminRecoveryCase" SET "approvedAt" = CURRENT_TIMESTAMP
       WHERE "id" = 'expiration-case'`,
    );
    await expectTransactionDenied(
      expiration,
      'recovery expiration without atomic audit',
      () =>
        expiration.query(`
          UPDATE "AdminRecoveryCase"
          SET "state" = 'EXPIRED',
              "stateGeneration" = "stateGeneration" + 1,
              "expiredAt" = CURRENT_TIMESTAMP
          WHERE "id" = 'expiration-case'
        `),
      ['23514'],
    );
    await expectDenied(
      expiration,
      'expiration arbitrary audit action',
      `INSERT INTO "AuditLog" (
         "id", "version", "systemExecutionRefHash", "eventClass", "context",
         "outcome", "action", "entityType", "entityId", "reason", "reasonCode",
         "requestId", "adminRecoveryCaseId"
       ) VALUES (
         'expiration-forged-audit', 3, repeat('8', 64), 'BUSINESS', 'SYSTEM',
         'SUCCESS', 'changeAdminUserStatus', 'ADMIN_RECOVERY_CASE',
         'expiration-case', 'C2_RUNTIME', 'SECURITY_RESPONSE',
         'expiration-forged-request', 'expiration-case'
       )`,
      [],
      ['23514'],
    );
    await expiration.query('BEGIN');
    try {
      await expiration.query(`
        UPDATE "AdminRecoveryCase"
        SET "state" = 'EXPIRED',
            "stateGeneration" = "stateGeneration" + 1,
            "expiredAt" = CURRENT_TIMESTAMP
        WHERE "id" = 'expiration-case'
      `);
      await expiration.query(`
        INSERT INTO "AuditLog" (
          "id", "version", "systemExecutionRefHash", "eventClass", "context",
          "outcome", "action", "entityType", "entityId", "reason", "reasonCode",
          "requestId", "adminRecoveryCaseId"
        ) VALUES (
          'expiration-audit-v3', 3, repeat('6', 64), 'BUSINESS', 'SYSTEM',
          'SUCCESS', 'expireAdminRecoveryCase', 'ADMIN_RECOVERY_CASE',
          'expiration-case', 'C2_RUNTIME', 'ACCOUNT_RECOVERY',
          'expiration-audit-request', 'expiration-case'
        )
      `);
      await expiration.query('COMMIT');
    } catch (error) {
      await expiration.query('ROLLBACK');
      throw error;
    }
    await writer.query('BEGIN');
    try {
      await writer.query(`
        INSERT INTO "AuditLog" (
          "id", "version", "adminUserId", "subjectAdminUserId", "adminSessionId",
          "eventClass", "context", "outcome", "action", "entityType", "entityId",
          "reason", "reasonCode", "requestId", "adminRecoveryCaseId"
        ) VALUES (
          'cancel-target-create-audit', 3, 'c1-admin', 'c1-admin', 'c1-session',
          'BUSINESS', 'ADMIN_SESSION', 'SUCCESS', 'createAdminRecoveryCase',
          'ADMIN_RECOVERY_CASE', 'cancel-target', 'C2_RUNTIME', 'ACCOUNT_RECOVERY',
          'cancel-target-create-request', 'cancel-target'
        )
      `);
      await writer.query(`
        INSERT INTO "AdminRecoveryCase" (
          "id", "subjectAdminUserId", "creatorAdminUserId", "expiresAt"
        ) VALUES (
          'cancel-target', 'c1-admin', 'legacy-admin',
          CURRENT_TIMESTAMP + INTERVAL '1 hour'
        )
      `);
      await writer.query('COMMIT');
    } catch (error) {
      await writer.query('ROLLBACK');
      throw error;
    }
    await expectTransactionDenied(
      writer,
      'recovery cancellation without atomic audit',
      () =>
        writer.query(`
          UPDATE "AdminRecoveryCase"
          SET "state" = 'CANCELLED',
              "stateGeneration" = "stateGeneration" + 1,
              "cancelledAt" = CURRENT_TIMESTAMP
          WHERE "id" = 'cancel-target'
        `),
      ['23514'],
    );
    await expectTransactionDenied(
      writer,
      'recovery cancellation with unrelated replacement case',
      async () => {
        await writer.query(`
          INSERT INTO "AuditLog" (
            "id", "version", "adminUserId", "subjectAdminUserId", "adminSessionId",
            "eventClass", "context", "outcome", "action", "entityType", "entityId",
            "reason", "reasonCode", "requestId", "adminRecoveryCaseId"
          ) VALUES (
            'unrelated-case-create-audit', 3, 'c1-admin', 'accepted-admin', 'c1-session',
            'BUSINESS', 'ADMIN_SESSION', 'SUCCESS', 'createAdminRecoveryCase',
            'ADMIN_RECOVERY_CASE', 'unrelated-case', 'C2_RUNTIME', 'ACCOUNT_RECOVERY',
            'unrelated-case-create-request', 'unrelated-case'
          )
        `);
        await writer.query(`
          INSERT INTO "AdminRecoveryCase" (
            "id", "subjectAdminUserId", "creatorAdminUserId", "expiresAt"
          ) VALUES (
            'unrelated-case', 'accepted-admin', 'c1-admin',
            CURRENT_TIMESTAMP + INTERVAL '1 hour'
          )
        `);
        await writer.query(`
          UPDATE "AdminRecoveryCase"
          SET "state" = 'CANCELLED',
              "stateGeneration" = "stateGeneration" + 1,
              "cancelledAt" = CURRENT_TIMESTAMP
          WHERE "id" = 'cancel-target'
        `);
        await writer.query(`
          INSERT INTO "AuditLog" (
            "id", "version", "systemExecutionRefHash", "delegatedByAdminUserId",
            "eventClass", "context", "outcome", "action", "entityType", "entityId",
            "reason", "reasonCode", "requestId", "causationEventId",
            "adminRecoveryCaseId"
          ) VALUES (
            'unrelated-cancel-audit', 3, repeat('a', 64), 'c1-admin',
            'BUSINESS', 'SYSTEM', 'SUCCESS', 'cancelAdminRecoveryCase',
            'ADMIN_RECOVERY_CASE', 'cancel-target', 'C2_RUNTIME', 'ACCOUNT_RECOVERY',
            'unrelated-cancel-request', 'unrelated-case-create-audit', 'cancel-target'
          )
        `);
      },
      ['23514'],
    );

    await writer.query('BEGIN');
    try {
      await writer.query(`
        UPDATE "AdminRecoveryCase"
        SET "state" = 'CANCELLED',
            "stateGeneration" = "stateGeneration" + 1,
            "cancelledAt" = CURRENT_TIMESTAMP
        WHERE "id" = 'cancel-target'
      `);
      await writer.query(`
        INSERT INTO "AuditLog" (
          "id", "version", "systemExecutionRefHash", "delegatedByAdminUserId",
          "eventClass", "context", "outcome", "action", "entityType", "entityId",
          "reason", "reasonCode", "requestId", "causationEventId",
          "adminRecoveryCaseId"
        ) VALUES (
          'cancel-target-audit', 3, repeat('b', 64), 'c1-admin',
          'BUSINESS', 'SYSTEM', 'SUCCESS', 'cancelAdminRecoveryCase',
          'ADMIN_RECOVERY_CASE', 'cancel-target', 'C2_RUNTIME', 'ACCOUNT_RECOVERY',
          'cancel-target-request', 'writer-audit-v3', 'cancel-target'
        )
      `);
      await writer.query('COMMIT');
    } catch (error) {
      await writer.query('ROLLBACK');
      throw error;
    }

    await writer.query('BEGIN');
    try {
      await writer.query(`
        INSERT INTO "AdminPaginationSnapshot" (
          "id", "principalAdminUserId", "operation", "filtersDigest",
          "projectionVersion", "entryCount", "utf8Bytes", "expiresAt"
        ) VALUES (
          'ordered-snapshot', 'c1-admin', 'LIST_ADMIN_USERS', repeat('a', 64),
          1, 2, 4, CURRENT_TIMESTAMP + INTERVAL '10 minutes'
        )
      `);
      await writer.query(`
        INSERT INTO "AdminPaginationSnapshotItem" (
          "snapshotId", "ordinal", "resourceId", "sourceCreatedAt",
          "projectionJson", "utf8Bytes"
        ) VALUES
          ('ordered-snapshot', 0, 'resource-b', TIMESTAMP '2026-10-14 02:00:00', '{}', 2),
          ('ordered-snapshot', 1, 'resource-a', TIMESTAMP '2026-10-14 01:00:00', '{}', 2)
      `);
      await writer.query('COMMIT');
    } catch (error) {
      await writer.query('ROLLBACK');
      throw error;
    }
    await expectTransactionDenied(writer, 'unordered materialized snapshot', async () => {
      await writer.query(`
          INSERT INTO "AdminPaginationSnapshot" (
            "id", "principalAdminUserId", "operation", "filtersDigest",
            "projectionVersion", "entryCount", "utf8Bytes", "expiresAt"
          ) VALUES (
            'unordered-snapshot', 'c1-admin', 'LIST_ADMIN_USERS', repeat('b', 64),
            1, 2, 4, CURRENT_TIMESTAMP + INTERVAL '10 minutes'
          )
        `);
      await writer.query(`
          INSERT INTO "AdminPaginationSnapshotItem" (
            "snapshotId", "ordinal", "resourceId", "sourceCreatedAt",
            "projectionJson", "utf8Bytes"
          ) VALUES
            ('unordered-snapshot', 0, 'resource-a', TIMESTAMP '2026-10-14 01:00:00', '{}', 2),
            ('unordered-snapshot', 1, 'resource-b', TIMESTAMP '2026-10-14 02:00:00', '{}', 2)
        `);
    });
    await expectDenied(
      bootstrap,
      'bootstrap on a non-empty installation',
      `INSERT INTO "AdminUser" (
         "id", "email", "passwordHash", "role", "status", "authorizationVersion"
       ) VALUES (
         'forbidden-bootstrap-admin', 'forbidden-bootstrap@example.invalid',
         'bootstrap-hash', 'SUPER_ADMIN', 'PENDING_MFA', 1
       )`,
      [],
      ['23514'],
    );
    await expectDenied(
      bootstrap,
      'bootstrap arbitrary audit action',
      `INSERT INTO "AuditLog" (
         "id", "version", "systemExecutionRefHash", "eventClass", "context",
         "outcome", "action", "entityType", "entityId", "reason", "reasonCode",
         "requestId", "bootstrapGuardId"
       ) VALUES (
         'bootstrap-forged-audit', 3, repeat('7', 64), 'BUSINESS', 'SYSTEM',
         'SUCCESS', 'changeAdminUserRole', 'ADMIN_USER', 'c1-admin',
         'C2_RUNTIME', 'SECURITY_RESPONSE', 'bootstrap-forged-request',
         'ADMIN_BOOTSTRAP_V1'
       )`,
      [],
      ['23514', '23503'],
    );

    for (const [role, client] of [
      ['writer', writer],
      ['notification', notification],
      ['expiration', expiration],
      ['bootstrap', bootstrap],
    ]) {
      await expectDenied(client, `${role} create schema`, 'CREATE SCHEMA forbidden');
      await expectDenied(
        client,
        `${role} temporary table`,
        'CREATE TEMPORARY TABLE forbidden_temp (id integer)',
      );
    }

    const boundaries = await owner.query(
      `
      WITH target_roles AS (
        SELECT oid, rolname FROM pg_catalog.pg_roles
        WHERE rolname = ANY($1::text[])
      )
      SELECT
        NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_auth_members
          WHERE roleid IN (SELECT oid FROM target_roles)
             OR member IN (SELECT oid FROM target_roles)
        ) AS no_membership,
        NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_shdepend
          WHERE refclassid = 'pg_catalog.pg_authid'::regclass
            AND refobjid IN (SELECT oid FROM target_roles)
            AND deptype = 'o'
        ) AS no_ownership,
        NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_roles
          WHERE oid IN (SELECT oid FROM target_roles)
            AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit
                 OR rolreplication OR rolbypassrls)
        ) AS no_admin_attributes
    `,
      [Object.values(ROLE_ENVIRONMENT).map(([name]) => process.env[name])],
    );
    if (
      boundaries.rows[0]?.no_membership !== true ||
      boundaries.rows[0]?.no_ownership !== true ||
      boundaries.rows[0]?.no_admin_attributes !== true
    ) {
      fail('C2a role boundaries are not clean');
    }
    process.stdout.write(
      'C2A_ACL_BEHAVIOR_PASS roles=4 column_scoped=true sinks=insert-only returning=denied causal_views=limited implicit=denied\n',
    );
  } finally {
    await Promise.allSettled([
      owner.end(),
      writer.end(),
      notification.end(),
      expiration.end(),
      bootstrap.end(),
    ]);
  }
}

async function verifyBootstrapSingleton(database) {
  const bootstrap = new Client(roleConfiguration(database, 'bootstrap'));
  const owner = new Client(adminConfiguration(database));
  await Promise.all([bootstrap.connect(), owner.connect()]);
  try {
    await expectDenied(
      bootstrap,
      'malformed bootstrap administrator',
      `INSERT INTO "AdminUser" (
         "id", "email", "passwordHash", "role", "status", "authorizationVersion"
       ) VALUES (
         'malformed-bootstrap-admin', 'malformed-bootstrap@example.invalid',
         'bootstrap-hash', 'SUPER_ADMIN', 'DISABLED', 1
       )`,
      [],
      ['23514'],
    );

    await bootstrap.query('BEGIN');
    try {
      await bootstrap.query(`
        INSERT INTO "AdminUser" (
          "id", "email", "passwordHash", "role", "status", "authorizationVersion"
        ) VALUES (
          'bootstrap-admin', 'bootstrap@example.invalid', 'bootstrap-hash',
          'SUPER_ADMIN', 'PENDING_MFA', 1
        )
      `);
      await bootstrap.query(`
        INSERT INTO "AdminBootstrapGuard" (
          "singletonKey", "adminUserId", "bootstrapAuditLogId"
        ) VALUES ('ADMIN_BOOTSTRAP_V1', 'bootstrap-admin', 'bootstrap-audit-v3')
      `);
      await bootstrap.query(`
        INSERT INTO "AuditLog" (
          "id", "version", "systemExecutionRefHash", "eventClass", "context",
          "outcome", "action", "entityType", "entityId", "reason", "reasonCode",
          "requestId", "bootstrapGuardId"
        ) VALUES (
          'bootstrap-audit-v3', 3, repeat('7', 64), 'BUSINESS', 'SYSTEM',
          'SUCCESS', 'bootstrapAdminUser', 'ADMIN_USER', 'bootstrap-admin',
          'C2_RUNTIME', 'SECURITY_RESPONSE', 'bootstrap-audit-request',
          'ADMIN_BOOTSTRAP_V1'
        )
      `);
      await bootstrap.query('COMMIT');
    } catch (error) {
      await bootstrap.query('ROLLBACK');
      throw error;
    }

    await expectDenied(
      bootstrap,
      'second bootstrap administrator',
      `INSERT INTO "AdminUser" (
         "id", "email", "passwordHash", "role", "status", "authorizationVersion"
       ) VALUES (
         'second-bootstrap-admin', 'second-bootstrap@example.invalid',
         'bootstrap-hash', 'SUPER_ADMIN', 'PENDING_MFA', 1
       )`,
      [],
      ['23514'],
    );
    await expectDenied(
      bootstrap,
      'bootstrap arbitrary audit after singleton creation',
      `INSERT INTO "AuditLog" (
         "id", "version", "systemExecutionRefHash", "eventClass", "context",
         "outcome", "action", "entityType", "entityId", "reason", "reasonCode",
         "requestId", "bootstrapGuardId"
       ) VALUES (
         'bootstrap-forged-audit', 3, repeat('8', 64), 'BUSINESS', 'SYSTEM',
         'SUCCESS', 'changeAdminUserRole', 'ADMIN_USER', 'bootstrap-admin',
         'C2_RUNTIME', 'SECURITY_RESPONSE', 'bootstrap-forged-request',
         'ADMIN_BOOTSTRAP_V1'
       )`,
      [],
      ['23514'],
    );
    await expectDenied(
      bootstrap,
      'bootstrap mutation after creation',
      `UPDATE "AdminUser" SET "status" = 'ACTIVE' WHERE "id" = 'bootstrap-admin'`,
    );
    const state = await owner.query(`
      SELECT
        (SELECT count(*)::integer FROM "AdminUser") AS users,
        (SELECT count(*)::integer FROM "AdminBootstrapGuard") AS guards,
        (SELECT count(*)::integer FROM "AuditLog" WHERE "version" = 3) AS audits
    `);
    if (state.rows[0]?.users !== 1 || state.rows[0]?.guards !== 1 || state.rows[0]?.audits !== 1) {
      fail('bootstrap singleton transaction did not create exactly one linked triple');
    }
    process.stdout.write(
      'C2A_BOOTSTRAP_SINGLETON_PASS first_admin=pending_mfa atomic_triple=true second=denied arbitrary_audit=denied\n',
    );
  } finally {
    await Promise.allSettled([bootstrap.end(), owner.end()]);
  }
}

async function verifyC1Boundaries(database) {
  const reader = new Client({
    ...adminConfiguration(database),
    password: process.env.S1203C2A_READER_PASSWORD,
    user: process.env.S1203C2A_READER_USER,
  });
  const writer = new Client({
    ...adminConfiguration(database),
    password: process.env.S1203C2A_C1_WRITER_PASSWORD,
    user: process.env.S1203C2A_C1_WRITER_USER,
  });
  await Promise.all([reader.connect(), writer.connect()]);
  try {
    const projection = await reader.query(`
      SELECT "id", "role", "status", "authorizationVersion", "totpEnabledAt"
      FROM "AdminUser" WHERE "id" = 'c1-admin'
    `);
    if (projection.rowCount !== 1) fail('C1 reader projection regressed');
    await expectDenied(reader, 'C1 reader passwordHash', 'SELECT "passwordHash" FROM "AdminUser"');
    await writer.query(`
      INSERT INTO "AuditLog" (
        "id", "adminUserId", "subjectAdminUserId", "adminSessionId",
        "eventClass", "context", "action", "entityType", "entityId",
        "reason", "reasonCode", "requestId"
      ) VALUES (
        'c1-writer-after-c2a', 'c1-admin', 'c1-admin', 'c1-session',
        'SESSION', 'ADMIN_SESSION', 'C1_WRITER_AFTER_C2A', 'AdminSession',
        'c1-session', 'SECURITY_RESPONSE', 'SECURITY_RESPONSE',
        'c1-writer-after-c2a-request'
      )
    `);
    await expectDenied(
      writer,
      'C1 writer AuditLog RETURNING',
      `INSERT INTO "AuditLog" (
         "id", "adminUserId", "subjectAdminUserId", "adminSessionId",
         "eventClass", "context", "action", "entityType", "entityId",
         "reason", "reasonCode", "requestId"
       ) VALUES (
         'c1-writer-returning', 'c1-admin', 'c1-admin', 'c1-session',
         'SESSION', 'ADMIN_SESSION', 'C1_WRITER_RETURNING', 'AdminSession',
         'c1-session', 'SECURITY_RESPONSE', 'SECURITY_RESPONSE',
         'c1-writer-returning-request'
       ) RETURNING "id"`,
    );
    process.stdout.write(
      'C2A_C1_BOUNDARY_REGRESSION_PASS reader=column-projection writer=v2 sink_returning=denied\n',
    );
  } finally {
    await Promise.allSettled([reader.end(), writer.end()]);
  }
}

function assertEnvironment() {
  if (process.env.S1203C2A_EPHEMERAL_POSTGRES !== '1')
    fail('S1203C2A_EPHEMERAL_POSTGRES=1 is required');
  if (!new Set(['127.0.0.1', 'localhost']).has(process.env.S1203C2A_ADMIN_HOST))
    fail('administrative PostgreSQL host must be loopback');
  const required = [
    'S1203C2A_ADMIN_HOST',
    'S1203C2A_ADMIN_PORT',
    'S1203C2A_ADMIN_USER',
    'S1203C2A_ADMIN_PASSWORD',
    'S1203C2A_READER_USER',
    'S1203C2A_READER_PASSWORD',
    'S1203C2A_C1_WRITER_USER',
    'S1203C2A_C1_WRITER_PASSWORD',
    'S1203C2A_WRITER_USER',
    'S1203C2A_WRITER_PASSWORD',
    'S1203C2A_NOTIFICATION_USER',
    'S1203C2A_NOTIFICATION_PASSWORD',
    'S1203C2A_EXPIRATION_USER',
    'S1203C2A_EXPIRATION_PASSWORD',
    'S1203C2A_BOOTSTRAP_USER',
    'S1203C2A_BOOTSTRAP_PASSWORD',
    'S1203C2A_VALIDATION_CONTAINER',
  ];
  for (const name of required) {
    if (!process.env[name]) fail(`${name} is required`);
  }
  const exactRoles = {
    S1203C2A_BOOTSTRAP_USER: 'kora_admin_c2a_bootstrap',
    S1203C2A_EXPIRATION_USER: 'kora_admin_c2a_expiration_worker',
    S1203C2A_NOTIFICATION_USER: 'kora_admin_c2a_notification_worker',
    S1203C2A_WRITER_USER: 'kora_admin_c2a_writer',
  };
  for (const [name, expected] of Object.entries(exactRoles)) {
    if (process.env[name] !== expected) fail(`${name} must be ${expected}`);
  }
  const identities = [
    process.env.S1203C2A_READER_USER,
    process.env.S1203C2A_C1_WRITER_USER,
    ...Object.values(ROLE_ENVIRONMENT).map(([name]) => process.env[name]),
  ];
  if (new Set(identities).size !== identities.length) fail('runtime identities must be distinct');
  const secrets = [
    process.env.S1203C2A_ADMIN_PASSWORD,
    process.env.S1203C2A_READER_PASSWORD,
    process.env.S1203C2A_C1_WRITER_PASSWORD,
    ...Object.values(ROLE_ENVIRONMENT).map(([, name]) => process.env[name]),
  ];
  if (new Set(secrets).size !== secrets.length || secrets.some((value) => value.length !== 43))
    fail('runtime secrets must be pairwise distinct 43-character values');
}

async function runValidation() {
  const readiness = await waitForPostgresReadiness({
    createClient: ({ connectionTimeoutMillis }) =>
      new Client({ ...adminConfiguration(), connectionTimeoutMillis }),
  });
  const admin = readiness.client;
  const databases = [];
  let primaryError;
  process.stdout.write(
    `POSTGRESQL_C2A_TCP_READINESS_PASS authenticated=true select=1 attempts=${readiness.attempts} elapsed_ms=${readiness.elapsedMilliseconds}\n`,
  );
  try {
    const version = await admin.query(
      `SELECT current_setting('server_version_num')::integer AS number`,
    );
    if (version.rows[0]?.number < 180_000 || version.rows[0]?.number >= 190_000)
      fail('PostgreSQL 18.x is required');

    const bootstrap = databaseName('bootstrap');
    await createDatabase(admin, bootstrap);
    databases.push(bootstrap);
    await prepareEmptyDatabase(bootstrap);
    runProvisioner(bootstrap);
    await verifyBootstrapSingleton(bootstrap);
    await dropDatabase(admin, bootstrap);
    databases.splice(databases.indexOf(bootstrap), 1);
    await dropEphemeralRuntimeRoles(admin);

    const upgrade = databaseName('upgrade');
    await createDatabase(admin, upgrade);
    databases.push(upgrade);
    const upgradeSignature = await prepareUpgradeDatabase(upgrade);

    const empty = databaseName('empty');
    await createDatabase(admin, empty);
    databases.push(empty);
    const emptySignature = await prepareEmptyDatabase(empty);
    if (upgradeSignature !== emptySignature)
      fail('empty and realistic-upgrade catalog signatures differ');
    process.stdout.write(`C2A_DATABASE_A_B_PROJECTION_PASS sha256=${upgradeSignature}\n`);
    await dropDatabase(admin, empty);
    databases.splice(databases.indexOf(empty), 1);

    await verifyCollisionRefusal(admin, databases);
    const collision = databases.find((database) => database.includes('_collision_'));
    if (collision !== undefined) {
      await dropDatabase(admin, collision);
      databases.splice(databases.indexOf(collision), 1);
    }

    runProvisioner(upgrade);
    const firstSemanticSignature = await withPostgresClient(adminConfiguration(upgrade), (client) =>
      c2aIdentitySignature(client, false),
    );
    runProvisioner(upgrade);
    const secondSemanticSignature = await withPostgresClient(
      adminConfiguration(upgrade),
      (client) => c2aIdentitySignature(client, false),
    );
    if (firstSemanticSignature !== secondSemanticSignature)
      fail('second provisioning changed C2a semantic role state');
    process.stdout.write(
      'C2A_PROVISIONING_IDEMPOTENCE_PASS executions=2 semantic_state=identical\n',
    );

    await verifyC1Boundaries(upgrade);
    await verifyAclAndBehavior(upgrade);
    await verifyC2aIdempotency(upgrade);
    runRealTransactionTests(upgrade);
    await verifyContaminationRefusals(upgrade);
    const migrationHash = sha256(
      readFileSync(resolve(migrationsDirectory, C2A_MIGRATION, 'migration.sql')),
    );
    process.stdout.write(
      `C2A_DATABASE_VALIDATION_COMPLETE database_projection=${upgradeSignature} migration_sha256=${migrationHash} roles=4 providers=unqualified\n`,
    );
  } catch (error) {
    primaryError = error;
  }

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
  if (primaryError !== undefined) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [primaryError, ...cleanupErrors],
        'C2a validation failed and targeted database cleanup was incomplete',
        { cause: primaryError },
      );
    }
    throw primaryError;
  }
  if (cleanupErrors.length > 0)
    throw new AggregateError(cleanupErrors, 'C2a targeted database cleanup failed');
}

async function main() {
  assertEnvironment();
  await runWithProtectedFoundationsInputs(runValidation);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`C2A_DIAGNOSTIC_ERROR ${renderDiagnosticError(error)}\n`);
    process.exitCode = 1;
  });
}
