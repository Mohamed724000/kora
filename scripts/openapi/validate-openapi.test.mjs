import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  OPENAPI_PATH,
  readAndValidateOpenApi,
  validateOpenApiDocument,
} from "./validate-openapi.mjs";

test("the foundation OpenAPI contract is semantically valid", () => {
  assert.deepEqual(readAndValidateOpenApi(), {
    paths: 2,
    references: "resolved",
    schemas: 3,
  });
});

test("business routes are rejected before Slice 1", () => {
  const document = JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
  document.paths["/api/v1/users"] = { get: { responses: { 200: {} } } };

  assert.throws(
    () => validateOpenApiDocument(document),
    /paths must be exactly \/health\/live, \/health\/ready/,
  );
});

test("unresolved local references are rejected", () => {
  const document = JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
  document.components.schemas.ReadinessResponse.properties.checks.properties[
    "redis"
  ].$ref = "#/components/schemas/Missing";

  assert.throws(
    () => validateOpenApiDocument(document),
    /unresolved reference/,
  );
});
