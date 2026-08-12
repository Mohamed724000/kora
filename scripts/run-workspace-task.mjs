import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDartExecutable } from "./check-environment.mjs";

const EXPECTED_VERSIONS = {
  dart: "3.12.1",
  flutter: "3.44.1",
  node: "22.18.0",
  npm: "10.9.3",
};

const SUPPORTED_TASKS = new Set([
  "format",
  "lint",
  "typecheck",
  "test",
  "build",
]);

const MOBILE_COMMANDS = {
  format: ["dart", ["format", "--output=none", "--set-exit-if-changed", "."]],
  lint: ["flutter", ["analyze"]],
  typecheck: ["dart", ["analyze", "--fatal-warnings"]],
  test: ["flutter", ["test"]],
};

let validatedDartExecutable;

function commandUsesWindowsShell(executable) {
  return process.platform === "win32" && /\.(?:bat|cmd)$/i.test(executable);
}

function captureCommand(executable, argumentsList) {
  return new Promise((resolveCapture, rejectCapture) => {
    const child = spawn(executable, argumentsList, {
      shell: commandUsesWindowsShell(executable),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    let settled = false;

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", (error) => {
      settled = true;
      rejectCapture(error);
    });
    child.once("close", (code, signal) => {
      if (settled) {
        return;
      }

      if (code === 0) {
        resolveCapture({
          stderr: Buffer.concat(stderr).toString("utf8").trim(),
          stdout: Buffer.concat(stdout).toString("utf8").trim(),
        });
        return;
      }

      const detail = Buffer.concat(stderr).toString("utf8").trim();
      const outcome =
        signal === null ? `code ${code ?? "unknown"}` : `signal ${signal}`;
      rejectCapture(
        new Error(detail || `${executable} exited with ${outcome}.`),
      );
    });
  });
}

function resolveWindowsFlutterRoot() {
  const candidates = [
    process.env.FLUTTER_ROOT,
    ...(process.env.PATH ?? "")
      .split(delimiter)
      .filter(Boolean)
      .map((pathEntry) => dirname(dirname(resolve(pathEntry, "flutter.bat")))),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const flutterExecutable = resolve(candidate, "bin", "flutter.bat");
    const versionManifest = resolve(
      candidate,
      "bin",
      "cache",
      "flutter.version.json",
    );

    if (existsSync(flutterExecutable) && existsSync(versionManifest)) {
      return candidate;
    }
  }

  throw new Error("Flutter is unavailable or its SDK metadata is missing.");
}

async function validateLauncherEnvironment() {
  const failures = [];
  let npmVersion;
  let flutterVersion;
  let dartVersion;

  try {
    const npmCommand = process.env.npm_execpath
      ? [process.execPath, [process.env.npm_execpath, "--version"]]
      : [process.platform === "win32" ? "npm.cmd" : "npm", ["--version"]];
    npmVersion = (await captureCommand(...npmCommand)).stdout;
  } catch (error) {
    failures.push(`npm check failed: ${error.message}`);
  }

  try {
    if (process.platform === "win32") {
      const flutterRoot = resolveWindowsFlutterRoot();
      const versionManifest = resolve(
        flutterRoot,
        "bin",
        "cache",
        "flutter.version.json",
      );
      flutterVersion = {
        ...JSON.parse(readFileSync(versionManifest, "utf8")),
        flutterRoot,
      };
    } else {
      const output = await captureCommand("flutter", [
        "--version",
        "--machine",
      ]);
      flutterVersion = JSON.parse(output.stdout);
    }
  } catch (error) {
    failures.push(`Flutter check failed: ${error.message}`);
  }

  try {
    if (!flutterVersion) {
      throw new Error("Flutter SDK metadata is unavailable.");
    }
    validatedDartExecutable = resolveDartExecutable(flutterVersion);
    const output = await captureCommand(validatedDartExecutable, ["--version"]);
    const match = `${output.stdout} ${output.stderr}`.match(
      /Dart SDK version:\s+([0-9.]+)/,
    );

    if (!match) {
      throw new Error("Dart returned an unreadable version.");
    }
    dartVersion = match[1];
  } catch (error) {
    failures.push(`Dart check failed: ${error.message}`);
  }

  if (process.versions.node !== EXPECTED_VERSIONS.node) {
    failures.push(
      `Node ${EXPECTED_VERSIONS.node} required; found ${process.versions.node}.`,
    );
  }
  if (npmVersion && npmVersion !== EXPECTED_VERSIONS.npm) {
    failures.push(
      `npm ${EXPECTED_VERSIONS.npm} required; found ${npmVersion}.`,
    );
  }
  if (
    flutterVersion?.frameworkVersion &&
    flutterVersion.frameworkVersion !== EXPECTED_VERSIONS.flutter
  ) {
    failures.push(
      `Flutter ${EXPECTED_VERSIONS.flutter} required; found ${flutterVersion.frameworkVersion}.`,
    );
  }
  if (dartVersion && dartVersion !== EXPECTED_VERSIONS.dart) {
    failures.push(
      `Dart ${EXPECTED_VERSIONS.dart} required; found ${dartVersion}.`,
    );
  }

  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }

  console.log(
    [
      `Environment OK: Node ${EXPECTED_VERSIONS.node}`,
      `npm ${EXPECTED_VERSIONS.npm}`,
      `Flutter ${EXPECTED_VERSIONS.flutter}`,
      `Dart ${EXPECTED_VERSIONS.dart}`,
    ].join(", "),
  );
}

