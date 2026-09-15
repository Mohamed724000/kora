import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

const { Client } = pg;
const prismaDirectory = dirname(fileURLToPath(import.meta.url));
const apiDirectory = resolve(prismaDirectory, '..');
const repositoryRoot = resolve(apiDirectory, '..', '..');
const prismaEntry = resolve(repositoryRoot, 'node_modules', 'prisma', 'build', 'index.js');
const migrationsDirectory = resolve(prismaDirectory, 'migrations');
const baselinePath = resolve(
  migrationsDirectory,
  '20260914000000_canonical_postgresql_baseline',
  'migration.sql',
);
const constraintsPath = resolve(
  migrationsDirectory,
  '20260914000100_canonical_sql_constraints',
  'migration.sql',
);

const EXPECTED_TABLES = [
  'AdminIdempotencyRecord',
  'AdminRecoveryCode',
  'AdminSession',
  'AdminUser',
  'Artist',
  'ArtistEarning',
  'ArtistSettlement',
  'AudioContent',
  'AuditLog',
  'ContentPublication',
  'Customer',
  'CustomerDevice',
  'CustomerSession',
  'Entitlement',
  'IdempotencyRecord',
  'LedgerAccount',
  'LedgerPosting',
  'LedgerTransactionGroup',
  'MediaAsset',
  'MediaWebhookInbox',
  'Order',
  'OrderItem',
  'OrderStateEvent',
  'OtpChallenge',
  'OutboxEvent',
  'PaymentAttempt',
  'PaymentAttemptEvent',
  'PaymentWebhookInbox',
  'PreviewGrant',
  'PreviewPlaybackDescriptor',
  'PublicationMediaAsset',
  'PurchasedPlaybackDescriptor',
  'Settlement',
];

function fail(message) {
  throw new Error(`S1.2-02 PostgreSQL validation failed: ${message}`);
}

function normalizeOutput(value) {
  return value
    .replaceAll(repositoryRoot.split(sep).join('/'), '<repository>')
    .replaceAll(repositoryRoot, '<repository>')
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/giu, '<redacted-database-url>');
}

function runPrisma(argumentsList, environment, allowedExitCodes = [0]) {
  const result = spawnSync(process.execPath, [prismaEntry, ...argumentsList], {
    cwd: apiDirectory,
    encoding: 'utf8',
    env: environment,
    windowsHide: true,
  });
  const stdout = normalizeOutput(result.stdout ?? '');
  const stderr = normalizeOutput(result.stderr ?? '');
  if (result.error !== undefined) {
    throw result.error;
  }
  if (!allowedExitCodes.includes(result.status)) {
    fail(`Prisma ${argumentsList.join(' ')} exited ${result.status}.\n${stdout}${stderr}`);
  }
  return { status: result.status, stderr, stdout };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function assertExactSet(label, actual, expected) {
  const normalizedActual = sorted(actual);
  const normalizedExpected = sorted(expected);
  if (JSON.stringify(normalizedActual) !== JSON.stringify(normalizedExpected)) {
    fail(
      `${label} mismatch. Expected ${JSON.stringify(normalizedExpected)}, received ${JSON.stringify(normalizedActual)}.`,
    );
  }
}

function namesFromSql(sql, expression) {
  return [...sql.matchAll(expression)].map((match) => match[1]);
}

function databaseName(label) {
  const name = `kora_s1202_${label}_${process.pid}_${randomBytes(4).toString('hex')}`;
  if (!/^kora_s1202_[ab]_\d+_[a-f0-9]{8}$/u.test(name) || name.length > 63) {
    fail('generated database name did not satisfy the destructive-operation guard');
  }
  return name;
}

function quoteDatabaseIdentifier(name) {
  if (!/^kora_s1202_[ab]_\d+_[a-f0-9]{8}$/u.test(name)) {
    fail(`refused unsafe database identifier ${JSON.stringify(name)}`);
  }
  return `"${name}"`;
}

function connectionConfiguration(database) {
  return {
    database,
    host: process.env.DATABASE_HOST,
    password: process.env.DATABASE_PASSWORD,
    port: Number(process.env.DATABASE_PORT),
    user: process.env.DATABASE_USER,
  };
}

function environmentForDatabase(database) {
  return { ...process.env, DATABASE_NAME: database };
}

async function createDatabase(admin, name) {
  const existing = await admin.query('SELECT datname FROM pg_database WHERE datname = $1', [name]);
  if (existing.rowCount !== 0) {
    fail(`ephemeral database ${name} unexpectedly existed before this run`);
  }
  await admin.query(`CREATE DATABASE ${quoteDatabaseIdentifier(name)} ENCODING 'UTF8'`);
}

async function dropDatabase(admin, name) {
  await admin.query(`DROP DATABASE ${quoteDatabaseIdentifier(name)} WITH (FORCE)`);
  const remaining = await admin.query('SELECT datname FROM pg_database WHERE datname = $1', [name]);
  if (remaining.rowCount !== 0) {
    fail(`targeted cleanup did not remove ${name}`);
  }
  process.stdout.write(`TARGETED_DATABASE_REMOVED ${name}\n`);
}

function verifyDeterministicBaseline() {
  const temporaryDirectory = mkdtempSync(resolve(tmpdir(), 'kora-s1202-prisma-'));
  const generatedPath = resolve(temporaryDirectory, 'migration.sql');
  try {
    runPrisma(
      [
        'migrate',
        'diff',
        '--config',
        'prisma.config.ts',
        '--from-empty',
        '--to-schema',
        'prisma/schema.prisma',
        '--script',
        '--output',
        generatedPath,
      ],
      process.env,
    );
    const committed = readFileSync(baselinePath);
    const generated = readFileSync(generatedPath);
    if (!committed.equals(generated)) {
      fail('the committed Prisma baseline is not byte-for-byte reproducible');
    }
    process.stdout.write(
      `DETERMINISTIC_BASELINE_PASS sha256=${sha256(committed)} bytes=${committed.length}\n`,
    );
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

async function structuralInventory(client) {
  const tables = await client.query(`
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `);
  assertExactSet(
    'canonical tables',
    tables.rows.map(({ tablename }) => tablename),
    EXPECTED_TABLES,
  );

  const baselineSql = readFileSync(baselinePath, 'utf8');
  const constraintsSql = readFileSync(constraintsPath, 'utf8');
  const expectedForeignKeys = namesFromSql(
    `${baselineSql}\n${constraintsSql}`,
    /ADD CONSTRAINT "([^"]+)"\s+FOREIGN KEY/gu,
  );
  const expectedChecks = namesFromSql(constraintsSql, /ADD CONSTRAINT "([^"]+_check)"/gu);
  const expectedFunctions = namesFromSql(constraintsSql, /CREATE FUNCTION public\.([a-z0-9_]+)/gu);
  const expectedTriggers = namesFromSql(
    constraintsSql,
    /CREATE (?:CONSTRAINT )?TRIGGER "([^"]+)"/gu,
  );
  const expectedDeclaredIndexes = namesFromSql(
    `${baselineSql}\n${constraintsSql}`,
    /CREATE (?:UNIQUE )?INDEX "([^"]+)"/gu,
  );
  const expectedPrimaryIndexes = namesFromSql(
    baselineSql,
    /CONSTRAINT "([^"]+_pkey)" PRIMARY KEY/gu,
  );

  const foreignKeys = await client.query(`
    SELECT conname
    FROM pg_catalog.pg_constraint
    WHERE connamespace = 'public'::regnamespace AND contype = 'f'
    ORDER BY conname
  `);
  assertExactSet(
    'foreign keys',
    foreignKeys.rows.map(({ conname }) => conname),
    expectedForeignKeys,
  );

  const checks = await client.query(`
    SELECT conname
    FROM pg_catalog.pg_constraint
    WHERE connamespace = 'public'::regnamespace AND contype = 'c'
    ORDER BY conname
  `);
  assertExactSet(
    'CHECK constraints',
    checks.rows.map(({ conname }) => conname),
    expectedChecks,
  );

  const functions = await client.query(`
    SELECT p.proname
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'kora_%'
    ORDER BY p.proname
  `);
  assertExactSet(
    'integrity functions',
    functions.rows.map(({ proname }) => proname),
    expectedFunctions,
  );

  const triggers = await client.query(`
    SELECT t.tgname
    FROM pg_catalog.pg_trigger t
    JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
    ORDER BY t.tgname
  `);
  assertExactSet(
    'integrity triggers',
    triggers.rows.map(({ tgname }) => tgname),
    expectedTriggers,
  );

  const indexes = await client.query(`
    SELECT indexname, indexdef
    FROM pg_catalog.pg_indexes
    WHERE schemaname = 'public'
    ORDER BY indexname
  `);
  const expectedIndexes = [
    ...expectedDeclaredIndexes,
    ...expectedPrimaryIndexes,
    '_prisma_migrations_pkey',
  ];
  assertExactSet(
    'indexes',
    indexes.rows.map(({ indexname }) => indexname),
    expectedIndexes,
  );
  for (const partialIndex of [
    'ContentPublication_one_active_per_content_key',
    'CustomerSession_one_active_per_customer_key',
  ]) {
    const definition = indexes.rows.find(({ indexname }) => indexname === partialIndex)?.indexdef;
    if (definition === undefined || !definition.includes(' WHERE ')) {
      fail(`${partialIndex} is not materialized as a partial index`);
    }
  }

  const migrations = await client.query(`
    SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at
    FROM public._prisma_migrations
    ORDER BY started_at
  `);
  if (
    migrations.rowCount !== 2 ||
    migrations.rows.some(
      ({ finished, rolled_back_at: rolledBackAt }) => finished !== true || rolledBackAt !== null,
    )
  ) {
    fail('Prisma migration history is incomplete or contains a rollback');
  }

  process.stdout.write(
    `CATALOG_INVENTORY_PASS tables=${tables.rowCount} foreignKeys=${foreignKeys.rowCount} indexes=${indexes.rowCount} checks=${checks.rowCount} functions=${functions.rowCount} triggers=${triggers.rowCount}\n`,
  );
}

