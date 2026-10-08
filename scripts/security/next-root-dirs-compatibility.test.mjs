import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

import { ESLint } from "eslint";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "..", "..");
const NEXT_PLUGIN = "@next/eslint-plugin-next";
const NEXT_PLUGIN_VERSION = "16.3.8";
const NEXT_PLUGIN_SELECTOR = `${NEXT_PLUGIN}@${NEXT_PLUGIN_VERSION}`;
const ALIAS_SPEC = "npm:tinyglobby@0.2.17";
const ALIAS_VERSION = "0.2.17";
const ALIAS_INTEGRITY =
  "sha512-wXR/dYpcqKmfWpEdZjiKJOwCNFndD0DMnrW/cYjVGttEkBfVgcLFHoNrlj47mjOVic9yyNu65alsgF4NQyTa2g==";
const COMMON_NEXT_RULE = "@next/next/no-sync-scripts";
const ROOT_DIR_RULE = "@next/next/no-html-link-for-pages";
const WORKSPACES = [
  { path: "apps/web", rootDirRuleSeverity: 2 },
  { path: "apps/admin", rootDirRuleSeverity: 2 },
  { path: "packages/ui", rootDirRuleSeverity: 0 },
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function severity(config, ruleId) {
  const rule = config.rules?.[ruleId];
  return Array.isArray(rule) ? rule[0] : rule;
}

export function assertNoNextRootDir(configs, source) {
  for (const [index, config] of configs.entries()) {
    const nextSettings = config?.settings?.next;
    assert.equal(
      nextSettings !== null &&
        typeof nextSettings === "object" &&
        Object.prototype.hasOwnProperty.call(nextSettings, "rootDir"),
      false,
      `${source}[${index}] must not define settings.next.rootDir; tinyglobby directory expansion is not generally compatible with fast-glob`,
    );
  }
}

export function assertRequiredNextRules(
  config,
  { rootDirRuleSeverity, source },
) {
  assert.ok(config.plugins?.["@next/next"], `${source} must load Next plugin`);
  assert.equal(
    severity(config, COMMON_NEXT_RULE),
    2,
    `${source} must keep ${COMMON_NEXT_RULE} enabled as an error`,
  );
  assert.equal(
    severity(config, ROOT_DIR_RULE),
    rootDirRuleSeverity,
    `${source} must preserve the existing ${ROOT_DIR_RULE} severity`,
  );
}

export function assertScopedAlias(rootManifest, lockfile) {
  const overrides = rootManifest.overrides ?? {};
  const pluginSelectors = Object.keys(overrides).filter((selector) =>
    selector.startsWith(`${NEXT_PLUGIN}@`),
  );
  assert.deepEqual(pluginSelectors, [NEXT_PLUGIN_SELECTOR]);
  assert.deepEqual(overrides[NEXT_PLUGIN_SELECTOR], {
    "fast-glob": ALIAS_SPEC,
  });
  for (const forbidden of ["fast-glob", "micromatch", "braces"]) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(overrides, forbidden),
      false,
      `global ${forbidden} override is forbidden`,
    );
  }

  const pluginLock = lockfile.packages?.[`node_modules/${NEXT_PLUGIN}`] ?? {};
  assert.equal(pluginLock.version, NEXT_PLUGIN_VERSION);
  assert.equal(pluginLock.dependencies?.["fast-glob"], "3.3.1");
  const aliasLock =
    lockfile.packages?.[
      "node_modules/@next/eslint-plugin-next/node_modules/fast-glob"
    ] ?? {};
  assert.equal(aliasLock.name, "tinyglobby");
  assert.equal(aliasLock.version, ALIAS_VERSION);
  assert.equal(aliasLock.integrity, ALIAS_INTEGRITY);
}

function assertRuleDiagnostic(results, ruleId, expectedCount, source) {
  const messages = results.flatMap((result) => result.messages);
  assert.equal(
    messages.filter((message) => message.ruleId === ruleId).length,
    expectedCount,
    `${source} expected ${expectedCount} ${ruleId} diagnostic(s): ${JSON.stringify(messages)}`,
  );
}

test("the plugin physically resolves fast-glob to the qualified tinyglobby alias", () => {
  const rootRequire = createRequire(import.meta.url);
  const pluginManifestPath = rootRequire.resolve(`${NEXT_PLUGIN}/package.json`);
  const pluginManifest = readJson(pluginManifestPath);
  assert.equal(pluginManifest.version, NEXT_PLUGIN_VERSION);
  assert.equal(pluginManifest.dependencies?.["fast-glob"], "3.3.1");

  const pluginRequire = createRequire(pluginManifestPath);
  const aliasManifestPath = pluginRequire.resolve("fast-glob/package.json");
  const aliasManifest = readJson(aliasManifestPath);
  assert.equal(aliasManifest.name, "tinyglobby");
  assert.equal(aliasManifest.version, ALIAS_VERSION);
  assert.equal(aliasManifest.license, "MIT");
  assert.equal(aliasManifest.engines?.node, ">=12.0.0");
  assert.deepEqual(aliasManifest.dependencies, {
    fdir: "^6.5.0",
    picomatch: "^4.0.4",
  });
  assert.equal(aliasManifest.exports?.["."]?.require, "./dist/index.cjs");
  assert.equal(aliasManifest.exports?.["."]?.import, "./dist/index.mjs");
  assert.match(
    aliasManifestPath.split(sep).join("/"),
    /\/node_modules\/@next\/eslint-plugin-next\/node_modules\/fast-glob\/package\.json$/u,
  );
  assert.equal(typeof pluginRequire("fast-glob").globSync, "function");
});

