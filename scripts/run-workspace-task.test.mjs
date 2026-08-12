import assert from "node:assert/strict";
import { test } from "node:test";

import { runCommand } from "./run-workspace-task.mjs";

test("runCommand waits for a child to terminate", async () => {
  const startedAt = Date.now();

  await runCommand(process.execPath, ["-e", "setTimeout(() => {}, 150)"]);

  assert.ok(Date.now() - startedAt >= 100);
});

test("runCommand rejects when a child exits with a non-zero code", async () => {
  await assert.rejects(
    runCommand(process.execPath, ["-e", "process.exitCode = 23"]),
    /exited with code 23/,
  );
});
