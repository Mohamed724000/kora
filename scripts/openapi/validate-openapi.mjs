import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const OPENAPI_PATH = resolve("docs", "api", "openapi.yaml");
const EXPECTED_PATHS = ["/health/live", "/health/ready"];

function fail(message) {
  throw new Error(`OpenAPI validation failed: ${message}`);
}

function resolveReference(document, reference) {
  if (!reference.startsWith("#/")) {
    fail(`external reference is forbidden: ${reference}`);
  }
  return reference
    .slice(2)
    .split("/")
    .reduce(
      (value, segment) =>
        value?.[segment.replaceAll("~1", "/").replaceAll("~0", "~")],
      document,
    );
}

function validateReferences(document, value, location = "#") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      validateReferences(document, entry, `${location}/${index}`),
    );
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  if (
    typeof value.$ref === "string" &&
    resolveReference(document, value.$ref) === undefined
  ) {
    fail(`unresolved reference at ${location}`);
  }
  for (const [key, entry] of Object.entries(value)) {
    validateReferences(document, entry, `${location}/${key}`);
  }
}

function responseSchema(operation, status) {
  return operation.responses?.[status]?.content?.["application/json"]?.schema
    ?.$ref;
}

export function validateOpenApiDocument(document) {
  if (document.openapi !== "3.1.0") {
    fail("openapi must be exactly 3.1.0");
  }
  if (
    document.info?.title !== "KORA+ Foundation API" ||
    document.info?.version !== "0.5.0"
  ) {
    fail("foundation title or version is incorrect");
  }

  const paths = Object.keys(document.paths ?? {}).sort();
  if (JSON.stringify(paths) !== JSON.stringify([...EXPECTED_PATHS].sort())) {
    fail(`paths must be exactly ${EXPECTED_PATHS.join(", ")}`);
  }

  for (const path of EXPECTED_PATHS) {
    const pathItem = document.paths[path];
    const methods = Object.keys(pathItem ?? {});
    if (methods.length !== 1 || methods[0] !== "get") {
      fail(`${path} must expose GET only`);
    }
    if (!pathItem.get.operationId || !pathItem.get.summary) {
      fail(`${path} requires operationId and summary`);
    }
  }

  const live = document.paths["/health/live"].get;
  if (Object.keys(live.responses ?? {}).join(",") !== "200") {
    fail("/health/live must declare HTTP 200 only");
  }
  if (responseSchema(live, "200") !== "#/components/schemas/LivenessResponse") {
    fail("/health/live response schema drift");
  }

  const ready = document.paths["/health/ready"].get;
  if (
    JSON.stringify(Object.keys(ready.responses ?? {}).sort()) !==
    JSON.stringify(["200", "503"])
  ) {
    fail("/health/ready must declare HTTP 200 and 503");
  }
  for (const status of ["200", "503"]) {
    if (
      responseSchema(ready, status) !== "#/components/schemas/ReadinessResponse"
    ) {
      fail(`/health/ready HTTP ${status} schema drift`);
    }
  }

  const schemas = document.components?.schemas;
  for (const name of [
    "LivenessResponse",
    "DependencyHealth",
    "ReadinessResponse",
  ]) {
    if (schemas?.[name] === undefined) {
      fail(`missing schema ${name}`);
    }
  }
  if (schemas.LivenessResponse.properties?.status?.const !== "live") {
    fail("liveness status must be live");
  }
  if (
    JSON.stringify(schemas.ReadinessResponse.properties?.status?.enum) !==
    JSON.stringify(["ready", "not_ready"])
  ) {
    fail("readiness status enum drift");
  }
  const checks = schemas.ReadinessResponse.properties?.checks;
  if (
    JSON.stringify([...(checks?.required ?? [])].sort()) !==
      JSON.stringify(["postgresql", "redis"]) ||
    checks?.additionalProperties !== false
  ) {
    fail("readiness dependencies must be exactly PostgreSQL and Redis");
  }

  validateReferences(document, document);
  return { paths: EXPECTED_PATHS.length, references: "resolved", schemas: 3 };
}

export function readAndValidateOpenApi(path = OPENAPI_PATH) {
  let document;
  try {
    document = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    fail("docs/api/openapi.yaml must be JSON-compatible YAML");
  }
  return validateOpenApiDocument(document);
}

const direct =
  process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() ===
    resolve(process.argv[1]).toLowerCase();

if (direct) {
  const result = readAndValidateOpenApi();
  console.log(
    `OpenAPI foundation valid: ${result.paths} paths, ${result.schemas} schemas, references ${result.references}.`,
  );
}
