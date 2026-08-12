import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_NAME = "kora-plus-local";
export const POSTGRES_IMAGE =
  "postgres:18.4-alpine3.24@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15";
export const REDIS_IMAGE =
  "redis:7.2.15-alpine3.21@sha256:05a97a479bc73de66f087dc05b569010772880f778cc8671fa6b8aadee32e5c6";
export const VOLUME_NAMES = [
  "kora-plus-local-postgres-data",
  "kora-plus-local-redis-data",
];
export const NETWORK_NAME = "kora-plus-local-network";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptDirectory, "..", "..");
export const infrastructureDirectory = resolve(repositoryRoot, "infra");
export const localDirectory = resolve(infrastructureDirectory, ".local");
export const secretsDirectory = resolve(localDirectory, "secrets");
export const environmentFile = resolve(localDirectory, "compose.env");
export const composeFile = resolve(infrastructureDirectory, "compose.yaml");

const SECRET_NAMES = ["postgres_password", "redis_password"];
const REQUIRED_ENVIRONMENT = [
  "KORA_POSTGRES_DB",
  "KORA_POSTGRES_USER",
  "KORA_POSTGRES_PORT",
  "KORA_REDIS_PORT",
  "KORA_API_PORT",
];

function commandResult(argumentsList, options = {}) {
  const capture = options.capture === true;
  const result = spawnSync("docker", argumentsList, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: process.env,
    shell: false,
    stdio: capture ? "pipe" : "inherit",
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && options.allowFailure !== true) {
    const detail = capture ? result.stderr.trim() : "";
    throw new Error(
      `docker ${argumentsList.join(" ")} exited with code ${result.status}${
        detail.length === 0 ? "" : `: ${detail}`
      }`,
    );
  }

  return {
    status: result.status ?? 1,
    stderr: capture ? result.stderr.trim() : "",
    stdout: capture ? result.stdout.trim() : "",
  };
}

export function runDocker(argumentsList, options = {}) {
  return commandResult(argumentsList, options);
}

export function composeArguments(argumentsList) {
  return [
    "compose",
    "--project-name",
    PROJECT_NAME,
    "--env-file",
    environmentFile,
    "--file",
    composeFile,
    ...argumentsList,
  ];
}

export function runCompose(argumentsList, options = {}) {
  return runDocker(composeArguments(argumentsList), options);
}

function writeNewPrivateFile(path, content) {
  writeFileSync(path, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows ACLs are authoritative; chmod may be unsupported.
  }
}

export function prepareLocalFiles() {
  mkdirSync(secretsDirectory, { recursive: true, mode: 0o700 });
  const created = [];
  const preserved = [];

  for (const name of SECRET_NAMES) {
    const path = resolve(secretsDirectory, name);
    if (existsSync(path)) {
      preserved.push(path);
      continue;
    }

    const secret = randomBytes(32).toString("base64url");
    writeNewPrivateFile(path, `${secret}\n`);
    created.push(path);
  }

  if (existsSync(environmentFile)) {
    preserved.push(environmentFile);
  } else {
    writeNewPrivateFile(
      environmentFile,
      [
        "KORA_POSTGRES_DB=kora_local",
        "KORA_POSTGRES_USER=kora_local",
        "KORA_POSTGRES_PORT=15432",
        "KORA_REDIS_PORT=16379",
        "KORA_API_PORT=3102",
        "",
      ].join("\n"),
    );
    created.push(environmentFile);
  }

  readLocalConfiguration();
  readSecret("postgres_password");
  readSecret("redis_password");

  console.log(
    `Prepared local infrastructure files: ${created.length} created.`,
  );
  console.log(
    `Existing local infrastructure files preserved: ${preserved.length}.`,
  );
}

export function ensurePrepared() {
  const missing = [
    environmentFile,
    ...SECRET_NAMES.map((name) => resolve(secretsDirectory, name)),
  ].filter((path) => !existsSync(path));

  if (missing.length > 0) {
    throw new Error(
      "Local infrastructure files are missing. Run infra:prepare first.",
    );
  }
}

export function readLocalConfiguration() {
  ensurePrepared();
  const configuration = {};

  for (const rawLine of readFileSync(environmentFile, "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator <= 0) {
      throw new Error("Local Compose environment contains an invalid line.");
    }

    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    configuration[key] = value;
  }

  for (const key of REQUIRED_ENVIRONMENT) {
    if (
      typeof configuration[key] !== "string" ||
      configuration[key].length === 0
    ) {
      throw new Error(`Local Compose environment is missing ${key}.`);
    }
  }

  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(configuration.KORA_POSTGRES_DB)) {
    throw new Error("KORA_POSTGRES_DB has an invalid local identifier.");
  }

  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/u.test(configuration.KORA_POSTGRES_USER)) {
    throw new Error("KORA_POSTGRES_USER has an invalid local identifier.");
  }

  for (const key of [
    "KORA_POSTGRES_PORT",
    "KORA_REDIS_PORT",
    "KORA_API_PORT",
  ]) {
    const port = Number(configuration[key]);
    if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
      throw new Error(`${key} must be an unprivileged TCP port.`);
    }
  }

  return configuration;
}

