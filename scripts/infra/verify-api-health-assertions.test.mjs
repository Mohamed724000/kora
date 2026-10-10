import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNoSensitiveValue,
  assertOwnerRoleRejected,
  capturedOutputSummary,
  phaseErrorDiagnostic,
} from "./verify-api-health-assertions.mjs";
import { interpretDockerCommandResult } from "./lib.mjs";

const requiredViolations = [
  "administrative_role_attribute",
  "database_or_schema_write_privilege",
  "unexpected_table_privilege",
];

function boundaryError(violations, detail = violations.join(", ")) {
  return Object.assign(
    new Error(`PostgreSQL runtime boundary rejected: ${detail}`),
    {
      name: "RuntimeDatabaseBoundaryError",
      violations,
    },
  );
}

test("accepte le refus propriétaire sans preuve de propriété inexistante", async () => {
  const messages = [];
  await assertOwnerRoleRejected({
    createApplication: async () => {
      throw boundaryError([
        ...requiredViolations,
        "role_inheritance_enabled",
        "unexpected_routine_privilege",
        "unexpected_type_privilege",
        "unexpected_default_privilege",
      ]);
    },
    environment: {},
    log: (message) => messages.push(message),
    secrets: [],
  });

  assert.equal(messages.length, 1);
  assert.doesNotMatch(messages[0], /runtime_owns_database_object/u);
});

test("refuse un rejet sans violation administrative", async () => {
  await assert.rejects(
    assertOwnerRoleRejected({
      createApplication: async () => {
        throw boundaryError(requiredViolations.slice(1));
      },
      environment: {},
      secrets: [],
    }),
    /Owner\/migrator API rejection returned an unexpected fatal error/u,
  );
});

test("refuse un rejet sans les violations d'écriture requises", async () => {
  for (const omitted of [
    "database_or_schema_write_privilege",
    "unexpected_table_privilege",
  ]) {
    await assert.rejects(
      assertOwnerRoleRejected({
        createApplication: async () => {
          throw boundaryError(
            requiredViolations.filter((violation) => violation !== omitted),
          );
        },
        environment: {},
        secrets: [],
      }),
      /Owner\/migrator API rejection returned an unexpected fatal error/u,
    );
  }
});

test("refuse une erreur sans rapport avec la frontière PostgreSQL", async () => {
  await assert.rejects(
    assertOwnerRoleRejected({
      createApplication: async () => {
        throw new Error("unrelated startup failure");
      },
      environment: {},
      secrets: [],
    }),
    /Owner\/migrator API rejection returned an unexpected fatal error/u,
  );
});

test("échoue si l'API accepte le propriétaire et ferme l'application", async () => {
  let closed = false;
  await assert.rejects(
    assertOwnerRoleRejected({
      createApplication: async () => ({
        async close() {
          closed = true;
        },
      }),
      environment: {},
      secrets: [],
    }),
    /API unexpectedly accepted the PostgreSQL owner\/migrator role/u,
  );
  assert.equal(closed, true);
});

