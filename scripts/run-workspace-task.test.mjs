import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { runCommand } from "./run-workspace-task.mjs";

test("API compilation and tests generate Prisma from a clean checkout", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../apps/api/package.json", import.meta.url), "utf8"),
  );

  assert.equal(
    manifest.scripts["db:generate"],
    "prisma generate --config prisma.config.ts",
  );
  for (const task of ["build", "test", "typecheck"]) {
    assert.equal(manifest.scripts[`pre${task}`], "npm run db:generate");
  }
});

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