export function readSecret(name) {
  if (!SECRET_NAMES.includes(name)) {
    throw new Error("Unknown local secret requested.");
  }

  ensurePrepared();
  const secret = readFileSync(resolve(secretsDirectory, name), "utf8").trim();
  if (!/^[A-Za-z0-9_-]{43}$/u.test(secret)) {
    throw new Error(`Local secret ${name} has an invalid format.`);
  }
  return secret;
}

function assertPortBinding(service, target, expectedHostPort) {
  const binding = service.ports?.find((port) => Number(port.target) === target);
  if (
    binding === undefined ||
    binding.host_ip !== "127.0.0.1" ||
    Number(binding.published) !== Number(expectedHostPort)
  ) {
    throw new Error(
      `Service port ${target} is not bound to the expected loopback port.`,
    );
  }
}

export function validateCompose() {
  const local = readLocalConfiguration();
  runCompose(["config", "--quiet"]);
  const rendered = runCompose(["config", "--format", "json"], {
    capture: true,
  }).stdout;
  const configuration = JSON.parse(rendered);

  if (configuration.name !== PROJECT_NAME) {
    throw new Error("Compose project name is not locked to kora-plus-local.");
  }

  const serviceNames = Object.keys(configuration.services ?? {}).sort();
  if (serviceNames.join(",") !== "postgres,redis") {
    throw new Error("Compose must contain only PostgreSQL and Redis services.");
  }

  if (configuration.services.postgres.image !== POSTGRES_IMAGE) {
    throw new Error(
      "PostgreSQL image is not pinned to the approved tag and digest.",
    );
  }
  if (configuration.services.redis.image !== REDIS_IMAGE) {
    throw new Error(
      "Redis image is not pinned to the approved tag and digest.",
    );
  }

  assertPortBinding(
    configuration.services.postgres,
    5432,
    local.KORA_POSTGRES_PORT,
  );
  assertPortBinding(configuration.services.redis, 6379, local.KORA_REDIS_PORT);

  if (configuration.volumes?.["postgres-data"]?.name !== VOLUME_NAMES[0]) {
    throw new Error("PostgreSQL volume name is not exact.");
  }
  if (configuration.volumes?.["redis-data"]?.name !== VOLUME_NAMES[1]) {
    throw new Error("Redis volume name is not exact.");
  }
  if (configuration.networks?.local?.name !== NETWORK_NAME) {
    throw new Error("Local network name is not exact.");
  }
  if (configuration.networks?.local?.external === true) {
    throw new Error(
      "Local network must remain managed by this Compose project.",
    );
  }

  const renderedText = rendered;
  for (const secret of [
    readSecret("postgres_password"),
    readSecret("redis_password"),
  ]) {
    if (renderedText.includes(secret)) {
      throw new Error(
        "A local secret leaked into rendered Compose configuration.",
      );
    }
  }

  console.log("Compose configuration and security invariants are valid.");
}

export function pullImages() {
  validateCompose();
  runCompose(["pull"]);
  const expected = [
    ["postgres:18.4-alpine3.24", POSTGRES_IMAGE.split("@")[1]],
    ["redis:7.2.15-alpine3.21", REDIS_IMAGE.split("@")[1]],
  ];

  for (const [tag, digest] of expected) {
    const output = runDocker(
      ["image", "inspect", tag, "--format", "{{json .RepoDigests}}"],
      {
        capture: true,
      },
    ).stdout;
    const repositoryDigests = JSON.parse(output);
    if (!repositoryDigests.some((item) => item.endsWith(`@${digest}`))) {
      throw new Error(
        `Resolved digest for ${tag} does not match the approved digest.`,
      );
    }
  }

  console.log("Approved image tags and digests are present locally.");
}

export function waitForServiceHealthy(serviceName, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const containerId = runCompose(["ps", "--quiet", serviceName], {
      capture: true,
    }).stdout;
    if (containerId.length > 0) {
      const health = runDocker(
        [
          "inspect",
          "--format",
          "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}",
          containerId,
        ],
        { capture: true },
      ).stdout;
      if (health === "healthy") {
        return;
      }
      if (health === "unhealthy") {
        throw new Error(`${serviceName} became unhealthy.`);
      }
    }
  }

  throw new Error(
    `${serviceName} did not become healthy within ${timeoutMs}ms.`,
  );
}

