import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import pg from "pg";

import {
  assertQualifiedPrismaToolchainStateUnchanged,
  captureQualifiedPrismaToolchainState,
  cleanupHistoricalPrismaWorkspace,
  gitBlobOid,
  historicalArtifactManifest,
  historicalReferenceMetadata,
  materializeHistoricalPrismaWorkspace,
  validateQualifiedPrismaToolchainLock,
  validateHistoricalArtifactBuffer,
  waitForPostgresReadiness,
} from "../../apps/api/prisma/validate-admin-auth-runtime.mjs";

import {
  assertQualifiedFoundationsToolchainStateUnchanged,
  captureQualifiedFoundationsToolchainState,
  runWithProtectedFoundationsInputs,
  validateQualifiedFoundationsToolchainLock,
} from "../../apps/api/prisma/validate-admin-security-c2a-runtime.mjs";

import { validateExactC2bMigrationNames } from "../../apps/api/prisma/validate-admin-security-c2b-runtime.mjs";

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
const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const pinnedImageFunctionNames = [
  "ConvertTo-DockerImageInventoryEntries",
  "Test-DockerNoSuchImageResult",
  "Resolve-PinnedImageIdentity",
  "Assert-PinnedImageCleanupSafe",
  "Assert-PinnedImageRemovalPostcondition",
];

