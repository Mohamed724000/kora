import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { basename, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_TRACKED_BYTES = 10 * 1024 * 1024;
const DIRECT_DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];
const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u;
const REACT_TYPES_PACKAGE = "@types/react";
const REACT_TYPES_ROOT_PATH = "node_modules/@types/react";
const REACT_TYPES_WORKSPACES = ["apps/admin", "apps/web", "packages/ui"];
const PRISMA_VERSION = "7.9.1";
const PRISMA_CONFIG_PATH = "node_modules/@prisma/config";
const PRISMA_CLIENT_PATH = "node_modules/@prisma/client";
const PRISMA_PATH = "node_modules/prisma";
const PRISMA_CONFIG_OVERRIDE = `@prisma/config@${PRISMA_VERSION}`;
const DEEPMERGE_PACKAGE = "deepmerge-ts";
const DEEPMERGE_ROOT_PATH = `node_modules/${DEEPMERGE_PACKAGE}`;
const DEEPMERGE_SAFE_VERSION = "8.0.1";
const PRISMA_OVERRIDE = `prisma@${PRISMA_VERSION}`;
const MYSQL_PACKAGE = "mysql2";
const MYSQL_ROOT_PATH = `node_modules/${MYSQL_PACKAGE}`;
const MYSQL_DECLARED_VERSION = "3.15.3";
const MYSQL_SAFE_VERSION = "3.23.1";
const FAST_URI_PACKAGE = "fast-uri";
const FAST_URI_ROOT_PATH = `node_modules/${FAST_URI_PACKAGE}`;
const FAST_URI_SAFE_VERSION = "3.1.6";
const FAST_URI_PARENT = {
  declaredVersion: "^3.0.1",
  packageName: "ajv",
  packagePath: "node_modules/ajv",
  selector: "ajv@8.18.0",
  version: "8.18.0",
};
const QS_PACKAGE = "qs";
const QS_ROOT_PATH = `node_modules/${QS_PACKAGE}`;
const QS_SAFE_VERSION = "6.16.0";
const QS_PARENTS = [
  {
    declaredVersion: "^6.15.2",
    packageName: "body-parser",
    packagePath: "node_modules/body-parser",
    selector: "body-parser@2.3.0",
    version: "2.3.0",
  },
  {
    declaredVersion: "^6.14.0",
    packageName: "express",
    packagePath: "node_modules/express",
    selector: "express@5.2.1",
    version: "5.2.1",
  },
  {
    declaredVersion: "^6.14.1",
    packageName: "superagent",
    packagePath: "node_modules/superagent",
    selector: "superagent@10.3.0",
    version: "10.3.0",
  },
];
const DEPENDABOT_ECOSYSTEMS = new Map([
  ["npm", "/"],
  ["pub", "/apps/mobile"],
]);
const DEPENDABOT_UPDATE_TYPES = new Set([
  "version-update:semver-patch",
  "version-update:semver-minor",
]);
const APPROVED_LARGE_FILES = new Set([
  "docs/source-material/references/adminlte/AdminLTE-master.zip",
]);
const APPROVED_INSTALL_SCRIPTS = new Set([
  "node_modules/@prisma/engines@7.9.1",
  "node_modules/fsevents@2.3.3",
  "node_modules/msgpackr-extract@3.0.4",
  "node_modules/prisma@7.9.1",
  "node_modules/unrs-resolver@1.12.2",
]);
const SECRET_PATTERNS = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/u],
  ["github-token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/u],
  ["aws-access-key", /\bAKIA[A-Z0-9]{16}\b/u],
  ["stripe-live-key", /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/u],
  [
    "sentry-production-dsn",
    /https:\/\/[a-f0-9]{16,64}@[a-z0-9.-]*ingest(?:\.[a-z0-9.-]+)?\.sentry\.io\/\d+/iu,
  ],
];

function normalizePath(path) {
  return path.split(sep).join("/");
}

function fail(errors) {
  if (errors.length > 0) {
    throw new Error(
      [
        "Repository security scan failed:",
        ...errors.map((error) => `- ${error}`),
      ].join("\n"),
    );
  }
}

export function findSecretTypes(content) {
  return SECRET_PATTERNS.filter(([, pattern]) => pattern.test(content)).map(
    ([name]) => name,
  );
}

function trackedFiles(repositoryRoot) {
  return execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  )
    .split("\0")
    .filter(Boolean);
}

