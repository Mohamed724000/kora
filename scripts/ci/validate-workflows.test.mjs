import assert from "node:assert/strict";
import { test } from "node:test";

import {
  validateInfrastructureGateText,
  validateSecurityGateText,
  validateWorkflowText,
  validateWorkflows,
} from "./validate-workflows.mjs";

test("all committed workflows pass the local policy", () => {
  assert.deepEqual(validateWorkflows(), { actions: 4, workflows: 4 });
});

test("the Next rootDir compatibility gate is unique and precedes audits", () => {
  const valid = `
      - name: Install
        run: npm ci --ignore-scripts
      - name: Qualify Next ESLint glob compatibility
        run: npm run security:next-root-dirs
      - name: Audit
        run: npm audit --audit-level=low
  `;
  assert.deepEqual(validateSecurityGateText(valid), []);
  assert.ok(
    validateSecurityGateText(
      valid.replace("npm run security:next-root-dirs", "npm run security:scan"),
    ).some((error) => error.includes("exactly once")),
  );
  assert.ok(
    validateSecurityGateText(
      valid.replace("npm ci --ignore-scripts", "npm audit --audit-level=low"),
    ).some((error) => error.includes("after install and before audits")),
  );
  assert.ok(
    validateSecurityGateText(`${valid}\n        continue-on-error: true`),
  );
});

test("the C1 PostgreSQL workflow gate is real, named and unique", () => {
  const valid = `
      - name: Validate Admin Auth Session PostgreSQL runtime
        shell: pwsh
        run: ./apps/api/prisma/run-admin-auth-runtime-validation.ps1
  `;
  assert.deepEqual(validateInfrastructureGateText(valid), []);
  assert.ok(
    validateInfrastructureGateText(
      valid.replace("shell: pwsh", "shell: bash"),
    ).some((error) => error.includes("executable")),
  );
  assert.ok(
    validateInfrastructureGateText(
      valid.replace(/run-admin-auth-runtime-validation\.ps1/u, "missing.ps1"),
    ).some((error) => error.includes("executable")),
  );
});

test("an action tag and write permission are rejected", () => {
  const errors = validateWorkflowText(
    "unsafe.yml",
    `on:
  pull_request:
  push:
  workflow_dispatch:
permissions:
  contents: write
jobs:
  unsafe:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v7
`,
  );

  assert.ok(errors.some((error) => error.includes("permissions")));
  assert.ok(errors.some((error) => error.includes("unpinned")));
});
