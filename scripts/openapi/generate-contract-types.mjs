import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXACT_PRETTIER_VERSION = "3.9.6";

const require = createRequire(import.meta.url);

const OPENAPI_PATH = resolve("docs", "api", "openapi.yaml");
const OUTPUT_PATH = resolve(
  "packages",
  "contracts",
  "src",
  "generated",
  "audio-pilot.ts",
);

function propertyName(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

function schemaType(schema) {
  if (schema?.$ref) {
    return schema.$ref.split("/").at(-1);
  }
  if (Array.isArray(schema?.oneOf)) {
    const { oneOf, ...baseSchema } = schema;
    const hasBaseShape =
      baseSchema.type !== undefined ||
      baseSchema.properties !== undefined ||
      baseSchema.allOf !== undefined;
    const inheritedRequired = new Set(baseSchema.required ?? []);
    return oneOf
      .map((branch) => {
        const branchRequired = new Set(branch.required ?? []);
        const branchPropertyNames = new Set([
          ...Object.keys(branch.properties ?? {}),
          ...(branch.oneOf ?? []).flatMap((nestedBranch) =>
            Object.keys(nestedBranch.properties ?? {}),
          ),
        ]);
        for (const property of branchPropertyNames) {
          if (inheritedRequired.has(property)) branchRequired.add(property);
        }
        const normalizedBranch =
          branchRequired.size > 0
            ? { ...branch, required: [...branchRequired] }
            : branch;
        return hasBaseShape
          ? `(${schemaType(baseSchema)} & (${schemaType(normalizedBranch)}))`
          : schemaType(normalizedBranch);
      })
      .join(" | ");
  }
  if (schema?.const !== undefined) {
    return JSON.stringify(schema.const);
  }
  if (Array.isArray(schema?.enum)) {
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  }
  if (Array.isArray(schema?.type)) {
    return schema.type
      .map((type) =>
        type === "null" ? "null" : schemaType({ ...schema, type }),
      )
      .join(" | ");
  }
  if (schema?.type === "array") {
    return `ReadonlyArray<${schemaType(schema.items ?? {})}>`;
  }
  if (Array.isArray(schema?.allOf)) {
    return schema.allOf.map(schemaType).join(" & ");
  }
  if (schema?.type === "object" || schema?.properties) {
    const required = new Set(schema.required ?? []);
    const properties = Object.entries(schema.properties ?? {}).map(
      ([name, value]) =>
        `  readonly ${propertyName(name)}${required.has(name) ? "" : "?"}: ${schemaType(value)};`,
    );
    if (schema.additionalProperties && schema.additionalProperties !== false) {
      properties.push(
        `  readonly [key: string]: ${schemaType(schema.additionalProperties)};`,
      );
    }
    return `{\n${properties.join("\n")}\n}`;
  }
  if (schema?.type === "boolean") {
    return "boolean";
  }
  if (schema?.type === "integer" || schema?.type === "number") {
    return "number";
  }
  if (schema?.type === "string") {
    return "string";
  }
  if (schema?.type === "null") {
    return "null";
  }
  return "unknown";
}

const HTTP_METHODS = new Set([
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
]);

function resolveLocalReference(document, value) {
  if (typeof value?.$ref !== "string") return value;
  return value.$ref
    .slice(2)
    .split("/")
    .reduce(
      (current, segment) =>
        current?.[segment.replaceAll("~1", "/").replaceAll("~0", "~")],
      document,
    );
}

function referencedSchemaName(schema) {
  return typeof schema?.$ref === "string"
    ? schema.$ref.split("/").at(-1)
    : null;
}

export function buildAdminC1ContractPolicies(document) {
  return {
    enrollmentAuditRouting:
      document["x-kora-admin-enrollment-audit-routing-policy"],
    recoveryCodeRotation:
      document["x-kora-admin-recovery-code-rotation-policy"],
    sessionFamilies: document["x-kora-admin-session-family-policy"],
    unavailability: document["x-kora-admin-c1-unavailability-policy"],
  };
}

export function buildAdminSecurityOperations(document) {
  const operations = [];
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (
        !HTTP_METHODS.has(method) ||
        operation?.["x-kora-clients"]?.includes("admin-security") !== true
      ) {
        continue;
      }
      const successEntries = Object.entries(operation.responses ?? {}).filter(
        ([status]) => /^2\d\d$/.test(status),
      );
      const [successStatus, successValue] = successEntries[0] ?? [null, null];
      const success = resolveLocalReference(document, successValue);
      const successMediaTypes = Object.keys(success?.content ?? {});
      const successMediaType = successMediaTypes[0] ?? null;
      const successSchema = successMediaType
        ? success.content[successMediaType]?.schema
        : null;
      const requestMediaTypes = Object.keys(
        operation.requestBody?.content ?? {},
      );
      const requestMediaType = requestMediaTypes[0] ?? null;
      const requestSchema = requestMediaType
        ? operation.requestBody.content[requestMediaType]?.schema
        : null;
      const securityRequirement = operation.security?.[0] ?? {};
      const securityHeaders = Object.keys(securityRequirement).map(
        (schemeName) => {
          const scheme =
            document.components?.securitySchemes?.[schemeName] ?? {};
          return {
            scheme: schemeName,
            in: scheme.type === "http" ? "header" : (scheme.in ?? null),
            name:
              scheme.type === "http" ? "Authorization" : (scheme.name ?? null),
            required: true,
          };
        },
      );
      const resolvedParameters = (operation.parameters ?? []).map((entry) =>
        resolveLocalReference(document, entry),
      );
      const parameterHeaders = resolvedParameters
        .filter((entry) => entry?.in === "header")
        .map((entry) => ({
          scheme: null,
          in: "header",
          name: entry.name,
          required: entry.required === true,
        }));
      const queryParameters = resolvedParameters
        .filter((entry) => entry?.in === "query")
        .map((entry) => ({
          name: entry.name,
          required: entry.required === true,
          schema:
            referencedSchemaName(entry.schema) ?? entry.schema?.type ?? null,
          format: entry.schema?.format ?? null,
        }));
      operations.push({
        path,
        method: method.toUpperCase(),
        operationId: operation.operationId,
        deliverySlice: operation["x-kora-delivery-slice"],
        authorizationClass: operation["x-kora-auth-class"],
        securityRequirement: Object.keys(securityRequirement),
        roles: operation["x-kora-roles"] ?? [],
        stepUpRequired: operation["x-kora-step-up-required"] === true,
        stepUpMode: operation["x-kora-step-up-mode"] ?? null,
        stepUpPurpose: operation["x-kora-step-up-purpose"] ?? null,
        priorStepUpPolicy: operation["x-kora-prior-step-up-policy"] ?? null,
        totpCounterPolicy: operation["x-kora-totp-counter-policy"] ?? null,
        transactionalEffects: operation["x-kora-transaction-effects"] ?? [],
        auditSink: operation["x-kora-audit-sink"],
        auditContextProof: operation["x-kora-audit-context-proof"] ?? null,
        failureAuditSink:
          document["x-kora-admin-failure-audit-sinks"]?.[
            operation.operationId
          ] ?? null,
        rateLimitProfile: operation["x-kora-rate-limit-profile"] ?? null,
        fetchMetadataPolicy: operation["x-kora-fetch-metadata-policy"] ?? null,
        publicFailureTiming:
          document["x-kora-admin-public-failure-timing"]?.[
            operation.operationId
          ] ?? null,
        serviceUnavailable:
          operation["x-kora-delivery-slice"] === "S1.2-03C1"
            ? {
                status: 503,
                errorCode: "SERVICE_UNAVAILABLE",
                publicMessage:
                  document["x-kora-admin-c1-unavailability-policy"]
                    ?.publicMessage ?? null,
              }
            : null,
        signedManifest: operation["x-kora-signed-manifest"] ?? null,
        idempotency: {
          required: operation["x-kora-idempotent"] === true,
          replay: operation["x-kora-idempotent-replay"] ?? null,
        },
        request: requestMediaType
          ? {
              mediaType: requestMediaType,
              schema: referencedSchemaName(requestSchema),
            }
          : null,
        requestHeaders: [...securityHeaders, ...parameterHeaders],
        queryParameters,
        response: {
          status: successStatus,
          mediaType: successMediaType,
          schema:
            referencedSchemaName(successSchema) ??
            (successSchema?.format === "binary" ? "binary" : null),
          headers: Object.keys(success?.headers ?? {}),
        },
      });
    }
  }
  return operations;
}