function runPowerShellImageFixture(wrapperPath, body) {
  const fixtureRoot = mkdtempSync(
    resolve(tmpdir(), "kora-image-identity-fixture-"),
  );
  try {
    const fixturePath = resolve(fixtureRoot, "fixture.ps1");
    const escapedWrapper = wrapperPath.replaceAll("'", "''");
    const names = pinnedImageFunctionNames
      .map((name) => `'${name}'`)
      .join(", ");
    writeFileSync(
      fixturePath,
      `$ErrorActionPreference = 'Stop'\n` +
        `$wrapperPath = '${escapedWrapper}'\n` +
        `$tokens = $null\n$parseErrors = $null\n` +
        `$ast = [Management.Automation.Language.Parser]::ParseFile($wrapperPath, [ref]$tokens, [ref]$parseErrors)\n` +
        `if ($parseErrors.Count -ne 0) { throw 'Wrapper parse failed.' }\n` +
        `$functionNames = @(${names})\n` +
        `foreach ($name in $functionNames) {\n` +
        `  $definition = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)\n` +
        `  if ($null -eq $definition) { throw "Missing function $name." }\n` +
        `  . ([scriptblock]::Create($definition.Extent.Text))\n` +
        `}\n` +
        body,
      { encoding: "utf8", flag: "wx" },
    );
    return spawnSync(
      process.platform === "win32" ? "pwsh.exe" : "pwsh",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", fixturePath],
      { encoding: "utf8", windowsHide: true },
    );
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
}

function imageIdentityFixtureBody() {
  return String.raw`
function New-Result([int]$ExitCode, [string]$Stdout, [string]$Stderr, [bool]$TimedOut = $false) {
  return [pscustomobject]@{ ExitCode = $ExitCode; Stdout = $Stdout; Stderr = $Stderr; TimedOut = $TimedOut }
}
function Assert-FixtureThrows([scriptblock]$Action) {
  $threw = $false
  try { & $Action } catch { $threw = $true }
  if (-not $threw) { throw 'Expected fixture action to throw.' }
}
$manifestDigest = 'sha256:' + ('a' * 64)
$imageId = 'sha256:' + ('b' * 64)
$otherId = 'sha256:' + ('c' * 64)
$image = "postgres:18.4-alpine3.24@$manifestDigest"
$tag = 'postgres:18.4-alpine3.24'
$repoDigest = "postgres@$manifestDigest"
$identity = [pscustomobject]@{
  Id = $imageId
  RepoTags = @($tag, $repoDigest)
  RepoDigests = @($repoDigest)
}
$inspectOk = New-Result 0 ($identity | ConvertTo-Json -Compress) ''
$inventory = @(
  "$tag|$manifestDigest|$imageId",
  "mirror:copy|sha256:$('d' * 64)|$imageId"
)
$present = Resolve-PinnedImageIdentity -Image $image -ExpectedRepoDigest $repoDigest -InventoryImages $inventory -InspectResult $inspectOk
if (-not $present.Present -or $present.Id -ne $imageId -or $imageId -eq $manifestDigest -or
    $present.InventoryEntries.Count -ne 2) {
  throw 'Valid distinct local image identity or multi-reference inventory was rejected.'
}

$wrongDigestIdentity = [pscustomobject]@{
  Id = $imageId; RepoTags = @($tag); RepoDigests = @("postgres@sha256:$('e' * 64)")
}
Assert-FixtureThrows {
  Resolve-PinnedImageIdentity -Image $image -ExpectedRepoDigest $repoDigest -InventoryImages $inventory -InspectResult (New-Result 0 ($wrongDigestIdentity | ConvertTo-Json -Compress) '')
}
Assert-FixtureThrows {
  Resolve-PinnedImageIdentity -Image $image -ExpectedRepoDigest $repoDigest -InventoryImages $inventory -InspectResult (New-Result 0 '' '')
}
$multiple = @($identity, $identity) | ConvertTo-Json -Compress
Assert-FixtureThrows {
  Resolve-PinnedImageIdentity -Image $image -ExpectedRepoDigest $repoDigest -InventoryImages $inventory -InspectResult (New-Result 0 $multiple '')
}
Assert-FixtureThrows {
  Resolve-PinnedImageIdentity -Image $image -ExpectedRepoDigest $repoDigest -InventoryImages $inventory -InspectResult (New-Result 0 '{invalid' '')
}

function New-NoSuch([string]$Reference) {
  return New-Result 1 '' "Error response from daemon: No such image: $Reference"
}
$absent = Resolve-PinnedImageIdentity -Image $image -ExpectedRepoDigest $repoDigest -InventoryImages @() -InspectResult (New-NoSuch $image) -DaemonInfoResult (New-Result 0 '{}' '') -TagInspectResult (New-NoSuch $tag) -DigestInspectResult (New-NoSuch $repoDigest)
if ($absent.Present -or $absent.Classification -ne 'no_such_image') {
  throw 'Exact absent image fixture was not classified as absent.'
}
Assert-FixtureThrows {
  Resolve-PinnedImageIdentity -Image $image -ExpectedRepoDigest $repoDigest -InventoryImages @() -InspectResult (New-NoSuch $image) -DaemonInfoResult (New-Result 1 '' 'daemon unavailable') -TagInspectResult (New-NoSuch $tag) -DigestInspectResult (New-NoSuch $repoDigest)
}
Assert-FixtureThrows {
  Resolve-PinnedImageIdentity -Image $image -ExpectedRepoDigest $repoDigest -InventoryImages @() -InspectResult (New-Result 1 '' 'permission denied') -DaemonInfoResult (New-Result 0 '{}' '') -TagInspectResult (New-NoSuch $tag) -DigestInspectResult (New-NoSuch $repoDigest)
}
Assert-FixtureThrows {
  Resolve-PinnedImageIdentity -Image $image -ExpectedRepoDigest $repoDigest -InventoryImages @("$tag|$manifestDigest|$imageId") -InspectResult (New-NoSuch $image) -DaemonInfoResult (New-Result 0 '{}' '') -TagInspectResult (New-NoSuch $tag) -DigestInspectResult (New-NoSuch $repoDigest)
}
Assert-FixtureThrows {
  Resolve-PinnedImageIdentity -Image $image -ExpectedRepoDigest $repoDigest -InventoryImages @() -InspectResult (New-NoSuch $image) -DaemonInfoResult (New-Result 0 '{}' '') -TagInspectResult $inspectOk -DigestInspectResult (New-NoSuch $repoDigest)
}

$ownedInventory = @("$tag|$manifestDigest|$imageId")
$acquired = [pscustomobject]@{
  Present = $true; Id = $imageId; RepoTags = @($tag, $repoDigest); RepoDigests = @($repoDigest);
  InventoryEntries = @($ownedInventory); Classification = 'present'; InspectExitCode = 0; DaemonInfoExitCode = $null
}
if (-not (Assert-PinnedImageCleanupSafe -Image $image -ExpectedRepoDigest $repoDigest -AcquisitionAttempted $true -AcquiredState $acquired -CurrentState $acquired -InitialImageIds @($otherId) -CurrentInventoryImages $ownedInventory -ContainerIdentities @())) {
  throw 'Owned acquired image cleanup fixture was rejected.'
}
Assert-FixtureThrows {
  Assert-PinnedImageCleanupSafe -Image $image -ExpectedRepoDigest $repoDigest -AcquisitionAttempted $false -AcquiredState $acquired -CurrentState $acquired -InitialImageIds @($otherId) -CurrentInventoryImages $ownedInventory -ContainerIdentities @()
}
Assert-FixtureThrows {
  Assert-PinnedImageCleanupSafe -Image $image -ExpectedRepoDigest $repoDigest -AcquisitionAttempted $true -AcquiredState $acquired -CurrentState $acquired -InitialImageIds @($imageId) -CurrentInventoryImages $ownedInventory -ContainerIdentities @()
}
$shared = [pscustomobject]@{
  Present = $true; Id = $imageId; RepoTags = @($tag, $repoDigest, 'foreign:shared');
  RepoDigests = @($repoDigest); InventoryEntries = @($ownedInventory, "foreign:shared|<none>|$imageId");
  Classification = 'present'; InspectExitCode = 0; DaemonInfoExitCode = $null
}
Assert-FixtureThrows {
  Assert-PinnedImageCleanupSafe -Image $image -ExpectedRepoDigest $repoDigest -AcquisitionAttempted $true -AcquiredState $acquired -CurrentState $shared -InitialImageIds @($otherId) -CurrentInventoryImages @($ownedInventory + "foreign:shared|<none>|$imageId") -ContainerIdentities @()
}
Assert-FixtureThrows {
  Assert-PinnedImageCleanupSafe -Image $image -ExpectedRepoDigest $repoDigest -AcquisitionAttempted $true -AcquiredState $acquired -CurrentState $acquired -InitialImageIds @($otherId) -CurrentInventoryImages $ownedInventory -ContainerIdentities @([pscustomobject]@{ Id = ('f' * 64); Image = $imageId })
}
$changed = [pscustomobject]@{
  Present = $true; Id = $otherId; RepoTags = @($tag, $repoDigest); RepoDigests = @($repoDigest);
  InventoryEntries = @("$tag|$manifestDigest|$otherId"); Classification = 'present'; InspectExitCode = 0;
  DaemonInfoExitCode = $null
}
Assert-FixtureThrows {
  Assert-PinnedImageCleanupSafe -Image $image -ExpectedRepoDigest $repoDigest -AcquisitionAttempted $true -AcquiredState $acquired -CurrentState $changed -InitialImageIds @() -CurrentInventoryImages @("$tag|$manifestDigest|$otherId") -ContainerIdentities @()
}
if (-not (Assert-PinnedImageRemovalPostcondition -Image $image -AcquiredImageId $imageId -PostRemovalState $absent -PostRemovalInventoryImages @())) {
  throw 'Clean image removal postcondition was rejected.'
}
Assert-FixtureThrows {
  Assert-PinnedImageRemovalPostcondition -Image $image -AcquiredImageId $imageId -PostRemovalState $absent -PostRemovalInventoryImages $ownedInventory
}
Assert-FixtureThrows {
  Assert-PinnedImageRemovalPostcondition -Image $image -AcquiredImageId $imageId -PostRemovalState $acquired -PostRemovalInventoryImages $ownedInventory
}
`;
}

function workflowRunStep(stepName) {
  const lines = readFileSync(
    resolve(repositoryRoot, ".github", "workflows", "infrastructure.yml"),
    "utf8",
  ).split(/\r?\n/u);
  const stepStart = lines.findIndex(
    (line) => line === `      - name: ${stepName}`,
  );
  assert.notEqual(stepStart, -1, `missing workflow step ${stepName}`);
  const runStart = lines.findIndex(
    (line, index) => index > stepStart && line === "        run: |",
  );
  assert.notEqual(runStart, -1, `missing run block for ${stepName}`);
  const body = [];
  for (let index = runStart + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("      - name: ")) break;
    if (lines[index].startsWith("          "))
      body.push(lines[index].slice(10));
  }
  return `${body.join("\n")}\n`;
}