function scanTrackedFiles(repositoryRoot, files, errors) {
  for (const relativePath of files) {
    const normalized = normalizePath(relativePath);
    const absolutePath = resolve(repositoryRoot, relativePath);
    const size = statSync(absolutePath).size;
    const name = basename(normalized).toLowerCase();
    const extension = extname(name);

    if (
      (name.startsWith(".env") && !name.endsWith(".example")) ||
      [".key", ".pem", ".p12", ".pfx", ".keystore", ".secret", ".dmp"].includes(
        extension,
      ) ||
      /(^|\/)(?:node_modules|\.next|dist|coverage|build)(?:\/|$)/u.test(
        normalized,
      )
    ) {
      errors.push(`forbidden tracked file: ${normalized}`);
    }
    if (size > MAX_TRACKED_BYTES && !APPROVED_LARGE_FILES.has(normalized)) {
      errors.push(`unapproved large file: ${normalized} (${size} bytes)`);
    }
    if (size === 0 || size > 2 * 1024 * 1024) {
      continue;
    }

    const content = readFileSync(absolutePath);
    if (content.includes(0)) {
      continue;
    }
    for (const secretType of findSecretTypes(content.toString("utf8"))) {
      errors.push(
        `high-confidence ${secretType} in tracked file ${normalized}`,
      );
    }
  }
}

function scanHistory(repositoryRoot, errors) {
  const history = execFileSync(
    "git",
    ["log", "--all", "--no-ext-diff", "--format=", "-p", "--", "."],
    { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 },
  );
  for (const secretType of findSecretTypes(history)) {
    errors.push(`high-confidence ${secretType} in Git history`);
  }
}

export function validatePackageLock(lockfile) {
  const errors = [];
  for (const [packagePath, metadata] of Object.entries(
    lockfile.packages ?? {},
  )) {
    if (metadata.link === true) {
      continue;
    }
    if (
      typeof metadata.resolved === "string" &&
      !metadata.resolved.startsWith("https://registry.npmjs.org/")
    ) {
      errors.push(`unapproved npm source for ${packagePath}`);
    }
    if (metadata.hasInstallScript === true) {
      const identity = `${packagePath}@${metadata.version}`;
      if (!APPROVED_INSTALL_SCRIPTS.has(identity)) {
        errors.push(`unapproved install script: ${identity}`);
      }
    }
  }
  return errors;
}

export function validateManifestVersions(manifests) {
  const errors = [];
  for (const [workspacePath, manifest] of Object.entries(manifests)) {
    const relativePath = workspacePath
      ? `${workspacePath}/package.json`
      : "package.json";
    for (const section of DIRECT_DEPENDENCY_SECTIONS) {
      for (const [name, version] of Object.entries(manifest[section] ?? {})) {
        if (typeof version !== "string" || !EXACT_SEMVER.test(version)) {
          errors.push(
            `non-exact ${section} version in ${relativePath}: ${name}`,
          );
        }
      }
    }
  }
  return errors;
}

export function validateReactTypesSingleton(manifests, lockfile) {
  const errors = [];
  const declarations = [];

  for (const [workspacePath, manifest] of Object.entries(manifests)) {
    if (workspacePath === "") {
      continue;
    }
    for (const section of DIRECT_DEPENDENCY_SECTIONS) {
      const version = manifest[section]?.[REACT_TYPES_PACKAGE];
      if (version !== undefined) {
        declarations.push({ section, version, workspacePath });
      }
    }
  }

  if (declarations.length === 0) {
    errors.push("@types/react singleton has no direct workspace pin");
    return errors;
  }

  for (const workspacePath of REACT_TYPES_WORKSPACES) {
    if (
      !declarations.some(
        (declaration) => declaration.workspacePath === workspacePath,
      )
    ) {
      errors.push(`@types/react direct pin missing from ${workspacePath}`);
    }
  }

  const declaredVersions = new Set(declarations.map(({ version }) => version));
  if (
    declaredVersions.size !== 1 ||
    !EXACT_SEMVER.test(declarations[0].version)
  ) {
    const summary = declarations
      .map(
        ({ section, version, workspacePath }) =>
          `${workspacePath}:${section}=${version}`,
      )
      .join(", ");
    errors.push(
      `@types/react workspace pins must be one exact version: ${summary}`,
    );
  }

  const installations = Object.entries(lockfile.packages ?? {}).filter(
    ([packagePath]) =>
      packagePath === REACT_TYPES_ROOT_PATH ||
      packagePath.endsWith(`/${REACT_TYPES_ROOT_PATH}`),
  );
  const installationPaths = installations.map(([packagePath]) => packagePath);
  if (
    installations.length !== 1 ||
    installationPaths[0] !== REACT_TYPES_ROOT_PATH
  ) {
    errors.push(
      `@types/react must have one physical installation at ${REACT_TYPES_ROOT_PATH}; found ${installationPaths.length}: ${installationPaths.join(", ") || "NONE"}`,
    );
  }

  if (
    declaredVersions.size === 1 &&
    EXACT_SEMVER.test(declarations[0].version)
  ) {
    const expectedVersion = declarations[0].version;
    const rootVersion = lockfile.packages?.[REACT_TYPES_ROOT_PATH]?.version;
    if (rootVersion !== expectedVersion) {
      errors.push(
        `@types/react singleton version mismatch: workspaces=${expectedVersion} package-lock.json=${rootVersion ?? "MISSING"}`,
      );
    }
  }

  return errors;
}

