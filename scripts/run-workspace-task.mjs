import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";

import {
  resolveDartExecutable,
  validateEnvironment,
} from "./check-environment.mjs";

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

function run(executable, argumentsList, options = {}) {
  let resolvedExecutable = executable;
  let resolvedArguments = argumentsList;

  if (process.platform === "win32" && executable === "npm") {
    resolvedExecutable = "npm.cmd";
  } else if (process.platform === "win32" && executable === "dart") {
    resolvedExecutable = resolveDartExecutable();
  } else if (process.platform === "win32" && executable === "flutter") {
    resolvedExecutable = resolveDartExecutable();
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

  const requiresShell =
    process.platform === "win32" && /\.(?:bat|cmd)$/i.test(resolvedExecutable);
  const result = spawnSync(resolvedExecutable, resolvedArguments, {
    cwd: options.cwd,
    encoding: "utf8",
    shell: requiresShell,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${resolvedExecutable} ${argumentsList.join(" ")} exited with code ${result.status}.`,
    );
  }
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

function runMobileBuild() {
  run("flutter", ["build", "apk", "--debug"], { cwd: "apps/mobile" });

  if (process.platform === "darwin") {
    run("flutter", ["build", "ios", "--debug", "--no-codesign"], {
      cwd: "apps/mobile",
    });
  } else {
    console.log(
      `NON EXÉCUTÉ — flutter build ios: hôte ${process.platform} non compatible avec Xcode.`,
    );
  }
}

const task = process.argv[2];

if (!SUPPORTED_TASKS.has(task)) {
  console.error(
    `Usage: node scripts/run-workspace-task.mjs <${[...SUPPORTED_TASKS].join("|")}>`,
  );
  process.exit(1);
}

try {
  validateEnvironment();
  const workspaces = readWorkspaceManifests();
  validateWorkspaceScripts(task, workspaces);

  for (const { manifest } of workspaces) {
    console.log(`\n> ${task}: ${manifest.name}`);
    run("npm", ["run", task, "--workspace", manifest.name]);
  }

  console.log(`\n> ${task}: @kora/mobile`);
  if (task === "build") {
    runMobileBuild();
  } else {
    const [executable, argumentsList] = MOBILE_COMMANDS[task];
    run(executable, argumentsList, { cwd: "apps/mobile" });
  }
} catch (error) {
  console.error(`Task "${task}" failed: ${error.message}`);
  process.exit(1);
}