function workflowStepBlock(stepName) {
  const lines = readFileSync(
    resolve(repositoryRoot, ".github", "workflows", "infrastructure.yml"),
    "utf8",
  ).split(/\r?\n/u);
  const stepStart = lines.findIndex(
    (line) => line === `      - name: ${stepName}`,
  );
  assert.notEqual(stepStart, -1, `missing workflow step ${stepName}`);
  let stepEnd = lines.length;
  for (let index = stepStart + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("      - name: ")) {
      stepEnd = index;
      break;
    }
  }
  return {
    index: stepStart,
    text: `${lines.slice(stepStart, stepEnd).join("\n")}\n`,
  };
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function noFollowIdentity(path) {
  const stats = lstatSync(path, { bigint: true });
  return {
    type: stats.isFile()
      ? "file"
      : stats.isDirectory()
        ? "directory"
        : stats.isSymbolicLink()
          ? "symlink"
          : "other",
    dev: stats.dev.toString(),
    ino: stats.ino.toString(),
    mode: stats.mode.toString(),
    birthtimeNs: stats.birthtimeNs.toString(),
  };
}

function powerShellParseResult(script) {
  const root = mkdtempSync(resolve(tmpdir(), "kora-pwsh-parse-fixture-"));
  try {
    const path = resolve(root, "script.ps1");
    writeFileSync(path, script, { encoding: "utf8", flag: "wx" });
    return spawnSync(
      process.platform === "win32" ? "pwsh.exe" : "pwsh",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$tokens=$null;$errors=$null;[Management.Automation.Language.Parser]::ParseFile($env:KORA_PWSH_PARSE_PATH,[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){$errors|ForEach-Object{[Console]::Error.WriteLine($_.Message)};exit 1}",
      ],
      {
        encoding: "utf8",
        env: { ...process.env, KORA_PWSH_PARSE_PATH: path },
        windowsHide: true,
      },
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function workflowCleanupFixture(
  context,
  { phase, mutation = null, npmExit = 0 },
) {
  const root = mkdtempSync(resolve(tmpdir(), "kora-workflow-cleanup-fixture-"));
  context.after(() => {
    if (existsSync(root)) rmSync(root, { force: true, recursive: true });
  });
  const runnerTemp = resolve(root, "runner-temp");
  const workspace = resolve(root, "workspace");
  const bin = resolve(root, "bin");
  mkdirSync(runnerTemp, { recursive: true });
  mkdirSync(workspace, { recursive: true });
  mkdirSync(bin, { recursive: true });
  const statePath = resolve(runnerTemp, "kora-infra-job-state");

  const instance = "ci-123-1";
  const instanceRoot = resolve(
    workspace,
    "infra",
    ".local",
    "instances",
    instance,
  );
  const ownershipPath = resolve(runnerTemp, "kora-infra-job-owned-files.json");
  if (phase !== null && phase !== "not_started") {
    const relativePaths =
      phase === "prepare_started"
        ? ["compose.env", "secrets/postgres_password"]
        : [
            "compose.env",
            "secrets/postgres_admin_writer_password",
            "secrets/postgres_password",
            "secrets/postgres_runtime_password",
            "secrets/redis_password",
          ];
    let files = relativePaths.map((relativePath, index) => {
      const path = resolve(instanceRoot, ...relativePath.split("/"));
      mkdirSync(dirname(path), { recursive: true });
      const bytes = Buffer.from(`fixture-${index}\n`, "utf8");
      writeFileSync(path, bytes, { flag: "wx" });
      return {
        identity: noFollowIdentity(path),
        length: bytes.length,
        relativePath,
        sha256: sha256Hex(bytes),
      };
    });
    const directories = [
      { identity: noFollowIdentity(instanceRoot), relativePath: "." },
      {
        identity: noFollowIdentity(resolve(instanceRoot, "secrets")),
        relativePath: "secrets",
      },
    ];
    if (mutation === "manifest-reduced") files = files.slice(0, -1);
    writeFileSync(
      ownershipPath,
      JSON.stringify({ directories, files, instanceRoot }),
      {
        encoding: "utf8",
        flag: "wx",
      },
    );
    writeFileSync(
      statePath,
      JSON.stringify({
        ownershipManifestIdentity: noFollowIdentity(ownershipPath),
        phase,
      }),
      { flag: "wx" },
    );
    if (mutation === "content") {
      writeFileSync(resolve(instanceRoot, "compose.env"), "substituted\n");
    }
    if (mutation === "same-bytes-replacement") {
      const target = resolve(instanceRoot, "compose.env");
      const bytes = readFileSync(target);
      renameSync(target, resolve(root, "original-compose.env"));
      writeFileSync(target, bytes, { flag: "wx" });
    }
    if (mutation === "manifest-same-bytes-replacement") {
      const bytes = readFileSync(ownershipPath);
      renameSync(ownershipPath, resolve(root, "original-ownership.json"));
      writeFileSync(ownershipPath, bytes, { flag: "wx" });
    }
  } else if (phase !== null) {
    writeFileSync(statePath, JSON.stringify({ phase }), { flag: "wx" });
  }

  const npmRecord = resolve(root, "npm-record.json");
  const fakeNpmScript = resolve(bin, "fake-npm.mjs");
  writeFileSync(
    fakeNpmScript,
    `import { writeFileSync } from 'node:fs';\n` +
      `writeFileSync(process.env.KORA_FAKE_NPM_RECORD, JSON.stringify(process.argv.slice(2)));\n` +
      `process.exit(Number(process.env.KORA_FAKE_NPM_EXIT || '0'));\n`,
    { encoding: "utf8", flag: "wx" },
  );
  if (process.platform === "win32") {
    writeFileSync(
      resolve(bin, "npm.cmd"),
      `@echo off\r\n"${process.execPath}" "${fakeNpmScript}" %*\r\n`,
      { encoding: "utf8", flag: "wx" },
    );
  } else {
    const npmPath = resolve(bin, "npm");
    writeFileSync(
      npmPath,
      `#!/bin/sh\nexec "${process.execPath}" "${fakeNpmScript}" "$@"\n`,
      { encoding: "utf8", flag: "wx" },
    );
    chmodSync(npmPath, 0o755);
  }

  const cleanupPath = resolve(root, "cleanup.ps1");
  writeFileSync(cleanupPath, workflowRunStep("Stop local infrastructure"), {
    encoding: "utf8",
    flag: "wx",
  });
  const result = spawnSync(
    process.platform === "win32" ? "pwsh.exe" : "pwsh",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", cleanupPath],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_WORKSPACE: workspace,
        KORA_FAKE_NPM_EXIT: String(npmExit),
        KORA_FAKE_NPM_RECORD: npmRecord,
        KORA_INFRA_EPHEMERAL_INSTANCE: instance,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
        RUNNER_TEMP: runnerTemp,
      },
      windowsHide: true,
    },
  );
  return { instanceRoot, npmRecord, ownershipPath, result };
}

function lifecycleProjectIdentityFixture(context) {
  const root = mkdtempSync(
    resolve(tmpdir(), "kora-lifecycle-project-fixture-"),
  );
  context.after(() => rmSync(root, { force: true, recursive: true }));

  const lifecycleSource = readFileSync(
    resolve(repositoryRoot, "scripts", "infra", "verify-lifecycle.mjs"),
    "utf8",
  );
  const importMarker = 'from "./lib.mjs";';
  assert.equal(lifecycleSource.split(importMarker).length - 1, 1);
  writeFileSync(
    resolve(root, "verify-lifecycle.mjs"),
    lifecycleSource.replace(importMarker, 'from "./fixture-lib.mjs";'),
    { encoding: "utf8", flag: "wx" },
  );

  writeFileSync(
    resolve(root, "fixture-lib.mjs"),
    `export const PROJECT_NAME = process.env.KORA_EXPECTED_PROJECT_NAME;\n` +
      `function record(event, value = null) { console.log(JSON.stringify({ event, value })); }\n` +
      `export function assertPersistenceMarkers() { record("assertPersistenceMarkers"); }\n` +
      `export function assertPersistenceMarkersAbsent() { record("assertPersistenceMarkersAbsent"); }\n` +
      `export function checkInfrastructure() { record("checkInfrastructure"); }\n` +
      `export function createPersistenceMarkers(value) { record("createPersistenceMarkers", value); }\n` +
      `export function downProject() { record("downProject"); }\n` +
      `export function prepareLocalFiles() { record("prepareLocalFiles"); }\n` +
      `export function resetProject(confirmation) {\n` +
      `  if (confirmation !== PROJECT_NAME) { throw new Error("wrong reset confirmation: " + confirmation); }\n` +
      `  record("resetProject", confirmation);\n` +
      `}\n` +
      `export function runCompose(args) { record("runCompose", args); }\n` +
      `export function upProject() { record("upProject"); }\n` +
      `export function validateCompose() { record("validateCompose"); }\n` +
      `export function waitForServiceHealthy(service) { record("waitForServiceHealthy", service); }\n`,
    { encoding: "utf8", flag: "wx" },
  );

  const expectedProjectName = "kora-plus-r9-lifecycle-fixture";
  const result = spawnSync(
    process.execPath,
    [resolve(root, "verify-lifecycle.mjs")],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        KORA_EXPECTED_PROJECT_NAME: expectedProjectName,
        KORA_INFRA_ALLOW_LEGACY_LIFECYCLE_CONFIRMATION: "false",
      },
      windowsHide: true,
    },
  );
  return { expectedProjectName, result };
}

