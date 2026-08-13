import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_TRACKED_BYTES = 10 * 1024 * 1024;
const APPROVED_LARGE_FILES = new Set([
  "docs/source-material/references/adminlte/AdminLTE-master.zip",
]);
const APPROVED_INSTALL_SCRIPTS = new Set([
  "node_modules/@prisma/engines@7.9.1",
  "node_modules/fsevents@2.3.3",
  "node_modules/msgpackr-extract@3.0.4",
  "node_modules/prisma@7.9.1",
  "node_modules/unrs-resolver@1.12.2",
]);
const SECRET_PATTERNS = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/u],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/u],
  ["aws-access-key", /\bAKIA[A-Z0-9]{16}\b/u],
  ["stripe-live-key", /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/u],
  [
    "sentry-production-dsn",
    /https:\/\/[a-f0-9]{16,64}@[a-z0-9.-]*ingest(?:\.[a-z0-9.-]+)?\.sentry\.io\/\d+/iu,
  ],
];

function normalizePath(path) {
  return path.split(sep).join("/");
}

function fail(errors) {
  if (errors.length > 0) {
    throw new Error(
      [
        "Repository security scan failed:",
        ...errors.map((error) => `- ${error}`),
      ].join("\n"),
    );
  }
}

export function findSecretTypes(content) {
  return SECRET_PATTERNS.filter(([, pattern]) => pattern.test(content)).map(
    ([name]) => name,
  );
}

function trackedFiles(repositoryRoot) {
  return execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  )
    .split("\0")
    .filter(Boolean);
}

function scanTrackedFiles(repositoryRoot, files, errors) {
  for (const relativePath of files) {
    const normalized = normalizePath(relativePath);
    const absolutePath = resolve(repositoryRoot, relativePath);
    const size = statSync(absolutePath).size;
    const name = basename(normalized).toLowerCase();
    const extension = extname(name);

    if (
      (name.startsWith(".env") && !name.endsWith(".example")) ||
      [".key", ".pem", ".p12", ".pfx", ".keystore", ".secret", ".dmp"].includes(
        extension,
      ) ||
      /(^|\/)(?:node_modules|\.next|dist|coverage|build)(?:\/|$)/u.test(
        normalized,
      )
    ) {
      errors.push(`forbidden tracked file: ${normalized}`);
    }
    if (size > MAX_TRACKED_BYTES && !APPROVED_LARGE_FILES.has(normalized)) {
      errors.push(`unapproved large file: ${normalized} (${size} bytes)`);
    }
    if (size === 0 || size > 2 * 1024 * 1024) {
      continue;
    }

    const content = readFileSync(absolutePath);
    if (content.includes(0)) {
      continue;
    }
    for (const secretType of findSecretTypes(content.toString("utf8"))) {
      errors.push(
        `high-confidence ${secretType} in tracked file ${normalized}`,
      );
    }
  }
}

function scanHistory(repositoryRoot, errors) {
  const history = execFileSync(
    "git",
    ["log", "--all", "--no-ext-diff", "--format=", "-p", "--", "."],
    { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 },
  );
  for (const secretType of findSecretTypes(history)) {
    errors.push(`high-confidence ${secretType} in Git history`);
  }
}

export function validatePackageLock(lockfile) {
  const errors = [];
  for (const [packagePath, metadata] of Object.entries(
    lockfile.packages ?? {},
  )) {
    if (metadata.link === true) {
      continue;
    }
    if (
      typeof metadata.resolved === "string" &&
      !metadata.resolved.startsWith("https://registry.npmjs.org/")
    ) {
      errors.push(`unapproved npm source for ${packagePath}`);
    }
    if (metadata.hasInstallScript === true) {
      const identity = `${packagePath}@${metadata.version}`;
      if (!APPROVED_INSTALL_SCRIPTS.has(identity)) {
        errors.push(`unapproved install script: ${identity}`);
      }
    }
  }
  return errors;
}

function validateManifestVersions(repositoryRoot, files, errors) {
  for (const relativePath of files.filter(
    (path) => basename(path) === "package.json",
  )) {
    const manifest = JSON.parse(
      readFileSync(resolve(repositoryRoot, relativePath), "utf8"),
    );
    for (const section of [
      "dependencies",
      "devDependencies",
      "optionalDependencies",
    ]) {
      for (const [name, version] of Object.entries(manifest[section] ?? {})) {
        if (
          typeof version !== "string" ||
          !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(version)
        ) {
          errors.push(
            `non-exact ${section} version in ${relativePath}: ${name}`,
          );
        }
      }
    }
  }
}

function validatePubLock(repositoryRoot, errors) {
  const content = readFileSync(
    resolve(repositoryRoot, "apps", "mobile", "pubspec.lock"),
    "utf8",
  );
  for (const match of content.matchAll(/^\s+url:\s+"([^"]+)"\s*$/gmu)) {
    if (match[1] !== "https://pub.dev") {
      errors.push("unapproved Flutter package source");
    }
  }
  for (const match of content.matchAll(/^\s+source:\s+(\S+)\s*$/gmu)) {
    if (!["hosted", "sdk"].includes(match[1])) {
      errors.push(`unapproved Flutter source type: ${match[1]}`);
    }
  }
}

function verifyImmutableBaseline(repositoryRoot, errors) {
  const manifest = readFileSync(
    resolve(repositoryRoot, "docs", "governance", "SOURCE_BASELINE_MANIFEST.sha256"),
    "utf8",
  );
  const entries = manifest
    .split(/\r?\n/u)
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.match(/^([a-f0-9]{64})  (.+)$/u));

  for (const entry of entries) {
    if (entry === null) {
      errors.push("invalid immutable baseline manifest entry");
      continue;
    }
    const [, expected, relativePath] = entry;
    const actual = createHash("sha256")
      .update(readFileSync(resolve(repositoryRoot, relativePath)))
      .digest("hex");
    if (actual !== expected) {
      errors.push(`immutable baseline mismatch: ${relativePath}`);
    }
  }
  return entries.length;
}

export function scanRepository(repositoryRoot = process.cwd(), options = {}) {
  const errors = [];
  const files = trackedFiles(repositoryRoot);
  scanTrackedFiles(repositoryRoot, files, errors);
  validateManifestVersions(repositoryRoot, files, errors);
  errors.push(
    ...validatePackageLock(
      JSON.parse(
        readFileSync(resolve(repositoryRoot, "package-lock.json"), "utf8"),
      ),
    ),
  );
  validatePubLock(repositoryRoot, errors);
  const immutableFiles = verifyImmutableBaseline(repositoryRoot, errors);
  if (options.history !== false) {
    scanHistory(repositoryRoot, errors);
  }
  fail(errors);
  return {
    approvedInstallScripts: APPROVED_INSTALL_SCRIPTS.size,
    historyScanned: options.history !== false,
    immutableFiles,
    trackedFiles: files.length,
  };
}

const direct =
  process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() ===
    resolve(process.argv[1]).toLowerCase();

if (direct) {
  const result = scanRepository();
  console.log(
    `Security scan passed: ${result.trackedFiles} files, history=${result.historyScanned}, immutable=${result.immutableFiles}, ${result.approvedInstallScripts} qualified install scripts.`,
  );
}
