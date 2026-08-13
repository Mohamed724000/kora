import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const APPROVED_LICENSES = new Set([
  "(MIT OR CC0-1.0)",
  "0BSD",
  "Apache-2.0",
  "Apache-2.0 AND LGPL-3.0-or-later",
  "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC-BY-4.0",
  "CC0-1.0",
  "EPL-2.0",
  "ISC",
  "MIT",
  "MIT and ISC",
  "MIT-0",
  "MPL-2.0",
  "Python-2.0",
  "Unlicense",
]);

const APPROVED_PACKAGE_LICENSES = new Map([
  ["@img/sharp-libvips-linux-x64@1.3.2", "LGPL-3.0-or-later"],
  ["@img/sharp-libvips-linuxmusl-x64@1.3.2", "LGPL-3.0-or-later"],
]);

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
const unapproved = packages.filter(
  ({ license, name, version }) =>
    !APPROVED_LICENSES.has(license) &&
    APPROVED_PACKAGE_LICENSES.get(`${name}@${version}`) !== license,
);
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
      unapproved,
    },
    null,
    2,
  ),
);
console.log(
  `License inventory: ${packages.length} installed npm packages, ${undeclared.length} undeclared, ${unapproved.length} unapproved.`,
);

if (undeclared.length > 0 || unapproved.length > 0) {
  process.exit(1);
}