function deepmergeInstallations(lockfile) {
  return Object.entries(lockfile.packages ?? {}).filter(
    ([packagePath]) =>
      packagePath === DEEPMERGE_ROOT_PATH ||
      packagePath.endsWith(`/${DEEPMERGE_ROOT_PATH}`),
  );
}

function isVulnerableDeepmergeVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+][A-Za-z0-9.-]+)?$/u.exec(
    version ?? "",
  );
  return match !== null && Number(match[1]) < 8;
}

function isObjectRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function targetsOverridePackage(selector, packageName) {
  return selector === packageName || selector.startsWith(`${packageName}@`);
}

function formatOverridePath(node) {
  const selectors = [];
  for (let current = node; current !== null; current = current.parent) {
    selectors.push(current.selector);
  }
  return selectors.reverse().join(" > ");
}

function forbiddenTargetedOverridePaths(
  overrides,
  { childPackage, parentPackage, parentSelector },
) {
  if (!isObjectRecord(overrides)) {
    return [];
  }

  const forbiddenPaths = [];
  const pending = [{ entries: overrides, parent: null }];

  while (pending.length > 0) {
    const { entries, parent } = pending.pop();

    for (const [selector, value] of Object.entries(entries)) {
      const node = { parent, selector };
      const isExactParentSelector =
        parent === null && selector === parentSelector;
      const isExactChildSelector =
        parent?.parent === null &&
        parent.selector === parentSelector &&
        selector === childPackage;

      if (
        (targetsOverridePackage(selector, parentPackage) &&
          !isExactParentSelector) ||
        (targetsOverridePackage(selector, childPackage) &&
          !isExactChildSelector)
      ) {
        forbiddenPaths.push(formatOverridePath(node));
      }

      if (isObjectRecord(value)) {
        pending.push({ entries: value, parent: node });
      }
    }
  }

  return forbiddenPaths.sort();
}

function forbiddenMultiParentOverridePaths(
  overrides,
  { childPackage, approvedParents },
) {
  if (!isObjectRecord(overrides)) {
    return [];
  }

  const approvedSelectors = new Set(
    approvedParents.map(({ selector }) => selector),
  );
  const parentPackages = new Set(
    approvedParents.map(({ packageName }) => packageName),
  );
  const forbiddenPaths = [];
  const pending = [{ entries: overrides, parent: null }];

  while (pending.length > 0) {
    const { entries, parent } = pending.pop();

    for (const [selector, value] of Object.entries(entries)) {
      const node = { parent, selector };
      const isApprovedParent =
        parent === null && approvedSelectors.has(selector);
      const isApprovedChild =
        parent?.parent === null &&
        approvedSelectors.has(parent.selector) &&
        selector === childPackage;
      const targetsParent = [...parentPackages].some((packageName) =>
        targetsOverridePackage(selector, packageName),
      );

      if (
        (targetsParent && !isApprovedParent) ||
        (targetsOverridePackage(selector, childPackage) && !isApprovedChild)
      ) {
        forbiddenPaths.push(formatOverridePath(node));
      }

      if (isObjectRecord(value)) {
        pending.push({ entries: value, parent: node });
      }
    }
  }

  return forbiddenPaths.sort();
}

