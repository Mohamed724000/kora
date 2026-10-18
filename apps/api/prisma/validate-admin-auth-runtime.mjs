import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const { Client } = pg;
const prismaDirectory = dirname(fileURLToPath(import.meta.url));
const apiDirectory = resolve(prismaDirectory, '..');
const repositoryRoot = resolve(apiDirectory, '..', '..');
const prismaEntry = resolve(repositoryRoot, 'node_modules', 'prisma', 'build', 'index.js');
const migrationsDirectory = resolve(prismaDirectory, 'migrations');
const HISTORICAL_REFERENCE = 'd514b87cbef21dfae4585f4d143889aca2d8b229';
const HISTORICAL_REFERENCE_TREE = '2429871f3b440934cfbd02ceaaf0c74f3f8f3ac4';
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
const EXPECTED_PACKAGE_LOCK_OID = '405fea639dfb5f7a2d79465b04e02921993fe59c';
const EXPECTED_PRISMA_VERSION = '7.9.1';
const EXPECTED_MODELS = 39;
const EXPECTED_TABLES_WITH_MIGRATION_HISTORY = 40;
const EXPECTED_HISTORICAL_MODELS = [
  'Customer',
  'CustomerDevice',
  'CustomerSession',
  'OtpChallenge',
  'AdminUser',
  'AdminSession',
  'AdminRecoveryCode',
  'AdminPreAuthContext',
  'AdminTotpEnrollment',
  'AdminRecoveryContext',
  'AdminRefreshToken',
  'AdminRecoveryCodeBatch',
  'AdminSecurityEvent',
  'Artist',
  'AudioContent',
  'MediaAsset',
  'MediaWebhookInbox',
  'ContentPublication',
  'PublicationMediaAsset',
  'Order',
  'OrderItem',
  'OrderStateEvent',
  'PaymentAttempt',
  'PaymentAttemptEvent',
  'PaymentWebhookInbox',
  'OutboxEvent',
  'Settlement',
  'ArtistSettlement',
  'LedgerAccount',
  'LedgerTransactionGroup',
  'LedgerPosting',
  'ArtistEarning',
  'Entitlement',
  'PreviewGrant',
  'PreviewPlaybackDescriptor',
  'PurchasedPlaybackDescriptor',
  'IdempotencyRecord',
  'AdminIdempotencyRecord',
  'AuditLog',
];
const HISTORICAL_ARTIFACTS = [
  {
    bytes: 901,
    gitOid: '1d5ed8b49be2519ba3ea67e11c23411945c98105',
    sha256: 'a2b38fdd44a8828332992f366f7ace269c73b67e1b06c9b19f53c6b1d8bb4ee2',
    sourcePath: 'apps/api/prisma.config.ts',
    targetPath: 'apps/api/prisma.config.ts',
  },
  {
    bytes: 36_144,
    gitOid: 'e02e0cd7ee86a7c08738b2965adb19d56cd3e776',
    sha256: '812fe0b405009e153fbc5221aae66f3527ea2e9e2e6f818f173a0bf61601827f',
    sourcePath: 'apps/api/prisma/history/s1-2-03c1/schema.prisma',
    targetPath: 'apps/api/prisma/schema.prisma',
  },
  {
    bytes: 39_513,
    gitOid: 'b1fed269d2582d50cafefb2695463a0fd2d54cc5',
    sha256: '37e97b5bb370447fdfa6cc856c44d8d25dd518b43879ff8cd04c951ad062c6f6',
    sourcePath:
      'apps/api/prisma/migrations/20260914000000_canonical_postgresql_baseline/migration.sql',
    targetPath:
      'apps/api/prisma/migrations/20260914000000_canonical_postgresql_baseline/migration.sql',
  },
  {
    bytes: 49_168,
    gitOid: 'db4dcbf9ef66fa0aba04f3bd640d906568a5a0fe',
    sha256: 'e316e5fcf0b452c003074ba7e6cf60a07384b68fb2d904cfd387cac54919ffb2',
    sourcePath: 'apps/api/prisma/migrations/20260914000100_canonical_sql_constraints/migration.sql',
    targetPath: 'apps/api/prisma/migrations/20260914000100_canonical_sql_constraints/migration.sql',
  },
  {
    bytes: 32_092,
    gitOid: '756163fd30efb69c1e643281919e6c760cb03df6',
    sha256: 'e04f8f340cfb8ad00a059a9a6132104bad872cc3bb5bcafeaa02f13c00b18631',
    sourcePath:
      'apps/api/prisma/migrations/20261002170022_admin_auth_session_runtime/migration.sql',
    targetPath:
      'apps/api/prisma/migrations/20261002170022_admin_auth_session_runtime/migration.sql',
  },
  {
    bytes: 128,
    gitOid: '044d57cdb0d5b5bff3475112359a4ee70439bf78',
    sha256: '99836963713b4f5b269ad49af0ed3d7b0b2e336115c2f92dc9ac683d139d0900',
    sourcePath: 'apps/api/prisma/migrations/migration_lock.toml',
    targetPath: 'apps/api/prisma/migrations/migration_lock.toml',
  },
];

export function historicalArtifactManifest() {
  return HISTORICAL_ARTIFACTS.map((artifact) => ({ ...artifact }));
}

export function historicalReferenceMetadata() {
  return {
    commit: HISTORICAL_REFERENCE,
    tree: HISTORICAL_REFERENCE_TREE,
  };
}
const POSTGRES_READINESS_ATTEMPT_TIMEOUT_MILLISECONDS = 2_000;
const POSTGRES_READINESS_CLEANUP_TIMEOUT_MILLISECONDS = 500;
const POSTGRES_READINESS_GRACEFUL_CLEANUP_TIMEOUT_MILLISECONDS = 350;
const POSTGRES_READINESS_DRIVER_TIMEOUT_LEAD_MILLISECONDS = 25;
const POSTGRES_READINESS_INTERVAL_MILLISECONDS = 250;
const POSTGRES_READINESS_TIMEOUT_MILLISECONDS = 30_000;

function fail(message) {
  throw new Error(`S1.2-03C1 PostgreSQL validation failed: ${message}`);
}