function rejectedCrossInstanceResetFixture(context) {
  const root = mkdtempSync(resolve(tmpdir(), "kora-reset-refusal-fixture-"));
  context.after(() => rmSync(root, { force: true, recursive: true }));
  const libUrl = pathToFileURL(
    resolve(repositoryRoot, "scripts", "infra", "lib.mjs"),
  ).href;
  const probe =
    `import { resetProject } from ${JSON.stringify(libUrl)};\n` +
    `try {\n` +
    `  resetProject("kora-plus-local");\n` +
    `  console.error("cross-instance reset was accepted");\n` +
    `  process.exitCode = 24;\n` +
    `} catch (error) {\n` +
    `  console.error(error instanceof Error ? error.message : String(error));\n` +
    `  process.exitCode = 23;\n` +
    `}\n`;
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.toLowerCase() === "path") {
      delete environment[key];
    }
  }
  environment.PATH = root;
  environment.KORA_INFRA_EPHEMERAL_INSTANCE = "r9-lifecycle-fixture";
  delete environment.KORA_INFRA_ALLOW_LEGACY_LIFECYCLE_CONFIRMATION;

  return spawnSync(process.execPath, ["--input-type=module", "--eval", probe], {
    encoding: "utf8",
    env: environment,
    windowsHide: true,
  });
}

function historicalFixture(context, { alterPath, omitPath } = {}) {
  const sourceRoot = mkdtempSync(resolve(tmpdir(), "kora-c1-history-fixture-"));
  context.after(() => {
    if (existsSync(sourceRoot))
      rmSync(sourceRoot, { force: true, recursive: true });
  });
  for (const artifact of historicalArtifactManifest()) {
    if (artifact.sourcePath === omitPath) continue;
    const source = resolve(repositoryRoot, artifact.sourcePath);
    const destination = resolve(sourceRoot, artifact.sourcePath);
    mkdirSync(dirname(destination), { recursive: true });
    const bytes = readFileSync(source);
    if (artifact.sourcePath === alterPath) bytes[0] ^= 1;
    writeFileSync(destination, bytes, { flag: "wx" });
  }
  return sourceRoot;
}