export function validatePrismaDeepmergeOverride(manifests, lockfile) {
  const errors = [];
  const overrides = manifests[""]?.overrides ?? {};
  const targetedOverride = overrides[PRISMA_CONFIG_OVERRIDE];

  for (const overridePath of forbiddenTargetedOverridePaths(overrides, {
    childPackage: DEEPMERGE_PACKAGE,
    parentPackage: "@prisma/config",
    parentSelector: PRISMA_CONFIG_OVERRIDE,
  })) {
    errors.push(
      `deepmerge-ts security override is forbidden at path: ${overridePath}`,
    );
  }
  if (
    targetedOverride === null ||
    typeof targetedOverride !== "object" ||
    Array.isArray(targetedOverride) ||
    targetedOverride[DEEPMERGE_PACKAGE] !== DEEPMERGE_SAFE_VERSION ||
    Object.keys(targetedOverride).length !== 1
  ) {
    errors.push(
      "@prisma/config@7.9.1 must override deepmerge-ts to exact version 8.0.1",
    );
  }

  const apiManifest = manifests["apps/api"] ?? {};
  if (
    apiManifest.dependencies?.["@prisma/client"] !== PRISMA_VERSION ||
    apiManifest.devDependencies?.prisma !== PRISMA_VERSION
  ) {
    errors.push("Prisma and Prisma Client must remain exactly 7.9.1");
  }

  const packages = lockfile.packages ?? {};
  if (
    packages[PRISMA_CONFIG_PATH]?.dependencies?.[DEEPMERGE_PACKAGE] !== "7.1.5"
  ) {
    errors.push(
      "@prisma/config@7.9.1 lock metadata must retain its audited deepmerge-ts 7.1.5 dependency",
    );
  }
  if (
    packages[PRISMA_CONFIG_PATH]?.version !== PRISMA_VERSION ||
    packages[PRISMA_PATH]?.version !== PRISMA_VERSION ||
    packages[PRISMA_CLIENT_PATH]?.version !== PRISMA_VERSION
  ) {
    errors.push(
      "package-lock must resolve Prisma, Prisma Client and @prisma/config to 7.9.1",
    );
  }
  for (const parentPath of unexpectedDependencyParentPaths(
    lockfile,
    DEEPMERGE_PACKAGE,
    [PRISMA_CONFIG_PATH],
  )) {
    errors.push(`deepmerge-ts has an unapproved lock parent: ${parentPath}`);
  }

  const installations = deepmergeInstallations(lockfile);
  const vulnerable = installations.filter(([, metadata]) =>
    isVulnerableDeepmergeVersion(metadata.version),
  );
  if (vulnerable.length > 0) {
    errors.push(
      `vulnerable deepmerge-ts installation(s): ${vulnerable
        .map(([packagePath, metadata]) => `${packagePath}@${metadata.version}`)
        .join(", ")}`,
    );
  }

  if (
    installations.length !== 1 ||
    installations[0]?.[0] !== DEEPMERGE_ROOT_PATH ||
    installations[0]?.[1]?.version !== DEEPMERGE_SAFE_VERSION
  ) {
    errors.push(
      `deepmerge-ts must have one physical installation at ${DEEPMERGE_ROOT_PATH}@${DEEPMERGE_SAFE_VERSION}; found ${
        installations
          .map(
            ([packagePath, metadata]) =>
              `${packagePath}@${metadata.version ?? "MISSING"}`,
          )
          .join(", ") || "NONE"
      }`,
    );
  }

  return errors;
}

function mysqlInstallations(lockfile) {
  return Object.entries(lockfile.packages ?? {}).filter(
    ([packagePath]) =>
      packagePath === MYSQL_ROOT_PATH ||
      packagePath.endsWith(`/${MYSQL_ROOT_PATH}`),
  );
}

function unexpectedDependencyParentPaths(
  lockfile,
  childPackage,
  approvedParentPaths,
) {
  const approved = new Set(approvedParentPaths);
  return Object.entries(lockfile.packages ?? {})
    .filter(([, metadata]) =>
      DIRECT_DEPENDENCY_SECTIONS.some((section) =>
        Object.prototype.hasOwnProperty.call(
          metadata[section] ?? {},
          childPackage,
        ),
      ),
    )
    .map(([packagePath]) => packagePath || "<root>")
    .filter((packagePath) => !approved.has(packagePath))
    .sort();
}

function isVulnerableMysqlVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+][A-Za-z0-9.-]+)?$/u.exec(
    version ?? "",
  );
  if (match === null) {
    return false;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return (
    major < 3 || (major === 3 && (minor < 23 || (minor === 23 && patch < 1)))
  );
}

