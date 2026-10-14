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

const DEFAULT_INSTANCE = "local";
const LEGACY_LIFECYCLE_CONFIRMATION = "kora-plus-local";
const INSTANCE = process.env.KORA_INFRA_EPHEMERAL_INSTANCE ?? DEFAULT_INSTANCE;

if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/u.test(INSTANCE)) {
  throw new Error(
    "KORA_INFRA_EPHEMERAL_INSTANCE must be a lowercase Docker identifier of at most 40 characters.",
  );
}

const legacyLifecycleConfirmation =
  process.env.KORA_INFRA_ALLOW_LEGACY_LIFECYCLE_CONFIRMATION ?? "false";
if (!new Set(["false", "true"]).has(legacyLifecycleConfirmation)) {
  throw new Error(
    "KORA_INFRA_ALLOW_LEGACY_LIFECYCLE_CONFIRMATION must be true or false.",
  );
}

export const PROJECT_NAME = `kora-plus-${INSTANCE}`;
export const POSTGRES_IMAGE =
  "postgres:18.4-alpine3.24@sha256:9a8afca54e7861fd90fab5fdf4c42477a6b1cb7d293595148e674e0a3181de15";
export const REDIS_IMAGE =
  "redis:7.2.15-alpine3.21@sha256:05a97a479bc73de66f087dc05b569010772880f778cc8671fa6b8aadee32e5c6";
export const VOLUME_NAMES = [
  `${PROJECT_NAME}-postgres-data`,
  `${PROJECT_NAME}-redis-data`,
];
export const NETWORK_NAME = `${PROJECT_NAME}-network`;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptDirectory, "..", "..");
export const infrastructureDirectory = resolve(repositoryRoot, "infra");
export const localDirectory =
  INSTANCE === DEFAULT_INSTANCE
    ? resolve(infrastructureDirectory, ".local")
    : resolve(infrastructureDirectory, ".local", "instances", INSTANCE);
export const secretsDirectory = resolve(localDirectory, "secrets");
export const environmentFile = resolve(localDirectory, "compose.env");
export const composeFile = resolve(infrastructureDirectory, "compose.yaml");
const apiDirectory = resolve(repositoryRoot, "apps", "api");
const prismaEntryPath = resolve(
  repositoryRoot,
  "node_modules",
  "prisma",
  "build",
  "index.js",
);
export const postgresProvisionScript = resolve(
  infrastructureDirectory,
  "postgres",
  "provision-runtime.sh",
);

const SECRET_NAMES = [
  "postgres_admin_writer_password",
  "postgres_password",
  "postgres_runtime_password",
  "redis_password",
];
const REQUIRED_ENVIRONMENT = [
  "KORA_POSTGRES_DB",
  "KORA_POSTGRES_USER",
  "KORA_POSTGRES_RUNTIME_USER",
  "KORA_POSTGRES_ADMIN_WRITER_USER",
  "KORA_POSTGRES_PORT",
  "KORA_REDIS_PORT",
  "KORA_API_PORT",
];

function requestedPort(name, fallback) {
  const value = process.env[name] ?? fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error(`${name} must be an unprivileged TCP port.`);
  }
  return String(port);
}

const requestedPorts = {
  KORA_API_PORT: requestedPort("KORA_INFRA_API_PORT", "3102"),
  KORA_POSTGRES_PORT: requestedPort("KORA_INFRA_POSTGRES_PORT", "15432"),
  KORA_REDIS_PORT: requestedPort("KORA_INFRA_REDIS_PORT", "16379"),
};

function dockerEnvironment() {
  return {
    ...process.env,
    KORA_INFRA_LOCAL_DIRECTORY: localDirectory.replaceAll("\\", "/"),
    KORA_INFRA_NETWORK_NAME: NETWORK_NAME,
    KORA_INFRA_POSTGRES_VOLUME_NAME: VOLUME_NAMES[0],
    KORA_INFRA_PROJECT_NAME: PROJECT_NAME,
    KORA_INFRA_REDIS_VOLUME_NAME: VOLUME_NAMES[1],
  };
}

