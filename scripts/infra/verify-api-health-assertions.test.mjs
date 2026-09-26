import assert from "node:assert/strict";
import test from "node:test";

import {
  assertNoSensitiveValue,
  assertOwnerRoleRejected,
} from "./verify-api-health-assertions.mjs";

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