function errorMetadata(error) {
  return {
    code:
      typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'none',
    name:
      typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      typeof error.name === 'string' &&
      error.name.length > 0
        ? error.name
        : 'UnknownError',
  };
}

function remainingMilliseconds(deadline, now) {
  return Math.max(0, Math.ceil(deadline - now()));
}

function driverTimeoutMilliseconds(remaining, leadMilliseconds) {
  const lead = Math.min(leadMilliseconds, Math.max(0, Math.floor(remaining / 4)));
  return Math.max(1, remaining - lead);
}

function readinessTimeoutError({
  attempts,
  elapsedMilliseconds,
  lastError,
  phase,
  timeoutMilliseconds,
}) {
  const metadata = errorMetadata(lastError);
  const error = new Error(
    `phase=postgres_readiness timeout_phase=${phase} timeout_ms=${timeoutMilliseconds} attempts=${attempts} elapsed_ms=${elapsedMilliseconds} last_error_name=${metadata.name} last_error_code=${metadata.code}`,
  );
  error.name = 'PostgresReadinessTimeoutError';
  error.phase = 'postgres_readiness';
  error.timeoutPhase = phase;
  error.attempts = attempts;
  error.elapsedMilliseconds = elapsedMilliseconds;
  error.lastErrorCode = metadata.code;
  error.lastErrorName = metadata.name;
  return error;
}

function cleanupTimeoutError({ elapsedMilliseconds, timeoutMilliseconds }) {
  const error = new Error(
    `phase=postgres_readiness_cleanup cleanup_timeout_ms=${timeoutMilliseconds} elapsed_ms=${elapsedMilliseconds}`,
  );
  error.name = 'PostgresReadinessCleanupTimeoutError';
  error.phase = 'postgres_readiness_cleanup';
  error.elapsedMilliseconds = elapsedMilliseconds;
  return error;
}

function cleanupCompatibilityError() {
  const error = new Error('phase=postgres_readiness_cleanup hard_abort=unavailable pg_pin=8.22.0');
  error.name = 'PostgresReadinessCleanupCompatibilityError';
  error.phase = 'postgres_readiness_cleanup';
  return error;
}

function reflect(promise) {
  return Promise.resolve(promise).then(
    (value) => ({ status: 'fulfilled', value }),
    (reason) => ({ reason, status: 'rejected' }),
  );
}

function hardAbortPinnedPgTransport(client) {
  // node-postgres has no public force-destroy method. The lockfile pins pg
  // 8.22.0, whose Client owns a node:net Socket at connection.stream. This
  // compatibility-guarded fallback is used only after public end() fails to
  // settle; destroy() is the Node-supported hard cancellation boundary.
  const stream = client?.connection?.stream;
  if (
    stream === undefined ||
    typeof stream.destroy !== 'function' ||
    typeof stream.once !== 'function' ||
    typeof stream.closed !== 'boolean'
  ) {
    throw cleanupCompatibilityError();
  }
  if (stream.closed) return Promise.resolve();

  const closedPromise = new Promise((resolveClosed) => stream.once('close', resolveClosed));
  if (!stream.destroyed) stream.destroy();
  return closedPromise;
}

async function settleBeforeDeadline({
  cancelTimeout,
  deadline,
  now,
  onOperationStarted = () => {},
  operation,
  scheduleTimeout,
  timeoutError,
}) {
  const remaining = remainingMilliseconds(deadline, now);
  if (remaining === 0) throw timeoutError();

  let timeoutHandle;
  const operationPromise = Promise.resolve().then(operation);
  onOperationStarted(operationPromise);
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = scheduleTimeout(() => reject(timeoutError()), remaining);
  });

  try {
    const value = await Promise.race([operationPromise, timeoutPromise]);
    if (now() >= deadline) throw timeoutError();
    return value;
  } finally {
    if (timeoutHandle !== undefined) cancelTimeout(timeoutHandle);
    // Promise.race does not cancel its losing branch. Always retain a rejection
    // handler; readiness cleanup also waits for this exact promise and uses the
    // pinned hard-abort boundary if public end() cannot settle it.
    void operationPromise.catch(() => {});
  }
}

async function closeRejectedClient({
  cancelTimeout,
  cleanupTimeoutMilliseconds,
  client,
  destroyClientTransport,
  gracefulCleanupTimeoutMilliseconds,
  hardDeadline,
  now,
  operationPromise,
  scheduleTimeout,
  startedAt,
}) {
  const cleanupDeadline = Math.min(hardDeadline, now() + cleanupTimeoutMilliseconds);
  const gracefulDeadline = Math.min(cleanupDeadline, now() + gracefulCleanupTimeoutMilliseconds);
  const makeTimeoutError = () =>
    cleanupTimeoutError({
      elapsedMilliseconds: Math.max(0, Math.ceil(now() - startedAt)),
      timeoutMilliseconds: cleanupTimeoutMilliseconds,
    });

  let endPromise;
  try {
    endPromise = Promise.resolve(client.end());
  } catch (error) {
    endPromise = Promise.reject(error);
  }
  void endPromise.catch(() => {});
  const endOutcome = reflect(endPromise);
  const operationOutcome =
    operationPromise === undefined ? Promise.resolve() : reflect(operationPromise);

  let publicCleanupError;
  try {
    const [endState] = await settleBeforeDeadline({
      cancelTimeout,
      deadline: gracefulDeadline,
      now,
      operation: () => Promise.all([endOutcome, operationOutcome]),
      scheduleTimeout,
      timeoutError: makeTimeoutError,
    });
    if (endState.status === 'rejected') throw endState.reason;
    return;
  } catch (error) {
    publicCleanupError = error;
  }

  let forcedCleanupError;
  try {
    // Invoke destroy synchronously even when the hard deadline has just
    // elapsed; settleBeforeDeadline then bounds observation of socket close and
    // the discarded client's error channel. The original operation retains a
    // rejection handler but cannot reuse a transport whose close was observed.
    if (typeof client.on === 'function') client.on('error', () => {});
    const forcedClosePromise = Promise.resolve(destroyClientTransport(client));
    void forcedClosePromise.catch(() => {});
    await settleBeforeDeadline({
      cancelTimeout,
      deadline: cleanupDeadline,
      now,
      operation: () => forcedClosePromise,
      scheduleTimeout,
      timeoutError: makeTimeoutError,
    });
  } catch (error) {
    forcedCleanupError = error;
  }

  if (forcedCleanupError !== undefined) {
    throw new AggregateError(
      [publicCleanupError, forcedCleanupError],
      'phase=postgres_readiness_cleanup public_end=failed hard_abort=failed',
      { cause: publicCleanupError },
    );
  }

  // A public end() that does not settle is terminal even when the pinned
  // fallback proves the transport released. Never retry from this branch.
  throw publicCleanupError;
}