export function validatePrismaMysqlOverride(manifests, lockfile) {
  const errors = [];
  const overrides = manifests[""]?.overrides ?? {};
  const targetedOverride = overrides[PRISMA_OVERRIDE];

  for (const overridePath of forbiddenTargetedOverridePaths(overrides, {
    childPackage: MYSQL_PACKAGE,
    parentPackage: "prisma",
    parentSelector: PRISMA_OVERRIDE,
  })) {
    errors.push(
      `mysql2 security override is forbidden at path: ${overridePath}`,
    );
  }
  if (
    targetedOverride === null ||
    typeof targetedOverride !== "object" ||
    Array.isArray(targetedOverride) ||
    targetedOverride[MYSQL_PACKAGE] !== MYSQL_SAFE_VERSION ||
    Object.keys(targetedOverride).length !== 1
  ) {
    errors.push("prisma@7.9.1 must override mysql2 to exact version 3.23.1");
  }

  const apiManifest = manifests["apps/api"] ?? {};
  if (apiManifest.devDependencies?.prisma !== PRISMA_VERSION) {
    errors.push("Prisma must remain exactly 7.9.1 for the mysql2 override");
  }

  const packages = lockfile.packages ?? {};
  if (
    packages[PRISMA_PATH]?.dependencies?.[MYSQL_PACKAGE] !==
    MYSQL_DECLARED_VERSION
  ) {
    errors.push(
      "prisma@7.9.1 lock metadata must retain its audited mysql2 3.15.3 dependency",
    );
  }
  if (packages[PRISMA_PATH]?.version !== PRISMA_VERSION) {
    errors.push("package-lock must resolve Prisma to 7.9.1");
  }
  for (const parentPath of unexpectedDependencyParentPaths(
    lockfile,
    MYSQL_PACKAGE,
    [PRISMA_PATH],
  )) {
    errors.push(`mysql2 has an unapproved lock parent: ${parentPath}`);
  }

  const installations = mysqlInstallations(lockfile);
  const vulnerable = installations.filter(([, metadata]) =>
    isVulnerableMysqlVersion(metadata.version),
  );
  if (vulnerable.length > 0) {
    errors.push(
      `vulnerable mysql2 installation(s): ${vulnerable
        .map(([packagePath, metadata]) => `${packagePath}@${metadata.version}`)
        .join(", ")}`,
    );
  }

  if (
    installations.length !== 1 ||
    installations[0]?.[0] !== MYSQL_ROOT_PATH ||
    installations[0]?.[1]?.version !== MYSQL_SAFE_VERSION
  ) {
    errors.push(
      `mysql2 must have one physical installation at ${MYSQL_ROOT_PATH}@${MYSQL_SAFE_VERSION}; found ${
        installations
          .map(
            ([packagePath, metadata]) =>
              `${packagePath}@${metadata.version ?? "MISSING"}`,
          )
          .join(", ") || "NONE"
      }`,
    );
  }

  return errors;
}

function fastUriInstallations(lockfile) {
  return Object.entries(lockfile.packages ?? {}).filter(
    ([packagePath]) =>
      packagePath === FAST_URI_ROOT_PATH ||
      packagePath.endsWith(`/${FAST_URI_ROOT_PATH}`),
  );
}

function isVulnerableFastUriVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+][A-Za-z0-9.-]+)?$/u.exec(
    version ?? "",
  );
  if (match === null) {
    return false;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return major === 3 && (minor < 1 || (minor === 1 && patch < 6));
}

export function validateAjvFastUriOverride(manifests, lockfile) {
  const errors = [];
  const overrides = manifests[""]?.overrides ?? {};
  const targetedOverride = overrides[FAST_URI_PARENT.selector];

  for (const overridePath of forbiddenMultiParentOverridePaths(overrides, {
    childPackage: FAST_URI_PACKAGE,
    approvedParents: [FAST_URI_PARENT],
  })) {
    errors.push(
      `fast-uri security override is forbidden at path: ${overridePath}`,
    );
  }
  if (
    !isObjectRecord(targetedOverride) ||
    targetedOverride[FAST_URI_PACKAGE] !== FAST_URI_SAFE_VERSION ||
    Object.keys(targetedOverride).length !== 1
  ) {
    errors.push("ajv@8.18.0 must override fast-uri to exact version 3.1.6");
  }

  const packages = lockfile.packages ?? {};
  const parentMetadata = packages[FAST_URI_PARENT.packagePath];
  if (
    parentMetadata?.version !== FAST_URI_PARENT.version ||
    parentMetadata?.dependencies?.[FAST_URI_PACKAGE] !==
      FAST_URI_PARENT.declaredVersion
  ) {
    errors.push(
      "ajv@8.18.0 lock metadata must retain its audited fast-uri ^3.0.1 dependency",
    );
  }
  for (const parentPath of unexpectedDependencyParentPaths(
    lockfile,
    FAST_URI_PACKAGE,
    [FAST_URI_PARENT.packagePath],
  )) {
    errors.push(`fast-uri has an unapproved lock parent: ${parentPath}`);
  }

  const installations = fastUriInstallations(lockfile);
  const vulnerable = installations.filter(([, metadata]) =>
    isVulnerableFastUriVersion(metadata.version),
  );
  if (vulnerable.length > 0) {
    errors.push(
      `vulnerable fast-uri installation(s): ${vulnerable
        .map(([packagePath, metadata]) => `${packagePath}@${metadata.version}`)
        .join(", ")}`,
    );
  }
  if (
    installations.length !== 1 ||
    installations[0]?.[0] !== FAST_URI_ROOT_PATH ||
    installations[0]?.[1]?.version !== FAST_URI_SAFE_VERSION
  ) {
    errors.push(
      `fast-uri must have one physical installation at ${FAST_URI_ROOT_PATH}@${FAST_URI_SAFE_VERSION}; found ${
        installations
          .map(
            ([packagePath, metadata]) =>
              `${packagePath}@${metadata.version ?? "MISSING"}`,
          )
          .join(", ") || "NONE"
      }`,
    );
  }

  return errors;
}

