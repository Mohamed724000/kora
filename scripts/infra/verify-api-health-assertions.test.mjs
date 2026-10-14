import assert from "node:assert/strict";
import { createServer } from "node:net";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import pg from "pg";

import { waitForPostgresReadiness } from "../../apps/api/prisma/validate-admin-auth-runtime.mjs";

import {
  assertNoSensitiveValue,
  assertOwnerRoleRejected,
  capturedOutputSummary,
  phaseErrorDiagnostic,
  stopApiForCleanup,
} from "./verify-api-health-assertions.mjs";
import { interpretDockerCommandResult } from "./lib.mjs";

const requiredViolations = [
  "administrative_role_attribute",
  "database_or_schema_write_privilege",
  "unexpected_table_privilege",
];

const { Client } = pg;

function shortReadinessOptions(overrides = {}) {
  return {
    attemptTimeoutMilliseconds: 40,
    cleanupTimeoutMilliseconds: 15,
    driverTimeoutLeadMilliseconds: 5,
    gracefulCleanupTimeoutMilliseconds: 8,
    intervalMilliseconds: 5,
    timeoutMilliseconds: 100,
    ...overrides,
  };
}

function postgresMessage(type, payload = Buffer.alloc(0)) {
  const message = Buffer.alloc(5 + payload.length);
  message.write(type, 0, 1, "ascii");
  message.writeInt32BE(payload.length + 4, 1);
  payload.copy(message, 5);
  return message;
}

async function createSuspendedQueryPostgresServer(context) {
  const queries = [];
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let buffer = Buffer.alloc(0);
    let startupComplete = false;

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        if (!startupComplete) {
          if (buffer.length < 4) return;
          const length = buffer.readInt32BE(0);
          if (buffer.length < length) return;
          buffer = buffer.subarray(length);
          startupComplete = true;
          const authenticationOk = Buffer.alloc(4);
          authenticationOk.writeInt32BE(0, 0);
          socket.write(
            Buffer.concat([
              postgresMessage("R", authenticationOk),
              postgresMessage("Z", Buffer.from("I")),
            ]),
          );
          continue;
        }

        if (buffer.length < 5) return;
        const type = buffer.toString("ascii", 0, 1);
        const length = buffer.readInt32BE(1);
        const messageLength = length + 1;
        if (buffer.length < messageLength) return;
        const payload = buffer.subarray(5, messageLength);
        buffer = buffer.subarray(messageLength);
        if (type === "Q") {
          queries.push(
            payload
              .subarray(0, Math.max(0, payload.length - 1))
              .toString("utf8"),
          );
        } else if (type === "X") {
          socket.end();
        }
      }
    });
  });

  context.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolveClose) => server.close(resolveClose));
  });
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen),
  );
  const address = server.address();
  assert(address && typeof address === "object");
  return { port: address.port, queries, sockets };
}

async function waitForSocketRelease(sockets, timeoutMilliseconds = 500) {
  const deadline = performance.now() + timeoutMilliseconds;
  while (sockets.size > 0 && performance.now() < deadline) await delay(5);
  assert.equal(sockets.size, 0);
}

test("attend la disponibilite PostgreSQL authentifiee et transfere le meme client", async () => {
  let attempts = 0;
  let ended = 0;
  let mutations = 0;
  const clients = [];
  const connectionTimeouts = [];
  const queries = [];
  const readiness = await waitForPostgresReadiness({
    ...shortReadinessOptions(),
    createClient: ({ connectionTimeoutMillis }) => {
      attempts += 1;
      connectionTimeouts.push(connectionTimeoutMillis);
      const currentAttempt = attempts;
      const client = {
        async connect() {
          assert.equal(mutations, 0);
          if (currentAttempt < 3) {
            throw Object.assign(new Error("premature readiness"), {
              code: "ECONNRESET",
            });
          }
        },
        async end() {
          ended += 1;
        },
        async query(query) {
          queries.push(query);
          assert.equal(query, "SELECT 1 AS value");
          assert.equal(mutations, 0);
          return { rows: [{ value: 1 }] };
        },
      };
      clients.push(client);
      return client;
    },
  });

  mutations += 1;
  assert.equal(readiness.attempts, 3);
  assert.equal(attempts, 3);
  assert.equal(ended, 2);
  assert.equal(mutations, 1);
  assert.equal(readiness.client, clients[2]);
  assert.equal(connectionTimeouts.length, 3);
  assert(connectionTimeouts.every((timeout) => timeout > 0 && timeout <= 40));
  assert.equal(queries.length, 1);
  await readiness.client.end();
  assert.equal(ended, 3);
});

