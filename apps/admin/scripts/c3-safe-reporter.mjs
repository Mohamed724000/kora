import { chmodSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';

const SUMMARY_BASENAME = 'c3-safe-browser-summary.json';

const scenarioByProjectAndLine = new Map([
  ['chromium-c3:512', 'CHROMIUM_RETRY_AFTER_BOUNDARIES'],
  ['chromium-c3:768', 'CHROMIUM_FIRST_LOGIN_TOTP_RECOVERY'],
  ['chromium-c3:780', 'CHROMIUM_ENROLLMENT_SESSION_LOGOUT'],
  ['chromium-c3:805', 'CHROMIUM_RESET_UNICODE_PASSWORD'],
  ['chromium-c3:1038', 'CHROMIUM_RESET_HIBP_FAIL_CLOSED'],
  ['chromium-c3:1062', 'CHROMIUM_LOGIN_INVITATION_POST_COMMIT'],
  ['chromium-c3:1176', 'CHROMIUM_RECOVERY_FRESH_ENROLLMENT'],
  ['chromium-c3:1209', 'CHROMIUM_RECOVERY_ROTATION_LOGOUT'],
  ['chromium-c3:1326', 'CHROMIUM_REFRESH_EXPIRY'],
  ['chromium-c3:1466', 'CHROMIUM_MULTITAB_REFRESH'],
  ['chromium-c3:1604', 'CHROMIUM_REFRESH_429_RECOVERY'],
  ['chromium-c3:1721', 'CHROMIUM_CROSS_TAB_CANCEL'],
  ['chromium-c3:1896', 'CHROMIUM_REFRESH_429_COOKIES'],
  ['chromium-c3:1960', 'CHROMIUM_UNCERTAIN_LOGOUT'],
  ['chromium-c3:2043', 'CHROMIUM_EXPIRED_PREAUTH'],
  ['chromium-c3:2089', 'CHROMIUM_LOGIN_RATE_LIMIT'],
  ['chromium-c3:2144', 'CHROMIUM_CROSS_SITE_LOGIN'],
  ['chromium-c3:2244', 'CHROMIUM_PUBLIC_AXE'],
  ['firefox-public-smoke:464', 'FIREFOX_PUBLIC_SHELL'],
  ['firefox-public-smoke:483', 'FIREFOX_MOBILE_BOUNDS'],
  ['firefox-public-smoke:502', 'FIREFOX_WEB_LOCKS_FAIL_CLOSED'],
  ['webkit-public-smoke:464', 'WEBKIT_PUBLIC_SHELL'],
  ['webkit-public-smoke:483', 'WEBKIT_MOBILE_BOUNDS'],
  ['webkit-public-smoke:502', 'WEBKIT_WEB_LOCKS_FAIL_CLOSED'],
]);

const engineByProject = new Map([
  ['chromium-c3', 'CHROMIUM'],
  ['firefox-public-smoke', 'FIREFOX'],
  ['webkit-public-smoke', 'WEBKIT'],
]);

const expectedScenarioOrder = [...scenarioByProjectAndLine.values()];
const RESET_SCENARIO = 'CHROMIUM_RESET_UNICODE_PASSWORD';
const resetSequence = [
  ['FIXTURE_PREPARATION', 'FIXTURES_PREPARED'],
  ['GENERIC_REQUEST_RESPONSE', 'GENERIC_REQUEST_RESPONSE_CONFIRMED'],
  ['DELIVERY_RECIPIENT', 'DELIVERY_RECIPIENT_CONFIRMED'],
  ['FORM_CONFIRMATION_FOCUS', 'FORM_CONFIRMATION_FOCUS_CONFIRMED'],
  ['COMPROMISED_REFUSAL', 'COMPROMISED_REFUSAL_RECEIVED'],
  ['COMPROMISED_DIAGNOSTICS', 'COMPROMISED_DIAGNOSTICS_CONFIRMED'],
  ['UNICODE_POLICY_PREPARATION', 'UNICODE_POLICY_READY'],
  ['UNICODE_SUBMISSION', 'UNICODE_SUBMITTED'],
  ['SUCCESS_CONFIRMATION', 'SUCCESS_CONFIRMED'],
];
const resetMismatchFields = [
  'RESPONSE_ERROR_CODE',
  'RESPONSE_STATUS',
  'RESPONSE_ORIGIN',
  'DIAGNOSTICS_HIBP_CHECKS',
  'DIAGNOSTICS_HIBP_COMPROMISED_RESULTS',
  'DIAGNOSTICS_LAST_CONSTRAINT',
  'DIAGNOSTICS_LAST_PRIMARY_CODE',
  'DIAGNOSTICS_LAST_RATE_LIMIT_FAILURE',
  'DIAGNOSTICS_LAST_RATE_LIMIT_STAGE',
  'DIAGNOSTICS_LAST_TRANSACTION_CODE',
  'DIAGNOSTICS_RATE_LIMIT_CALLS',
  'DIAGNOSTICS_RATE_LIMIT_FAILURES',
  'DIAGNOSTICS_TRANSACTION_CALLS',
  'DIAGNOSTICS_TRANSACTION_FAILURES',
];
const resetMismatchFieldIndex = new Map(resetMismatchFields.map((field, index) => [field, index]));
const resetDeliveryStates = [
  'ABSENT',
  'DIRECTORY_UNREADABLE',
  'FILE_DISAPPEARED',
  'FILE_UNREADABLE',
  'INVALID',
  'LATE',
  'MATCHED',
  'RECIPIENT_MISMATCH',
  'SENTINEL_REGISTRATION_FAILED',
  'UNKNOWN',
];

function neutralDiagnostic() {
  return {
    cleanup: 'NOT_APPLICABLE',
    delivery: 'NOT_APPLICABLE',
    firstFailedInvariant: 'NONE',
    lastConfirmedMilestone: 'NONE',
    mismatchFields: [],
    origin: 'UNKNOWN',
  };
}

function parseResetDiagnostic(annotations, scenario, status) {
  if (!Array.isArray(annotations)) return null;
  const resetAnnotations = [];
  for (const annotation of annotations) {
    if (annotation === null || typeof annotation !== 'object' || Array.isArray(annotation)) {
      return null;
    }
    const type = Reflect.get(annotation, 'type');
    if (typeof type !== 'string') return null;
    if (type.startsWith('c3-reset-')) resetAnnotations.push(annotation);
  }
  if (scenario !== RESET_SCENARIO)
    return resetAnnotations.length === 0 ? neutralDiagnostic() : null;
  if (status === 'skipped' && resetAnnotations.length === 0) return neutralDiagnostic();

  let active = false;
  let cleanupPassed = false;
  let cleanupStarted = false;
  let cursor = 0;
  let delivery = 'NOT_APPLICABLE';
  let deliveryObserved = false;
  let lastConfirmedMilestone = 'NONE';
  let lastMismatchIndex = -1;
  let origin = 'UNKNOWN';
  let originObserved = false;
  let pendingInvariant = null;
  const mismatchFields = [];

  for (const annotation of resetAnnotations) {
    if (annotation.description !== undefined) return null;
    const { type } = annotation;
    if (type === 'c3-reset-diagnostic-active') {
      if (active || cursor !== 0 || pendingInvariant !== null) return null;
      active = true;
      continue;
    }
    if (!active) return null;

    if (type.startsWith('c3-reset-pending-')) {
      const invariant = type.slice('c3-reset-pending-'.length);
      if (
        cleanupStarted ||
        pendingInvariant !== null ||
        cursor >= resetSequence.length ||
        invariant !== resetSequence[cursor][0]
      ) {
        return null;
      }
      pendingInvariant = invariant;
      continue;
    }
    if (type.startsWith('c3-reset-confirmed-')) {
      const milestone = type.slice('c3-reset-confirmed-'.length);
      if (
        cleanupStarted ||
        pendingInvariant !== resetSequence[cursor]?.[0] ||
        milestone !== resetSequence[cursor]?.[1]
      ) {
        return null;
      }
      lastConfirmedMilestone = milestone;
      pendingInvariant = null;
      cursor += 1;
      continue;
    }
    if (type.startsWith('c3-reset-origin-')) {
      const candidate = type.slice('c3-reset-origin-'.length);
      if (
        cleanupStarted ||
        pendingInvariant !== 'COMPROMISED_DIAGNOSTICS' ||
        originObserved ||
        !['API', 'BFF', 'UNKNOWN'].includes(candidate)
      ) {
        return null;
      }
      origin = candidate;
      originObserved = true;
      continue;
    }
    if (type.startsWith('c3-reset-delivery-')) {
      const candidate = type.slice('c3-reset-delivery-'.length);
      if (
        cleanupStarted ||
        pendingInvariant !== 'DELIVERY_RECIPIENT' ||
        deliveryObserved ||
        !resetDeliveryStates.includes(candidate)
      ) {
        return null;
      }
      delivery = candidate;
      deliveryObserved = true;
      continue;
    }
    if (type.startsWith('c3-reset-mismatch-')) {
      const field = type.slice('c3-reset-mismatch-'.length);
      const index = resetMismatchFieldIndex.get(field);
      if (
        cleanupStarted ||
        pendingInvariant !== 'COMPROMISED_DIAGNOSTICS' ||
        index === undefined ||
        index <= lastMismatchIndex
      ) {
        return null;
      }
      mismatchFields.push(field);
      lastMismatchIndex = index;
      continue;
    }
    if (type === 'c3-reset-cleanup-started') {
      if (cleanupStarted || cleanupPassed || pendingInvariant === null) return null;
      cleanupStarted = true;
      continue;
    }
    if (type === 'c3-reset-cleanup-passed') {
      if (!cleanupStarted || cleanupPassed) return null;
      cleanupPassed = true;
      continue;
    }
    return null;
  }

  if (!active) return null;
  if (status === 'passed') {
    if (
      cursor !== resetSequence.length ||
      pendingInvariant !== null ||
      !deliveryObserved ||
      delivery !== 'MATCHED' ||
      mismatchFields.length !== 0 ||
      cleanupStarted ||
      origin !== 'API'
    ) {
      return null;
    }
    return {
      cleanup: 'NOT_REQUIRED',
      delivery,
      firstFailedInvariant: 'NONE',
      lastConfirmedMilestone,
      mismatchFields,
      origin,
    };
  }

  const firstFailedInvariant = pendingInvariant ?? 'UNKNOWN';
  if (mismatchFields.length > 0 && firstFailedInvariant !== 'COMPROMISED_DIAGNOSTICS') {
    return null;
  }
  const deliveryFailed = firstFailedInvariant === 'DELIVERY_RECIPIENT';
  const deliveryConfirmed =
    cursor > resetSequence.findIndex(([name]) => name === 'DELIVERY_RECIPIENT');
  if (
    (deliveryFailed && (!deliveryObserved || ['MATCHED', 'NOT_APPLICABLE'].includes(delivery))) ||
    (deliveryConfirmed && delivery !== 'MATCHED') ||
    (!deliveryFailed && !deliveryConfirmed && delivery !== 'NOT_APPLICABLE')
  ) {
    return null;
  }
  return {
    cleanup: cleanupStarted ? (cleanupPassed ? 'PASSED' : 'FAILED') : 'NOT_RUN',
    delivery,
    firstFailedInvariant,
    lastConfirmedMilestone,
    mismatchFields,
    origin,
  };
}

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
    this.currentDiagnostic = neutralDiagnostic();
    this.firstFailure = null;
    this.firstFailureDiagnostic = null;
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
    const diagnostic =
      phase === 'INVALID' || status === 'INVALID'
        ? neutralDiagnostic()
        : (this.firstFailureDiagnostic ?? this.currentDiagnostic);
    const record = {
      counts: { ...this.counts },
      diagnostic: {
        ...diagnostic,
        mismatchFields: [...diagnostic.mismatchFields],
      },
      engine: identity.engine,
      phase,
      scenario: identity.scenario,
      status,
      version: 3,
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
    this.currentDiagnostic = neutralDiagnostic();
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
    this.currentDiagnostic = neutralDiagnostic();
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
    const diagnostic = parseResetDiagnostic(
      result.annotations ?? [],
      identity.scenario,
      result.status,
    );
    if (diagnostic === null) {
      this.invalid = true;
      this.current = { engine: 'NONE', scenario: 'NONE' };
      this.currentDiagnostic = neutralDiagnostic();
      this.write('INVALID', 'INVALID');
      return;
    }
    this.current = identity;
    this.currentDiagnostic = diagnostic;
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
      this.firstFailureDiagnostic = diagnostic;
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
      this.firstFailureDiagnostic = neutralDiagnostic();
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
