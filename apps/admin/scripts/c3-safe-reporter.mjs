import { chmodSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';

const SUMMARY_BASENAME = 'c3-safe-browser-summary.json';

const scenarioByProjectAndLine = new Map([
  ['chromium-c3:506', 'CHROMIUM_RETRY_AFTER_BOUNDARIES'],
  ['chromium-c3:753', 'CHROMIUM_FIRST_LOGIN_TOTP_RECOVERY'],
  ['chromium-c3:765', 'CHROMIUM_ENROLLMENT_SESSION_LOGOUT'],
  ['chromium-c3:790', 'CHROMIUM_RESET_UNICODE_PASSWORD'],
  ['chromium-c3:870', 'CHROMIUM_RESET_HIBP_FAIL_CLOSED'],
  ['chromium-c3:894', 'CHROMIUM_LOGIN_INVITATION_POST_COMMIT'],
  ['chromium-c3:1008', 'CHROMIUM_RECOVERY_FRESH_ENROLLMENT'],
  ['chromium-c3:1041', 'CHROMIUM_RECOVERY_ROTATION_LOGOUT'],
  ['chromium-c3:1158', 'CHROMIUM_REFRESH_EXPIRY'],
  ['chromium-c3:1298', 'CHROMIUM_MULTITAB_REFRESH'],
  ['chromium-c3:1436', 'CHROMIUM_REFRESH_429_RECOVERY'],
  ['chromium-c3:1553', 'CHROMIUM_CROSS_TAB_CANCEL'],
  ['chromium-c3:1728', 'CHROMIUM_REFRESH_429_COOKIES'],
  ['chromium-c3:1792', 'CHROMIUM_UNCERTAIN_LOGOUT'],
  ['chromium-c3:1875', 'CHROMIUM_EXPIRED_PREAUTH'],
  ['chromium-c3:1921', 'CHROMIUM_LOGIN_RATE_LIMIT'],
  ['chromium-c3:1976', 'CHROMIUM_CROSS_SITE_LOGIN'],
  ['chromium-c3:2076', 'CHROMIUM_PUBLIC_AXE'],
  ['firefox-public-smoke:458', 'FIREFOX_PUBLIC_SHELL'],
  ['firefox-public-smoke:477', 'FIREFOX_MOBILE_BOUNDS'],
  ['firefox-public-smoke:496', 'FIREFOX_WEB_LOCKS_FAIL_CLOSED'],
  ['webkit-public-smoke:458', 'WEBKIT_PUBLIC_SHELL'],
  ['webkit-public-smoke:477', 'WEBKIT_MOBILE_BOUNDS'],
  ['webkit-public-smoke:496', 'WEBKIT_WEB_LOCKS_FAIL_CLOSED'],
]);

const engineByProject = new Map([
  ['chromium-c3', 'CHROMIUM'],
  ['firefox-public-smoke', 'FIREFOX'],
  ['webkit-public-smoke', 'WEBKIT'],
]);

const expectedScenarioOrder = [...scenarioByProjectAndLine.values()];

const statusByPlaywrightStatus = new Map([
  ['passed', 'PASSED'],
  ['failed', 'FAILED'],
  ['timedOut', 'TIMED_OUT'],
  ['timedout', 'TIMED_OUT'],
  ['skipped', 'SKIPPED'],
  ['interrupted', 'INTERRUPTED'],
]);

function newCounts() {
  return {
    began: 0,
    discovered: 0,
    failed: 0,
    interrupted: 0,
    notRun: 0,
    passed: 0,
    skipped: 0,
    timedOut: 0,
  };
}

function projectName(testCase) {
  return testCase.parent?.project?.()?.name;
}

export default class C3SafeReporter {
  constructor(options = {}) {
    const outputFile = options.outputFile;
    const privateDirectory = process.env.KORA_C3_PRIVATE_DIR;
    if (
      typeof outputFile !== 'string' ||
      !isAbsolute(outputFile) ||
      basename(outputFile) !== SUMMARY_BASENAME ||
      typeof privateDirectory !== 'string' ||
      !isAbsolute(privateDirectory) ||
      dirname(resolve(outputFile)) !== resolve(privateDirectory)
    ) {
      throw new Error('Invalid C3 safe reporter output path.');
    }

    this.outputFile = outputFile;
    this.counts = newCounts();
    this.current = { engine: 'NONE', scenario: 'NONE' };
    this.firstFailure = null;
    this.invalid = false;
    this.write('REPORTER_READY', 'NO_TEST_STARTED');
  }

  identify(testCase) {
    const project = projectName(testCase);
    const engine = engineByProject.get(project);
    const scenario = scenarioByProjectAndLine.get(`${project}:${testCase.location?.line}`);
    if (
      engine === undefined ||
      scenario === undefined ||
      basename(testCase.location?.file ?? '') !== 'admin-auth.c3.spec.ts'
    ) {
      this.invalid = true;
      this.current = { engine: 'NONE', scenario: 'NONE' };
      this.write('INVALID', 'INVALID');
      return null;
    }
    return { engine, scenario };
  }

  write(phase, status) {
    const identity = this.firstFailure ?? this.current;
    const record = {
      counts: { ...this.counts },
      engine: identity.engine,
      phase,
      scenario: identity.scenario,
      status,
      version: 1,
    };
    writeFileSync(this.outputFile, `${JSON.stringify(record)}\n`, {
      encoding: 'utf8',
      flag: 'w',
      mode: 0o600,
    });
    if (process.platform !== 'win32') chmodSync(this.outputFile, 0o600);
  }

  onBegin(_config, suite) {
    const tests = suite.allTests();
    this.counts.discovered = tests.length;
    if (tests.length === 0) {
      this.write('NO_TEST_STARTED', 'NO_TEST_STARTED');
      return;
    }
    const discoveredScenarios = [];
    for (const testCase of tests) {
      const identity = this.identify(testCase);
      if (identity === null) return;
      discoveredScenarios.push(identity.scenario);
    }
    if (
      discoveredScenarios.length !== expectedScenarioOrder.length ||
      discoveredScenarios.some((scenario, index) => scenario !== expectedScenarioOrder[index])
    ) {
      this.invalid = true;
      this.current = { engine: 'NONE', scenario: 'NONE' };
      this.write('INVALID', 'INVALID');
      return;
    }
    this.current = { engine: 'NONE', scenario: 'NONE' };
    this.write('DISCOVERED', 'NO_TEST_STARTED');
  }

  onTestBegin(testCase) {
    if (this.invalid) {
      this.write('INVALID', 'INVALID');
      return;
    }
    const identity = this.identify(testCase);
    if (identity === null) return;
    this.current = identity;
    this.counts.began += 1;
    this.write('TEST_STARTED', 'RUNNING');
  }

  onTestEnd(testCase, result) {
    if (this.invalid) {
      this.write('INVALID', 'INVALID');
      return;
    }
    const identity = this.identify(testCase);
    const status = statusByPlaywrightStatus.get(result.status);
    if (identity === null || status === undefined) {
      this.invalid = true;
      this.current = { engine: 'NONE', scenario: 'NONE' };
      this.write('INVALID', 'INVALID');
      return;
    }
    this.current = identity;
    const counter = {
      FAILED: 'failed',
      INTERRUPTED: 'interrupted',
      PASSED: 'passed',
      SKIPPED: 'skipped',
      TIMED_OUT: 'timedOut',
    }[status];
    this.counts[counter] += 1;
    if (this.firstFailure === null && ['FAILED', 'INTERRUPTED', 'TIMED_OUT'].includes(status)) {
      this.firstFailure = identity;
    }
    this.write('TEST_FINISHED', status);
  }

  onError() {
    if (this.invalid) {
      this.write('INVALID', 'INVALID');
      return;
    }
    if (this.firstFailure === null) {
      this.firstFailure = { engine: 'NONE', scenario: 'NONE' };
    }
    this.write('TEST_FINISHED', 'FAILED');
  }

  async onEnd(result) {
    const status = statusByPlaywrightStatus.get(result.status);
    if (this.invalid || status === undefined) {
      this.write('INVALID', 'INVALID');
      return;
    }
    const completed =
      this.counts.passed +
      this.counts.failed +
      this.counts.timedOut +
      this.counts.skipped +
      this.counts.interrupted;
    this.counts.notRun = Math.max(0, this.counts.discovered - completed);
    this.write('TERMINAL', status);
  }
}