function qsInstallations(lockfile) {
  return Object.entries(lockfile.packages ?? {}).filter(
    ([packagePath]) =>
      packagePath === QS_ROOT_PATH || packagePath.endsWith(`/${QS_ROOT_PATH}`),
  );
}

function isVulnerableQsVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+][A-Za-z0-9.-]+)?$/u.exec(
    version ?? "",
  );
  if (match === null) {
    return false;
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const atLeast225 =
    major > 2 || (major === 2 && (minor > 2 || (minor === 2 && patch >= 5)));
  const before616 = major < 6 || (major === 6 && minor < 16);
  return atLeast225 && before616;
}

export function validateQsOverrides(manifests, lockfile) {
  const errors = [];
  const overrides = manifests[""]?.overrides ?? {};

  for (const overridePath of forbiddenMultiParentOverridePaths(overrides, {
    childPackage: QS_PACKAGE,
    approvedParents: QS_PARENTS,
  })) {
    errors.push(`qs security override is forbidden at path: ${overridePath}`);
  }
  for (const parent of QS_PARENTS) {
    const targetedOverride = overrides[parent.selector];
    if (
      !isObjectRecord(targetedOverride) ||
      targetedOverride[QS_PACKAGE] !== QS_SAFE_VERSION ||
      Object.keys(targetedOverride).length !== 1
    ) {
      errors.push(
        `${parent.selector} must override qs to exact version ${QS_SAFE_VERSION}`,
      );
    }

    const parentMetadata = lockfile.packages?.[parent.packagePath];
    if (
      parentMetadata?.version !== parent.version ||
      parentMetadata?.dependencies?.[QS_PACKAGE] !== parent.declaredVersion
    ) {
      errors.push(
        `${parent.selector} lock metadata must retain its audited qs ${parent.declaredVersion} dependency`,
      );
    }
  }
  for (const parentPath of unexpectedDependencyParentPaths(
    lockfile,
    QS_PACKAGE,
    QS_PARENTS.map(({ packagePath }) => packagePath),
  )) {
    errors.push(`qs has an unapproved lock parent: ${parentPath}`);
  }

  const installations = qsInstallations(lockfile);
  const vulnerable = installations.filter(([, metadata]) =>
    isVulnerableQsVersion(metadata.version),
  );
  if (vulnerable.length > 0) {
    errors.push(
      `vulnerable qs installation(s): ${vulnerable
        .map(([packagePath, metadata]) => `${packagePath}@${metadata.version}`)
        .join(", ")}`,
    );
  }
  if (
    installations.length !== 1 ||
    installations[0]?.[0] !== QS_ROOT_PATH ||
    installations[0]?.[1]?.version !== QS_SAFE_VERSION
  ) {
    errors.push(
      `qs must have one physical installation at ${QS_ROOT_PATH}@${QS_SAFE_VERSION}; found ${
        installations
          .map(
            ([packagePath, metadata]) =>
              `${packagePath}@${metadata.version ?? "MISSING"}`,
          )
          .join(", ") || "NONE"
      }`,
    );
  }

  return errors;
}

