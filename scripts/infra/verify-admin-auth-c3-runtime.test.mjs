import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const compose = read("infra/c3/compose.yaml");
const harness = read("apps/api/test/admin-auth-c3-browser.harness.ts");
const runner = read("scripts/infra/run-admin-auth-c3-runtime-validation.ps1");
const playwright = read("apps/admin/playwright.config.ts");
const specification = read("apps/admin/e2e/admin-auth.c3.spec.ts");
const fixtures = read("apps/admin/e2e/admin-auth.fixtures.ts");
const adminAuthProxy = read("apps/admin/lib/auth/admin-auth-proxy.ts");
const authLayout = read("apps/admin/app/(auth)/layout.tsx");
const errorPage = read("apps/admin/app/error.tsx");
const layout = read("apps/admin/app/layout.tsx");
const loadingPage = read("apps/admin/app/loading.tsx");
const notFoundPage = read("apps/admin/app/not-found.tsx");
const nginx = read("infra/c3/nginx.conf");
const infrastructureWorkflow = read(".github/workflows/infrastructure.yml");

function invokeInventoryComparison(fixture) {
  const beginMarker = "# BEGIN C3 INVENTORY COMPARISON FUNCTIONS";
  const endMarker = "# END C3 INVENTORY COMPARISON FUNCTIONS";
  const begin = runner.indexOf(beginMarker);
  const end = runner.indexOf(endMarker);
  assert.ok(
    begin >= 0 && end > begin,
    "inventory comparison functions are extractable",
  );
  const functions = runner.slice(begin + beginMarker.length, end);
  const encodedFixture = Buffer.from(JSON.stringify(fixture), "utf8").toString(
    "base64",
  );
  const script = `${functions}
$fixtureJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedFixture}'))
$fixture = $fixtureJson | ConvertFrom-Json
$before = @{}
$after = @{}
foreach ($property in $fixture.before.PSObject.Properties) { $before[$property.Name] = [string]$property.Value }
foreach ($property in $fixture.after.PSObject.Properties) { $after[$property.Name] = [string]$property.Value }
$qualified = @($fixture.qualified | ForEach-Object { [string]$_ })
Compare-CanonicalDockerInventories $before $after $qualified | ConvertTo-Json -Compress -Depth 8
`;
  const encodedScript = Buffer.from(script, "utf16le").toString("base64");
  const executable = process.platform === "win32" ? "powershell.exe" : "pwsh";
  const result = spawnSync(
    executable,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      encodedScript,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const output = result.stdout.trim().split(/\r?\n/u).at(-1);
  assert.ok(output);
  return JSON.parse(output);
}

function invokeBrowserTestArguments(projectSet) {
  const beginMarker = "# BEGIN C3 BROWSER TEST ARGUMENT FUNCTIONS";
  const endMarker = "# END C3 BROWSER TEST ARGUMENT FUNCTIONS";
  const begin = runner.indexOf(beginMarker);
  const end = runner.indexOf(endMarker);
  assert.ok(
    begin >= 0 && end > begin,
    "browser argument function is extractable",
  );
  const functions = runner.slice(begin + beginMarker.length, end);
  const encodedProjectSet = Buffer.from(projectSet, "utf8").toString("base64");
  const script = `${functions}
$projectSet = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedProjectSet}'))
$arguments = @(Resolve-C3BrowserTestArguments $projectSet)
ConvertTo-Json -InputObject ([object[]]$arguments) -Compress
`;
  const encodedScript = Buffer.from(script, "utf16le").toString("base64");
  const executable = process.platform === "win32" ? "powershell.exe" : "pwsh";
  const result = spawnSync(
    executable,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      encodedScript,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.error, undefined);
  return result;
}

function invokeFirefoxHiddenInventoryGuard(directory) {
  const beginMarker = "# BEGIN C3 QUALIFIED FIREFOX CACHE FUNCTIONS";
  const endMarker = "# END C3 QUALIFIED FIREFOX CACHE FUNCTIONS";
  const begin = runner.indexOf(beginMarker);
  const end = runner.indexOf(endMarker);
  assert.ok(
    begin >= 0 && end > begin,
    "Firefox cache functions are extractable",
  );
  const functions = runner.slice(begin + beginMarker.length, end);
  const encodedDirectory = Buffer.from(directory, "utf8").toString("base64");
  const script = `$Utf8 = [Text.UTF8Encoding]::new($false)
${functions}
$directory = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedDirectory}'))
$before = Get-C3FirefoxBrowserInventory $directory
Assert-C3FirefoxBrowserInventory $before $before.Count $before.Sha256
$hiddenPath = Join-Path $directory '.hidden-extra'
[IO.File]::WriteAllText($hiddenPath, 'hidden inventory fixture', $Utf8)
if ($PSVersionTable.PSEdition -eq 'Desktop' -or $PSVersionTable.Platform -eq 'Win32NT') {
  [IO.File]::SetAttributes($hiddenPath, [IO.FileAttributes]::Hidden)
}
$after = Get-C3FirefoxBrowserInventory $directory
$rejected = $false
try {
  Assert-C3FirefoxBrowserInventory $after $before.Count $before.Sha256
} catch {
  if ($_.Exception.Message -ne 'The qualified Firefox browser inventory diverged.') { throw }
  $rejected = $true
}
[pscustomobject]@{
  BeforeCount = $before.Count
  AfterCount = $after.Count
  AfterText = $after.Text
  Rejected = $rejected
} | ConvertTo-Json -Compress
`;
  const encodedScript = Buffer.from(script, "utf16le").toString("base64");
  const executable = process.platform === "win32" ? "pwsh.exe" : "pwsh";
  const result = spawnSync(
    executable,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      encodedScript,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const output = result.stdout.trim().split(/\r?\n/u).at(-1);
  assert.ok(output);
  return JSON.parse(output);
}

test("the browser project set resolves only the three exact supported invocations", () => {
  const complete = invokeBrowserTestArguments("Complete");
  assert.equal(complete.status, 0, `${complete.stdout}\n${complete.stderr}`);
  assert.deepEqual(JSON.parse(complete.stdout.trim().split(/\r?\n/u).at(-1)), [
    "run",
    "test:e2e",
    "--workspace",
    "@kora-plus/admin",
  ]);

  const chromiumWebKit = invokeBrowserTestArguments("ChromiumWebKit");
  assert.equal(
    chromiumWebKit.status,
    0,
    `${chromiumWebKit.stdout}\n${chromiumWebKit.stderr}`,
  );
  assert.deepEqual(
    JSON.parse(chromiumWebKit.stdout.trim().split(/\r?\n/u).at(-1)),
    [
      "run",
      "test:e2e",
      "--workspace",
      "@kora-plus/admin",
      "--",
      "--project",
      "chromium-c3",
      "webkit-public-smoke",
    ],
  );

  const firefox = invokeBrowserTestArguments("Firefox");
  assert.equal(firefox.status, 0, `${firefox.stdout}\n${firefox.stderr}`);
  assert.deepEqual(JSON.parse(firefox.stdout.trim().split(/\r?\n/u).at(-1)), [
    "run",
    "test:e2e",
    "--workspace",
    "@kora-plus/admin",
    "--",
    "--project",
    "firefox-public-smoke",
  ]);

  for (const rejected of [
    "*",
    "chromium-c3",
    "firefox-public-smoke",
    "",
    "complete",
  ]) {
    const result = invokeBrowserTestArguments(rejected);
    assert.notEqual(result.status, 0, rejected);
  }
});

test("the closed browser scope is resolved before mutation and affects only the main campaign", () => {
  assert.match(
    runner,
    /\[ValidateSet\('Complete', 'ChromiumWebKit', 'Firefox', IgnoreCase = \$false\)\][\s\S]+?\[string\]\$BrowserProjectSet = 'Complete'/u,
  );
  const resolution = runner.indexOf(
    "$BrowserTestArguments = Resolve-C3BrowserTestArguments $BrowserProjectSet",
  );
  const evidenceCreation = runner.indexOf(
    "New-Item -ItemType Directory -Path $EvidenceDirectory",
  );
  const firstDockerMutation = runner.indexOf("'compose-build-workspace'");
  assert.ok(
    resolution >= 0 &&
      evidenceCreation > resolution &&
      firstDockerMutation > evidenceCreation,
  );

  const mainCampaign = runner.match(
    /\$browser = Invoke-Captured[\s\S]+?if \(\$browser\.PreWriteRedactionsApplied/u,
  )?.[0];
  const redactionCampaign = runner.match(
    /\$redactionProbe = Invoke-Captured[\s\S]+?try \{/u,
  )?.[0];
  const visualCampaign = runner.match(
    /\$visual = Invoke-Captured[\s\S]+?if \(\$visual\.ExitCode/u,
  )?.[0];
  assert.ok(mainCampaign && redactionCampaign && visualCampaign);
  assert.match(mainCampaign, /-Arguments \$BrowserTestArguments/u);
  assert.doesNotMatch(redactionCampaign, /\$BrowserTestArguments/u);
  assert.doesNotMatch(visualCampaign, /\$BrowserTestArguments/u);
  assert.equal([...runner.matchAll(/\$BrowserTestArguments/gu)].length, 2);
  assert.doesNotMatch(infrastructureWorkflow, /BrowserProjectSet/u);

  assert.match(playwright, /name: 'chromium-c3'/u);
  assert.match(playwright, /name: 'webkit-public-smoke'/u);
  assert.equal(
    [...specification.matchAll(/test\('@public-smoke /gu)].length,
    3,
  );
  const functionBody = runner.slice(
    runner.indexOf("# BEGIN C3 BROWSER TEST ARGUMENT FUNCTIONS"),
    runner.indexOf("# END C3 BROWSER TEST ARGUMENT FUNCTIONS"),
  );
  assert.doesNotMatch(functionBody, /--grep|--pass-with-no-tests/u);
});

test("the browser harness consumes only built runtime modules", () => {
  assert.doesNotMatch(harness, /from ['"]\.\.\/src\//u);
  assert.doesNotMatch(harness, /admin-security-c2a-test-adapters/u);
  assert.match(
    harness,
    /BUILT_SOURCE_ROOT = '\/workspace\/apps\/api\/dist\/src'/u,
  );
  assert.match(harness, /loadBuiltModule/u);
  assert.match(
    compose,
    /apps\/api\/dist\/test\/admin-auth-c3-browser\.harness\.js/u,
  );
});

test("the private channel is mounted only into API and notification", () => {
  const mount = /KORA_C3_PRIVATE_DIR[^\n]+:\/run\/kora-c3-private/gu;
  assert.equal([...compose.matchAll(mount)].length, 2);
  assert.match(
    compose,
    /api:[\s\S]+c3_harness_capability[\s\S]+KORA_C3_PRIVATE_DIRECTORY/u,
  );
  assert.match(compose, /notification:[\s\S]+ADMIN_C2A_PROFILE: NOTIFICATION/u);
  assert.doesNotMatch(
    compose.match(/admin:[\s\S]+?\n  nginx:/u)?.[0] ?? "",
    /kora-c3-private|c3_harness_capability/u,
  );
  assert.doesNotMatch(
    compose.match(/nginx:[\s\S]+?\n  probe-a:/u)?.[0] ?? "",
    /kora-c3-private|c3_harness_capability/u,
  );
});

test("each process receives only its dedicated C2a identity", () => {
  const api = compose.match(/api:[\s\S]+?\n  notification:/u)?.[0] ?? "";
  const notification =
    compose.match(/notification:[\s\S]+?\n  bootstrap:/u)?.[0] ?? "";
  const bootstrap = compose.match(/bootstrap:[\s\S]+?\n  admin:/u)?.[0] ?? "";
  assert.match(api, /ADMIN_C2A_WRITER_DATABASE_USER: kora_admin_c2a_writer/u);
  assert.doesNotMatch(
    api,
    /NOTIFICATION_WORKER_DATABASE_USER|BOOTSTRAP_DATABASE_USER/u,
  );
  assert.match(
    notification,
    /ADMIN_C2A_NOTIFICATION_WORKER_DATABASE_USER: kora_admin_c2a_notification_worker/u,
  );
  assert.doesNotMatch(
    notification,
    /WRITER_DATABASE_USER|BOOTSTRAP_DATABASE_USER/u,
  );
  assert.match(
    bootstrap,
    /ADMIN_C2A_BOOTSTRAP_DATABASE_USER: kora_admin_c2a_bootstrap/u,
  );
  assert.match(bootstrap, /API_HOST: 127\.0\.0\.1/u);
  assert.match(bootstrap, /API_PORT: "3001"/u);
  assert.doesNotMatch(
    bootstrap,
    /WRITER_DATABASE_USER|NOTIFICATION_WORKER_DATABASE_USER/u,
  );
  assert.doesNotMatch(bootstrap, /API_TLS_|ADMIN_CLIENT_PROVENANCE_MODE/u);
});

test("the API Redis client keeps a bounded margin without widening worker deadlines", () => {
  const proxyTimeoutLiteral = adminAuthProxy.match(
    /const REQUEST_TIMEOUT_MS = ([\d_]+);/u,
  )?.[1];
  assert.ok(proxyTimeoutLiteral, "the BFF request deadline must stay explicit");
  const proxyTimeoutMs = Number(proxyTimeoutLiteral.replaceAll("_", ""));
  assert.equal(proxyTimeoutMs, 5_000);

  for (const [
    service,
    nextService,
    expectedWaitAofTimeoutMs,
    expectedClientTimeoutMs,
  ] of [
    ["api", "notification", 2_000, 3_000],
    ["notification", "bootstrap", 1_000, 1_000],
    ["bootstrap", "admin", 1_000, 1_000],
  ]) {
    const block = compose.match(
      new RegExp(
        `\\n  ${service}:\\n[\\s\\S]+?(?=\\n  ${nextService}:\\n)`,
        "u",
      ),
    )?.[0];
    assert.ok(block, `${service} service configuration must be extractable`);

    const waitAofLiteral = block.match(
      /^\s+ADMIN_REDIS_WAIT_AOF_TIMEOUT_MS: "(\d+)"$/mu,
    )?.[1];
    const clientLiteral = block.match(
      /^\s+READINESS_TIMEOUT_MS: "(\d+)"$/mu,
    )?.[1];
    assert.ok(waitAofLiteral, `${service} must configure WAITAOF explicitly`);
    assert.ok(clientLiteral, `${service} must configure its client deadline`);

    const waitAofTimeoutMs = Number(waitAofLiteral);
    const clientTimeoutMs = Number(clientLiteral);
    assert.equal(waitAofTimeoutMs, expectedWaitAofTimeoutMs);
    assert.equal(clientTimeoutMs, expectedClientTimeoutMs);
    assert.ok(clientTimeoutMs < proxyTimeoutMs);
    if (service === "api") {
      assert.ok(clientTimeoutMs > waitAofTimeoutMs);
      assert.equal(clientTimeoutMs - waitAofTimeoutMs, 1_000);
      assert.equal(proxyTimeoutMs - clientTimeoutMs, 2_000);
    } else {
      assert.equal(clientTimeoutMs, waitAofTimeoutMs);
    }
  }
});

test("the harness refuses unqualified modes and never logs channel payloads", () => {
  assert.match(harness, /Exactly one closed harness mode is required/u);
  assert.match(harness, /KORA_C3_BROWSER_HARNESS/u);
  assert.match(harness, /ADMIN_C2B_ENABLED/u);
  assert.match(harness, /timingSafeEqual/u);
  assert.match(harness, /linkSync\(temporary, target\)/u);
  assert.doesNotMatch(
    harness,
    /console\.(?:log|error)|JSON\.stringify\(command\)|JSON\.stringify\(delivery\)/u,
  );
});

test("the runner refuses local identity before Docker mutation and cleans only its project", () => {
  const identityGuard = runner.indexOf("$ProjectName -eq 'kora-plus-local'");
  const firstComposeMutation = runner.indexOf("'compose-build-workspace'");
  assert.ok(identityGuard >= 0 && firstComposeMutation > identityGuard);
  assert.match(runner, /A target campaign resource already exists/u);
  assert.match(runner, /https-port-preflight\.json/u);
  assert.match(runner, /TcpListener/u);
  assert.match(runner, /--project-name', \$ProjectName/u);
  assert.match(runner, /'down', '--volumes', '--timeout', '20'/u);
  assert.doesNotMatch(
    runner,
    /\bprune\b|reset --hard|dockerInference|--force/u,
  );
});

test("foreign inventory comparison canonicalizes label and row order without replacing raw evidence", () => {
  assert.match(runner, /function ConvertTo-CanonicalDockerInventory/u);
  assert.match(runner, /property\.Name -eq 'Labels'/u);
  assert.match(runner, /property\.Name -eq 'Mounts'/u);
  assert.match(runner, /Sort-Object -CaseSensitive/u);
  assert.match(runner, /foreign-inventory-before\.canonical\.txt/u);
  assert.match(runner, /foreign-inventory-after\.canonical\.txt/u);
  assert.match(runner, /SEMANTIC_IDENTICAL/u);
  assert.match(runner, /SEMANTIC_PRESERVED_WITH_QUALIFIED_CAMPAIGN_IMAGES/u);
  assert.match(runner, /campaign-acquired-images\.canonical\.txt/u);
  assert.match(runner, /Get-QualifiedComposeImageReferences/u);
  assert.match(runner, /\$qualified\.Count -ne 4/u);
  assert.match(runner, /qualified-campaign-image-references\.txt/u);
  assert.match(runner, /\$missingImageRows\.Count -gt 0/u);
  assert.match(runner, /\$unqualifiedImageRows\.Count -gt 0/u);
  assert.match(runner, /\$QualifiedImageReferences -cnotcontains/u);
  assert.match(runner, /inventory-before-/u);
  assert.match(runner, /inventory-after-/u);
});

test("the real inventory comparator accepts only exact qualified cold-daemon image references", () => {
  const digest = `sha256:${"a".repeat(64)}`;
  const existingDigest = `sha256:${"b".repeat(64)}`;
  const imageRow = (repository, tag, selectedDigest) =>
    JSON.stringify({
      Digest: selectedDigest,
      Repository: repository,
      Tag: tag,
    });
  const existing = imageRow("foreign", "stable", existingDigest);
  const qualified = imageRow("node", "22.18.0-bookworm-slim", digest);
  const common = {
    containers: 'containers\n{"ID":"foreign-container"}',
    networks: 'networks\n{"ID":"foreign-network"}',
    volumes: 'volumes\n{"Name":"foreign-volume"}',
  };
  const before = { ...common, images: `images\n${existing}` };
  const run = (imageRows) =>
    invokeInventoryComparison({
      after: { ...common, images: `images\n${imageRows.join("\n")}` },
      before,
      qualified: [qualified],
    });

  assert.equal(run([existing]).Status, "SEMANTIC_IDENTICAL");
  assert.equal(
    run([existing, qualified]).Status,
    "SEMANTIC_PRESERVED_WITH_QUALIFIED_CAMPAIGN_IMAGES",
  );
  assert.equal(run([qualified]).Status, "SEMANTIC_DIFFERENT");
  assert.equal(
    run([existing, imageRow("foreign", "new", `sha256:${"c".repeat(64)}`)])
      .Status,
    "SEMANTIC_DIFFERENT",
  );
  assert.equal(
    run([existing, imageRow("foreign-alias", "latest", digest)]).Status,
    "SEMANTIC_DIFFERENT",
  );
});

test("the runner resolves qualified tools and permissions on Windows and POSIX", () => {
  assert.match(
    runner,
    /if \(\$IsWindows\) \{ 'docker\.exe' \} else \{ 'docker' \}/u,
  );
  assert.match(runner, /if \(\$IsWindows\) \{ 'npm\.cmd' \} else \{ 'npm' \}/u);
  assert.match(
    runner,
    /if \(\$IsWindows\) \{ 'icacls\.exe' \} else \{ 'chmod' \}/u,
  );
  assert.match(runner, /'700'/u);
  assert.match(runner, /'u=rwX,go='/u);
  assert.match(runner, /GetUnixFileMode/u);
  assert.match(runner, /certificate-openssl-version/u);
  assert.doesNotMatch(runner, /Get-Command docker\.exe -ErrorAction/u);
  assert.doesNotMatch(runner, /Get-Command npm\.cmd -ErrorAction/u);
});

test("the campaign root is private before secret directories or Docker are touched", () => {
  const rootCreation = runner.indexOf(
    "New-Item -ItemType Directory -Path $CampaignRoot",
  );
  const rootRestriction = runner.indexOf(
    "Label 'restrict-campaign-root-permissions'",
  );
  const secretCreation = runner.indexOf(
    "foreach ($path in @($SecretDirectory, $PrivateDirectory))",
  );
  const firstDockerProbe = runner.indexOf("Invoke-Docker 'docker-version'");
  assert.ok(rootCreation >= 0);
  assert.ok(rootRestriction > rootCreation);
  assert.ok(secretCreation > rootRestriction);
  assert.ok(firstDockerProbe > secretCreation);
  assert.match(runner, /Label 'verify-campaign-permissions'/u);
  assert.match(runner, /Label 'restrict-campaign-tree-permissions'/u);
});

test("certificate metadata reads the public PEM without requiring a colocated key", () => {
  assert.match(runner, /X509Certificate2\]::CreateFromPem\(/u);
  assert.match(runner, /\[IO\.File\]::ReadAllText\(\$path\)/u);
  assert.doesNotMatch(runner, /CreateFromPemFile\(\$path\)/u);
});

test("bootstrap evidence survives a non-zero one-shot container before cleanup", () => {
  const bootstrap = runner.match(
    /\$bootstrapContainerName[\s\S]+?compose-runtime-up/u,
  )?.[0];
  assert.ok(bootstrap);
  assert.match(
    bootstrap,
    /'run', '--no-TTY', '--name', \$bootstrapContainerName/u,
  );
  assert.match(bootstrap, /compose-bootstrap-inspect/u);
  assert.match(bootstrap, /compose-bootstrap-logs/u);
  assert.match(bootstrap, /compose-bootstrap-remove/u);
  assert.match(bootstrap, /if \(\$bootstrap\.ExitCode -ne 0\)/u);
  assert.ok(
    bootstrap.indexOf("compose-bootstrap-logs") <
      bootstrap.indexOf("if ($bootstrap.ExitCode -ne 0)"),
  );
  assert.ok(
    bootstrap.indexOf("compose-bootstrap-remove") <
      bootstrap.indexOf("if ($bootstrap.ExitCode -ne 0)"),
  );
});

test("runtime readiness failure captures bounded service evidence before cleanup", () => {
  const readiness = runner.match(
    /if \(-not \$ready\)[\s\S]+?The isolated HTTPS entry did not become reachable/u,
  )?.[0];
  assert.ok(readiness);
  assert.match(readiness, /compose-runtime-timeout-ps/u);
  assert.match(readiness, /@\('api', 'notification', 'admin', 'nginx'\)/u);
  assert.match(readiness, /'logs', '--no-color', '--tail', '200'/u);
  assert.ok(
    readiness.indexOf("compose-runtime-timeout-ps") <
      readiness.indexOf("The isolated HTTPS entry did not become reachable"),
  );
});

test("browser failure captures bounded service evidence before cleanup", () => {
  const browserFailure = runner.match(
    /\$browser = Invoke-Captured[\s\S]+?Secret-bearing browser qualification failed with exit code/u,
  )?.[0];
  assert.ok(browserFailure);
  assert.match(browserFailure, /-AllowedExitCodes \(0\.\.255\)/u);
  assert.match(browserFailure, /compose-browser-failure-ps/u);
  assert.match(browserFailure, /@\('api', 'notification', 'admin', 'nginx'\)/u);
  assert.match(browserFailure, /'logs', '--no-color', '--tail', '200'/u);
  assert.ok(
    browserFailure.indexOf("compose-browser-failure-ps") <
      browserFailure.indexOf(
        "Secret-bearing browser qualification failed with exit code",
      ),
  );
  assert.ok(
    runner.indexOf("Label 'playwright-c3-visual'") <
      runner.indexOf("if ($BrowserFailures.Count -eq 1)"),
  );
});

test("foreign inventory comparison ignores only volatile relative time", () => {
  const canonicalizer = runner.match(
    /function ConvertTo-CanonicalDockerInventory[\s\S]+?function New-SecretValue/u,
  )?.[0];
  assert.ok(canonicalizer);
  assert.match(
    canonicalizer,
    /\$Label -eq 'containers' -and \$property\.Name -eq 'RunningFor'/u,
  );
  assert.match(
    canonicalizer,
    /\$Label -eq 'images' -and \$property\.Name -eq 'CreatedSince'/u,
  );
  assert.match(canonicalizer, /healthy\|unhealthy\|health: starting/u);
  assert.match(canonicalizer, /exited:\$\(\$Matches\[1\]\)/u);
  assert.match(canonicalizer, /\$canonical\[\$property\.Name\] = \$value/u);
});

test("secret and visual browser campaigns are isolated and scanned on every exit path", () => {
  assert.match(
    playwright,
    /visualFixtureMode \? required\('KORA_C3_VISUAL_OUTPUT_DIR'\)/u,
  );
  assert.match(playwright, /projects: visualFixtureMode/u);
  assert.match(runner, /Label 'playwright-c3-secret'/u);
  assert.match(runner, /Label 'playwright-c3-visual'/u);
  assert.match(runner, /KORA_C3_VISUAL_FIXTURE_MODE = '1'/u);
  assert.match(runner, /'KORA_C3_BOOTSTRAP_PASSWORD'/u);
  assert.match(runner, /'KORA_C3_CAPABILITY_PATH'/u);
  assert.match(runner, /'KORA_C3_PRIVATE_DIR'/u);
  assert.match(runner, /Invoke-EvidenceSecretScan \$SensitiveValues/u);
  assert.match(runner, /Unexpected dynamic sentinel file/u);
  assert.match(runner, /UNINSPECTABLE:/u);
  assert.match(runner, /LEAK:/u);
  assert.match(runner, /secret-scan\.result\.json/u);
  assert.ok(
    runner.indexOf("Invoke-EvidenceSecretScan $SensitiveValues") <
      runner.indexOf("Remove-Item -LiteralPath $resolvedCampaignRoot"),
  );
  assert.match(
    specification,
    /if \(!visualFixtureMode && \(bootstrapEmail\.length === 0/u,
  );
  assert.match(
    specification,
    /if \(visualFixtureMode && visualOutputDirectory\.length === 0\)/u,
  );
});

test("only nginx receives the dedicated host-entry bridge", () => {
  const nginx = compose.match(/nginx:[\s\S]+?\n  probe-a:/u)?.[0] ?? "";
  const hostEntry =
    compose.match(/\n  host-entry:\n[\s\S]+?(?=\n  mtls:)/u)?.[0] ?? "";
  assert.match(nginx, /networks: \[client, entry, host-entry\]/u);
  assert.match(hostEntry, /driver: bridge/u);
  assert.doesNotMatch(hostEntry, /internal: true/u);
  assert.equal(compose.match(/host-entry/gu)?.length, 2);
  for (const network of ["client", "data", "entry", "mtls"]) {
    assert.match(
      compose,
      new RegExp(`\\n  ${network}:\\n    internal: true`, "u"),
    );
  }
});

test("the nonce CSP remains dynamic and public smoke hosts are explicit", () => {
  assert.match(layout, /import \{ headers \} from 'next\/headers'/u);
  assert.match(layout, /export default async function RootLayout/u);
  assert.match(layout, /await headers\(\)/u);
  assert.match(nginx, /map \$host \$kora_c3_allowed_host/u);
  assert.match(nginx, /admin\.c3\.invalid 1;/u);
  assert.match(nginx, /127\.0\.0\.1 1;/u);
  assert.match(nginx, /default 0;/u);
  assert.match(nginx, /if \(\$kora_c3_allowed_host = 0\)/u);
  assert.match(
    specification,
    /expect\(response\?\.status\(\)\)\.toBe\(candidate\.status\)/u,
  );
  assert.match(specification, /heading: 'Page introuvable'.+status: 404/u);
});

test("nginx forwards exactly the qualified Next navigation headers", () => {
  assert.match(nginx, /proxy_pass_request_headers off;/u);
  const forwardedNextHeaders = [
    ...nginx.matchAll(/^\s*proxy_set_header (Next-[A-Za-z-]+|Rsc) /gmu),
  ]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(forwardedNextHeaders, [
    "Next-Hmr-Refresh",
    "Next-Router-Prefetch",
    "Next-Router-Segment-Prefetch",
    "Next-Router-State-Tree",
    "Next-Url",
    "Rsc",
  ]);
  assert.doesNotMatch(nginx, /proxy_set_header Next-Action /u);
  assert.match(specification, /resourceType\(\) === 'document'/u);
  assert.match(specification, /headers\(\)\['rsc'\] === '1'/u);
  assert.match(specification, /text\/x-component/u);
  assert.match(specification, /__koraC3NavigationMarker/u);
});

test("the C3 global-state probe traverses nginx and exercises real Next boundaries", () => {
  const admin = compose.match(/admin:[\s\S]+?\n  nginx:/u)?.[0] ?? "";
  assert.equal(compose.match(/KORA_C3_GLOBAL_STATE_PROBE: "1"/gu)?.length, 1);
  assert.match(admin, /KORA_C3_GLOBAL_STATE_PROBE: "1"/u);
  assert.equal(
    nginx.match(
      /proxy_set_header X-Kora-C3-Global-State-Probe \$http_x_kora_c3_global_state_probe;/gu,
    )?.length,
    1,
  );
  assert.match(nginx, /proxy_pass_request_headers off;/u);
  assert.doesNotMatch(adminAuthProxy, /x-kora-c3-global-state-probe/iu);
  assert.match(
    authLayout,
    /const GLOBAL_STATE_PROBE_HEADER = 'x-kora-c3-global-state-probe'/u,
  );
  assert.match(authLayout, /const GLOBAL_STATE_LOADING_DELAY_MS = 5_000/u);
  assert.match(
    authLayout,
    /async function C3GlobalStateProbe\(\{ children \}: Readonly<\{ children: ReactNode \}>\)/u,
  );
  assert.match(
    authLayout,
    /const probe = \(await headers\(\)\)\.get\(GLOBAL_STATE_PROBE_HEADER\);/u,
  );
  assert.match(
    authLayout,
    /if \(probe === 'loading'\)[\s\S]+?setTimeout[\s\S]+?notFound\(\);/u,
  );
  assert.match(
    authLayout,
    /if \(probe === 'not-found'\)[\s\S]+?notFound\(\);/u,
  );
  assert.match(
    authLayout,
    /if \(probe === 'error'\)[\s\S]+?throw new Error\('C3 global error boundary probe\.'\)/u,
  );
  assert.match(authLayout, /return children;/u);
  assert.match(
    authLayout,
    /process\.env\.KORA_C3_GLOBAL_STATE_PROBE === '1'[\s\S]+?<C3GlobalStateProbe>\{publicSessionBoundary\}<\/C3GlobalStateProbe>[\s\S]+?publicSessionBoundary/u,
  );
  assert.ok(
    authLayout.indexOf(
      "<C3GlobalStateProbe>{publicSessionBoundary}</C3GlobalStateProbe>",
    ) < authLayout.indexOf("publicSessionBoundary\n        )}"),
    "the probe wraps the public session boundary instead of mounting it first",
  );
  assert.doesNotMatch(authLayout, /NEXT_PUBLIC_KORA_C3_GLOBAL_STATE_PROBE/u);
  assert.doesNotMatch(
    notFoundPage,
    /KORA_C3_GLOBAL_STATE_PROBE|x-kora-c3-global-state-probe|headers\(\)|C3GlobalStateProbe/u,
  );
  for (const source of [loadingPage, errorPage, notFoundPage]) {
    assert.doesNotMatch(
      source,
      /useAdminSession|Tableau de bord|admin-sidebar/u,
    );
  }
  assert.match(
    loadingPage,
    /aria-busy="true"[\s\S]+?aria-live="polite"[\s\S]+?role="status"/u,
  );
  assert.match(errorPage, /aria-live="assertive"[\s\S]+?role="alert"/u);
  assert.match(errorPage, /retry: \(\) => void/u);
  assert.match(errorPage, /function ErrorPage\(\{ error, retry \}/u);
  assert.match(errorPage, /onClick=\{retry\}/u);
  assert.doesNotMatch(errorPage, /\breset\b/u);

  const scenarioStart = specification.indexOf(
    "test('representative public states have no axe violation at three viewports'",
  );
  const scenarioEnd = specification.indexOf("\n  });\n});", scenarioStart);
  assert.ok(
    scenarioStart >= 0 && scenarioEnd > scenarioStart,
    "the real global-state scenario is bounded by its title and suite terminator",
  );
  const scenario = specification.slice(scenarioStart, scenarioEnd);
  assert.equal(
    scenario.split("page.on('request', observeGlobalStateAuthRequest);")
      .length - 1,
    1,
  );
  assert.equal(
    scenario.split("page.off('request', observeGlobalStateAuthRequest);")
      .length - 1,
    1,
  );
  assert.match(
    scenario,
    /const observeGlobalStateAuthRequest = \(request: Request\): void => \{[\s\S]+?new URL\(request\.url\(\)\)\.pathname\.startsWith\('\/api\/v1\/admin\/auth\/'\)[\s\S]+?globalStateAuthRequests \+= 1;/u,
  );
  assert.doesNotMatch(
    scenario,
    /page\.setContent|route\.fulfill|data:text\/html|document\.write|innerHTML/iu,
  );
  assert.equal(
    specification.split(
      "async function expectEffectiveNoIndex(page: Page): Promise<void>",
    ).length - 1,
    1,
  );
  assert.match(
    specification,
    /const robotsPolicies = await page\.locator\('meta\[name="robots"\]'\)\.evaluateAll\(\(elements\) =>[\s\S]+?element\.getAttribute\('content'\)[\s\S]+?\.split\(\/\[\\s,\]\+\/u\)[\s\S]+?directive\.toLowerCase\(\)[\s\S]+?expect\(robotsPolicies\.length\)\.toBeGreaterThan\(0\);[\s\S]+?expect\(robotsPolicies\.every\(\(directives\) => directives\.includes\('noindex'\)\)\)\.toBe\(true\);[\s\S]+?expect\(robotsPolicies\.flat\(\)\)\.not\.toContain\('index'\);/u,
  );
  assert.doesNotMatch(
    specification,
    /page\.locator\('meta\[name="robots"\]'\)\.(?:first|nth)\(/u,
  );
  assert.equal(
    scenario.split('body meta[name="robots"][content="noindex"]').length - 1,
    1,
  );
  assert.equal(
    scenario.split("await expectEffectiveNoIndex(page);").length - 1,
    1,
  );
  assert.doesNotMatch(
    scenario,
    /body meta\[name="robots"\]\[content="noindex"\][\s\S]{0,80}\.(?:first|nth)\(/u,
  );
  assert.doesNotMatch(scenario, /page\.getByRole\('alert'\)/u);
  assert.doesNotMatch(scenario, /getByRole\('alert'\)\.(?:first|nth)\(/u);
  assert.equal(
    scenario.split("page.on('request', observePasswordValidationLoginRequest);")
      .length - 1,
    1,
  );
  assert.equal(
    scenario.split(
      "page.off('request', observePasswordValidationLoginRequest);",
    ).length - 1,
    1,
  );
  assert.equal(
    scenario.split("let passwordValidationLoginRequests = 0;").length - 1,
    1,
  );
  assert.equal(
    scenario.split("passwordValidationLoginRequests += 1;").length - 1,
    1,
  );
  assert.equal(
    scenario.match(/\bpasswordValidationLoginRequests\b/gu)?.length,
    3,
  );
  assert.match(
    scenario,
    /const emailField = page\.getByRole\('textbox', \{ name: 'Adresse e-mail' \}\);[\s\S]+?expect\(emailField\)\.toBeFocused\(\);[\s\S]+?emailField\.fill\('synthetic@example\.invalid'\);[\s\S]+?expect\(emailField\)\.toHaveValue\('synthetic@example\.invalid'\);[\s\S]+?expect\([\s\S]+?emailField\.evaluate\([\s\S]+?HTMLInputElement\)\.checkValidity\(\)\),[\s\S]+?\)\.toBe\(true\);[\s\S]+?page\.keyboard\.press\('Tab'\);[\s\S]+?const passwordField = page\.getByLabel\('Mot de passe'\);[\s\S]+?expect\(passwordField\)\.toBeFocused\(\);/u,
  );
  assert.match(
    scenario,
    /const observePasswordValidationLoginRequest = \(request: Request\): void => \{\s+if \(\s+request\.method\(\) === 'POST' &&\s+new URL\(request\.url\(\)\)\.pathname === '\/api\/v1\/admin\/auth\/login'\s+\) \{\s+passwordValidationLoginRequests \+= 1;\s+\}\s+\};[\s\S]+?page\.on\('request', observePasswordValidationLoginRequest\);[\s\S]+?try \{[\s\S]+?passwordField\.fill\('short-value'\);[\s\S]+?getByRole\('button', \{ name: 'Continuer' \}\)\.click\(\);[\s\S]+?expect\(page\)\.toHaveURL\(\/\\\/login\$\/u\);[\s\S]+?expect\(passwordField\)\.toBeFocused\(\);[\s\S]+?expect\(passwordField\)\.toHaveAttribute\('aria-invalid', 'true'\);[\s\S]+?expect\(passwordField\)\.toHaveAccessibleDescription\([\s\S]+?Le mot de passe doit contenir entre 12 et 128 points de code Unicode[\s\S]+?page\.waitForTimeout\(250\);[\s\S]+?expect\(passwordValidationLoginRequests\)\.toBe\(0\);[\s\S]+?\} finally \{[\s\S]+?page\.off\('request', observePasswordValidationLoginRequest\);/u,
  );
  assert.doesNotMatch(
    scenario,
    /noValidate|formNoValidate|requestSubmit|\.submit\(\)|click\(\{\s*force:\s*true|dispatchEvent|removeAttribute\(['"]required['"]\)|setAttribute\(['"]novalidate['"]/iu,
  );
  const normalized = scenario.replace(/\s+/gu, " ");
  let cursor = -1;
  for (const fragment of [
    "page.on('request', observeGlobalStateAuthRequest);",
    "try {",
    "await page.setExtraHTTPHeaders({ [globalStateProbeHeader]: 'loading' });",
    "await page.goto('/login?c3-global-state=loading', { waitUntil: 'commit', });",
    "expect(streamedNotFound?.status()).toBe(200);",
    "await page.setExtraHTTPHeaders({});",
    "page.locator('main[aria-busy=\"true\"]')",
    "name: 'Chargement sécurisé'",
    "getByRole('status')).toHaveAttribute('aria-live', 'polite')",
    "await expectNoAxeViolations(page);",
    "name: 'Chargement sécurisé'",
    "getByRole('status')).toHaveAttribute('aria-live', 'polite')",
    "name: 'Page introuvable'",
    "name: 'Aller à la connexion'",
    'body meta[name="robots"][content="noindex"]',
    ").toHaveCount(1)",
    "await page.setExtraHTTPHeaders({ [globalStateProbeHeader]: 'error' });",
    "await page.goto('/login?c3-global-state=error');",
    "expect(errorResponse).not.toBeNull();",
    "const errorMain = page.locator('main#contenu-principal');",
    "const errorAlert = errorMain.getByRole('alert');",
    "name: 'Un problème est survenu'",
    "expect(errorAlert).toHaveCount(1)",
    "expect(errorAlert).toHaveAttribute('aria-live', 'assertive')",
    "expect(errorAlert).toContainText(",
    "Aucune opération n’est relancée automatiquement.",
    "await expect(errorMain).toBeFocused();",
    "page.getByText('C3 global error boundary probe.')",
    "page.getByRole('navigation')).toHaveCount(0)",
    "await expectNoAxeViolations(page);",
    "await page.setExtraHTTPHeaders({ [globalStateProbeHeader]: 'not-found' });",
    "name: 'Réessayer l’affichage'",
    "await expect(page).toHaveURL(/\\/login\\?c3-global-state=error$/u);",
    "await expect(errorMain).toHaveCount(1);",
    "await expect(errorAlert).toHaveCount(0);",
    "name: 'Réessayer l’affichage' })).toHaveCount(0)",
    "errorMain.getByRole('heading', { name: 'Page introuvable' })",
    "errorMain.getByRole('link', { name: 'Aller à la connexion' })",
    "errorMain.getByRole('textbox', { name: 'Adresse e-mail' })",
    "page.getByRole('navigation')).toHaveCount(0)",
    "await expectEffectiveNoIndex(page);",
    "await page.setExtraHTTPHeaders({});",
    "expect(globalStateAuthRequests).toBe(0);",
    "} finally {",
    "await page.setExtraHTTPHeaders({});",
    "page.off('request', observeGlobalStateAuthRequest);",
    "expect(response?.status()).toBe(candidate.status);",
    "page.getByRole('heading', { name: candidate.heading })",
    "await expectNoAxeViolations(page);",
  ]) {
    const next = normalized.indexOf(fragment, cursor + 1);
    assert.ok(
      next > cursor,
      `missing or out-of-order global-state fragment: ${fragment}`,
    );
    cursor = next;
  }
  assert.match(scenario, /heading: 'Page introuvable',[\s\S]+?status: 404/u);
  assert.match(
    scenario,
    /message: 'Votre session a expiré\. Reconnectez-vous\.'/u,
  );
});

test("Infrastructure wires the isolated C3 campaign without the local project", () => {
  assert.match(
    infrastructureWorkflow,
    /npm exec --workspace @kora-plus\/admin playwright -- install --with-deps chromium firefox webkit/u,
  );
  assert.match(
    infrastructureWorkflow,
    /run-admin-auth-c3-runtime-validation\.ps1[\s\S]+-Instance \$env:KORA_C3_CI_INSTANCE[\s\S]+-EvidenceDirectory \$evidence/u,
  );
  assert.match(
    infrastructureWorkflow,
    /KORA_C3_CI_INSTANCE: "ci-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}"/u,
  );
  assert.doesNotMatch(
    infrastructureWorkflow.match(
      /- name: Validate C3 browser and API runtime[\s\S]+?- name: Start and verify lifecycle/u,
    )?.[0] ?? "",
    /kora-plus-local/u,
  );
});

test("Firefox suppresses only its first-run privacy tab in the campaign profile", () => {
  const firefoxProject = playwright.match(
    /name: 'firefox-public-smoke',[\s\S]+?(?=name: 'webkit-public-smoke')/u,
  )?.[0];
  const nonFirefoxProjects = playwright.replace(firefoxProject ?? "", "");

  assert.ok(firefoxProject);
  assert.match(firefoxProject, /executablePath: firefoxExecutablePath/u);
  assert.match(
    firefoxProject,
    /firefoxUserPrefs: \{\s+'datareporting\.policy\.firstRunURL': ''/u,
  );
  assert.equal(
    [...playwright.matchAll(/datareporting\.policy\.firstRunURL/gu)].length,
    1,
  );
  assert.doesNotMatch(nonFirefoxProjects, /firefoxUserPrefs/u);
  assert.doesNotMatch(
    firefoxProject,
    /dataSubmission|healthreport|telemetry|safebrowsing|trackingprotection/u,
  );
});

test("Windows Firefox uses only a fail-closed qualified isolated cache", () => {
  const cacheFunctions = runner.match(
    /# BEGIN C3 QUALIFIED FIREFOX CACHE FUNCTIONS[\s\S]+?# END C3 QUALIFIED FIREFOX CACHE FUNCTIONS/u,
  )?.[0];
  assert.ok(cacheFunctions);
  assert.match(
    runner,
    /An inherited Firefox executable override is forbidden/u,
  );
  assert.match(runner, /\$BrowserProjectSet -in @\('Complete', 'Firefox'\)/u);
  assert.match(
    runner,
    /Windows Firefox qualification requires an explicit qualified cache root and inventory SHA-256/u,
  );
  assert.match(
    cacheFunctions,
    /node_modules\/playwright-core\/browsers\.json/u,
  );
  assert.match(cacheFunctions, /\$descriptor\.revision -ne '1555'/u);
  assert.match(cacheFunctions, /\$descriptor\.browserVersion -ne '157\.0'/u);
  assert.match(cacheFunctions, /firefox\.exe/u);
  assert.match(cacheFunctions, /mozglue\.dll/u);
  assert.match(cacheFunctions, /Get-ChildItem[^\n]+-File -Force/u);
  assert.match(
    cacheFunctions,
    /Assert-C3FirefoxBrowserInventory \$inventory 61 \$ExpectedInventorySha256/u,
  );
  assert.match(
    cacheFunctions,
    /The qualified Firefox browser inventory diverged/u,
  );
  assert.match(runner, /KORA_C3_FIREFOX_EXECUTABLE_PATH/u);
  assert.match(
    playwright,
    /const firefoxExecutablePath = process\.env\.KORA_C3_FIREFOX_EXECUTABLE_PATH/u,
  );
  assert.match(playwright, /process\.platform !== 'win32'/u);
  assert.doesNotMatch(playwright, /PLAYWRIGHT_BROWSERS_PATH/u);

  const browserEnvironment = runner.match(
    /\$BrowserEnvironment = \$ComposeEnvironment\.Clone\(\)[\s\S]+?\$browser = Invoke-Captured/u,
  )?.[0];
  const redactionEnvironment = runner.match(
    /\$RedactionProbeEnvironment = \$BrowserEnvironment\.Clone\(\)[\s\S]+?\$redactionProbe = Invoke-Captured/u,
  )?.[0];
  assert.ok(browserEnvironment && redactionEnvironment);
  assert.match(browserEnvironment, /KORA_C3_FIREFOX_EXECUTABLE_PATH/u);
  assert.match(
    redactionEnvironment,
    /Remove\('KORA_C3_FIREFOX_EXECUTABLE_PATH'\)/u,
  );
});

test("the qualified Firefox inventory rejects an added hidden file", () => {
  const directory = mkdtempSync(join(tmpdir(), "kora-c3-firefox-inventory-"));
  try {
    writeFileSync(
      join(directory, "visible.txt"),
      "visible inventory fixture",
      "utf8",
    );
    const result = invokeFirefoxHiddenInventoryGuard(directory);
    assert.equal(result.BeforeCount, 1);
    assert.equal(result.AfterCount, 2);
    assert.equal(result.Rejected, true);
    assert.match(result.AfterText, /\.hidden-extra\t/u);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test("the secret-bearing browser campaign disables diagnostic capture", () => {
  assert.match(playwright, /trace: 'off'/u);
  assert.match(playwright, /video: 'off'/u);
  assert.match(playwright, /screenshot: 'off'/u);
  assert.match(playwright, /process\.env\.PLAYWRIGHT_NO_COPY_PROMPT = '1'/u);
  assert.match(playwright, /retries: 0/u);
  assert.match(playwright, /workers: 1/u);
  assert.match(playwright, /ignore-certificate-errors-spki-list/u);
  assert.match(
    playwright,
    /grepInvert: \/@artifact-redaction-probe\|@public-smoke\|@visual-fixture\/u/u,
  );
  assert.match(playwright, /name: 'chromium-artifact-redaction-probe'/u);
  assert.match(playwright, /grep: \/@artifact-redaction-probe\/u/u);
  assert.match(playwright, /name: 'chromium-visual-fixture'/u);
  assert.match(playwright, /grep: \/@visual-fixture\/u/u);
  assert.doesNotMatch(playwright, /storageState|har:/u);
  assert.match(runner, /KORA_C3_VISUAL_OUTPUT_DIR/u);
  assert.match(runner, /playwright-visual-output/u);
  assert.match(specification, /@visual-fixture public synthetic states/u);
  assert.match(specification, /375-loading-synthetic\.png/u);
  assert.match(specification, /768-unavailable-synthetic\.png/u);
  assert.match(specification, /reducedMotion: 'no-preference'/u);
  assert.match(specification, /duration === 150/u);
  assert.match(specification, /seconds <= 0\.000_01/u);
  assert.match(
    specification,
    /page\.screenshot\(\{ animations: 'disabled', fullPage: true, path: target \}\)/u,
  );
  assert.match(specification, /expect\(existsSync\(target\)\)\.toBe\(false\)/u);
  assert.match(specification, /post-commit response failure without replay/u);
  assert.match(specification, /lastAcceptedTotpCounter\.get\(counterScope\)/u);
  assert.match(
    specification,
    /lastAcceptedTotpCounter\.set\(counterScope, counter\)/u,
  );
  assert.doesNotMatch(
    specification,
    /lastAcceptedTotpCounter\.(?:get|set)\(secret/u,
  );
  assert.match(
    specification,
    /const replacement = await enroll\(page, privateChannel, 'bootstrap-admin'\)/u,
  );
  assert.doesNotMatch(specification, /route\.fetch\(\)/u);
  assert.match(fixtures, /loseNextInvitationResponseAfterCommit/u);
  assert.match(fixtures, /isolateRecoveryRateLimitScenario/u);
  assert.match(fixtures, /isolateRefreshRateLimitScenario/u);
  assert.match(fixtures, /isolateTotpRateLimitScenario/u);
  assert.match(harness, /committedInvitationResponseLosses/u);
  assert.match(harness, /kora:admin-auth:rate:recovery:ip:/u);
  assert.match(harness, /recoveryRateLimitIpKeys\.size !== 1/u);
  assert.match(harness, /recoveryRateLimitCalls !== 5/u);
  assert.match(harness, /previous_count ~= '5'/u);
  assert.match(harness, /previous_ttl < 1 or previous_ttl > 3600000/u);
  assert.match(harness, /databaseKeyDelta !== 1/u);
  assert.match(harness, /deletedKeys !== 1/u);
  assert.match(harness, /remainingKeys !== 0/u);
  assert.match(harness, /localAof !== 1/u);
  assert.match(harness, /redis\.call\('DEL', KEYS\[1\]\)/u);
  assert.equal([...harness.matchAll(/redis\.call\('DEL'/gu)].length, 4);
  assert.match(
    harness,
    /evalRateLimitRedis\([\s\S]+?\n\s*1,\n\s*ipKey,\n\s*\);/u,
  );
  const passwordBlockStart = harness.indexOf(
    "if (action === 'isolatePasswordRateLimitScenario')",
  );
  const totpBlockStart = harness.indexOf(
    "if (action === 'isolateTotpRateLimitScenario')",
  );
  const refreshBlockStart = harness.indexOf(
    "if (action === 'isolateRefreshRateLimitScenario')",
  );
  const recoveryBlockStart = harness.indexOf(
    "if (action === 'isolateRecoveryRateLimitScenario')",
  );
  const nextFixtureBlockStart = harness.indexOf(
    "if (action === 'failNextLogout')",
  );
  assert.ok(
    passwordBlockStart >= 0 &&
      totpBlockStart > passwordBlockStart &&
      refreshBlockStart > totpBlockStart &&
      recoveryBlockStart > refreshBlockStart &&
      nextFixtureBlockStart > recoveryBlockStart,
  );
  const passwordBlock = harness.slice(passwordBlockStart, totpBlockStart);
  const totpBlock = harness.slice(totpBlockStart, refreshBlockStart);
  const refreshBlock = harness.slice(refreshBlockStart, recoveryBlockStart);
  const recoveryBlock = harness.slice(
    recoveryBlockStart,
    nextFixtureBlockStart,
  );
  const passwordActiveGuard = passwordBlock.indexOf(
    "if (passwordRateLimitIsolationActive)",
  );
  const passwordIpMatrixGuard = passwordBlock.indexOf(
    "JSON.stringify(observedIpCounts) === JSON.stringify([5])",
  );
  const passwordSubjectMatrixGuard = passwordBlock.indexOf(
    "JSON.stringify(observedSubjectCounts) === JSON.stringify([1, 4])",
  );
  const passwordSessionMatrixGuard = passwordBlock.indexOf(
    "JSON.stringify(observedIpCounts) === JSON.stringify([1, 4])",
  );
  const passwordKeyCardinalityGuard = passwordBlock.indexOf(
    "throw new C3PrivateRejection('PASSWORD_ISOLATION_KEYS')",
  );
  const passwordIsolationStart = passwordBlock.indexOf(
    "passwordRateLimitIsolationActive = true",
  );
  const passwordLuaTargetGuard = passwordBlock.indexOf(
    "if #KEYS ~= 3 or #ARGV ~= 4",
  );
  const passwordLuaTypeGuard = passwordBlock.indexOf(
    "local key_type = redis.call('TYPE', KEYS[index])",
  );
  const passwordLuaCountGuard = passwordBlock.indexOf(
    "tonumber(previous_count) ~= expected_count",
  );
  const passwordLuaTtlGuard = passwordBlock.indexOf(
    "previous_ttl < 1 or previous_ttl > 900000",
  );
  const passwordDatabaseBefore = passwordBlock.indexOf(
    "local database_keys_before = redis.call('DBSIZE')",
  );
  const passwordDelete = passwordBlock.indexOf(
    "redis.call('DEL', unpack(KEYS))",
  );
  const passwordExists = passwordBlock.indexOf(
    "redis.call('EXISTS', unpack(KEYS))",
  );
  const passwordDatabaseAfter = passwordBlock.indexOf(
    "local database_keys_after = redis.call('DBSIZE')",
  );
  const passwordWaitAof = passwordBlock.indexOf(
    "rateLimitRedisClient.call('WAITAOF'",
    passwordDelete,
  );
  const passwordLocalAofGuard = passwordBlock.indexOf(
    "if (localAof !== 1",
    passwordWaitAof,
  );
  const passwordIpClear = passwordBlock.indexOf(
    "passwordRateLimitIpCounts.clear()",
    passwordLocalAofGuard,
  );
  const passwordSubjectClear = passwordBlock.indexOf(
    "passwordRateLimitSubjectCounts.clear()",
    passwordIpClear,
  );
  const passwordCallClear = passwordBlock.indexOf(
    "passwordRateLimitCalls = 0",
    passwordSubjectClear,
  );
  const passwordFixtureReturn = passwordBlock.indexOf(
    "observedPasswordCalls,",
    passwordCallClear,
  );
  assert.ok(
    passwordActiveGuard >= 0 &&
      passwordIpMatrixGuard > passwordActiveGuard &&
      passwordSubjectMatrixGuard > passwordIpMatrixGuard &&
      passwordSessionMatrixGuard > passwordSubjectMatrixGuard &&
      passwordKeyCardinalityGuard > passwordSessionMatrixGuard &&
      passwordIsolationStart > passwordKeyCardinalityGuard &&
      passwordLuaTargetGuard > passwordIsolationStart &&
      passwordLuaTypeGuard > passwordLuaTargetGuard &&
      passwordLuaCountGuard > passwordLuaTypeGuard &&
      passwordLuaTtlGuard > passwordLuaCountGuard &&
      passwordDatabaseBefore > passwordLuaTtlGuard &&
      passwordDelete > passwordDatabaseBefore &&
      passwordExists > passwordDelete &&
      passwordDatabaseAfter > passwordExists &&
      passwordWaitAof > passwordDatabaseAfter &&
      passwordLocalAofGuard > passwordWaitAof &&
      passwordIpClear > passwordLocalAofGuard &&
      passwordSubjectClear > passwordIpClear &&
      passwordCallClear > passwordSubjectClear &&
      passwordFixtureReturn > passwordCallClear,
  );
  const totpActiveGuard = totpBlock.indexOf(
    "if (totpRateLimitIsolationActive)",
  );
  const totpIpMatrixGuard = totpBlock.indexOf(
    "JSON.stringify(observedIpCounts) !== JSON.stringify([1, 5])",
  );
  const totpSubjectMatrixGuard = totpBlock.indexOf(
    "JSON.stringify(observedSubjectCounts) !== JSON.stringify([1, 1, 1, 1, 2])",
  );
  const totpKeyCardinalityGuard = totpBlock.indexOf(
    "throw new C3PrivateRejection('TOTP_ISOLATION_KEYS')",
  );
  const totpIsolationStart = totpBlock.indexOf(
    "totpRateLimitIsolationActive = true",
  );
  const totpLuaTargetGuard = totpBlock.indexOf(
    "if expected_ip_keys ~= 2 or #KEYS ~= 7 or #ARGV ~= 8",
  );
  const totpLuaTypeGuard = totpBlock.indexOf(
    "local key_type = redis.call('TYPE', KEYS[index])",
  );
  const totpLuaCountGuard = totpBlock.indexOf(
    "tonumber(previous_count) ~= expected_count",
  );
  const totpBrowserIpSelection = totpBlock.indexOf(
    "if index <= expected_ip_keys and expected_count == 5",
  );
  const totpLuaTtlGuard = totpBlock.indexOf(
    "previous_ttl < 1 or previous_ttl > 300000",
  );
  const totpDatabaseBefore = totpBlock.indexOf(
    "local database_keys_before = redis.call('DBSIZE')",
  );
  const totpDelete = totpBlock.indexOf(
    "redis.call('DEL', KEYS[browser_ip_index])",
  );
  const totpExists = totpBlock.indexOf(
    "redis.call('EXISTS', KEYS[browser_ip_index])",
  );
  const totpDatabaseAfter = totpBlock.indexOf(
    "local database_keys_after = redis.call('DBSIZE')",
  );
  const totpWaitAof = totpBlock.indexOf(
    "rateLimitRedisClient.call('WAITAOF'",
    totpDelete,
  );
  const totpLocalAofGuard = totpBlock.indexOf(
    "if (localAof !== 1",
    totpWaitAof,
  );
  const totpIpClear = totpBlock.indexOf(
    "totpRateLimitIpCounts.clear()",
    totpLocalAofGuard,
  );
  const totpSubjectClear = totpBlock.indexOf(
    "totpRateLimitSubjectCounts.clear()",
    totpIpClear,
  );
  const totpCallClear = totpBlock.indexOf(
    "totpRateLimitCalls = 0",
    totpSubjectClear,
  );
  const totpFixtureReturn = totpBlock.indexOf(
    "observedTotpCalls,",
    totpCallClear,
  );
  assert.ok(
    totpActiveGuard >= 0 &&
      totpIpMatrixGuard > totpActiveGuard &&
      totpSubjectMatrixGuard > totpIpMatrixGuard &&
      totpKeyCardinalityGuard > totpSubjectMatrixGuard &&
      totpIsolationStart > totpKeyCardinalityGuard &&
      totpLuaTargetGuard > totpIsolationStart &&
      totpLuaTypeGuard > totpLuaTargetGuard &&
      totpLuaCountGuard > totpLuaTypeGuard &&
      totpBrowserIpSelection > totpLuaCountGuard &&
      totpLuaTtlGuard > totpBrowserIpSelection &&
      totpDatabaseBefore > totpLuaTtlGuard &&
      totpDelete > totpDatabaseBefore &&
      totpExists > totpDelete &&
      totpDatabaseAfter > totpExists &&
      totpWaitAof > totpDatabaseAfter &&
      totpLocalAofGuard > totpWaitAof &&
      totpIpClear > totpLocalAofGuard &&
      totpSubjectClear > totpIpClear &&
      totpCallClear > totpSubjectClear &&
      totpFixtureReturn > totpCallClear,
  );
  assert.match(totpBlock, /databaseKeyDelta !== 1/u);
  assert.match(totpBlock, /deletedKeys !== 1/u);
  assert.match(totpBlock, /targetKeyCount !== targetKeys\.length/u);
  assert.match(totpBlock, /remainingKeys !== 0/u);
  const refreshDelete = refreshBlock.indexOf("redis.call('DEL', KEYS[1])");
  const refreshCountGuard = refreshBlock.indexOf("previous_count == false");
  const refreshRangeGuard = refreshBlock.indexOf("current_count == nil");
  const refreshTtlGuard = refreshBlock.indexOf("previous_ttl < 1");
  const refreshWaitAof = refreshBlock.indexOf(
    "rateLimitRedisClient.call('WAITAOF'",
    refreshDelete,
  );
  const refreshFixtureReturn = refreshBlock.indexOf(
    "observedRefreshCalls: previousCount,",
    refreshWaitAof,
  );
  assert.ok(
    refreshCountGuard >= 0 &&
      refreshRangeGuard > refreshCountGuard &&
      refreshTtlGuard > refreshRangeGuard &&
      refreshDelete > refreshTtlGuard &&
      refreshWaitAof > refreshDelete &&
      refreshFixtureReturn > refreshWaitAof,
  );
  const recoveryDelete = recoveryBlock.indexOf("redis.call('DEL', KEYS[1])");
  const recoveryWaitAof = recoveryBlock.indexOf(
    "rateLimitRedisClient.call('WAITAOF'",
    recoveryDelete,
  );
  const recoveryFixtureReturn = recoveryBlock.indexOf(
    "observedRecoveryCalls: 5,",
    recoveryWaitAof,
  );
  assert.ok(
    recoveryDelete >= 0 &&
      recoveryWaitAof > recoveryDelete &&
      recoveryFixtureReturn > recoveryWaitAof,
  );
  assert.match(harness, /kora:admin-auth:rate:refresh:ip:/u);
  assert.match(harness, /kora:admin-auth:rate:refresh:subject:/u);
  assert.match(harness, /refreshRateLimitIpKeys\.size !== 1/u);
  assert.match(harness, /refreshRateLimitCalls < 1/u);
  assert.doesNotMatch(harness, /refreshRateLimitCalls > \d+/u);
  assert.doesNotMatch(fixtures, /observedRefreshCalls as number\) > \d+/u);
  assert.match(
    harness,
    /const maximumObservedRefreshCalls = refreshRateLimitCalls/u,
  );
  assert.match(harness, /local max_observed_calls = tonumber\(ARGV\[1\]\)/u);
  assert.match(
    harness,
    /previous_count == false or string\.match\(previous_count, '\^\[1-9\]\[0-9\]\*\$'\) == nil/u,
  );
  assert.match(
    harness,
    /current_count == nil or current_count < 1 or current_count > max_observed_calls/u,
  );
  assert.doesNotMatch(refreshBlock, /previous_count\) ~= expected_count/u);
  const expectedIsolationRejectionCodes = [
    "PASSWORD_ISOLATION_COUNT",
    "PASSWORD_ISOLATION_KEYS",
    "PASSWORD_ISOLATION_REDIS_COUNT",
    "PASSWORD_ISOLATION_REDIS_INVARIANT",
    "PASSWORD_ISOLATION_REDIS_RESULT",
    "PASSWORD_ISOLATION_REDIS_TTL",
    "PASSWORD_ISOLATION_TARGET",
    "PASSWORD_ISOLATION_WAITAOF_ERROR",
    "PASSWORD_ISOLATION_WAITAOF_RESULT",
    "PASSWORD_ISOLATION_WAITAOF_TIMEOUT",
    "RECOVERY_ISOLATION_COUNT",
    "RECOVERY_ISOLATION_KEYS",
    "RECOVERY_ISOLATION_REDIS_COUNT",
    "RECOVERY_ISOLATION_REDIS_INVARIANT",
    "RECOVERY_ISOLATION_REDIS_RESULT",
    "RECOVERY_ISOLATION_REDIS_TTL",
    "RECOVERY_ISOLATION_TARGET",
    "RECOVERY_ISOLATION_WAITAOF_ERROR",
    "RECOVERY_ISOLATION_WAITAOF_RESULT",
    "RECOVERY_ISOLATION_WAITAOF_TIMEOUT",
    "REFRESH_ISOLATION_COUNT",
    "REFRESH_ISOLATION_KEYS",
    "REFRESH_ISOLATION_REDIS_COUNT",
    "REFRESH_ISOLATION_REDIS_INVARIANT",
    "REFRESH_ISOLATION_REDIS_RESULT",
    "REFRESH_ISOLATION_REDIS_TTL",
    "REFRESH_ISOLATION_TARGET",
    "REFRESH_ISOLATION_WAITAOF_ERROR",
    "REFRESH_ISOLATION_WAITAOF_RESULT",
    "REFRESH_ISOLATION_WAITAOF_TIMEOUT",
    "TOTP_ISOLATION_COUNT",
    "TOTP_ISOLATION_KEYS",
    "TOTP_ISOLATION_REDIS_COUNT",
    "TOTP_ISOLATION_REDIS_INVARIANT",
    "TOTP_ISOLATION_REDIS_RESULT",
    "TOTP_ISOLATION_REDIS_TTL",
    "TOTP_ISOLATION_TARGET",
    "TOTP_ISOLATION_WAITAOF_ERROR",
    "TOTP_ISOLATION_WAITAOF_RESULT",
    "TOTP_ISOLATION_WAITAOF_TIMEOUT",
  ];
  const rejectionCodesIn = (source) =>
    [
      ...new Set(
        [
          ...source.matchAll(
            /'((?:PASSWORD|RECOVERY|REFRESH|TOTP)_ISOLATION_[A-Z_]+)'/gu,
          ),
        ].map((match) => match[1]),
      ),
    ].sort();
  assert.deepEqual(rejectionCodesIn(harness), expectedIsolationRejectionCodes);
  assert.deepEqual(rejectionCodesIn(fixtures), expectedIsolationRejectionCodes);
  assert.match(harness, /class C3PrivateRejection extends Error/u);
  assert.match(
    harness,
    /code: error instanceof C3PrivateRejection \? error\.code : 'INVALID_REQUEST'/u,
  );
  assert.doesNotMatch(harness, /code: error\.(?:message|stack|cause)/u);
  assert.doesNotMatch(harness, /JSON\.stringify\(error\)/u);
  assert.match(fixtures, /rejection = exactRecord\(value, \['code'\]\)/u);
  assert.match(fixtures, /C3_PRIVATE_REJECTION_CODES\.has\(rejection\.code\)/u);
  assert.match(
    fixtures,
    /Private channel command failed \(\$\{action\}:\$\{privateRejectionCode\(response\.result\)\}\)\./u,
  );
  const diagnosticActionsBlock = fixtures.match(
    /const C3_PRIVATE_DIAGNOSTIC_ACTIONS = new Set\(\[([\s\S]*?)\]\);/u,
  )?.[1];
  assert.ok(diagnosticActionsBlock);
  const diagnosticActions = [...diagnosticActionsBlock.matchAll(/'([^']+)'/gu)]
    .map((match) => match[1])
    .sort();
  const invokedPrivateActions = [
    ...new Set(
      [...fixtures.matchAll(/this\.command\(\s*'([^']+)'/gu)].map(
        (match) => match[1],
      ),
    ),
  ].sort();
  assert.deepEqual(diagnosticActions, invokedPrivateActions);
  assert.doesNotMatch(fixtures, /JSON\.stringify\(response\.result\)/u);
  assert.match(harness, /return 'C3_PASSWORD_RATE_LIMIT_TARGET_MISMATCH'/u);
  assert.match(harness, /return 'C3_PASSWORD_RATE_LIMIT_COUNT_MISMATCH'/u);
  assert.match(harness, /return 'C3_PASSWORD_RATE_LIMIT_TTL_MISMATCH'/u);
  assert.doesNotMatch(harness, /redis\.error_reply\('C3_PASSWORD_RATE_LIMIT_/u);
  assert.match(harness, /return 'C3_RECOVERY_RATE_LIMIT_COUNT_MISMATCH'/u);
  assert.match(harness, /return 'C3_RECOVERY_RATE_LIMIT_TTL_MISMATCH'/u);
  assert.doesNotMatch(harness, /redis\.error_reply\('C3_RECOVERY_RATE_LIMIT_/u);
  assert.match(harness, /return 'C3_REFRESH_RATE_LIMIT_COUNT_MISMATCH'/u);
  assert.match(harness, /return 'C3_REFRESH_RATE_LIMIT_TTL_MISMATCH'/u);
  assert.doesNotMatch(harness, /redis\.error_reply\('C3_REFRESH_RATE_LIMIT_/u);
  assert.match(harness, /return 'C3_TOTP_RATE_LIMIT_TARGET_MISMATCH'/u);
  assert.match(harness, /return 'C3_TOTP_RATE_LIMIT_COUNT_MISMATCH'/u);
  assert.match(harness, /return 'C3_TOTP_RATE_LIMIT_TTL_MISMATCH'/u);
  assert.doesNotMatch(harness, /redis\.error_reply\('C3_TOTP_RATE_LIMIT_/u);
  assert.match(
    harness,
    /lastRateLimitStage === 'WAITAOF_COMMAND_TIMEOUT'[\s\S]+?'PASSWORD_ISOLATION_WAITAOF_TIMEOUT'[\s\S]+?'PASSWORD_ISOLATION_WAITAOF_ERROR'/u,
  );
  assert.match(
    harness,
    /lastRateLimitStage === 'WAITAOF_COMMAND_TIMEOUT'[\s\S]+?'RECOVERY_ISOLATION_WAITAOF_TIMEOUT'[\s\S]+?'RECOVERY_ISOLATION_WAITAOF_ERROR'/u,
  );
  assert.match(
    harness,
    /lastRateLimitStage === 'WAITAOF_COMMAND_TIMEOUT'[\s\S]+?'REFRESH_ISOLATION_WAITAOF_TIMEOUT'[\s\S]+?'REFRESH_ISOLATION_WAITAOF_ERROR'/u,
  );
  assert.match(
    harness,
    /lastRateLimitStage === 'WAITAOF_COMMAND_TIMEOUT'[\s\S]+?'TOTP_ISOLATION_WAITAOF_TIMEOUT'[\s\S]+?'TOTP_ISOLATION_WAITAOF_ERROR'/u,
  );
  assert.match(harness, /previous_ttl < 1 or previous_ttl > 60000/u);
  assert.match(harness, /previous_ttl < 1 or previous_ttl > 900000/u);
  assert.match(harness, /previous_ttl < 1 or previous_ttl > 300000/u);
  assert.match(
    harness,
    /local key_type = redis\.call\('TYPE', KEYS\[index\]\)[\s\S]+?type\(key_type\) ~= 'table' or key_type\.ok ~= 'string'/u,
  );
  assert.match(harness, /redis\.call\('DEL', unpack\(KEYS\)\)/u);
  assert.match(harness, /redis\.call\('EXISTS', unpack\(KEYS\)\)/u);
  assert.match(
    harness,
    /localAof !== 1[\s\S]+?throw new C3PrivateRejection\('PASSWORD_ISOLATION_WAITAOF_RESULT'\)/u,
  );
  assert.match(
    harness,
    /previousCount === undefined \|\|\s+previousCount < 1 \|\|\s+previousCount > maximumObservedRefreshCalls/u,
  );
  assert.match(harness, /observedRefreshCalls: previousCount/u);
  assert.match(
    harness,
    /localAof !== 1[\s\S]+?throw new C3PrivateRejection\('RECOVERY_ISOLATION_WAITAOF_RESULT'\)/u,
  );
  assert.match(
    harness,
    /localAof !== 1[\s\S]+?throw new C3PrivateRejection\('REFRESH_ISOLATION_WAITAOF_RESULT'\)/u,
  );
  assert.match(
    harness,
    /localAof !== 1[\s\S]+?throw new C3PrivateRejection\('TOTP_ISOLATION_WAITAOF_RESULT'\)/u,
  );
  assert.equal(
    [
      ...specification.matchAll(
        /await isolateRefreshRateLimitBoundary\(privateChannel\);/gu,
      ),
    ].length,
    8,
  );
  const deferredRefreshStart = specification.indexOf(
    "test('the session provider defers one refresh 429",
  );
  const deferredRefreshEnd = specification.indexOf(
    "test('cross-tab invalidation cancels a deferred refresh",
    deferredRefreshStart,
  );
  assert.ok(
    deferredRefreshStart >= 0 && deferredRefreshEnd > deferredRefreshStart,
    "the deferred-refresh scenario is bounded by its adjacent scenario titles",
  );
  const deferredRefreshScenario = specification.slice(
    deferredRefreshStart,
    deferredRefreshEnd,
  );
  const refreshIsolation =
    "await isolateRefreshRateLimitBoundary(privateChannel);";
  const refreshProbeReset = "await privateChannel.resetRefreshProbe();";
  assert.equal(deferredRefreshScenario.split(refreshIsolation).length - 1, 2);
  assert.equal(deferredRefreshScenario.split(refreshProbeReset).length - 1, 2);
  assert.equal(
    deferredRefreshScenario.split("await page.goto('/');").length - 1,
    1,
  );
  assert.doesNotMatch(
    deferredRefreshScenario,
    /getByRole\('link',[^\n]+Tableau de bord/u,
  );
  const normalizedDeferredRefreshScenario = deferredRefreshScenario.replace(
    /\s+/gu,
    " ",
  );
  let deferredRefreshCursor = -1;
  for (const fragment of [
    refreshIsolation,
    "await registerAuthCookies(page, privateChannel);",
    "const beforeDashboardRefresh = (await page.context().cookies())",
    refreshProbeReset,
    "const dashboardRefresh = page.waitForResponse(",
    "response.url().endsWith('/api/v1/admin/auth/sessions/refresh') && response.request().method() === 'POST'",
    "await page.goto('/');",
    "expect(await refreshResponseDiagnostic(completedDashboardRefresh)).toEqual({ errorCode: null, retryAfter: null, source: null, status: 200, });",
    "gate: 'DASHBOARD', path: '/', reason: null,",
    "const afterDashboardRefresh = (await page.context().cookies())",
    "expect(await privateChannel.refreshProbeState()).toEqual({ active: 0, calls: 1, maxConcurrency: 1, });",
    "cookie.value !== beforeDashboardRefresh[index]?.value,",
    refreshIsolation,
    refreshProbeReset,
    "expect(await privateChannel.refreshProbeState()).toEqual({ active: 0, calls: 0, maxConcurrency: 0, });",
    "const candidate = await page.context().newPage();",
    "await expect(page.getByRole('heading', { name: /Tableau de bord/iu })).toBeVisible();",
    "gate: 'DASHBOARD', path: '/', reason: null,",
    "expect(await privateChannel.refreshProbeState()).toEqual({ active: 0, calls: 1, maxConcurrency: 1, });",
  ]) {
    const nextFragment = normalizedDeferredRefreshScenario.indexOf(
      fragment,
      deferredRefreshCursor + 1,
    );
    assert.ok(
      nextFragment > deferredRefreshCursor,
      `missing or out-of-order deferred-refresh fragment: ${fragment}`,
    );
    deferredRefreshCursor = nextFragment;
  }
  const refreshRateLimitStart = specification.indexOf(
    "test('a refresh 429 preserves the exact cookie pair and is not retried'",
  );
  const refreshRateLimitEnd = specification.indexOf(
    "test('an uncertain logout clears memory and every local auth cookie without replay'",
    refreshRateLimitStart,
  );
  assert.ok(
    refreshRateLimitStart >= 0 && refreshRateLimitEnd > refreshRateLimitStart,
    "the refresh rate-limit scenario is bounded by its adjacent scenario titles",
  );
  const refreshRateLimitScenario = specification.slice(
    refreshRateLimitStart,
    refreshRateLimitEnd,
  );
  assert.equal(refreshRateLimitScenario.split(refreshIsolation).length - 1, 2);
  assert.equal(
    refreshRateLimitScenario.split("page.on('request', observeRefreshRequest);")
      .length - 1,
    1,
  );
  assert.equal(
    refreshRateLimitScenario.split(
      "page.off('request', observeRefreshRequest);",
    ).length - 1,
    1,
  );
  const normalizedRefreshRateLimitScenario = refreshRateLimitScenario.replace(
    /\s+/gu,
    " ",
  );
  let refreshRateLimitCursor = -1;
  for (const fragment of [
    refreshIsolation,
    "const observeRefreshRequest = (request: Request): void => {",
    "page.on('request', observeRefreshRequest);",
    "try {",
    "expect(rateLimited).toBeDefined();",
    "await page.waitForTimeout(250);",
    "expect(observedRefreshRequests).toBe(observedAtRateLimit);",
    "expect(requestCount).toBeLessThanOrEqual(12);",
    refreshIsolation,
    "} finally {",
    "page.off('request', observeRefreshRequest);",
  ]) {
    const nextFragment = normalizedRefreshRateLimitScenario.indexOf(
      fragment,
      refreshRateLimitCursor + 1,
    );
    assert.ok(
      nextFragment > refreshRateLimitCursor,
      `missing or out-of-order refresh rate-limit fragment: ${fragment}`,
    );
    refreshRateLimitCursor = nextFragment;
  }
  const uncertainLogoutStart = refreshRateLimitEnd;
  const uncertainLogoutEnd = specification.indexOf(
    "test('an expired preauth returns 410 and clears the terminal browser context'",
    uncertainLogoutStart,
  );
  assert.ok(
    uncertainLogoutEnd > uncertainLogoutStart,
    "the uncertain-logout scenario is bounded by its adjacent scenario titles",
  );
  const uncertainLogoutScenario = specification.slice(
    uncertainLogoutStart,
    uncertainLogoutEnd,
  );
  assert.equal(uncertainLogoutScenario.split(refreshIsolation).length - 1, 1);
  assert.equal(uncertainLogoutScenario.split(refreshProbeReset).length - 1, 1);
  const normalizedUncertainLogoutScenario = uncertainLogoutScenario.replace(
    /\s+/gu,
    " ",
  );
  let uncertainLogoutCursor = -1;
  for (const fragment of [
    "const beforeLogoutResynchronization = (await page.context().cookies())",
    refreshProbeReset,
    "const logoutResynchronization = page.waitForResponse(",
    "response.url().endsWith('/api/v1/admin/auth/sessions/refresh') && response.request().method() === 'POST'",
    "await page.goto('/login');",
    "const completedLogoutResynchronization = await logoutResynchronization;",
    "expect(await refreshResponseDiagnostic(completedLogoutResynchronization)).toEqual({ errorCode: null, retryAfter: null, source: null, status: 200, });",
    "await expect(page.getByRole('heading', { name: 'Choisissez votre contexte' })).toBeVisible();",
    "await registerAuthCookies(page, privateChannel);",
    "await expectAuthCookiePolicy(page, ['__Host-kora_admin_csrf', '__Host-kora_admin_refresh']);",
    "const afterLogoutResynchronization = (await page.context().cookies())",
    "expect(await privateChannel.refreshProbeState()).toEqual({ active: 0, calls: 1, maxConcurrency: 1, });",
    "cookie.value !== beforeLogoutResynchronization[index]?.value,",
    refreshIsolation,
    "page.on('request', countLogoutRequest);",
    "const before = await privateChannel.logoutFaultState();",
    "await privateChannel.loseNextLogoutResponseAfterCommit();",
    "await page.getByRole('button', { name: 'Me déconnecter' }).click();",
    "await expect(page).toHaveURL(/\\/login\\?reason=logout-result-unknown$/u);",
    "await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();",
    "expect(remaining.length).toBe(0);",
    "const after = await privateChannel.logoutFaultState();",
    "expect(browserLogoutRequests).toBe(1);",
    "expect(after.calls).toBe(before.calls + 1);",
    "expect(after.committedResponseLosses).toBe(before.committedResponseLosses + 1);",
    "await page.waitForTimeout(250);",
    "expect(browserLogoutRequests).toBe(1);",
    "await page.goto('/compte/securite');",
    "await expect(page).toHaveURL(/\\/login(?:\\?|$)/u);",
    "await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();",
    "page.off('request', countLogoutRequest);",
  ]) {
    const nextFragment = normalizedUncertainLogoutScenario.indexOf(
      fragment,
      uncertainLogoutCursor + 1,
    );
    assert.ok(
      nextFragment > uncertainLogoutCursor,
      `missing or out-of-order uncertain-logout fragment: ${fragment}`,
    );
    uncertainLogoutCursor = nextFragment;
  }
  const expiredPreauthStart = specification.indexOf(
    "test('an expired preauth returns 410 and clears the terminal browser context'",
  );
  const expiredPreauthEnd = specification.indexOf(
    "test('rate limiting applies the server Retry-After window and blocks new submission'",
    expiredPreauthStart,
  );
  assert.ok(
    expiredPreauthStart >= 0 && expiredPreauthEnd > expiredPreauthStart,
    "the expired-preauth scenario is bounded by its adjacent scenario titles",
  );
  const expiredPreauthScenario = specification
    .slice(expiredPreauthStart, expiredPreauthEnd)
    .replace(/\s+/gu, " ");
  let expiredPreauthCursor = -1;
  for (const fragment of [
    "expect((await terminal).status()).toBe(410);",
    "await expect(page).toHaveURL(/\\/login\\?reason=preauth-expired$/u);",
    "name: 'Connexion'",
    "Le parcours d’authentification a expiré. Recommencez.",
    "authCookieNames.has(cookie.name)).length, ).toBe(0);",
  ]) {
    const next = expiredPreauthScenario.indexOf(
      fragment,
      expiredPreauthCursor + 1,
    );
    assert.ok(
      next > expiredPreauthCursor,
      `missing expired-preauth fragment: ${fragment}`,
    );
    expiredPreauthCursor = next;
  }

  const passwordRateLimitStart = expiredPreauthEnd;
  const passwordRateLimitEnd = specification.indexOf(
    "test('cross-site login is rejected before authentication and creates no auth cookie'",
    passwordRateLimitStart,
  );
  assert.ok(
    passwordRateLimitEnd > passwordRateLimitStart,
    "the password rate-limit scenario is bounded by its adjacent scenario titles",
  );
  const passwordRateLimitScenario = specification.slice(
    passwordRateLimitStart,
    passwordRateLimitEnd,
  );
  assert.equal(
    passwordRateLimitScenario.split("page.on('request', observeLoginRequest);")
      .length - 1,
    1,
  );
  assert.equal(
    passwordRateLimitScenario.split("page.off('request', observeLoginRequest);")
      .length - 1,
    1,
  );
  assert.doesNotMatch(passwordRateLimitScenario, /page\.on\('response'/u);
  const normalizedPasswordRateLimit = passwordRateLimitScenario.replace(
    /\s+/gu,
    " ",
  );
  let passwordRateLimitCursor = -1;
  for (const fragment of [
    "const observeLoginRequest = (request: Request): void => {",
    "page.on('request', observeLoginRequest);",
    "try {",
    "const completedResponse = await response;",
    "if (completedResponse.status() === 429) rateLimitedResponse = completedResponse;",
    "expect(loginStatuses).toEqual([401, 401, 401, 401, 401, 429]);",
    "await page.waitForTimeout(250);",
    "expect(loginRequests).toBe(loginRequestsBefore);",
    "} finally {",
    "page.off('request', observeLoginRequest);",
  ]) {
    const next = normalizedPasswordRateLimit.indexOf(
      fragment,
      passwordRateLimitCursor + 1,
    );
    assert.ok(
      next > passwordRateLimitCursor,
      `missing rate-limit fragment: ${fragment}`,
    );
    passwordRateLimitCursor = next;
  }

  const crossSiteStart = passwordRateLimitEnd;
  const crossSiteEnd = specification.indexOf(
    "test('representative public states have no axe violation at three viewports'",
    crossSiteStart,
  );
  assert.ok(
    crossSiteEnd > crossSiteStart,
    "the cross-site scenario is bounded by its adjacent scenario titles",
  );
  const crossSiteScenario = specification.slice(crossSiteStart, crossSiteEnd);
  assert.equal(
    crossSiteScenario.split("probePage.on('request', observeCrossSiteLogin);")
      .length - 1,
    1,
  );
  assert.equal(
    crossSiteScenario.split("probePage.off('request', observeCrossSiteLogin);")
      .length - 1,
    1,
  );
  assert.equal(
    crossSiteScenario.split(
      "await probePage.route(foreignProbeUrl, serveForeignDocument);",
    ).length - 1,
    1,
  );
  assert.equal(
    crossSiteScenario.split(
      "await probePage.unroute(foreignProbeUrl, serveForeignDocument);",
    ).length - 1,
    1,
  );
  assert.equal(crossSiteScenario.match(/\btry \{/gu)?.length, 1);
  assert.equal(crossSiteScenario.match(/\} finally \{/gu)?.length, 1);
  assert.equal(crossSiteScenario.match(/route\.fulfill\(/gu)?.length, 1);
  assert.doesNotMatch(
    crossSiteScenario,
    /route\.continue|setExtraHTTPHeaders|request\.fetch|\bfetch\(/u,
  );
  assert.doesNotMatch(
    crossSiteScenario,
    /route\([^\n]+api\/v1\/admin\/auth\/login/u,
  );
  const normalizedCrossSite = crossSiteScenario.replace(/\s+/gu, " ");
  let crossSiteCursor = -1;
  for (const fragment of [
    "const adminOrigin = new URL(page.url()).origin;",
    "const loginUrl = new URL('/api/v1/admin/auth/login', adminOrigin).toString();",
    "const foreignOrigin = 'https://cross-site.invalid';",
    "const foreignProbeUrl = `${foreignOrigin}/__c3-boundary-probe`;",
    "const beforeDiagnostics = await privateChannel.passwordDiagnostics();",
    "expect(beforeAuthCookieCount).toBe(0);",
    "const probePage = await page.context().newPage();",
    "const serveForeignDocument = async (route: Route): Promise<void> => {",
    "request.url() !== foreignProbeUrl",
    "request.method() !== 'GET'",
    "request.resourceType() !== 'document'",
    "await route.fulfill({",
    '<form id="cross-site-login" method="post">',
    "const removeForeignDocumentRoute = async (): Promise<void> => {",
    "await probePage.unroute(foreignProbeUrl, serveForeignDocument);",
    "try {",
    "await probePage.route(foreignProbeUrl, serveForeignDocument);",
    "foreignDocumentRouteInstalled = true;",
    "await probePage.goto(foreignProbeUrl);",
    "expect(foreignDocument?.status()).toBe(200);",
    "expect(await probePage.evaluate(() => location.origin)).toBe(foreignOrigin);",
    "await removeForeignDocumentRoute();",
    "form.action = action;",
    "probePage.on('request', observeCrossSiteLogin);",
    "const rejected = probePage.waitForResponse(",
    "name: 'Soumettre la sonde cross-site'",
    "const completedRejection = await rejected;",
    "const wireHeaders = await completedRejection.request().allHeaders();",
    "expect(wireHeaders.origin).toBe(foreignOrigin);",
    "expect(wireHeaders['sec-fetch-site']).toBe('cross-site');",
    "expect(wireHeaders['sec-fetch-mode']).toBe('navigate');",
    "expect(wireHeaders['sec-fetch-dest']).toBe('document');",
    "expect(wireHeaders.cookie).toBeUndefined();",
    "expect(wireHeaders['x-kora-csrf']).toBeUndefined();",
    "errorCode: 'FORBIDDEN', retryAfter: null, source: 'BFF', status: 403,",
    "await probePage.waitForTimeout(250);",
    "expect(crossSiteLoginRequests).toBe(1);",
    ").toBe(beforeAuthCookieCount);",
    "expect(await privateChannel.passwordDiagnostics()).toEqual(beforeDiagnostics);",
    "} finally {",
    "probePage.off('request', observeCrossSiteLogin);",
    "await removeForeignDocumentRoute();",
    "await probePage.close();",
  ]) {
    const next = normalizedCrossSite.indexOf(fragment, crossSiteCursor + 1);
    assert.ok(
      next > crossSiteCursor,
      `missing cross-site fragment: ${fragment}`,
    );
    crossSiteCursor = next;
  }
  assert.equal(
    [
      ...specification.matchAll(
        /await isolatePasswordRateLimitBoundary\(privateChannel,/gu,
      ),
    ].length,
    2,
  );
  assert.equal(
    [
      ...specification.matchAll(
        /await isolateTotpRateLimitBoundary\(privateChannel\);/gu,
      ),
    ].length,
    1,
  );
  assert.match(
    specification,
    /ipCounts: \[5\],[\s\S]+?observedPasswordCalls: 5,[\s\S]+?subjectCounts: \[1, 4\],[\s\S]+?targetKeys: 3/u,
  );
  assert.match(
    specification,
    /ipCounts: \[1, 4\],[\s\S]+?observedPasswordCalls: 5,[\s\S]+?subjectCounts: \[5\],[\s\S]+?targetKeys: 3/u,
  );
  assert.match(
    specification,
    /two then five tabs[\s\S]+?await isolateRefreshRateLimitBoundary\(privateChannel\);[\s\S]+?await login\(page, privateChannel\);[\s\S]+?toHaveURL\(\/\\\/2fa\\\/verify\/u\)/u,
  );
  assert.match(
    specification,
    /two then five tabs[\s\S]+?const verified = page\.waitForResponse\([\s\S]+?\/api\/v1\/admin\/auth\/totp\/verify[\s\S]+?expect\(completedVerification\.status\(\)\)\.toBe\(200\)[\s\S]+?expectAuthCookiePolicy\(page, \['__Host-kora_admin_csrf', '__Host-kora_admin_refresh'\]\)/u,
  );
  assert.match(
    specification,
    /registerDynamicRequestSecrets\(candidate, privateChannel\);[\s\S]+?candidate\.on\('response',[\s\S]+?\/api\/v1\/admin\/auth\/sessions\/refresh[\s\S]+?refreshResponseDiagnostic\(response\)/u,
  );
  assert.match(
    specification,
    /probe: \{ active: 0, calls: count, maxConcurrency: 1 \},[\s\S]+?rateLimitDiagnostic:[\s\S]+?calls: count,[\s\S]+?failures: 0,[\s\S]+?lastFailure: 'NONE',[\s\S]+?lastStage: 'WAITAOF_LOCAL_DURABLE',[\s\S]+?responseDiagnostics: Array\.from\(\{ length: count \}, \(\) => \[[\s\S]+?errorCode: null, retryAfter: null, source: null, status: 200[\s\S]+?C3_REFRESH_GROUP_UI_STATE:\$\{JSON\.stringify\(pageDiagnostics\)\}/u,
  );
  assert.match(
    specification,
    /requestId\?: unknown[\s\S]+?\^bff_[^\n]+[\s\S]+?\? 'BFF'[\s\S]+?\? 'API'[\s\S]+?return \{ errorCode, retryAfter, source, status \}/u,
  );
  assert.match(
    specification,
    /resetRefreshProbe\(\)[\s\S]+?resetPasswordDiagnostics\(\)[\s\S]+?passwordDiagnostics\(\)[\s\S]+?rateLimitCalls[\s\S]+?rateLimitFailures[\s\S]+?lastRateLimitFailure[\s\S]+?lastRateLimitStage/u,
  );
  assert.match(
    specification,
    /const refreshGroup[\s\S]+?Promise\.all\(pages\.map\(async \(candidate\) => candidate\.goto\('\/'\)\)\)[\s\S]+?Tableau de bord[\s\S]+?expectAuthCookiePolicy\(candidate,[\s\S]+?gate: 'DASHBOARD',[\s\S]+?path: '\/'/u,
  );
  const refreshGroupBlock =
    /const refreshGroup = async[\s\S]+?\n    \};\n\n    await refreshGroup\(2\);/u.exec(
      specification,
    )?.[0];
  assert.ok(refreshGroupBlock);
  assert.doesNotMatch(
    refreshGroupBlock,
    /candidate\.goto\('\/compte\/securite'\)/u,
  );
  assert.match(
    specification,
    /await refreshGroup\(2\);[\s\S]+?await refreshGroup\(5\);[\s\S]+?resetRefreshProbe\(\)[\s\S]+?const finalRefresh = page\.waitForResponse[\s\S]+?const finalSessionList = page\.waitForResponse[\s\S]+?page\.goto\('\/compte\/securite'\)[\s\S]+?status: 200[\s\S]+?Session actuelle[\s\S]+?calls: 1,[\s\S]+?maxConcurrency: 1/u,
  );
  assert.match(
    specification,
    /databaseKeyDelta: 1,[\s\S]+?deletedKeys: 1,[\s\S]+?ipCounts: \[1, 5\],[\s\S]+?observedTotpCalls: 6,[\s\S]+?subjectCounts: \[1, 1, 1, 1, 2\],[\s\S]+?targetKeys: 7/u,
  );
  assert.match(
    specification,
    /if \(status !== 200\)[\s\S]+?expect\(\{ errorCode, retryAfter, status \}\)\.toEqual\(\{[\s\S]+?status: 200,[\s\S]+?const envelope = \(await completedVerification\.json\(\)\)/u,
  );
  assert.match(
    specification,
    /expect\(\{[\s\S]+?errorCode,[\s\S]+?retryAfter,[\s\S]+?status,[\s\S]+?\}\)\.toEqual\(\{ errorCode: null, retryAfter: null, status: 200 \}\)/u,
  );
  assert.match(
    specification,
    /expect\(loginStatuses\)\.toEqual\(\[401, 401, 401, 401, 401, 429\]\)/u,
  );
  assert.doesNotMatch(
    harness,
    /['"](?:FLUSHALL|FLUSHDB|KEYS|SCAN|UNLINK)['"]/iu,
  );
  assert.match(harness, /WAITAOF_COMMAND_TIMEOUT/u);
  assert.match(fixtures, /lastRateLimitStage/u);
  assert.match(specification, /recovery code creates no session/u);
  assert.match(specification, /Retry-After window/u);
  assert.match(
    specification,
    /SENSITIVE_RESPONSE_ALREADY_DELIVERED.+status: 409/su,
  );
  assert.match(specification, /expired preauth returns 410/u);
  assert.match(specification, /committedResponseLosses/u);
  assert.match(specification, /maxConcurrency: 1/u);
  assert.match(fixtures, /artifactRedactionGuard/u);
  assert.match(fixtures, /\{ auto: true \}/u);
  assert.match(fixtures, /finalizeTestErrors\(testInfo\.errors\)/u);
  assert.match(fixtures, /\[C3_ERROR_CONTEXT_REDACTED\]/u);
  assert.match(fixtures, /Reflect\.set\(error, 'stack', ''\)/u);
  assert.match(runner, /Label 'playwright-c3-artifact-redaction-probe'/u);
  assert.match(runner, /AllowedExitCodes \(0\.\.255\)/u);
  assert.match(runner, /\$redactionProbe\.ExitCode -ne 1/u);
  assert.match(runner, /\[string\[\]\]\$SensitiveRedactions = @\(\)/u);
  assert.match(runner, /\[string\]\$DynamicSentinelDirectory = ''/u);
  assert.match(runner, /Get-DynamicSentinelValues \$DynamicSentinelDirectory/u);
  assert.equal(
    [
      ...runner.matchAll(
        /HashSet\[string\]\]::new\(\[StringComparer\]::Ordinal\)/gu,
      ),
    ].length,
    2,
  );
  assert.doesNotMatch(
    runner,
    /Sort-Object -Property Length -Descending -Unique/u,
  );
  assert.match(runner, /Get-OrdinalOccurrenceCount \$stdout \$sensitive/u);
  assert.match(runner, /Get-OrdinalOccurrenceCount \$stderr \$sensitive/u);
  assert.match(
    runner,
    /preWriteRedactionsApplied = \$preWriteRedactionsApplied/u,
  );
  assert.equal(
    [...runner.matchAll(/-SensitiveRedactions @\(\$SensitiveValues\)/gu)]
      .length,
    2,
  );
  assert.equal(
    [
      ...runner.matchAll(
        /-DynamicSentinelDirectory \(Join-Path \$PrivateDirectory 'sentinels'\)/gu,
      ),
    ].length,
    3,
  );
  assert.equal(
    [...runner.matchAll(/PreWriteRedactionsApplied -ne 0/gu)].length,
    2,
  );
  assert.match(runner, /Label 'collector-prewrite-redaction-self-test'/u);
  assert.match(runner, /KORA_C3_CAPTURE_SELF_TEST_KNOWN/u);
  assert.match(runner, /KORA_C3_CAPTURE_SELF_TEST_DYNAMIC/u);
  assert.match(runner, /KORA_C3_CAPTURE_SELF_TEST_DIRECTORY/u);
  assert.match(runner, /\.sentinel\.json/u);
  assert.match(runner, /PreWriteRedactionsApplied -ne 4/u);
  assert.match(
    runner,
    /collectorSelfTest\.Stdout\.Trim\(\) -cne \$collectorSelfTestExpectedStream/u,
  );
  assert.match(
    runner,
    /collectorSelfTest\.Stderr\.Trim\(\) -cne \$collectorSelfTestExpectedStream/u,
  );
  const collectorSelfTest = runner.indexOf(
    "Label 'collector-prewrite-redaction-self-test'",
  );
  const dockerAvailabilityProbe = runner.indexOf(
    "Invoke-Docker 'docker-version'",
  );
  assert.ok(
    collectorSelfTest >= 0 && dockerAvailabilityProbe > collectorSelfTest,
  );
  const preWriteSanitization = runner.indexOf("$preWriteRedactionsApplied = 0");
  const dynamicSentinelLoad = runner.indexOf(
    "foreach ($sensitive in @(Get-DynamicSentinelValues $DynamicSentinelDirectory))",
  );
  const firstEvidenceWrite = runner.indexOf(
    "Write-NewText $stdoutPath $stdout",
  );
  const secondEvidenceWrite = runner.indexOf(
    "Write-NewText $stderrPath $stderr",
  );
  assert.ok(
    dynamicSentinelLoad >= 0 &&
      preWriteSanitization > dynamicSentinelLoad &&
      firstEvidenceWrite > preWriteSanitization,
  );
  assert.ok(secondEvidenceWrite > preWriteSanitization);
  assert.match(specification, /Synthetic C3 error containing \$\{sentinel\}/u);
  assert.match(
    specification,
    /privateChannel\.finalizeTestErrors\(\[syntheticError\]\)/u,
  );
  assert.match(
    specification,
    /privateChannel\.finalizeTestErrors\(\[terminalError\]\)/u,
  );
  assert.match(specification, /new Error\('EXPECTED_REDACTED_PROBE_VALUE'\)/u);
  assert.doesNotMatch(
    specification,
    /toHaveValue\('EXPECTED_REDACTED_PROBE_VALUE'\)/u,
  );
  assert.match(runner, /probeErrorContexts\.Count -ne 1/u);
  assert.match(
    runner,
    /Artifact redaction probe error context is not safely neutralized/u,
  );
});