test("refuse de facon reellement bornee un PostgreSQL jamais disponible", async () => {
  let attempts = 0;
  let ended = 0;
  let activeClients = 0;
  let maximumActiveClients = 0;
  let mutations = 0;
  const startedAt = performance.now();

  await assert.rejects(
    waitForPostgresReadiness({
      ...shortReadinessOptions({
        attemptTimeoutMilliseconds: 20,
        cleanupTimeoutMilliseconds: 10,
        timeoutMilliseconds: 60,
      }),
      createClient: () => ({
        async connect() {
          attempts += 1;
          activeClients += 1;
          maximumActiveClients = Math.max(maximumActiveClients, activeClients);
          assert.equal(mutations, 0);
          throw Object.assign(new Error("unavailable secret-value"), {
            code: "ECONNREFUSED",
          });
        },
        async end() {
          ended += 1;
          activeClients -= 1;
        },
      }),
    }),
    (error) => {
      assert.equal(error.name, "PostgresReadinessTimeoutError");
      assert.equal(error.phase, "postgres_readiness");
      assert(error.attempts >= 2);
      assert(error.elapsedMilliseconds >= 40);
      assert.equal(error.lastErrorCode, "ECONNREFUSED");
      assert.match(error.message, /timeout_ms=60/u);
      assert.doesNotMatch(error.message, /secret-value/u);
      return true;
    },
  );

  assert(performance.now() - startedAt < 500);
  assert.equal(ended, attempts);
  assert.equal(activeClients, 0);
  assert.equal(maximumActiveClients, 1);
  assert.equal(mutations, 0);
});

test("interrompt un connect suspendu et ne lance aucune query tardive", async () => {
  let ended = 0;
  let queries = 0;
  let mutations = 0;
  let rejectConnect;
  const startedAt = performance.now();

  await assert.rejects(
    waitForPostgresReadiness({
      ...shortReadinessOptions({
        attemptTimeoutMilliseconds: 25,
        cleanupTimeoutMilliseconds: 15,
        timeoutMilliseconds: 60,
      }),
      createClient: () => ({
        async connect() {
          return new Promise((_, reject) => {
            rejectConnect = reject;
          });
        },
        async end() {
          ended += 1;
          rejectConnect(new Error("connect cancelled by end"));
        },
        async query() {
          queries += 1;
          return { rows: [{ value: 1 }] };
        },
      }),
    }),
    (error) =>
      error.name === "PostgresReadinessTimeoutError" &&
      error.timeoutPhase === "connect",
  );

  assert(performance.now() - startedAt < 500);
  assert.equal(ended, 1);
  assert.equal(queries, 0);
  assert.equal(mutations, 0);
});

test("interrompt un SELECT 1 suspendu et ferme son client", async () => {
  let ended = 0;
  let mutations = 0;
  let rejectQuery;
  const startedAt = performance.now();

  await assert.rejects(
    waitForPostgresReadiness({
      ...shortReadinessOptions({
        attemptTimeoutMilliseconds: 25,
        cleanupTimeoutMilliseconds: 15,
        timeoutMilliseconds: 60,
      }),
      createClient: () => ({
        async connect() {},
        async end() {
          ended += 1;
          rejectQuery(new Error("query cancelled by end"));
        },
        async query() {
          return new Promise((_, reject) => {
            rejectQuery = reject;
          });
        },
      }),
    }),
    (error) =>
      error.name === "PostgresReadinessTimeoutError" &&
      error.timeoutPhase === "select_1",
  );

  assert(performance.now() - startedAt < 500);
  assert.equal(ended, 1);
  assert.equal(mutations, 0);
});