async function catalogSignature(client) {
  const queries = [
    `SELECT table_name, column_name, ordinal_position, is_nullable, data_type, udt_name, COALESCE(column_default, '') AS column_default
       FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`,
    `SELECT conname, contype, conrelid::regclass::text AS relation, pg_get_constraintdef(oid, true) AS definition
       FROM pg_catalog.pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY conname`,
    `SELECT indexname, indexdef FROM pg_catalog.pg_indexes WHERE schemaname = 'public' ORDER BY indexname`,
    `SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS arguments, pg_get_functiondef(p.oid) AS definition
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
  for (const query of queries) {
    sections.push((await client.query(query)).rows);
  }
  return sha256(JSON.stringify(sections));
}

async function insertPositiveFixture(client) {
  await client.query('BEGIN');
  try {
    await client.query(`
      INSERT INTO "Customer" ("id", "verifiedPhone", "passwordHash", "createdAt", "updatedAt") VALUES
        ('customer-1', '+22370000001', 'hash-customer-1', TIMESTAMP '2026-09-14 00:00:00', TIMESTAMP '2026-09-14 00:00:00'),
        ('customer-2', '+22370000002', 'hash-customer-2', TIMESTAMP '2026-09-14 00:00:00', TIMESTAMP '2026-09-14 00:00:00');
      INSERT INTO "CustomerDevice" ("id", "customerId", "fingerprintHash", "platform", "registeredAt", "lastSeenAt") VALUES
        ('device-1', 'customer-1', 'fingerprint-1', 'ANDROID', TIMESTAMP '2026-09-14 00:00:00', TIMESTAMP '2026-09-14 00:00:00'),
        ('device-2', 'customer-2', 'fingerprint-2', 'IOS', TIMESTAMP '2026-09-14 00:00:00', TIMESTAMP '2026-09-14 00:00:00');
      INSERT INTO "CustomerSession" ("id", "customerId", "deviceId", "sessionFamilyId", "accessTokenId", "refreshTokenHash", "expiresAt", "createdAt")
        VALUES ('customer-session-1', 'customer-1', 'device-1', 'family-1', 'access-token-1', 'refresh-token-1', TIMESTAMP '2026-10-14 00:00:00', TIMESTAMP '2026-09-14 00:00:00');

      INSERT INTO "AdminUser" ("id", "email", "passwordHash", "role", "createdAt")
        VALUES ('admin-1', 'admin1@example.invalid', 'hash-admin-1', 'SUPER_ADMIN', TIMESTAMP '2026-09-14 00:00:00');
      INSERT INTO "AdminSession" ("id", "adminUserId", "tokenFamilyId", "accessTokenJti", "refreshTokenHash", "lastTwoFactorAt", "expiresAt", "createdAt", "updatedAt")
        VALUES ('admin-session-1', 'admin-1', 'admin-family-1', 'admin-jti-1', 'admin-refresh-1', TIMESTAMP '2026-09-14 00:00:00', TIMESTAMP '2026-09-14 08:00:00', TIMESTAMP '2026-09-14 00:00:00', TIMESTAMP '2026-09-14 00:00:00');
      INSERT INTO "AdminRecoveryCode" ("id", "adminUserId", "codeHash", "createdAt")
        VALUES ('admin-recovery-1', 'admin-1', 'argon2id-recovery-hash-1', TIMESTAMP '2026-09-14 00:00:00');
      UPDATE "AdminRecoveryCode" SET "usedAt" = TIMESTAMP '2026-09-14 00:05:00'
        WHERE "id" = 'admin-recovery-1';

      INSERT INTO "Artist" ("id", "createdByAdminId", "stageName", "createdAt", "updatedAt")
        VALUES ('artist-1', 'admin-1', 'Artiste Un', TIMESTAMP '2026-09-14 00:00:00', TIMESTAMP '2026-09-14 00:00:00');
      INSERT INTO "AudioContent" ("id", "artistId", "createdByAdminId", "title", "priceCfa", "previewSeconds", "createdAt", "updatedAt")
        VALUES ('audio-1', 'artist-1', 'admin-1', 'Audio Un', 100, 30, TIMESTAMP '2026-09-14 00:00:00', TIMESTAMP '2026-09-14 00:00:00');

      INSERT INTO "MediaAsset" ("id", "audioContentId", "kind", "processingStatus", "version", "privateStorageObjectKey", "createdAt", "updatedAt") VALUES
        ('media-audio-1', 'audio-1', 'AUDIO_MASTER', 'PREPARING', 1, 'private/audio-1', TIMESTAMP '2026-09-14 00:00:00', TIMESTAMP '2026-09-14 00:00:00'),
        ('media-cover-1', 'audio-1', 'COVER_IMAGE', 'PREPARING', 1, 'private/cover-1', TIMESTAMP '2026-09-14 00:00:00', TIMESTAMP '2026-09-14 00:00:00');
      UPDATE "MediaAsset" SET "processingStatus" = 'UPLOAD_PENDING', "provider" = 'MUX', "privateProviderUploadRef" = 'upload-audio-1', "updatedAt" = TIMESTAMP '2026-09-14 00:01:00' WHERE "id" = 'media-audio-1';
      UPDATE "MediaAsset" SET "processingStatus" = 'PROCESSING', "privateProviderAssetRef" = 'asset-audio-1', "updatedAt" = TIMESTAMP '2026-09-14 00:02:00' WHERE "id" = 'media-audio-1';
      UPDATE "MediaAsset" SET "processingStatus" = 'READY', "checksumSha256" = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', "durationSeconds" = 100, "updatedAt" = TIMESTAMP '2026-09-14 00:03:00' WHERE "id" = 'media-audio-1';
      UPDATE "MediaAsset" SET "processingStatus" = 'UPLOAD_PENDING', "provider" = 'MUX', "privateProviderUploadRef" = 'upload-cover-1', "updatedAt" = TIMESTAMP '2026-09-14 00:01:00' WHERE "id" = 'media-cover-1';
      UPDATE "MediaAsset" SET "processingStatus" = 'PROCESSING', "privateProviderAssetRef" = 'asset-cover-1', "updatedAt" = TIMESTAMP '2026-09-14 00:02:00' WHERE "id" = 'media-cover-1';
      UPDATE "MediaAsset" SET "processingStatus" = 'READY', "checksumSha256" = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', "updatedAt" = TIMESTAMP '2026-09-14 00:03:00' WHERE "id" = 'media-cover-1';

      INSERT INTO "ContentPublication" ("id", "audioContentId", "publishedByAdminId", "publishedAt")
        VALUES ('publication-1', 'audio-1', 'admin-1', TIMESTAMP '2026-09-14 00:04:00');
      INSERT INTO "PublicationMediaAsset" ("id", "publicationId", "audioContentId", "kind", "mediaAssetId", "mediaAssetVersion", "readinessChecksum", "verifiedReadyAt") VALUES
        ('publication-link-audio-1', 'publication-1', 'audio-1', 'AUDIO_MASTER', 'media-audio-1', 1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', TIMESTAMP '2026-09-14 00:03:00'),
        ('publication-link-cover-1', 'publication-1', 'audio-1', 'COVER_IMAGE', 'media-cover-1', 1, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', TIMESTAMP '2026-09-14 00:03:00');

      INSERT INTO "Order" ("id", "customerId", "currency", "totalCfa", "createdAt")
        VALUES ('order-1', 'customer-1', 'XOF', 100, TIMESTAMP '2026-09-14 01:00:00');
      INSERT INTO "OrderItem" ("id", "orderId", "audioContentId", "titleSnapshot", "unitPriceCfa", "quantity", "createdAt")
        VALUES ('order-item-1', 'order-1', 'audio-1', 'Audio Un', 100, 1, TIMESTAMP '2026-09-14 01:00:00');
      INSERT INTO "OrderStateEvent" ("id", "orderId", "sequence", "state", "recordedAt") VALUES
        ('order-state-1', 'order-1', 1, 'CREATED', TIMESTAMP '2026-09-14 01:00:00'),
        ('order-state-2', 'order-1', 2, 'PAYMENT_PENDING', TIMESTAMP '2026-09-14 01:01:00');
      INSERT INTO "PaymentAttempt" ("id", "orderId", "provider", "amountCfa", "currency", "idempotencyKey", "createdAt")
        VALUES ('payment-attempt-1', 'order-1', 'SANDBOX_NEUTRAL', 100, 'XOF', '1234567890abcdef', TIMESTAMP '2026-09-14 01:01:00');
      INSERT INTO "PaymentAttemptEvent" ("id", "paymentAttemptId", "sequence", "state", "recordedAt") VALUES
        ('payment-event-1', 'payment-attempt-1', 1, 'CREATED', TIMESTAMP '2026-09-14 01:01:00'),
        ('payment-event-2', 'payment-attempt-1', 2, 'PENDING', TIMESTAMP '2026-09-14 01:02:00'),
        ('payment-event-3', 'payment-attempt-1', 3, 'SUCCEEDED', TIMESTAMP '2026-09-14 01:03:00');
      UPDATE "PaymentAttempt" SET "providerReference" = 'provider-payment-1' WHERE "id" = 'payment-attempt-1';
      INSERT INTO "OrderStateEvent" ("id", "orderId", "sequence", "state", "recordedAt")
        VALUES ('order-state-3', 'order-1', 3, 'SETTLED', TIMESTAMP '2026-09-14 01:04:00');

      INSERT INTO "Settlement" ("id", "orderId", "paymentAttemptId", "succeededAttemptEventId", "settledAmountCfa", "distributableBasisCfa", "artistPayableAmountCfa", "platformAmountCfa", "reconciliationKey", "reconciledAt", "settledAt")
        VALUES ('settlement-1', 'order-1', 'payment-attempt-1', 'payment-event-3', 100, 100, 20, 80, 'reconciliation-1', TIMESTAMP '2026-09-14 01:05:00', TIMESTAMP '2026-09-14 01:05:00');
      INSERT INTO "ArtistSettlement" ("id", "settlementId", "orderId", "artistId", "settlementSequence", "carryInNumerator", "exactEarningsNumerator", "exactNumerator", "payableAmountCfa", "carryOutNumerator", "reconciledAt", "createdAt")
        VALUES ('artist-settlement-1', 'settlement-1', 'order-1', 'artist-1', 1, 0, 200000, 200000, 20, 0, TIMESTAMP '2026-09-14 01:05:00', TIMESTAMP '2026-09-14 01:05:00');
      INSERT INTO "ArtistEarning" ("id", "settlementId", "orderId", "artistSettlementId", "orderItemId", "audioContentId", "artistId", "grossItemAmountCfa", "legallyRequiredTaxCfa", "refundAdjustmentCfa", "frozenBasisCfa", "artistRevenueShareBps", "exactEarningNumerator", "createdAt")
        VALUES ('artist-earning-1', 'settlement-1', 'order-1', 'artist-settlement-1', 'order-item-1', 'audio-1', 'artist-1', 100, 0, 0, 100, 2000, 200000, TIMESTAMP '2026-09-14 01:05:00');
      INSERT INTO "Entitlement" ("id", "customerId", "audioContentId", "orderItemId", "settlementId", "orderId", "grantedAt")
        VALUES ('entitlement-1', 'customer-1', 'audio-1', 'order-item-1', 'settlement-1', 'order-1', TIMESTAMP '2026-09-14 01:05:00');

      INSERT INTO "LedgerAccount" ("id", "code", "kind", "createdAt") VALUES
        ('ledger-account-debit', 'CUSTOMER-RECEIVABLE', 'CUSTOMER_RECEIVABLE', TIMESTAMP '2026-09-14 01:05:00'),
        ('ledger-account-credit', 'PLATFORM-REVENUE', 'PLATFORM_REVENUE', TIMESTAMP '2026-09-14 01:05:00');
      INSERT INTO "LedgerTransactionGroup" ("id", "settlementId", "eventKey", "createdAt")
        VALUES ('ledger-group-1', 'settlement-1', 'ledger-event-1', TIMESTAMP '2026-09-14 01:05:00');
      INSERT INTO "LedgerPosting" ("id", "groupId", "accountId", "direction", "amountCfa", "createdAt") VALUES
        ('ledger-posting-debit-1', 'ledger-group-1', 'ledger-account-debit', 'DEBIT', 100, TIMESTAMP '2026-09-14 01:05:00'),
        ('ledger-posting-credit-1', 'ledger-group-1', 'ledger-account-credit', 'CREDIT', 100, TIMESTAMP '2026-09-14 01:05:00');
      INSERT INTO "OutboxEvent" ("id", "aggregateType", "aggregateId", "eventType", "deduplicationKey", "payload", "createdAt")
        VALUES ('outbox-1', 'Settlement', 'settlement-1', 'SETTLEMENT_RECORDED', 'outbox-dedup-1', '{"settlementId":"settlement-1"}'::jsonb, TIMESTAMP '2026-09-14 01:05:00');

      INSERT INTO "PaymentWebhookInbox" ("id", "provider", "providerEventKey", "paymentAttemptId", "payloadHash", "encryptedPayload", "signatureVerifiedAt", "receivedAt")
        VALUES ('payment-inbox-1', 'SANDBOX_NEUTRAL', 'payment-event-key-1', 'payment-attempt-1', 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc', 'encrypted-payment-payload-1', TIMESTAMP '2026-09-14 01:03:00', TIMESTAMP '2026-09-14 01:04:00');
      UPDATE "PaymentWebhookInbox" SET "processingStatus" = 'PROCESSING' WHERE "id" = 'payment-inbox-1';
      UPDATE "PaymentWebhookInbox" SET "processingStatus" = 'PROCESSED', "processedAt" = TIMESTAMP '2026-09-14 01:05:00' WHERE "id" = 'payment-inbox-1';
      INSERT INTO "MediaWebhookInbox" ("id", "provider", "providerEventKey", "mediaAssetId", "eventType", "payloadHash", "encryptedPayload", "signatureVerifiedAt", "receivedAt")
        VALUES ('media-inbox-1', 'MUX', 'media-event-key-1', 'media-audio-1', 'video.asset.ready', 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd', 'encrypted-media-payload-1', TIMESTAMP '2026-09-14 00:02:00', TIMESTAMP '2026-09-14 00:03:00');
      UPDATE "MediaWebhookInbox" SET "processingStatus" = 'PROCESSING' WHERE "id" = 'media-inbox-1';
      UPDATE "MediaWebhookInbox" SET "processingStatus" = 'PROCESSED', "processedAt" = TIMESTAMP '2026-09-14 00:04:00' WHERE "id" = 'media-inbox-1';

      INSERT INTO "AuditLog" ("id", "adminUserId", "adminSessionId", "action", "entityType", "entityId", "reason", "requestId", "createdAt")
        VALUES ('audit-1', 'admin-1', 'admin-session-1', 'CONTENT_PUBLISHED', 'AudioContent', 'audio-1', 'validation fixture', 'request-0001', TIMESTAMP '2026-09-14 00:04:00');
      INSERT INTO "PreviewGrant" ("id", "audioContentId", "anonymousDeviceHash", "anonymousIpBucketHash", "tokenHash", "maxDurationSeconds", "expiresAt", "createdAt")
        VALUES ('preview-grant-1', 'audio-1', 'anonymous-device-1', 'anonymous-ip-1', 'preview-token-1', 30, TIMESTAMP '2026-09-14 02:02:00', TIMESTAMP '2026-09-14 02:00:00');
      INSERT INTO "PreviewPlaybackDescriptor" ("id", "previewGrantId", "descriptorHash", "expiresAt", "issuedAt")
        VALUES ('preview-descriptor-1', 'preview-grant-1', 'preview-descriptor-hash-1', TIMESTAMP '2026-09-14 02:01:00', TIMESTAMP '2026-09-14 02:00:00');
      INSERT INTO "PurchasedPlaybackDescriptor" ("id", "customerId", "entitlementId", "deviceId", "descriptorHash", "expiresAt", "issuedAt")
        VALUES ('purchased-descriptor-1', 'customer-1', 'entitlement-1', 'device-1', 'purchased-descriptor-hash-1', TIMESTAMP '2026-09-14 02:04:00', TIMESTAMP '2026-09-14 02:00:00');
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  process.stdout.write('POSITIVE_CONSTRAINT_FIXTURE_PASS\n');
}

async function insertLateEarningReopenFixture(client) {
  await client.query('BEGIN');
  try {
    await client.query(`
      INSERT INTO "Artist" ("id", "createdByAdminId", "stageName", "artistRevenueShareBps", "createdAt", "updatedAt")
        VALUES ('artist-reopen', 'admin-1', 'Artiste Réouverture', 2000, TIMESTAMP '2026-09-14 06:00:00', TIMESTAMP '2026-09-14 06:00:00');
      INSERT INTO "AudioContent" ("id", "artistId", "createdByAdminId", "title", "priceCfa", "previewSeconds", "createdAt", "updatedAt") VALUES
        ('audio-reopen-a', 'artist-reopen', 'admin-1', 'Réouverture A', 100, 30, TIMESTAMP '2026-09-14 06:00:00', TIMESTAMP '2026-09-14 06:00:00'),
        ('audio-reopen-b', 'artist-reopen', 'admin-1', 'Réouverture B', 50, 30, TIMESTAMP '2026-09-14 06:00:00', TIMESTAMP '2026-09-14 06:00:00');
      INSERT INTO "Order" ("id", "customerId", "currency", "totalCfa", "createdAt")
        VALUES ('order-reopen', 'customer-2', 'XOF', 150, TIMESTAMP '2026-09-14 06:10:00');
      INSERT INTO "OrderItem" ("id", "orderId", "audioContentId", "titleSnapshot", "unitPriceCfa", "quantity", "createdAt") VALUES
        ('order-item-reopen-a', 'order-reopen', 'audio-reopen-a', 'Réouverture A', 100, 1, TIMESTAMP '2026-09-14 06:10:00'),
        ('order-item-reopen-b', 'order-reopen', 'audio-reopen-b', 'Réouverture B', 50, 1, TIMESTAMP '2026-09-14 06:10:00');
      INSERT INTO "OrderStateEvent" ("id", "orderId", "sequence", "state", "recordedAt") VALUES
        ('order-state-reopen-1', 'order-reopen', 1, 'CREATED', TIMESTAMP '2026-09-14 06:10:00'),
        ('order-state-reopen-2', 'order-reopen', 2, 'PAYMENT_PENDING', TIMESTAMP '2026-09-14 06:11:00');
      INSERT INTO "PaymentAttempt" ("id", "orderId", "provider", "amountCfa", "currency", "idempotencyKey", "createdAt")
        VALUES ('payment-attempt-reopen', 'order-reopen', 'SANDBOX_NEUTRAL', 150, 'XOF', 'reopen-idempotency', TIMESTAMP '2026-09-14 06:11:00');
      INSERT INTO "PaymentAttemptEvent" ("id", "paymentAttemptId", "sequence", "state", "recordedAt") VALUES
        ('payment-event-reopen-1', 'payment-attempt-reopen', 1, 'CREATED', TIMESTAMP '2026-09-14 06:11:00'),
        ('payment-event-reopen-2', 'payment-attempt-reopen', 2, 'PENDING', TIMESTAMP '2026-09-14 06:12:00'),
        ('payment-event-reopen-3', 'payment-attempt-reopen', 3, 'SUCCEEDED', TIMESTAMP '2026-09-14 06:13:00');
      INSERT INTO "OrderStateEvent" ("id", "orderId", "sequence", "state", "recordedAt")
        VALUES ('order-state-reopen-3', 'order-reopen', 3, 'SETTLED', TIMESTAMP '2026-09-14 06:14:00');
      INSERT INTO "Settlement" ("id", "orderId", "paymentAttemptId", "succeededAttemptEventId", "settledAmountCfa", "distributableBasisCfa", "artistPayableAmountCfa", "platformAmountCfa", "reconciliationKey", "reconciledAt", "settledAt")
        VALUES ('settlement-reopen', 'order-reopen', 'payment-attempt-reopen', 'payment-event-reopen-3', 150, 100, 20, 80, 'reconciliation-reopen', TIMESTAMP '2026-09-14 06:15:00', TIMESTAMP '2026-09-14 06:15:00');
      INSERT INTO "ArtistSettlement" ("id", "settlementId", "orderId", "artistId", "settlementSequence", "carryInNumerator", "exactEarningsNumerator", "exactNumerator", "payableAmountCfa", "carryOutNumerator", "reconciledAt", "createdAt")
        VALUES ('artist-settlement-reopen', 'settlement-reopen', 'order-reopen', 'artist-reopen', 1, 0, 200000, 200000, 20, 0, TIMESTAMP '2026-09-14 06:15:00', TIMESTAMP '2026-09-14 06:15:00');
      INSERT INTO "ArtistEarning" ("id", "settlementId", "orderId", "artistSettlementId", "orderItemId", "audioContentId", "artistId", "grossItemAmountCfa", "legallyRequiredTaxCfa", "refundAdjustmentCfa", "frozenBasisCfa", "artistRevenueShareBps", "exactEarningNumerator", "createdAt")
        VALUES ('artist-earning-reopen-a', 'settlement-reopen', 'order-reopen', 'artist-settlement-reopen', 'order-item-reopen-a', 'audio-reopen-a', 'artist-reopen', 100, 0, 0, 100, 2000, 200000, TIMESTAMP '2026-09-14 06:15:00');
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  process.stdout.write('LATE_EARNING_REOPEN_FIXTURE_PASS\n');
}

const EXPECTED_FAILURE_CAUSES = {
  'admin-recovery-hash-immutable': {
    message: /AdminRecoveryCode hash and consumption proof are immutable/u,
  },
  'admin-recovery-used-once': {
    message: /AdminRecoveryCode hash and consumption proof are immutable/u,
  },
  'artist-earning-arithmetic': { constraint: 'ArtistEarning_amounts_check' },
  'artist-earning-gross-source': {
    message: /ArtistEarning gross amount must equal its priced OrderItem/u,
  },
  'artist-earning-late-basis-reopen': {
    message: /Settlement distributable basis must equal its immutable ArtistEarning bases/u,
  },
  'artist-earning-append-only': { message: /"?ArtistEarning"? is append-only/u },
  'artist-provenance-immutable': { message: /createdByAdminId is immutable/u },
  'artist-rate-bounded': { constraint: 'Artist_artistRevenueShareBps_check' },
  'artist-settlement-append-only': { message: /"?ArtistSettlement"? is append-only/u },
  'audit-delete-append-only': { message: /"?AuditLog"? is append-only/u },
  'audit-update-append-only': { message: /"?AuditLog"? is append-only/u },
  'content-provenance-immutable': { message: /createdByAdminId is immutable/u },
  'cross-customer-device-session': {
    constraint: 'CustomerSession_deviceId_customerId_fkey',
  },
  'descriptor-expiry-bounded': {
    constraint: 'PreviewPlaybackDescriptor_expiry_check',
  },
  'entitlement-chronology': { constraint: 'Entitlement_revokedAt_check' },
  'entitlement-grant-immutable': { message: /Entitlement grant evidence is immutable/u },
  'ledger-account-immutable': { message: /"?LedgerAccount"? is append-only/u },
  'ledger-balanced': { message: /LedgerTransactionGroup requires equal/u },
  'ledger-group-append-only': { message: /"?LedgerTransactionGroup"? is append-only/u },
  'ledger-posting-append-only': { message: /"?LedgerPosting"? is append-only/u },
  'ledger-posting-strictly-positive': { constraint: 'LedgerPosting_amountCfa_check' },
  'media-checksum-sha256': { constraint: 'MediaAsset_checksumSha256_check' },
  'media-inbox-payload-sha256': { constraint: 'MediaWebhookInbox_payloadHash_check' },
  'media-inbox-chronology': { constraint: 'MediaWebhookInbox_timestamps_check' },
  'media-inbox-processed-once': {
    message: /MediaWebhookInbox\.processedAt may only be assigned once/u,
  },
  'media-inbox-terminal-state': { message: /invalid MediaWebhookInbox state transition/u },
  'media-provider-reference-set-once': {
    message: /MediaAsset\.privateProviderUploadRef may only be assigned once/u,
  },
  'media-provider-reference-unique': {
    constraint: 'MediaAsset_provider_privateProviderUploadRef_key',
  },
  'media-terminal-state': { message: /invalid MediaAsset processing-state transition/u },
  'order-event-append-only': { message: /"?OrderStateEvent"? is append-only/u },
  'order-history-required': { message: /Order requires state history/u },
  'order-immutable': { message: /"?Order"? is append-only/u },
  'order-item-append-after-lifecycle': {
    message: /OrderItem cannot be appended after Order lifecycle has started/u,
  },
  'order-item-immutable': { message: /"?OrderItem"? is append-only/u },
  'order-settled-requires-settlement': {
    message: /Settlement and latest Order state SETTLED must be committed together/u,
  },
  'order-terminal-state': { message: /invalid Order state sequence or transition/u },
  'order-total-conservation': { message: /Order total must equal/u },
  'outbox-chronology': { constraint: 'OutboxEvent_publishedAt_check' },
  'outbox-payload-immutable': { message: /OutboxEvent evidence is immutable/u },
  'payment-attempt-history-required': { message: /PaymentAttempt requires state history/u },
  'payment-attempt-matches-order': { message: /PaymentAttempt amount and currency must match/u },
  'payment-attempt-order-state': {
    message: /PaymentAttempt must be created for a payment-pending Order/u,
  },
  'payment-event-append-only': { message: /"?PaymentAttemptEvent"? is append-only/u },
  'payment-inbox-payload-sha256': {
    constraint: 'PaymentWebhookInbox_payloadHash_check',
  },
  'payment-inbox-chronology': { constraint: 'PaymentWebhookInbox_timestamps_check' },
  'payment-inbox-processed-once': {
    message: /PaymentWebhookInbox\.processedAt may only be assigned once/u,
  },
  'payment-inbox-terminal-state': { message: /invalid PaymentWebhookInbox state transition/u },
  'payment-provider-reference-set-once': {
    message: /PaymentAttempt\.providerReference may only be assigned once/u,
  },
  'payment-provider-reference-unique': { constraint: 'PaymentAttempt_providerReference_key' },
  'payment-terminal-state': { message: /invalid PaymentAttempt state sequence or transition/u },
  'publication-archive-set-once': {
    message: /ContentPublication\.archivedAt may only be assigned once/u,
  },
  'publication-inserted-archived': { message: /ContentPublication must be inserted active/u },
  'publication-checksum-sha256': { constraint: 'PublicationMediaAsset_checksum_check' },
  'publication-link-append-only': { message: /"?PublicationMediaAsset"? is append-only/u },
  'publication-provenance-immutable': {
    message: /ContentPublication proof and admin provenance are immutable/u,
  },
  'publication-ready-timestamp': { message: /timely verified READY/u },
  'publication-requires-ready-media': { message: /timely verified READY/u },
  'quantity-positive': { constraint: 'OrderItem_quantity_check' },
  'settlement-append-only': { message: /"?Settlement"? is append-only/u },
  'settlement-basis-conservation': {
    message: /Settlement distributable basis must equal its immutable ArtistEarning bases/u,
  },
  'settlement-requires-succeeded-event': {
    message: /Settlement must match the latest SUCCEEDED attempt event/u,
  },
  'single-active-customer-session': {
    constraint: 'CustomerSession_one_active_per_customer_key',
  },
  'single-active-publication': {
    constraint: 'ContentPublication_one_active_per_content_key',
  },
};
const executedFailureCauses = new Set();

async function expectConstraintFailure(client, name, action) {
  if (executedFailureCauses.has(name)) {
    fail(`negative test ${name} was executed more than once`);
  }
  await client.query('BEGIN');
  let failure;
  try {
    await action();
    await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  } catch (error) {
    failure = error;
  }
  await client.query('ROLLBACK');
  if (failure === undefined) {
    fail(`negative test ${name} unexpectedly succeeded`);
  }
  if (!['23503', '23505', '23514'].includes(failure.code)) {
    fail(`negative test ${name} failed with unexpected SQLSTATE ${failure.code}`);
  }
  const expectedCause = EXPECTED_FAILURE_CAUSES[name];
  if (expectedCause === undefined) {
    fail(`negative test ${name} has no declared causal expectation`);
  }
  if (expectedCause.constraint !== undefined && failure.constraint !== expectedCause.constraint) {
    fail(
      `negative test ${name} failed through ${failure.constraint ?? 'no named constraint'}, expected ${expectedCause.constraint}`,
    );
  }
  if (expectedCause.message !== undefined && !expectedCause.message.test(failure.message)) {
    fail(`negative test ${name} failed with a non-causal message: ${failure.message}`);
  }
  const cause = expectedCause.constraint ?? expectedCause.message.source;
  executedFailureCauses.add(name);
  process.stdout.write(
    `NEGATIVE_CONSTRAINT_PASS ${name} sqlstate=${failure.code} cause=${cause}\n`,
  );
}

async function insertFinancialCandidate(
  client,
  {
    exactEarningNumerator,
    frozenBasisCfa,
    grossItemAmountCfa,
    legallyRequiredTaxCfa,
    payableAmountCfa,
    platformAmountCfa,
    prefix,
    settlementBasisCfa,
  },
) {
  if (!/^bad-(gross|basis)$/u.test(prefix)) {
    fail(`unsafe financial candidate prefix ${JSON.stringify(prefix)}`);
  }
  const carryOutNumerator = exactEarningNumerator % 10_000;
  await client.query(
    `INSERT INTO "Order" ("id", "customerId", "currency", "totalCfa", "createdAt") VALUES ($1 || '-order', 'customer-2', 'XOF', 100, TIMESTAMP '2026-09-14 07:00:00')`,
    [prefix],
  );
  await client.query(
    `INSERT INTO "OrderItem" ("id", "orderId", "audioContentId", "titleSnapshot", "unitPriceCfa", "quantity", "createdAt") VALUES ($1 || '-item', $1 || '-order', 'audio-1', 'Audio Un', 100, 1, TIMESTAMP '2026-09-14 07:00:00')`,
    [prefix],
  );
  await client.query(
    `INSERT INTO "OrderStateEvent" ("id", "orderId", "sequence", "state", "recordedAt") VALUES ($1 || '-order-event-1', $1 || '-order', 1, 'CREATED', TIMESTAMP '2026-09-14 07:00:00'), ($1 || '-order-event-2', $1 || '-order', 2, 'PAYMENT_PENDING', TIMESTAMP '2026-09-14 07:01:00')`,
    [prefix],
  );
  await client.query(
    `INSERT INTO "PaymentAttempt" ("id", "orderId", "provider", "amountCfa", "currency", "idempotencyKey", "createdAt") VALUES ($1 || '-attempt', $1 || '-order', 'SANDBOX_NEUTRAL', 100, 'XOF', $1 || '-idempotency-00000000', TIMESTAMP '2026-09-14 07:01:00')`,
    [prefix],
  );
  await client.query(
    `INSERT INTO "PaymentAttemptEvent" ("id", "paymentAttemptId", "sequence", "state", "recordedAt") VALUES ($1 || '-payment-event-1', $1 || '-attempt', 1, 'CREATED', TIMESTAMP '2026-09-14 07:01:00'), ($1 || '-payment-event-2', $1 || '-attempt', 2, 'PENDING', TIMESTAMP '2026-09-14 07:02:00'), ($1 || '-payment-event-3', $1 || '-attempt', 3, 'SUCCEEDED', TIMESTAMP '2026-09-14 07:03:00')`,
    [prefix],
  );
  await client.query(
    `INSERT INTO "OrderStateEvent" ("id", "orderId", "sequence", "state", "recordedAt") VALUES ($1 || '-order-event-3', $1 || '-order', 3, 'SETTLED', TIMESTAMP '2026-09-14 07:04:00')`,
    [prefix],
  );
  await client.query(
    `INSERT INTO "Settlement" ("id", "orderId", "paymentAttemptId", "succeededAttemptEventId", "settledAmountCfa", "distributableBasisCfa", "artistPayableAmountCfa", "platformAmountCfa", "reconciliationKey", "reconciledAt", "settledAt") VALUES ($1 || '-settlement', $1 || '-order', $1 || '-attempt', $1 || '-payment-event-3', 100, $2, $3, $4, $1 || '-reconciliation', TIMESTAMP '2026-09-14 07:05:00', TIMESTAMP '2026-09-14 07:05:00')`,
    [prefix, settlementBasisCfa, payableAmountCfa, platformAmountCfa],
  );
  await client.query(
    `INSERT INTO "ArtistSettlement" ("id", "settlementId", "orderId", "artistId", "settlementSequence", "previousArtistSettlementId", "carryInNumerator", "exactEarningsNumerator", "exactNumerator", "payableAmountCfa", "carryOutNumerator", "reconciledAt", "createdAt") VALUES ($1 || '-artist-settlement', $1 || '-settlement', $1 || '-order', 'artist-1', 2, 'artist-settlement-1', 0, $2, $2, $3, $4, TIMESTAMP '2026-09-14 07:05:00', TIMESTAMP '2026-09-14 07:05:00')`,
    [prefix, exactEarningNumerator, payableAmountCfa, carryOutNumerator],
  );
  await client.query(
    `INSERT INTO "ArtistEarning" ("id", "settlementId", "orderId", "artistSettlementId", "orderItemId", "audioContentId", "artistId", "grossItemAmountCfa", "legallyRequiredTaxCfa", "refundAdjustmentCfa", "frozenBasisCfa", "artistRevenueShareBps", "exactEarningNumerator", "createdAt") VALUES ($1 || '-earning', $1 || '-settlement', $1 || '-order', $1 || '-artist-settlement', $1 || '-item', 'audio-1', 'artist-1', $2, $3, 0, $4, 2000, $5, TIMESTAMP '2026-09-14 07:05:00')`,
    [prefix, grossItemAmountCfa, legallyRequiredTaxCfa, frozenBasisCfa, exactEarningNumerator],
  );
}

async function runNegativeTests(client) {
  await expectConstraintFailure(client, 'quantity-positive', async () => {
    await client.query(
      `INSERT INTO "Order" ("id", "customerId", "totalCfa") VALUES ('bad-quantity-order', 'customer-2', 0)`,
    );
    await client.query(
      `INSERT INTO "OrderItem" ("id", "orderId", "audioContentId", "titleSnapshot", "unitPriceCfa", "quantity") VALUES ('bad-quantity', 'bad-quantity-order', 'audio-1', 'bad', 100, 0)`,
    );
  });
  await expectConstraintFailure(client, 'order-total-conservation', async () => {
    await client.query(
      `INSERT INTO "Order" ("id", "customerId", "totalCfa") VALUES ('bad-order-total', 'customer-2', 101)`,
    );
    await client.query(
      `INSERT INTO "OrderItem" ("id", "orderId", "audioContentId", "titleSnapshot", "unitPriceCfa", "quantity") VALUES ('bad-order-total-item', 'bad-order-total', 'audio-1', 'bad', 100, 1)`,
    );
    await client.query(
      `INSERT INTO "OrderStateEvent" ("id", "orderId", "sequence", "state") VALUES ('bad-order-total-event', 'bad-order-total', 1, 'CREATED')`,
    );
  });
  await expectConstraintFailure(client, 'cross-customer-device-session', () =>
    client.query(
      `INSERT INTO "CustomerSession" ("id", "customerId", "deviceId", "sessionFamilyId", "accessTokenId", "refreshTokenHash", "expiresAt") VALUES ('bad-cross-session', 'customer-2', 'device-1', 'bad-family', 'bad-access', 'bad-refresh', TIMESTAMP '2026-10-14 00:00:00')`,
    ),
  );
  await expectConstraintFailure(client, 'single-active-customer-session', () =>
    client.query(
      `INSERT INTO "CustomerSession" ("id", "customerId", "deviceId", "sessionFamilyId", "accessTokenId", "refreshTokenHash", "expiresAt") VALUES ('bad-second-session', 'customer-1', 'device-1', 'bad-family-2', 'bad-access-2', 'bad-refresh-2', TIMESTAMP '2026-10-14 00:00:00')`,
    ),
  );
  await expectConstraintFailure(client, 'admin-recovery-hash-immutable', () =>
    client.query(
      `UPDATE "AdminRecoveryCode" SET "codeHash" = 'rewritten-recovery-hash' WHERE "id" = 'admin-recovery-1'`,
    ),
  );
  await expectConstraintFailure(client, 'admin-recovery-used-once', () =>
    client.query(
      `UPDATE "AdminRecoveryCode" SET "usedAt" = TIMESTAMP '2026-09-14 00:06:00' WHERE "id" = 'admin-recovery-1'`,
    ),
  );
  await expectConstraintFailure(client, 'artist-provenance-immutable', () =>
    client.query(
      `UPDATE "Artist" SET "createdByAdminId" = 'missing-admin' WHERE "id" = 'artist-1'`,
    ),
  );
  await expectConstraintFailure(client, 'content-provenance-immutable', () =>
    client.query(
      `UPDATE "AudioContent" SET "createdByAdminId" = 'missing-admin' WHERE "id" = 'audio-1'`,
    ),
  );
  await expectConstraintFailure(client, 'publication-provenance-immutable', () =>
    client.query(
      `UPDATE "ContentPublication" SET "publishedByAdminId" = 'missing-admin' WHERE "id" = 'publication-1'`,
    ),
  );
  await expectConstraintFailure(client, 'publication-inserted-archived', () =>
    client.query(
      `INSERT INTO "ContentPublication" ("id", "audioContentId", "publishedByAdminId", "publishedAt", "archivedAt") VALUES ('bad-publication-archived', 'audio-1', 'admin-1', TIMESTAMP '2026-09-14 00:04:00', TIMESTAMP '2026-09-14 00:05:00')`,
    ),
  );
  await expectConstraintFailure(client, 'single-active-publication', () =>
    client.query(
      `INSERT INTO "ContentPublication" ("id", "audioContentId", "publishedByAdminId") VALUES ('bad-publication-duplicate', 'audio-1', 'admin-1')`,
    ),
  );
  await expectConstraintFailure(client, 'payment-provider-reference-set-once', () =>
    client.query(
      `UPDATE "PaymentAttempt" SET "providerReference" = 'provider-payment-reassigned' WHERE "id" = 'payment-attempt-1'`,
    ),
  );
  await expectConstraintFailure(client, 'media-provider-reference-set-once', () =>
    client.query(
      `UPDATE "MediaAsset" SET "privateProviderUploadRef" = 'upload-reassigned' WHERE "id" = 'media-audio-1'`,
    ),
  );
  await expectConstraintFailure(client, 'media-provider-reference-unique', () =>
    client.query(
      `INSERT INTO "MediaAsset" ("id", "audioContentId", "kind", "processingStatus", "version", "provider", "privateProviderUploadRef", "createdAt", "updatedAt") VALUES ('bad-media-duplicate-ref', 'audio-1', 'AUDIO_MASTER', 'PREPARING', 2, 'MUX', 'upload-audio-1', TIMESTAMP '2026-09-14 03:00:00', TIMESTAMP '2026-09-14 03:00:00')`,
    ),
  );
  await expectConstraintFailure(client, 'media-checksum-sha256', () =>
    client.query(
      `INSERT INTO "MediaAsset" ("id", "audioContentId", "kind", "processingStatus", "version", "checksumSha256", "createdAt", "updatedAt") VALUES ('bad-media-checksum', 'audio-1', 'AUDIO_MASTER', 'PREPARING', 3, 'not-a-sha256', TIMESTAMP '2026-09-14 03:00:00', TIMESTAMP '2026-09-14 03:00:00')`,
    ),
  );
  await expectConstraintFailure(client, 'payment-provider-reference-unique', () =>
    client.query(
      `INSERT INTO "PaymentAttempt" ("id", "orderId", "provider", "amountCfa", "idempotencyKey", "providerReference") VALUES ('bad-payment-duplicate-ref', 'order-1', 'SANDBOX_NEUTRAL', 100, 'abcdef1234567890', 'provider-payment-1')`,
    ),
  );
  await expectConstraintFailure(client, 'media-terminal-state', () =>
    client.query(
      `UPDATE "MediaAsset" SET "processingStatus" = 'PROCESSING' WHERE "id" = 'media-audio-1'`,
    ),
  );
  await expectConstraintFailure(client, 'order-terminal-state', () =>
    client.query(
      `INSERT INTO "OrderStateEvent" ("id", "orderId", "sequence", "state") VALUES ('bad-order-state', 'order-1', 4, 'CANCELLED')`,
    ),
  );
  await expectConstraintFailure(client, 'payment-terminal-state', () =>
    client.query(
      `INSERT INTO "PaymentAttemptEvent" ("id", "paymentAttemptId", "sequence", "state") VALUES ('bad-payment-state', 'payment-attempt-1', 4, 'FAILED')`,
    ),
  );
  await expectConstraintFailure(client, 'order-item-append-after-lifecycle', async () => {
    await client.query(
      `INSERT INTO "AudioContent" ("id", "artistId", "createdByAdminId", "title", "priceCfa", "previewSeconds", "createdAt", "updatedAt") VALUES ('audio-late-free-item', 'artist-1', 'admin-1', 'Late free item', 0, 30, TIMESTAMP '2026-09-14 03:00:00', TIMESTAMP '2026-09-14 03:00:00')`,
    );
    await client.query(
      `INSERT INTO "OrderItem" ("id", "orderId", "audioContentId", "titleSnapshot", "unitPriceCfa", "quantity") VALUES ('bad-late-free-item', 'order-1', 'audio-late-free-item', 'bad', 0, 1)`,
    );
  });
  await expectConstraintFailure(client, 'order-history-required', async () => {
    await client.query(
      `INSERT INTO "Order" ("id", "customerId", "totalCfa") VALUES ('bad-order-no-history', 'customer-2', 100)`,
    );
    await client.query(
      `INSERT INTO "OrderItem" ("id", "orderId", "audioContentId", "titleSnapshot", "unitPriceCfa", "quantity") VALUES ('bad-order-no-history-item', 'bad-order-no-history', 'audio-1', 'bad', 100, 1)`,
    );
  });
  await expectConstraintFailure(client, 'payment-attempt-history-required', async () => {
    await client.query(
      `INSERT INTO "Order" ("id", "customerId", "totalCfa") VALUES ('bad-attempt-no-history-order', 'customer-2', 100)`,
    );
    await client.query(
      `INSERT INTO "OrderItem" ("id", "orderId", "audioContentId", "titleSnapshot", "unitPriceCfa", "quantity") VALUES ('bad-attempt-no-history-item', 'bad-attempt-no-history-order', 'audio-1', 'bad', 100, 1)`,
    );
    await client.query(
      `INSERT INTO "OrderStateEvent" ("id", "orderId", "sequence", "state") VALUES ('bad-attempt-no-history-state-1', 'bad-attempt-no-history-order', 1, 'CREATED'), ('bad-attempt-no-history-state-2', 'bad-attempt-no-history-order', 2, 'PAYMENT_PENDING')`,
    );
    await client.query(
      `INSERT INTO "PaymentAttempt" ("id", "orderId", "provider", "amountCfa", "idempotencyKey") VALUES ('bad-attempt-no-history', 'bad-attempt-no-history-order', 'SANDBOX_NEUTRAL', 100, 'bad-attempt-history-0001')`,
    );
  });
  await expectConstraintFailure(client, 'payment-attempt-order-state', async () => {
    await client.query(
      `INSERT INTO "Order" ("id", "customerId", "totalCfa") VALUES ('bad-attempt-state-order', 'customer-2', 100)`,
    );
    await client.query(
      `INSERT INTO "OrderItem" ("id", "orderId", "audioContentId", "titleSnapshot", "unitPriceCfa", "quantity") VALUES ('bad-attempt-state-item', 'bad-attempt-state-order', 'audio-1', 'bad', 100, 1)`,
    );
    await client.query(
      `INSERT INTO "OrderStateEvent" ("id", "orderId", "sequence", "state") VALUES ('bad-attempt-state-1', 'bad-attempt-state-order', 1, 'CREATED'), ('bad-attempt-state-2', 'bad-attempt-state-order', 2, 'CANCELLED')`,
    );
    await client.query(
      `INSERT INTO "PaymentAttempt" ("id", "orderId", "provider", "amountCfa", "idempotencyKey") VALUES ('bad-attempt-state', 'bad-attempt-state-order', 'SANDBOX_NEUTRAL', 100, 'bad-attempt-state-000001')`,
    );
    await client.query(
      `INSERT INTO "PaymentAttemptEvent" ("id", "paymentAttemptId", "sequence", "state") VALUES ('bad-attempt-state-event', 'bad-attempt-state', 1, 'CREATED')`,
    );
  });
  await expectConstraintFailure(client, 'order-settled-requires-settlement', async () => {
    await client.query(
      `INSERT INTO "Order" ("id", "customerId", "totalCfa") VALUES ('bad-settled-order', 'customer-2', 100)`,
    );
    await client.query(
      `INSERT INTO "OrderItem" ("id", "orderId", "audioContentId", "titleSnapshot", "unitPriceCfa", "quantity") VALUES ('bad-settled-order-item', 'bad-settled-order', 'audio-1', 'bad', 100, 1)`,
    );
    await client.query(
      `INSERT INTO "OrderStateEvent" ("id", "orderId", "sequence", "state") VALUES ('bad-settled-order-state-1', 'bad-settled-order', 1, 'CREATED'), ('bad-settled-order-state-2', 'bad-settled-order', 2, 'PAYMENT_PENDING'), ('bad-settled-order-state-3', 'bad-settled-order', 3, 'SETTLED')`,
    );
  });
  await expectConstraintFailure(client, 'payment-inbox-terminal-state', () =>
    client.query(
      `UPDATE "PaymentWebhookInbox" SET "processingStatus" = 'PROCESSING' WHERE "id" = 'payment-inbox-1'`,
    ),
  );
  await expectConstraintFailure(client, 'media-inbox-terminal-state', () =>
    client.query(
      `UPDATE "MediaWebhookInbox" SET "processingStatus" = 'PROCESSING' WHERE "id" = 'media-inbox-1'`,
    ),
  );
  await expectConstraintFailure(client, 'payment-inbox-processed-once', () =>
    client.query(
      `UPDATE "PaymentWebhookInbox" SET "processedAt" = TIMESTAMP '2026-09-14 01:06:00' WHERE "id" = 'payment-inbox-1'`,
    ),
  );
  await expectConstraintFailure(client, 'media-inbox-processed-once', () =>
    client.query(
      `UPDATE "MediaWebhookInbox" SET "processedAt" = TIMESTAMP '2026-09-14 00:05:00' WHERE "id" = 'media-inbox-1'`,
    ),
  );
  await expectConstraintFailure(client, 'payment-inbox-payload-sha256', () =>
    client.query(
      `INSERT INTO "PaymentWebhookInbox" ("id", "provider", "providerEventKey", "payloadHash", "encryptedPayload", "signatureVerifiedAt", "receivedAt") VALUES ('bad-payment-payload-hash', 'SANDBOX_NEUTRAL', 'bad-payment-payload-event', 'not-a-sha256', 'encrypted', TIMESTAMP '2026-09-14 03:00:00', TIMESTAMP '2026-09-14 03:01:00')`,
    ),
  );
  await expectConstraintFailure(client, 'media-inbox-payload-sha256', () =>
    client.query(
      `INSERT INTO "MediaWebhookInbox" ("id", "provider", "providerEventKey", "eventType", "payloadHash", "encryptedPayload", "signatureVerifiedAt", "receivedAt") VALUES ('bad-media-payload-hash', 'MUX', 'bad-media-payload-event', 'video.asset.ready', 'not-a-sha256', 'encrypted', TIMESTAMP '2026-09-14 03:00:00', TIMESTAMP '2026-09-14 03:01:00')`,
    ),
  );
  await expectConstraintFailure(client, 'payment-inbox-chronology', () =>
    client.query(
      `INSERT INTO "PaymentWebhookInbox" ("id", "provider", "providerEventKey", "payloadHash", "encryptedPayload", "signatureVerifiedAt", "receivedAt") VALUES ('bad-payment-inbox-time', 'SANDBOX_NEUTRAL', 'bad-payment-time-event', 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'encrypted', TIMESTAMP '2026-09-14 03:02:00', TIMESTAMP '2026-09-14 03:01:00')`,
    ),
  );
  await expectConstraintFailure(client, 'media-inbox-chronology', () =>
    client.query(
      `INSERT INTO "MediaWebhookInbox" ("id", "provider", "providerEventKey", "eventType", "payloadHash", "encryptedPayload", "signatureVerifiedAt", "receivedAt") VALUES ('bad-media-inbox-time', 'MUX', 'bad-media-time-event', 'video.asset.ready', 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff', 'encrypted', TIMESTAMP '2026-09-14 03:02:00', TIMESTAMP '2026-09-14 03:01:00')`,
    ),
  );
  await expectConstraintFailure(client, 'publication-checksum-sha256', async () => {
    await client.query(
      `INSERT INTO "AudioContent" ("id", "artistId", "createdByAdminId", "title", "priceCfa", "previewSeconds", "createdAt", "updatedAt") VALUES ('audio-bad-publication-hash', 'artist-1', 'admin-1', 'Bad publication hash', 100, 30, TIMESTAMP '2026-09-14 03:00:00', TIMESTAMP '2026-09-14 03:00:00')`,
    );
    await client.query(
      `INSERT INTO "MediaAsset" ("id", "audioContentId", "kind", "processingStatus", "version", "createdAt", "updatedAt") VALUES ('media-bad-publication-hash', 'audio-bad-publication-hash', 'AUDIO_MASTER', 'PREPARING', 1, TIMESTAMP '2026-09-14 03:00:00', TIMESTAMP '2026-09-14 03:00:00')`,
    );
    await client.query(
      `INSERT INTO "ContentPublication" ("id", "audioContentId", "publishedByAdminId") VALUES ('publication-bad-hash', 'audio-bad-publication-hash', 'admin-1')`,
    );
    await client.query(
      `INSERT INTO "PublicationMediaAsset" ("id", "publicationId", "audioContentId", "kind", "mediaAssetId", "mediaAssetVersion", "readinessChecksum", "verifiedReadyAt") VALUES ('link-bad-publication-hash', 'publication-bad-hash', 'audio-bad-publication-hash', 'AUDIO_MASTER', 'media-bad-publication-hash', 1, 'not-a-sha256', TIMESTAMP '2026-09-14 03:00:00')`,
    );
  });
  await expectConstraintFailure(client, 'publication-requires-ready-media', async () => {
    await client.query(
      `INSERT INTO "AudioContent" ("id", "artistId", "createdByAdminId", "title", "priceCfa", "previewSeconds", "createdAt", "updatedAt") VALUES ('audio-not-ready', 'artist-1', 'admin-1', 'Not ready', 100, 30, TIMESTAMP '2026-09-14 03:00:00', TIMESTAMP '2026-09-14 03:00:00')`,
    );
    await client.query(
      `INSERT INTO "MediaAsset" ("id", "audioContentId", "kind", "processingStatus", "version", "createdAt", "updatedAt") VALUES ('media-not-ready-audio', 'audio-not-ready', 'AUDIO_MASTER', 'PREPARING', 1, TIMESTAMP '2026-09-14 03:00:00', TIMESTAMP '2026-09-14 03:00:00'), ('media-not-ready-cover', 'audio-not-ready', 'COVER_IMAGE', 'PREPARING', 1, TIMESTAMP '2026-09-14 03:00:00', TIMESTAMP '2026-09-14 03:00:00')`,
    );
    await client.query(
      `INSERT INTO "ContentPublication" ("id", "audioContentId", "publishedByAdminId") VALUES ('publication-not-ready', 'audio-not-ready', 'admin-1')`,
    );
    await client.query(
      `INSERT INTO "PublicationMediaAsset" ("id", "publicationId", "audioContentId", "kind", "mediaAssetId", "mediaAssetVersion", "readinessChecksum", "verifiedReadyAt") VALUES ('link-not-ready-audio', 'publication-not-ready', 'audio-not-ready', 'AUDIO_MASTER', 'media-not-ready-audio', 1, '1111111111111111111111111111111111111111111111111111111111111111', TIMESTAMP '2026-09-14 03:00:00'), ('link-not-ready-cover', 'publication-not-ready', 'audio-not-ready', 'COVER_IMAGE', 'media-not-ready-cover', 1, '2222222222222222222222222222222222222222222222222222222222222222', TIMESTAMP '2026-09-14 03:00:00')`,
    );
  });
  await expectConstraintFailure(client, 'ledger-balanced', async () => {
    await client.query(
      `INSERT INTO "LedgerTransactionGroup" ("id", "eventKey") VALUES ('bad-ledger-group', 'bad-ledger-event')`,
    );
    await client.query(
      `INSERT INTO "LedgerPosting" ("id", "groupId", "accountId", "direction", "amountCfa") VALUES ('bad-ledger-posting', 'bad-ledger-group', 'ledger-account-debit', 'DEBIT', 1)`,
    );
  });
  await expectConstraintFailure(client, 'ledger-posting-strictly-positive', () =>
    client.query(
      `INSERT INTO "LedgerPosting" ("id", "groupId", "accountId", "direction", "amountCfa") VALUES ('bad-zero-posting', 'ledger-group-1', 'ledger-account-debit', 'DEBIT', 0)`,
    ),
  );
  await expectConstraintFailure(client, 'ledger-account-immutable', () =>
    client.query(
      `UPDATE "LedgerAccount" SET "kind" = 'PLATFORM_REVENUE' WHERE "id" = 'ledger-account-debit'`,
    ),
  );
  await expectConstraintFailure(client, 'payment-attempt-matches-order', () =>
    client.query(
      `INSERT INTO "PaymentAttempt" ("id", "orderId", "provider", "amountCfa", "idempotencyKey") VALUES ('bad-payment-amount', 'order-1', 'SANDBOX_NEUTRAL', 99, 'fedcba0987654321')`,
    ),
  );
  await expectConstraintFailure(client, 'settlement-requires-succeeded-event', async () => {
    await client.query(
      `INSERT INTO "Order" ("id", "customerId", "totalCfa") VALUES ('bad-settlement-order', 'customer-2', 100)`,
    );
    await client.query(
      `INSERT INTO "OrderItem" ("id", "orderId", "audioContentId", "titleSnapshot", "unitPriceCfa", "quantity") VALUES ('bad-settlement-item', 'bad-settlement-order', 'audio-1', 'bad', 100, 1)`,
    );
    await client.query(
      `INSERT INTO "PaymentAttempt" ("id", "orderId", "provider", "amountCfa", "idempotencyKey") VALUES ('bad-settlement-attempt', 'bad-settlement-order', 'SANDBOX_NEUTRAL', 100, 'badsettlement0001')`,
    );
    await client.query(
      `INSERT INTO "PaymentAttemptEvent" ("id", "paymentAttemptId", "sequence", "state") VALUES ('bad-settlement-event-1', 'bad-settlement-attempt', 1, 'CREATED'), ('bad-settlement-event-2', 'bad-settlement-attempt', 2, 'PENDING'), ('bad-settlement-event-3', 'bad-settlement-attempt', 3, 'FAILED')`,
    );
    await client.query(
      `INSERT INTO "Settlement" ("id", "orderId", "paymentAttemptId", "succeededAttemptEventId", "settledAmountCfa", "distributableBasisCfa", "artistPayableAmountCfa", "platformAmountCfa", "reconciliationKey", "reconciledAt") VALUES ('bad-settlement', 'bad-settlement-order', 'bad-settlement-attempt', 'bad-settlement-event-3', 100, 100, 20, 80, 'bad-reconciliation', TIMESTAMP '2026-09-14 04:00:00')`,
    );
  });
  await expectConstraintFailure(client, 'artist-rate-bounded', () =>
    client.query(
      `INSERT INTO "Artist" ("id", "createdByAdminId", "stageName", "artistRevenueShareBps", "createdAt", "updatedAt") VALUES ('bad-artist-rate', 'admin-1', 'bad', 10001, TIMESTAMP '2026-09-14 00:00:00', TIMESTAMP '2026-09-14 00:00:00')`,
    ),
  );
  await expectConstraintFailure(client, 'artist-earning-arithmetic', () =>
    client.query(
      `INSERT INTO "ArtistEarning" ("id", "settlementId", "orderId", "artistSettlementId", "orderItemId", "audioContentId", "artistId", "grossItemAmountCfa", "legallyRequiredTaxCfa", "refundAdjustmentCfa", "frozenBasisCfa", "artistRevenueShareBps", "exactEarningNumerator") VALUES ('bad-earning-arithmetic', 'settlement-1', 'order-1', 'artist-settlement-1', 'order-item-1', 'audio-1', 'artist-1', 100, 0, 0, 99, 2000, 198000)`,
    ),
  );
  await expectConstraintFailure(client, 'artist-earning-gross-source', () =>
    insertFinancialCandidate(client, {
      exactEarningNumerator: 198_000,
      frozenBasisCfa: 99,
      grossItemAmountCfa: 99,
      legallyRequiredTaxCfa: 0,
      payableAmountCfa: 19,
      platformAmountCfa: 80,
      prefix: 'bad-gross',
      settlementBasisCfa: 99,
    }),
  );
  await expectConstraintFailure(client, 'artist-earning-late-basis-reopen', async () => {
    await client.query(
      `UPDATE "Artist" SET "artistRevenueShareBps" = 0, "updatedAt" = TIMESTAMP '2026-09-14 06:16:00' WHERE "id" = 'artist-reopen'`,
    );
    await client.query(`
      INSERT INTO "ArtistEarning" ("id", "settlementId", "orderId", "artistSettlementId", "orderItemId", "audioContentId", "artistId", "grossItemAmountCfa", "legallyRequiredTaxCfa", "refundAdjustmentCfa", "frozenBasisCfa", "artistRevenueShareBps", "exactEarningNumerator", "createdAt")
        VALUES ('artist-earning-reopen-b', 'settlement-reopen', 'order-reopen', 'artist-settlement-reopen', 'order-item-reopen-b', 'audio-reopen-b', 'artist-reopen', 50, 0, 0, 50, 0, 0, TIMESTAMP '2026-09-14 06:16:00')
    `);
  });
  await expectConstraintFailure(client, 'settlement-basis-conservation', () =>
    insertFinancialCandidate(client, {
      exactEarningNumerator: 198_000,
      frozenBasisCfa: 99,
      grossItemAmountCfa: 100,
      legallyRequiredTaxCfa: 1,
      payableAmountCfa: 19,
      platformAmountCfa: 81,
      prefix: 'bad-basis',
      settlementBasisCfa: 100,
    }),
  );
  await expectConstraintFailure(client, 'descriptor-expiry-bounded', () =>
    client.query(
      `INSERT INTO "PreviewPlaybackDescriptor" ("id", "previewGrantId", "descriptorHash", "expiresAt", "issuedAt") VALUES ('bad-preview-descriptor', 'preview-grant-1', 'bad-preview-descriptor-hash', TIMESTAMP '2026-09-14 02:06:00', TIMESTAMP '2026-09-14 02:00:00')`,
    ),
  );
  await expectConstraintFailure(client, 'outbox-payload-immutable', () =>
    client.query(
      `UPDATE "OutboxEvent" SET "payload" = '{"changed":true}'::jsonb WHERE "id" = 'outbox-1'`,
    ),
  );
  await expectConstraintFailure(client, 'outbox-chronology', () =>
    client.query(
      `UPDATE "OutboxEvent" SET "publishedAt" = TIMESTAMP '2026-09-14 01:04:00' WHERE "id" = 'outbox-1'`,
    ),
  );
  await expectConstraintFailure(client, 'entitlement-grant-immutable', () =>
    client.query(
      `UPDATE "Entitlement" SET "customerId" = 'customer-2' WHERE "id" = 'entitlement-1'`,
    ),
  );
  await expectConstraintFailure(client, 'entitlement-chronology', () =>
    client.query(
      `UPDATE "Entitlement" SET "revokedAt" = TIMESTAMP '2026-09-14 01:04:00' WHERE "id" = 'entitlement-1'`,
    ),
  );

  for (const [name, query] of [
    ['order-immutable', `UPDATE "Order" SET "id" = "id" WHERE "id" = 'order-1'`],
    ['order-item-immutable', `UPDATE "OrderItem" SET "id" = "id" WHERE "id" = 'order-item-1'`],
    [
      'order-event-append-only',
      `UPDATE "OrderStateEvent" SET "id" = "id" WHERE "id" = 'order-state-1'`,
    ],
    [
      'payment-event-append-only',
      `UPDATE "PaymentAttemptEvent" SET "id" = "id" WHERE "id" = 'payment-event-1'`,
    ],
    ['settlement-append-only', `UPDATE "Settlement" SET "id" = "id" WHERE "id" = 'settlement-1'`],
    [
      'artist-settlement-append-only',
      `UPDATE "ArtistSettlement" SET "id" = "id" WHERE "id" = 'artist-settlement-1'`,
    ],
    [
      'ledger-group-append-only',
      `UPDATE "LedgerTransactionGroup" SET "id" = "id" WHERE "id" = 'ledger-group-1'`,
    ],
    [
      'ledger-posting-append-only',
      `UPDATE "LedgerPosting" SET "id" = "id" WHERE "id" = 'ledger-posting-debit-1'`,
    ],
    [
      'artist-earning-append-only',
      `UPDATE "ArtistEarning" SET "id" = "id" WHERE "id" = 'artist-earning-1'`,
    ],
    [
      'publication-link-append-only',
      `UPDATE "PublicationMediaAsset" SET "id" = "id" WHERE "id" = 'publication-link-audio-1'`,
    ],
    ['audit-update-append-only', `UPDATE "AuditLog" SET "id" = "id" WHERE "id" = 'audit-1'`],
    ['audit-delete-append-only', `DELETE FROM "AuditLog" WHERE "id" = 'audit-1'`],
  ]) {
    await expectConstraintFailure(client, name, () => client.query(query));
  }

  await client.query('BEGIN');
  try {
    await client.query(
      `UPDATE "ContentPublication" SET "archivedAt" = TIMESTAMP '2026-09-14 05:00:00' WHERE "id" = 'publication-1'`,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  process.stdout.write('POSITIVE_PUBLICATION_ARCHIVAL_PASS\n');

  await expectConstraintFailure(client, 'publication-ready-timestamp', async () => {
    await client.query(
      `INSERT INTO "ContentPublication" ("id", "audioContentId", "publishedByAdminId", "publishedAt") VALUES ('bad-publication-time', 'audio-1', 'admin-1', TIMESTAMP '2026-09-14 00:02:00')`,
    );
    await client.query(
      `INSERT INTO "PublicationMediaAsset" ("id", "publicationId", "audioContentId", "kind", "mediaAssetId", "mediaAssetVersion", "readinessChecksum", "verifiedReadyAt") VALUES ('bad-publication-time-audio', 'bad-publication-time', 'audio-1', 'AUDIO_MASTER', 'media-audio-1', 1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', TIMESTAMP '2026-09-14 00:03:00'), ('bad-publication-time-cover', 'bad-publication-time', 'audio-1', 'COVER_IMAGE', 'media-cover-1', 1, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', TIMESTAMP '2026-09-14 00:03:00')`,
    );
  });

  await expectConstraintFailure(client, 'publication-archive-set-once', () =>
    client.query(
      `UPDATE "ContentPublication" SET "archivedAt" = TIMESTAMP '2026-09-14 06:00:00' WHERE "id" = 'publication-1'`,
    ),
  );
  assertExactSet(
    'causal negative constraint tests',
    executedFailureCauses,
    Object.keys(EXPECTED_FAILURE_CAUSES),
  );
  process.stdout.write(`NEGATIVE_CONSTRAINT_SUITE_PASS tests=${executedFailureCauses.size}\n`);
}

function comparePrismaProjection(environment) {
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
    environment,
    [0, 2],
  );
  const forbiddenDrift =
    /Added tables|Removed tables|Added columns|Removed columns|Changed the .* column|Changed the .* enum/iu;
  if (forbiddenDrift.test(result.stdout) || forbiddenDrift.test(result.stderr)) {
    fail(`Prisma schema/database structural drift detected.\n${result.stdout}${result.stderr}`);
  }
  process.stdout.write(
    `PRISMA_SCHEMA_DATABASE_COMPARISON_PASS expectedPostgresqlExtensions=${result.status === 2}\n`,
  );
}

async function validateDatabase(name, withConstraintTests) {
  const environment = environmentForDatabase(name);
  runPrisma(['migrate', 'deploy', '--config', 'prisma.config.ts'], environment);
  process.stdout.write(`MIGRATION_APPLY_PASS ${name}\n`);
  runPrisma(['migrate', 'status', '--config', 'prisma.config.ts'], environment);
  runPrisma(['migrate', 'deploy', '--config', 'prisma.config.ts'], environment);
  process.stdout.write(`SECOND_PASS_NO_PENDING_MIGRATIONS_PASS ${name}\n`);

  const client = new Client(connectionConfiguration(name));
  await client.connect();
  try {
    await structuralInventory(client);
    comparePrismaProjection(environment);
    if (withConstraintTests) {
      await insertPositiveFixture(client);
      await insertLateEarningReopenFixture(client);
      await runNegativeTests(client);
    }
    return await catalogSignature(client);
  } finally {
    await client.end();
  }
}

async function main() {
  if (process.env.S1202_EPHEMERAL_POSTGRES !== '1') {
    fail('S1202_EPHEMERAL_POSTGRES=1 is required');
  }
  if (!new Set(['127.0.0.1', 'localhost']).has(process.env.DATABASE_HOST)) {
    fail('DATABASE_HOST must be local');
  }
  if (process.env.DATABASE_NAME !== 'postgres') {
    fail('the administrative connection must target the ephemeral postgres database');
  }
  for (const name of ['DATABASE_PORT', 'DATABASE_USER', 'DATABASE_PASSWORD']) {
    if (process.env[name] === undefined || process.env[name].length === 0) {
      fail(`${name} is required`);
    }
  }

  verifyDeterministicBaseline();
  const admin = new Client(connectionConfiguration('postgres'));
  const createdDatabases = [];
  await admin.connect();
  try {
    const server = await admin.query(
      `SELECT current_setting('server_version') AS version, current_setting('server_version_num')::INTEGER AS version_num`,
    );
    const [{ version, version_num: versionNumber }] = server.rows;
    if (versionNumber < 180_000 || versionNumber >= 190_000) {
      fail(`PostgreSQL 18.x is required, received ${version}`);
    }
    process.stdout.write(`POSTGRESQL_SERVER_VERSION_PASS version=${version}\n`);

    const first = databaseName('a');
    const second = databaseName('b');
    await createDatabase(admin, first);
    createdDatabases.push(first);
    const firstSignature = await validateDatabase(first, true);
    await createDatabase(admin, second);
    createdDatabases.push(second);
    const secondSignature = await validateDatabase(second, false);
    if (firstSignature !== secondSignature) {
      fail('the two independently materialized database schemas are not identical');
    }
    process.stdout.write(`REPRODUCIBLE_DATABASE_SCHEMA_PASS sha256=${firstSignature}\n`);
  } finally {
    const cleanupErrors = [];
    for (const name of createdDatabases.reverse()) {
      try {
        await dropDatabase(admin, name);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      await admin.end();
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, 'targeted PostgreSQL cleanup failed');
    }
  }

  process.stdout.write('S1.2-02_POSTGRESQL_BASELINE_VALIDATION_PASS databases=2\n');
}

main().catch((error) => {
  process.stderr.write(`${normalizeOutput(error.stack ?? error.message)}\n`);
  process.exitCode = 1;
});
