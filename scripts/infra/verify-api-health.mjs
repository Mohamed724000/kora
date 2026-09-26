import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  PROJECT_NAME,
  checkInfrastructure,
  provisionPostgresqlRuntime,
  readLocalConfiguration,
  readSecret,
  repositoryRoot,
  resetProject,
  runCompose,
  waitForServiceHealthy,
} from "./lib.mjs";
import {
  assertNoSensitiveValue,
  assertOwnerRoleRejected,
  capturedOutputSummary,
} from "./verify-api-health-assertions.mjs";

const applicationPath = resolve(
  repositoryRoot,
  "apps",
  "api",
  "dist",
  "src",
  "main.js",
);
const applicationFactoryPath = resolve(
  repositoryRoot,
  "apps",
  "api",
  "dist",
  "src",
  "app.factory.js",
);
const apiDirectory = resolve(repositoryRoot, "apps", "api");
const prismaEntryPath = resolve(
  repositoryRoot,
  "node_modules",
  "prisma",
  "build",
  "index.js",
);

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function apiEnvironment({ local, password, redisPassword, user }) {
  return {
    ...process.env,
    API_HOST: "127.0.0.1",
    API_PORT: local.KORA_API_PORT,
    DATABASE_HOST: "127.0.0.1",
    DATABASE_NAME: local.KORA_POSTGRES_DB,
    DATABASE_PASSWORD: password,
    DATABASE_PORT: local.KORA_POSTGRES_PORT,
    DATABASE_SSL: "false",
    DATABASE_USER: user,
    LOG_LEVEL: "info",
    NODE_ENV: "development",
    READINESS_TIMEOUT_MS: "1000",
    REDIS_HOST: "127.0.0.1",
    REDIS_PASSWORD: redisPassword,
    REDIS_PORT: local.KORA_REDIS_PORT,
    REDIS_TLS: "false",
  };
}

function deployMigrationsAsOwner(environment, secrets) {
  const result = spawnSync(
    process.execPath,
    [prismaEntryPath, "migrate", "deploy", "--config", "prisma.config.ts"],
    {
      cwd: apiDirectory,
      encoding: "utf8",
      env: environment,
      shell: false,
      windowsHide: true,
    },
  );
  if (result.error !== undefined) {
    throw result.error;
  }

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status !== 0) {
    throw new Error(
      `Prisma migration deploy failed as owner/migrator (exit=${result.status ?? "unknown"}): ${capturedOutputSummary(output, secrets)}.`,
    );
  }
  assertNoSensitiveValue(output, secrets);
  console.log("Prisma migrations applied under the owner/migrator identity.");
}

async function waitForResponse(url, timeoutMs, api, readLogs, secrets) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (api.exitCode !== null || api.signalCode !== null) {
      throw new Error(
        `API exited before responding (exit=${api.exitCode ?? "none"}, signal=${api.signalCode ?? "none"}); fatal=${capturedOutputSummary(readLogs(), secrets)}.`,
      );
    }
    try {
      const response = await fetch(url);
      if (response.status < 500) {
        return;
      }
    } catch {
      // The API may still be starting.
    }
    await delay(250);
  }
  throw new Error(`API did not respond within ${timeoutMs}ms.`);
}

async function readHealth(baseUrl, path, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { accept: "application/json" },
  });
  const body = await response.json();
  if (response.status !== expectedStatus) {
    const summary = {
      checks: Object.fromEntries(
        ["postgresql", "redis"].map((dependency) => [
          dependency,
          {
            reason: body.checks?.[dependency]?.reason,
            status: body.checks?.[dependency]?.status,
          },
        ]),
      ),
      status: body.status,
    };
    throw new Error(
      `${path} returned HTTP ${response.status}; expected ${expectedStatus}; summary=${JSON.stringify(summary)}.`,
    );
  }
  return body;
}

async function readRoute(baseUrl, path, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { accept: "application/json" },
  });
  const body = await response.json();
  if (response.status !== expectedStatus) {
    throw new Error(
      `${path} returned HTTP ${response.status}; expected ${expectedStatus}.`,
    );
  }
  return body;
}

function assertLiveness(body) {
  if (body.status !== "live") {
    throw new Error("Liveness response is not generic and live.");
  }
}