function resolveCommand(executable, argumentsList) {
  let resolvedExecutable = executable;
  let resolvedArguments = argumentsList;

  if (process.platform === "win32" && executable === "npm") {
    resolvedExecutable = "npm.cmd";
  } else if (process.platform === "win32" && executable === "dart") {
    resolvedExecutable = validatedDartExecutable;
  } else if (process.platform === "win32" && executable === "flutter") {
    resolvedExecutable = validatedDartExecutable;
    resolvedArguments = [
      resolve(
        dirname(resolvedExecutable),
        "..",
        "..",
        "flutter_tools.snapshot",
      ),
      ...argumentsList,
    ];
  }

  return { resolvedArguments, resolvedExecutable };
}

export function runCommand(executable, argumentsList, options = {}) {
  const { resolvedArguments, resolvedExecutable } = resolveCommand(
    executable,
    argumentsList,
  );
  const requiresShell = commandUsesWindowsShell(resolvedExecutable);

  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(resolvedExecutable, resolvedArguments, {
      cwd: options.cwd,
      shell: requiresShell,
      stdio: "inherit",
      windowsHide: true,
    });
    let settled = false;

    child.once("error", (error) => {
      settled = true;
      rejectRun(error);
    });
    child.once("close", (code, signal) => {
      if (settled) {
        return;
      }

      if (code === 0) {
        resolveRun();
        return;
      }

      const outcome =
        signal === null ? `code ${code ?? "unknown"}` : `signal ${signal}`;
      rejectRun(
        new Error(
          `${resolvedExecutable} ${resolvedArguments.join(" ")} exited with ${outcome}.`,
        ),
      );
    });
  });
}

function readWorkspaceManifests() {
  const rootManifest = JSON.parse(readFileSync("package.json", "utf8"));
  return rootManifest.workspaces.map((workspacePath) => {
    const manifestPath = resolve(workspacePath, "package.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    return { manifest, workspacePath };
  });
}

function validateWorkspaceScripts(task, workspaces) {
  const missing = workspaces
    .filter(({ manifest }) => typeof manifest.scripts?.[task] !== "string")
    .map(({ workspacePath }) => workspacePath);

  if (missing.length > 0) {
    throw new Error(`Task "${task}" is missing from: ${missing.join(", ")}.`);
  }
}

async function runMobileBuild() {
  await runCommand("flutter", ["build", "apk", "--debug"], {
    cwd: "apps/mobile",
  });

  if (process.platform === "darwin") {
    await runCommand("flutter", ["build", "ios", "--debug", "--no-codesign"], {
      cwd: "apps/mobile",
    });
  } else {
    console.log(
      `NON EXÉCUTÉ — flutter build ios: hôte ${process.platform} non compatible avec Xcode.`,
    );
  }
}

export async function runWorkspaceTask(task) {
  if (!SUPPORTED_TASKS.has(task)) {
    throw new Error(
      `Usage: node scripts/run-workspace-task.mjs <${[...SUPPORTED_TASKS].join("|")}>`,
    );
  }

  await validateLauncherEnvironment();
  const workspaces = readWorkspaceManifests();
  validateWorkspaceScripts(task, workspaces);

  for (const { manifest } of workspaces) {
    console.log(`\n> ${task}: ${manifest.name}`);
    await runCommand("npm", ["run", task, "--workspace", manifest.name]);
  }

  console.log(`\n> ${task}: @kora/mobile`);
  if (task === "build") {
    await runMobileBuild();
  } else {
    const [executable, argumentsList] = MOBILE_COMMANDS[task];
    await runCommand(executable, argumentsList, { cwd: "apps/mobile" });
  }
}

const isDirectExecution =
  process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() ===
    resolve(process.argv[1]).toLowerCase();

if (isDirectExecution) {
  const task = process.argv[2];

  try {
    await runWorkspaceTask(task);
  } catch (error) {
    console.error(`Task "${task}" failed: ${error.message}`);
    process.exitCode = 1;
  }
}