export function validateManifestLockConsistency(manifests, lockfile) {
  const errors = [];
  for (const [workspacePath, manifest] of Object.entries(manifests)) {
    const lockWorkspace = lockfile.packages?.[workspacePath];
    const displayPath = workspacePath || ".";
    if (lockWorkspace === undefined) {
      errors.push(`package-lock missing workspace metadata for ${displayPath}`);
      continue;
    }

    for (const section of DIRECT_DEPENDENCY_SECTIONS) {
      const manifestDependencies = manifest[section] ?? {};
      const lockDependencies = lockWorkspace[section] ?? {};
      for (const [name, specification] of Object.entries(
        manifestDependencies,
      )) {
        if (lockDependencies[name] !== specification) {
          errors.push(
            `package-lock mismatch for ${displayPath} ${section} ${name}: package.json=${specification} package-lock.json=${lockDependencies[name] ?? "MISSING"}`,
          );
        }
      }
      for (const name of Object.keys(lockDependencies)) {
        if (!(name in manifestDependencies)) {
          errors.push(
            `stale package-lock direct dependency for ${displayPath} ${section} ${name}`,
          );
        }
      }
    }
  }
  return errors;
}

function yamlScalar(value) {
  const normalized = value.trim();
  if (
    normalized.length >= 2 &&
    ((normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'")))
  ) {
    return normalized.slice(1, -1);
  }
  return normalized;
}

function dependabotBlocks(content) {
  const lines = content.replace(/^\uFEFF/u, "").split(/\r?\n/u);
  const starts = [];
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^  - package-ecosystem:\s*(.+?)\s*$/u);
    if (match) {
      starts.push({ ecosystem: yamlScalar(match[1]), index });
    }
  }
  return starts.map(({ ecosystem, index }, position) => ({
    ecosystem,
    lines: lines.slice(index, starts[position + 1]?.index ?? lines.length),
  }));
}

function scalarField(lines, indentation, name) {
  const prefix = " ".repeat(indentation);
  const pattern = new RegExp(`^${prefix}${name}:\\s*(.+?)\\s*$`, "u");
  const values = lines
    .map((line) => line.match(pattern)?.[1])
    .filter((value) => value !== undefined)
    .map(yamlScalar);
  return values.length === 1 ? values[0] : undefined;
}

function dependabotAllowRules(lines) {
  const allowStart = lines.findIndex((line) => line === "    allow:");
  if (allowStart === -1) {
    return [];
  }
  const allowLines = [];
  for (const line of lines.slice(allowStart + 1)) {
    if (/^    \S/u.test(line)) {
      break;
    }
    allowLines.push(line);
  }
  const starts = allowLines
    .map((line, index) => (/^      - \S/u.test(line) ? index : -1))
    .filter((index) => index !== -1);
  return starts.map((index, position) => {
    const rule = allowLines.slice(
      index,
      starts[position + 1] ?? allowLines.length,
    );
    return [rule[0].replace(/^      - /u, "        "), ...rule.slice(1)];
  });
}

function allowRuleUpdateTypes(lines) {
  const start = lines.findIndex((line) => line === "        update-types:");
  if (start === -1) {
    return [];
  }
  const values = [];
  for (const line of lines.slice(start + 1)) {
    const match = line.match(/^          -\s*(.+?)\s*$/u);
    if (!match) {
      break;
    }
    values.push(yamlScalar(match[1]));
  }
  return values;
}

export function validateDependabotPolicy(content) {
  const errors = [];
  const blocks = dependabotBlocks(content);
  for (const [ecosystem, directory] of DEPENDABOT_ECOSYSTEMS) {
    const matching = blocks.filter((block) => block.ecosystem === ecosystem);
    if (matching.length !== 1) {
      errors.push(
        `Dependabot must define exactly one ${ecosystem} update block; found ${matching.length}`,
      );
      continue;
    }
    const [block] = matching;
    if (scalarField(block.lines, 4, "directory") !== directory) {
      errors.push(`Dependabot ${ecosystem} directory must be ${directory}`);
    }
    if (scalarField(block.lines, 6, "interval") !== "weekly") {
      errors.push(`Dependabot ${ecosystem} schedule must be weekly`);
    }

    const rules = dependabotAllowRules(block.lines);
    if (rules.length !== 1) {
      errors.push(
        `Dependabot ${ecosystem} must define exactly one allow rule; found ${rules.length}`,
      );
      continue;
    }
    const [rule] = rules;
    if (scalarField(rule, 8, "dependency-name") !== "*") {
      errors.push(`Dependabot ${ecosystem} allow rule must match every name`);
    }
    if (scalarField(rule, 8, "dependency-type") !== "direct") {
      errors.push(`Dependabot ${ecosystem} allow rule must be direct-only`);
    }
    const updateTypes = allowRuleUpdateTypes(rule);
    if (
      updateTypes.length !== DEPENDABOT_UPDATE_TYPES.size ||
      updateTypes.some((type) => !DEPENDABOT_UPDATE_TYPES.has(type))
    ) {
      errors.push(
        `Dependabot ${ecosystem} version updates must be patch/minor only`,
      );
    }
  }

  const unexpected = blocks
    .map(({ ecosystem }) => ecosystem)
    .filter((ecosystem) => !DEPENDABOT_ECOSYSTEMS.has(ecosystem));
  if (unexpected.length > 0) {
    errors.push(
      `unapproved Dependabot ecosystems: ${[...new Set(unexpected)].join(", ")}`,
    );
  }
  if (/^\s*(?:auto-merge|automerge):/mu.test(content)) {
    errors.push("Dependabot auto-merge configuration is forbidden");
  }
  return errors;
}

