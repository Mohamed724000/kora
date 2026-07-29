import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_NODE_VERSION = "22.18.0";
const EXPECTED_NPM_VERSION = "10.9.3";
const EXPECTED_FLUTTER_VERSION = "3.44.1";
const EXPECTED_DART_VERSION = "3.12.1";

function runVersionCommand(executable, argumentsList) {
  try {
    return execFileSync(executable, argumentsList, {
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stderr =
      typeof error?.stderr === "string" ? error.stderr.trim() : undefined;
    throw new Error(stderr || `${executable} is unavailable.`);
  }
}

function readNpmVersion() {
  if (process.env.npm_execpath) {
    return execFileSync(
      process.execPath,
      [process.env.npm_execpath, "--version"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
  }

  return runVersionCommand(process.platform === "win32" ? "npm.cmd" : "npm", [
    "--version",
  ]);
}

function readFlutterVersion() {
  const executable = process.platform === "win32" ? "flutter.bat" : "flutter";
  const output = runVersionCommand(executable, ["--version", "--machine"]);

  try {
    return JSON.parse(output);
  } catch {
    throw new Error("Flutter returned an unreadable version payload.");
  }
}

export function resolveDartExecutable(flutterVersion = readFlutterVersion()) {
  if (process.platform !== "win32") {
    return "dart";
  }

  if (typeof flutterVersion?.flutterRoot !== "string") {
    throw new Error("Flutter did not expose its SDK root.");
  }

  return resolve(
    flutterVersion.flutterRoot,
    "bin",
    "cache",
    "dart-sdk",
    "bin",
    "dart.exe",
  );
}

function readDartVersion(flutterVersion) {
  const executable = resolveDartExecutable(flutterVersion);
  const result = spawnSync(executable, ["--version"], {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const combined = [result.stdout, result.stderr]
    .filter((value) => typeof value === "string")
    .join(" ");
  const match = combined.match(/Dart SDK version:\s+([0-9.]+)/);

  if (result.error || result.status !== 0 || !match) {
    throw new Error("Dart is unavailable or returned an unreadable version.");
  }

  return match[1];
}

export function validateEnvironment() {
  const failures = [];
  let npmVersion;
  let flutterVersion;
  let dartVersion;

  try {
    npmVersion = readNpmVersion();
  } catch (error) {
    failures.push(`npm check failed: ${error.message}`);
  }

  try {
    flutterVersion = readFlutterVersion();
  } catch (error) {
    failures.push(`Flutter check failed: ${error.message}`);
  }

  try {
    dartVersion = readDartVersion(flutterVersion);
  } catch (error) {
    failures.push(`Dart check failed: ${error.message}`);
  }

  if (process.versions.node !== EXPECTED_NODE_VERSION) {
    failures.push(
      `Node ${EXPECTED_NODE_VERSION} required; found ${process.versions.node}.`,
    );
  }

  if (npmVersion && npmVersion !== EXPECTED_NPM_VERSION) {
    failures.push(`npm ${EXPECTED_NPM_VERSION} required; found ${npmVersion}.`);
  }

  if (
    flutterVersion?.frameworkVersion &&
    flutterVersion.frameworkVersion !== EXPECTED_FLUTTER_VERSION
  ) {
    failures.push(
      `Flutter ${EXPECTED_FLUTTER_VERSION} required; found ${flutterVersion.frameworkVersion}.`,
    );
  }

  if (dartVersion && dartVersion !== EXPECTED_DART_VERSION) {
    failures.push(
      `Dart ${EXPECTED_DART_VERSION} required; found ${dartVersion}.`,
    );
  }

  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }

  console.log(
    [
      `Environment OK: Node ${EXPECTED_NODE_VERSION}`,
      `npm ${EXPECTED_NPM_VERSION}`,
      `Flutter ${EXPECTED_FLUTTER_VERSION}`,
      `Dart ${EXPECTED_DART_VERSION}`,
    ].join(", "),
  );
}

const isDirectExecution =
  process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() ===
    process.argv[1].toLowerCase();

if (isDirectExecution) {
  try {
    validateEnvironment();
  } catch (error) {
    console.error(`Environment check failed: ${error.message}`);
    process.exit(1);
  }
}
