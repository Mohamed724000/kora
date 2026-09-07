import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import prettier from "prettier";

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
  return "unknown";
}

export async function generateContractTypes(document) {
  const paths = Object.keys(document.paths);
  const schemas = Object.entries(document.components?.schemas ?? {});
  const lines = [
    "// Generated from docs/api/openapi.yaml by scripts/openapi/generate-contract-types.mjs.",
    "// Do not edit by hand. Runtime clients are intentionally outside S1.1.",
    "",
    "export const audioPilotPaths = [",
    ...paths.map((path) => `  ${JSON.stringify(path)},`),
    "] as const;",
    "",
    "export type AudioPilotPath = (typeof audioPilotPaths)[number];",
    "",
  ];

  for (const [name, schema] of schemas) {
    lines.push(`export type ${name} = ${schemaType(schema)};`, "");
  }
  return prettier.format(`${lines.join("\n")}\n`, {
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
  const generated = await readGeneratedContract();
  if (process.argv.includes("--print")) {
    process.stdout.write(generated);
  } else if (process.argv.includes("--write")) {
    writeFileSync(OUTPUT_PATH, generated, "utf8");
    console.log(`Generated ${OUTPUT_PATH}`);
  } else {
    const current = readFileSync(OUTPUT_PATH, "utf8");
    if (current !== generated) {
      throw new Error("Generated audio-pilot contract types are stale.");
    }
    console.log("Generated audio-pilot contract types are current.");
  }
}
