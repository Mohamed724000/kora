import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { deepmerge } from "deepmerge-ts";

import {
  findSecretTypes,
  validateDependabotPolicy,
  validateManifestLockConsistency,
  validateManifestVersions,
  validateNestMulterOverride,
  validateNextToolchain,
  validatePackageLock,
  validateAjvFastUriOverride,
  validateJsYamlOverrides,
  validatePrismaDeepmergeOverride,
  validatePrismaMysqlOverride,
  validateQsOverrides,
  validateReactTypesSingleton,
  validateSharpOverride,
  validateVitestSupplyChain,
} from "./scan-repository.mjs";

const validDependabotPolicy = `version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    allow:
      - dependency-name: "*"
        dependency-type: direct
        update-types:
          - version-update:semver-patch
          - version-update:semver-minor
  - package-ecosystem: pub
    directory: /apps/mobile
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    allow:
      - dependency-name: "*"
        dependency-type: direct
        update-types:
          - version-update:semver-patch
          - version-update:semver-minor
`;

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

test("Dependabot requires direct patch/minor updates for npm and Pub", () => {
  assert.deepEqual(validateDependabotPolicy(validDependabotPolicy), []);
});

test("Dependabot rejects the transitive-update gap reproduced by PR #14", () => {
  assert.deepEqual(
    validateDependabotPolicy(
      validDependabotPolicy.replace(
        "        dependency-type: direct\n        update-types:",
        "        update-types:",
      ),
    ),
    ["Dependabot npm allow rule must be direct-only"],
  );
});

test("Dependabot rejects a Pub allow rule without direct-only enforcement", () => {
  const pubPolicyStart = validDependabotPolicy.indexOf(
    "  - package-ecosystem: pub",
  );
  assert.deepEqual(
    validateDependabotPolicy(
      `${validDependabotPolicy.slice(0, pubPolicyStart)}${validDependabotPolicy
        .slice(pubPolicyStart)
        .replace("        dependency-type: direct\n", "")}`,
    ),
    ["Dependabot pub allow rule must be direct-only"],
  );
});