test("rend terminal un end suspendu sans creer de nouveau client", async () => {
  let clients = 0;
  let endCalls = 0;
  let hardAborts = 0;
  const startedAt = performance.now();

  await assert.rejects(
    waitForPostgresReadiness({
      ...shortReadinessOptions({
        cleanupTimeoutMilliseconds: 30,
        gracefulCleanupTimeoutMilliseconds: 10,
        timeoutMilliseconds: 100,
      }),
      createClient: () => {
        clients += 1;
        return {
          async connect() {
            throw Object.assign(new Error("unavailable"), {
              code: "ECONNREFUSED",
            });
          },
          async end() {
            endCalls += 1;
            return new Promise(() => {});
          },
        };
      },
      destroyClientTransport: async () => {
        hardAborts += 1;
      },
    }),
    (error) => {
      assert(error instanceof AggregateError);
      assert.equal(error.errors[0].code, "ECONNREFUSED");
      assert.equal(
        error.errors[1].name,
        "PostgresReadinessCleanupTimeoutError",
      );
      return true;
    },
  );

  assert(performance.now() - startedAt < 500);
  assert.equal(clients, 1);
  assert.equal(endCalls, 1);
  assert.equal(hardAborts, 1);
});

test("ignore un connect qui se resout apres la deadline", async () => {
  let ended = 0;
  let queries = 0;
  let mutations = 0;

  await assert.rejects(
    waitForPostgresReadiness({
      ...shortReadinessOptions({
        attemptTimeoutMilliseconds: 20,
        cleanupTimeoutMilliseconds: 40,
        gracefulCleanupTimeoutMilliseconds: 30,
        timeoutMilliseconds: 60,
      }),
      createClient: () => ({
        async connect() {
          await delay(25);
        },
        async end() {
          ended += 1;
        },
        async query() {
          queries += 1;
          return { rows: [{ value: 1 }] };
        },
      }),
    }),
    (error) =>
      error.name === "PostgresReadinessTimeoutError" &&
      error.timeoutPhase === "connect",
  );

  await delay(30);
  assert.equal(ended, 1);
  assert.equal(queries, 0);
  assert.equal(mutations, 0);
});

test("ignore un SELECT 1 qui rejette apres la deadline sans rejet non gere", async () => {
  let ended = 0;
  let mutations = 0;

  await assert.rejects(
    waitForPostgresReadiness({
      ...shortReadinessOptions({
        attemptTimeoutMilliseconds: 20,
        cleanupTimeoutMilliseconds: 40,
        gracefulCleanupTimeoutMilliseconds: 30,
        timeoutMilliseconds: 60,
      }),
      createClient: () => ({
        async connect() {},
        async end() {
          ended += 1;
        },
        async query() {
          await delay(25);
          throw new Error("late query rejection");
        },
      }),
    }),
    (error) =>
      error.name === "PostgresReadinessTimeoutError" &&
      error.timeoutPhase === "select_1",
  );

  await delay(30);
  assert.equal(ended, 1);
  assert.equal(mutations, 0);
});

test("expire entre connect et SELECT 1 sans lancer la query", async () => {
  const moments = [0, 0, 0, 0, 0, 29, 30, 30, 30, 30, 30];
  let ended = 0;
  let queries = 0;

  await assert.rejects(
    waitForPostgresReadiness({
      ...shortReadinessOptions({
        attemptTimeoutMilliseconds: 30,
        cleanupTimeoutMilliseconds: 10,
        timeoutMilliseconds: 40,
      }),
      createClient: () => ({
        async connect() {},
        async end() {
          ended += 1;
        },
        async query() {
          queries += 1;
          return { rows: [{ value: 1 }] };
        },
      }),
      now: () => moments.shift() ?? 30,
    }),
    (error) =>
      error.name === "PostgresReadinessTimeoutError" &&
      error.timeoutPhase === "between_connect_and_query",
  );

  assert.equal(ended, 1);
  assert.equal(queries, 0);
});