export function buildContractTypes(document) {
  const paths = Object.keys(document.paths);
  const schemas = Object.entries(document.components?.schemas ?? {});
  const adminSecurityOperations = buildAdminSecurityOperations(document);
  const adminC1ContractPolicies = buildAdminC1ContractPolicies(document);
  const lines = [
    "// Generated from docs/api/openapi.yaml by scripts/openapi/generate-contract-types.mjs.",
    "// Do not edit by hand. Runtime clients are intentionally outside S1.2-03B.",
    "",
    "export const audioPilotPaths = [",
    ...paths.map((path) => `  ${JSON.stringify(path)},`),
    "] as const;",
    "",
    "export type AudioPilotPath = (typeof audioPilotPaths)[number];",
    "",
    `export const adminC1ContractPolicies = ${JSON.stringify(adminC1ContractPolicies, null, 2)} as const;`,
    "",
    `export const adminSecurityOperations = ${JSON.stringify(adminSecurityOperations, null, 2)} as const;`,
    "",
    "export type AdminSecurityOperation = (typeof adminSecurityOperations)[number];",
    "",
  ];

  for (const [name, schema] of schemas) {
    lines.push(`export type ${name} = ${schemaType(schema)};`, "");
  }
  return `${lines.join("\n")}\n`;
}