test("Dependabot rejects major version updates and auto-merge", () => {
  assert.deepEqual(
    validateDependabotPolicy(
      `${validDependabotPolicy.replace(
        "          - version-update:semver-minor",
        "          - version-update:semver-major",
      )}auto-merge: true\n`,
    ),
    [
      "Dependabot npm version updates must be patch/minor only",
      "Dependabot auto-merge configuration is forbidden",
    ],
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

test("direct external dependency specifications must be exact SemVer", () => {
  assert.deepEqual(
    validateManifestVersions({
      "apps/web": {
        devDependencies: { "@types/react": "^19.2.18" },
      },
    }),
    [
      "non-exact devDependencies version in apps/web/package.json: @types/react",
    ],
  );
});

test("workspace manifest and package-lock specifications must match byte-for-byte", () => {
  assert.deepEqual(
    validateManifestLockConsistency(
      {
        "apps/web": {
          devDependencies: { "@types/react": "19.2.18" },
        },
      },
      {
        packages: {
          "apps/web": {
            devDependencies: { "@types/react": "^19.2.18" },
          },
        },
      },
    ),
    [
      "package-lock mismatch for apps/web devDependencies @types/react: package.json=19.2.18 package-lock.json=^19.2.18",
    ],
  );
});

test("exact workspace manifest and package-lock specifications are accepted", () => {
  assert.deepEqual(
    validateManifestLockConsistency(
      {
        "packages/ui": {
          peerDependencies: { react: "19.2.8" },
        },
      },
      {
        packages: {
          "packages/ui": {
            peerDependencies: { react: "19.2.8" },
          },
        },
      },
    ),
    [],
  );
});

const reactTypeManifests = {
  "apps/admin": { devDependencies: { "@types/react": "19.2.18" } },
  "apps/web": { devDependencies: { "@types/react": "19.2.18" } },
  "packages/ui": { devDependencies: { "@types/react": "19.2.18" } },
};

test("fragmented @types/react installations are rejected", () => {
  assert.deepEqual(
    validateReactTypesSingleton(reactTypeManifests, {
      packages: {
        "node_modules/@types/react": { version: "19.2.17" },
        "apps/admin/node_modules/@types/react": { version: "19.2.18" },
        "apps/web/node_modules/@types/react": { version: "19.2.18" },
        "packages/ui/node_modules/@types/react": { version: "19.2.18" },
      },
    }),
    [
      "@types/react must have one physical installation at node_modules/@types/react; found 4: node_modules/@types/react, apps/admin/node_modules/@types/react, apps/web/node_modules/@types/react, packages/ui/node_modules/@types/react",
      "@types/react singleton version mismatch: workspaces=19.2.18 package-lock.json=19.2.17",
    ],
  );
});

test("divergent @types/react workspace pins are rejected", () => {
  assert.deepEqual(
    validateReactTypesSingleton(
      {
        "apps/admin": {
          devDependencies: { "@types/react": "19.2.17" },
        },
        "apps/web": {
          devDependencies: { "@types/react": "19.2.18" },
        },
      },
      {
        packages: {
          "node_modules/@types/react": { version: "19.2.18" },
        },
      },
    ),
    [
      "@types/react direct pin missing from packages/ui",
      "@types/react workspace pins must be one exact version: apps/admin:devDependencies=19.2.17, apps/web:devDependencies=19.2.18",
    ],
  );
});

test("a single root @types/react installation matching workspace pins is accepted", () => {
  assert.deepEqual(
    validateReactTypesSingleton(reactTypeManifests, {
      packages: {
        "node_modules/@types/react": { version: "19.2.18" },
      },
    }),
    [],
  );
});

const validPrismaDeepmergeManifests = {
  "": {
    overrides: {
      "@prisma/config@7.9.1": { "deepmerge-ts": "8.0.1" },
    },
  },
  "apps/api": {
    dependencies: { "@prisma/client": "7.9.1" },
    devDependencies: { prisma: "7.9.1" },
  },
};

const validPrismaDeepmergeLock = {
  packages: {
    "node_modules/@prisma/client": { version: "7.9.1" },
    "node_modules/@prisma/config": {
      dependencies: { "deepmerge-ts": "7.1.5" },
      version: "7.9.1",
    },
    "node_modules/deepmerge-ts": { version: "8.0.1" },
    "node_modules/prisma": { version: "7.9.1" },
  },
};

test("accepts the exact targeted Prisma deepmerge-ts security override", () => {
  assert.deepEqual(
    validatePrismaDeepmergeOverride(
      validPrismaDeepmergeManifests,
      validPrismaDeepmergeLock,
    ),
    [],
  );
});

test("rejects the vulnerable deepmerge-ts 7.1.5 resolution", () => {
  const lockfile = structuredClone(validPrismaDeepmergeLock);
  lockfile.packages["node_modules/deepmerge-ts"].version = "7.1.5";

  assert.deepEqual(
    validatePrismaDeepmergeOverride(validPrismaDeepmergeManifests, lockfile),
    [
      "vulnerable deepmerge-ts installation(s): node_modules/deepmerge-ts@7.1.5",
      "deepmerge-ts must have one physical installation at node_modules/deepmerge-ts@8.0.1; found node_modules/deepmerge-ts@7.1.5",
    ],
  );
});

test("rejects any vulnerable nested deepmerge-ts installation", () => {
  const lockfile = structuredClone(validPrismaDeepmergeLock);
  lockfile.packages["node_modules/example/node_modules/deepmerge-ts"] = {
    version: "7.1.5",
  };

  assert.deepEqual(
    validatePrismaDeepmergeOverride(validPrismaDeepmergeManifests, lockfile),
    [
      "vulnerable deepmerge-ts installation(s): node_modules/example/node_modules/deepmerge-ts@7.1.5",
      "deepmerge-ts must have one physical installation at node_modules/deepmerge-ts@8.0.1; found node_modules/deepmerge-ts@8.0.1, node_modules/example/node_modules/deepmerge-ts@7.1.5",
    ],
  );
});

test("rejects an additional deepmerge-ts lock parent in every dependency section", () => {
  for (const section of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    const lockfile = structuredClone(validPrismaDeepmergeLock);
    const parentPath = `node_modules/example-${section}`;
    lockfile.packages[parentPath] = {
      [section]: { "deepmerge-ts": "8.0.1" },
      version: "1.0.0",
    };

    assert.deepEqual(
      validatePrismaDeepmergeOverride(validPrismaDeepmergeManifests, lockfile),
      [`deepmerge-ts has an unapproved lock parent: ${parentPath}`],
      section,
    );
  }
});

test("rejects a ranged Prisma deepmerge-ts override", () => {
  const manifests = structuredClone(validPrismaDeepmergeManifests);
  manifests[""].overrides["@prisma/config@7.9.1"]["deepmerge-ts"] = "^8.0.1";

  assert.deepEqual(
    validatePrismaDeepmergeOverride(manifests, validPrismaDeepmergeLock),
    ["@prisma/config@7.9.1 must override deepmerge-ts to exact version 8.0.1"],
  );
});

test("rejects an exact but unsafe Prisma deepmerge-ts override", () => {
  const manifests = structuredClone(validPrismaDeepmergeManifests);
  manifests[""].overrides["@prisma/config@7.9.1"]["deepmerge-ts"] = "7.1.5";

  assert.deepEqual(
    validatePrismaDeepmergeOverride(manifests, validPrismaDeepmergeLock),
    ["@prisma/config@7.9.1 must override deepmerge-ts to exact version 8.0.1"],
  );
});

test("rejects wildcard, tag and reference Prisma deepmerge-ts overrides", () => {
  for (const specification of ["*", "latest", "github:example/deepmerge-ts"]) {
    const manifests = structuredClone(validPrismaDeepmergeManifests);
    manifests[""].overrides["@prisma/config@7.9.1"]["deepmerge-ts"] =
      specification;

    assert.deepEqual(
      validatePrismaDeepmergeOverride(manifests, validPrismaDeepmergeLock),
      [
        "@prisma/config@7.9.1 must override deepmerge-ts to exact version 8.0.1",
      ],
      specification,
    );
  }
});

test("rejects an override that broadens beyond deepmerge-ts", () => {
  const manifests = structuredClone(validPrismaDeepmergeManifests);
  manifests[""].overrides["@prisma/config@7.9.1"].effect = "3.20.0";

  assert.deepEqual(
    validatePrismaDeepmergeOverride(manifests, validPrismaDeepmergeLock),
    ["@prisma/config@7.9.1 must override deepmerge-ts to exact version 8.0.1"],
  );
});

test("rejects a global deepmerge-ts override", () => {
  const manifests = structuredClone(validPrismaDeepmergeManifests);
  manifests[""].overrides["deepmerge-ts"] = "8.0.1";

  assert.deepEqual(
    validatePrismaDeepmergeOverride(manifests, validPrismaDeepmergeLock),
    ["deepmerge-ts security override is forbidden at path: deepmerge-ts"],
  );
});

test("rejects a version-selected global deepmerge-ts override", () => {
  const manifests = structuredClone(validPrismaDeepmergeManifests);
  manifests[""].overrides["deepmerge-ts@7.1.5"] = "8.0.1";

  assert.deepEqual(
    validatePrismaDeepmergeOverride(manifests, validPrismaDeepmergeLock),
    ["deepmerge-ts security override is forbidden at path: deepmerge-ts@7.1.5"],
  );
});

test("rejects an unversioned parallel Prisma config override", () => {
  const manifests = structuredClone(validPrismaDeepmergeManifests);
  manifests[""].overrides["@prisma/config"] = {
    "deepmerge-ts": "8.0.1",
  };

  assert.deepEqual(
    validatePrismaDeepmergeOverride(manifests, validPrismaDeepmergeLock),
    [
      "deepmerge-ts security override is forbidden at path: @prisma/config",
      "deepmerge-ts security override is forbidden at path: @prisma/config > deepmerge-ts",
    ],
  );
});

test("rejects a ranged parallel Prisma config override", () => {
  const manifests = structuredClone(validPrismaDeepmergeManifests);
  manifests[""].overrides["@prisma/config@^7.9.1"] = {
    "deepmerge-ts": "8.0.1",
  };

  assert.deepEqual(
    validatePrismaDeepmergeOverride(manifests, validPrismaDeepmergeLock),
    [
      "deepmerge-ts security override is forbidden at path: @prisma/config@^7.9.1",
      "deepmerge-ts security override is forbidden at path: @prisma/config@^7.9.1 > deepmerge-ts",
    ],
  );
});

test("rejects a deepmerge-ts override hidden below another parent", () => {
  const manifests = structuredClone(validPrismaDeepmergeManifests);
  manifests[""].overrides["example-parent@1.0.0"] = {
    "deepmerge-ts": "8.0.1",
  };

  assert.deepEqual(
    validatePrismaDeepmergeOverride(manifests, validPrismaDeepmergeLock),
    [
      "deepmerge-ts security override is forbidden at path: example-parent@1.0.0 > deepmerge-ts",
    ],
  );
});

test("rejects a contradictory parallel deepmerge-ts occurrence", () => {
  const manifests = structuredClone(validPrismaDeepmergeManifests);
  manifests[""].overrides["parallel-parent@2.0.0"] = {
    "deepmerge-ts@7.1.5": "7.1.5",
  };

  assert.deepEqual(
    validatePrismaDeepmergeOverride(manifests, validPrismaDeepmergeLock),
    [
      "deepmerge-ts security override is forbidden at path: parallel-parent@2.0.0 > deepmerge-ts@7.1.5",
    ],
  );
});

test("rejects a deepmerge-ts override hidden at stack-unsafe depth", () => {
  const manifests = structuredClone(validPrismaDeepmergeManifests);
  const selectors = Array.from(
    { length: 5_000 },
    (_, index) => `level-${index}`,
  );
  let current = manifests[""].overrides;
  for (const selector of selectors) {
    current[selector] = {};
    current = current[selector];
  }
  current["deepmerge-ts@7.1.5"] = "8.0.1";

  assert.deepEqual(
    validatePrismaDeepmergeOverride(manifests, validPrismaDeepmergeLock),
    [
      `deepmerge-ts security override is forbidden at path: ${[
        ...selectors,
        "deepmerge-ts@7.1.5",
      ].join(" > ")}`,
    ],
  );
});

test("accepts unrelated nested overrides without a false positive", () => {
  const manifests = structuredClone(validPrismaDeepmergeManifests);
  manifests[""].overrides["unrelated-parent@1.0.0"] = {
    "unrelated-child@2.0.0": {
      "another-package": "3.0.0",
    },
  };

  assert.deepEqual(
    validatePrismaDeepmergeOverride(manifests, validPrismaDeepmergeLock),
    [],
  );
});

test("rejects any change to the pinned Prisma family", () => {
  const manifests = structuredClone(validPrismaDeepmergeManifests);
  const lockfile = structuredClone(validPrismaDeepmergeLock);
  manifests["apps/api"].devDependencies.prisma = "7.9.2";
  lockfile.packages["node_modules/prisma"].version = "7.9.2";

  assert.deepEqual(validatePrismaDeepmergeOverride(manifests, lockfile), [
    "Prisma and Prisma Client must remain exactly 7.9.1",
    "package-lock must resolve Prisma, Prisma Client and @prisma/config to 7.9.1",
  ]);
});

test("deepmerge-ts 8 preserves ordinary Prisma-style object merging", () => {
  assert.deepEqual(
    deepmerge(
      {
        datasource: { url: "postgresql://generate@127.0.0.1:5432/generate" },
        schema: "prisma/schema.prisma",
      },
      {
        datasource: { shadowDatabaseUrl: "postgresql://shadow" },
        migrations: { path: "prisma/migrations" },
      },
    ),
    {
      datasource: {
        shadowDatabaseUrl: "postgresql://shadow",
        url: "postgresql://generate@127.0.0.1:5432/generate",
      },
      migrations: { path: "prisma/migrations" },
      schema: "prisma/schema.prisma",
    },
  );
});

// Reference: https://github.com/advisories/GHSA-ggr8-5vv4-36mx
test("deepmerge-ts 8.0.1 safely handles the GHSA-ggr8-5vv4-36mx shape", () => {
  assert.equal(process.versions.node, "22.18.0");
  const script = `
    import { readFileSync } from "node:fs";
    import { deepmerge } from "deepmerge-ts";
    const packageJsonUrl = new URL(
      "../package.json",
      import.meta.resolve("deepmerge-ts"),
    );
    const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8"));
    if (packageJson.version !== "8.0.1") process.exit(20);
    const left = {};
    left.self = left;
    const right = {};
    right.self = right;
    const merged = deepmerge(left, right);
    if (merged.self !== merged) process.exit(21);
    process.stdout.write("SAFE:8.0.1:CYCLE_PRESERVED");
  `;
  const child = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", script],
    { encoding: "utf8", timeout: 5_000 },
  );

  assert.notEqual(
    child.error?.code,
    "ETIMEDOUT",
    "deepmerge-ts@8.0.1 timed out",
  );
  assert.equal(child.signal, null, child.stderr);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, "SAFE:8.0.1:CYCLE_PRESERVED", child.stderr);
});

const validPrismaMysqlManifests = {
  "": {
    overrides: {
      "prisma@7.9.1": { mysql2: "3.23.1" },
    },
  },
  "apps/api": {
    devDependencies: { prisma: "7.9.1" },
  },
};

const validPrismaMysqlLock = {
  packages: {
    "node_modules/mysql2": { version: "3.23.1" },
    "node_modules/prisma": {
      dependencies: { mysql2: "3.15.3" },
      version: "7.9.1",
    },
  },
};

test("accepts both exact targeted Prisma security overrides", () => {
  const manifests = structuredClone(validPrismaDeepmergeManifests);
  manifests[""].overrides["prisma@7.9.1"] = { mysql2: "3.23.1" };
  const lockfile = structuredClone(validPrismaDeepmergeLock);
  lockfile.packages["node_modules/mysql2"] = { version: "3.23.1" };
  lockfile.packages["node_modules/prisma"].dependencies = {
    mysql2: "3.15.3",
  };

  assert.deepEqual(validatePrismaDeepmergeOverride(manifests, lockfile), []);
  assert.deepEqual(validatePrismaMysqlOverride(manifests, lockfile), []);
});

test("accepts the exact targeted Prisma mysql2 security override", () => {
  assert.deepEqual(
    validatePrismaMysqlOverride(
      validPrismaMysqlManifests,
      validPrismaMysqlLock,
    ),
    [],
  );
});

test("rejects the vulnerable mysql2 3.15.3 resolution", () => {
  const lockfile = structuredClone(validPrismaMysqlLock);
  lockfile.packages["node_modules/mysql2"].version = "3.15.3";

  assert.deepEqual(
    validatePrismaMysqlOverride(validPrismaMysqlManifests, lockfile),
    [
      "vulnerable mysql2 installation(s): node_modules/mysql2@3.15.3",
      "mysql2 must have one physical installation at node_modules/mysql2@3.23.1; found node_modules/mysql2@3.15.3",
    ],
  );
});

test("rejects any vulnerable nested mysql2 installation", () => {
  const lockfile = structuredClone(validPrismaMysqlLock);
  lockfile.packages["node_modules/example/node_modules/mysql2"] = {
    version: "3.15.3",
  };

  assert.deepEqual(
    validatePrismaMysqlOverride(validPrismaMysqlManifests, lockfile),
    [
      "vulnerable mysql2 installation(s): node_modules/example/node_modules/mysql2@3.15.3",
      "mysql2 must have one physical installation at node_modules/mysql2@3.23.1; found node_modules/mysql2@3.23.1, node_modules/example/node_modules/mysql2@3.15.3",
    ],
  );
});

test("rejects a ranged Prisma mysql2 override", () => {
  const manifests = structuredClone(validPrismaMysqlManifests);
  manifests[""].overrides["prisma@7.9.1"].mysql2 = "^3.23.1";

  assert.deepEqual(
    validatePrismaMysqlOverride(manifests, validPrismaMysqlLock),
    ["prisma@7.9.1 must override mysql2 to exact version 3.23.1"],
  );
});

test("rejects an exact but unsafe Prisma mysql2 override", () => {
  const manifests = structuredClone(validPrismaMysqlManifests);
  manifests[""].overrides["prisma@7.9.1"].mysql2 = "3.15.3";

  assert.deepEqual(
    validatePrismaMysqlOverride(manifests, validPrismaMysqlLock),
    ["prisma@7.9.1 must override mysql2 to exact version 3.23.1"],
  );
});

test("rejects wildcard, tag and reference Prisma mysql2 overrides", () => {
  for (const specification of ["*", "latest", "github:sidorares/node-mysql2"]) {
    const manifests = structuredClone(validPrismaMysqlManifests);
    manifests[""].overrides["prisma@7.9.1"].mysql2 = specification;

    assert.deepEqual(
      validatePrismaMysqlOverride(manifests, validPrismaMysqlLock),
      ["prisma@7.9.1 must override mysql2 to exact version 3.23.1"],
      specification,
    );
  }
});

test("rejects a Prisma override that broadens beyond mysql2", () => {
  const manifests = structuredClone(validPrismaMysqlManifests);
  manifests[""].overrides["prisma@7.9.1"].effect = "3.20.0";

  assert.deepEqual(
    validatePrismaMysqlOverride(manifests, validPrismaMysqlLock),
    ["prisma@7.9.1 must override mysql2 to exact version 3.23.1"],
  );
});

test("rejects a global mysql2 override", () => {
  const manifests = structuredClone(validPrismaMysqlManifests);
  manifests[""].overrides.mysql2 = "3.23.1";

  assert.deepEqual(
    validatePrismaMysqlOverride(manifests, validPrismaMysqlLock),
    ["mysql2 security override is forbidden at path: mysql2"],
  );
});

test("rejects a version-selected global mysql2 override", () => {
  const manifests = structuredClone(validPrismaMysqlManifests);
  manifests[""].overrides["mysql2@3.15.3"] = "3.23.1";

  assert.deepEqual(
    validatePrismaMysqlOverride(manifests, validPrismaMysqlLock),
    ["mysql2 security override is forbidden at path: mysql2@3.15.3"],
  );
});

test("rejects an unversioned parallel Prisma override", () => {
  const manifests = structuredClone(validPrismaMysqlManifests);
  manifests[""].overrides.prisma = { mysql2: "3.23.1" };

  assert.deepEqual(
    validatePrismaMysqlOverride(manifests, validPrismaMysqlLock),
    [
      "mysql2 security override is forbidden at path: prisma",
      "mysql2 security override is forbidden at path: prisma > mysql2",
    ],
  );
});

test("rejects a ranged parallel Prisma override", () => {
  const manifests = structuredClone(validPrismaMysqlManifests);
  manifests[""].overrides["prisma@^7.9.1"] = { mysql2: "3.23.1" };

  assert.deepEqual(
    validatePrismaMysqlOverride(manifests, validPrismaMysqlLock),
    [
      "mysql2 security override is forbidden at path: prisma@^7.9.1",
      "mysql2 security override is forbidden at path: prisma@^7.9.1 > mysql2",
    ],
  );
});

test("rejects a mysql2 override attached to another parent", () => {
  const manifests = structuredClone(validPrismaMysqlManifests);
  manifests[""].overrides["@prisma/client@7.9.1"] = { mysql2: "3.23.1" };

  assert.deepEqual(
    validatePrismaMysqlOverride(manifests, validPrismaMysqlLock),
    [
      "mysql2 security override is forbidden at path: @prisma/client@7.9.1 > mysql2",
    ],
  );
});

test("rejects the approved Prisma selector hidden below another parent", () => {
  const manifests = structuredClone(validPrismaMysqlManifests);
  manifests[""].overrides["example-parent@1.0.0"] = {
    "prisma@7.9.1": { mysql2: "3.23.1" },
  };

  assert.deepEqual(
    validatePrismaMysqlOverride(manifests, validPrismaMysqlLock),
    [
      "mysql2 security override is forbidden at path: example-parent@1.0.0 > prisma@7.9.1",
      "mysql2 security override is forbidden at path: example-parent@1.0.0 > prisma@7.9.1 > mysql2",
    ],
  );
});

test("rejects a contradictory parallel mysql2 occurrence", () => {
  const manifests = structuredClone(validPrismaMysqlManifests);
  manifests[""].overrides["parallel-parent@2.0.0"] = {
    "mysql2@3.15.3": "3.15.3",
  };

  assert.deepEqual(
    validatePrismaMysqlOverride(manifests, validPrismaMysqlLock),
    [
      "mysql2 security override is forbidden at path: parallel-parent@2.0.0 > mysql2@3.15.3",
    ],
  );
});

test("accepts unrelated nested overrides without a mysql2 false positive", () => {
  const manifests = structuredClone(validPrismaMysqlManifests);
  manifests[""].overrides["unrelated-parent@1.0.0"] = {
    "unrelated-child@2.0.0": {
      "another-package": "3.0.0",
    },
  };

  assert.deepEqual(
    validatePrismaMysqlOverride(manifests, validPrismaMysqlLock),
    [],
  );
});

test("rejects a Prisma version change in the mysql2 override gate", () => {
  const manifests = structuredClone(validPrismaMysqlManifests);
  const lockfile = structuredClone(validPrismaMysqlLock);
  manifests["apps/api"].devDependencies.prisma = "7.9.2";
  lockfile.packages["node_modules/prisma"].version = "7.9.2";

  assert.deepEqual(validatePrismaMysqlOverride(manifests, lockfile), [
    "Prisma must remain exactly 7.9.1 for the mysql2 override",
    "package-lock must resolve Prisma to 7.9.1",
  ]);
});

test("rejects changed Prisma mysql2 dependency metadata", () => {
  const lockfile = structuredClone(validPrismaMysqlLock);
  lockfile.packages["node_modules/prisma"].dependencies.mysql2 = "3.23.1";

  assert.deepEqual(
    validatePrismaMysqlOverride(validPrismaMysqlManifests, lockfile),
    [
      "prisma@7.9.1 lock metadata must retain its audited mysql2 3.15.3 dependency",
    ],
  );
});

test("rejects mysql2 3.22.0 after the R4 advisory update", () => {
  const lockfile = structuredClone(validPrismaMysqlLock);
  lockfile.packages["node_modules/mysql2"].version = "3.22.0";

  assert.deepEqual(
    validatePrismaMysqlOverride(validPrismaMysqlManifests, lockfile),
    [
      "vulnerable mysql2 installation(s): node_modules/mysql2@3.22.0",
      "mysql2 must have one physical installation at node_modules/mysql2@3.23.1; found node_modules/mysql2@3.22.0",
    ],
  );
});

test("rejects a different unapproved mysql2 version", () => {
  const lockfile = structuredClone(validPrismaMysqlLock);
  lockfile.packages["node_modules/mysql2"].version = "3.23.2";

  assert.deepEqual(
    validatePrismaMysqlOverride(validPrismaMysqlManifests, lockfile),
    [
      "mysql2 must have one physical installation at node_modules/mysql2@3.23.1; found node_modules/mysql2@3.23.2",
    ],
  );
});

test("rejects a missing mysql2 installation", () => {
  const lockfile = structuredClone(validPrismaMysqlLock);
  delete lockfile.packages["node_modules/mysql2"];

  assert.deepEqual(
    validatePrismaMysqlOverride(validPrismaMysqlManifests, lockfile),
    [
      "mysql2 must have one physical installation at node_modules/mysql2@3.23.1; found NONE",
    ],
  );
});

test("rejects a fixed mysql2 installation at the wrong physical path", () => {
  const lockfile = structuredClone(validPrismaMysqlLock);
  delete lockfile.packages["node_modules/mysql2"];
  lockfile.packages["node_modules/example/node_modules/mysql2"] = {
    version: "3.23.1",
  };

  assert.deepEqual(
    validatePrismaMysqlOverride(validPrismaMysqlManifests, lockfile),
    [
      "mysql2 must have one physical installation at node_modules/mysql2@3.23.1; found node_modules/example/node_modules/mysql2@3.23.1",
    ],
  );
});

test("rejects an additional mysql2 lock parent", () => {
  const lockfile = structuredClone(validPrismaMysqlLock);
  lockfile.packages["node_modules/example"] = {
    devDependencies: { mysql2: "3.23.1" },
    version: "1.0.0",
  };

  assert.deepEqual(
    validatePrismaMysqlOverride(validPrismaMysqlManifests, lockfile),
    ["mysql2 has an unapproved lock parent: node_modules/example"],
  );
});

const validAjvFastUriManifests = {
  "": {
    overrides: {
      "ajv@8.18.0": { "fast-uri": "3.1.6" },
    },
  },
};

const validAjvFastUriLock = {
  packages: {
    "node_modules/ajv": {
      dependencies: { "fast-uri": "^3.0.1" },
      version: "8.18.0",
    },
    "node_modules/fast-uri": { version: "3.1.6" },
  },
};

test("accepts the exact targeted ajv fast-uri security override", () => {
  assert.deepEqual(
    validateAjvFastUriOverride(validAjvFastUriManifests, validAjvFastUriLock),
    [],
  );
});

test("rejects vulnerable and different fast-uri resolutions", () => {
  const vulnerableLock = structuredClone(validAjvFastUriLock);
  vulnerableLock.packages["node_modules/fast-uri"].version = "3.1.5";
  assert.deepEqual(
    validateAjvFastUriOverride(validAjvFastUriManifests, vulnerableLock),
    [
      "vulnerable fast-uri installation(s): node_modules/fast-uri@3.1.5",
      "fast-uri must have one physical installation at node_modules/fast-uri@3.1.6; found node_modules/fast-uri@3.1.5",
    ],
  );

  const differentLock = structuredClone(validAjvFastUriLock);
  differentLock.packages["node_modules/fast-uri"].version = "3.1.7";
  assert.deepEqual(
    validateAjvFastUriOverride(validAjvFastUriManifests, differentLock),
    [
      "fast-uri must have one physical installation at node_modules/fast-uri@3.1.6; found node_modules/fast-uri@3.1.7",
    ],
  );
});

test("rejects missing, duplicate and misplaced fast-uri installations", () => {
  const missingLock = structuredClone(validAjvFastUriLock);
  delete missingLock.packages["node_modules/fast-uri"];
  assert.deepEqual(
    validateAjvFastUriOverride(validAjvFastUriManifests, missingLock),
    [
      "fast-uri must have one physical installation at node_modules/fast-uri@3.1.6; found NONE",
    ],
  );

  const duplicateLock = structuredClone(validAjvFastUriLock);
  duplicateLock.packages["node_modules/example/node_modules/fast-uri"] = {
    version: "3.1.6",
  };
  assert.deepEqual(
    validateAjvFastUriOverride(validAjvFastUriManifests, duplicateLock),
    [
      "fast-uri must have one physical installation at node_modules/fast-uri@3.1.6; found node_modules/fast-uri@3.1.6, node_modules/example/node_modules/fast-uri@3.1.6",
    ],
  );

  const misplacedLock = structuredClone(validAjvFastUriLock);
  delete misplacedLock.packages["node_modules/fast-uri"];
  misplacedLock.packages["node_modules/example/node_modules/fast-uri"] = {
    version: "3.1.6",
  };
  assert.deepEqual(
    validateAjvFastUriOverride(validAjvFastUriManifests, misplacedLock),
    [
      "fast-uri must have one physical installation at node_modules/fast-uri@3.1.6; found node_modules/example/node_modules/fast-uri@3.1.6",
    ],
  );
});

test("rejects widened, malformed and parallel fast-uri overrides", () => {
  for (const specification of [
    "^3.1.6",
    "*",
    "latest",
    "github:fastify/fast-uri",
  ]) {
    const manifests = structuredClone(validAjvFastUriManifests);
    manifests[""].overrides["ajv@8.18.0"]["fast-uri"] = specification;
    assert.deepEqual(
      validateAjvFastUriOverride(manifests, validAjvFastUriLock),
      ["ajv@8.18.0 must override fast-uri to exact version 3.1.6"],
      specification,
    );
  }

  const global = structuredClone(validAjvFastUriManifests);
  global[""].overrides["fast-uri"] = "3.1.6";
  assert.deepEqual(validateAjvFastUriOverride(global, validAjvFastUriLock), [
    "fast-uri security override is forbidden at path: fast-uri",
  ]);

  const parallel = structuredClone(validAjvFastUriManifests);
  parallel[""].overrides["ajv@^8.18.0"] = { "fast-uri": "3.1.6" };
  assert.deepEqual(validateAjvFastUriOverride(parallel, validAjvFastUriLock), [
    "fast-uri security override is forbidden at path: ajv@^8.18.0",
    "fast-uri security override is forbidden at path: ajv@^8.18.0 > fast-uri",
  ]);
});

test("rejects a broadened fast-uri parent and an unapproved lock parent", () => {
  const manifests = structuredClone(validAjvFastUriManifests);
  manifests[""].overrides["ajv@8.18.0"].example = "1.0.0";
  const lockfile = structuredClone(validAjvFastUriLock);
  lockfile.packages["node_modules/example"] = {
    dependencies: { "fast-uri": "^3.0.1" },
    version: "1.0.0",
  };

  assert.deepEqual(validateAjvFastUriOverride(manifests, lockfile), [
    "ajv@8.18.0 must override fast-uri to exact version 3.1.6",
    "fast-uri has an unapproved lock parent: node_modules/example",
  ]);
});

const validQsManifests = {
  "": {
    overrides: {
      "body-parser@2.3.0": { qs: "6.16.0" },
      "express@5.2.1": { qs: "6.16.0" },
      "superagent@10.3.0": { qs: "6.16.0" },
    },
  },
};

const validQsLock = {
  packages: {
    "node_modules/body-parser": {
      dependencies: { qs: "^6.15.2" },
      version: "2.3.0",
    },
    "node_modules/express": {
      dependencies: { qs: "^6.14.0" },
      version: "5.2.1",
    },
    "node_modules/qs": { version: "6.16.0" },
    "node_modules/superagent": {
      dependencies: { qs: "^6.14.1" },
      version: "10.3.0",
    },
  },
};

test("accepts the three exact targeted qs security overrides", () => {
  assert.deepEqual(validateQsOverrides(validQsManifests, validQsLock), []);
});

test("rejects vulnerable and different qs resolutions", () => {
  const vulnerableLock = structuredClone(validQsLock);
  vulnerableLock.packages["node_modules/qs"].version = "6.15.3";
  assert.deepEqual(validateQsOverrides(validQsManifests, vulnerableLock), [
    "vulnerable qs installation(s): node_modules/qs@6.15.3",
    "qs must have one physical installation at node_modules/qs@6.16.0; found node_modules/qs@6.15.3",
  ]);

  const differentLock = structuredClone(validQsLock);
  differentLock.packages["node_modules/qs"].version = "6.16.1";
  assert.deepEqual(validateQsOverrides(validQsManifests, differentLock), [
    "qs must have one physical installation at node_modules/qs@6.16.0; found node_modules/qs@6.16.1",
  ]);
});

test("rejects missing, duplicate and misplaced qs installations", () => {
  const missingLock = structuredClone(validQsLock);
  delete missingLock.packages["node_modules/qs"];
  assert.deepEqual(validateQsOverrides(validQsManifests, missingLock), [
    "qs must have one physical installation at node_modules/qs@6.16.0; found NONE",
  ]);

  const duplicateLock = structuredClone(validQsLock);
  duplicateLock.packages["node_modules/example/node_modules/qs"] = {
    version: "6.16.0",
  };
  assert.deepEqual(validateQsOverrides(validQsManifests, duplicateLock), [
    "qs must have one physical installation at node_modules/qs@6.16.0; found node_modules/qs@6.16.0, node_modules/example/node_modules/qs@6.16.0",
  ]);

  const misplacedLock = structuredClone(validQsLock);
  delete misplacedLock.packages["node_modules/qs"];
  misplacedLock.packages["node_modules/example/node_modules/qs"] = {
    version: "6.16.0",
  };
  assert.deepEqual(validateQsOverrides(validQsManifests, misplacedLock), [
    "qs must have one physical installation at node_modules/qs@6.16.0; found node_modules/example/node_modules/qs@6.16.0",
  ]);
});

test("rejects widened, malformed and global qs overrides", () => {
  for (const specification of ["^6.16.0", "*", "latest", "github:ljharb/qs"]) {
    const manifests = structuredClone(validQsManifests);
    manifests[""].overrides["express@5.2.1"].qs = specification;
    assert.deepEqual(validateQsOverrides(manifests, validQsLock), [
      "express@5.2.1 must override qs to exact version 6.16.0",
    ]);
  }

  const global = structuredClone(validQsManifests);
  global[""].overrides.qs = "6.16.0";
  assert.deepEqual(validateQsOverrides(global, validQsLock), [
    "qs security override is forbidden at path: qs",
  ]);
});

test("rejects wrong qs parents, broadened parents and parallel paths", () => {
  const wrongParent = structuredClone(validQsManifests);
  wrongParent[""].overrides["example@1.0.0"] = { qs: "6.16.0" };
  assert.deepEqual(validateQsOverrides(wrongParent, validQsLock), [
    "qs security override is forbidden at path: example@1.0.0 > qs",
  ]);

  const broadened = structuredClone(validQsManifests);
  broadened[""].overrides["express@5.2.1"].example = "1.0.0";
  assert.deepEqual(validateQsOverrides(broadened, validQsLock), [
    "express@5.2.1 must override qs to exact version 6.16.0",
  ]);

  const parallel = structuredClone(validQsManifests);
  parallel[""].overrides["express@^5.2.1"] = { qs: "6.16.0" };
  assert.deepEqual(validateQsOverrides(parallel, validQsLock), [
    "qs security override is forbidden at path: express@^5.2.1",
    "qs security override is forbidden at path: express@^5.2.1 > qs",
  ]);
});

test("rejects changed qs parent metadata and an unapproved lock parent", () => {
  const lockfile = structuredClone(validQsLock);
  lockfile.packages["node_modules/express"].dependencies.qs = "6.16.0";
  lockfile.packages["node_modules/example"] = {
    optionalDependencies: { qs: "6.16.0" },
    version: "1.0.0",
  };

  assert.deepEqual(validateQsOverrides(validQsManifests, lockfile), [
    "express@5.2.1 lock metadata must retain its audited qs ^6.14.0 dependency",
    "qs has an unapproved lock parent: node_modules/example",
  ]);
});

const validR2Manifests = {
  "": {
    overrides: {
      "@nestjs/platform-express@11.1.28": { multer: "2.3.0" },
      "js-yaml@3.15.0": "3.15.2",
      "js-yaml@4.3.0": "4.3.2",
      sharp: "0.35.4",
    },
  },
  "apps/admin": {
    dependencies: { next: "16.3.4" },
    devDependencies: {
      "eslint-config-next": "16.3.4",
      vitest: "4.1.11",
    },
  },
  "apps/api": {
    dependencies: { "@nestjs/platform-express": "11.1.28" },
  },
  "apps/web": {
    dependencies: { next: "16.3.4" },
    devDependencies: {
      "eslint-config-next": "16.3.4",
      vitest: "4.1.11",
    },
  },
  "packages/ui": {
    devDependencies: {
      "eslint-config-next": "16.3.4",
      vitest: "4.1.11",
    },
  },
};

const validR2Lock = {
  packages: {
    "node_modules/@eslint/eslintrc": {
      dependencies: { "js-yaml": "^4.3.0" },
      version: "3.3.6",
    },
    "node_modules/@istanbuljs/load-nyc-config": {
      dependencies: { "js-yaml": "^3.13.1" },
      version: "1.1.0",
    },
    "node_modules/@istanbuljs/load-nyc-config/node_modules/js-yaml": {
      version: "3.15.2",
    },
    "node_modules/@nestjs/platform-express": {
      dependencies: { multer: "2.2.0" },
      version: "11.1.28",
    },
    "node_modules/@vitest/mocker": { version: "4.1.11" },
    "node_modules/cosmiconfig": {
      dependencies: { "js-yaml": "^4.1.0" },
      version: "8.3.6",
    },
    "node_modules/eslint-config-next": { version: "16.3.4" },
    "node_modules/js-yaml": { version: "4.3.2" },
    "node_modules/multer": { version: "2.3.0" },
    "node_modules/next": {
      optionalDependencies: { sharp: "^0.35.4" },
      version: "16.3.4",
    },
    "node_modules/sharp": { version: "0.35.4" },
    "node_modules/vitest": {
      dependencies: { "@vitest/mocker": "4.1.11" },
      version: "4.1.11",
    },
  },
};

test("accepts the exact S1.1-R2 supply-chain graph", () => {
  assert.deepEqual(validateNextToolchain(validR2Manifests, validR2Lock), []);
  assert.deepEqual(
    validateVitestSupplyChain(validR2Manifests, validR2Lock),
    [],
  );
  assert.deepEqual(validateJsYamlOverrides(validR2Manifests, validR2Lock), []);
  assert.deepEqual(validateSharpOverride(validR2Manifests, validR2Lock), []);
  assert.deepEqual(
    validateNestMulterOverride(validR2Manifests, validR2Lock),
    [],
  );
});

test("rejects Next and ESLint Config Next pin, placement and override drift", () => {
  const manifests = structuredClone(validR2Manifests);
  manifests["apps/web"].dependencies.next = "16.3.3";
  manifests["apps/api"].devDependencies = { next: "16.3.4" };
  manifests[""].overrides.next = "16.3.4";
  const lockfile = structuredClone(validR2Lock);
  lockfile.packages["apps/web/node_modules/next"] = { version: "16.3.4" };
  lockfile.packages["node_modules/example"] = {
    dependencies: { next: "16.3.4" },
    devDependencies: { "eslint-config-next": "16.3.4" },
  };

  const errors = validateNextToolchain(manifests, lockfile);
  assert.ok(
    errors.includes("apps/web must pin next to exact 16.3.4 in dependencies"),
  );
  assert.ok(
    errors.includes(
      "next has an unapproved direct declaration: apps/api:devDependencies",
    ),
  );
  assert.ok(errors.includes("next override is forbidden at path: next"));
  assert.ok(
    errors.includes("next has an unapproved lock parent: node_modules/example"),
  );
  assert.ok(
    errors.includes(
      "eslint-config-next has an unapproved lock parent: node_modules/example",
    ),
  );
  assert.ok(
    errors.some((error) =>
      error.startsWith(
        "next must have one physical installation at node_modules/next@16.3.4",
      ),
    ),
  );
});

test("rejects every Vitest or @vitest/mocker bypass", () => {
  const manifests = structuredClone(validR2Manifests);
  manifests["apps/admin"].devDependencies.vitest = "4.1.10";
  manifests[""].overrides["@vitest/mocker"] = "4.1.11";
  const lockfile = structuredClone(validR2Lock);
  lockfile.packages["node_modules/vitest"].dependencies["@vitest/mocker"] =
    "4.1.10";
  lockfile.packages["node_modules/example"] = {
    optionalDependencies: {
      "@vitest/mocker": "4.1.11",
      vitest: "4.1.11",
    },
  };
  lockfile.packages["node_modules/example/node_modules/@vitest/mocker"] = {
    version: "4.1.10",
  };

  const errors = validateVitestSupplyChain(manifests, lockfile);
  assert.ok(
    errors.includes(
      "apps/admin must pin vitest to exact 4.1.11 in devDependencies",
    ),
  );
  assert.ok(
    errors.includes(
      "@vitest/mocker override is forbidden at path: @vitest/mocker",
    ),
  );
  assert.ok(
    errors.includes("vitest@4.1.11 must depend on @vitest/mocker 4.1.11"),
  );
  assert.ok(
    errors.includes(
      "@vitest/mocker has an unapproved lock parent: node_modules/example",
    ),
  );
  assert.ok(
    errors.includes(
      "vitest has an unapproved lock parent: node_modules/example",
    ),
  );
  assert.ok(
    errors.some((error) =>
      error.startsWith(
        "@vitest/mocker must have one physical installation at node_modules/@vitest/mocker@4.1.11",
      ),
    ),
  );
});

test("rejects broadened, global and malversioned js-yaml overrides", () => {
  for (const [selector, specification] of [
    ["js-yaml", "4.3.2"],
    ["js-yaml@^4.3.0", "4.3.2"],
    ["js-yaml@4.3.0", "^4.3.2"],
    ["example@1.0.0", { "js-yaml": "4.3.2" }],
  ]) {
    const manifests = structuredClone(validR2Manifests);
    manifests[""].overrides[selector] = specification;
    const errors = validateJsYamlOverrides(manifests, validR2Lock);
    assert.ok(
      errors.length > 0,
      `${selector}=${JSON.stringify(specification)}`,
    );
  }
});

test("rejects js-yaml unapproved parents and physical variants", () => {
  const lockfile = structuredClone(validR2Lock);
  lockfile.packages["node_modules/example"] = {
    peerDependencies: { "js-yaml": "4.3.2" },
  };
  lockfile.packages["node_modules/example/node_modules/js-yaml"] = {
    version: "4.3.2",
  };
  const errors = validateJsYamlOverrides(validR2Manifests, lockfile);
  assert.ok(
    errors.includes(
      "js-yaml has an unapproved lock parent: node_modules/example",
    ),
  );
  assert.ok(
    errors.some((error) =>
      error.startsWith(
        "js-yaml must have only the approved physical installations",
      ),
    ),
  );
});

test("rejects Sharp override, parent and physical installation drift", () => {
  const manifests = structuredClone(validR2Manifests);
  manifests[""].overrides.sharp = "^0.35.4";
  manifests[""].overrides["next@16.3.4"] = { sharp: "0.35.4" };
  const lockfile = structuredClone(validR2Lock);
  lockfile.packages["node_modules/next"].optionalDependencies.sharp = "^0.35.3";
  lockfile.packages["node_modules/example/node_modules/sharp"] = {
    version: "0.35.3",
  };
  const errors = validateSharpOverride(manifests, lockfile);
  assert.ok(
    errors.includes("sharp must be overridden to exact version 0.35.4"),
  );
  assert.ok(
    errors.includes(
      "sharp security override is forbidden at path: next@16.3.4 > sharp",
    ),
  );
  assert.ok(
    errors.includes(
      "next@16.3.4 lock metadata must retain its audited sharp ^0.35.4 optional dependency",
    ),
  );
  assert.ok(
    errors.some((error) =>
      error.startsWith(
        "sharp must have one physical installation at node_modules/sharp@0.35.4",
      ),
    ),
  );
});

test("rejects global, broadened, tagged and referenced Multer overrides", () => {
  for (const mutation of [
    (overrides) => {
      overrides.multer = "2.3.0";
    },
    (overrides) => {
      overrides["@nestjs/platform-express"] = { multer: "2.3.0" };
    },
    (overrides) => {
      overrides["@nestjs/platform-express@^11.1.28"] = { multer: "2.3.0" };
    },
    (overrides) => {
      overrides["@nestjs/platform-express@11.1.28"].multer = "^2.3.0";
    },
    (overrides) => {
      overrides["@nestjs/platform-express@11.1.28"].multer = "latest";
    },
    (overrides) => {
      overrides["@nestjs/platform-express@11.1.28"].multer = "$multer";
    },
  ]) {
    const manifests = structuredClone(validR2Manifests);
    mutation(manifests[""].overrides);
    assert.ok(validateNestMulterOverride(manifests, validR2Lock).length > 0);
  }
});

test("rejects an additional Multer parent in every dependency section", () => {
  for (const section of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    const lockfile = structuredClone(validR2Lock);
    lockfile.packages["node_modules/example"] = {
      [section]: { multer: "2.3.0" },
      version: "1.0.0",
    };
    assert.ok(
      validateNestMulterOverride(validR2Manifests, lockfile).includes(
        "multer has an unapproved lock parent: node_modules/example",
      ),
      section,
    );
  }
});

test("rejects NestJS parent drift and every vulnerable Multer installation", () => {
  const manifests = structuredClone(validR2Manifests);
  manifests["apps/api"].dependencies["@nestjs/platform-express"] = "11.1.29";
  const lockfile = structuredClone(validR2Lock);
  lockfile.packages["node_modules/@nestjs/platform-express"].version =
    "11.1.29";
  lockfile.packages["node_modules/example/node_modules/multer"] = {
    version: "2.2.0",
  };
  const errors = validateNestMulterOverride(manifests, lockfile);
  assert.ok(
    errors.includes(
      "apps/api must keep @nestjs/platform-express exactly 11.1.28",
    ),
  );
  assert.ok(
    errors.includes(
      "@nestjs/platform-express@11.1.28 lock metadata must retain its audited multer 2.2.0 dependency",
    ),
  );
  assert.ok(
    errors.some((error) =>
      error.startsWith(
        "multer must have one physical installation at node_modules/multer@2.3.0",
      ),
    ),
  );
});