test("fige l'identité du schema C1 autonome sans objet Git historique", (context) => {
  const manifest = historicalArtifactManifest();
  const schema = manifest.find(
    ({ sourcePath }) =>
      sourcePath === "apps/api/prisma/history/s1-2-03c1/schema.prisma",
  );
  assert(schema);
  assert.deepEqual(historicalReferenceMetadata(), {
    commit: "d514b87cbef21dfae4585f4d143889aca2d8b229",
    tree: "2429871f3b440934cfbd02ceaaf0c74f3f8f3ac4",
  });
  const bytes = readFileSync(resolve(repositoryRoot, schema.sourcePath));
  assert.equal(bytes.length, 36_144);
  assert.equal(gitBlobOid(bytes), schema.gitOid);
  assert.doesNotThrow(() => validateHistoricalArtifactBuffer(schema, bytes));

  const sourceRoot = historicalFixture(context);
  assert.equal(existsSync(resolve(sourceRoot, ".git")), false);
  const workspace = materializeHistoricalPrismaWorkspace({
    sourceRoot,
    tempBase: resolve(sourceRoot, "tmp"),
  });
  assert.equal(
    existsSync(
      resolve(workspace.migrationsDirectory, "admin_security_c2a_runtime"),
    ),
    false,
  );
  cleanupHistoricalPrismaWorkspace(workspace);
  assert.equal(existsSync(workspace.root), false);
});

test("refuse le schema C1 historique manquant ou altéré", (context) => {
  const schemaPath = "apps/api/prisma/history/s1-2-03c1/schema.prisma";
  const missingRoot = historicalFixture(context, { omitPath: schemaPath });
  assert.throws(
    () =>
      materializeHistoricalPrismaWorkspace({
        sourceRoot: missingRoot,
        tempBase: resolve(missingRoot, "tmp"),
      }),
    /historical artifact .* is missing/u,
  );

  const alteredRoot = historicalFixture(context, { alterPath: schemaPath });
  assert.throws(
    () =>
      materializeHistoricalPrismaWorkspace({
        sourceRoot: alteredRoot,
        tempBase: resolve(alteredRoot, "tmp"),
      }),
    /historical artifact (?:SHA-256|Git blob) changed/u,
  );
});

test("refuse une migration C1 historique altérée", (context) => {
  const migrationPath =
    "apps/api/prisma/migrations/20261002170022_admin_auth_session_runtime/migration.sql";
  const alteredRoot = historicalFixture(context, { alterPath: migrationPath });
  assert.throws(
    () =>
      materializeHistoricalPrismaWorkspace({
        sourceRoot: alteredRoot,
        tempBase: resolve(alteredRoot, "tmp"),
      }),
    /historical artifact (?:SHA-256|Git blob) changed/u,
  );
});

test("accepte Vite hors projection et protège Prisma avec fast-uri 3.1.9", () => {
  const packageLock = JSON.parse(
    readFileSync(resolve(repositoryRoot, "package-lock.json"), "utf8"),
  );
  const qualified = validateQualifiedPrismaToolchainLock(
    JSON.stringify(packageLock),
  );
  assert.deepEqual(qualified, {
    packageCount: 131,
    prismaVersion: "7.9.1",
    projectionSha256:
      "de77c4baf2d28b84ca0f76500c0afc3f1fbdfe7147f5a47aba9707815388a964",
  });
  assert.deepEqual(packageLock.packages["node_modules/fast-uri"], {
    devOptional: true,
    funding: [
      {
        type: "github",
        url: "https://github.com/sponsors/fastify",
      },
      {
        type: "opencollective",
        url: "https://opencollective.com/fastify",
      },
    ],
    integrity:
      "sha512-hS/0Wt3Ya043oKXs0sIxrMpKQITXhMLIrVAKKXi4gozGC9v7YRWVnXIZzjNPTO02M9BdxLCWqK1yRXgNziVyJQ==",
    license: "BSD-3-Clause",
    resolved: "https://registry.npmjs.org/fast-uri/-/fast-uri-3.1.9.tgz",
    version: "3.1.9",
  });

  const viteOnly = structuredClone(packageLock);
  viteOnly.packages[""].devDependencies.vite = "99.0.0-test";
  viteOnly.packages["node_modules/vite"].version = "99.0.0-test";
  assert.deepEqual(
    validateQualifiedPrismaToolchainLock(JSON.stringify(viteOnly)),
    qualified,
  );

  const prismaDrift = structuredClone(packageLock);
  prismaDrift.packages["node_modules/prisma"].version = "7.9.2-test";
  assert.throws(
    () => validateQualifiedPrismaToolchainLock(JSON.stringify(prismaDrift)),
    /protected Prisma toolchain projection changed/u,
  );

  for (const [field, value] of [
    ["version", "3.1.8"],
    ["integrity", "sha512-unqualified-fast-uri-fixture"],
  ]) {
    const fastUriDrift = structuredClone(packageLock);
    fastUriDrift.packages["node_modules/fast-uri"][field] = value;
    assert.throws(
      () => validateQualifiedPrismaToolchainLock(JSON.stringify(fastUriDrift)),
      /protected Prisma toolchain projection changed/u,
    );
  }
});

test("refuse une mutation du lockfile pendant la validation", (context) => {
  const root = mkdtempSync(resolve(tmpdir(), "kora-c1-toolchain-fixture-"));
  context.after(() => rmSync(root, { force: true, recursive: true }));
  const packageLockPath = resolve(root, "package-lock.json");
  const prismaPackagePath = resolve(
    root,
    "node_modules",
    "prisma",
    "package.json",
  );
  mkdirSync(dirname(prismaPackagePath), { recursive: true });
  writeFileSync(
    packageLockPath,
    readFileSync(resolve(repositoryRoot, "package-lock.json")),
    { flag: "wx" },
  );
  writeFileSync(prismaPackagePath, '{"version":"7.9.1"}\n', {
    encoding: "utf8",
    flag: "wx",
  });
  const state = captureQualifiedPrismaToolchainState({
    packageLockPath,
    prismaPackagePath,
  });
  const changed = JSON.parse(readFileSync(packageLockPath, "utf8"));
  changed.packages[""].devDependencies.vite = "99.0.0-during-validation";
  writeFileSync(packageLockPath, `${JSON.stringify(changed, null, 2)}\n`, {
    encoding: "utf8",
  });
  assert.throws(
    () => assertQualifiedPrismaToolchainStateUnchanged(state),
    /package-lock.json changed during validation/u,
  );
});

