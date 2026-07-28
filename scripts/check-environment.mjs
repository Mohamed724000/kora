import { execFileSync } from "node:child_process";

const EXPECTED_NODE_VERSION = "22.18.0";
const EXPECTED_NPM_VERSION = "10.9.3";
const RESERVED_TASKS = new Set([
  "format",
  "lint",
  "typecheck",
  "test",
  "build",
]);

const argumentsList = process.argv.slice(2);

if (argumentsList.length > 1 || (argumentsList[0] && !argumentsList[0].startsWith("--task="))) {
  console.error("Usage: node scripts/check-environment.mjs [--task=<task>]");
  process.exit(1);
}

const task = argumentsList[0]?.slice("--task=".length);

if (task && !RESERVED_TASKS.has(task)) {
  console.error(`Unknown task: ${task}`);
  process.exit(1);
}

let npmVersion;

try {
  if (process.env.npm_execpath) {
    npmVersion = execFileSync(
      process.execPath,
      [process.env.npm_execpath, "--version"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
  } else {
    const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
    npmVersion = execFileSync(npmExecutable, ["--version"], {
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  }
} catch {
  console.error("Environment check failed: npm is unavailable.");
  process.exit(1);
}

const failures = [];

if (process.versions.node !== EXPECTED_NODE_VERSION) {
  failures.push(
    `Node ${EXPECTED_NODE_VERSION} required; found ${process.versions.node}.`,
  );
}

if (npmVersion !== EXPECTED_NPM_VERSION) {
  failures.push(`npm ${EXPECTED_NPM_VERSION} required; found ${npmVersion}.`);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`Environment check failed: ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Environment OK: Node ${EXPECTED_NODE_VERSION}, npm ${EXPECTED_NPM_VERSION}.`,
);

if (task) {
  console.log(
    `NON EXÉCUTÉ — ${task}: aucun package applicatif n'est initialisé pendant Sprint 0.2.`,
  );
}