function assertReadiness(body, expectedStatus, downDependency) {
  if (body.status !== expectedStatus) {
    throw new Error(
      `Readiness status is ${body.status}; expected ${expectedStatus}.`,
    );
  }

  for (const dependency of ["postgresql", "redis"]) {
    const check = body.checks?.[dependency];
    const expectedDependencyStatus =
      dependency === downDependency ? "down" : "up";
    if (check?.status !== expectedDependencyStatus) {
      throw new Error(
        `${dependency} readiness status is not ${expectedDependencyStatus}.`,
      );
    }
    if (expectedDependencyStatus === "down" && check.reason !== "unavailable") {
      throw new Error(`${dependency} readiness failure is not generic.`);
    }
  }
}

function assertApiProcess(api, expectedPid, stage) {
  if (
    api.pid !== expectedPid ||
    api.exitCode !== null ||
    api.signalCode !== null
  ) {
    throw new Error(`API process identity changed during ${stage}.`);
  }

  try {
    process.kill(expectedPid, 0);
  } catch {
    throw new Error(`API process is not alive during ${stage}.`);
  }
}

async function assertPrefixedHealthRoutesAbsent(baseUrl, evidenceBodies) {
  for (const path of ["/api/v1/health/live", "/api/v1/health/ready"]) {
    evidenceBodies.push(await readRoute(baseUrl, path, 404));
  }
}

async function waitForReadiness(baseUrl, api, expectedPid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    assertApiProcess(api, expectedPid, "readiness recovery");
    try {
      const response = await fetch(`${baseUrl}/health/ready`, {
        headers: { accept: "application/json" },
      });
      if (response.status === 200) {
        const body = await response.json();
        assertReadiness(body, "ready");
        return body;
      }
    } catch {
      // Dependencies and client pools may still be reconnecting.
    }
    await delay(250);
  }
  throw new Error(`API readiness did not recover within ${timeoutMs}ms.`);
}

async function readHealthEventually({
  api,
  baseUrl,
  expectedPid,
  expectedStatus,
  path,
  timeoutMs,
}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    assertApiProcess(api, expectedPid, `${path} transition`);
    try {
      return await readHealth(baseUrl, path, expectedStatus);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }

  throw new Error(
    `${path} did not reach HTTP ${expectedStatus} within ${timeoutMs}ms: ${lastError?.message ?? "unknown error"}.`,
  );
}

async function assertRepeatedOutage({
  api,
  baseUrl,
  dependency,
  expectedPid,
  evidenceBodies,
}) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    assertApiProcess(api, expectedPid, `${dependency} outage check ${attempt}`);
    const live = await readHealthEventually({
      api,
      baseUrl,
      expectedPid,
      expectedStatus: 200,
      path: "/health/live",
      timeoutMs: 5_000,
    });
    const ready = await readHealthEventually({
      api,
      baseUrl,
      expectedPid,
      expectedStatus: 503,
      path: "/health/ready",
      timeoutMs: 5_000,
    });
    assertLiveness(live);
    assertReadiness(ready, "not_ready", dependency);
    evidenceBodies.push(live, ready);
  }
}

