import { createHash, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const prismaDirectory = dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = resolve(prismaDirectory, 'migrations');
const C2B_MIGRATION = 'admin_security_c2b_audit_export_runtime';
const EXPECTED_MIGRATIONS = Object.freeze([
  '20260914000000_canonical_postgresql_baseline',
  '20260914000100_canonical_sql_constraints',
  '20261002170022_admin_auth_session_runtime',
  'admin_security_c2a_runtime',
  C2B_MIGRATION,
]);
const C2B_MODELS = Object.freeze([
  'AdminAuditPaginationSnapshot',
  'AdminAuditPaginationSnapshotItem',
  'AdminAuditExportIdempotencyRecord',
  'AdminAuditExport',
  'AdminAuditExportReadLease',
]);
const C2B_API_ACTIONS = Object.freeze([
  'listAdminAuditLogs',
  'createAdminAuditLogExport',
  'getAdminAuditLogExport',
  'downloadAdminAuditLogExport',
]);
const C2B_WORKER_ACTIONS = Object.freeze(['buildAdminAuditLogExport', 'expireAdminAuditLogExport']);
const C2B_ACTIONS = Object.freeze([...C2B_API_ACTIONS, ...C2B_WORKER_ACTIONS]);

function fail(message) {
  throw new Error(`S1.2-03C2b PostgreSQL validation failed: ${message}`);
}

export function validateExactC2bMigrationNames(migrations) {
  if (JSON.stringify(migrations) !== JSON.stringify(EXPECTED_MIGRATIONS)) {
    fail(
      `current C2b migration chain differs: ${JSON.stringify(migrations)} != ${JSON.stringify(EXPECTED_MIGRATIONS)}`,
    );
  }
  return [...EXPECTED_MIGRATIONS];
}

function exactMigrationNames() {
  return validateExactC2bMigrationNames(
    readdirSync(migrationsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(),
  );
}

function required(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) fail(`${name} is required`);
  return value;
}

function databaseUrl(database) {
  const url = new URL(required('S1203C2B_OWNER_DATABASE_URL'));
  url.pathname = `/${database}`;
  return url.toString();
}

async function withClient(connectionString, run) {
  const client = new Client({ connectionString, connectionTimeoutMillis: 5_000 });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function expectDenied(client, role, sql) {
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query(sql);
    fail(`${role} unexpectedly executed ${sql}`);
  } catch (error) {
    if (error?.code !== '42501') throw error;
  } finally {
    await client.query('ROLLBACK');
  }
}

async function expectAuditInsertDenied({
  client,
  owner,
  id,
  label,
  sql,
  params,
  codes,
  messagePattern,
}) {
  let rejected = false;
  try {
    await client.query(sql, params);
  } catch (error) {
    if (!codes.includes(error?.code)) throw error;
    if (messagePattern !== undefined && !messagePattern.test(String(error?.message))) throw error;
    rejected = true;
  }
  if (!rejected) fail(`${label} unexpectedly inserted AuditLog ${id}`);
  const durable = await owner.query(
    'SELECT count(*)::int AS count FROM "AuditLog" WHERE "id" = $1',
    [id],
  );
  if (durable.rows[0]?.count !== 0) fail(`${label} left a durable AuditLog row after refusal`);
}

function auditApiInsertSql(context = 'ADMIN_SESSION') {
  return `
    INSERT INTO "AuditLog" (
      "id", "version", "adminUserId", "adminSessionId", "eventClass", "context",
      "outcome", "failureCode", "action", "entityType", "entityId", "reason",
      "reasonCode", "operatorReason", "requestId", "adminAuditExportId"
    ) VALUES (
      $1, 3, 'c2b-dispatch-admin', 'c2b-dispatch-session', 'EXPORT', '${context}',
      $3, $4, $2, $5, $6, 'C2_RUNTIME', 'AUDIT_EXPORT', $7, $8, $9
    )`;
}

const WORKER_AUDIT_INSERT_SQL = `
  INSERT INTO "AuditLog" (
    "id", "version", "delegatedByAdminUserId", "eventClass", "context", "outcome",
    "failureCode", "action", "entityType", "entityId", "reason", "reasonCode",
    "requestId", "causationEventId", "systemExecutionRefHash", "adminAuditExportId"
  ) VALUES (
    $1, 3, NULL, 'EXPORT', 'SYSTEM', 'SUCCESS', NULL, $2,
    'ADMIN_AUDIT_EXPORT', $3, 'C2_RUNTIME', 'AUDIT_EXPORT', $4, NULL, repeat('a', 64), $3
  )`;

const FOREIGN_RESERVED_AUDIT_INSERT_SQL = `
  INSERT INTO "AuditLog" (
    "id", "adminUserId", "subjectAdminUserId", "adminSessionId",
    "eventClass", "context", "action", "entityType", "entityId", "reason",
    "reasonCode", "requestId"
  ) VALUES (
    $1, 'c2b-dispatch-admin', 'c2b-dispatch-admin', 'c2b-dispatch-session',
    'SESSION', 'ADMIN_SESSION', $2, 'AdminSession', 'c2b-dispatch-session',
    'SECURITY_RESPONSE', 'SECURITY_RESPONSE', $3
  )`;

async function assertAuditDispatch(owner) {
  const c1WriterUrl = required('S1203C2B_C1_WRITER_DATABASE_URL');
  const c2aWriterUrl = required('S1203C2B_C2A_WRITER_DATABASE_URL');
  const auditApiUrl = required('S1203C2B_AUDIT_API_DATABASE_URL');
  const exportWorkerUrl = required('S1203C2B_EXPORT_WORKER_DATABASE_URL');
  const fixtureSuffix = randomUUID().replaceAll('-', '');

  await owner.query(
    `INSERT INTO "AdminUser" (
       "id", "email", "passwordHash", "role", "status", "authorizationVersion",
       "totpSecretEncrypted", "totpEnabledAt", "createdAt"
     ) VALUES (
       'c2b-dispatch-admin', $1, 'dispatch-password-hash', 'SUPER_ADMIN', 'ACTIVE', 1,
       'dispatch-envelope', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     )`,
    [`c2b-dispatch-${fixtureSuffix}@example.invalid`],
  );
  await owner.query(
    `INSERT INTO "AdminSession" (
       "id", "adminUserId", "tokenFamilyId", "accessTokenJti", "refreshTokenHash",
       "refreshTokenVersion", "lastTwoFactorAt", "lastActivityAt", "expiresAt",
       "absoluteExpiresAt", "authorizationVersion", "stepUpPurpose", "stepUpVerifiedAt",
       "stepUpExpiresAt", "createdAt", "updatedAt"
     ) VALUES (
       'c2b-dispatch-session', 'c2b-dispatch-admin', 'c2b-dispatch-family', $1, $2, 1,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '8 hours',
       CURRENT_TIMESTAMP + INTERVAL '12 hours', 1, 'AUDIT_EXPORT', CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP + INTERVAL '4 minutes', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
     )`,
    [
      `c2b-dispatch-jti-${fixtureSuffix}`,
      createHash('sha256').update(`refresh-${fixtureSuffix}`).digest('hex'),
    ],
  );

  await withClient(auditApiUrl, async (auditApi) => {
    const lockedPrincipal = await auditApi.query(
      `SELECT * FROM public.kora_lock_admin_c2b_principal($1, $2)`,
      ['c2b-dispatch-admin', 'c2b-dispatch-session'],
    );
    if (
      lockedPrincipal.rowCount !== 1 ||
      lockedPrincipal.rows[0]?.adminUserId !== 'c2b-dispatch-admin' ||
      lockedPrincipal.rows[0]?.sessionId !== 'c2b-dispatch-session'
    ) {
      fail('C2b audit API principal lock function returned an invalid binding');
    }
    const positiveRows = [
      ['listAdminAuditLogs', 'SUCCESS', null, 'ADMIN_AUDIT_SNAPSHOT', 'dispatch-snapshot', null],
      [
        'createAdminAuditLogExport',
        'REJECTED',
        'VALIDATION_ERROR',
        'ADMIN_AUDIT_EXPORT',
        'dispatch-rejected-export-create',
        'dispatch regression reason',
      ],
      [
        'getAdminAuditLogExport',
        'REJECTED',
        'RESOURCE_NOT_FOUND',
        'ADMIN_AUDIT_EXPORT',
        'dispatch-rejected-export-get',
        null,
      ],
      [
        'downloadAdminAuditLogExport',
        'REJECTED',
        'RESOURCE_NOT_FOUND',
        'ADMIN_AUDIT_EXPORT',
        'dispatch-rejected-export-download',
        null,
      ],
    ];
    for (const [index, row] of positiveRows.entries()) {
      const [action, outcome, failureCode, entityType, entityId, operatorReason] = row;
      const id = `c2b-dispatch-api-positive-${index}`;
      await auditApi.query(auditApiInsertSql(), [
        id,
        action,
        outcome,
        failureCode,
        entityType,
        entityId,
        operatorReason,
        `c2b-dispatch-api-positive-request-${index}`,
        null,
      ]);
      const durable = await owner.query(
        'SELECT count(*)::int AS count FROM "AuditLog" WHERE "id" = $1 AND "action" = $2',
        [id, action],
      );
      if (durable.rows[0]?.count !== 1)
        fail(`${action} did not persist through the exact API identity`);
    }

    for (const [index, action] of C2B_WORKER_ACTIONS.entries()) {
      const id = `c2b-dispatch-api-permutation-${index}`;
      await expectAuditInsertDenied({
        client: auditApi,
        owner,
        id,
        label: `API/worker action permutation ${action}`,
        sql: auditApiInsertSql(),
        params: [
          id,
          action,
          'REJECTED',
          'VALIDATION_ERROR',
          'ADMIN_AUDIT_EXPORT',
          `dispatch-permutation-${index}`,
          null,
          `c2b-dispatch-api-permutation-request-${index}`,
          null,
        ],
        codes: ['42501'],
      });
    }

    for (const [index, action] of [null, 'unknownC2bAction'].entries()) {
      const id = `c2b-dispatch-api-unknown-${index}`;
      await expectAuditInsertDenied({
        client: auditApi,
        owner,
        id,
        label: `API unknown action ${String(action)}`,
        sql: auditApiInsertSql(),
        params: [
          id,
          action,
          'REJECTED',
          'VALIDATION_ERROR',
          'ADMIN_AUDIT_EXPORT',
          `dispatch-unknown-${index}`,
          null,
          `c2b-dispatch-api-unknown-request-${index}`,
          null,
        ],
        codes: ['42501'],
      });
    }

    await expectAuditInsertDenied({
      client: auditApi,
      owner,
      id: 'c2b-dispatch-invalid-context',
      label: 'API invalid context despite matching action',
      sql: auditApiInsertSql('SYSTEM'),
      params: [
        'c2b-dispatch-invalid-context',
        'listAdminAuditLogs',
        'SUCCESS',
        null,
        'ADMIN_AUDIT_SNAPSHOT',
        'dispatch-invalid-context',
        null,
        'c2b-dispatch-invalid-context-request',
        null,
      ],
      codes: ['23514'],
    });

    const snapshotId = `c2b-dispatch-snapshot-${fixtureSuffix}`;
    const projection = JSON.stringify({
      createdAt: '2026-10-24T00:00:00.000Z',
      eventId: 'c2b-dispatch-snapshot-event-0',
      operatorReason: null,
    });
    await auditApi.query('BEGIN');
    try {
      await auditApi.query(
        `INSERT INTO "AdminAuditPaginationSnapshot"
           ("id", "principalAdminUserId", "operation", "filtersDigest",
            "projectionVersion", "entryCount", "utf8Bytes")
         VALUES ($1, 'c2b-dispatch-admin', 'LIST_ADMIN_AUDIT_LOGS', repeat('a', 64), 1, 1, $2)`,
        [snapshotId, Buffer.byteLength(projection, 'utf8')],
      );
      await auditApi.query(
        `INSERT INTO "AdminAuditPaginationSnapshotItem"
           ("snapshotId", "ordinal", "resourceId", "sourceCreatedAt", "projectionJson", "utf8Bytes")
         VALUES ($1, 0, 'c2b-dispatch-snapshot-event-0',
                 '2026-10-24 00:00:00'::timestamp(3), $2, $3)`,
        [snapshotId, projection, Buffer.byteLength(projection, 'utf8')],
      );
      await auditApi.query('COMMIT');
    } catch (error) {
      await auditApi.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
    const extraProjection = JSON.stringify({
      createdAt: '2026-10-23T23:59:59.000Z',
      eventId: 'c2b-dispatch-snapshot-event-1',
      operatorReason: null,
    });
    let extraRejected = false;
    try {
      await auditApi.query(
        `INSERT INTO "AdminAuditPaginationSnapshotItem"
           ("snapshotId", "ordinal", "resourceId", "sourceCreatedAt", "projectionJson", "utf8Bytes")
         VALUES ($1, 1, 'c2b-dispatch-snapshot-event-1',
                 '2026-10-23 23:59:59'::timestamp(3), $2, $3)`,
        [snapshotId, extraProjection, Buffer.byteLength(extraProjection, 'utf8')],
      );
    } catch (error) {
      if (error?.code !== '23514') throw error;
      extraRejected = true;
    }
    if (!extraRejected) fail('snapshot item outside the declared cardinality was accepted');
    const durableSnapshot = await owner.query(
      `SELECT count(*)::int AS count
         FROM "AdminAuditPaginationSnapshotItem"
        WHERE "snapshotId" = $1`,
      [snapshotId],
    );
    if (durableSnapshot.rows[0]?.count !== 1)
      fail('snapshot cardinality refusal changed durable item state');
  });

  await withClient(exportWorkerUrl, async (exportWorker) => {
    for (const [index, action] of C2B_WORKER_ACTIONS.entries()) {
      const id = `c2b-dispatch-worker-causality-${index}`;
      await expectAuditInsertDenied({
        client: exportWorker,
        owner,
        id,
        label: `worker ${action} invalid export causality`,
        sql: WORKER_AUDIT_INSERT_SQL,
        params: [
          id,
          action,
          `dispatch-missing-export-${index}`,
          `c2b-dispatch-worker-causality-request-${index}`,
        ],
        codes: ['23514'],
        messagePattern: /binding|causality/u,
      });
    }

    for (const [index, action] of C2B_API_ACTIONS.entries()) {
      const id = `c2b-dispatch-worker-permutation-${index}`;
      await expectAuditInsertDenied({
        client: exportWorker,
        owner,
        id,
        label: `worker/API action permutation ${action}`,
        sql: WORKER_AUDIT_INSERT_SQL,
        params: [
          id,
          action,
          `dispatch-permutation-export-${index}`,
          `c2b-dispatch-worker-permutation-request-${index}`,
        ],
        codes: ['42501'],
      });
    }

    for (const [index, action] of [null, 'unknownC2bAction'].entries()) {
      const id = `c2b-dispatch-worker-unknown-${index}`;
      await expectAuditInsertDenied({
        client: exportWorker,
        owner,
        id,
        label: `worker unknown action ${String(action)}`,
        sql: WORKER_AUDIT_INSERT_SQL,
        params: [
          id,
          action,
          `dispatch-unknown-export-${index}`,
          `c2b-dispatch-worker-unknown-request-${index}`,
        ],
        codes: ['42501'],
      });
    }
  });

  await withClient(c1WriterUrl, async (c1Writer) => {
    for (const [index, action] of C2B_ACTIONS.entries()) {
      const id = `c2b-dispatch-foreign-${index}`;
      await expectAuditInsertDenied({
        client: c1Writer,
        owner,
        id,
        label: `foreign role reserved action ${action}`,
        sql: FOREIGN_RESERVED_AUDIT_INSERT_SQL,
        params: [id, action, `c2b-dispatch-foreign-request-${index}`],
        codes: ['42501'],
      });
    }
    await c1Writer.query(FOREIGN_RESERVED_AUDIT_INSERT_SQL, [
      'c2b-dispatch-c1-positive',
      'ADMIN_SESSION_CREATED',
      'c2b-dispatch-c1-positive-request',
    ]);
  });

  await withClient(c2aWriterUrl, async (c2aWriter) => {
    await c2aWriter.query(`
      INSERT INTO "AuditLog" (
        "id", "version", "adminUserId", "subjectAdminUserId", "adminSessionId",
        "eventClass", "context", "outcome", "failureCode", "action", "entityType",
        "entityId", "reason", "reasonCode", "operatorReason", "requestId"
      ) VALUES (
        'c2b-dispatch-c2a-positive', 3, 'c2b-dispatch-admin', 'c2b-dispatch-admin',
        'c2b-dispatch-session', 'BUSINESS', 'ADMIN_SESSION', 'REJECTED',
        'VALIDATION_ERROR', 'createAdminRecoveryCase', 'ADMIN_RECOVERY_CASE',
        'c2b-dispatch-c2a-rejected-case', 'C2_RUNTIME', 'ACCOUNT_RECOVERY',
        'dispatch C2a regression reason', 'c2b-dispatch-c2a-positive-request'
      )`);
  });

  const preserved = await owner.query(
    `SELECT "id" FROM "AuditLog"
      WHERE "id" IN ('c2b-dispatch-c1-positive', 'c2b-dispatch-c2a-positive')
      ORDER BY "id"`,
  );
  if (preserved.rowCount !== 2) fail('legitimate C1/C2a AuditLog writes were not preserved');
  process.stdout.write(
    'C2B_AUDIT_DISPATCH_PASS actions=6 actual_logins=4 denials_durable=true c1_c2a_preserved=true\n',
  );
}

async function catalogSignature(client) {
  const result = await client.query(`
    SELECT n.nspname, c.relname, c.relkind,
           COALESCE(string_agg(a.attname || ':' || pg_catalog.format_type(a.atttypid, a.atttypmod), ',' ORDER BY a.attnum), '') AS columns
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v')
       AND c.relname <> '_prisma_migrations'
     GROUP BY n.nspname, c.relname, c.relkind
     ORDER BY c.relname, c.relkind`);
  return createHash('sha256').update(JSON.stringify(result.rows)).digest('hex');
}

async function applyMigration(client, name) {
  const sql = readFileSync(resolve(migrationsDirectory, name, 'migration.sql'), 'utf8');
  await client.query(sql);
}

async function prepareUpgrade(admin, database) {
  await admin.query(`CREATE DATABASE ${database}`);
  try {
    await withClient(databaseUrl(database), async (client) => {
      const migrations = exactMigrationNames();
      for (const name of migrations.filter((name) => name !== C2B_MIGRATION)) {
        await applyMigration(client, name);
      }
      const markerId = randomUUID();
      await client.query(
        `INSERT INTO "AdminUser" ("id", "email", "passwordHash", "role", "status")
         VALUES ($1, $2, 'historical-password-hash', 'SUPER_ADMIN', 'ACTIVE')`,
        [markerId, `c2b-upgrade-${markerId}@example.invalid`],
      );
      const before = await client.query(
        'SELECT count(*)::int AS count FROM "AdminUser" WHERE "id" = $1',
        [markerId],
      );
      if (before.rows[0]?.count !== 1) fail('upgrade marker was not created');
      await applyMigration(client, C2B_MIGRATION);
      const after = await client.query(
        'SELECT count(*)::int AS count FROM "AdminUser" WHERE "id" = $1',
        [markerId],
      );
      if (after.rows[0]?.count !== 1)
        fail('C1/C2a historical row was not preserved by C2b upgrade');
    });
    return await withClient(databaseUrl(database), catalogSignature);
  } catch (error) {
    throw error;
  }
}

async function assertSchemaAndAcl(client) {
  const models = await client.query(
    `SELECT c.relname
       FROM pg_catalog.pg_class c
       JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])
      ORDER BY c.relname`,
    [C2B_MODELS],
  );
  const actual = models.rows.map((row) => row.relname).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...C2B_MODELS].sort()))
    fail(`exact C2b table inventory is missing: ${JSON.stringify(actual)}`);
  const exportDefaults = await client.query(
    `SELECT column_name, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'AdminAuditExport'
        AND column_name IN ('generation', 'attemptNumber')
      ORDER BY column_name`,
  );
  const defaults = Object.fromEntries(
    exportDefaults.rows.map((row) => [row.column_name, String(row.column_default)]),
  );
  if (!/^0(?:::bigint)?$/u.test(defaults.generation ?? '') || defaults.attemptNumber !== '0') {
    fail(`C2b export initial fence defaults differ: ${JSON.stringify(defaults)}`);
  }
  const exportGuards = await client.query(
    `SELECT pg_catalog.pg_get_constraintdef(constraint_entry.oid) AS definition
       FROM pg_catalog.pg_constraint constraint_entry
       JOIN pg_catalog.pg_class relation_entry ON relation_entry.oid = constraint_entry.conrelid
       JOIN pg_catalog.pg_namespace namespace_entry
         ON namespace_entry.oid = relation_entry.relnamespace
      WHERE namespace_entry.nspname = 'public'
        AND relation_entry.relname = 'AdminAuditExport'
        AND constraint_entry.conname IN (
          'AdminAuditExport_generation_check',
          'AdminAuditExport_attempt_check',
          'AdminAuditExport_attempt_shape_check',
          'AdminAuditExport_transition_ref_hash_check'
        )
      ORDER BY constraint_entry.conname`,
  );
  const guardDefinition = exportGuards.rows.map((row) => String(row.definition)).join('\n');
  if (
    exportGuards.rowCount !== 4 ||
    !guardDefinition.includes('generation') ||
    !guardDefinition.includes('>= 0') ||
    !guardDefinition.includes("'00:10:00'::interval")
  ) {
    fail('C2b export generation/attempt/deadline constraints are incomplete');
  }
  const updateGuard = await client.query(
    `SELECT pg_catalog.pg_get_functiondef(function_entry.oid) AS definition
       FROM pg_catalog.pg_proc function_entry
       JOIN pg_catalog.pg_namespace namespace_entry
         ON namespace_entry.oid = function_entry.pronamespace
      WHERE namespace_entry.nspname = 'public'
        AND function_entry.proname = 'kora_guard_admin_audit_export_update'`,
  );
  const updateDefinition = String(updateGuard.rows[0]?.definition ?? '');
  for (const requiredFragment of [
    'C2b export ordinary retry fence is no longer active',
    'C2b export watchdog transition is not eligible',
    'C2b export retry transition reference is invalid',
    'C2b export terminal transition reference is invalid',
    "INTERVAL '30 seconds'",
    "INTERVAL '120 seconds'",
    "INTERVAL '600 seconds'",
  ]) {
    if (!updateDefinition.includes(requiredFragment)) {
      fail(`C2b export update guard is missing ${requiredFragment}`);
    }
  }
  const auditCausalityGuard = await client.query(
    `SELECT pg_catalog.pg_get_functiondef(function_entry.oid) AS definition
       FROM pg_catalog.pg_proc function_entry
       JOIN pg_catalog.pg_namespace namespace_entry
         ON namespace_entry.oid = function_entry.pronamespace
      WHERE namespace_entry.nspname = 'public'
        AND function_entry.proname = 'kora_validate_audit_log_c2b_causality'`,
  );
  const auditCausalityDefinition = String(auditCausalityGuard.rows[0]?.definition ?? '');
  if (
    !auditCausalityDefinition.includes(
      'NEW."systemExecutionRefHash" IS DISTINCT FROM export_entry."lastTransitionRefHash"',
    )
  ) {
    fail('C2b build audit is not bound to the durable export transition marker');
  }
  const view = await client.query(
    `SELECT reloptions, pg_catalog.pg_get_viewdef(c.oid, true) AS definition
       FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'AdminC2bAuditProjectionSource' AND c.relkind = 'v'`,
  );
  if (view.rowCount !== 1 || !view.rows[0].reloptions?.includes('security_barrier=true'))
    fail('positive audit projection must be a security_barrier view');
  const definition = String(view.rows[0].definition);
  if (/audit_entry\.reason\b|audit_entry\."reason"|audit_entry\."operatorReason"/u.test(definition))
    fail('positive audit projection selects a forbidden free-text column');
  const snapshotTriggers = await client.query(
    `SELECT trigger_name, event_object_table, action_timing, action_orientation
       FROM information_schema.triggers
      WHERE trigger_schema = 'public'
        AND trigger_name IN (
          'AdminAuditPaginationSnapshot_complete',
          'AdminAuditPaginationSnapshotItem_complete',
          'AdminAuditPaginationSnapshotItem_json'
        )
      ORDER BY trigger_name`,
  );
  if (
    snapshotTriggers.rows.some(
      (trigger) => trigger.trigger_name === 'AdminAuditPaginationSnapshotItem_complete',
    ) ||
    !snapshotTriggers.rows.some(
      (trigger) =>
        trigger.trigger_name === 'AdminAuditPaginationSnapshot_complete' &&
        trigger.event_object_table === 'AdminAuditPaginationSnapshot' &&
        trigger.action_orientation === 'ROW',
    ) ||
    !snapshotTriggers.rows.some(
      (trigger) =>
        trigger.trigger_name === 'AdminAuditPaginationSnapshotItem_json' &&
        trigger.event_object_table === 'AdminAuditPaginationSnapshotItem' &&
        trigger.action_timing === 'BEFORE' &&
        trigger.action_orientation === 'ROW',
    )
  ) {
    fail('snapshot completeness must be checked once per parent with a bounded item guard');
  }

  const roles = await client.query(
    `SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls
       FROM pg_catalog.pg_roles
      WHERE rolname = ANY($1::text[]) ORDER BY rolname`,
    [['kora_admin_c2b_audit_api', 'kora_admin_c2b_export_worker']],
  );
  if (
    roles.rowCount !== 2 ||
    roles.rows.some(
      (role) =>
        role.rolsuper ||
        role.rolinherit ||
        role.rolcreaterole ||
        role.rolcreatedb ||
        !role.rolcanlogin ||
        role.rolreplication ||
        role.rolbypassrls,
    )
  )
    fail('C2b roles do not preserve exact least-privilege attributes');
  const memberships = await client.query(
    `SELECT count(*)::int AS count
       FROM pg_catalog.pg_auth_members membership
       JOIN pg_catalog.pg_roles parent ON parent.oid = membership.roleid
       JOIN pg_catalog.pg_roles member ON member.oid = membership.member
      WHERE parent.rolname LIKE 'kora_admin_c2%' OR member.rolname LIKE 'kora_admin_c2%'`,
  );
  if (memberships.rows[0]?.count !== 0) fail('C2 role membership contamination exists');

  const privilegeChecks = [
    ['kora_admin_c2b_audit_api', 'AuditLog', 'SELECT', false],
    ['kora_admin_c2b_audit_api', 'AdminUser', 'SELECT', false],
    ['kora_admin_c2b_audit_api', 'AdminSession', 'SELECT', false],
    ['kora_admin_c2b_export_worker', 'AdminSession', 'SELECT', false],
    ['kora_admin_c2a_writer', 'AdminAuditExport', 'SELECT', false],
    ['kora_runtime', 'AdminAuditExport', 'SELECT', false],
  ];
  for (const [role, relation, privilege, expected] of privilegeChecks) {
    const result = await client.query(
      `SELECT pg_catalog.has_table_privilege($1, 'public.' || pg_catalog.quote_ident($2), $3) AS allowed`,
      [role, relation, privilege],
    );
    if (result.rows[0]?.allowed !== expected)
      fail(`${role} ${privilege} on ${relation} expected ${expected}`);
  }
  const functionPrivileges = await client.query(
    `SELECT
       pg_catalog.has_function_privilege(
         'kora_admin_c2b_audit_api',
         'public.kora_lock_admin_c2b_principal(text,text)',
         'EXECUTE'
       ) AS api_allowed,
       pg_catalog.has_function_privilege(
         'kora_admin_c2b_export_worker',
         'public.kora_lock_admin_c2b_principal(text,text)',
         'EXECUTE'
       ) AS worker_allowed,
       pg_catalog.has_function_privilege(
         'kora_admin_c2a_writer',
         'public.kora_lock_admin_c2b_principal(text,text)',
         'EXECUTE'
       ) AS c2a_allowed,
       pg_catalog.has_function_privilege(
         'kora_admin_c2b_audit_api',
         'public.kora_lock_admin_c2b_export_idempotency(text,text)',
         'EXECUTE'
       ) AS idempotency_api_allowed,
       pg_catalog.has_function_privilege(
         'kora_admin_c2b_export_worker',
         'public.kora_lock_admin_c2b_export_idempotency(text,text)',
         'EXECUTE'
       ) AS idempotency_worker_allowed,
       pg_catalog.has_function_privilege(
         'kora_admin_c2a_writer',
         'public.kora_lock_admin_c2b_export_idempotency(text,text)',
         'EXECUTE'
       ) AS idempotency_c2a_allowed,
       pg_catalog.has_function_privilege(
         'kora_admin_c2b_audit_api',
         'public.kora_lock_admin_c2b_export_lifecycle(text)',
         'EXECUTE'
       ) AS lifecycle_api_allowed,
       pg_catalog.has_function_privilege(
         'kora_admin_c2b_export_worker',
         'public.kora_lock_admin_c2b_export_lifecycle(text)',
         'EXECUTE'
       ) AS lifecycle_worker_allowed,
       pg_catalog.has_function_privilege(
         'kora_admin_c2a_writer',
         'public.kora_lock_admin_c2b_export_lifecycle(text)',
         'EXECUTE'
       ) AS lifecycle_c2a_allowed,
       pg_catalog.has_function_privilege(
         'kora_runtime',
         'public.kora_lock_admin_c2b_export_lifecycle(text)',
         'EXECUTE'
       ) AS lifecycle_runtime_allowed`,
  );
  if (
    functionPrivileges.rows[0]?.api_allowed !== true ||
    functionPrivileges.rows[0]?.worker_allowed !== false ||
    functionPrivileges.rows[0]?.c2a_allowed !== false ||
    functionPrivileges.rows[0]?.idempotency_api_allowed !== true ||
    functionPrivileges.rows[0]?.idempotency_worker_allowed !== false ||
    functionPrivileges.rows[0]?.idempotency_c2a_allowed !== false ||
    functionPrivileges.rows[0]?.lifecycle_api_allowed !== true ||
    functionPrivileges.rows[0]?.lifecycle_worker_allowed !== true ||
    functionPrivileges.rows[0]?.lifecycle_c2a_allowed !== false ||
    functionPrivileges.rows[0]?.lifecycle_runtime_allowed !== false
  ) {
    fail('C2b bounded lock function EXECUTE grants are not exact');
  }
  const positiveColumns = await client.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE pg_catalog.has_column_privilege(
              'kora_admin_c2b_audit_api', 'public."AdminC2bAuditProjectionSource"', column_name, 'SELECT'
            ))::int AS allowed
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'AdminC2bAuditProjectionSource'`,
  );
  if (
    positiveColumns.rows[0]?.total !== 26 ||
    positiveColumns.rows[0]?.allowed !== positiveColumns.rows[0]?.total
  )
    fail('C2b API does not have the exact positive projection column grants');
  const workerId = await client.query(
    `SELECT pg_catalog.has_column_privilege(
       'kora_admin_c2b_export_worker', 'public."AdminAuditExport"', 'id', 'SELECT'
     ) AS allowed`,
  );
  if (workerId.rows[0]?.allowed !== true) fail('C2b worker cannot read its export aggregate');
  const transitionMarkerPrivileges = await client.query(
    `SELECT
       pg_catalog.has_column_privilege(
         'kora_admin_c2b_export_worker', 'public."AdminAuditExport"',
         'lastTransitionRefHash', 'SELECT'
       ) AS worker_select,
       pg_catalog.has_column_privilege(
         'kora_admin_c2b_export_worker', 'public."AdminAuditExport"',
         'lastTransitionRefHash', 'UPDATE'
       ) AS worker_update,
       pg_catalog.has_column_privilege(
         'kora_admin_c2b_audit_api', 'public."AdminAuditExport"',
         'lastTransitionRefHash', 'SELECT'
       ) AS api_select,
       pg_catalog.has_column_privilege(
         'kora_admin_c2b_audit_api', 'public."AdminAuditExport"',
         'lastTransitionRefHash', 'UPDATE'
       ) AS api_update,
       pg_catalog.has_column_privilege(
         'kora_admin_c2a_writer', 'public."AdminAuditExport"',
         'lastTransitionRefHash', 'SELECT'
       ) AS c2a_select,
       pg_catalog.has_column_privilege(
         'kora_admin_c2a_writer', 'public."AdminAuditExport"',
         'lastTransitionRefHash', 'UPDATE'
       ) AS c2a_update,
       pg_catalog.has_column_privilege(
         'kora_runtime', 'public."AdminAuditExport"',
         'lastTransitionRefHash', 'SELECT'
       ) AS runtime_select,
       pg_catalog.has_column_privilege(
         'kora_runtime', 'public."AdminAuditExport"',
         'lastTransitionRefHash', 'UPDATE'
       ) AS runtime_update`,
  );
  const markerAcl = transitionMarkerPrivileges.rows[0];
  if (
    markerAcl?.worker_select !== true ||
    markerAcl?.worker_update !== true ||
    markerAcl?.api_select !== false ||
    markerAcl?.api_update !== false ||
    markerAcl?.c2a_select !== false ||
    markerAcl?.c2a_update !== false ||
    markerAcl?.runtime_select !== false ||
    markerAcl?.runtime_update !== false
  ) {
    fail(`C2b transition marker ACL differs: ${JSON.stringify(markerAcl)}`);
  }
  await expectDenied(client, 'kora_admin_c2b_audit_api', 'SELECT "reason" FROM "AuditLog" LIMIT 1');
  await expectDenied(client, 'kora_admin_c2b_audit_api', 'SELECT "id" FROM "AdminUser" LIMIT 1');
  await expectDenied(
    client,
    'kora_admin_c2b_export_worker',
    'SELECT "accessTokenJti" FROM "AdminSession" LIMIT 1',
  );
  await expectDenied(client, 'kora_admin_c2a_writer', 'SELECT * FROM "AdminAuditExport" LIMIT 1');

  const sharedChecks = await client.query(
    `SELECT conname, pg_catalog.pg_get_constraintdef(oid) AS definition
       FROM pg_catalog.pg_constraint
      WHERE conname IN ('AdminPaginationSnapshot_c2b_operation_reject', 'AdminC2IdempotencyRecord_c2b_operation_reject')
      ORDER BY conname`,
  );
  if (sharedChecks.rowCount !== 2)
    fail('legacy C2a tables do not reject the reserved C2b operations');
}

async function main() {
  exactMigrationNames();
  const expectedInstance = required('KORA_C2B_EXPECTED_INSTANCE');
  if (expectedInstance === 'local' || !/^c2b-[a-z0-9-]{8,80}$/u.test(expectedInstance))
    fail('dedicated non-local instance attestation is invalid');
  if (process.env.KORA_C2B_INSTANCE !== expectedInstance)
    fail('child instance attestation diverged');
  const freshDatabase = required('S1203C2B_FRESH_DATABASE');
  const adminDatabase = required('S1203C2B_ADMIN_DATABASE');
  const upgradeDatabase = `c2b_upgrade_${randomUUID().replaceAll('-', '')}`;
  let upgradeCreated = false;
  await withClient(databaseUrl(adminDatabase), async (admin) => {
    try {
      const applied = await withClient(databaseUrl(freshDatabase), async (client) => {
        const result = await client.query(
          `SELECT migration_name, finished_at IS NOT NULL AS finished
             FROM "_prisma_migrations" ORDER BY started_at, migration_name`,
        );
        return result.rows;
      });
      if (
        applied.some((row) => !row.finished) ||
        JSON.stringify(applied.map((row) => row.migration_name)) !==
          JSON.stringify(EXPECTED_MIGRATIONS)
      ) {
        fail('fresh Prisma migration chain is not the exact five-migration C2b chain');
      }
      const freshSignature = await withClient(databaseUrl(freshDatabase), catalogSignature);
      upgradeCreated = true;
      const upgradeSignature = await prepareUpgrade(admin, upgradeDatabase);
      if (freshSignature !== upgradeSignature)
        fail(`fresh/upgrade catalog projections differ: ${freshSignature} != ${upgradeSignature}`);
      await withClient(databaseUrl(freshDatabase), assertSchemaAndAcl);
      await withClient(databaseUrl(freshDatabase), assertAuditDispatch);
      const migrationSha256 = createHash('sha256')
        .update(readFileSync(resolve(migrationsDirectory, C2B_MIGRATION, 'migration.sql')))
        .digest('hex');
      process.stdout.write(
        `C2B_DATABASE_VALIDATION_PASS models=5 roles=2 fresh_upgrade=${freshSignature} migration_sha256=${migrationSha256}\n`,
      );
    } finally {
      if (upgradeCreated) {
        await admin.query(
          `SELECT pg_catalog.pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity WHERE datname = $1 AND pid <> pg_catalog.pg_backend_pid()`,
          [upgradeDatabase],
        );
        await admin.query(`DROP DATABASE IF EXISTS ${upgradeDatabase}`);
      }
    }
  });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
