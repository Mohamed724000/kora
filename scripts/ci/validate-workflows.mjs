import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const WORKFLOW_PATHS = [
  ".github/workflows/infrastructure.yml",
  ".github/workflows/launcher-windows.yml",
  ".github/workflows/quality-linux.yml",
  ".github/workflows/security.yml",
];

const APPROVED_ACTIONS = new Set([
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  "actions/setup-java@b6effb05e454b25005698d916606bdc6ffcbf961",
  "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
  "subosito/flutter-action@1a449444c387b1966244ae4d4f8c696479add0b2",
]);

export function validateWorkflowText(path, text) {
  const errors = [];
  for (const trigger of ["pull_request:", "push:", "workflow_dispatch:"]) {
    if (!text.includes(trigger)) {
      errors.push(`${path}: missing trigger ${trigger}`);
    }
  }
  if (!/^permissions:\r?\n  contents: read$/mu.test(text)) {
    errors.push(`${path}: permissions must be contents: read only`);
  }
  if (
    /pull_request_target:|permissions:[\s\S]*?\bwrite\b|printenv|set\s+-x/iu.test(
      text,
    )
  ) {
    errors.push(`${path}: unsafe trigger, permission or environment dump`);
  }

  const actions = [...text.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)\s*$/gmu)].map(
    (match) => match[1],
  );
  if (actions.length === 0) {
    errors.push(`${path}: no pinned action`);
  }
  for (const action of actions) {
    if (
      !/^[^@]+@[a-f0-9]{40}$/u.test(action) ||
      !APPROVED_ACTIONS.has(action)
    ) {
      errors.push(`${path}: unapproved or unpinned action ${action}`);
    }
  }

  const jobs = [...text.matchAll(/^\s{4}runs-on:/gmu)].length;
  const timeouts = [...text.matchAll(/^\s{4}timeout-minutes:/gmu)].length;
  if (jobs === 0 || jobs !== timeouts) {
    errors.push(`${path}: every job needs a timeout`);
  }
  return errors;
}

export function validateWorkflows(repositoryRoot = process.cwd()) {
  const errors = WORKFLOW_PATHS.flatMap((path) =>
    validateWorkflowText(
      path,
      readFileSync(resolve(repositoryRoot, path), "utf8"),
    ),
  );
  const infrastructure = readFileSync(
    resolve(repositoryRoot, ".github/workflows/infrastructure.yml"),
    "utf8",
  );
  if (!/if: always\(\)[\s\S]*npm run infra:down/u.test(infrastructure)) {
    errors.push("infrastructure workflow lacks unconditional shutdown");
  }
  const windows = readFileSync(
    resolve(repositoryRoot, ".github/workflows/launcher-windows.yml"),
    "utf8",
  );
  if (
    !windows.includes("verify-launcher-failure.mjs") ||
    !windows.includes("npm.cmd test")
  ) {
    errors.push(
      "Windows workflow does not exercise launcher propagation and root tests",
    );
  }
  const security = readFileSync(
    resolve(repositoryRoot, ".github/workflows/security.yml"),
    "utf8",
  );
  for (const requiredGate of [
    "npm ls --all",
    "npm audit --audit-level=low",
    "npm audit --omit=dev --audit-level=low",
    "npm run licenses",
    "npm run security:scan",
    "git diff --exit-code -- package-lock.json apps/mobile/pubspec.lock",
  ]) {
    if (!security.includes(requiredGate)) {
      errors.push(`security workflow lacks required gate: ${requiredGate}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(
      [
        "Workflow validation failed:",
        ...errors.map((entry) => `- ${entry}`),
      ].join("\n"),
    );
  }
  return { actions: APPROVED_ACTIONS.size, workflows: WORKFLOW_PATHS.length };
}

const direct =
  process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() ===
    resolve(process.argv[1]).toLowerCase();

if (direct) {
  const result = validateWorkflows();
  console.log(
    `Workflow validation passed: ${result.workflows} workflows, ${result.actions} approved pinned actions.`,
  );
}