export function normalizeContractSyntax(source) {
  let normalized = "";
  let quote = null;
  let escaped = false;
  let comment = null;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (comment === "line") {
      if (character === "\r" || character === "\n") {
        normalized += "\n";
        if (character === "\r" && next === "\n") index += 1;
        comment = null;
      } else {
        normalized += character;
      }
    } else if (comment === "block") {
      normalized += character;
      if (character === "*" && next === "/") {
        normalized += next;
        index += 1;
        comment = null;
      }
    } else if (quote !== null) {
      if (escaped) {
        normalized += character;
        escaped = false;
      } else if (character === "\\") {
        normalized += character;
        escaped = true;
      } else if (character === quote) {
        normalized += '"';
        quote = null;
      } else {
        normalized += character;
      }
    } else if (character === '"' || character === "'") {
      normalized += '"';
      quote = character;
    } else if (character === "/" && next === "/") {
      normalized += "//";
      index += 1;
      comment = "line";
    } else if (character === "/" && next === "*") {
      normalized += "/*";
      index += 1;
      comment = "block";
    } else if (/\s/.test(character)) {
      let nextIndex = index + 1;
      while (nextIndex < source.length && /\s/.test(source[nextIndex])) {
        nextIndex += 1;
      }
      const previous = normalized.at(-1) ?? "";
      const next = source[nextIndex] ?? "";
      if (/[A-Za-z0-9_$]/.test(previous) && /[A-Za-z0-9_$]/.test(next)) {
        normalized += " ";
      }
      index = nextIndex - 1;
    } else {
      normalized += character;
    }
  }
  return normalized.replace(/([=:])\|/g, "$1");
}

export async function loadExactPrettier({
  importPrettier = () => Promise.resolve(require("prettier")),
  readPackageJson = () =>
    JSON.parse(readFileSync(require.resolve("prettier/package.json"), "utf8")),
} = {}) {
  let packageJson;
  try {
    packageJson = readPackageJson();
  } catch (cause) {
    throw new Error(
      `Prettier ${EXACT_PRETTIER_VERSION} is required for the exact generated-contract comparison but is unavailable.`,
      { cause },
    );
  }
  if (packageJson?.version !== EXACT_PRETTIER_VERSION) {
    throw new Error(
      `Prettier ${EXACT_PRETTIER_VERSION} is required for the exact generated-contract comparison; found ${packageJson?.version ?? "an unknown version"}.`,
    );
  }
  let module;
  try {
    module = await importPrettier();
  } catch (cause) {
    throw new Error(
      `Prettier ${EXACT_PRETTIER_VERSION} is required for the exact generated-contract comparison but could not be loaded.`,
      { cause },
    );
  }
  const prettier = module.default ?? module;
  if (typeof prettier?.format !== "function") {
    throw new Error(
      `Prettier ${EXACT_PRETTIER_VERSION} did not expose the required format function.`,
    );
  }
  return prettier;
}

export async function generateContractTypes(document, loaderOptions) {
  const prettier = await loadExactPrettier(loaderOptions);
  return prettier.format(buildContractTypes(document), {
    parser: "typescript",
    printWidth: 100,
    singleQuote: true,
  });
}

export async function readGeneratedContract() {
  const document = JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
  return generateContractTypes(document);
}

const direct =
  process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() ===
    resolve(process.argv[1]).toLowerCase();

if (direct) {
  if (process.argv.includes("--print")) {
    const generated = await readGeneratedContract();
    process.stdout.write(generated);
  } else if (process.argv.includes("--write")) {
    const generated = await readGeneratedContract();
    writeFileSync(OUTPUT_PATH, generated, "utf8");
    console.log(`Generated ${OUTPUT_PATH}`);
  } else {
    const document = JSON.parse(readFileSync(OPENAPI_PATH, "utf8"));
    const current = readFileSync(OUTPUT_PATH, "utf8");
    const expected = await generateContractTypes(document);
    if (current !== expected) {
      throw new Error("Generated audio-pilot contract types are stale.");
    }
    console.log("Generated audio-pilot contract types are current.");
  }
}
