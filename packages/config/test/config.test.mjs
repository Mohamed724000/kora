import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("shared configuration is strict and environment-neutral", () => {
  const base = JSON.parse(
    readFileSync(new URL("../typescript/base.json", import.meta.url), "utf8"),
  );
  const packageText = readFileSync(
    new URL("../package.json", import.meta.url),
    "utf8",
  );

  assert.equal(base.compilerOptions.strict, true);
  assert.doesNotMatch(packageText, /https?:\/\//);
  assert.doesNotMatch(packageText, /password|secret|token/i);
});
