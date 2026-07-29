import { readFileSync } from "node:fs";

const files = [
  "typescript/base.json",
  "typescript/nest.json",
  "typescript/next.json",
  "typescript/node-library.json",
  "typescript/react-library.json",
  "prettier.json",
];

for (const file of files) {
  JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"));
}

const base = JSON.parse(
  readFileSync(new URL("../typescript/base.json", import.meta.url), "utf8"),
);

if (base.compilerOptions?.strict !== true) {
  throw new Error(
    "The shared TypeScript policy must keep strict mode enabled.",
  );
}

console.log(`Validated ${files.length} shared configuration files.`);