function validatePubLock(repositoryRoot, errors) {
  const content = readFileSync(
    resolve(repositoryRoot, "apps", "mobile", "pubspec.lock"),
    "utf8",
  );
  for (const match of content.matchAll(/^\s+url:\s+"([^"]+)"\s*$/gmu)) {
    if (match[1] !== "https://pub.dev") {
      errors.push("unapproved Flutter package source");
    }
  }
  for (const match of content.matchAll(/^\s+source:\s+(\S+)\s*$/gmu)) {
    if (!["hosted", "sdk"].includes(match[1])) {
      errors.push(`unapproved Flutter source type: ${match[1]}`);
    }
  }
}

function verifyImmutableBaseline(repositoryRoot, errors) {
  const manifest = readFileSync(
    resolve(
      repositoryRoot,
      "docs",
      "governance",
      "SOURCE_BASELINE_MANIFEST.sha256",
    ),
    "utf8",
  );
  const entries = manifest
    .split(/\r?\n/u)
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => line.match(/^([a-f0-9]{64})  (.+)$/u));

  for (const entry of entries) {
    if (entry === null) {
      errors.push("invalid immutable baseline manifest entry");
      continue;
    }
    const [, expected, relativePath] = entry;
    const actual = createHash("sha256")
      .update(readFileSync(resolve(repositoryRoot, relativePath)))
      .digest("hex");
    if (actual !== expected) {
      errors.push(`immutable baseline mismatch: ${relativePath}`);
    }
  }
  return entries.length;
}

export function scanRepository(repositoryRoot = process.cwd(), options = {}) {
  const errors = [];
  const files = trackedFiles(repositoryRoot);
  scanTrackedFiles(repositoryRoot, files, errors);
  const manifests = Object.fromEntries(
    files
      .filter((path) => basename(path) === "package.json")
      .map((relativePath) => {
        const normalized = normalizePath(relativePath);
        const workspacePath =
          normalized === "package.json"
            ? ""
            : normalized.slice(0, -"/package.json".length);
        return [
          workspacePath,
          JSON.parse(
            readFileSync(resolve(repositoryRoot, relativePath), "utf8"),
          ),
        ];
      }),
  );
  const lockfile = JSON.parse(
    readFileSync(resolve(repositoryRoot, "package-lock.json"), "utf8"),
  );
  errors.push(...validateManifestVersions(manifests));
  errors.push(...validateManifestLockConsistency(manifests, lockfile));
  errors.push(...validateReactTypesSingleton(manifests, lockfile));
  errors.push(...validatePrismaDeepmergeOverride(manifests, lockfile));
  errors.push(...validatePrismaMysqlOverride(manifests, lockfile));
  errors.push(...validateAjvFastUriOverride(manifests, lockfile));
  errors.push(...validateQsOverrides(manifests, lockfile));
  errors.push(...validatePackageLock(lockfile));
  errors.push(
    ...validateDependabotPolicy(
      readFileSync(
        resolve(repositoryRoot, ".github", "dependabot.yml"),
        "utf8",
      ),
    ),
  );
  validatePubLock(repositoryRoot, errors);
  const immutableFiles = verifyImmutableBaseline(repositoryRoot, errors);
  if (options.history !== false) {
    scanHistory(repositoryRoot, errors);
  }
  fail(errors);
  return {
    approvedInstallScripts: APPROVED_INSTALL_SCRIPTS.size,
    historyScanned: options.history !== false,
    immutableFiles,
    trackedFiles: files.length,
  };
}

const direct =
  process.argv[1] &&
  fileURLToPath(import.meta.url).toLowerCase() ===
    resolve(process.argv[1]).toLowerCase();

if (direct) {
  const result = scanRepository();
  console.log(
    `Security scan passed: ${result.trackedFiles} files, history=${result.historyScanned}, immutable=${result.immutableFiles}, ${result.approvedInstallScripts} qualified install scripts.`,
  );
}
