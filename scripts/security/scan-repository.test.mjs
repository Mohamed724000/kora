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
    [
      "deepmerge-ts security override must not define parallel global or broadened selector(s): deepmerge-ts",
    ],
  );
});

test("rejects a version-selected global deepmerge-ts override", () => {
  const manifests = structuredClone(validPrismaDeepmergeManifests);
  manifests[""].overrides["deepmerge-ts@7.1.5"] = "8.0.1";

  assert.deepEqual(
    validatePrismaDeepmergeOverride(manifests, validPrismaDeepmergeLock),
    [
      "deepmerge-ts security override must not define parallel global or broadened selector(s): deepmerge-ts@7.1.5",
    ],
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
      "deepmerge-ts security override must not define parallel global or broadened selector(s): @prisma/config",
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
      "deepmerge-ts security override must not define parallel global or broadened selector(s): @prisma/config@^7.9.1",
    ],
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

test("deepmerge-ts 8 handles a recursive graph in an isolated process", () => {
  const script = `
    import { deepmerge } from "deepmerge-ts";
    const recursive = { label: "root" };
    recursive.self = recursive;
    const merged = deepmerge(recursive, { enabled: true });
    if (merged.label !== "root" || merged.enabled !== true) process.exit(2);
    if (merged.self !== merged) process.exit(3);
  `;
  const child = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", script],
    { encoding: "utf8", timeout: 5_000 },
  );

  assert.notEqual(child.error?.code, "ETIMEDOUT");
  assert.equal(child.signal, null, child.stderr);
  assert.equal(child.status, 0, child.stderr);
});