export function upProject() {
  validateCompose();
  runCompose(["up", "--detach", "--wait", "--wait-timeout", "120"]);
  waitForServiceHealthy("postgres");
  waitForServiceHealthy("redis");
  console.log("PostgreSQL and Redis are healthy.");
}

export function showStatus() {
  ensurePrepared();
  runCompose(["ps"]);
}

function assertManagedLabels(labels, expectedVolume) {
  if (
    labels?.["com.docker.compose.project"] !== PROJECT_NAME ||
    labels?.["com.kora-plus.managed"] !== "true" ||
    labels?.["com.kora-plus.project"] !== PROJECT_NAME ||
    labels?.["com.kora-plus.volume"] !== expectedVolume
  ) {
    throw new Error(
      `Volume labels do not match ${PROJECT_NAME}/${expectedVolume}.`,
    );
  }
}

export function inspectManagedVolumes() {
  return VOLUME_NAMES.map((name, index) => {
    const result = runDocker(["volume", "inspect", name], {
      capture: true,
      allowFailure: true,
    });
    if (result.status !== 0) {
      throw new Error(`Expected managed volume is missing: ${name}.`);
    }
    const [volume] = JSON.parse(result.stdout);
    assertManagedLabels(volume.Labels, index === 0 ? "postgresql" : "redis");
    return { mountpoint: volume.Mountpoint, name: volume.Name };
  });
}

export function checkInfrastructure() {
  const local = readLocalConfiguration();
  for (const serviceName of ["postgres", "redis"]) {
    waitForServiceHealthy(serviceName);
    const containerId = runCompose(["ps", "--quiet", serviceName], {
      capture: true,
    }).stdout;
    const labels = JSON.parse(
      runDocker(
        ["inspect", "--format", "{{json .Config.Labels}}", containerId],
        {
          capture: true,
        },
      ).stdout,
    );
    if (
      labels["com.docker.compose.project"] !== PROJECT_NAME ||
      labels["com.kora-plus.managed"] !== "true" ||
      labels["com.kora-plus.project"] !== PROJECT_NAME
    ) {
      throw new Error(`${serviceName} labels do not match the local project.`);
    }
  }

  inspectManagedVolumes();
  runCompose([
    "exec",
    "-T",
    "postgres",
    "pg_isready",
    "--host=127.0.0.1",
    "--port=5432",
    `--username=${local.KORA_POSTGRES_USER}`,
    `--dbname=${local.KORA_POSTGRES_DB}`,
  ]);
  const postgresResult = runCompose(
    [
      "exec",
      "-T",
      "postgres",
      "psql",
      "--no-psqlrc",
      "--tuples-only",
      "--username",
      local.KORA_POSTGRES_USER,
      "--dbname",
      local.KORA_POSTGRES_DB,
      "--command",
      "SELECT 1;",
    ],
    { capture: true },
  ).stdout.trim();
  if (postgresResult !== "1") {
    throw new Error("PostgreSQL smoke query did not return 1.");
  }

  const redisResult = runCompose(
    [
      "exec",
      "-T",
      "redis",
      "sh",
      "-ec",
      'REDISCLI_AUTH="$(cat /run/secrets/redis_password)" redis-cli --no-auth-warning -h 127.0.0.1 ping',
    ],
    { capture: true },
  ).stdout.trim();
  if (redisResult !== "PONG") {
    throw new Error("Redis smoke command did not return PONG.");
  }

  console.log(
    "Infrastructure smoke checks passed without exposing credentials.",
  );
}

export function downProject() {
  ensurePrepared();
  runCompose(["down", "--remove-orphans"]);
  console.log(
    "Local containers and network stopped; named data volumes were preserved.",
  );
}

function lines(output) {
  return output.length === 0 ? [] : output.split(/\r?\n/u).filter(Boolean);
}

export function snapshotForeignResources() {
  const allContainers = lines(
    runDocker(["ps", "--all", "--quiet", "--no-trunc"], { capture: true })
      .stdout,
  );
  const projectContainers = new Set(
    lines(
      runDocker(
        [
          "ps",
          "--all",
          "--quiet",
          "--no-trunc",
          "--filter",
          `label=com.docker.compose.project=${PROJECT_NAME}`,
        ],
        { capture: true },
      ).stdout,
    ),
  );
  const containers = allContainers
    .filter((id) => !projectContainers.has(id))
    .sort();
  const volumes = lines(
    runDocker(["volume", "ls", "--quiet"], { capture: true }).stdout,
  )
    .filter((name) => !VOLUME_NAMES.includes(name))
    .sort();
  const networks = lines(
    runDocker(["network", "ls", "--quiet", "--no-trunc"], { capture: true })
      .stdout,
  )
    .filter((id) => {
      const name = runDocker(
        ["network", "inspect", "--format", "{{.Name}}", id],
        {
          capture: true,
        },
      ).stdout;
      return name !== NETWORK_NAME;
    })
    .sort();
  const images = [
    ...new Set(
      lines(
        runDocker(["image", "ls", "--quiet", "--no-trunc"], { capture: true })
          .stdout,
      ),
    ),
  ].sort();
  return { containers, images, networks, volumes };
}

