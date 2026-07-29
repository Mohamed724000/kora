import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function licenseFor(manifest, packagePath) {
  if (typeof manifest.license === "string" && manifest.license.length > 0) {
    return manifest.license;
  }

  for (const filename of ["LICENSE", "LICENSE.md", "LICENSE.txt"]) {
    const licensePath = resolve(packagePath, filename);
    if (!existsSync(licensePath)) {
      continue;
    }

    const licenseText = readFileSync(licensePath, "utf8");
    if (
      /Permission is hereby granted, free of charge/i.test(licenseText) &&
      /THE SOFTWARE IS PROVIDED ['"]?AS IS['"]?/i.test(licenseText)
    ) {
      return "MIT";
    }
  }

  return "UNDECLARED";
}

const lockfile = JSON.parse(readFileSync("package-lock.json", "utf8"));
const packages = Object.entries(lockfile.packages)
  .filter(
    ([packagePath, metadata]) =>
      packagePath.startsWith("node_modules/") && metadata.link !== true,
  )
  .flatMap(([packagePath, metadata]) => {
    const manifestPath = resolve(packagePath, "package.json");
    if (!existsSync(manifestPath)) {
      if (metadata.optional === true) {
        return [];
      }

      throw new Error(
        `Missing installed manifest for ${metadata.name ?? packagePath}. Run npm install first.`,
      );
    }

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    return [
      {
        license: licenseFor(manifest, packagePath),
        name: manifest.name,
        version: manifest.version,
      },
    ];
  })
  .sort((left, right) => left.name.localeCompare(right.name));

const undeclared = packages.filter(({ license }) => license === "UNDECLARED");
const totals = Object.groupBy(packages, ({ license }) => license);

console.log(
  JSON.stringify(
    {
      licenses: Object.fromEntries(
        Object.entries(totals)
          .map(([license, entries]) => [license, entries.length])
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
      undeclared,
    },
    null,
    2,
  ),
);
console.log(
  `License inventory: ${packages.length} installed npm packages, ${undeclared.length} undeclared.`,
);

if (undeclared.length > 0) {
  process.exit(1);
}
