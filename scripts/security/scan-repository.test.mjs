import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { deepmerge } from "deepmerge-ts";

import {
  findSecretTypes,
  validateDependabotPolicy,
  validateManifestLockConsistency,
  validateManifestVersions,
  validatePackageLock,
  validatePrismaDeepmergeOverride,
  validatePrismaMysqlOverride,
  validateReactTypesSingleton,
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
      "prisma@7.9.1": { mysql2: "3.22.0" },
    },
  },
  "apps/api": {
    devDependencies: { prisma: "7.9.1" },
  },
};

const validPrismaMysqlLock = {
  packages: {
    "node_modules/mysql2": { version: "3.22.0" },
    "node_modules/prisma": {
      dependencies: { mysql2: "3.15.3" },
      version: "7.9.1",
    },
  },
};

test("accepts both exact targeted Prisma security overrides", () => {
  const manifests = structuredClone(validPrismaDeepmergeManifests);
  manifests[""].overrides["prisma@7.9.1"] = { mysql2: "3.22.0" };
  const lockfile = structuredClone(validPrismaDeepmergeLock);
  lockfile.packages["node_modules/mysql2"] = { version: "3.22.0" };
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
      "mysql2 must have one physical installation at node_modules/mysql2@3.22.0; found node_modules/mysql2@3.15.3",
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
      "mysql2 must have one physical installation at node_modules/mysql2@3.22.0; found node_modules/mysql2@3.22.0, node_modules/example/node_modules/mysql2@3.15.3",
    ],
  );
});

test("rejects a ranged Prisma mysql2 override", () => {
  const manifests = structuredClone(validPrismaMysqlManifests);
  manifests[""].overrides["prisma@7.9.1"].mysql2 = "^3.22.0";

  assert.deepEqual(
    validatePrismaMysqlOverride(manifests, validPrismaMysqlLock),
    ["prisma@7.9.1 must override mysql2 to exact version 3.22.0"],
  );
});

test("rejects an exact but unsafe Prisma mysql2 override", () => {
  const manifests = structuredClone(validPrismaMysqlManifests);
  manifests[""].overrides["prisma@7.9.1"].mysql2 = "3.15.3";

  assert.deepEqual(
    validatePrismaMysqlOverride(manifests, validPrismaMysqlLock),
    ["prisma@7.9.1 must override mysql2 to exact version 3.22.0"],
  );
});

test("rejects wildcard, tag and reference Prisma mysql2 overrides", () => {
  for (const specification of ["*", "latest", "github:sidorares/node-mysql2"]) {
    const manifests = structuredClone(validPrismaMysqlManifests);
    manifests[""].overrides["prisma@7.9.1"].mysql2 = specification;

    assert.deepEqual(
      validatePrismaMysqlOverride(manifests, validPrismaMysqlLock),
      ["prisma@7.9.1 must override mysql2 to exact version 3.22.0"],
      specification,
    );
  }
});

test("rejects a Prisma override that broadens beyond mysql2", () => {
  const manifests = structuredClone(validPrismaMysqlManifests);
  manifests[""].overrides["prisma@7.9.1"].effect = "3.20.0";

  assert.deepEqual(
    validatePrismaMysqlOverride(manifests, validPrismaMysqlLock),
    ["prisma@7.9.1 must override mysql2 to exact version 3.22.0"],
  );
});

test("rejects a global mysql2 override", () => {
  const manifests = structuredClone(validPrismaMysqlManifests);
  manifests[""].overrides.mysql2 = "3.22.0";

  assert.deepEqual(
    validatePrismaMysqlOverride(manifests, validPrismaMysqlLock),
    ["mysql2 security override is forbidden at path: mysql2"],
  );
});

test("rejects a version-selected global mysql2 override", () => {
  const manifests = structuredClone(validPrismaMysqlManifests);
  manifests[""].overrides["mysql2@3.15.3"] = "3.22.0";

  assert.deepEqual(
    validatePrismaMysqlOverride(manifests, validPrismaMysqlLock),
    ["mysql2 security override is forbidden at path: mysql2@3.15.3"],
  );
});

test("rejects an unversioned parallel Prisma override", () => {
  const manifests = structuredClone(validPrismaMysqlManifests);
  manifests[""].overrides.prisma = { mysql2: "3.22.0" };

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
  manifests[""].overrides["prisma@^7.9.1"] = { mysql2: "3.22.0" };

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
  manifests[""].overrides["@prisma/client@7.9.1"] = { mysql2: "3.22.0" };

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
    "prisma@7.9.1": { mysql2: "3.22.0" },
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
  lockfile.packages["node_modules/prisma"].dependencies.mysql2 = "3.22.0";

  assert.deepEqual(
    validatePrismaMysqlOverride(validPrismaMysqlManifests, lockfile),
    [
      "prisma@7.9.1 lock metadata must retain its audited mysql2 3.15.3 dependency",
    ],
  );
});