export async function waitForPostgresReadiness({
  attemptTimeoutMilliseconds = POSTGRES_READINESS_ATTEMPT_TIMEOUT_MILLISECONDS,
  cancelTimeout = (handle) => clearTimeout(handle),
  cleanupTimeoutMilliseconds = POSTGRES_READINESS_CLEANUP_TIMEOUT_MILLISECONDS,
  createClient = ({ connectionTimeoutMillis }) =>
    new Client({ ...adminConfiguration(), connectionTimeoutMillis }),
  destroyClientTransport = hardAbortPinnedPgTransport,
  driverTimeoutLeadMilliseconds = POSTGRES_READINESS_DRIVER_TIMEOUT_LEAD_MILLISECONDS,
  gracefulCleanupTimeoutMilliseconds = POSTGRES_READINESS_GRACEFUL_CLEANUP_TIMEOUT_MILLISECONDS,
  intervalMilliseconds = POSTGRES_READINESS_INTERVAL_MILLISECONDS,
  now = () => performance.now(),
  scheduleTimeout = (callback, milliseconds) => setTimeout(callback, milliseconds),
  timeoutMilliseconds = POSTGRES_READINESS_TIMEOUT_MILLISECONDS,
} = {}) {
  if (!Number.isInteger(attemptTimeoutMilliseconds) || attemptTimeoutMilliseconds <= 0)
    throw new Error('PostgreSQL readiness attempt timeout must be a positive integer.');
  if (!Number.isInteger(cleanupTimeoutMilliseconds) || cleanupTimeoutMilliseconds <= 0)
    throw new Error('PostgreSQL readiness cleanup timeout must be a positive integer.');
  if (
    !Number.isInteger(gracefulCleanupTimeoutMilliseconds) ||
    gracefulCleanupTimeoutMilliseconds <= 0
  )
    throw new Error('PostgreSQL readiness graceful cleanup timeout must be a positive integer.');
  if (gracefulCleanupTimeoutMilliseconds >= cleanupTimeoutMilliseconds)
    throw new Error(
      'PostgreSQL readiness graceful cleanup timeout must be shorter than the cleanup timeout.',
    );
  if (cleanupTimeoutMilliseconds >= timeoutMilliseconds)
    throw new Error(
      'PostgreSQL readiness cleanup timeout must be shorter than the global timeout.',
    );
  if (!Number.isInteger(driverTimeoutLeadMilliseconds) || driverTimeoutLeadMilliseconds < 0)
    throw new Error('PostgreSQL readiness driver timeout lead must be a non-negative integer.');
  if (!Number.isInteger(intervalMilliseconds) || intervalMilliseconds <= 0)
    throw new Error('PostgreSQL readiness interval must be a positive integer.');
  if (!Number.isInteger(timeoutMilliseconds) || timeoutMilliseconds <= 0)
    throw new Error('PostgreSQL readiness timeout must be a positive integer.');

  const startedAt = now();
  const hardDeadline = startedAt + timeoutMilliseconds;
  const operationDeadline = hardDeadline - cleanupTimeoutMilliseconds;
  let attempts = 0;
  let lastError;

  const makeTimeoutError = (phase, error = lastError) =>
    readinessTimeoutError({
      attempts,
      elapsedMilliseconds: Math.max(0, Math.ceil(now() - startedAt)),
      lastError: error,
      phase,
      timeoutMilliseconds,
    });

  while (true) {
    const operationRemaining = remainingMilliseconds(operationDeadline, now);
    if (operationRemaining === 0) throw makeTimeoutError('attempt_start');

    attempts += 1;
    const attemptDeadline = Math.min(
      operationDeadline,
      now() + Math.min(attemptTimeoutMilliseconds, operationRemaining),
    );
    let client;
    let operationPromise;
    try {
      const connectionRemaining = remainingMilliseconds(attemptDeadline, now);
      client = createClient({
        connectionTimeoutMillis: driverTimeoutMilliseconds(
          connectionRemaining,
          driverTimeoutLeadMilliseconds,
        ),
      });
      await settleBeforeDeadline({
        cancelTimeout,
        deadline: attemptDeadline,
        now,
        onOperationStarted: (promise) => {
          operationPromise = promise;
        },
        operation: () => client.connect(),
        scheduleTimeout,
        timeoutError: () => makeTimeoutError('connect'),
      });

      const queryRemaining = remainingMilliseconds(attemptDeadline, now);
      if (queryRemaining === 0) throw makeTimeoutError('between_connect_and_query');
      const result = await settleBeforeDeadline({
        cancelTimeout,
        deadline: attemptDeadline,
        now,
        onOperationStarted: (promise) => {
          operationPromise = promise;
        },
        operation: () => client.query('SELECT 1 AS value'),
        scheduleTimeout,
        timeoutError: () => makeTimeoutError('select_1'),
      });
      if (result.rows[0]?.value !== 1) {
        const error = new Error('PostgreSQL readiness query returned an unexpected result.');
        error.name = 'PostgresReadinessProbeError';
        throw error;
      }
      return {
        attempts,
        client,
        elapsedMilliseconds: Math.max(0, Math.ceil(now() - startedAt)),
      };
    } catch (primaryError) {
      lastError = primaryError;
      let cleanupError;
      if (client !== undefined) {
        try {
          await closeRejectedClient({
            cancelTimeout,
            cleanupTimeoutMilliseconds,
            client,
            destroyClientTransport,
            gracefulCleanupTimeoutMilliseconds,
            hardDeadline,
            now,
            operationPromise,
            scheduleTimeout,
            startedAt,
          });
        } catch (error) {
          cleanupError = error;
        }
      }
      if (cleanupError !== undefined) {
        const primary = errorMetadata(primaryError);
        const cleanup = errorMetadata(cleanupError);
        throw new AggregateError(
          [primaryError, cleanupError],
          `phase=postgres_readiness primary_error_name=${primary.name} primary_error_code=${primary.code} cleanup_error_name=${cleanup.name} cleanup_error_code=${cleanup.code}`,
          { cause: primaryError },
        );
      }

      if (primaryError?.name === 'PostgresReadinessTimeoutError') throw primaryError;

      const retryRemaining = remainingMilliseconds(operationDeadline, now);
      if (retryRemaining === 0) throw makeTimeoutError('retry_delay', primaryError);
      const delay = Math.min(intervalMilliseconds, retryRemaining);
      await new Promise((resolveDelay) => scheduleTimeout(resolveDelay, delay));
      if (now() >= operationDeadline) throw makeTimeoutError('retry_delay', primaryError);
    }
  }
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

export function gitBlobOid(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

function safeRelativePath(path, label) {
  if (
    typeof path !== 'string' ||
    path.length === 0 ||
    isAbsolute(path) ||
    path.split(/[\\/]/u).some((part) => part === '' || part === '.' || part === '..')
  ) {
    fail(`${label} is not a safe relative path`);
  }
  return path;
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
  return stats;
}

function filesystemIdentity(path, expectedKind, label) {
  let stats;
  try {
    stats = lstatSync(path, { bigint: true });
  } catch (error) {
    fail(`${label} identity is unavailable: ${error.code ?? error.name}`);
  }
  if (stats.isSymbolicLink()) fail(`${label} identity is a link or reparse point`);
  const kind = stats.isFile() ? 'file' : stats.isDirectory() ? 'directory' : 'unsupported';
  if (kind !== expectedKind) fail(`${label} identity changed type`);
  if (stats.ino === 0n) fail(`${label} has no stable filesystem identity`);
  return {
    birthtimeNs: stats.birthtimeNs.toString(),
    dev: stats.dev.toString(),
    ino: stats.ino.toString(),
    kind,
    mode: stats.mode.toString(),
  };
}

function rememberWorkspaceIdentity(workspace, path, kind, label) {
  const identity = filesystemIdentity(path, kind, label);
  workspace.identities.set(path, identity);
}

function assertWorkspaceObjectIdentity(workspace, path, kind, label) {
  const expected = workspace.identities.get(path);
  if (expected === undefined) fail(`${label} creation identity was not recorded`);
  const actual = filesystemIdentity(path, kind, label);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${label} was substituted`);
}

function assertWorkspaceIdentities(workspace) {
  assertWorkspaceObjectIdentity(
    workspace,
    workspace.root,
    'directory',
    'historical workspace root',
  );
  for (const directory of workspace.directories) {
    assertWorkspaceObjectIdentity(
      workspace,
      directory,
      'directory',
      'historical workspace directory',
    );
  }
  for (const path of workspace.files) {
    assertWorkspaceObjectIdentity(workspace, path, 'file', 'historical workspace artifact');
  }
}

function removeCreatedTempBase(workspace, label) {
  if (!workspace.tempBaseCreated) return;
  assertWorkspaceObjectIdentity(workspace, workspace.tempBase, 'directory', label);
  if (readdirSync(workspace.tempBase).length !== 0) fail(`${label} is not empty`);
  rmdirSync(workspace.tempBase);
}

export function validateHistoricalArtifactBuffer(artifact, contents) {
  safeRelativePath(artifact.sourcePath, 'historical source path');
  safeRelativePath(artifact.targetPath, 'historical target path');
  if (!Buffer.isBuffer(contents)) fail(`historical artifact is not binary: ${artifact.sourcePath}`);
  if (contents.length !== artifact.bytes)
    fail(`historical artifact size changed: ${artifact.sourcePath}`);
  if (sha256(contents) !== artifact.sha256)
    fail(`historical artifact SHA-256 changed: ${artifact.sourcePath}`);
  if (gitBlobOid(contents) !== artifact.gitOid)
    fail(`historical artifact Git blob changed: ${artifact.sourcePath}`);
}

function historicalModelNames(schema) {
  return [...schema.toString('utf8').matchAll(/^\s*model\s+([A-Za-z][A-Za-z0-9_]*)\s*\{/gmu)].map(
    ([, name]) => name,
  );
}

function verifyHistoricalSchema(schema) {
  if (schema.includes(13)) fail('historical schema is not LF-only');
  const models = historicalModelNames(schema);
  if (JSON.stringify(models) !== JSON.stringify(EXPECTED_HISTORICAL_MODELS))
    fail('historical schema model identity inventory changed');
}

function readHistoricalArtifacts(sourceRoot = repositoryRoot) {
  const artifacts = new Map();
  for (const artifact of HISTORICAL_ARTIFACTS) {
    const path = resolve(
      sourceRoot,
      safeRelativePath(artifact.sourcePath, 'historical source path'),
    );
    const rootRelativePath = relative(resolve(sourceRoot), path);
    if (rootRelativePath.startsWith(`..${sep}`) || rootRelativePath === '..')
      fail('historical source escaped its root');
    assertRegularFile(path, `historical artifact ${artifact.sourcePath}`);
    const contents = readFileSync(path);
    validateHistoricalArtifactBuffer(artifact, contents);
    artifacts.set(artifact.targetPath, { artifact, contents });
  }
  verifyHistoricalSchema(artifacts.get('apps/api/prisma/schema.prisma').contents);
  return artifacts;
}

function fileInventory(root) {
  if (!existsSync(root)) return [];
  const entries = [];
  const visit = (directory) => {
    const stats = lstatSync(directory);
    if (!stats.isDirectory() || stats.isSymbolicLink())
      fail('inventory encountered an unsafe directory');
    if (realpathSync(directory) !== resolve(directory))
      fail('inventory encountered a linked or reparsed directory');
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name.localeCompare(right.name, 'en'),
    )) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) fail('inventory encountered a symbolic link');
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        const bytes = readFileSync(path);
        entries.push({
          bytes: bytes.length,
          path: relative(root, path).split(sep).join('/'),
          sha256: sha256(bytes),
        });
      } else {
        fail('inventory encountered an unsupported filesystem entry');
      }
    }
  };
  visit(root);
  return entries;
}

function currentPrismaStateSignature() {
  const trackedFiles = [
    resolve(apiDirectory, 'prisma.config.ts'),
    resolve(prismaDirectory, 'schema.prisma'),
  ].map((path) => {
    assertRegularFile(path, 'current Prisma source');
    const bytes = readFileSync(path);
    return { bytes: bytes.length, path, sha256: sha256(bytes) };
  });
  const generatedClientDirectory = resolve(repositoryRoot, 'node_modules', '.prisma', 'client');
  return sha256(
    JSON.stringify({
      generatedClient: fileInventory(generatedClientDirectory),
      migrations: fileInventory(migrationsDirectory),
      trackedFiles,
    }),
  );
}

function verifyHistoricalToolchain() {
  const packageLock = readFileSync(resolve(repositoryRoot, 'package-lock.json'));
  if (gitBlobOid(packageLock) !== EXPECTED_PACKAGE_LOCK_OID)
    fail('package-lock.json no longer matches the qualified Prisma toolchain');
  const prismaPackage = JSON.parse(
    readFileSync(resolve(repositoryRoot, 'node_modules', 'prisma', 'package.json'), 'utf8'),
  );
  if (prismaPackage.version !== EXPECTED_PRISMA_VERSION)
    fail(`Prisma CLI ${EXPECTED_PRISMA_VERSION} is required`);
  process.stdout.write(
    `C1_HISTORICAL_TOOLCHAIN_PASS prisma=${EXPECTED_PRISMA_VERSION} package_lock_oid=${EXPECTED_PACKAGE_LOCK_OID}\n`,
  );
}

function verifyWorkspaceInventory(workspace, artifacts = HISTORICAL_ARTIFACTS) {
  assertWorkspaceIdentities(workspace);
  const actual = fileInventory(workspace.root).map(({ bytes, path, sha256: hash }) => ({
    bytes,
    path,
    sha256: hash,
  }));
  actual.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  const expected = artifacts
    .map((artifact) => ({
      bytes: artifact.bytes,
      path: artifact.targetPath,
      sha256: artifact.sha256,
    }))
    .sort((left, right) => left.path.localeCompare(right.path, 'en'));
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    fail('historical workspace inventory changed or contains an unexpected artifact');
}

function workspaceDirectories(root, artifacts = HISTORICAL_ARTIFACTS) {
  const directories = new Set();
  for (const artifact of artifacts) {
    let directory = dirname(resolve(root, artifact.targetPath));
    while (directory !== root) {
      directories.add(directory);
      directory = dirname(directory);
    }
  }
  return [...directories].sort((left, right) => left.split(sep).length - right.split(sep).length);
}

function assertWorkspaceRoot(workspace) {
  const base = realpathSync(workspace.tempBase);
  const root = realpathSync(workspace.root);
  if (
    !root.startsWith(`${base}${sep}`) ||
    !/^kora-c1-history-[A-Za-z0-9_-]+$/u.test(basename(root))
  )
    fail('historical workspace escaped its guarded temporary root');
  const stats = lstatSync(root);
  if (!stats.isDirectory() || stats.isSymbolicLink())
    fail('historical workspace root is not a safe directory');
  assertWorkspaceObjectIdentity(
    workspace,
    workspace.root,
    'directory',
    'historical workspace root',
  );
}

export function materializeHistoricalPrismaWorkspace({
  sourceRoot = repositoryRoot,
  tempBase = resolve(repositoryRoot, 'tmp'),
} = {}) {
  const source = resolve(sourceRoot);
  const base = resolve(tempBase);
  const baseRelativeToSource = relative(source, base);
  if (baseRelativeToSource.startsWith(`..${sep}`) || baseRelativeToSource === '..')
    fail('historical temporary root must stay under its source root');
  const artifacts = readHistoricalArtifacts(source);
  const createdBase = mkdirSync(base, { recursive: true });
  const baseStats = lstatSync(base);
  if (!baseStats.isDirectory() || baseStats.isSymbolicLink())
    fail('historical temporary base is not a safe directory');
  const tempBaseCreated = createdBase !== undefined;
  const tempBaseIdentity = tempBaseCreated
    ? filesystemIdentity(base, 'directory', 'created historical temporary base')
    : undefined;
  let root;
  try {
    root = mkdtempSync(resolve(base, 'kora-c1-history-'));
  } catch (error) {
    if (tempBaseCreated) {
      const actual = filesystemIdentity(base, 'directory', 'failed workspace temporary base');
      if (JSON.stringify(actual) !== JSON.stringify(tempBaseIdentity))
        throw new AggregateError(
          [error, new Error('failed workspace temporary base was substituted')],
          'historical workspace root creation failed',
          { cause: error },
        );
      if (readdirSync(base).length !== 0)
        throw new AggregateError(
          [error, new Error('failed workspace temporary base is not empty')],
          'historical workspace root creation failed',
          { cause: error },
        );
      rmdirSync(base);
    }
    throw error;
  }
  const workspace = {
    apiDirectory: resolve(root, 'apps', 'api'),
    configPath: resolve(root, 'apps', 'api', 'prisma.config.ts'),
    directories: [],
    files: [],
    identities: new Map(),
    migrationsDirectory: resolve(root, 'apps', 'api', 'prisma', 'migrations'),
    root,
    schemaPath: resolve(root, 'apps', 'api', 'prisma', 'schema.prisma'),
    tempBase: base,
    tempBaseCreated,
  };
  if (tempBaseCreated) workspace.identities.set(base, tempBaseIdentity);
  try {
    rememberWorkspaceIdentity(workspace, root, 'directory', 'created historical workspace root');
    workspace.directories = workspaceDirectories(root);
    for (const directory of workspace.directories) {
      mkdirSync(directory);
      rememberWorkspaceIdentity(
        workspace,
        directory,
        'directory',
        'created historical workspace directory',
      );
    }
    for (const artifact of HISTORICAL_ARTIFACTS) {
      const path = resolve(root, artifact.targetPath);
      const { contents } = artifacts.get(artifact.targetPath);
      writeFileSync(path, contents, { flag: 'wx', mode: 0o600 });
      workspace.files.push(path);
      rememberWorkspaceIdentity(workspace, path, 'file', `created artifact ${artifact.targetPath}`);
      assertRegularFile(path, `materialized artifact ${artifact.targetPath}`);
      validateHistoricalArtifactBuffer(artifact, readFileSync(path));
    }
    assertWorkspaceRoot(workspace);
    verifyWorkspaceInventory(workspace);
    return workspace;
  } catch (error) {
    const cleanupErrors = [];
    for (const path of [...workspace.files].reverse()) {
      try {
        if (existsSync(path)) {
          assertWorkspaceObjectIdentity(
            workspace,
            path,
            'file',
            'failed-creation cleanup artifact',
          );
          unlinkSync(path);
        }
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    for (const directory of [...workspace.directories].reverse()) {
      try {
        if (existsSync(directory)) {
          assertWorkspaceObjectIdentity(
            workspace,
            directory,
            'directory',
            'failed-creation cleanup directory',
          );
          rmdirSync(directory);
        }
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    try {
      if (existsSync(root)) {
        assertWorkspaceObjectIdentity(workspace, root, 'directory', 'failed-creation cleanup root');
        rmdirSync(root);
      }
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    try {
      removeCreatedTempBase(workspace, 'failed-creation cleanup temporary base');
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }
    if (cleanupErrors.length > 0)
      throw new AggregateError([error, ...cleanupErrors], 'historical workspace creation failed', {
        cause: error,
      });
    throw error;
  }
}

export function cleanupHistoricalPrismaWorkspace(workspace) {
  assertWorkspaceRoot(workspace);
  verifyWorkspaceInventory(workspace);
  for (const artifact of [...HISTORICAL_ARTIFACTS].reverse()) {
    const path = resolve(workspace.root, artifact.targetPath);
    assertWorkspaceObjectIdentity(
      workspace,
      path,
      'file',
      `historical cleanup artifact ${artifact.targetPath}`,
    );
    assertRegularFile(path, `historical cleanup artifact ${artifact.targetPath}`);
    validateHistoricalArtifactBuffer(artifact, readFileSync(path));
    unlinkSync(path);
  }
  for (const directory of [...workspace.directories].reverse()) {
    assertWorkspaceObjectIdentity(
      workspace,
      directory,
      'directory',
      'historical cleanup directory',
    );
    rmdirSync(directory);
  }
  assertWorkspaceObjectIdentity(workspace, workspace.root, 'directory', 'historical cleanup root');
  rmdirSync(workspace.root);
  removeCreatedTempBase(workspace, 'historical cleanup temporary base');
}

function verifyHistoricalWorkspace(workspace) {
  assertWorkspaceRoot(workspace);
  verifyWorkspaceInventory(workspace);
  for (const artifact of HISTORICAL_ARTIFACTS) {
    const path = resolve(workspace.root, artifact.targetPath);
    assertRegularFile(path, `historical workspace artifact ${artifact.targetPath}`);
    validateHistoricalArtifactBuffer(artifact, readFileSync(path));
  }
  process.stdout.write(
    `C1_HISTORICAL_REFERENCE_PASS ref=${HISTORICAL_REFERENCE} tree=${HISTORICAL_REFERENCE_TREE} artifacts=${HISTORICAL_ARTIFACTS.length} models=${EXPECTED_MODELS} migrations=3\n`,
  );
}

function migrationPath(name, directory = migrationsDirectory) {
  return resolve(directory, name, 'migration.sql');
}

function verifyImmutableHistory(workspace) {
  verifyHistoricalWorkspace(workspace);
  for (const migration of HISTORICAL_MIGRATIONS) {
    const contents = readFileSync(migrationPath(migration.name, workspace.migrationsDirectory));
    if (sha256(contents) !== migration.sha256)
      fail(`historical migration changed: ${migration.name}`);
  }
  const lock = readFileSync(resolve(workspace.migrationsDirectory, 'migration_lock.toml'));
  if (sha256(lock) !== LOCK_SHA256) fail('migration_lock.toml changed');
  process.stdout.write(
    'HISTORICAL_MIGRATIONS_IMMUTABLE_PASS migrations=3 lock=unchanged c2a=excluded\n',
  );
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

function runPrisma(argumentsList, database, allowedExitCodes = [0], cwd = apiDirectory) {
  const result = spawnSync(process.execPath, [prismaEntry, ...argumentsList], {
    cwd,
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

async function applyMigrationSql(client, name, directory = migrationsDirectory) {
  await client.query(readFileSync(migrationPath(name, directory), 'utf8'));
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
    'KORA_POSTGRES_C2A_ENABLED=false',
    '--env',
    `POSTGRES_DB=${database}`,
    '--env',
    `POSTGRES_USER=${process.env.S1203C1_ADMIN_USER}`,
    '--env',
    `KORA_POSTGRES_RUNTIME_USER=${process.env.S1203C1_READER_USER}`,
    '--env',
    `KORA_POSTGRES_ADMIN_WRITER_USER=${process.env.S1203C1_WRITER_USER}`,
    process.env.S1203C1_VALIDATION_CONTAINER,
    'sh',
    '/usr/local/bin/kora-provision-postgresql-runtime.sh',
  ];
}

function runProvisioner(database) {
  runDocker(provisionerArguments(database));
}

async function writerRefusalStateSignature(client, additionalRoles = []) {
  const roles = [
    ...new Set([
      process.env.S1203C1_READER_USER,
      process.env.S1203C1_WRITER_USER,
      ...additionalRoles,
    ]),
  ].sort();
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
  if (sections[0].length !== roles.length) {
    fail(`refusal signature did not cover all ${roles.length} protected roles`);
  }
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

async function membershipGrantState(client, grantedRole, memberRole) {
  const grant = await client.query(
    `
      SELECT membership.admin_option AS "adminOption",
             membership.inherit_option AS "inheritOption",
             membership.set_option AS "setOption"
      FROM pg_catalog.pg_auth_members AS membership
      JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
      JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
      WHERE granted_role.rolname = $1 AND member_role.rolname = $2
    `,
    [grantedRole, memberRole],
  );
  if (
    grant.rowCount !== 1 ||
    typeof grant.rows[0]?.adminOption !== 'boolean' ||
    typeof grant.rows[0]?.inheritOption !== 'boolean' ||
    typeof grant.rows[0]?.setOption !== 'boolean'
  ) {
    fail('membership grant and its raw options were not established exactly once');
  }
  return grant.rows[0];
}

async function verifyMembershipRefusalWithoutMutation(database, target, orientation) {
  if (!new Set(['reader', 'writer']).has(target)) fail('unknown membership target');
  if (!new Set(['roleid', 'member']).has(orientation)) fail('unknown membership orientation');
  const owner = new Client(adminConfiguration(database));
  const targetRole =
    target === 'reader' ? process.env.S1203C1_READER_USER : process.env.S1203C1_WRITER_USER;
  const probeRole = `c1_${target}_${orientation}_${process.pid}_${randomBytes(4).toString('hex')}`;
  if (
    !/^c1_(reader|writer)_(roleid|member)_\d+_[a-f0-9]{8}$/u.test(probeRole) ||
    probeRole.length > 63
  ) {
    fail('generated membership probe role failed its destructive-operation guard');
  }
  const grantedRole = orientation === 'roleid' ? targetRole : probeRole;
  const memberRole = orientation === 'roleid' ? probeRole : targetRole;
  const quotedTarget = quoteIdentifier(targetRole);
  const quotedProbe = quoteIdentifier(probeRole);
  const quotedGranted = orientation === 'roleid' ? quotedTarget : quotedProbe;
  const quotedMember = orientation === 'roleid' ? quotedProbe : quotedTarget;
  let probeCreated = false;
  let primaryError;
  await owner.connect();
  try {
    const existingProbe = await owner.query(
      'SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1',
      [probeRole],
    );
    if (existingProbe.rowCount !== 0) fail('membership probe role already exists');
    await owner.query(`CREATE ROLE ${quotedProbe} NOLOGIN NOINHERIT`);
    probeCreated = true;
    await owner.query(`GRANT ${quotedGranted} TO ${quotedMember}`);
    const grantBefore = await membershipGrantState(owner, grantedRole, memberRole);
    const signatureBefore = await writerRefusalStateSignature(owner, [probeRole]);
    const result = spawnSync('docker', provisionerArguments(database), {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (result.error !== undefined) throw result.error;
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    for (const secret of [
      process.env.S1203C1_ADMIN_PASSWORD,
      process.env.S1203C1_READER_PASSWORD,
      process.env.S1203C1_WRITER_PASSWORD,
    ]) {
      if (output.includes(secret)) fail('membership refusal output exposed a runtime credential');
    }
    const normalized = normalizeOutput(output).trim();
    if (
      result.status === 0 ||
      !/PostgreSQL runtime provisioning refused unsafe role membership count=[1-9][0-9]*\./u.test(
        normalized,
      )
    ) {
      fail(
        `${target} ${orientation} membership was not deterministically refused; exit=${result.status ?? 'unknown'}; diagnostic=${normalized.slice(-1_000) || '<empty>'}`,
      );
    }
    if (normalized.length > 2_000) fail('membership refusal diagnostic was not bounded');
    const signatureAfter = await writerRefusalStateSignature(owner, [probeRole]);
    if (signatureBefore !== signatureAfter) {
      fail(
        `${target} ${orientation} membership refusal mutated ACL, role, setting, membership, or credential state`,
      );
    }
    const grantAfter = await membershipGrantState(owner, grantedRole, memberRole);
    if (JSON.stringify(grantAfter) !== JSON.stringify(grantBefore)) {
      fail(`${target} ${orientation} membership options changed during refusal`);
    }
    process.stdout.write(
      `C1_MEMBERSHIP_REFUSAL_PASS database=${database} target=${target} orientation=${orientation} protected_roles=3 raw_options=${JSON.stringify(grantBefore)} acl_role_setting_signature=unchanged third_party_grant=preserved diagnostic=bounded\n`,
    );
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors = [];
  if (probeCreated) {
    try {
      await owner.query(`REVOKE ${quotedGranted} FROM ${quotedMember}`);
      const removedGrant = await owner.query(
        `
          SELECT 1
          FROM pg_catalog.pg_auth_members AS membership
          JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
          JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
          WHERE granted_role.rolname = $1 AND member_role.rolname = $2
        `,
        [grantedRole, memberRole],
      );
      if (removedGrant.rowCount !== 0) fail('targeted membership cleanup left the prepared grant');
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      await owner.query(`DROP ROLE ${quotedProbe}`);
      const removedProbe = await owner.query(
        'SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = $1',
        [probeRole],
      );
      if (removedProbe.rowCount !== 0) fail('targeted membership cleanup left the probe role');
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    await owner.end();
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (primaryError !== undefined) {
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [primaryError, ...cleanupErrors],
        'membership refusal failed and targeted cleanup was incomplete',
        { cause: primaryError },
      );
    }
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'targeted membership cleanup failed');
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

function comparePrismaProjection(database, workspace) {
  verifyHistoricalWorkspace(workspace);
  const result = runPrisma(
    [
      'migrate',
      'diff',
      '--config',
      workspace.configPath,
      '--from-schema',
      workspace.schemaPath,
      '--to-config-datasource',
      '--exit-code',
    ],
    database,
    [0, 2],
    workspace.apiDirectory,
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

async function installHistoricalChain(database, workspace) {
  verifyHistoricalWorkspace(workspace);
  const client = new Client(adminConfiguration(database));
  await client.connect();
  try {
    for (const migration of HISTORICAL_MIGRATIONS) {
      await applyMigrationSql(client, migration.name, workspace.migrationsDirectory);
      runPrisma(
        ['migrate', 'resolve', '--applied', migration.name, '--config', workspace.configPath],
        database,
        [0],
        workspace.apiDirectory,
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
            SELECT 1 FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
               OR membership.roleid = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_user)
          ) AS memberships_safe,
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
      'C1_RUNTIME_ACL_PASS reader=3-projections writer=column-only sinks=insert-only returning=denied enumDml=true typeUsage=0 memberships=0\n',
    );
  } finally {
    await reader.end();
    await writer.end();
  }
}

async function prepareUpgradeDatabase(database, workspace) {
  verifyHistoricalWorkspace(workspace);
  await installHistoricalChain(database, workspace);
  const client = new Client(adminConfiguration(database));
  await client.connect();
  try {
    const legacy = await insertLegacyAuditFixture(client);
    await applyMigrationSql(client, C1_MIGRATION, workspace.migrationsDirectory);
    runPrisma(
      ['migrate', 'resolve', '--applied', C1_MIGRATION, '--config', workspace.configPath],
      database,
      [0],
      workspace.apiDirectory,
    );
    await verifyLegacyAuditUpgrade(client, legacy);
    await assertCatalogInventory(client);
    comparePrismaProjection(database, workspace);
    await insertC1PositiveFixture(client);
    await runConstraintSuite(client);
    const signature = await catalogSignature(client);
    verifyHistoricalWorkspace(workspace);
    return signature;
  } finally {
    await client.end();
  }
}

async function prepareEmptyDatabase(database, workspace) {
  verifyHistoricalWorkspace(workspace);
  runPrisma(
    ['migrate', 'deploy', '--config', workspace.configPath],
    database,
    [0],
    workspace.apiDirectory,
  );
  runPrisma(
    ['migrate', 'status', '--config', workspace.configPath],
    database,
    [0],
    workspace.apiDirectory,
  );
  runPrisma(
    ['migrate', 'deploy', '--config', workspace.configPath],
    database,
    [0],
    workspace.apiDirectory,
  );
  const client = new Client(adminConfiguration(database));
  await client.connect();
  try {
    await assertCatalogInventory(client);
    comparePrismaProjection(database, workspace);
    await insertC1PositiveFixture(client);
    const signature = await catalogSignature(client);
    verifyHistoricalWorkspace(workspace);
    return signature;
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

async function runC1Validation(workspace) {
  verifyImmutableHistory(workspace);
  const readiness = await waitForPostgresReadiness();
  const admin = readiness.client;
  const databases = [];
  let membershipRefusalCount = 0;
  let primaryError;
  let provisionerSuccessCount = 0;
  let writerAclRefusalCount = 0;
  process.stdout.write(
    `POSTGRESQL_C1_TCP_READINESS_PASS host=${process.env.S1203C1_ADMIN_HOST} path=published authenticated=true select=1 attempts=${readiness.attempts} elapsed_ms=${readiness.elapsedMilliseconds}\n`,
  );
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
    const firstSignature = await prepareUpgradeDatabase(first, workspace);
    await createDatabase(admin, second);
    databases.push(second);
    const secondSignature = await prepareEmptyDatabase(second, workspace);
    if (firstSignature !== secondSignature)
      fail('upgrade and empty database catalog signatures differ');
    process.stdout.write(`C1_DATABASE_A_B_PROJECTION_PASS sha256=${firstSignature}\n`);
    for (const [index, database] of databases.entries()) {
      runProvisioner(database);
      provisionerSuccessCount += 1;
      runProvisioner(database);
      provisionerSuccessCount += 1;
      if (index === 0) {
        await verifyWriterRefusalWithoutMutation(database);
        writerAclRefusalCount += 1;
      }
      for (const target of ['reader', 'writer']) {
        for (const orientation of ['roleid', 'member']) {
          await verifyMembershipRefusalWithoutMutation(database, target, orientation);
          membershipRefusalCount += 1;
        }
      }
      await verifyRuntimeAcl(database);
    }
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
        'C1 validation failed and targeted database cleanup was incomplete',
        { cause: primaryError },
      );
    }
    throw primaryError;
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'targeted C1 cleanup failed');
  }
  process.stdout.write(
    `S1.2-03C1_ADMIN_AUTH_POSTGRESQL_PASS databases=${databases.length} models=${EXPECTED_MODELS} tables=${EXPECTED_TABLES_WITH_MIGRATION_HISTORY} provisioner_successes=${provisionerSuccessCount} provisioner_refusals=${writerAclRefusalCount + membershipRefusalCount} writer_acl_refusals=${writerAclRefusalCount} membership_refusals=${membershipRefusalCount}\n`,
  );
}

async function main() {
  assertEnvironment();
  verifyHistoricalToolchain();
  const currentStateBefore = currentPrismaStateSignature();
  let primaryError;
  let workspace;
  try {
    workspace = materializeHistoricalPrismaWorkspace();
    await runC1Validation(workspace);
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors = [];
  if (workspace !== undefined) {
    try {
      cleanupHistoricalPrismaWorkspace(workspace);
      process.stdout.write('TARGETED_C1_HISTORICAL_WORKSPACE_REMOVED\n');
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    const currentStateAfter = currentPrismaStateSignature();
    if (currentStateAfter !== currentStateBefore)
      fail('current Prisma sources, migrations, configuration, or generated client changed');
  } catch (error) {
    cleanupErrors.push(error);
  }

  if (primaryError !== undefined) {
    if (cleanupErrors.length > 0)
      throw new AggregateError(
        [primaryError, ...cleanupErrors],
        'C1 validation failed and historical isolation cleanup was incomplete',
        { cause: primaryError },
      );
    throw primaryError;
  }
  if (cleanupErrors.length > 0)
    throw new AggregateError(cleanupErrors, 'C1 historical isolation cleanup failed');
  process.stdout.write(
    'C1_CURRENT_PRISMA_STATE_UNCHANGED_PASS schema=true migrations=true config=true generated_client=true\n',
  );
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${normalizeOutput(error.stack ?? error.message)}\n`);
    process.exitCode = 1;
  });
}