test("appelle end une fois meme si la hard deadline est deja depassee", async () => {
  const moments = [0, 0, 0, 0, 0, 45, 45, 45];
  let clients = 0;
  let endCalls = 0;
  let hardAborts = 0;

  await assert.rejects(
    waitForPostgresReadiness({
      ...shortReadinessOptions({
        attemptTimeoutMilliseconds: 30,
        cleanupTimeoutMilliseconds: 10,
        timeoutMilliseconds: 40,
      }),
      createClient: () => {
        clients += 1;
        return {
          async connect() {
            throw Object.assign(new Error("unavailable"), {
              code: "ECONNREFUSED",
            });
          },
          async end() {
            endCalls += 1;
          },
        };
      },
      destroyClientTransport: async () => {
        hardAborts += 1;
      },
      now: () => moments.shift() ?? 45,
    }),
    (error) => {
      assert(error instanceof AggregateError);
      assert.equal(error.errors[0].code, "ECONNREFUSED");
      assert(error.errors[1] instanceof AggregateError);
      assert.equal(error.errors[1].errors.length, 2);
      assert(
        error.errors[1].errors.every(
          (cleanupError) =>
            cleanupError.name === "PostgresReadinessCleanupTimeoutError",
        ),
      );
      return true;
    },
  );

  assert.equal(clients, 1);
  assert.equal(endCalls, 1);
  assert.equal(hardAborts, 1);
});

test("qualifie connectionTimeoutMillis sur une socket pg reelle puis la libere", async (context) => {
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.resume();
  });
  context.after(() => {
    for (const socket of sockets) socket.destroy();
    server.close();
  });
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen),
  );
  const address = server.address();
  assert(address && typeof address === "object");
  const startedAt = performance.now();

  await assert.rejects(
    waitForPostgresReadiness({
      ...shortReadinessOptions({
        attemptTimeoutMilliseconds: 80,
        cleanupTimeoutMilliseconds: 30,
        timeoutMilliseconds: 180,
      }),
      createClient: ({ connectionTimeoutMillis }) =>
        new Client({
          connectionTimeoutMillis,
          database: "postgres",
          host: "127.0.0.1",
          password: "not-logged",
          port: address.port,
          user: "postgres",
        }),
    }),
    (error) => error.name === "PostgresReadinessTimeoutError",
  );

  const validationElapsed = performance.now() - startedAt;
  const releaseDeadline = performance.now() + 500;
  while (sockets.size > 0 && performance.now() < releaseDeadline) {
    await delay(10);
  }
  assert(validationElapsed < 1_000);
  assert.equal(sockets.size, 0);
});

test("annule un SELECT suspendu sur une socket pg reelle avec end public", async (context) => {
  const fixture = await createSuspendedQueryPostgresServer(context);
  const startedAt = performance.now();

  await assert.rejects(
    waitForPostgresReadiness({
      ...shortReadinessOptions({
        attemptTimeoutMilliseconds: 80,
        cleanupTimeoutMilliseconds: 50,
        gracefulCleanupTimeoutMilliseconds: 35,
        timeoutMilliseconds: 180,
      }),
      createClient: ({ connectionTimeoutMillis }) =>
        new Client({
          connectionTimeoutMillis,
          database: "postgres",
          host: "127.0.0.1",
          password: "not-logged",
          port: fixture.port,
          user: "postgres",
        }),
    }),
    (error) =>
      error.name === "PostgresReadinessTimeoutError" &&
      error.timeoutPhase === "select_1",
  );

  await waitForSocketRelease(fixture.sockets);
  assert.deepEqual(fixture.queries, ["SELECT 1 AS value"]);
  assert(performance.now() - startedAt < 1_000);
});

