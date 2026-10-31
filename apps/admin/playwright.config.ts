import { defineConfig, devices } from '@playwright/test';
import { basename, isAbsolute } from 'node:path';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`Missing ${name}.`);
  return value;
}

const baseURL = required('KORA_C3_BASE_URL');
const outputDir = required('KORA_C3_PLAYWRIGHT_OUTPUT_DIR');
const entrySpki = required('KORA_C3_ENTRY_SPKI_SHA256');
const artifactRedactionProbeMode = process.env.KORA_C3_ARTIFACT_REDACTION_PROBE === '1';
const visualFixtureMode = process.env.KORA_C3_VISUAL_FIXTURE_MODE === '1';
const visualOutputDir = visualFixtureMode ? required('KORA_C3_VISUAL_OUTPUT_DIR') : undefined;
const firefoxExecutablePath = process.env.KORA_C3_FIREFOX_EXECUTABLE_PATH;
const parsedBaseUrl = new URL(baseURL);
const loopbackSmokeUrl = `https://127.0.0.1:${parsedBaseUrl.port}`;

process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

if (
  process.env.KORA_C3_VISUAL_FIXTURE_MODE !== undefined &&
  process.env.KORA_C3_VISUAL_FIXTURE_MODE !== '1'
) {
  throw new Error('Invalid C3 visual fixture mode.');
}
if (
  process.env.KORA_C3_ARTIFACT_REDACTION_PROBE !== undefined &&
  process.env.KORA_C3_ARTIFACT_REDACTION_PROBE !== '1'
) {
  throw new Error('Invalid C3 artifact redaction probe mode.');
}
if (visualFixtureMode && artifactRedactionProbeMode) {
  throw new Error('C3 visual and artifact redaction probe modes are mutually exclusive.');
}
if (
  firefoxExecutablePath !== undefined &&
  (process.platform !== 'win32' ||
    !isAbsolute(firefoxExecutablePath) ||
    basename(firefoxExecutablePath).toLowerCase() !== 'firefox.exe')
) {
  throw new Error('Invalid qualified Firefox executable path.');
}

if (
  parsedBaseUrl.protocol !== 'https:' ||
  parsedBaseUrl.hostname !== 'admin.c3.invalid' ||
  parsedBaseUrl.username !== '' ||
  parsedBaseUrl.password !== '' ||
  parsedBaseUrl.pathname !== '/' ||
  !isAbsolute(outputDir) ||
  (visualOutputDir !== undefined && !isAbsolute(visualOutputDir)) ||
  !/^[A-Za-z0-9+/]{43}=$/u.test(entrySpki)
) {
  throw new Error('Invalid C3 browser campaign configuration.');
}

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir,
  preserveOutput: 'always',
  projects: visualFixtureMode
    ? [
        {
          name: 'chromium-visual-fixture',
          grep: /@visual-fixture/u,
          use: {
            ...devices['Desktop Chrome'],
            baseURL: loopbackSmokeUrl,
            ignoreHTTPSErrors: true,
          },
        },
      ]
    : artifactRedactionProbeMode
      ? [
          {
            name: 'chromium-artifact-redaction-probe',
            grep: /@artifact-redaction-probe/u,
            use: {
              ...devices['Desktop Chrome'],
              launchOptions: {
                args: [
                  `--ignore-certificate-errors-spki-list=${entrySpki}`,
                  '--host-resolver-rules=MAP admin.c3.invalid 127.0.0.1,EXCLUDE localhost',
                ],
              },
            },
          },
        ]
      : [
          {
            name: 'chromium-c3',
            grepInvert: /@artifact-redaction-probe|@public-smoke|@visual-fixture/u,
            use: {
              ...devices['Desktop Chrome'],
              launchOptions: {
                args: [
                  `--ignore-certificate-errors-spki-list=${entrySpki}`,
                  '--host-resolver-rules=MAP admin.c3.invalid 127.0.0.1,EXCLUDE localhost',
                ],
              },
            },
          },
          {
            name: 'firefox-public-smoke',
            grep: /@public-smoke/u,
            use: {
              ...devices['Desktop Firefox'],
              baseURL: loopbackSmokeUrl,
              // This project proves only public rendering. TLS identity is proved by Chromium with SPKI pinning.
              ignoreHTTPSErrors: true,
              launchOptions: {
                ...(firefoxExecutablePath === undefined
                  ? {}
                  : { executablePath: firefoxExecutablePath }),
                firefoxUserPrefs: {
                  'datareporting.policy.firstRunURL': '',
                },
              },
            },
          },
          {
            name: 'webkit-public-smoke',
            grep: /@public-smoke/u,
            use: {
              ...devices['Desktop Safari'],
              baseURL: loopbackSmokeUrl,
              // This project proves only public rendering. TLS identity is proved by Chromium with SPKI pinning.
              ignoreHTTPSErrors: true,
            },
          },
        ],
  reporter: [['line']],
  retries: 0,
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL,
    screenshot: 'off',
    serviceWorkers: 'block',
    trace: 'off',
    video: 'off',
  },
  workers: 1,
});