const foundationsHistoricalMigrations = [
  "20260914000000_canonical_postgresql_baseline",
  "20260914000100_canonical_sql_constraints",
  "20261002170022_admin_auth_session_runtime",
  "admin_security_c2a_runtime",
];

const exactC2bMigrations = [
  "20260914000000_canonical_postgresql_baseline",
  "20260914000100_canonical_sql_constraints",
  "20261002170022_admin_auth_session_runtime",
  "admin_security_c2a_runtime",
  "admin_security_c2b_audit_export_runtime",
];

test("verrouille sans filtrage la chaîne courante C2b de cinq migrations", () => {
  assert.deepEqual(
    validateExactC2bMigrationNames(exactC2bMigrations),
    exactC2bMigrations,
  );
  for (const candidate of [
    exactC2bMigrations.slice(0, -1),
    [...exactC2bMigrations, "unexpected_runtime"],
    exactC2bMigrations.map((name, index) =>
      index === 3 ? "substituted_c2a" : name,
    ),
    [
      exactC2bMigrations[1],
      exactC2bMigrations[0],
      ...exactC2bMigrations.slice(2),
    ],
  ]) {
    assert.throws(
      () => validateExactC2bMigrationNames(candidate),
      /current C2b migration chain differs/u,
    );
  }
});

function foundationsToolchainFixture(context) {
  const root = mkdtempSync(
    resolve(tmpdir(), "kora-c2a-foundations-toolchain-fixture-"),
  );
  context.after(() => rmSync(root, { force: true, recursive: true }));
  const packageLockPath = resolve(root, "package-lock.json");
  const migrationsRoot = resolve(root, "migrations");
  const manifestPaths = {
    pgManifestPath: resolve(root, "node_modules", "pg", "package.json"),
    prismaManifestPath: resolve(root, "node_modules", "prisma", "package.json"),
    vitestManifestPath: resolve(root, "node_modules", "vitest", "package.json"),
  };
  writeFileSync(
    packageLockPath,
    readFileSync(resolve(repositoryRoot, "package-lock.json")),
    { flag: "wx" },
  );
  for (const [name, path, version] of [
    ["pg", manifestPaths.pgManifestPath, "8.22.0"],
    ["prisma", manifestPaths.prismaManifestPath, "7.9.1"],
    ["vitest", manifestPaths.vitestManifestPath, "4.1.12"],
  ]) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ name, version })}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
  }
  for (const migration of foundationsHistoricalMigrations) {
    const destination = resolve(migrationsRoot, migration, "migration.sql");
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(
      destination,
      readFileSync(
        resolve(
          repositoryRoot,
          "apps",
          "api",
          "prisma",
          "migrations",
          migration,
          "migration.sql",
        ),
      ),
      { flag: "wx" },
    );
  }
  return { migrationsRoot, packageLockPath, ...manifestPaths };
}

test("qualifie Foundations avec Vite 8.1.6 sans protéger Vite globalement", () => {
  const packageLock = JSON.parse(
    readFileSync(resolve(repositoryRoot, "package-lock.json"), "utf8"),
  );
  const qualified = validateQualifiedFoundationsToolchainLock(
    JSON.stringify(packageLock),
  );
  assert.equal(qualified.prisma.prismaVersion, "7.9.1");
  assert.equal(qualified.prisma.packageCount, 131);
  assert.equal(qualified.pg.version, "8.22.0");
  assert.equal(qualified.pg.packageCount, 14);
  assert.equal(
    qualified.pg.projectionSha256,
    "27d546111f7b0947315339dd6bc6f1d852398ed00d8ab0b2b5fa15166f1b7b26",
  );
  assert.equal(qualified.vitest.version, "4.1.12");
  assert.equal(packageLock.packages["node_modules/vite"].version, "8.1.6");

  const independentViteUpdate = structuredClone(packageLock);
  independentViteUpdate.packages[""].devDependencies.vite = "8.1.7-test";
  independentViteUpdate.packages["apps/api"].devDependencies.vite =
    "8.1.7-test";
  independentViteUpdate.packages["apps/admin"].devDependencies.vite =
    "8.1.7-test";
  independentViteUpdate.packages["node_modules/vite"].version = "8.1.7-test";
  independentViteUpdate.packages["node_modules/vite"].integrity =
    "sha512-independent-vite-fixture";
  assert.deepEqual(
    validateQualifiedFoundationsToolchainLock(
      JSON.stringify(independentViteUpdate),
    ),
    qualified,
  );
});

test("refuse une dérive Prisma protégée dans Foundations", () => {
  const packageLock = JSON.parse(
    readFileSync(resolve(repositoryRoot, "package-lock.json"), "utf8"),
  );
  packageLock.packages["node_modules/prisma"].version = "7.9.2-test";
  assert.throws(
    () =>
      validateQualifiedFoundationsToolchainLock(JSON.stringify(packageLock)),
    /protected Prisma toolchain rejected/u,
  );
});

test("refuse une dérive pg protégée dans Foundations", () => {
  const packageLock = JSON.parse(
    readFileSync(resolve(repositoryRoot, "package-lock.json"), "utf8"),
  );
  packageLock.packages["node_modules/pg"].integrity = "sha512-pg-drift-fixture";
  assert.throws(
    () =>
      validateQualifiedFoundationsToolchainLock(JSON.stringify(packageLock)),
    /protected pg toolchain projection changed/u,
  );
});

test("refuse une migration historique Foundations altérée", (context) => {
  const fixture = foundationsToolchainFixture(context);
  const state = captureQualifiedFoundationsToolchainState({
    emit: false,
    ...fixture,
  });
  const migrationPath = resolve(
    fixture.migrationsRoot,
    foundationsHistoricalMigrations[2],
    "migration.sql",
  );
  const changed = readFileSync(migrationPath);
  changed[0] ^= 1;
  writeFileSync(migrationPath, changed);
  assert.throws(
    () => assertQualifiedFoundationsToolchainStateUnchanged(state),
    /historical migration changed/u,
  );
});

