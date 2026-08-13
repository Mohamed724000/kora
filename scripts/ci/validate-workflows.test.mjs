import assert from "node:assert/strict";
import { test } from "node:test";

import {
  validateWorkflowText,
  validateWorkflows,
} from "./validate-workflows.mjs";

test("all committed workflows pass the local policy", () => {
  assert.deepEqual(validateWorkflows(), { actions: 4, workflows: 4 });
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