export function interpretDockerCommandResult(
  argumentsList,
  result,
  options = {},
) {
  const capture = options.capture === true;
  if (result.error || (result.status !== 0 && options.allowFailure !== true)) {
    const detail =
      capture && typeof result.stderr === "string" ? result.stderr.trim() : "";
    const failure = new Error(
      result.error
        ? `docker ${argumentsList.join(" ")} failed to spawn`
        : `docker ${argumentsList.join(" ")} exited with code ${result.status ?? "unknown"}${
            detail.length === 0 ? "" : `: ${detail}`
          }`,
    );
    failure.name = "DockerCommandError";
    if (result.error?.code !== undefined) {
      failure.spawnCode = result.error.code;
    }
    failure.status = result.status;
    failure.signal = result.signal ?? null;
    throw failure;
  }

  return {
    signal: result.signal ?? null,
    status: result.status ?? 1,
    stderr:
      capture && typeof result.stderr === "string" ? result.stderr.trim() : "",
    stdout:
      capture && typeof result.stdout === "string" ? result.stdout.trim() : "",
  };
}

function commandResult(argumentsList, options = {}) {
  const capture = options.capture === true;
  const result = spawnSync("docker", argumentsList, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: dockerEnvironment(),
    shell: false,
    stdio: capture ? "pipe" : "inherit",
    windowsHide: true,
  });

  return interpretDockerCommandResult(argumentsList, result, options);
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

function assertNewEphemeralInstanceIsUnused() {
  if (INSTANCE === DEFAULT_INSTANCE || existsSync(localDirectory)) {
    return;
  }

  const containers = runDocker(
    [
      "ps",
      "--all",
      "--quiet",
      "--no-trunc",
      "--filter",
      `label=com.docker.compose.project=${PROJECT_NAME}`,
    ],
    { capture: true },
  ).stdout;
  const existingResources = [];
  if (containers.length > 0) {
    existingResources.push(`containers for ${PROJECT_NAME}`);
  }

  for (const volumeName of VOLUME_NAMES) {
    const volume = runDocker(["volume", "inspect", volumeName], {
      allowFailure: true,
      capture: true,
    });
    if (volume.status === 0) {
      existingResources.push(`volume ${volumeName}`);
    }
  }

  const network = runDocker(["network", "inspect", NETWORK_NAME], {
    allowFailure: true,
    capture: true,
  });
  if (network.status === 0) {
    existingResources.push(`network ${NETWORK_NAME}`);
  }

  if (existingResources.length > 0) {
    throw new Error(
      `Ephemeral infrastructure instance is not unused: ${existingResources.join(
        ", ",
      )}.`,
    );
  }
  console.log(`Ephemeral infrastructure instance ${PROJECT_NAME} is unused.`);
}