async function stopChild(child) {
  if (child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    delay(5_000),
  ]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

let api;
let logs = "";
let sensitiveValues = [];
const evidenceBodies = [];

try {
  if (!existsSync(applicationPath)) {
    throw new Error(
      "Compiled API is missing. Build @kora-plus/api before this verification.",
    );
  }

  checkInfrastructure();
  const local = readLocalConfiguration();
  const postgresPassword = readSecret("postgres_password");
  const postgresRuntimePassword = readSecret("postgres_runtime_password");
  const redisPassword = readSecret("redis_password");
  sensitiveValues = [postgresPassword, postgresRuntimePassword, redisPassword];
  const baseUrl = `http://127.0.0.1:${local.KORA_API_PORT}`;

  deployMigrationsAsOwner(
    apiEnvironment({
      local,
      password: postgresPassword,
      redisPassword,
      user: local.KORA_POSTGRES_USER,
    }),
    sensitiveValues,
  );
  provisionPostgresqlRuntime();

  const { createApplication } = await import(
    pathToFileURL(applicationFactoryPath).href
  );
  await assertOwnerRoleRejected({
    createApplication,
    environment: apiEnvironment({
      local,
      password: postgresPassword,
      redisPassword,
      user: local.KORA_POSTGRES_USER,
    }),
    secrets: sensitiveValues,
  });

  api = spawn(process.execPath, [applicationPath], {
    cwd: repositoryRoot,
    env: apiEnvironment({
      local,
      password: postgresRuntimePassword,
      redisPassword,
      user: local.KORA_POSTGRES_RUNTIME_USER,
    }),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  api.stdout.on("data", (chunk) => {
    logs = `${logs}${chunk.toString()}`.slice(-1_000_000);
  });
  api.stderr.on("data", (chunk) => {
    logs = `${logs}${chunk.toString()}`.slice(-1_000_000);
  });

  const expectedPid = api.pid;
  if (!Number.isInteger(expectedPid)) {
    throw new Error("API process did not expose a PID.");
  }

  await waitForResponse(
    `${baseUrl}/health/live`,
    30_000,
    api,
    () => logs,
    sensitiveValues,
  );
  assertApiProcess(api, expectedPid, "initial startup");
  const liveHealthy = await readHealth(baseUrl, "/health/live", 200);
  const readyHealthy = await readHealth(baseUrl, "/health/ready", 200);
  assertLiveness(liveHealthy);
  assertReadiness(readyHealthy, "ready");
  evidenceBodies.push(liveHealthy, readyHealthy);
  await assertPrefixedHealthRoutesAbsent(baseUrl, evidenceBodies);
  console.log(
    `API PID=${expectedPid}: live=200, ready=200 and prefixed health routes=404.`,
  );

  runCompose(["stop", "--timeout", "10", "redis"]);
  await assertRepeatedOutage({
    api,
    baseUrl,
    dependency: "redis",
    expectedPid,
    evidenceBodies,
  });
  await assertPrefixedHealthRoutesAbsent(baseUrl, evidenceBodies);
  console.log(
    `Redis outage: 3x live=200, ready=503, redis=down/unavailable, API PID=${expectedPid}.`,
  );
  runCompose(["start", "redis"]);
  waitForServiceHealthy("redis");
  evidenceBodies.push(
    await waitForReadiness(baseUrl, api, expectedPid, 30_000),
  );
  console.log(`Redis recovery: ready=200, API PID=${expectedPid}.`);

  runCompose(["stop", "--timeout", "10", "postgres"]);
  await assertRepeatedOutage({
    api,
    baseUrl,
    dependency: "postgresql",
    expectedPid,
    evidenceBodies,
  });
  await assertPrefixedHealthRoutesAbsent(baseUrl, evidenceBodies);
  console.log(
    `PostgreSQL outage: 3x live=200, ready=503, postgresql=down/unavailable, API PID=${expectedPid}.`,
  );
  runCompose(["start", "postgres"]);
  waitForServiceHealthy("postgres");
  evidenceBodies.push(
    await waitForReadiness(baseUrl, api, expectedPid, 30_000),
  );
  console.log(`PostgreSQL recovery: ready=200, API PID=${expectedPid}.`);

  resetProject(PROJECT_NAME);
  assertApiProcess(api, expectedPid, "targeted reset");
  const liveAfterReset = await readHealthEventually({
    api,
    baseUrl,
    expectedPid,
    expectedStatus: 200,
    path: "/health/live",
    timeoutMs: 5_000,
  });
  assertLiveness(liveAfterReset);
  evidenceBodies.push(
    liveAfterReset,
    await waitForReadiness(baseUrl, api, expectedPid, 30_000),
  );
  await assertPrefixedHealthRoutesAbsent(baseUrl, evidenceBodies);
  console.log(
    `Targeted reset recovery: live=200, ready=200, API PID=${expectedPid}.`,
  );

  checkInfrastructure();
  assertNoSensitiveValue(logs, sensitiveValues);
  assertNoSensitiveValue(JSON.stringify(evidenceBodies), sensitiveValues);
  console.log(
    "API responses and captured logs contain no local credential or raw DSN.",
  );
} catch (error) {
  const apiState =
    api === undefined
      ? "not_started"
      : `pid=${api.pid ?? "unknown"},exit=${api.exitCode ?? "running"},signal=${api.signalCode ?? "none"}`;
  const detail = capturedOutputSummary(
    `API infrastructure verification failed (${apiState}): ${error.message}\n${logs}`,
    sensitiveValues,
  );
  console.error(detail);
  process.exitCode = 1;
} finally {
  for (const serviceName of ["postgres", "redis"]) {
    try {
      runCompose(["start", serviceName]);
      waitForServiceHealthy(serviceName);
    } catch {
      process.exitCode = 1;
    }
  }
  if (api !== undefined) {
    await stopChild(api);
  }
}