test("the manifest and lock retain only the exact scoped alias", () => {
  const rootManifest = readJson(resolve(REPOSITORY_ROOT, "package.json"));
  const lockfile = readJson(resolve(REPOSITORY_ROOT, "package-lock.json"));
  assertScopedAlias(rootManifest, lockfile);

  for (const mutate of [
    (manifest) => {
      manifest.overrides["fast-glob"] = ALIAS_SPEC;
    },
    (manifest) => {
      delete manifest.overrides[NEXT_PLUGIN_SELECTOR];
      manifest.overrides["@next/eslint-plugin-next@16.3.7"] = {
        "fast-glob": ALIAS_SPEC,
      };
    },
    (manifest) => {
      manifest.overrides[NEXT_PLUGIN_SELECTOR]["fast-glob"] =
        "npm:tinyglobby@0.2.16";
    },
  ]) {
    const candidate = structuredClone(rootManifest);
    mutate(candidate);
    assert.throws(() => assertScopedAlias(candidate, lockfile));
  }

  const wrongAlias = structuredClone(lockfile);
  wrongAlias.packages[
    "node_modules/@next/eslint-plugin-next/node_modules/fast-glob"
  ].name = "fast-glob";
  assert.throws(() => assertScopedAlias(rootManifest, wrongAlias));
  const wrongVersion = structuredClone(lockfile);
  wrongVersion.packages[
    "node_modules/@next/eslint-plugin-next/node_modules/fast-glob"
  ].version = "0.2.16";
  assert.throws(() => assertScopedAlias(rootManifest, wrongVersion));
});

test("the qualification boundary rejects every settings.next.rootDir form", () => {
  for (const rootDir of [
    "apps/web",
    "apps/web/",
    ["apps/web", "apps/admin"],
    "apps/{web,admin}",
  ]) {
    assert.throws(
      () =>
        assertNoNextRootDir(
          [{ settings: { next: { rootDir } } }],
          "negative probe",
        ),
      /must not define settings\.next\.rootDir/u,
    );
  }
  assert.throws(() =>
    assertNoNextRootDir(
      [{ settings: { next: { rootDir: undefined } } }],
      "undefined property probe",
    ),
  );
});

test("a removed or disabled required Next rule is rejected", () => {
  const baseConfig = {
    plugins: { "@next/next": {} },
    rules: {
      [COMMON_NEXT_RULE]: 2,
      [ROOT_DIR_RULE]: 2,
    },
  };
  assert.doesNotThrow(() =>
    assertRequiredNextRules(baseConfig, {
      rootDirRuleSeverity: 2,
      source: "positive probe",
    }),
  );
  for (const candidate of [
    {
      ...baseConfig,
      rules: { ...baseConfig.rules, [COMMON_NEXT_RULE]: 0 },
    },
    {
      ...baseConfig,
      rules: { [ROOT_DIR_RULE]: 2 },
    },
  ]) {
    assert.throws(() =>
      assertRequiredNextRules(candidate, {
        rootDirRuleSeverity: 2,
        source: "negative probe",
      }),
    );
  }
});

for (const workspace of WORKSPACES) {
  test(`${workspace.path} uses its real cwd, effective configs and Next rules`, async () => {
    const cwd = resolve(REPOSITORY_ROOT, workspace.path);
    const configModule = await import(
      pathToFileURL(resolve(cwd, "eslint.config.mjs")).href
    );
    assert.ok(Array.isArray(configModule.default));
    assertNoNextRootDir(
      configModule.default,
      `${workspace.path} config blocks`,
    );

    const eslint = new ESLint({ cwd });
    const results = await eslint.lintFiles(["."]);
    assert.ok(results.length > 0, `${workspace.path} must lint real files`);
    assert.equal(
      results.flatMap((result) => result.messages).length,
      0,
      `${workspace.path} baseline lint must stay clean`,
    );

    const effectiveConfigs = [];
    for (const result of results) {
      const relativePath = relative(cwd, result.filePath);
      assert.equal(
        relativePath.startsWith("..") || resolve(relativePath) === relativePath,
        false,
        `${result.filePath} must be linted from ${cwd}`,
      );
      const config = await eslint.calculateConfigForFile(result.filePath);
      effectiveConfigs.push(config);
      assertRequiredNextRules(config, {
        rootDirRuleSeverity: workspace.rootDirRuleSeverity,
        source: `${workspace.path}:${relativePath}`,
      });
    }
    assertNoNextRootDir(
      effectiveConfigs,
      `${workspace.path} effective configs`,
    );

    const probePath = resolve(cwd, "next-compatibility-probe.tsx");
    const syncBad = await eslint.lintText(
      'export default function Probe() { return <script src="/probe.js" />; }',
      { filePath: probePath },
    );
    const syncGood = await eslint.lintText(
      'export default function Probe() { return <script defer src="/probe.js" />; }',
      { filePath: probePath },
    );
    assertRuleDiagnostic(syncBad, COMMON_NEXT_RULE, 1, workspace.path);
    assertRuleDiagnostic(syncGood, COMMON_NEXT_RULE, 0, workspace.path);

    if (workspace.rootDirRuleSeverity === 2) {
      const linkBad = await eslint.lintText(
        'export default function Probe() { return <a href="/">Home</a>; }',
        { filePath: probePath },
      );
      const linkGood = await eslint.lintText(
        'import Link from "next/link"; export default function Probe() { return <Link href="/">Home</Link>; }',
        { filePath: probePath },
      );
      assertRuleDiagnostic(linkBad, ROOT_DIR_RULE, 1, workspace.path);
      assertRuleDiagnostic(linkGood, ROOT_DIR_RULE, 0, workspace.path);
    }
  });
}