export function prepareLocalFiles() {
  assertNewEphemeralInstanceIsUnused();
  mkdirSync(secretsDirectory, { recursive: true, mode: 0o700 });
  const created = [];
  const preserved = [];
  const upgraded = [];

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
    const existingEnvironment = readFileSync(environmentFile, "utf8");
    const existingKeys = new Set(
      existingEnvironment
        .split(/\r?\n/u)
        .map((line) => line.trim().split("=", 1)[0]),
    );
    const additions = [
      ["KORA_POSTGRES_RUNTIME_USER", "kora_runtime"],
      ["KORA_POSTGRES_ADMIN_WRITER_USER", "kora_admin_writer"],
    ].filter(([key]) => !existingKeys.has(key));
    if (additions.length > 0) {
      const prefix =
        existingEnvironment.length === 0 || existingEnvironment.endsWith("\n")
          ? ""
          : "\n";
      writeFileSync(
        environmentFile,
        `${prefix}${additions
          .map(([key, value]) => `${key}=${value}`)
          .join("\n")}\n`,
        { encoding: "utf8", flag: "a" },
      );
      upgraded.push(environmentFile);
    }
    preserved.push(environmentFile);
  } else {
    writeNewPrivateFile(
      environmentFile,
      [
        "KORA_POSTGRES_DB=kora_local",
        "KORA_POSTGRES_USER=kora_local",
        "KORA_POSTGRES_RUNTIME_USER=kora_runtime",
        "KORA_POSTGRES_ADMIN_WRITER_USER=kora_admin_writer",
        `KORA_POSTGRES_PORT=${requestedPorts.KORA_POSTGRES_PORT}`,
        `KORA_REDIS_PORT=${requestedPorts.KORA_REDIS_PORT}`,
        `KORA_API_PORT=${requestedPorts.KORA_API_PORT}`,
        "",
      ].join("\n"),
    );
    created.push(environmentFile);
  }

  readLocalConfiguration();
  readSecret("postgres_admin_writer_password");
  readSecret("postgres_password");
  readSecret("postgres_runtime_password");
  readSecret("redis_password");

  console.log(
    `Prepared local infrastructure files: ${created.length} created.`,
  );
  console.log(
    `Existing local infrastructure files preserved: ${preserved.length}.`,
  );
  console.log(
    `Existing local infrastructure files upgraded in place: ${upgraded.length}.`,
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

  if (
    !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(
      configuration.KORA_POSTGRES_RUNTIME_USER,
    ) ||
    configuration.KORA_POSTGRES_RUNTIME_USER ===
      configuration.KORA_POSTGRES_USER
  ) {
    throw new Error(
      "KORA_POSTGRES_RUNTIME_USER must be a distinct valid PostgreSQL role.",
    );
  }

  if (
    !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(
      configuration.KORA_POSTGRES_ADMIN_WRITER_USER,
    ) ||
    configuration.KORA_POSTGRES_ADMIN_WRITER_USER ===
      configuration.KORA_POSTGRES_USER ||
    configuration.KORA_POSTGRES_ADMIN_WRITER_USER ===
      configuration.KORA_POSTGRES_RUNTIME_USER
  ) {
    throw new Error(
      "KORA_POSTGRES_ADMIN_WRITER_USER must be a distinct valid PostgreSQL role.",
    );
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
    throw new Error(`Compose project name is not locked to ${PROJECT_NAME}.`);
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

  const postgresService = configuration.services.postgres;
  if (
    postgresService.environment?.KORA_POSTGRES_RUNTIME_USER !==
    local.KORA_POSTGRES_RUNTIME_USER
  ) {
    throw new Error("PostgreSQL runtime role is not rendered exactly.");
  }
  if (
    postgresService.environment?.KORA_POSTGRES_ADMIN_WRITER_USER !==
    local.KORA_POSTGRES_ADMIN_WRITER_USER
  ) {
    throw new Error("PostgreSQL admin writer role is not rendered exactly.");
  }
  const postgresSecrets = (postgresService.secrets ?? [])
    .map((secret) => secret.source)
    .sort();
  if (
    postgresSecrets.join(",") !==
    "postgres_admin_writer_password,postgres_password,postgres_runtime_password"
  ) {
    throw new Error(
      "PostgreSQL owner, runtime, and admin writer secrets are not separated.",
    );
  }
  const provisionMount = (postgresService.volumes ?? []).find(
    (volume) =>
      volume.target === "/usr/local/bin/kora-provision-postgresql-runtime.sh",
  );
  if (
    provisionMount?.type !== "bind" ||
    provisionMount.source !== postgresProvisionScript ||
    provisionMount.read_only !== true
  ) {
    throw new Error(
      "PostgreSQL runtime provisioner must be an exact read-only bind mount.",
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

  for (const secretName of SECRET_NAMES) {
    const expectedSecretPath = resolve(secretsDirectory, secretName);
    const renderedSecretPath = configuration.secrets?.[secretName]?.file;
    if (
      typeof renderedSecretPath !== "string" ||
      resolve(renderedSecretPath) !== expectedSecretPath
    ) {
      throw new Error(
        `Local secret ${secretName} is not bound to the isolated directory.`,
      );
    }
  }

  const renderedText = rendered;
  for (const secret of [
    readSecret("postgres_admin_writer_password"),
    readSecret("postgres_password"),
    readSecret("postgres_runtime_password"),
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

export function provisionPostgresqlRuntime() {
  const local = readLocalConfiguration();
  runCompose([
    "exec",
    "-T",
    "postgres",
    "sh",
    "/usr/local/bin/kora-provision-postgresql-runtime.sh",
  ]);

  const runtimeResult = runCompose(
    [
      "exec",
      "-T",
      "postgres",
      "sh",
      "-ec",
      'PGPASSWORD="$(cat /run/secrets/postgres_runtime_password)" psql --host=127.0.0.1 --port=5432 --username="$KORA_POSTGRES_RUNTIME_USER" --dbname="$POSTGRES_DB" --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="SELECT 1;"',
    ],
    { capture: true },
  ).stdout.trim();

  if (runtimeResult !== "1" || local.KORA_POSTGRES_RUNTIME_USER.length === 0) {
    throw new Error("PostgreSQL runtime smoke query did not return 1.");
  }

  const writerResult = runCompose(
    [
      "exec",
      "-T",
      "postgres",
      "sh",
      "-ec",
      'PGPASSWORD="$(cat /run/secrets/postgres_admin_writer_password)" psql --host=127.0.0.1 --port=5432 --username="$KORA_POSTGRES_ADMIN_WRITER_USER" --dbname="$POSTGRES_DB" --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --command="SELECT 1;"',
    ],
    { capture: true },
  ).stdout.trim();

  if (
    writerResult !== "1" ||
    local.KORA_POSTGRES_ADMIN_WRITER_USER.length === 0
  ) {
    throw new Error("PostgreSQL admin writer smoke query did not return 1.");
  }
}

function deployPostgresqlMigrations() {
  if (!existsSync(prismaEntryPath)) {
    throw new Error(
      "Prisma CLI is missing. Install dependencies before starting infrastructure.",
    );
  }

  const local = readLocalConfiguration();
  const secrets = SECRET_NAMES.map((name) => readSecret(name));
  const result = spawnSync(
    process.execPath,
    [prismaEntryPath, "migrate", "deploy", "--config", "prisma.config.ts"],
    {
      cwd: apiDirectory,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_HOST: "127.0.0.1",
        DATABASE_NAME: local.KORA_POSTGRES_DB,
        DATABASE_PASSWORD: readSecret("postgres_password"),
        DATABASE_PORT: local.KORA_POSTGRES_PORT,
        DATABASE_SSL: "false",
        DATABASE_USER: local.KORA_POSTGRES_USER,
      },
      shell: false,
      stdio: "pipe",
      windowsHide: true,
    },
  );
  if (result.error !== undefined) {
    throw result.error;
  }

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (secrets.some((secret) => output.includes(secret))) {
    throw new Error("Prisma migration output exposed a local secret.");
  }
  if (result.status !== 0) {
    throw new Error(
      `Prisma migration deploy failed as owner/migrator (exit=${result.status ?? "unknown"}).`,
    );
  }
  console.log("Prisma migrations applied under the owner/migrator identity.");
}

export function pullImages() {
  validateCompose();
  runCompose(["pull"]);
  const expected = [
    [POSTGRES_IMAGE, POSTGRES_IMAGE.split("@")[1]],
    [REDIS_IMAGE, REDIS_IMAGE.split("@")[1]],
  ];

  for (const [reference, digest] of expected) {
    const output = runDocker(
      ["image", "inspect", reference, "--format", "{{json .RepoDigests}}"],
      {
        capture: true,
      },
    ).stdout;
    const repositoryDigests = JSON.parse(output);
    if (!repositoryDigests.some((item) => item.endsWith(`@${digest}`))) {
      throw new Error(
        `Resolved digest for ${reference.split("@")[0]} does not match the approved digest.`,
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
  deployPostgresqlMigrations();
  provisionPostgresqlRuntime();
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

  provisionPostgresqlRuntime();

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
  const legacyLifecycleGateIsExplicitlyIsolated =
    INSTANCE !== DEFAULT_INSTANCE &&
    legacyLifecycleConfirmation === "true" &&
    confirmation === LEGACY_LIFECYCLE_CONFIRMATION;
  if (
    confirmation !== PROJECT_NAME &&
    !legacyLifecycleGateIsExplicitlyIsolated
  ) {
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
