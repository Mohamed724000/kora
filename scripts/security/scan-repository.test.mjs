import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { deepmerge } from "deepmerge-ts";

import {
  assertRequiredRepositoryFiles,
  classifyRepositoryPaths,
  findSecretTypes,
  parseNulSeparatedPaths,
  scanHistory,
  scanTrackedFiles,
  snapshotRepositoryFiles,
  validateAdminAuthSupplyChain,
  validateBraceExpansionOverride,
  validateDependabotPolicy,
  validateManifestLockConsistency,
  validateManifestVersions,
  validateNestMulterOverride,
  validateNextLintGlobOverride,
  validateNextToolchain,
  validatePackageLock,
  validateAjvFastUriOverride,
  validateJsYamlOverrides,
  validatePrismaDeepmergeOverride,
  validatePrismaMysqlOverride,
  validateQsOverrides,
  validateReactTypesSingleton,
  validateR9SupplyChainRemediation,
  validateSharpOverride,
  validateVitestSupplyChain,
  verifyRepositoryFileSnapshot,
} from "./scan-repository.mjs";

const requiredRepositoryFiles = [
  ".github/dependabot.yml",
  "apps/admin/package.json",
  "apps/api/package.json",
  "apps/mobile/pubspec.lock",
  "apps/web/package.json",
  "docs/governance/SOURCE_BASELINE_MANIFEST.sha256",
  "package-lock.json",
  "package.json",
  "packages/config/package.json",
  "packages/contracts/package.json",
  "packages/ui/package.json",
];