test("refuse une mutation de la migration C2a historique autonome", (context) => {
  const fixture = foundationsToolchainFixture(context);
  const state = captureQualifiedFoundationsToolchainState({
    emit: false,
    ...fixture,
  });
  const migrationPath = resolve(
    fixture.migrationsRoot,
    "admin_security_c2a_runtime",
    "migration.sql",
  );
  const changed = readFileSync(migrationPath);
  changed[changed.length - 1] ^= 1;
  writeFileSync(migrationPath, changed);
  assert.throws(
    () => assertQualifiedFoundationsToolchainStateUnchanged(state),
    /historical C2a migration changed/u,
  );
});

test("refuse une mutation du lock Foundations même après un échec de campagne", async (context) => {
  const fixture = foundationsToolchainFixture(context);
  const campaignError = new Error("expected campaign failure");
  await assert.rejects(
    runWithProtectedFoundationsInputs(
      async () => {
        const changed = JSON.parse(
          readFileSync(fixture.packageLockPath, "utf8"),
        );
        changed.packages["node_modules/vite"].version =
          "8.1.7-during-failed-campaign";
        writeFileSync(
          fixture.packageLockPath,
          `${JSON.stringify(changed, null, 2)}\n`,
          { encoding: "utf8" },
        );
        throw campaignError;
      },
      { emit: false, ...fixture },
    ),
    (error) => {
      assert(error instanceof AggregateError);
      assert.equal(error.cause, campaignError);
      assert.equal(error.errors[0], campaignError);
      assert.match(
        error.errors[1].message,
        /package-lock.json changed during validation/u,
      );
      return true;
    },
  );
});

test("refuse traversal, mauvais OID et inventaire historique supplémentaire", (context) => {
  const schema = historicalArtifactManifest().find(
    ({ sourcePath }) =>
      sourcePath === "apps/api/prisma/history/s1-2-03c1/schema.prisma",
  );
  assert(schema);
  const bytes = readFileSync(resolve(repositoryRoot, schema.sourcePath));
  assert.throws(
    () =>
      validateHistoricalArtifactBuffer(
        { ...schema, targetPath: "../schema.prisma" },
        bytes,
      ),
    /not a safe relative path/u,
  );
  assert.throws(
    () =>
      validateHistoricalArtifactBuffer(
        { ...schema, gitOid: "0".repeat(40) },
        bytes,
      ),
    /Git blob changed/u,
  );

  const sourceRoot = historicalFixture(context);
  const workspace = materializeHistoricalPrismaWorkspace({
    sourceRoot,
    tempBase: resolve(sourceRoot, "tmp"),
  });
  const injectedMigration = resolve(
    workspace.migrationsDirectory,
    "admin_security_c2a_runtime",
    "migration.sql",
  );
  mkdirSync(dirname(injectedMigration));
  writeFileSync(injectedMigration, "-- forbidden C2a migration\n", {
    flag: "wx",
  });
  assert.throws(
    () => cleanupHistoricalPrismaWorkspace(workspace),
    /inventory changed or contains an unexpected artifact/u,
  );
});

test("materialise puis nettoie sans modifier les sources Prisma courantes", () => {
  const before = historicalArtifactManifest().map(({ sourcePath }) => ({
    bytes: readFileSync(resolve(repositoryRoot, sourcePath)),
    sourcePath,
  }));
  const workspace = materializeHistoricalPrismaWorkspace();
  assert.equal(workspace.tempBaseCreated, true);
  cleanupHistoricalPrismaWorkspace(workspace);
  assert.equal(existsSync(workspace.tempBase), false);
  for (const entry of before) {
    assert.deepEqual(
      readFileSync(resolve(repositoryRoot, entry.sourcePath)),
      entry.bytes,
    );
  }
});

test("préserve une base temporaire préexistante et vide", (context) => {
  const sourceRoot = historicalFixture(context);
  const tempBase = resolve(sourceRoot, "tmp");
  mkdirSync(tempBase);
  const workspace = materializeHistoricalPrismaWorkspace({
    sourceRoot,
    tempBase,
  });
  assert.equal(workspace.tempBaseCreated, false);
  cleanupHistoricalPrismaWorkspace(workspace);
  assert.equal(existsSync(tempBase), true);
  assert.deepEqual(readdirSync(tempBase), []);
});

test("refuse sans supprimer un artefact historique substitué à octets identiques", (context) => {
  const sourceRoot = historicalFixture(context);
  const workspace = materializeHistoricalPrismaWorkspace({
    sourceRoot,
    tempBase: resolve(sourceRoot, "tmp"),
  });
  const bytes = readFileSync(workspace.schemaPath);
  unlinkSync(workspace.schemaPath);
  writeFileSync(workspace.schemaPath, bytes, { flag: "wx" });
  assert.throws(
    () => cleanupHistoricalPrismaWorkspace(workspace),
    /historical workspace artifact was substituted/u,
  );
  assert.equal(existsSync(workspace.schemaPath), true);
  assert.deepEqual(readFileSync(workspace.schemaPath), bytes);
});

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

for (const wrapper of [
  "apps/api/prisma/run-admin-security-c2a-runtime-validation.ps1",
  "apps/api/prisma/run-admin-security-c2a-business-validation.ps1",
]) {
  test(`qualifie l'identité Docker et le cleanup sémantiques de ${wrapper}`, () => {
    const result = runPowerShellImageFixture(
      resolve(repositoryRoot, ...wrapper.split("/")),
      imageIdentityFixtureBody(),
    );
    assert.equal(
      result.status,
      0,
      `PowerShell fixture failed for ${wrapper}:\n${result.stdout}\n${result.stderr}`,
    );
  });
}

test("exécute le cleanup workflow avant, pendant et après préparation", (context) => {
  const notStarted = workflowCleanupFixture(context, {
    phase: "not_started",
  });
  assert.equal(
    notStarted.result.status,
    0,
    `${notStarted.result.stdout}\n${notStarted.result.stderr}`,
  );
  assert.equal(existsSync(notStarted.npmRecord), false);

  const partial = workflowCleanupFixture(context, {
    phase: "prepare_started",
  });
  assert.equal(
    partial.result.status,
    0,
    `${partial.result.stdout}\n${partial.result.stderr}`,
  );
  assert.equal(existsSync(partial.instanceRoot), false);
  assert.equal(existsSync(partial.npmRecord), false);

  for (const phase of ["prepared", "up_started", "running"]) {
    const normal = workflowCleanupFixture(context, { phase });
    assert.equal(
      normal.result.status,
      0,
      `${phase}:\n${normal.result.stdout}\n${normal.result.stderr}`,
    );
    assert.deepEqual(JSON.parse(readFileSync(normal.npmRecord, "utf8")), [
      "run",
      "infra:down",
    ]);
    assert.equal(existsSync(normal.instanceRoot), false);
  }
});

