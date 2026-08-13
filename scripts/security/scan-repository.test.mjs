import assert from "node:assert/strict";
import { test } from "node:test";

import { findSecretTypes, validatePackageLock } from "./scan-repository.mjs";

test("high-confidence production credentials are detected without returning values", () => {
  assert.deepEqual(
    findSecretTypes(`credential=${"AKIA"}${"ABCDEFGHIJKLMNOP"}`),
    ["aws-access-key"],
  );
  assert.deepEqual(findSecretTypes("token=local-test-only"), []);
});

test("npm sources outside the official registry are rejected", () => {
  assert.deepEqual(
    validatePackageLock({
      packages: {
        "node_modules/example": {
          resolved: "https://packages.example.test/example.tgz",
          version: "1.0.0",
        },
      },
    }),
    ["unapproved npm source for node_modules/example"],
  );
});

test("unknown install scripts are rejected", () => {
  assert.deepEqual(
    validatePackageLock({
      packages: {
        "node_modules/example": {
          hasInstallScript: true,
          resolved: "https://registry.npmjs.org/example/-/example-1.0.0.tgz",
          version: "1.0.0",
        },
      },
    }),
    ["unapproved install script: node_modules/example@1.0.0"],
  );
});