function withTemporaryDirectory(prefix, operation) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  try {
    return operation(directory);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function writeFixtureFile(root, relativePath, content = "fixture\n") {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function git(root, arguments_) {
  return execFileSync("git", arguments_, {
    cwd: root,
    encoding: "utf8",
  });
}

function withGitDeletionFixture(operation) {
  return withTemporaryDirectory("kora-scanner-git-", (root) => {
    git(root, ["init", "--quiet"]);
    writeFixtureFile(root, "tracked-present.txt", "safe tracked content\n");
    writeFixtureFile(
      root,
      "tracked-secret.txt",
      `credential=${"AKIA"}${"A".repeat(16)}\n`,
    );
    writeFixtureFile(
      root,
      "deleted-history-secret.txt",
      `credential=${"AKIA"}${"B".repeat(16)}\n`,
    );
    git(root, ["add", "--", "."]);
    git(root, [
      "-c",
      "user.name=KORA Scanner Fixture",
      "-c",
      "user.email=scanner-fixture@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "scanner fixture",
    ]);
    rmSync(join(root, "deleted-history-secret.txt"));
    writeFixtureFile(
      root,
      "untracked-present.txt",
      `token=${"ghp_"}${"C".repeat(36)}\n`,
    );
    writeFixtureFile(root, "untracked-forbidden.pem", "fixture\n");
    return operation(root);
  });
}

function fileSystemError(code) {
  return Object.assign(new Error(`controlled ${code}`), { code });
}

function fakeStat(symbolicLink = false) {
  return {
    ctimeNs: 6n,
    dev: 1n,
    ino: 2n,
    isSymbolicLink: () => symbolicLink,
    mode: 3n,
    mtimeNs: 5n,
    size: 4n,
  };
}

function frozenGitOperations(snapshot) {
  return {
    execFileSync(_command, arguments_) {
      const paths = arguments_.includes("--deleted")
        ? snapshot.deletedFiles
        : snapshot.listedFiles;
      return paths.length === 0 ? "" : `${paths.join("\0")}\0`;
    },
    lstatSync,
    statSync,
  };
}

test("Git path parsing preserves NUL-delimited names exactly", () => {
  assert.deepEqual(
    parseNulSeparatedPaths("alpha file\0dir/file\nname\0", "fixture"),
    ["alpha file", "dir/file\nname"],
  );
  assert.deepEqual(parseNulSeparatedPaths("", "fixture"), []);
});

test("Git path parsing rejects unterminated and duplicate output", () => {
  assert.throws(
    () => parseNulSeparatedPaths("unterminated", "fixture"),
    /fixture is not NUL-terminated/u,
  );
  assert.throws(
    () => parseNulSeparatedPaths("same\0same\0", "fixture"),
    /fixture contains duplicate paths/u,
  );
});

test("a real Git fixture omits only its unstaged tracked deletion", () => {
  withGitDeletionFixture((root) => {
    const snapshot = snapshotRepositoryFiles(root);
    assert.deepEqual(snapshot.deletedFiles, ["deleted-history-secret.txt"]);
    assert.deepEqual(snapshot.omittedPaths, ["deleted-history-secret.txt"]);
    assert.ok(snapshot.files.includes("tracked-present.txt"));
    assert.ok(snapshot.files.includes("untracked-present.txt"));
    assert.equal(
      snapshot.listedFiles.length,
      snapshot.files.length + snapshot.omittedPaths.length,
    );

    const errors = [];
    scanTrackedFiles(root, snapshot.files, errors);
    assert.ok(
      errors.includes(
        "high-confidence aws-access-key in tracked file tracked-secret.txt",
      ),
    );
    assert.ok(
      errors.includes(
        "high-confidence github-token in tracked file untracked-present.txt",
      ),
    );
    assert.ok(
      errors.includes("forbidden tracked file: untracked-forbidden.pem"),
    );

    const historyErrors = [];
    scanHistory(root, historyErrors);
    assert.deepEqual(historyErrors, [
      "high-confidence aws-access-key in Git history",
    ]);
    verifyRepositoryFileSnapshot(root, snapshot);
  });
});

test("an absent path without Git deletion proof remains blocking", () => {
  withTemporaryDirectory("kora-scanner-absent-", (root) => {
    assert.throws(
      () => classifyRepositoryPaths(root, ["missing.txt"], []),
      /repository path is absent without a Git deletion: missing\.txt/u,
    );
  });
});

test("file-system errors other than ENOENT remain blocking", () => {
  const controlledError = fileSystemError("EPERM");
  assert.throws(
    () =>
      classifyRepositoryPaths("fixture", ["denied.txt"], [], {
        lstatSync() {
          throw controlledError;
        },
        statSync,
      }),
    (error) => error === controlledError,
  );
});

test("broken final and parent symbolic links remain blocking", () => {
  const missingTarget = fileSystemError("ENOENT");
  assert.throws(
    () =>
      classifyRepositoryPaths("fixture", ["broken-link"], [], {
        lstatSync: () => fakeStat(true),
        statSync() {
          throw missingTarget;
        },
      }),
    /broken symbolic link: broken-link/u,
  );
  assert.throws(
    () =>
      classifyRepositoryPaths("fixture", ["broken-parent/file.txt"], [], {
        lstatSync: () => fakeStat(true),
        statSync() {
          throw missingTarget;
        },
      }),
    /broken parent symbolic link: broken-parent\/file\.txt/u,
  );
});

test("a retained path disappearing after selection remains blocking", () => {
  withTemporaryDirectory("kora-scanner-disappear-", (root) => {
    writeFixtureFile(root, "present.txt");
    const snapshot = classifyRepositoryPaths(root, ["present.txt"], []);
    rmSync(join(root, "present.txt"));
    assert.throws(
      () =>
        verifyRepositoryFileSnapshot(
          root,
          snapshot,
          frozenGitOperations(snapshot),
        ),
      (error) => error?.code === "ENOENT",
    );
  });
});

test("an omitted tracked deletion reappearing before postflight blocks", () => {
  withTemporaryDirectory("kora-scanner-reappear-", (root) => {
    const snapshot = classifyRepositoryPaths(
      root,
      ["deleted.txt"],
      ["deleted.txt"],
    );
    writeFixtureFile(root, "deleted.txt");
    assert.throws(
      () =>
        verifyRepositoryFileSnapshot(
          root,
          snapshot,
          frozenGitOperations(snapshot),
        ),
      /tracked deletion reappeared: deleted\.txt/u,
    );
  });
});

test("required manifests and lockfile remain blocking when Git-deleted", () => {
  for (const missingPath of ["package.json", "package-lock.json"]) {
    withTemporaryDirectory("kora-scanner-required-", (root) => {
      for (const relativePath of requiredRepositoryFiles) {
        if (relativePath !== missingPath) {
          writeFixtureFile(root, relativePath, "{}\n");
        }
      }
      const snapshot = classifyRepositoryPaths(root, requiredRepositoryFiles, [
        missingPath,
      ]);
      assert.deepEqual(snapshot.omittedPaths, [missingPath]);
      assert.throws(
        () => assertRequiredRepositoryFiles(snapshot.files),
        new RegExp(`required repository file is absent: ${missingPath}`, "u"),
      );
    });
  }
});

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

const qualifiedAdminAuthManifests = {
  "apps/api": {
    dependencies: {
      argon2: "0.45.1",
      jose: "6.2.12",
      qrcode: "1.5.4",
    },
    devDependencies: { "@types/qrcode": "1.5.6" },
  },
};

const qualifiedAdminAuthLock = {
  packages: {
    "apps/api": structuredClone(qualifiedAdminAuthManifests["apps/api"]),
    "node_modules/argon2": {
      hasInstallScript: true,
      integrity:
        "sha512-skm+/WCjkGqCQxF7FG1LuZXM5yvbFjgbfiCGsud2oLgaDhh6b6dbH0b1EkghbM+xx4Bj8Ape+KKgixoIlWZicQ==",
      license: "MIT",
      resolved: "https://registry.npmjs.org/argon2/-/argon2-0.45.1.tgz",
      version: "0.45.1",
    },
    "node_modules/jose": { version: "6.2.12" },
    "node_modules/qrcode": { version: "1.5.4" },
    "node_modules/@types/qrcode": { version: "1.5.6" },
  },
};

const qualifiedArgon2Manifest = {
  name: "argon2",
  scripts: { install: "cross-env ZERO_AR_DATE=1 node-gyp-build" },
  version: "0.45.1",
};

test("accepts the exact C1 dependency pins and qualified Argon2 hook", () => {
  assert.deepEqual(
    validateAdminAuthSupplyChain(
      qualifiedAdminAuthManifests,
      qualifiedAdminAuthLock,
      qualifiedArgon2Manifest,
    ),
    [],
  );
});

test("rejects Argon2 version, path, duplicate and hook drift", () => {
  const versionDrift = structuredClone(qualifiedAdminAuthLock);
  versionDrift.packages["node_modules/argon2"].version = "0.45.0";
  assert.ok(
    validateAdminAuthSupplyChain(
      qualifiedAdminAuthManifests,
      versionDrift,
      qualifiedArgon2Manifest,
    ).some((error) => error.includes("one physical installation")),
  );

  const pathDrift = structuredClone(qualifiedAdminAuthLock);
  pathDrift.packages["node_modules/example/node_modules/argon2"] =
    pathDrift.packages["node_modules/argon2"];
  delete pathDrift.packages["node_modules/argon2"];
  assert.ok(
    validateAdminAuthSupplyChain(
      qualifiedAdminAuthManifests,
      pathDrift,
      qualifiedArgon2Manifest,
    ).some((error) => error.includes("one physical installation")),
  );

  const duplicate = structuredClone(qualifiedAdminAuthLock);
  duplicate.packages["node_modules/example/node_modules/argon2"] =
    duplicate.packages["node_modules/argon2"];
  assert.ok(
    validateAdminAuthSupplyChain(
      qualifiedAdminAuthManifests,
      duplicate,
      qualifiedArgon2Manifest,
    ).some((error) => error.includes("one physical installation")),
  );

  assert.ok(
    validateAdminAuthSupplyChain(
      qualifiedAdminAuthManifests,
      qualifiedAdminAuthLock,
      {
        ...qualifiedArgon2Manifest,
        scripts: { install: "node-gyp rebuild" },
      },
    ).some((error) => error.includes("installed hook must be exactly")),
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
      "ajv@8.18.0": { "fast-uri": "3.1.8" },
    },
  },
};

const validAjvFastUriLock = {
  packages: {
    "node_modules/ajv": {
      dependencies: { "fast-uri": "^3.0.1" },
      version: "8.18.0",
    },
    "node_modules/fast-uri": { version: "3.1.8" },
  },
};

test("accepts the exact targeted ajv fast-uri security override", () => {
  assert.deepEqual(
    validateAjvFastUriOverride(validAjvFastUriManifests, validAjvFastUriLock),
    [],
  );
});

test("rejects fast-uri 3.1.6 and the 3.1.7 vulnerable boundary", () => {
  const vulnerableLock = structuredClone(validAjvFastUriLock);
  vulnerableLock.packages["node_modules/fast-uri"].version = "3.1.6";
  assert.deepEqual(
    validateAjvFastUriOverride(validAjvFastUriManifests, vulnerableLock),
    [
      "vulnerable fast-uri installation(s): node_modules/fast-uri@3.1.6",
      "fast-uri must have one physical installation at node_modules/fast-uri@3.1.8; found node_modules/fast-uri@3.1.6",
    ],
  );

  const boundaryLock = structuredClone(validAjvFastUriLock);
  boundaryLock.packages["node_modules/fast-uri"].version = "3.1.7";
  assert.deepEqual(
    validateAjvFastUriOverride(validAjvFastUriManifests, boundaryLock),
    [
      "vulnerable fast-uri installation(s): node_modules/fast-uri@3.1.7",
      "fast-uri must have one physical installation at node_modules/fast-uri@3.1.8; found node_modules/fast-uri@3.1.7",
    ],
  );
});

test("rejects a different non-vulnerable fast-uri resolution", () => {
  const lockfile = structuredClone(validAjvFastUriLock);
  lockfile.packages["node_modules/fast-uri"].version = "3.1.9";

  assert.deepEqual(
    validateAjvFastUriOverride(validAjvFastUriManifests, lockfile),
    [
      "fast-uri must have one physical installation at node_modules/fast-uri@3.1.8; found node_modules/fast-uri@3.1.9",
    ],
  );
});

test("rejects missing, duplicate and misplaced fast-uri installations", () => {
  const missingLock = structuredClone(validAjvFastUriLock);
  delete missingLock.packages["node_modules/fast-uri"];
  assert.deepEqual(
    validateAjvFastUriOverride(validAjvFastUriManifests, missingLock),
    [
      "fast-uri must have one physical installation at node_modules/fast-uri@3.1.8; found NONE",
    ],
  );

  const duplicateLock = structuredClone(validAjvFastUriLock);
  duplicateLock.packages["node_modules/example/node_modules/fast-uri"] = {
    version: "3.1.8",
  };
  assert.deepEqual(
    validateAjvFastUriOverride(validAjvFastUriManifests, duplicateLock),
    [
      "fast-uri must have one physical installation at node_modules/fast-uri@3.1.8; found node_modules/fast-uri@3.1.8, node_modules/example/node_modules/fast-uri@3.1.8",
    ],
  );

  const misplacedLock = structuredClone(validAjvFastUriLock);
  delete misplacedLock.packages["node_modules/fast-uri"];
  misplacedLock.packages["node_modules/example/node_modules/fast-uri"] = {
    version: "3.1.8",
  };
  assert.deepEqual(
    validateAjvFastUriOverride(validAjvFastUriManifests, misplacedLock),
    [
      "fast-uri must have one physical installation at node_modules/fast-uri@3.1.8; found node_modules/example/node_modules/fast-uri@3.1.8",
    ],
  );
});

test("rejects widened, malformed and parallel fast-uri overrides", () => {
  for (const specification of [
    "^3.1.8",
    "*",
    "latest",
    "github:fastify/fast-uri",
  ]) {
    const manifests = structuredClone(validAjvFastUriManifests);
    manifests[""].overrides["ajv@8.18.0"]["fast-uri"] = specification;
    assert.deepEqual(
      validateAjvFastUriOverride(manifests, validAjvFastUriLock),
      ["ajv@8.18.0 must override fast-uri to exact version 3.1.8"],
      specification,
    );
  }

  const global = structuredClone(validAjvFastUriManifests);
  global[""].overrides["fast-uri"] = "3.1.8";
  assert.deepEqual(validateAjvFastUriOverride(global, validAjvFastUriLock), [
    "fast-uri security override is forbidden at path: fast-uri",
  ]);

  const parallel = structuredClone(validAjvFastUriManifests);
  parallel[""].overrides["ajv@^8.18.0"] = { "fast-uri": "3.1.8" };
  assert.deepEqual(validateAjvFastUriOverride(parallel, validAjvFastUriLock), [
    "fast-uri security override is forbidden at path: ajv@^8.18.0",
    "fast-uri security override is forbidden at path: ajv@^8.18.0 > fast-uri",
  ]);
});

test("rejects the formerly pinned fast-uri 3.1.6 override exactly", () => {
  const manifests = structuredClone(validAjvFastUriManifests);
  manifests[""].overrides["ajv@8.18.0"]["fast-uri"] = "3.1.6";

  assert.deepEqual(validateAjvFastUriOverride(manifests, validAjvFastUriLock), [
    "ajv@8.18.0 must override fast-uri to exact version 3.1.8",
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
    "ajv@8.18.0 must override fast-uri to exact version 3.1.8",
    "fast-uri has an unapproved lock parent: node_modules/example",
  ]);
});

const validQsManifests = {
  "": {
    overrides: {
      "body-parser@2.3.0": { qs: "6.16.0" },
      "express@5.2.1": { "proxy-addr": "2.0.8", qs: "6.16.0" },
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

const validBraceExpansionManifests = {
  "": {
    overrides: {
      "brace-expansion": "5.0.12",
      minimatch: "10.2.6",
    },
  },
};

const validBraceExpansionLock = {
  packages: {
    "node_modules/brace-expansion": { version: "5.0.12" },
    "node_modules/minimatch": {
      dependencies: { "brace-expansion": "^5.0.8" },
      version: "10.2.6",
    },
  },
};

test("accepts the exact minimatch brace-expansion security override", () => {
  assert.deepEqual(
    validateBraceExpansionOverride(
      validBraceExpansionManifests,
      validBraceExpansionLock,
    ),
    [],
  );
});

test("rejects the R2 brace-expansion resolution and vulnerable boundary", () => {
  for (const version of [
    "0.1.0",
    "1.1.18",
    "1.1.20",
    "2.1.4",
    "2.1.6",
    "3.0.6",
    "3.0.8",
    "4.0.0",
    "4.2.1",
    "5.0.9",
    "5.0.10",
    "5.0.11",
    "5.0.12-beta.1",
  ]) {
    const lockfile = structuredClone(validBraceExpansionLock);
    lockfile.packages["node_modules/brace-expansion"].version = version;
    assert.deepEqual(
      validateBraceExpansionOverride(validBraceExpansionManifests, lockfile),
      [
        `vulnerable brace-expansion installation(s): node_modules/brace-expansion@${version}`,
        `brace-expansion must have one physical installation at node_modules/brace-expansion@5.0.12; found node_modules/brace-expansion@${version}`,
      ],
      version,
    );
  }
});

test("does not mislabel patched or malformed brace-expansion versions", () => {
  for (const version of [
    "1.1.21",
    "2.1.7",
    "3.0.9",
    "3.1.0",
    "5.0.12",
    "5.0.13",
    "not-semver",
  ]) {
    const lockfile = structuredClone(validBraceExpansionLock);
    lockfile.packages["node_modules/brace-expansion"].version = version;
    const errors = validateBraceExpansionOverride(
      validBraceExpansionManifests,
      lockfile,
    );
    assert.equal(
      errors.some((error) =>
        error.startsWith("vulnerable brace-expansion installation(s):"),
      ),
      false,
      version,
    );
  }
});

test("rejects a different non-vulnerable brace-expansion resolution", () => {
  const lockfile = structuredClone(validBraceExpansionLock);
  lockfile.packages["node_modules/brace-expansion"].version = "5.0.13";
  assert.deepEqual(
    validateBraceExpansionOverride(validBraceExpansionManifests, lockfile),
    [
      "brace-expansion must have one physical installation at node_modules/brace-expansion@5.0.12; found node_modules/brace-expansion@5.0.13",
    ],
  );
});

test("rejects missing, duplicate and misplaced brace-expansion installations", () => {
  const missingLock = structuredClone(validBraceExpansionLock);
  delete missingLock.packages["node_modules/brace-expansion"];
  assert.deepEqual(
    validateBraceExpansionOverride(validBraceExpansionManifests, missingLock),
    [
      "brace-expansion must have one physical installation at node_modules/brace-expansion@5.0.12; found NONE",
    ],
  );

  const duplicateLock = structuredClone(validBraceExpansionLock);
  duplicateLock.packages["node_modules/example/node_modules/brace-expansion"] =
    { version: "5.0.12" };
  assert.deepEqual(
    validateBraceExpansionOverride(validBraceExpansionManifests, duplicateLock),
    [
      "brace-expansion must have one physical installation at node_modules/brace-expansion@5.0.12; found node_modules/brace-expansion@5.0.12, node_modules/example/node_modules/brace-expansion@5.0.12",
    ],
  );

  const misplacedLock = structuredClone(validBraceExpansionLock);
  delete misplacedLock.packages["node_modules/brace-expansion"];
  misplacedLock.packages["node_modules/example/node_modules/brace-expansion"] =
    { version: "5.0.12" };
  assert.deepEqual(
    validateBraceExpansionOverride(validBraceExpansionManifests, misplacedLock),
    [
      "brace-expansion must have one physical installation at node_modules/brace-expansion@5.0.12; found node_modules/example/node_modules/brace-expansion@5.0.12",
    ],
  );
});

test("rejects widened, stale and parallel brace-expansion overrides", () => {
  for (const specification of [
    "5.0.9",
    "^5.0.12",
    "*",
    "latest",
    "github:juliangruber/brace-expansion",
  ]) {
    const manifests = structuredClone(validBraceExpansionManifests);
    manifests[""].overrides["brace-expansion"] = specification;
    assert.deepEqual(
      validateBraceExpansionOverride(manifests, validBraceExpansionLock),
      ["brace-expansion must be overridden to exact version 5.0.12"],
      specification,
    );
  }

  const parallel = structuredClone(validBraceExpansionManifests);
  parallel[""].overrides["example@1.0.0"] = {
    "brace-expansion": "5.0.12",
  };
  assert.deepEqual(
    validateBraceExpansionOverride(parallel, validBraceExpansionLock),
    [
      "brace-expansion security override is forbidden at path: example@1.0.0 > brace-expansion",
    ],
  );

  const selected = structuredClone(validBraceExpansionManifests);
  selected[""].overrides["brace-expansion@5.0.9"] = "5.0.12";
  assert.deepEqual(
    validateBraceExpansionOverride(selected, validBraceExpansionLock),
    [
      "brace-expansion security override is forbidden at path: brace-expansion@5.0.9",
    ],
  );
});

test("rejects minimatch override and parent graph drift", () => {
  const ranged = structuredClone(validBraceExpansionManifests);
  ranged[""].overrides.minimatch = "^10.2.6";
  assert.deepEqual(
    validateBraceExpansionOverride(ranged, validBraceExpansionLock),
    ["minimatch must remain overridden to exact version 10.2.6"],
  );

  const nested = structuredClone(validBraceExpansionManifests);
  nested[""].overrides["example@1.0.0"] = { minimatch: "10.2.6" };
  assert.deepEqual(
    validateBraceExpansionOverride(nested, validBraceExpansionLock),
    [
      "minimatch parent override is forbidden at path: example@1.0.0 > minimatch",
    ],
  );

  const metadata = structuredClone(validBraceExpansionLock);
  metadata.packages["node_modules/minimatch"].dependencies["brace-expansion"] =
    "5.0.12";
  metadata.packages["node_modules/example"] = {
    dependencies: { "brace-expansion": "5.0.12" },
    version: "1.0.0",
  };
  assert.deepEqual(
    validateBraceExpansionOverride(validBraceExpansionManifests, metadata),
    [
      "minimatch@10.2.6 lock metadata must retain its audited brace-expansion ^5.0.8 dependency",
      "brace-expansion has an unapproved lock parent: node_modules/example",
    ],
  );

  const version = structuredClone(validBraceExpansionLock);
  version.packages["node_modules/minimatch"].version = "10.2.5";
  assert.deepEqual(
    validateBraceExpansionOverride(validBraceExpansionManifests, version),
    [
      "minimatch@10.2.6 lock metadata must retain its audited brace-expansion ^5.0.8 dependency",
      "minimatch must have one physical installation at node_modules/minimatch@10.2.6; found node_modules/minimatch@10.2.5",
    ],
  );
});

const validR2Manifests = {
  "": {
    overrides: {
      "@next/eslint-plugin-next@16.3.8": {
        "fast-glob": "npm:tinyglobby@0.2.17",
      },
      "@nestjs/platform-express@11.1.28": { multer: "2.4.0" },
      "body-parser@2.3.0": { qs: "6.16.0" },
      "express@5.2.1": { "proxy-addr": "2.0.8", qs: "6.16.0" },
      "js-yaml@4.3.0": "4.3.2",
      sharp: "0.35.5",
      "source-map-js": "1.2.2",
      "superagent@10.3.0": { qs: "6.16.0" },
    },
  },
  "apps/admin": {
    dependencies: { next: "16.3.8" },
    devDependencies: {
      "eslint-config-next": "16.3.8",
      vitest: "4.1.11",
    },
  },
  "apps/api": {
    dependencies: { "@nestjs/platform-express": "11.1.28" },
    devDependencies: {
      "@vitest/coverage-v8": "4.1.11",
      vitest: "4.1.11",
    },
  },
  "apps/web": {
    dependencies: { next: "16.3.8" },
    devDependencies: {
      "eslint-config-next": "16.3.8",
      vitest: "4.1.11",
    },
  },
  "packages/ui": {
    devDependencies: {
      "eslint-config-next": "16.3.8",
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
    "node_modules/@nestjs/platform-express": {
      dependencies: { multer: "2.2.0" },
      version: "11.1.28",
    },
    "node_modules/@next/env": { version: "16.3.8" },
    "node_modules/@next/eslint-plugin-next": {
      dependencies: { "fast-glob": "3.3.1" },
      version: "16.3.8",
    },
    "node_modules/@next/swc-darwin-arm64": { version: "16.3.8" },
    "node_modules/@next/swc-darwin-x64": { version: "16.3.8" },
    "node_modules/@next/swc-linux-arm64-gnu": { version: "16.3.8" },
    "node_modules/@next/swc-linux-arm64-musl": { version: "16.3.8" },
    "node_modules/@next/swc-linux-x64-gnu": { version: "16.3.8" },
    "node_modules/@next/swc-linux-x64-musl": { version: "16.3.8" },
    "node_modules/@next/swc-win32-arm64-msvc": { version: "16.3.8" },
    "node_modules/@next/swc-win32-x64-msvc": { version: "16.3.8" },
    "node_modules/@vitest/mocker": { version: "4.1.11" },
    "node_modules/@vitest/coverage-v8": {
      peerDependencies: { vitest: "4.1.11" },
      version: "4.1.11",
    },
    "node_modules/body-parser": {
      dependencies: { qs: "^6.15.2" },
      version: "2.3.0",
    },
    "node_modules/cosmiconfig": {
      dependencies: { "js-yaml": "^4.1.0" },
      version: "8.3.6",
    },
    "node_modules/css-tree": {
      dependencies: { "source-map-js": "^1.2.1" },
      version: "3.2.1",
    },
    "node_modules/eslint-config-next": {
      dependencies: { "@next/eslint-plugin-next": "16.3.8" },
      version: "16.3.8",
    },
    "node_modules/@next/eslint-plugin-next/node_modules/fast-glob": {
      dependencies: { fdir: "^6.5.0", picomatch: "^4.0.4" },
      engines: { node: ">=12.0.0" },
      integrity:
        "sha512-wXR/dYpcqKmfWpEdZjiKJOwCNFndD0DMnrW/cYjVGttEkBfVgcLFHoNrlj47mjOVic9yyNu65alsgF4NQyTa2g==",
      license: "MIT",
      name: "tinyglobby",
      resolved: "https://registry.npmjs.org/tinyglobby/-/tinyglobby-0.2.17.tgz",
      version: "0.2.17",
    },
    "node_modules/js-yaml": { version: "4.3.2" },
    "node_modules/magicast": {
      dependencies: { "source-map-js": "^1.2.1" },
      version: "0.5.5",
    },
    "node_modules/multer": { version: "2.4.0" },
    "node_modules/next": {
      dependencies: { "@next/env": "16.3.8" },
      optionalDependencies: {
        "@next/swc-darwin-arm64": "16.3.8",
        "@next/swc-darwin-x64": "16.3.8",
        "@next/swc-linux-arm64-gnu": "16.3.8",
        "@next/swc-linux-arm64-musl": "16.3.8",
        "@next/swc-linux-x64-gnu": "16.3.8",
        "@next/swc-linux-x64-musl": "16.3.8",
        "@next/swc-win32-arm64-msvc": "16.3.8",
        "@next/swc-win32-x64-msvc": "16.3.8",
        sharp: "^0.35.4",
      },
      version: "16.3.8",
    },
    "node_modules/express": {
      dependencies: { "proxy-addr": "^2.0.7", qs: "^6.14.0" },
      version: "5.2.1",
    },
    "node_modules/postcss": {
      dependencies: { "source-map-js": "^1.2.1" },
      version: "8.5.24",
    },
    "node_modules/proxy-addr": { version: "2.0.8" },
    "node_modules/qs": { version: "6.16.0" },
    "node_modules/sharp": {
      optionalDependencies: {
        "@img/sharp-darwin-arm64": "0.35.5",
        "@img/sharp-darwin-x64": "0.35.5",
        "@img/sharp-freebsd-wasm32": "0.35.5",
        "@img/sharp-libvips-darwin-arm64": "1.3.4",
        "@img/sharp-libvips-darwin-x64": "1.3.4",
        "@img/sharp-libvips-linux-arm": "1.3.4",
        "@img/sharp-libvips-linux-arm64": "1.3.4",
        "@img/sharp-libvips-linux-ppc64": "1.3.4",
        "@img/sharp-libvips-linux-riscv64": "1.3.4",
        "@img/sharp-libvips-linux-s390x": "1.3.4",
        "@img/sharp-libvips-linux-x64": "1.3.4",
        "@img/sharp-libvips-linuxmusl-arm64": "1.3.4",
        "@img/sharp-libvips-linuxmusl-x64": "1.3.4",
        "@img/sharp-linux-arm": "0.35.5",
        "@img/sharp-linux-arm64": "0.35.5",
        "@img/sharp-linux-ppc64": "0.35.5",
        "@img/sharp-linux-riscv64": "0.35.5",
        "@img/sharp-linux-s390x": "0.35.5",
        "@img/sharp-linux-x64": "0.35.5",
        "@img/sharp-linuxmusl-arm64": "0.35.5",
        "@img/sharp-linuxmusl-x64": "0.35.5",
        "@img/sharp-webcontainers-wasm32": "0.35.5",
        "@img/sharp-win32-arm64": "0.35.5",
        "@img/sharp-win32-ia32": "0.35.5",
        "@img/sharp-win32-x64": "0.35.5",
      },
      version: "0.35.5",
    },
    "node_modules/source-map-js": { version: "1.2.2" },
    "node_modules/superagent": {
      dependencies: { qs: "^6.14.1" },
      version: "10.3.0",
    },
    "node_modules/vitest": {
      dependencies: { "@vitest/mocker": "4.1.11" },
      peerDependencies: { "@vitest/coverage-v8": "4.1.11" },
      version: "4.1.11",
    },
  },
};

for (const [packageName, version] of Object.entries(
  validR2Lock.packages["node_modules/sharp"].optionalDependencies,
)) {
  validR2Lock.packages[`node_modules/${packageName}`] = {
    license: packageName.startsWith("@img/sharp-libvips-")
      ? "LGPL-3.0-or-later"
      : packageName.startsWith("@img/sharp-win32-")
        ? "Apache-2.0 AND LGPL-3.0-or-later"
        : "Apache-2.0",
    version,
  };
}
validR2Lock.packages["node_modules/@img/sharp-wasm32"] = {
  license: "Apache-2.0 AND LGPL-3.0-or-later AND MIT",
  version: "0.35.5",
};

test("accepts the exact R9 supply-chain graph", () => {
  assert.deepEqual(validateNextToolchain(validR2Manifests, validR2Lock), []);
  assert.deepEqual(
    validateNextLintGlobOverride(validR2Manifests, validR2Lock),
    [],
  );
  assert.deepEqual(
    validateVitestSupplyChain(validR2Manifests, validR2Lock),
    [],
  );
  assert.deepEqual(validateJsYamlOverrides(validR2Manifests, validR2Lock), []);
  assert.deepEqual(validateQsOverrides(validR2Manifests, validR2Lock), []);
  assert.deepEqual(
    validateR9SupplyChainRemediation(validR2Manifests, validR2Lock),
    [],
  );
  assert.deepEqual(validateSharpOverride(validR2Manifests, validR2Lock), []);
  assert.deepEqual(
    validateNestMulterOverride(validR2Manifests, validR2Lock),
    [],
  );
});

function validateIntegratedQsProxyComposition(manifests, lockfile) {
  return [
    ...validateQsOverrides(manifests, lockfile),
    ...validateR9SupplyChainRemediation(manifests, lockfile),
  ];
}

test("accepts exact qs and proxy-addr composition in either key order", () => {
  assert.deepEqual(
    validateIntegratedQsProxyComposition(validR2Manifests, validR2Lock),
    [],
  );

  const reversed = structuredClone(validR2Manifests);
  reversed[""].overrides["express@5.2.1"] = {
    qs: "6.16.0",
    "proxy-addr": "2.0.8",
  };
  assert.deepEqual(
    validateIntegratedQsProxyComposition(reversed, validR2Lock),
    [],
  );
});

test("rejects one-axis qs and proxy-addr composition drift", () => {
  for (const mutate of [
    (manifests) => {
      delete manifests[""].overrides["express@5.2.1"].qs;
    },
    (manifests) => {
      delete manifests[""].overrides["express@5.2.1"]["proxy-addr"];
    },
    (manifests) => {
      manifests[""].overrides["express@5.2.1"].qs = "^6.16.0";
    },
    (manifests) => {
      manifests[""].overrides["express@5.2.1"].qs = "6.16.1";
    },
    (manifests) => {
      manifests[""].overrides["express@5.2.1"]["proxy-addr"] = "^2.0.8";
    },
    (manifests) => {
      manifests[""].overrides["express@5.2.1"]["proxy-addr"] = "2.0.7";
    },
    (manifests) => {
      manifests[""].overrides["express@5.2.1"].example = "1.0.0";
    },
  ]) {
    const manifests = structuredClone(validR2Manifests);
    mutate(manifests);
    assert.ok(
      validateIntegratedQsProxyComposition(manifests, validR2Lock).length > 0,
    );
  }
});

test("rejects wrong qs or proxy-addr placement with one-axis mutations", () => {
  const wrongQsParent = structuredClone(validR2Manifests);
  wrongQsParent[""].overrides["example@1.0.0"] = { qs: "6.16.0" };
  assert.ok(
    validateIntegratedQsProxyComposition(wrongQsParent, validR2Lock).some(
      (error) => error.includes("qs security override is forbidden"),
    ),
  );

  const wrongProxyParent = structuredClone(validR2Manifests);
  wrongProxyParent[""].overrides.example = { "proxy-addr": "2.0.8" };
  assert.ok(
    validateIntegratedQsProxyComposition(wrongProxyParent, validR2Lock).some(
      (error) => error.includes("proxy-addr security override is forbidden"),
    ),
  );
});

test("rejects lock drift with a correct qs and proxy-addr manifest", () => {
  const qsLockDrift = structuredClone(validR2Lock);
  qsLockDrift.packages["node_modules/express"].dependencies.qs = "6.16.0";
  assert.ok(
    validateIntegratedQsProxyComposition(
      validR2Manifests,
      qsLockDrift,
    ).includes(
      "express@5.2.1 lock metadata must retain its audited qs ^6.14.0 dependency",
    ),
  );

  const proxyLockDrift = structuredClone(validR2Lock);
  proxyLockDrift.packages["node_modules/proxy-addr"].version = "2.0.7";
  assert.ok(
    validateIntegratedQsProxyComposition(validR2Manifests, proxyLockDrift).some(
      (error) => error.startsWith("proxy-addr must have one physical"),
    ),
  );
});

test("preserves strict qs composition for body-parser and superagent", () => {
  for (const selector of ["body-parser@2.3.0", "superagent@10.3.0"]) {
    const manifests = structuredClone(validR2Manifests);
    manifests[""].overrides[selector].example = "1.0.0";
    assert.ok(
      validateQsOverrides(manifests, validR2Lock).includes(
        `${selector} must override qs to exact version 6.16.0`,
      ),
    );
  }
});

test("rejects every Next lint glob override scope and alias identity drift", () => {
  for (const mutate of [
    (manifests) => {
      manifests[""].overrides["fast-glob"] = "npm:tinyglobby@0.2.17";
    },
    (manifests) => {
      delete manifests[""].overrides["@next/eslint-plugin-next@16.3.8"];
      manifests[""].overrides["@next/eslint-plugin-next@16.3.7"] = {
        "fast-glob": "npm:tinyglobby@0.2.17",
      };
    },
    (manifests) => {
      manifests[""].overrides["@next/eslint-plugin-next@16.3.8"]["fast-glob"] =
        "npm:tinyglobby@0.2.16";
    },
    (manifests) => {
      manifests[""].overrides.micromatch = "4.0.8";
    },
    (manifests) => {
      manifests[""].overrides.braces = "3.0.3";
    },
  ]) {
    const manifests = structuredClone(validR2Manifests);
    mutate(manifests);
    assert.ok(validateNextLintGlobOverride(manifests, validR2Lock).length > 0);
  }

  for (const mutate of [
    (lockfile) => {
      lockfile.packages[
        "node_modules/@next/eslint-plugin-next/node_modules/fast-glob"
      ].name = "fast-glob";
    },
    (lockfile) => {
      lockfile.packages[
        "node_modules/@next/eslint-plugin-next/node_modules/fast-glob"
      ].version = "0.2.16";
    },
    (lockfile) => {
      lockfile.packages[
        "node_modules/@next/eslint-plugin-next/node_modules/fast-glob"
      ].integrity = "unexpected";
    },
    (lockfile) => {
      lockfile.packages["node_modules/@next/eslint-plugin-next"].dependencies[
        "fast-glob"
      ] = "3.3.3";
    },
    (lockfile) => {
      lockfile.packages["node_modules/braces"] = { version: "3.0.3" };
    },
    (lockfile) => {
      lockfile.packages["node_modules/micromatch"] = { version: "4.0.8" };
    },
  ]) {
    const lockfile = structuredClone(validR2Lock);
    mutate(lockfile);
    assert.ok(
      validateNextLintGlobOverride(validR2Manifests, lockfile).length > 0,
    );
  }
});

test("rejects Next and ESLint Config Next pin, placement and override drift", () => {
  const manifests = structuredClone(validR2Manifests);
  manifests["apps/web"].dependencies.next = "16.3.4";
  manifests["apps/admin"].devDependencies["eslint-config-next"] = "16.3.4";
  manifests["apps/api"].devDependencies = { next: "16.3.4" };
  manifests[""].overrides.next = "16.3.4";
  const lockfile = structuredClone(validR2Lock);
  lockfile.packages["apps/web/node_modules/next"] = { version: "16.3.8" };
  lockfile.packages["node_modules/example"] = {
    dependencies: { next: "16.3.4" },
    devDependencies: { "eslint-config-next": "16.3.4" },
  };

  const errors = validateNextToolchain(manifests, lockfile);
  assert.ok(
    errors.includes("apps/web must pin next to exact 16.3.8 in dependencies"),
  );
  assert.ok(
    errors.includes(
      "apps/admin must pin eslint-config-next to exact 16.3.8 in devDependencies",
    ),
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
        "next must have one physical installation at node_modules/next@16.3.8",
      ),
    ),
  );
});

test("rejects Next environment, ESLint plugin and SWC graph drift", () => {
  const lockfile = structuredClone(validR2Lock);
  lockfile.packages["node_modules/next"].dependencies["@next/env"] = "16.3.4";
  lockfile.packages["node_modules/@next/env"].version = "16.3.4";
  lockfile.packages["node_modules/eslint-config-next"].dependencies[
    "@next/eslint-plugin-next"
  ] = "16.3.4";
  lockfile.packages["node_modules/@next/eslint-plugin-next"].version = "16.3.4";
  lockfile.packages["node_modules/next"].optionalDependencies[
    "@next/swc-win32-x64-msvc"
  ] = "16.3.4";
  lockfile.packages["node_modules/@next/swc-win32-x64-msvc"].version = "16.3.4";

  const errors = validateNextToolchain(validR2Manifests, lockfile);
  assert.ok(
    errors.some((error) =>
      error.startsWith(
        "@next/env must have one physical installation at node_modules/@next/env@16.3.8",
      ),
    ),
  );
  assert.ok(
    errors.some((error) =>
      error.startsWith(
        "@next/eslint-plugin-next must have one physical installation at node_modules/@next/eslint-plugin-next@16.3.8",
      ),
    ),
  );
  assert.ok(
    errors.some((error) =>
      error.startsWith(
        "@next/swc-win32-x64-msvc must have one physical installation at node_modules/@next/swc-win32-x64-msvc@16.3.8",
      ),
    ),
  );
  assert.ok(
    errors.includes(
      "next@16.3.8 lock metadata must depend on @next/env 16.3.8",
    ),
  );
  assert.ok(
    errors.includes(
      "eslint-config-next@16.3.8 lock metadata must depend on @next/eslint-plugin-next 16.3.8",
    ),
  );
  assert.ok(
    errors.includes(
      "next@16.3.8 lock metadata must retain optional @next/swc-win32-x64-msvc 16.3.8",
    ),
  );
});

test("rejects duplicate and unapproved Next support package parents", () => {
  const lockfile = structuredClone(validR2Lock);
  lockfile.packages["node_modules/example"] = {
    dependencies: {
      "@next/env": "16.3.8",
      "@next/eslint-plugin-next": "16.3.8",
      "@next/swc-linux-x64-gnu": "16.3.8",
    },
    version: "1.0.0",
  };
  for (const packageName of [
    "@next/env",
    "@next/eslint-plugin-next",
    "@next/swc-linux-x64-gnu",
  ]) {
    lockfile.packages[`node_modules/example/node_modules/${packageName}`] = {
      version: "16.3.8",
    };
  }

  const errors = validateNextToolchain(validR2Manifests, lockfile);
  for (const packageName of [
    "@next/env",
    "@next/eslint-plugin-next",
    "@next/swc-linux-x64-gnu",
  ]) {
    assert.ok(
      errors.some((error) =>
        error.startsWith(
          `${packageName} must have one physical installation at node_modules/${packageName}@16.3.8`,
        ),
      ),
      packageName,
    );
    assert.ok(
      errors.includes(
        `${packageName} has an unapproved lock parent: node_modules/example`,
      ),
      packageName,
    );
  }
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

test("rejects reintroduction of the removed Jest Istanbul vulnerable chain", () => {
  const manifests = structuredClone(validR2Manifests);
  manifests["apps/api"].devDependencies.jest = "30.4.2";
  const lockfile = structuredClone(validR2Lock);
  lockfile.packages["node_modules/@istanbuljs/load-nyc-config"] = {
    dependencies: { "js-yaml": "^3.13.1" },
    version: "1.1.0",
  };
  lockfile.packages[
    "node_modules/@istanbuljs/load-nyc-config/node_modules/js-yaml"
  ] = { version: "3.15.2" };
  lockfile.packages["node_modules/example/node_modules/argparse"] = {
    version: "1.0.10",
  };
  lockfile.packages["node_modules/sprintf-js"] = { version: "1.0.3" };

  const jsYamlErrors = validateJsYamlOverrides(manifests, lockfile);
  assert.ok(
    jsYamlErrors.some((error) =>
      error.startsWith(
        "js-yaml must have only the approved physical installations",
      ),
    ),
  );
  const errors = validateR9SupplyChainRemediation(manifests, lockfile);
  assert.ok(
    errors.includes("apps/api must not declare removed Jest package jest"),
  );
  assert.ok(
    errors.some((error) =>
      error.startsWith(
        "@istanbuljs/load-nyc-config must have no physical installation",
      ),
    ),
  );
  assert.ok(
    errors.some((error) =>
      error.startsWith("sprintf-js must have no physical installation"),
    ),
  );
  assert.ok(
    errors.some((error) =>
      error.startsWith("argparse 1.x must have no physical installation"),
    ),
  );
});

test("rejects proxy-addr and source-map-js remediation drift", () => {
  const manifests = structuredClone(validR2Manifests);
  manifests[""].overrides["express@5.2.1"]["proxy-addr"] = "^2.0.8";
  manifests[""].overrides["source-map-js"] = "^1.2.2";
  manifests[""].overrides.example = { "proxy-addr": "2.0.8" };
  const lockfile = structuredClone(validR2Lock);
  lockfile.packages["node_modules/proxy-addr"].version = "2.0.7";
  lockfile.packages["node_modules/source-map-js"].version = "1.2.1";
  lockfile.packages["node_modules/example"] = {
    dependencies: { "source-map-js": "^1.2.1" },
  };

  const errors = validateR9SupplyChainRemediation(manifests, lockfile);
  assert.ok(
    errors.includes(
      "express@5.2.1 must override proxy-addr to exact version 2.0.8",
    ),
  );
  assert.ok(
    errors.includes(
      "proxy-addr security override is forbidden at path: example > proxy-addr",
    ),
  );
  assert.ok(
    errors.includes("source-map-js must be overridden to exact version 1.2.2"),
  );
  assert.ok(
    errors.includes(
      "source-map-js has an unapproved lock parent: node_modules/example",
    ),
  );
});

test("rejects Sharp override, parent and physical installation drift", () => {
  const manifests = structuredClone(validR2Manifests);
  manifests[""].overrides.sharp = "^0.35.5";
  manifests[""].overrides["next@16.3.8"] = { sharp: "0.35.5" };
  const lockfile = structuredClone(validR2Lock);
  lockfile.packages["node_modules/next"].optionalDependencies.sharp = "^0.35.3";
  lockfile.packages["node_modules/example/node_modules/sharp"] = {
    version: "0.35.3",
  };
  const errors = validateSharpOverride(manifests, lockfile);
  assert.ok(
    errors.includes("sharp must be overridden to exact version 0.35.5"),
  );
  assert.ok(
    errors.includes(
      "sharp security override is forbidden at path: next@16.3.8 > sharp",
    ),
  );
  assert.ok(
    errors.includes(
      "next@16.3.8 lock metadata must retain its audited sharp ^0.35.4 optional dependency",
    ),
  );
  assert.ok(
    errors.some((error) =>
      error.startsWith(
        "sharp must have one physical installation at node_modules/sharp@0.35.5",
      ),
    ),
  );
});

test("rejects global, broadened, tagged and referenced Multer overrides", () => {
  for (const [mutation, expected] of [
    [
      (overrides) => {
        overrides.multer = "2.4.0";
      },
      ["multer security override is forbidden at path: multer"],
    ],
    [
      (overrides) => {
        overrides["@nestjs/platform-express"] = { multer: "2.4.0" };
      },
      [
        "multer security override is forbidden at path: @nestjs/platform-express",
        "multer security override is forbidden at path: @nestjs/platform-express > multer",
      ],
    ],
    [
      (overrides) => {
        overrides["@nestjs/platform-express@^11.1.28"] = {
          multer: "2.4.0",
        };
      },
      [
        "multer security override is forbidden at path: @nestjs/platform-express@^11.1.28",
        "multer security override is forbidden at path: @nestjs/platform-express@^11.1.28 > multer",
      ],
    ],
    [
      (overrides) => {
        overrides["@nestjs/platform-express@11.1.28"].multer = "^2.4.0";
      },
      [
        "@nestjs/platform-express@11.1.28 must override multer to exact version 2.4.0",
      ],
    ],
    [
      (overrides) => {
        overrides["@nestjs/platform-express@11.1.28"].multer = "latest";
      },
      [
        "@nestjs/platform-express@11.1.28 must override multer to exact version 2.4.0",
      ],
    ],
    [
      (overrides) => {
        overrides["@nestjs/platform-express@11.1.28"].multer = "$multer";
      },
      [
        "@nestjs/platform-express@11.1.28 must override multer to exact version 2.4.0",
      ],
    ],
  ]) {
    const manifests = structuredClone(validR2Manifests);
    mutation(manifests[""].overrides);
    assert.deepEqual(
      validateNestMulterOverride(manifests, validR2Lock),
      expected,
    );
  }
});

test("rejects the formerly pinned Multer 2.3.0 override exactly", () => {
  const manifests = structuredClone(validR2Manifests);
  manifests[""].overrides["@nestjs/platform-express@11.1.28"].multer = "2.3.0";

  assert.deepEqual(validateNestMulterOverride(manifests, validR2Lock), [
    "@nestjs/platform-express@11.1.28 must override multer to exact version 2.4.0",
  ]);
});

test("rejects a vulnerable Multer 2.3.0 lock resolution exactly", () => {
  const lockfile = structuredClone(validR2Lock);
  lockfile.packages["node_modules/multer"].version = "2.3.0";

  assert.deepEqual(validateNestMulterOverride(validR2Manifests, lockfile), [
    "vulnerable multer installation(s): node_modules/multer@2.3.0",
    "multer must have one physical installation at node_modules/multer@2.4.0; found node_modules/multer@2.3.0",
  ]);
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
      [section]: { multer: "2.4.0" },
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
    errors.includes(
      "vulnerable multer installation(s): node_modules/example/node_modules/multer@2.2.0",
    ),
  );
  assert.ok(
    errors.some((error) =>
      error.startsWith(
        "multer must have one physical installation at node_modules/multer@2.4.0",
      ),
    ),
  );
});