export function assertForeignResourcesUnchanged(before, after) {
  for (const resource of ["containers", "images", "networks", "volumes"]) {
    if (JSON.stringify(before[resource]) !== JSON.stringify(after[resource])) {
      throw new Error(
        `Foreign Docker ${resource} changed during the targeted reset.`,
      );
    }
  }
  console.log(
    "Foreign Docker containers, images, networks and volumes are unchanged.",
  );
}

export function resetProject(confirmation) {
  if (confirmation !== PROJECT_NAME) {
    throw new Error(`Reset refused. Use --confirm=${PROJECT_NAME}.`);
  }

  const targets = inspectManagedVolumes();
  console.log("Targeted reset resources:");
  for (const target of targets) {
    console.log(`- ${target.name}`);
  }

  const foreignBefore = snapshotForeignResources();
  runCompose(["down", "--remove-orphans"]);

  // Re-resolve exact targets and labels after containers are gone.
  inspectManagedVolumes();
  runDocker(["volume", "rm", ...VOLUME_NAMES]);
  upProject();

  const foreignAfter = snapshotForeignResources();
  assertForeignResourcesUnchanged(foreignBefore, foreignAfter);
  console.log("Targeted reset completed and the local stack is healthy.");
}

export function createPersistenceMarkers(marker) {
  if (!/^s04-[0-9a-f]{24}$/u.test(marker)) {
    throw new Error("Technical persistence marker has an invalid format.");
  }
  const local = readLocalConfiguration();
  runCompose([
    "exec",
    "-T",
    "postgres",
    "psql",
    "--no-psqlrc",
    "--set",
    "ON_ERROR_STOP=1",
    "--username",
    local.KORA_POSTGRES_USER,
    "--dbname",
    local.KORA_POSTGRES_DB,
    "--command",
    `CREATE TABLE IF NOT EXISTS s0_4_persistence_marker (marker text NOT NULL); TRUNCATE s0_4_persistence_marker; INSERT INTO s0_4_persistence_marker(marker) VALUES ('${marker}');`,
  ]);
  runCompose([
    "exec",
    "-T",
    "redis",
    "sh",
    "-ec",
    `REDISCLI_AUTH="$(cat /run/secrets/redis_password)" redis-cli --no-auth-warning SET kora:s0-4:persistence-marker ${marker} >/dev/null`,
  ]);
}

export function assertPersistenceMarkers(marker) {
  const local = readLocalConfiguration();
  const postgresMarker = runCompose(
    [
      "exec",
      "-T",
      "postgres",
      "psql",
      "--no-psqlrc",
      "--tuples-only",
      "--username",
      local.KORA_POSTGRES_USER,
      "--dbname",
      local.KORA_POSTGRES_DB,
      "--command",
      "SELECT marker FROM s0_4_persistence_marker LIMIT 1;",
    ],
    { capture: true },
  ).stdout.trim();
  const redisMarker = runCompose(
    [
      "exec",
      "-T",
      "redis",
      "sh",
      "-ec",
      'REDISCLI_AUTH="$(cat /run/secrets/redis_password)" redis-cli --no-auth-warning GET kora:s0-4:persistence-marker',
    ],
    { capture: true },
  ).stdout.trim();

  if (postgresMarker !== marker || redisMarker !== marker) {
    throw new Error("Persistence markers did not survive the restart.");
  }
}

export function assertPersistenceMarkersAbsent() {
  const local = readLocalConfiguration();
  const postgresState = runCompose(
    [
      "exec",
      "-T",
      "postgres",
      "psql",
      "--no-psqlrc",
      "--tuples-only",
      "--username",
      local.KORA_POSTGRES_USER,
      "--dbname",
      local.KORA_POSTGRES_DB,
      "--command",
      "SELECT CASE WHEN to_regclass('public.s0_4_persistence_marker') IS NULL THEN 'absent' ELSE 'present' END;",
    ],
    { capture: true },
  ).stdout.trim();
  const redisState = runCompose(
    [
      "exec",
      "-T",
      "redis",
      "sh",
      "-ec",
      'REDISCLI_AUTH="$(cat /run/secrets/redis_password)" redis-cli --no-auth-warning EXISTS kora:s0-4:persistence-marker',
    ],
    { capture: true },
  ).stdout.trim();

  if (postgresState !== "absent" || redisState !== "0") {
    throw new Error(
      "Targeted reset did not remove the technical persistence markers.",
    );
  }
}