test("hard-abort le transport pg epingle quand end reste suspendu", async (context) => {
  const fixture = await createSuspendedQueryPostgresServer(context);
  let endCalls = 0;
  const startedAt = performance.now();

  await assert.rejects(
    waitForPostgresReadiness({
      ...shortReadinessOptions({
        attemptTimeoutMilliseconds: 60,
        cleanupTimeoutMilliseconds: 60,
        gracefulCleanupTimeoutMilliseconds: 20,
        timeoutMilliseconds: 160,
      }),
      createClient: ({ connectionTimeoutMillis }) => {
        const client = new Client({
          connectionTimeoutMillis,
          database: "postgres",
          host: "127.0.0.1",
          password: "not-logged",
          port: fixture.port,
          user: "postgres",
        });
        client.end = () => {
          endCalls += 1;
          return new Promise(() => {});
        };
        return client;
      },
    }),
    (error) => {
      assert(error instanceof AggregateError);
      assert.equal(error.errors[0].name, "PostgresReadinessTimeoutError");
      assert.equal(
        error.errors[1].name,
        "PostgresReadinessCleanupTimeoutError",
      );
      return true;
    },
  );

  await waitForSocketRelease(fixture.sockets);
  assert.equal(endCalls, 1);
  assert.deepEqual(fixture.queries, ["SELECT 1 AS value"]);
  assert(performance.now() - startedAt < 1_000);
});

test("ne rejoue pas une mutation en echec apres readiness", async () => {
  let clients = 0;
  let queries = 0;
  let mutations = 0;
  const execute = async () => {
    const readiness = await waitForPostgresReadiness({
      ...shortReadinessOptions(),
      createClient: () => {
        clients += 1;
        return {
          async connect() {},
          async end() {},
          async query(query) {
            assert.equal(query, "SELECT 1 AS value");
            queries += 1;
            return { rows: [{ value: 1 }] };
          },
        };
      },
    });
    try {
      mutations += 1;
      throw new Error("post-readiness mutation failed");
    } finally {
      await readiness.client.end();
    }
  };

  await assert.rejects(execute(), /post-readiness mutation failed/u);
  assert.equal(clients, 1);
  assert.equal(queries, 1);
  assert.equal(mutations, 1);
});

test("separe erreur de readiness et erreur de nettoyage", async () => {
  const primary = Object.assign(new Error("connection closed"), {
    code: "ECONNRESET",
  });
  const cleanup = Object.assign(new Error("client close failed"), {
    code: "ECLEANUP",
  });

  await assert.rejects(
    waitForPostgresReadiness({
      ...shortReadinessOptions(),
      createClient: () => ({
        async connect() {
          throw primary;
        },
        async end() {
          throw cleanup;
        },
      }),
      destroyClientTransport: async () => {},
    }),
    (error) => {
      assert(error instanceof AggregateError);
      assert.deepEqual(error.errors, [primary, cleanup]);
      assert.equal(error.cause, primary);
      assert.match(error.message, /phase=postgres_readiness/u);
      assert.match(error.message, /primary_error_code=ECONNRESET/u);
      assert.match(error.message, /cleanup_error_code=ECLEANUP/u);
      return true;
    },
  );
});

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

test("capture un echec injecte de stopChild sans retry ni fuite", async () => {
  const secret = "stop-api-secret";
  const diagnostics = [];
  let calls = 0;
  const stopped = await stopApiForCleanup({
    child: { pid: 4242 },
    log: (diagnostic) => diagnostics.push(diagnostic),
    secrets: [secret],
    stopChild: async () => {
      calls += 1;
      throw Object.assign(
        new Error(`stop failed ${secret} postgresql://private-dsn`),
        { signal: "SIGTERM", status: null },
      );
    },
  });

  assert.equal(stopped, false);
  assert.equal(calls, 1);
  assert.equal(diagnostics.length, 1);
  assert.match(
    diagnostics[0],
    /^phase=finally cleanup_error=.*status=unknown; signal=SIGTERM; action=stop_api$/u,
  );
  assert.match(diagnostics[0], /<redacted-secret>/u);
  assert.match(diagnostics[0], /<redacted-database-url>/u);
  assert.doesNotMatch(diagnostics[0], new RegExp(secret, "u"));
  assert.doesNotThrow(() => assertNoSensitiveValue(diagnostics[0], [secret]));
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
