import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

export function buildContractTypes(document) {
  const paths = Object.keys(document.paths);
  const schemas = Object.entries(document.components?.schemas ?? {});
  const lines = [
    "// Generated from docs/api/openapi.yaml by scripts/openapi/generate-contract-types.mjs.",
    "// Do not edit by hand. Runtime clients are intentionally outside S1.2-01.",
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
  return `${lines.join("\n")}\n`;
}

export function normalizeContractSyntax(source) {
  let normalized = "";
  let quote = null;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
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

export async function generateContractTypes(document) {
  const { default: prettier } = await import("prettier");
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
    let expected;
    let exact = true;
    try {
      expected = await generateContractTypes(document);
    } catch (error) {
      if (
        error?.code !== "ERR_MODULE_NOT_FOUND" ||
        !String(error.message).includes("prettier")
      ) {
        throw error;
      }
      exact = false;
      expected = buildContractTypes(document);
    }
    const currentComparable = exact
      ? current
      : normalizeContractSyntax(current);
    const expectedComparable = exact
      ? expected
      : normalizeContractSyntax(expected);
    if (currentComparable !== expectedComparable) {
      throw new Error("Generated audio-pilot contract types are stale.");
    }
    console.log(
      exact
        ? "Generated audio-pilot contract types are current."
        : "Generated audio-pilot contract syntax is current; exact formatting check requires Prettier.",
    );
  }
}