test("valide la syntaxe des quatre scripts PowerShell du workflow", () => {
  for (const stepName of [
    "Initialize infrastructure cleanup state",
    "Prepare and validate Compose",
    "Start and verify lifecycle",
    "Stop local infrastructure",
  ]) {
    const result = powerShellParseResult(workflowRunStep(stepName));
    assert.equal(
      result.status,
      0,
      `${stepName}:\n${result.stdout}\n${result.stderr}`,
    );
  }
});

test("raccorde C1, C2a et C2b avant le lifecycle avec des instances dédiées", () => {
  const orderedSteps = [
    "Validate Admin Auth Session PostgreSQL runtime",
    "Validate C2a PostgreSQL foundations",
    "Validate C2a business runtime",
    "Prepare and validate Compose",
    "Validate C2b PostgreSQL foundations",
    "Validate C2b business runtime",
    "Start and verify lifecycle",
    "Build and verify API health transitions",
  ].map(workflowStepBlock);

  for (let index = 1; index < orderedSteps.length; index += 1) {
    assert.ok(
      orderedSteps[index - 1].index < orderedSteps[index].index,
      "the Infrastructure validation chain is out of order",
    );
  }

  const runtime = orderedSteps[4].text;
  const business = orderedSteps[5].text;
  assert.match(
    runtime,
    /KORA_C2B_INSTANCE: "c2b-ci-runtime-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}"/u,
  );
  assert.match(
    runtime,
    /run: \.\/apps\/api\/prisma\/run-admin-security-c2b-runtime-validation\.ps1/u,
  );
  assert.match(
    business,
    /KORA_C2B_INSTANCE: "c2b-ci-business-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}"/u,
  );
  assert.match(
    business,
    /run: \.\/apps\/api\/prisma\/run-admin-security-c2b-business-validation\.ps1/u,
  );
  for (const block of [runtime, business]) {
    assert.match(block, /shell: pwsh/u);
    assert.doesNotMatch(
      block,
      /continue-on-error|retry|KORA_C2B_INSTANCE:\s*"?local/u,
    );
  }
});

test("résout les exécutables C2b sans suffixe Windows imposé", () => {
  for (const wrapper of [
    "apps/api/prisma/run-admin-security-c2b-runtime-validation.ps1",
    "apps/api/prisma/run-admin-security-c2b-business-validation.ps1",
  ]) {
    const source = readFileSync(
      resolve(repositoryRoot, ...wrapper.split("/")),
      "utf8",
    );
    assert.match(
      source,
      /Get-Command docker -CommandType Application -ErrorAction Stop/u,
    );
    assert.match(
      source,
      /Get-Command node -CommandType Application -ErrorAction Stop/u,
    );
    assert.doesNotMatch(source, /docker\.exe|node\.exe|npm\.cmd/u);
  }
  const business = readFileSync(
    resolve(
      repositoryRoot,
      "apps",
      "api",
      "prisma",
      "run-admin-security-c2b-business-validation.ps1",
    ),
    "utf8",
  );
  assert.match(
    business,
    /Get-Command npm -CommandType Application -ErrorAction Stop/u,
  );
});

test("raccorde le lifecycle a l'identite de projet ephemere resolue", (context) => {
  const { expectedProjectName, result } =
    lifecycleProjectIdentityFixture(context);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const events = result.stdout
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
  const resets = events.filter(({ event }) => event === "resetProject");
  assert.deepEqual(resets, [
    { event: "resetProject", value: expectedProjectName },
  ]);
});

test("refuse une confirmation d'une autre instance avant Docker", (context) => {
  const result = rejectedCrossInstanceResetFixture(context);
  assert.equal(result.status, 23, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stdout, "");
  assert.match(
    result.stderr,
    /Reset refused\. Use --confirm=kora-plus-r9-lifecycle-fixture\./u,
  );
  assert.doesNotMatch(result.stderr, /Docker command failed|ENOENT|spawn/u);
});

test("échoue fermé sur état, substitution ou down non concluant", (context) => {
  const missingState = workflowCleanupFixture(context, { phase: null });
  assert.notEqual(missingState.result.status, 0);

  const substituted = workflowCleanupFixture(context, {
    mutation: "content",
    phase: "prepare_started",
  });
  assert.notEqual(substituted.result.status, 0);
  assert.equal(
    existsSync(resolve(substituted.instanceRoot, "compose.env")),
    true,
  );

  const byteIdenticalSubstitution = workflowCleanupFixture(context, {
    mutation: "same-bytes-replacement",
    phase: "prepare_started",
  });
  assert.notEqual(byteIdenticalSubstitution.result.status, 0);
  assert.equal(
    existsSync(resolve(byteIdenticalSubstitution.instanceRoot, "compose.env")),
    true,
  );

  const replacedManifest = workflowCleanupFixture(context, {
    mutation: "manifest-same-bytes-replacement",
    phase: "prepare_started",
  });
  assert.notEqual(replacedManifest.result.status, 0);
  assert.equal(existsSync(replacedManifest.ownershipPath), true);

  const reducedManifest = workflowCleanupFixture(context, {
    mutation: "manifest-reduced",
    phase: "prepared",
  });
  assert.notEqual(reducedManifest.result.status, 0);
  assert.equal(existsSync(reducedManifest.instanceRoot), true);

  const failedDown = workflowCleanupFixture(context, {
    npmExit: 23,
    phase: "running",
  });
  assert.notEqual(failedDown.result.status, 0);
  assert.deepEqual(JSON.parse(readFileSync(failedDown.npmRecord, "utf8")), [
    "run",
    "infra:down",
  ]);
  assert.equal(existsSync(failedDown.instanceRoot), false);
});