test("neutralise les secrets et les URL dans la preuve de refus", async () => {
  const secret = "local-secret-value";
  const messages = [];
  await assertOwnerRoleRejected({
    createApplication: async () => {
      throw boundaryError(
        requiredViolations,
        `${requiredViolations.join(", ")} ${secret} postgresql://owner:${secret}@localhost/db redis://:${secret}@localhost`,
      );
    },
    environment: {},
    log: (message) => messages.push(message),
    secrets: [secret],
  });

  assert.equal(messages.length, 1);
  assert.doesNotMatch(messages[0], new RegExp(secret, "u"));
  assert.doesNotMatch(messages[0], /postgres(?:ql)?:\/\/|redis:\/\//iu);
  assert.match(messages[0], /<redacted-secret>/u);
  assert.match(messages[0], /<redacted-database-url>/u);
  assert.match(messages[0], /<redacted-redis-url>/u);
  assert.doesNotThrow(() => assertNoSensitiveValue(messages[0], [secret]));
});

test("conserve l'erreur principale hors d'une queue API de plus de dix lignes", () => {
  const primary = new Error("docker compose start redis failed");
  const logs = Array.from(
    { length: 12 },
    (_, index) => `api-log-${index + 1}`,
  ).join("\n");

  const primaryDiagnostic = phaseErrorDiagnostic(
    "main",
    "primary_error",
    primary,
    [],
  );
  const logTail = capturedOutputSummary(logs, []);

  assert.match(primaryDiagnostic, /docker compose start redis failed/u);
  assert.doesNotMatch(logTail, /docker compose start redis failed/u);
  assert.doesNotMatch(logTail, /api-log-1(?:\D|$)/u);
  assert.match(logTail, /api-log-12/u);
});

test("conserve l'erreur principale quand la queue API depasse 4 000 caracteres", () => {
  const primaryDiagnostic = phaseErrorDiagnostic(
    "main",
    "primary_error",
    new Error("primary redis restart failure"),
    [],
  );
  const logTail = capturedOutputSummary(`prefix-${"x".repeat(5_000)}`, []);

  assert.match(primaryDiagnostic, /primary redis restart failure/u);
  assert.equal(logTail.length, 4_000);
  assert.doesNotMatch(logTail, /primary redis restart failure/u);
});

test("assainit l'erreur principale et ses metadonnees Docker", () => {
  const secret = "diagnostic-secret";
  const error = Object.assign(
    new Error(
      `failure ${secret} postgresql://owner:${secret}@localhost/db redis://:${secret}@localhost`,
    ),
    {
      name: "DockerCommandError",
      signal: "SIGTERM",
      spawnCode: "EACCES",
      status: null,
    },
  );
  const diagnostic = phaseErrorDiagnostic("main", "primary_error", error, [
    secret,
  ]);

  assert.match(diagnostic, /spawnCode=EACCES/u);
  assert.match(diagnostic, /status=unknown/u);
  assert.match(diagnostic, /signal=SIGTERM/u);
  assert.match(diagnostic, /<redacted-secret>/u);
  assert.match(diagnostic, /<redacted-database-url>/u);
  assert.match(diagnostic, /<redacted-redis-url>/u);
  assert.doesNotMatch(diagnostic, new RegExp(secret, "u"));
  assert.doesNotThrow(() => assertNoSensitiveValue(diagnostic, [secret]));
});

test("distingue un statut numerique et une erreur de finally", () => {
  const primary = phaseErrorDiagnostic(
    "main",
    "primary_error",
    Object.assign(new Error("redis start failed"), {
      signal: null,
      status: 17,
    }),
    [],
  );
  const cleanup = phaseErrorDiagnostic(
    "finally",
    "cleanup_error",
    Object.assign(new Error("postgres cleanup failed"), {
      signal: null,
      status: null,
    }),
    [],
  );

  assert.match(primary, /phase=main primary_error=/u);
  assert.match(primary, /status=17/u);
  assert.match(primary, /signal=none/u);
  assert.match(cleanup, /phase=finally cleanup_error=/u);
  assert.match(cleanup, /status=unknown/u);
  assert.doesNotMatch(cleanup, /redis start failed/u);
});

test("preserve une erreur de spawn Docker avec sorties nulles", () => {
  assert.throws(
    () =>
      interpretDockerCommandResult(
        ["compose", "start", "redis"],
        {
          error: Object.assign(new Error("spawn denied"), { code: "EACCES" }),
          signal: null,
          status: null,
          stderr: null,
          stdout: null,
        },
        { capture: true },
      ),
    (error) => {
      assert.equal(error.name, "DockerCommandError");
      assert.equal(error.spawnCode, "EACCES");
      assert.equal(error.status, null);
      assert.equal(error.signal, null);
      return true;
    },
  );
});

test("preserve statut et signal Docker en cas d'echec", () => {
  assert.throws(
    () =>
      interpretDockerCommandResult(
        ["compose", "start", "redis"],
        {
          signal: "SIGTERM",
          status: null,
          stderr: "terminated",
          stdout: "",
        },
        { capture: true },
      ),
    (error) => {
      assert.equal(error.status, null);
      assert.equal(error.signal, "SIGTERM");
      assert.match(error.message, /code unknown: terminated/u);
      return true;
    },
  );
});

test("conserve le resultat non nul explicitement allowFailure", () => {
  assert.deepEqual(
    interpretDockerCommandResult(
      ["volume", "inspect", "missing"],
      {
        signal: null,
        status: 17,
        stderr: "not found\n",
        stdout: "",
      },
      { allowFailure: true, capture: true },
    ),
    {
      signal: null,
      status: 17,
      stderr: "not found",
      stdout: "",
    },
  );
});
