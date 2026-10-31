import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, Request, Response, Route } from '@playwright/test';

import { expect, test, totp, type C3PrivateChannel } from './admin-auth.fixtures';

const bootstrapEmail = process.env.KORA_C3_BOOTSTRAP_EMAIL ?? '';
const artifactRedactionProbeMode = process.env.KORA_C3_ARTIFACT_REDACTION_PROBE === '1';
const visualOutputDirectory = process.env.KORA_C3_VISUAL_OUTPUT_DIR ?? '';
const visualFixtureMode = process.env.KORA_C3_VISUAL_FIXTURE_MODE === '1';
let bootstrapPassword = process.env.KORA_C3_BOOTSTRAP_PASSWORD ?? '';
let bootstrapTotpSecret = '';
let recoveryCodes: string[] = [];
type TotpCounterScope = 'bootstrap-admin' | 'invitee-admin';
const lastAcceptedTotpCounter = new Map<TotpCounterScope, number>();
const registeredRequestPages = new WeakSet<Page>();

async function expectNoAxeViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      nodes: nodes.map(({ failureSummary, html, target }) => ({ failureSummary, html, target })),
    })),
  ).toEqual([]);
}

async function expectEffectiveNoIndex(page: Page): Promise<void> {
  const robotsPolicies = await page.locator('meta[name="robots"]').evaluateAll((elements) =>
    elements.map((element) =>
      (element.getAttribute('content') ?? '')
        .split(/[\s,]+/u)
        .filter(Boolean)
        .map((directive) => directive.toLowerCase()),
    ),
  );

  expect(robotsPolicies.length).toBeGreaterThan(0);
  expect(robotsPolicies.every((directives) => directives.includes('noindex'))).toBe(true);
  expect(robotsPolicies.flat()).not.toContain('index');
}

if (!visualFixtureMode && (bootstrapEmail.length === 0 || bootstrapPassword.length === 0)) {
  throw new Error('Missing bootstrap browser fixture.');
}
if (visualFixtureMode && visualOutputDirectory.length === 0) {
  throw new Error('Missing visual fixture output directory.');
}

function registerDynamicRequestSecrets(page: Page, privateChannel: C3PrivateChannel): void {
  if (registeredRequestPages.has(page)) return;
  registeredRequestPages.add(page);
  page.on('request', (request) => {
    const headers = request.headers();
    const values = [headers['idempotency-key'], headers['x-kora-csrf']];
    const authorization = headers.authorization;
    if (authorization?.startsWith('Bearer ') === true) values.push(authorization.slice(7));
    for (const cookie of (headers.cookie ?? '').split(';')) {
      const separator = cookie.indexOf('=');
      if (separator >= 0) values.push(decodeURIComponent(cookie.slice(separator + 1).trim()));
    }
    const sensitive = [
      ...new Set(
        values.filter((value): value is string => value !== undefined && value.length >= 6),
      ),
    ];
    if (sensitive.length > 0) privateChannel.registerSensitiveValues(sensitive);
  });
}

async function freshTotp(
  secret: string,
  counterScope: TotpCounterScope,
  privateChannel: C3PrivateChannel,
): Promise<string> {
  const previous = lastAcceptedTotpCounter.get(counterScope) ?? -1;
  let current = Math.floor(Date.now() / 30_000);
  if (current + 1 <= previous) {
    await new Promise((resolvePromise) =>
      setTimeout(resolvePromise, Math.max(1, previous * 30_000 - Date.now() + 50)),
    );
    current = Math.floor(Date.now() / 30_000);
  }
  const counter = current + 1;
  if (counter <= previous) throw new Error('Fresh TOTP counter did not advance.');
  lastAcceptedTotpCounter.set(counterScope, counter);
  const code = totp(secret, counter * 30_000);
  privateChannel.registerSensitiveValues([code]);
  return code;
}

const authCookieNames = new Set([
  '__Host-kora_admin_csrf',
  '__Host-kora_admin_preauth',
  '__Host-kora_admin_refresh',
]);

const refreshDiagnosticErrorCodes = new Set([
  'AUTH_REFRESH_INVALID',
  'FORBIDDEN',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
]);

type RefreshResponseDiagnostic = Readonly<{
  errorCode: 'OTHER' | string | null;
  retryAfter: string | null;
  source: 'API' | 'BFF' | 'OTHER' | null;
  status: number;
}>;

async function refreshResponseDiagnostic(response: Response): Promise<RefreshResponseDiagnostic> {
  const status = response.status();
  const retryAfterCandidate = response.headers()['retry-after'];
  const retryAfter =
    retryAfterCandidate !== undefined && /^\d{1,10}$/u.test(retryAfterCandidate)
      ? retryAfterCandidate
      : null;
  let errorCode: RefreshResponseDiagnostic['errorCode'] = null;
  let source: RefreshResponseDiagnostic['source'] = null;
  if (status !== 200) {
    try {
      const body = (await response.json()) as {
        error?: { code?: unknown };
        requestId?: unknown;
      };
      if (typeof body.error?.code === 'string') {
        errorCode = refreshDiagnosticErrorCodes.has(body.error.code) ? body.error.code : 'OTHER';
      }
      source =
        typeof body.requestId !== 'string'
          ? 'OTHER'
          : /^bff_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
                body.requestId,
              )
            ? 'BFF'
            : /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
                  body.requestId,
                )
              ? 'API'
              : 'OTHER';
    } catch {
      // The diagnostic is deliberately limited to status, closed code/provenance classes and Retry-After.
      source = 'OTHER';
    }
  }
  return { errorCode, retryAfter, source, status };
}

async function refreshPageDiagnostic(page: Page): Promise<
  Readonly<{
    gate: 'CHECKING' | 'DASHBOARD' | 'LOGIN' | 'OTHER' | 'SECURITY' | 'UNSUPPORTED';
    path: '/' | '/2fa/verify' | '/compte/securite' | '/login' | 'OTHER';
    reason:
      | 'OTHER'
      | 'refresh-result-unknown'
      | 'session-expired'
      | 'session-invalidated'
      | 'signed-out'
      | null;
  }>
> {
  const url = new URL(page.url());
  const paths = new Set(['/', '/2fa/verify', '/compte/securite', '/login']);
  const path = paths.has(url.pathname)
    ? (url.pathname as '/' | '/2fa/verify' | '/compte/securite' | '/login')
    : 'OTHER';
  const reasonCandidate = url.searchParams.get('reason');
  const reasons = new Set([
    'refresh-result-unknown',
    'session-expired',
    'session-invalidated',
    'signed-out',
  ]);
  const reason =
    reasonCandidate === null
      ? null
      : reasons.has(reasonCandidate)
        ? (reasonCandidate as
            'refresh-result-unknown' | 'session-expired' | 'session-invalidated' | 'signed-out')
        : 'OTHER';
  const visible = async (name: string | RegExp): Promise<boolean> =>
    page
      .getByRole('heading', { name })
      .first()
      .isVisible()
      .catch(() => false);
  const gate = (await visible('Sécurité du compte'))
    ? 'SECURITY'
    : (await visible(/Tableau de bord/iu))
      ? 'DASHBOARD'
      : (await visible('Vérification en cours'))
        ? 'CHECKING'
        : (await visible('Navigateur non pris en charge'))
          ? 'UNSUPPORTED'
          : (await page
                .getByRole('textbox', { name: 'Adresse e-mail' })
                .first()
                .isVisible()
                .catch(() => false))
            ? 'LOGIN'
            : 'OTHER';
  return { gate, path, reason };
}

async function registerAuthCookies(page: Page, privateChannel: C3PrivateChannel): Promise<void> {
  const values = (await page.context().cookies())
    .filter((cookie) => authCookieNames.has(cookie.name))
    .map((cookie) => cookie.value);
  if (values.length > 0) privateChannel.registerSensitiveValues(values);
}

async function expectAuthCookiePolicy(
  page: Page,
  expected: readonly (
    '__Host-kora_admin_csrf' | '__Host-kora_admin_preauth' | '__Host-kora_admin_refresh'
  )[],
): Promise<void> {
  const cookies = (await page.context().cookies())
    .filter((cookie) => authCookieNames.has(cookie.name))
    .sort((left, right) => left.name.localeCompare(right.name));
  expect(cookies.map((cookie) => cookie.name)).toEqual([...expected].sort());
  for (const cookie of cookies) {
    expect(cookie.domain).toBe('admin.c3.invalid');
    expect(cookie.path).toBe('/');
    expect(cookie.secure).toBe(true);
    expect(cookie.sameSite).toBe('Strict');
    expect(cookie.httpOnly).toBe(cookie.name !== '__Host-kora_admin_csrf');
  }
}

async function isolateRefreshRateLimitBoundary(privateChannel: C3PrivateChannel): Promise<void> {
  const isolation = await privateChannel.isolateRefreshRateLimitScenario();
  expect(isolation).toEqual({
    databaseKeyDelta: 1,
    deletedKeys: 1,
    localAof: 1,
    observedRefreshCalls: isolation.previousCount,
    previousCount: isolation.previousCount,
    remainingKeys: 0,
  });
}

async function isolatePasswordRateLimitBoundary(
  privateChannel: C3PrivateChannel,
  expected: Readonly<{
    ipCounts: readonly [5] | readonly [1, 4];
    observedPasswordCalls: 5;
    subjectCounts: readonly [1, 4] | readonly [5];
    targetKeys: 3;
  }>,
): Promise<void> {
  const isolation = await privateChannel.isolatePasswordRateLimitScenario();
  expect(isolation).toEqual({
    databaseKeyDelta: expected.targetKeys,
    deletedKeys: expected.targetKeys,
    ipCounts: expected.ipCounts,
    localAof: 1,
    observedPasswordCalls: expected.observedPasswordCalls,
    remainingKeys: 0,
    subjectCounts: expected.subjectCounts,
    targetKeys: expected.targetKeys,
  });
}

async function isolateTotpRateLimitBoundary(privateChannel: C3PrivateChannel): Promise<void> {
  const isolation = await privateChannel.isolateTotpRateLimitScenario();
  expect(isolation).toEqual({
    databaseKeyDelta: 1,
    deletedKeys: 1,
    ipCounts: [1, 5],
    localAof: 1,
    observedTotpCalls: 6,
    remainingKeys: 0,
    subjectCounts: [1, 1, 1, 1, 2],
    targetKeys: 7,
  });
}

async function login(page: Page, privateChannel: C3PrivateChannel, path = '/login'): Promise<void> {
  registerDynamicRequestSecrets(page, privateChannel);
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  const email = page.getByRole('textbox', { name: 'Adresse e-mail' });
  const password = page.getByLabel('Mot de passe');
  await expect(email).toBeVisible();
  await email.fill(bootstrapEmail);
  await password.fill(bootstrapPassword);
  const loginResponse = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith('/api/v1/admin/auth/login') &&
      candidate.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Continuer' }).click();
  const completedLoginResponse = await loginResponse;
  await page
    .evaluate(() => {
      for (const input of document.querySelectorAll<HTMLInputElement>(
        'input[type="email"], input[type="password"]',
      )) {
        input.value = '';
      }
    })
    .catch(() => undefined);
  expect(completedLoginResponse.status()).toBe(200);
  await expect(
    page.getByRole('heading', {
      name: /Configurer la double authentification|Double authentification/u,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => ['/2fa/setup', '/2fa/verify'].includes(location.pathname))).toBe(
    true,
  );
  await registerAuthCookies(page, privateChannel);
  await expectAuthCookiePolicy(page, ['__Host-kora_admin_csrf', '__Host-kora_admin_preauth']);
}

async function enroll(
  page: Page,
  privateChannel: C3PrivateChannel,
  counterScope: TotpCounterScope,
): Promise<Readonly<{ codes: readonly string[]; secret: string }>> {
  await expect(page).toHaveURL(/\/2fa\/setup/u);
  const browser = page.context().browser();
  if (browser === null) throw new Error('Browser fixture missing for isolated PREAUTH probes.');
  const origin = new URL(page.url()).origin;
  const preauthCookies = await page.context().cookies();
  for (const csrfHeader of [undefined, 'wrong-c3-csrf-value']) {
    const probeContext = await browser.newContext({ baseURL: origin, serviceWorkers: 'block' });
    try {
      await probeContext.addCookies(preauthCookies);
      const probePage = await probeContext.newPage();
      await probePage.route('**/__c3-isolated-probe', async (route) => {
        await route.fulfill({
          body: '<!doctype html><html lang="fr"><title>Sonde C3 isolée</title></html>',
          contentType: 'text/html; charset=utf-8',
          status: 200,
        });
      });
      await probePage.goto('/__c3-isolated-probe');
      const idempotencyKey = randomUUID();
      privateChannel.registerSensitiveValues([idempotencyKey]);
      const rejected = await probePage.evaluate(
        async ({ csrf, key }) => {
          const headers: Record<string, string> = { 'Idempotency-Key': key };
          if (csrf !== null) headers['X-Kora-CSRF'] = csrf;
          const response = await fetch('/api/v1/admin/auth/totp/enrollments', {
            credentials: 'same-origin',
            headers,
            method: 'POST',
          });
          const body = (await response.json()) as { error?: { code?: string } };
          return { code: body.error?.code, status: response.status };
        },
        { csrf: csrfHeader ?? null, key: idempotencyKey },
      );
      expect(rejected).toEqual({ code: 'AUTH_REQUIRED', status: 401 });
    } finally {
      await probeContext.close();
    }
  }
  const enrollmentResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/admin/auth/totp/enrollments') &&
      response.request().method() === 'POST',
  );
  const qrResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/admin\/auth\/totp\/enrollments\/[^/]+\/qr$/u.test(response.url()) &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Créer mon enrôlement TOTP' }).click();
  const enrollment = (await (await enrollmentResponse).json()) as {
    data?: { enrollmentId?: string };
  };
  const enrollmentId = enrollment.data?.enrollmentId;
  if (typeof enrollmentId !== 'string') throw new Error('Enrollment fixture identifier missing.');
  expect((await qrResponse).status()).toBe(200);
  await page.getByRole('button', { name: 'Je ne peux pas scanner le QR' }).click();
  const manual = await page
    .getByRole('region', { name: 'Configuration TOTP manuelle' })
    .innerText();
  const match = /Clé Base32\s*:\s*([A-Z2-7]{52})/u.exec(manual);
  if (match?.[1] === undefined) throw new Error('Manual TOTP secret was not rendered.');
  const secret = match[1];
  privateChannel.registerSensitiveValues([secret]);
  const duplicateQr = await page.evaluate(async (targetEnrollmentId) => {
    const csrf = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('__Host-kora_admin_csrf='))
      ?.slice('__Host-kora_admin_csrf='.length);
    if (csrf === undefined) throw new Error('CSRF cookie missing.');
    const response = await fetch(`/api/v1/admin/auth/totp/enrollments/${targetEnrollmentId}/qr`, {
      credentials: 'same-origin',
      headers: {
        'Idempotency-Key': crypto.randomUUID(),
        'X-Kora-CSRF': decodeURIComponent(csrf),
      },
      method: 'POST',
    });
    const body = (await response.json()) as { error?: { code?: string } };
    return { code: body.error?.code, status: response.status };
  }, enrollmentId);
  expect(duplicateQr).toEqual({ code: 'SENSITIVE_RESPONSE_ALREADY_DELIVERED', status: 409 });
  await page
    .getByRole('textbox', { name: 'Code à six chiffres' })
    .fill(await freshTotp(secret, counterScope, privateChannel));
  const recoveryDocuments: string[] = [];
  const trackRecoveryDocument = (request: Request) => {
    const url = new URL(request.url());
    if (url.pathname === '/2fa/recovery-codes' && request.resourceType() === 'document') {
      recoveryDocuments.push(url.pathname);
    }
  };
  page.on('request', trackRecoveryDocument);
  const navigationMarker = 'c3-in-memory-navigation-marker';
  await page.evaluate((marker) => {
    Object.defineProperty(window, '__koraC3NavigationMarker', {
      configurable: true,
      value: marker,
    });
  }, navigationMarker);
  const recoveryFlightResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/2fa/recovery-codes' && response.request().headers()['rsc'] === '1';
  });
  await page.getByRole('button', { name: 'Confirmer et créer mes codes' }).click();
  await expect(page).toHaveURL(/\/2fa\/recovery-codes$/u);
  const flightResponse = await recoveryFlightResponse;
  page.off('request', trackRecoveryDocument);
  expect(flightResponse.headers()['content-type']).toContain('text/x-component');
  expect(recoveryDocuments).toEqual([]);
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __koraC3NavigationMarker?: string;
          }
        ).__koraC3NavigationMarker,
    ),
  ).toBe(navigationMarker);
  const recoveryCodeElements = page.locator('.recovery-code-list code');
  await expect(recoveryCodeElements).toHaveCount(10);
  const codes = await recoveryCodeElements.allTextContents();
  privateChannel.registerSensitiveValues(codes);
  await registerAuthCookies(page, privateChannel);
  await expectAuthCookiePolicy(page, ['__Host-kora_admin_csrf', '__Host-kora_admin_refresh']);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page).toHaveURL(/\/$/u);
  return { codes, secret };
}

test('@public-smoke public auth shell renders without protected navigation', async ({ page }) => {
  const response = await page.goto('/login');
  expect(response?.status()).toBe(200);
  const policy = response?.headers()['content-security-policy'] ?? '';
  const nonce = /script-src 'nonce-([A-Za-z0-9_-]{22})'/u.exec(policy)?.[1];
  expect(nonce).toBeDefined();
  const scriptNonces = await page
    .locator('script')
    .evaluateAll((scripts) => scripts.map((script) => script.nonce));
  expect(scriptNonces.length).toBeGreaterThan(0);
  expect(scriptNonces.every((value) => value === nonce)).toBe(true);
  await expect(page.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Aller au contenu principal' })).toHaveAttribute(
    'href',
    '#contenu-principal',
  );
});

test('@public-smoke public pages remain bounded at 375 CSS pixels', async ({ page }) => {
  await page.setViewportSize({ height: 812, width: 375 });
  const pages = [
    { heading: 'Connexion', path: '/login', status: 200 },
    { heading: 'Récupération du mot de passe', path: '/recuperation', status: 200 },
    { heading: 'Accepter une invitation', path: '/invitation/accepter', status: 200 },
    { heading: 'Page introuvable', path: '/route-inexistante', status: 404 },
  ] as const;
  for (const candidate of pages) {
    const response = await page.goto(candidate.path);
    expect(response?.status()).toBe(candidate.status);
    await expect(page.getByRole('heading', { level: 1, name: candidate.heading })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  }
});

test('@public-smoke missing Web Locks fails closed before session recovery', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  });
  const response = await page.goto('/login');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Navigateur non pris en charge' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Adresse e-mail' })).toHaveCount(0);
});

test('Retry-After announces boundaries, blocks early retry and reactivates once', async ({
  page,
}) => {
  let loginRequests = 0;
  await page.route('**/api/v1/admin/auth/login', async (route) => {
    loginRequests += 1;
    if (loginRequests === 1) {
      await route.fulfill({
        body: JSON.stringify({
          error: {
            code: 'RATE_LIMITED',
            details: { reason: 'RATE_LIMITED', retryAfterSeconds: 2 },
            message: 'Rate limited.',
            retryable: false,
          },
          requestId: 'c3_login_rate_limit_0001',
        }),
        contentType: 'application/json; charset=utf-8',
        headers: { 'Cache-Control': 'no-store', 'Retry-After': '2' },
        status: 429,
      });
      return;
    }
    await route.fulfill({
      body: JSON.stringify({
        error: {
          code: 'AUTH_INVALID_CREDENTIALS',
          details: {},
          message: 'Invalid credentials.',
          retryable: false,
        },
        requestId: 'c3_login_reactivated_0001',
      }),
      contentType: 'application/json; charset=utf-8',
      headers: { 'Cache-Control': 'no-store' },
      status: 401,
    });
  });
  await page.goto('/login');
  await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill('fixture@example.invalid');
  await page.getByLabel('Mot de passe').fill('Fixture🙂2026A');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByRole('button', { name: 'Veuillez patienter' })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText(
    'Nouvelle tentative possible dans 2 secondes.',
  );
  await page.getByRole('button', { name: 'Veuillez patienter' }).click({ force: true });
  await page.waitForTimeout(250);
  expect(loginRequests).toBe(1);
  await expect(page.getByRole('button', { name: 'Continuer' })).toBeEnabled({ timeout: 5_000 });
  await expect(page.getByRole('status')).toContainText(
    'Vous pouvez effectuer une nouvelle tentative.',
  );
  expect(loginRequests).toBe(1);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.getByText('Identifiants invalides.')).toBeVisible();
  expect(loginRequests).toBe(2);
});

test('@visual-fixture public synthetic states at qualified viewports', async ({ page }) => {
  const fixtures = [
    { filename: '375-login.png', height: 812, path: '/login', width: 375 },
    { filename: '768-recovery.png', height: 1024, path: '/recuperation', width: 768 },
    {
      filename: '1440-invitation-invalid.png',
      height: 900,
      path: '/invitation/accepter',
      width: 1440,
    },
  ] as const;
  for (const fixture of fixtures) {
    await page.setViewportSize({ height: fixture.height, width: fixture.width });
    const response = await page.goto(fixture.path);
    expect(response?.status()).toBe(200);
    if (fixture.path === '/login') {
      await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill('synthetic@example.invalid');
      await page.getByLabel('Mot de passe', { exact: true }).fill('Fixture🙂2026A');
    } else if (fixture.path === '/recuperation') {
      await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill('synthetic@example.invalid');
    } else {
      await page.getByLabel('Code d’invitation').fill('INVALID-C3-FIXTURE');
      await page.getByLabel('Mot de passe', { exact: true }).fill('Fixture🙂2026A');
      await page.getByLabel('Confirmer le mot de passe').fill('Fixture🙂2026B');
      await page.getByRole('button', { name: 'Accepter et configurer le TOTP' }).click();
      await expect(
        page.getByText('La confirmation ne correspond pas au mot de passe.'),
      ).toBeVisible();
      await expect(page.getByLabel('Confirmer le mot de passe')).toBeFocused();
      await expect(page.getByLabel('Confirmer le mot de passe')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await expect(page.getByLabel('Mot de passe', { exact: true })).not.toHaveAttribute(
        'aria-invalid',
      );
    }
    const target = join(visualOutputDirectory, fixture.filename);
    expect(existsSync(target)).toBe(false);
    await page.screenshot({ animations: 'disabled', fullPage: true, path: target });
  }

  for (const fixture of [
    { filename: '375-not-found.png', height: 812, path: '/route-inexistante', width: 375 },
    {
      filename: '768-session-expired.png',
      height: 1024,
      path: '/login?reason=session-expired',
      width: 768,
    },
  ] as const) {
    await page.setViewportSize({ height: fixture.height, width: fixture.width });
    await page.goto(fixture.path);
    const target = join(visualOutputDirectory, fixture.filename);
    expect(existsSync(target)).toBe(false);
    await page.screenshot({ animations: 'disabled', fullPage: true, path: target });
  }

  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto('/login');
  await expect(page.getByRole('textbox', { name: 'Adresse e-mail' })).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox', { name: 'Adresse e-mail' })).toBeFocused();
  const focusTarget = join(visualOutputDirectory, '1440-focus-visible.png');
  expect(existsSync(focusTarget)).toBe(false);
  await page.screenshot({ animations: 'disabled', fullPage: true, path: focusTarget });

  for (const fixture of [
    {
      filename: '375-loading-synthetic.png',
      height: 812,
      markup:
        '<section aria-live="polite" class="admin-status-card" role="status"><p class="admin-eyebrow">Administration KORA+</p><h1>Chargement sécurisé</h1><p>L’interface d’authentification est en cours de préparation.</p></section>',
      width: 375,
    },
    {
      filename: '768-unavailable-synthetic.png',
      height: 1024,
      markup:
        '<section aria-live="assertive" class="admin-status-card" role="alert"><p class="admin-eyebrow">Administration KORA+</p><h1>Un problème est survenu</h1><p>L’interface n’a pas pu être affichée. Aucune opération n’est relancée automatiquement.</p><button class="auth-submit" type="button">Réessayer l’affichage</button></section>',
      width: 768,
    },
  ] as const) {
    await page.setViewportSize({ height: fixture.height, width: fixture.width });
    await page.goto('/login');
    await page.locator('body').evaluate((body, markup) => {
      body.innerHTML = `<a class="admin-skip-link" href="#contenu-principal">Aller au contenu principal</a><main class="admin-session-gate" id="contenu-principal" tabindex="-1">${markup}</main>`;
    }, fixture.markup);
    await expectNoAxeViolations(page);
    const target = join(visualOutputDirectory, fixture.filename);
    expect(existsSync(target)).toBe(false);
    await page.screenshot({ animations: 'disabled', fullPage: true, path: target });
  }

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/login');
  const standardDurations = await page.evaluate(() =>
    ['.admin-skip-link', '.login-box'].map((selector) => {
      const target = document.querySelector(selector);
      if (target === null) throw new Error(`Motion target missing: ${selector}`);
      const value = getComputedStyle(target).transitionDuration.trim();
      return value.endsWith('ms') ? Number.parseFloat(value) : Number.parseFloat(value) * 1_000;
    }),
  );
  expect(standardDurations.every((duration) => duration === 150)).toBe(true);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ height: 812, width: 375 });
  await page.goto('/login');
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  );
  const reducedDurations = await page.evaluate(() =>
    ['.admin-skip-link', '.login-box'].map((selector) => {
      const target = document.querySelector(selector);
      if (target === null) throw new Error(`Reduced-motion target missing: ${selector}`);
      return getComputedStyle(target).transitionDuration;
    }),
  );
  expect(
    reducedDurations.every((value) =>
      value.split(',').every((duration) => {
        const trimmed = duration.trim();
        const seconds = trimmed.endsWith('ms')
          ? Number.parseFloat(trimmed) / 1_000
          : Number.parseFloat(trimmed);
        return seconds <= 0.000_01;
      }),
    ),
  ).toBe(true);
  const reducedMotionTarget = join(visualOutputDirectory, '375-reduced-motion.png');
  expect(existsSync(reducedMotionTarget)).toBe(false);
  await page.screenshot({
    animations: 'disabled',
    fullPage: true,
    path: reducedMotionTarget,
  });
});

test('@artifact-redaction-probe sanitizes the final Playwright error artifact', async ({
  page,
  privateChannel,
}) => {
  if (!artifactRedactionProbeMode) throw new Error('Artifact redaction probe mode is required.');
  const sentinel = process.env.KORA_C3_ARTIFACT_REDACTION_PROBE_SENTINEL ?? '';
  if (!/^[A-Za-z0-9_-]{43}$/u.test(sentinel)) {
    throw new Error('Invalid artifact redaction probe sentinel.');
  }
  privateChannel.registerSensitiveValues([sentinel]);
  const syntheticError = new Error(`Synthetic C3 error containing ${sentinel}`);
  Reflect.set(syntheticError, 'errorContext', `Synthetic C3 snapshot containing ${sentinel}`);
  privateChannel.finalizeTestErrors([syntheticError]);
  expect(syntheticError.message).toBe('Synthetic C3 error containing [REDACTED_C3_SENTINEL]');
  expect(syntheticError.stack).toBe('');
  expect(Reflect.get(syntheticError, 'errorContext')).toBe('[C3_ERROR_CONTEXT_REDACTED]');
  await page.setContent(
    `<main><label for="c3-redaction-probe">Probe secret</label><input id="c3-redaction-probe" value="${sentinel}"></main>`,
  );
  expect(
    await page
      .getByLabel('Probe secret')
      .evaluate(
        (element, expected) => element instanceof HTMLInputElement && element.value === expected,
        sentinel,
      ),
  ).toBe(true);
  const terminalError = new Error('EXPECTED_REDACTED_PROBE_VALUE');
  privateChannel.finalizeTestErrors([terminalError]);
  throw terminalError;
});

test.describe.serial('C3 browser contract', () => {
  test.afterEach(async ({ chainPage: page, privateChannel }, testInfo) => {
    if (testInfo.status === testInfo.expectedStatus) return;
    privateChannel.redactTestErrors(testInfo.errors);
    const neutralizations = await Promise.allSettled(
      page
        .context()
        .pages()
        .filter((candidate) => !candidate.isClosed())
        .map((candidate) => candidate.goto('about:blank', { timeout: 5_000, waitUntil: 'commit' })),
    );
    const rejected = neutralizations.filter((result) => result.status === 'rejected').length;
    if (rejected > 0) throw new Error(`Unable to neutralize ${rejected} browser page(s).`);
  });

  test('first login enrolls TOTP and displays recovery codes once', async ({
    chainPage: page,
    privateChannel,
  }) => {
    await login(page, privateChannel);
    const enrollment = await enroll(page, privateChannel, 'bootstrap-admin');
    bootstrapTotpSecret = enrollment.secret;
    recoveryCodes = [...enrollment.codes];
    await page.reload();
    await expect(page.locator('.recovery-code-list')).toHaveCount(0);
  });

  test('the first enrollment holds an in-memory session and logout succeeds', async ({
    chainPage: page,
  }) => {
    await expect(page.getByRole('heading', { name: /Tableau de bord/iu })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Search/ })).toBeHidden();
    await expect(page.locator('.app-header .user-menu')).toBeHidden();
    await expectNoAxeViolations(page);
    const storage = await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    }));
    expect(storage).toEqual({ local: [], session: [] });
    await page.goto('/compte/securite');
    await expect(page.getByRole('heading', { name: 'Sécurité du compte' })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.goto('/acces-refuse');
    await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Choisissez votre contexte' })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Me déconnecter' }).click();
    await expect(page).toHaveURL(/\/login\?reason=signed-out$/u);
  });

  test('reset stays generic and accepts an exact Unicode password', async ({
    chainPage: page,
    privateChannel,
  }) => {
    const previous = privateChannel.deliveryIds();
    await page.goto('/recuperation');
    await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(bootstrapEmail);
    await page.getByRole('button', { name: 'Demander un code' }).click();
    await expect(page.getByText('Si la demande est recevable, elle a été acceptée.')).toBeVisible();
    const delivery = await privateChannel.waitForDelivery('PASSWORD_RESET', previous);
    expect(delivery.email === bootstrapEmail).toBe(true);
    const compromisedPassword = 'Compromise🙂12';
    privateChannel.registerSensitiveValues([compromisedPassword]);
    await privateChannel.configureHibp(true, [compromisedPassword]);
    await page.getByRole('link', { name: 'J’ai reçu un code' }).click();
    await page.getByLabel('Code de réinitialisation').fill(delivery.code);
    const mismatchPassword = 'Mismatch🙂2026A';
    const mismatchConfirmation = 'Mismatch🙂2026B';
    privateChannel.registerSensitiveValues([mismatchPassword, mismatchConfirmation]);
    await page.getByLabel('Nouveau mot de passe').fill(mismatchPassword);
    await page.getByLabel('Confirmer le mot de passe').fill(mismatchConfirmation);
    await page.getByRole('button', { name: 'Remplacer le mot de passe' }).click();
    await expect(page.getByLabel('Confirmer le mot de passe')).toBeFocused();
    await expect(page.getByLabel('Confirmer le mot de passe')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.getByLabel('Nouveau mot de passe')).not.toHaveAttribute('aria-invalid');
    await page.getByLabel('Nouveau mot de passe').fill(compromisedPassword);
    await page.getByLabel('Confirmer le mot de passe').fill(compromisedPassword);
    await privateChannel.resetPasswordDiagnostics();
    const compromisedResponse = page.waitForResponse(
      (candidate) =>
        candidate.url().endsWith('/api/v1/admin/auth/password/reset') &&
        candidate.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Remplacer le mot de passe' }).click();
    const completedCompromisedResponse = await compromisedResponse;
    const compromisedBody = (await completedCompromisedResponse.json()) as {
      error?: { code?: unknown };
      requestId?: unknown;
    };
    const passwordDiagnostics = await privateChannel.passwordDiagnostics();
    expect({
      code: compromisedBody.error?.code,
      diagnostics: passwordDiagnostics,
      origin:
        typeof compromisedBody.requestId === 'string' &&
        compromisedBody.requestId.startsWith('bff_')
          ? 'BFF'
          : 'API',
      status: completedCompromisedResponse.status(),
    }).toEqual({
      code: 'VALIDATION_ERROR',
      diagnostics: {
        hibpChecks: 1,
        hibpCompromisedResults: 1,
        lastConstraint: null,
        lastPrimaryCode: null,
        lastRateLimitFailure: 'NONE',
        lastRateLimitStage: 'WAITAOF_LOCAL_DURABLE',
        lastTransactionCode: null,
        rateLimitCalls: 1,
        rateLimitFailures: 0,
        transactionCalls: 2,
        transactionFailures: 0,
      },
      origin: 'API',
      status: 400,
    });
    await expect(page.getByText('Vérifiez les informations saisies.')).toBeVisible();
    await privateChannel.configureHibp(true, []);
    bootstrapPassword = '🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂🙂';
    privateChannel.registerSensitiveValues([bootstrapPassword]);
    await page.getByLabel('Nouveau mot de passe').fill(bootstrapPassword);
    await page.getByLabel('Confirmer le mot de passe').fill(bootstrapPassword);
    await page.getByRole('button', { name: 'Remplacer le mot de passe' }).click();
    await expect(page.getByText('Le mot de passe a été remplacé.')).toBeVisible();
  });

  test('unavailable password-compromise capability fails reset closed', async ({
    chainPage: page,
    privateChannel,
  }) => {
    const previous = privateChannel.deliveryIds();
    await page.goto('/recuperation');
    await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(bootstrapEmail);
    await page.getByRole('button', { name: 'Demander un code' }).click();
    const delivery = await privateChannel.waitForDelivery('PASSWORD_RESET', previous);
    await privateChannel.configureHibp(false, []);
    await page.getByRole('link', { name: 'J’ai reçu un code' }).click();
    await page.getByLabel('Code de réinitialisation').fill(delivery.code);
    const unavailablePassword = 'FailClosed🙂2026';
    privateChannel.registerSensitiveValues([unavailablePassword]);
    await page.getByLabel('Nouveau mot de passe').fill(unavailablePassword);
    await page.getByLabel('Confirmer le mot de passe').fill(unavailablePassword);
    await page.getByRole('button', { name: 'Remplacer le mot de passe' }).click();
    await expect(
      page.getByText('Le résultat de cette action est inconnu. Ne la répétez pas automatiquement.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remplacer le mot de passe' })).toBeDisabled();
    await privateChannel.configureHibp(true, []);
  });

  test('Unicode password logs in exactly and invitation survives a post-commit response failure without replay', async ({
    chainPage: page,
    privateChannel,
  }) => {
    await login(page, privateChannel);
    await expect(page).toHaveURL(/\/2fa\/verify/u);
    await expect(page.getByRole('heading', { name: 'Double authentification' })).toBeVisible();
    await expectNoAxeViolations(page);
    const verifyResponse = page.waitForResponse(
      (response) => response.url().endsWith('/totp/verify') && response.status() === 200,
    );
    await page
      .getByRole('textbox', { name: 'Code à six chiffres' })
      .fill(await freshTotp(bootstrapTotpSecret, 'bootstrap-admin', privateChannel));
    await page.getByRole('button', { name: 'Ouvrir ma session' }).click();
    const envelope = (await (await verifyResponse).json()) as {
      data?: { accessToken?: string };
    };
    const accessToken = envelope.data?.accessToken;
    if (typeof accessToken !== 'string')
      throw new Error('Access token missing from login response.');
    privateChannel.registerSensitiveValues([accessToken]);
    const previous = privateChannel.deliveryIds();
    const invitee = `c3-${Date.now()}@example.test`;
    const invitationIdempotencyKey = `c3-invitation-${randomUUID()}`;
    privateChannel.registerSensitiveValues([invitee, invitationIdempotencyKey]);
    await privateChannel.createInvitation({
      accessToken,
      email: invitee,
      idempotencyKey: invitationIdempotencyKey,
      totpCode: await freshTotp(bootstrapTotpSecret, 'bootstrap-admin', privateChannel),
    });
    const invitation = await privateChannel.waitForDelivery('INVITATION', previous);
    expect(invitation.email === invitee).toBe(true);
    const deliveriesAfterInvitation = privateChannel.deliveryIds();
    const inviteePassword = '界🙂界🙂界🙂界🙂界🙂界🙂';
    privateChannel.registerSensitiveValues([inviteePassword]);
    await page.context().clearCookies();
    await page.goto('/invitation/accepter');
    await page.getByLabel('Code d’invitation').fill(invitation.code);
    await page.getByLabel('Mot de passe', { exact: true }).fill(inviteePassword);
    await page.getByLabel('Confirmer le mot de passe').fill(inviteePassword);
    const recoveryRateLimitIsolation = await privateChannel.isolateRecoveryRateLimitScenario();
    const invitationFaultBefore = await privateChannel.invitationFaultState();
    await privateChannel.loseNextInvitationResponseAfterCommit();
    await privateChannel.resetPasswordDiagnostics();
    const acceptanceResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/admin/auth/invitations/accept') &&
        response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Accepter et configurer le TOTP' }).click();
    const invitationAcceptanceStatus = (await acceptanceResponse).status();
    const invitationFaultAfter = await privateChannel.invitationFaultState();
    const invitationDiagnostics = await privateChannel.passwordDiagnostics();
    expect({
      diagnostics: invitationDiagnostics,
      fault: invitationFaultAfter,
      recoveryRateLimitIsolation,
      responseStatus: invitationAcceptanceStatus,
    }).toEqual({
      diagnostics: {
        hibpChecks: 1,
        hibpCompromisedResults: 0,
        lastConstraint: null,
        lastPrimaryCode: null,
        lastRateLimitFailure: 'NONE',
        lastRateLimitStage: 'WAITAOF_LOCAL_DURABLE',
        lastTransactionCode: null,
        rateLimitCalls: 1,
        rateLimitFailures: 0,
        transactionCalls: 2,
        transactionFailures: 0,
      },
      fault: {
        calls: invitationFaultBefore.calls + 1,
        committedResponseLosses: invitationFaultBefore.committedResponseLosses + 1,
        pending: false,
      },
      recoveryRateLimitIsolation: {
        databaseKeyDelta: 1,
        deletedKeys: 1,
        localAof: 1,
        observedRecoveryCalls: 5,
        previousCount: 5,
        remainingKeys: 0,
      },
      responseStatus: 503,
    });
    await expect(
      page.getByText('Le résultat de cette action est inconnu. Ne la répétez pas automatiquement.'),
    ).toBeVisible();
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill(invitee);
    await page.getByLabel('Mot de passe').fill(inviteePassword);
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(page).toHaveURL(/\/2fa\/setup/u);
    await expect(
      page.getByRole('heading', { name: 'Configurer la double authentification' }),
    ).toBeVisible();
    expect(await privateChannel.invitationFaultState()).toEqual(invitationFaultAfter);
    await expectNoAxeViolations(page);
    expect(
      JSON.stringify([...privateChannel.deliveryIds()].sort()) ===
        JSON.stringify([...deliveriesAfterInvitation].sort()),
    ).toBe(true);
    const inviteeEnrollment = await enroll(page, privateChannel, 'invitee-admin');
    expect(inviteeEnrollment.codes.length).toBe(10);
    await page.goto('/compte/securite');
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/\/login\?reason=signed-out$/u);
  });

  test('recovery code creates no session before a fresh enrollment', async ({
    chainPage: page,
    privateChannel,
  }) => {
    await login(page, privateChannel, '/login?returnTo=https%3A%2F%2Fevil.example%2Fstolen');
    await page.getByRole('link', { name: 'Utiliser un code de récupération' }).click();
    const [selector, verifier] = recoveryCodes[0]?.split('-') ?? [];
    if (selector === undefined || verifier === undefined)
      throw new Error('Recovery fixture missing.');
    privateChannel.registerSensitiveValues([selector, verifier]);
    await page.getByLabel('Sélecteur').fill(selector);
    await page.getByLabel('Vérificateur').fill('ABC');
    await page.getByRole('button', { name: /Continuer vers/iu }).click();
    await expect(page.getByLabel('Vérificateur')).toBeFocused();
    await expect(page.getByLabel('Vérificateur')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Sélecteur')).not.toHaveAttribute('aria-invalid');
    await page.getByLabel('Vérificateur').fill(verifier);
    await page.getByRole('button', { name: /Continuer vers/iu }).click();
    await expect(page).toHaveURL(/\/2fa\/setup$/u);
    const protectedStatus = await page.evaluate(async () =>
      fetch('/api/v1/admin/auth/sessions', {
        cache: 'no-store',
        credentials: 'same-origin',
        redirect: 'error',
      }).then((response) => response.status),
    );
    expect(protectedStatus).toBe(401);
    const replacement = await enroll(page, privateChannel, 'bootstrap-admin');
    bootstrapTotpSecret = replacement.secret;
    recoveryCodes = [...replacement.codes];
    await expect(page).toHaveURL(/https:\/\/admin\.c3\.invalid:\d+\/$/u);
  });

  test('recovery-code rotation invalidates old codes and logout closes the session', async ({
    chainPage: page,
    privateChannel,
  }) => {
    const oldCode = recoveryCodes.at(-1);
    if (oldCode === undefined) throw new Error('Recovery fixture missing.');
    await page.goto('/compte/securite');
    await expect(page.getByRole('heading', { name: 'Sécurité du compte' })).toBeVisible();
    await expect(page.locator('.admin-session-list')).toContainText('Session actuelle');
    await page
      .getByRole('textbox', { name: 'Code à six chiffres' })
      .fill(await freshTotp(bootstrapTotpSecret, 'bootstrap-admin', privateChannel));
    await page.getByRole('button', { name: 'Créer dix nouveaux codes' }).click();
    await expect(page).toHaveURL(/\/2fa\/recovery-codes$/u);
    const replacementCodeElements = page.locator('.recovery-code-list code');
    await expect(replacementCodeElements).toHaveCount(10);
    const replacementCodes = await replacementCodeElements.allTextContents();
    privateChannel.registerSensitiveValues(replacementCodes);
    expect(replacementCodes.includes(oldCode)).toBe(false);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.goto('/compte/securite');
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/\/login\?reason=signed-out$/u);

    await login(page, privateChannel);
    await page.getByRole('link', { name: 'Utiliser un code de récupération' }).click();
    const [selector, verifier] = oldCode.split('-');
    if (selector === undefined || verifier === undefined) {
      throw new Error('Recovery fixture format is invalid.');
    }
    privateChannel.registerSensitiveValues([selector, verifier]);
    await page.getByLabel('Sélecteur').fill(selector);
    await page.getByLabel('Vérificateur').fill(verifier);
    let verifyCount = 0;
    const observeVerifyRequest = (request: Request): void => {
      if (
        request.url().endsWith('/api/v1/admin/auth/recovery-codes/verify') &&
        request.method() === 'POST'
      ) {
        verifyCount += 1;
      }
    };
    page.on('request', observeVerifyRequest);
    try {
      const verifyResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/admin/auth/recovery-codes/verify') &&
          response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: /Continuer vers/iu }).click();
      const completedVerify = await verifyResponse;
      const allowedStatuses = new Set([200, 400, 401, 403, 429, 503]);
      const allowedCodes = new Set([
        'ADMIN_RECOVERY_CODE_INVALID',
        'AUTH_REQUIRED',
        'FORBIDDEN',
        'RATE_LIMITED',
        'SERVICE_UNAVAILABLE',
        'VALIDATION_ERROR',
      ]);
      let code: 'MALFORMED' | 'UNCLASSIFIED' | string | null =
        completedVerify.status() === 200 ? null : 'MALFORMED';
      if (completedVerify.status() !== 200) {
        try {
          const body = (await completedVerify.json()) as { error?: { code?: unknown } };
          code =
            typeof body.error?.code === 'string' && allowedCodes.has(body.error.code)
              ? body.error.code
              : 'UNCLASSIFIED';
        } catch {
          code = 'MALFORMED';
        }
      }
      const invalidMessageVisible = await page
        .getByText('Ce code de récupération ne peut pas être utilisé.')
        .waitFor({ state: 'visible', timeout: 10_000 })
        .then(
          () => true,
          () => false,
        );
      const path = (() => {
        switch (new URL(page.url()).pathname) {
          case '/2fa/recovery':
            return 'RECOVERY';
          case '/2fa/setup':
            return 'SETUP';
          case '/login':
            return 'LOGIN';
          default:
            return 'OTHER';
        }
      })();
      const protectedStatus = await page.evaluate(async () =>
        fetch('/api/v1/admin/auth/sessions', {
          cache: 'no-store',
          credentials: 'same-origin',
          redirect: 'error',
        }).then((response) => response.status),
      );
      const status = allowedStatuses.has(completedVerify.status())
        ? completedVerify.status()
        : 'UNCLASSIFIED';
      expect({ code, invalidMessageVisible, path, protectedStatus, status, verifyCount }).toEqual({
        code: 'ADMIN_RECOVERY_CODE_INVALID',
        invalidMessageVisible: true,
        path: 'RECOVERY',
        protectedStatus: 401,
        status: 400,
        verifyCount: 1,
      });
    } finally {
      page.off('request', observeVerifyRequest);
    }
    recoveryCodes = replacementCodes;
  });

  test('access refresh succeeds before idle and absolute expiry fail closed', async ({
    chainPage: page,
    privateChannel,
  }) => {
    await isolatePasswordRateLimitBoundary(privateChannel, {
      ipCounts: [5],
      observedPasswordCalls: 5,
      subjectCounts: [1, 4],
      targetKeys: 3,
    });
    await isolateTotpRateLimitBoundary(privateChannel);
    await isolateRefreshRateLimitBoundary(privateChannel);
    const establish = async (): Promise<void> => {
      await login(page, privateChannel);
      const verified = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/admin/auth/totp/verify') &&
          response.request().method() === 'POST',
      );
      await page
        .getByRole('textbox', { name: 'Code à six chiffres' })
        .fill(await freshTotp(bootstrapTotpSecret, 'bootstrap-admin', privateChannel));
      await page.getByRole('button', { name: 'Ouvrir ma session' }).click();
      const completedVerification = await verified;
      const status = completedVerification.status();
      const retryAfterCandidate = completedVerification.headers()['retry-after'];
      const retryAfter =
        retryAfterCandidate !== undefined && /^\d{1,10}$/u.test(retryAfterCandidate)
          ? retryAfterCandidate
          : null;
      if (status !== 200) {
        let errorCode: string | null = null;
        try {
          const failure = (await completedVerification.json()) as { error?: { code?: unknown } };
          if (
            typeof failure.error?.code === 'string' &&
            /^[A-Z][A-Z0-9_]{2,63}$/u.test(failure.error.code)
          ) {
            errorCode = failure.error.code;
          }
        } catch {
          // The closed diagnostic intentionally preserves only status, code and Retry-After.
        }
        expect({ errorCode, retryAfter, status }).toEqual({
          errorCode: null,
          retryAfter: null,
          status: 200,
        });
        throw new Error('TOTP verification failed before session fixture creation.');
      }
      const envelope = (await completedVerification.json()) as {
        data?: { accessToken?: string };
        error?: { code?: unknown };
      };
      const errorCode =
        typeof envelope.error?.code === 'string' &&
        /^[A-Z][A-Z0-9_]{2,63}$/u.test(envelope.error.code)
          ? envelope.error.code
          : null;
      expect({
        errorCode,
        retryAfter,
        status,
      }).toEqual({ errorCode: null, retryAfter: null, status: 200 });
      if (typeof envelope.data?.accessToken !== 'string') {
        throw new Error('Access token missing from session fixture.');
      }
      privateChannel.registerSensitiveValues([envelope.data.accessToken]);
      await registerAuthCookies(page, privateChannel);
      await expect(page.getByRole('heading', { name: /Tableau de bord/iu })).toBeVisible();
    };
    const refresh = async (): Promise<
      Readonly<{ accessToken: string | undefined; retryAfter: string | null; status: number }>
    > =>
      page.evaluate(async () => {
        const csrf = document.cookie
          .split('; ')
          .find((entry) => entry.startsWith('__Host-kora_admin_csrf='))
          ?.slice('__Host-kora_admin_csrf='.length);
        if (csrf === undefined) throw new Error('CSRF cookie missing.');
        const response = await fetch('/api/v1/admin/auth/sessions/refresh', {
          credentials: 'same-origin',
          headers: { 'X-Kora-CSRF': decodeURIComponent(csrf) },
          method: 'POST',
        });
        const body = (await response.json()) as { data?: { accessToken?: string } };
        return {
          accessToken: body.data?.accessToken,
          retryAfter: response.headers.get('Retry-After'),
          status: response.status,
        };
      });

    await privateChannel.resetRefreshProbe();
    await establish();
    const probeAfterEstablish = await privateChannel.refreshProbeState();
    const cookieNamesBeforeRefresh = (await page.context().cookies())
      .filter((cookie) => authCookieNames.has(cookie.name))
      .map((cookie) => cookie.name)
      .sort();
    await privateChannel.configureNextRefreshOffset(960);
    const probeAfterOffset = await privateChannel.refreshProbeState();
    const accessExpired = await refresh();
    const probeAfterRefresh = await privateChannel.refreshProbeState();
    expect({
      cookieNamesBeforeRefresh,
      probeAfterEstablish,
      probeAfterOffset,
      probeAfterRefresh,
      retryAfter: accessExpired.retryAfter,
      status: accessExpired.status,
    }).toEqual({
      cookieNamesBeforeRefresh: ['__Host-kora_admin_csrf', '__Host-kora_admin_refresh'],
      probeAfterEstablish: { active: 0, calls: 0, maxConcurrency: 0 },
      probeAfterOffset: { active: 0, calls: 0, maxConcurrency: 0 },
      probeAfterRefresh: { active: 0, calls: 1, maxConcurrency: 1 },
      retryAfter: null,
      status: 200,
    });
    if (typeof accessExpired.accessToken !== 'string') {
      throw new Error('Access refresh token missing.');
    }
    privateChannel.registerSensitiveValues([accessExpired.accessToken]);
    await registerAuthCookies(page, privateChannel);
    await expectAuthCookiePolicy(page, ['__Host-kora_admin_csrf', '__Host-kora_admin_refresh']);

    await privateChannel.configureNextRefreshOffset(29_820);
    expect((await refresh()).status).toBe(401);
    expect(
      (await page.context().cookies()).filter((cookie) => authCookieNames.has(cookie.name)).length,
    ).toBe(0);

    await establish();
    await privateChannel.configureNextRefreshOffset(43_260);
    expect((await refresh()).status).toBe(401);
    expect(
      (await page.context().cookies()).filter((cookie) => authCookieNames.has(cookie.name)).length,
    ).toBe(0);
  });

  test('two then five tabs refresh serially without revoking the session family', async ({
    chainPage: page,
    privateChannel,
  }) => {
    await isolateRefreshRateLimitBoundary(privateChannel);
    await login(page, privateChannel);
    await expect(page).toHaveURL(/\/2fa\/verify/u);
    const verified = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/admin/auth/totp/verify') &&
        response.request().method() === 'POST',
    );
    await page
      .getByRole('textbox', { name: 'Code à six chiffres' })
      .fill(await freshTotp(bootstrapTotpSecret, 'bootstrap-admin', privateChannel));
    await page.getByRole('button', { name: 'Ouvrir ma session' }).click();
    const completedVerification = await verified;
    expect(completedVerification.status()).toBe(200);
    const verificationEnvelope = (await completedVerification.json()) as {
      data?: { accessToken?: unknown };
    };
    if (typeof verificationEnvelope.data?.accessToken !== 'string') {
      throw new Error('Access token missing from multi-tab session fixture.');
    }
    privateChannel.registerSensitiveValues([verificationEnvelope.data.accessToken]);
    await registerAuthCookies(page, privateChannel);
    await expectAuthCookiePolicy(page, ['__Host-kora_admin_csrf', '__Host-kora_admin_refresh']);
    await expect(page.getByRole('heading', { name: /Tableau de bord/iu })).toBeVisible();
    const context = page.context();

    const refreshGroup = async (count: number): Promise<void> => {
      await privateChannel.resetRefreshProbe();
      await privateChannel.resetPasswordDiagnostics();
      const pages = await Promise.all(Array.from({ length: count }, async () => context.newPage()));
      const observations = pages.map((): Promise<RefreshResponseDiagnostic>[] => []);
      for (const [index, candidate] of pages.entries()) {
        registerDynamicRequestSecrets(candidate, privateChannel);
        candidate.on('response', (response) => {
          if (
            response.url().endsWith('/api/v1/admin/auth/sessions/refresh') &&
            response.request().method() === 'POST'
          ) {
            observations[index]!.push(refreshResponseDiagnostic(response));
          }
        });
      }
      let uiFailure = false;
      try {
        await Promise.all(pages.map(async (candidate) => candidate.goto('/')));
        try {
          for (const candidate of pages) {
            await expect(
              candidate.getByRole('heading', { name: /Tableau de bord/iu }),
            ).toBeVisible();
            await expectAuthCookiePolicy(candidate, [
              '__Host-kora_admin_csrf',
              '__Host-kora_admin_refresh',
            ]);
            expect(await refreshPageDiagnostic(candidate)).toEqual({
              gate: 'DASHBOARD',
              path: '/',
              reason: null,
            });
          }
        } catch {
          uiFailure = true;
        }
        const [probe, responseDiagnostics, pageDiagnostics, passwordDiagnostics] =
          await Promise.all([
            privateChannel.refreshProbeState(),
            Promise.all(observations.map(async (responses) => Promise.all(responses))),
            Promise.all(pages.map(async (candidate) => refreshPageDiagnostic(candidate))),
            privateChannel.passwordDiagnostics(),
          ]);
        const rateLimitDiagnostic = {
          calls: passwordDiagnostics.rateLimitCalls,
          failures: passwordDiagnostics.rateLimitFailures,
          lastFailure: passwordDiagnostics.lastRateLimitFailure,
          lastStage: passwordDiagnostics.lastRateLimitStage,
        };
        expect({ probe, rateLimitDiagnostic, responseDiagnostics }).toEqual({
          probe: { active: 0, calls: count, maxConcurrency: 1 },
          rateLimitDiagnostic: {
            calls: count,
            failures: 0,
            lastFailure: 'NONE',
            lastStage: 'WAITAOF_LOCAL_DURABLE',
          },
          responseDiagnostics: Array.from({ length: count }, () => [
            { errorCode: null, retryAfter: null, source: null, status: 200 },
          ]),
        });
        if (uiFailure) {
          throw new Error(`C3_REFRESH_GROUP_UI_STATE:${JSON.stringify(pageDiagnostics)}`);
        }
      } finally {
        await Promise.all(pages.map(async (candidate) => candidate.close()));
      }
    };

    await refreshGroup(2);
    await registerAuthCookies(page, privateChannel);
    await refreshGroup(5);
    await registerAuthCookies(page, privateChannel);
    await privateChannel.resetRefreshProbe();
    const finalRefresh = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/admin/auth/sessions/refresh') &&
        response.request().method() === 'POST',
    );
    const finalSessionList = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/admin/auth/sessions') &&
        response.request().method() === 'GET' &&
        response.status() === 200,
    );
    await page.goto('/compte/securite');
    const [completedFinalRefresh, completedFinalSessionList] = await Promise.all([
      finalRefresh,
      finalSessionList,
    ]);
    expect(await refreshResponseDiagnostic(completedFinalRefresh)).toEqual({
      errorCode: null,
      retryAfter: null,
      source: null,
      status: 200,
    });
    expect(completedFinalSessionList.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Sécurité du compte' })).toBeVisible();
    await expect(page.locator('.admin-session-list')).toContainText('Session actuelle');
    await expectAuthCookiePolicy(page, ['__Host-kora_admin_csrf', '__Host-kora_admin_refresh']);
    expect(await privateChannel.refreshProbeState()).toEqual({
      active: 0,
      calls: 1,
      maxConcurrency: 1,
    });
  });

  test('the session provider defers one refresh 429 then recovers after Retry-After', async ({
    chainPage: page,
    privateChannel,
  }) => {
    await isolateRefreshRateLimitBoundary(privateChannel);
    await registerAuthCookies(page, privateChannel);
    await expectAuthCookiePolicy(page, ['__Host-kora_admin_csrf', '__Host-kora_admin_refresh']);
    const beforeDashboardRefresh = (await page.context().cookies())
      .filter((cookie) => authCookieNames.has(cookie.name))
      .map(({ name, value }) => ({ name, value }))
      .sort((left, right) => left.name.localeCompare(right.name));
    await privateChannel.resetRefreshProbe();
    const dashboardRefresh = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/admin/auth/sessions/refresh') &&
        response.request().method() === 'POST',
      { timeout: 10_000 },
    );
    await page.goto('/');
    const completedDashboardRefresh = await dashboardRefresh;
    expect(await refreshResponseDiagnostic(completedDashboardRefresh)).toEqual({
      errorCode: null,
      retryAfter: null,
      source: null,
      status: 200,
    });
    await expect(page.getByRole('heading', { name: /Tableau de bord/iu })).toBeVisible();
    expect(await refreshPageDiagnostic(page)).toEqual({
      gate: 'DASHBOARD',
      path: '/',
      reason: null,
    });
    await registerAuthCookies(page, privateChannel);
    await expectAuthCookiePolicy(page, ['__Host-kora_admin_csrf', '__Host-kora_admin_refresh']);
    const afterDashboardRefresh = (await page.context().cookies())
      .filter((cookie) => authCookieNames.has(cookie.name))
      .map(({ name, value }) => ({ name, value }))
      .sort((left, right) => left.name.localeCompare(right.name));
    expect(await privateChannel.refreshProbeState()).toEqual({
      active: 0,
      calls: 1,
      maxConcurrency: 1,
    });
    expect(
      afterDashboardRefresh.length === beforeDashboardRefresh.length &&
        afterDashboardRefresh.every(
          (cookie, index) =>
            cookie.name === beforeDashboardRefresh[index]?.name &&
            cookie.value !== beforeDashboardRefresh[index]?.value,
        ),
    ).toBe(true);
    await isolateRefreshRateLimitBoundary(privateChannel);
    await privateChannel.resetRefreshProbe();
    expect(await privateChannel.refreshProbeState()).toEqual({
      active: 0,
      calls: 0,
      maxConcurrency: 0,
    });
    const candidate = await page.context().newPage();
    registerDynamicRequestSecrets(candidate, privateChannel);
    const before = (await candidate.context().cookies())
      .filter((cookie) => authCookieNames.has(cookie.name))
      .map(({ name, value }) => ({ name, value }))
      .sort((left, right) => left.name.localeCompare(right.name));
    let refreshRequests = 0;
    await candidate.route('**/api/v1/admin/auth/sessions/refresh', async (route) => {
      refreshRequests += 1;
      if (refreshRequests === 1) {
        await route.fulfill({
          body: JSON.stringify({
            error: {
              code: 'RATE_LIMITED',
              details: { reason: 'RATE_LIMITED', retryAfterSeconds: 2 },
              message: 'Rate limited.',
              retryable: false,
            },
            requestId: 'c3_provider_rate_limit_0001',
          }),
          contentType: 'application/json; charset=utf-8',
          headers: { 'Cache-Control': 'no-store', 'Retry-After': '2' },
          status: 429,
        });
        return;
      }
      await route.continue();
    });
    try {
      await candidate.goto('/compte/securite');
      await expect(candidate.getByRole('heading', { name: 'Vérification en cours' })).toBeVisible();
      await candidate.waitForTimeout(500);
      expect(refreshRequests).toBe(1);
      const afterRateLimit = (await candidate.context().cookies())
        .filter((cookie) => authCookieNames.has(cookie.name))
        .map(({ name, value }) => ({ name, value }))
        .sort((left, right) => left.name.localeCompare(right.name));
      expect(JSON.stringify(afterRateLimit) === JSON.stringify(before)).toBe(true);
      await expect(candidate.getByRole('heading', { name: 'Sécurité du compte' })).toBeVisible({
        timeout: 10_000,
      });
      expect(refreshRequests).toBe(2);
      await expect(candidate.locator('.admin-session-list')).toContainText('Session actuelle');
    } finally {
      await candidate.close();
    }
    await expect(page.getByRole('heading', { name: /Tableau de bord/iu })).toBeVisible();
    expect(await refreshPageDiagnostic(page)).toEqual({
      gate: 'DASHBOARD',
      path: '/',
      reason: null,
    });
    expect(await privateChannel.refreshProbeState()).toEqual({
      active: 0,
      calls: 1,
      maxConcurrency: 1,
    });
  });

  test('cross-tab invalidation cancels a deferred refresh before Retry-After', async ({
    chainPage: page,
    privateChannel,
  }) => {
    await isolateRefreshRateLimitBoundary(privateChannel);
    await registerAuthCookies(page, privateChannel);
    await expectAuthCookiePolicy(page, ['__Host-kora_admin_csrf', '__Host-kora_admin_refresh']);
    const beforeResynchronization = (await page.context().cookies())
      .filter((cookie) => authCookieNames.has(cookie.name))
      .map(({ name, value }) => ({ name, value }))
      .sort((left, right) => left.name.localeCompare(right.name));
    await privateChannel.resetRefreshProbe();
    const openingRefresh = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/admin/auth/sessions/refresh') &&
        response.request().method() === 'POST',
      { timeout: 10_000 },
    );
    const openingSessionList = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/admin/auth/sessions') &&
        response.request().method() === 'GET',
      { timeout: 10_000 },
    );
    await page.goto('/compte/securite');
    const [completedOpeningRefresh, completedOpeningSessionList] = await Promise.all([
      openingRefresh,
      openingSessionList,
    ]);
    expect(await refreshResponseDiagnostic(completedOpeningRefresh)).toEqual({
      errorCode: null,
      retryAfter: null,
      source: null,
      status: 200,
    });
    expect(completedOpeningSessionList.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Sécurité du compte' })).toBeVisible();
    await expect(page.locator('.admin-session-list')).toContainText('Session actuelle');
    const logoutButton = page.getByRole('button', { name: 'Se déconnecter' });
    await expect(logoutButton).toBeVisible();
    expect(await refreshPageDiagnostic(page)).toEqual({
      gate: 'SECURITY',
      path: '/compte/securite',
      reason: null,
    });
    await registerAuthCookies(page, privateChannel);
    await expectAuthCookiePolicy(page, ['__Host-kora_admin_csrf', '__Host-kora_admin_refresh']);
    const afterResynchronization = (await page.context().cookies())
      .filter((cookie) => authCookieNames.has(cookie.name))
      .map(({ name, value }) => ({ name, value }))
      .sort((left, right) => left.name.localeCompare(right.name));
    expect(
      afterResynchronization.length === beforeResynchronization.length &&
        afterResynchronization.every(
          (cookie, index) =>
            cookie.name === beforeResynchronization[index]?.name &&
            cookie.value !== beforeResynchronization[index]?.value,
        ),
    ).toBe(true);
    expect(await privateChannel.refreshProbeState()).toEqual({
      active: 0,
      calls: 1,
      maxConcurrency: 1,
    });
    let logoutRequests = 0;
    const countLogoutRequest = (request: Request): void => {
      if (
        request.method() === 'DELETE' &&
        request.url().endsWith('/api/v1/admin/auth/sessions/current')
      ) {
        logoutRequests += 1;
      }
    };
    const context = page.context();
    context.on('request', countLogoutRequest);
    let candidate: Page | undefined;
    let refreshRequests = 0;
    let firstRateLimitedAt: number | undefined;
    try {
      candidate = await context.newPage();
      registerDynamicRequestSecrets(candidate, privateChannel);
      await candidate.route('**/api/v1/admin/auth/sessions/refresh', async (route) => {
        refreshRequests += 1;
        if (refreshRequests === 1) firstRateLimitedAt = performance.now();
        await route.fulfill({
          body: JSON.stringify({
            error: {
              code: 'RATE_LIMITED',
              details: { reason: 'RATE_LIMITED', retryAfterSeconds: 2 },
              message: 'Rate limited.',
              retryable: false,
            },
            requestId: 'c3_provider_invalidation_rate_limit_0001',
          }),
          contentType: 'application/json; charset=utf-8',
          headers: { 'Cache-Control': 'no-store', 'Retry-After': '2' },
          status: 429,
        });
      });
      const rateLimited = candidate.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/admin/auth/sessions/refresh') &&
          response.request().method() === 'POST',
      );
      await candidate.goto('/compte/securite');
      const completedRateLimit = await rateLimited;
      expect(completedRateLimit.status()).toBe(429);
      expect(completedRateLimit.headers()['retry-after']).toBe('2');
      await expect(candidate.getByRole('heading', { name: 'Vérification en cours' })).toBeVisible();
      await candidate.waitForTimeout(500);
      expect(refreshRequests).toBe(1);
      const logoutResponse = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/admin/auth/sessions/current') &&
          response.request().method() === 'DELETE',
        { timeout: 10_000 },
      );
      await logoutButton.click();
      await expect(candidate).toHaveURL(/\/login\?reason=session-invalidated$/u);
      if (firstRateLimitedAt === undefined) {
        throw new Error('The first rate-limited refresh was not timestamped.');
      }
      expect(performance.now() - firstRateLimitedAt).toBeLessThan(2_000);
      const completedLogout = await logoutResponse;
      expect(completedLogout.status()).toBe(204);
      expect(logoutRequests).toBe(1);
      await expect(page).toHaveURL(/\/login\?reason=signed-out$/u);
      await candidate.waitForTimeout(2_000);
      expect(refreshRequests).toBe(1);
      expect(logoutRequests).toBe(1);
    } finally {
      context.off('request', countLogoutRequest);
      await candidate?.close();
    }
    await login(page, privateChannel);
    await expect(page).toHaveURL(/\/2fa\/verify/u);
    await page
      .getByRole('textbox', { name: 'Code à six chiffres' })
      .fill(await freshTotp(bootstrapTotpSecret, 'bootstrap-admin', privateChannel));
    await page.getByRole('button', { name: 'Ouvrir ma session' }).click();
    await expect(page.getByRole('heading', { name: /Tableau de bord/iu })).toBeVisible();
    await privateChannel.resetRefreshProbe();
    const restoredRefresh = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/admin/auth/sessions/refresh') &&
        response.request().method() === 'POST',
    );
    const restoredSessionList = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/admin/auth/sessions') &&
        response.request().method() === 'GET',
    );
    await page.goto('/compte/securite');
    const [completedRestoredRefresh, completedRestoredSessionList] = await Promise.all([
      restoredRefresh,
      restoredSessionList,
    ]);
    expect(await refreshResponseDiagnostic(completedRestoredRefresh)).toEqual({
      errorCode: null,
      retryAfter: null,
      source: null,
      status: 200,
    });
    expect(completedRestoredSessionList.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'Sécurité du compte' })).toBeVisible();
    await expect(page.locator('.admin-session-list')).toContainText('Session actuelle');
    await registerAuthCookies(page, privateChannel);
    await expectAuthCookiePolicy(page, ['__Host-kora_admin_csrf', '__Host-kora_admin_refresh']);
    expect(await privateChannel.refreshProbeState()).toEqual({
      active: 0,
      calls: 1,
      maxConcurrency: 1,
    });
  });

  test('a refresh 429 preserves the exact cookie pair and is not retried', async ({
    chainPage: page,
    privateChannel,
  }) => {
    await isolateRefreshRateLimitBoundary(privateChannel);
    let rateLimited:
      | Readonly<{
          after: readonly Readonly<{ name: string; value: string }>[];
          before: readonly Readonly<{ name: string; value: string }>[];
          retryAfter: string | null;
        }>
      | undefined;
    let requestCount = 0;
    let observedRefreshRequests = 0;
    const observeRefreshRequest = (request: Request): void => {
      if (request.url().endsWith('/api/v1/admin/auth/sessions/refresh')) {
        observedRefreshRequests += 1;
      }
    };
    page.on('request', observeRefreshRequest);
    try {
      for (let attempt = 0; attempt < 12 && rateLimited === undefined; attempt += 1) {
        const before = (await page.context().cookies())
          .filter((cookie) => authCookieNames.has(cookie.name))
          .map(({ name, value }) => ({ name, value }))
          .sort((left, right) => left.name.localeCompare(right.name));
        const result = await page.evaluate(async () => {
          const csrf = document.cookie
            .split('; ')
            .find((entry) => entry.startsWith('__Host-kora_admin_csrf='))
            ?.slice('__Host-kora_admin_csrf='.length);
          if (csrf === undefined) throw new Error('CSRF cookie missing.');
          const response = await fetch('/api/v1/admin/auth/sessions/refresh', {
            credentials: 'same-origin',
            headers: { 'X-Kora-CSRF': decodeURIComponent(csrf) },
            method: 'POST',
          });
          return { retryAfter: response.headers.get('retry-after'), status: response.status };
        });
        requestCount += 1;
        await registerAuthCookies(page, privateChannel);
        if (result.status === 429) {
          const after = (await page.context().cookies())
            .filter((cookie) => authCookieNames.has(cookie.name))
            .map(({ name, value }) => ({ name, value }))
            .sort((left, right) => left.name.localeCompare(right.name));
          rateLimited = { after, before, retryAfter: result.retryAfter };
        } else {
          expect(result.status).toBe(200);
        }
      }
      expect(rateLimited).toBeDefined();
      expect(JSON.stringify(rateLimited?.after) === JSON.stringify(rateLimited?.before)).toBe(true);
      expect(rateLimited?.retryAfter).toMatch(/^[1-9][0-9]{0,4}$/u);
      const observedAtRateLimit = observedRefreshRequests;
      await page.waitForTimeout(250);
      expect(observedRefreshRequests).toBe(observedAtRateLimit);
      expect(requestCount).toBeLessThanOrEqual(12);
      await isolateRefreshRateLimitBoundary(privateChannel);
    } finally {
      page.off('request', observeRefreshRequest);
    }
  });

  test('an uncertain logout clears memory and every local auth cookie without replay', async ({
    chainPage: page,
    privateChannel,
  }) => {
    const beforeLogoutResynchronization = (await page.context().cookies())
      .filter((cookie) => authCookieNames.has(cookie.name))
      .map(({ name, value }) => ({ name, value }))
      .sort((left, right) => left.name.localeCompare(right.name));
    await privateChannel.resetRefreshProbe();
    const logoutResynchronization = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/admin/auth/sessions/refresh') &&
        response.request().method() === 'POST',
      { timeout: 10_000 },
    );
    await page.goto('/login');
    const completedLogoutResynchronization = await logoutResynchronization;
    expect(await refreshResponseDiagnostic(completedLogoutResynchronization)).toEqual({
      errorCode: null,
      retryAfter: null,
      source: null,
      status: 200,
    });
    await expect(page.getByRole('heading', { name: 'Choisissez votre contexte' })).toBeVisible();
    await registerAuthCookies(page, privateChannel);
    await expectAuthCookiePolicy(page, ['__Host-kora_admin_csrf', '__Host-kora_admin_refresh']);
    const afterLogoutResynchronization = (await page.context().cookies())
      .filter((cookie) => authCookieNames.has(cookie.name))
      .map(({ name, value }) => ({ name, value }))
      .sort((left, right) => left.name.localeCompare(right.name));
    expect(await privateChannel.refreshProbeState()).toEqual({
      active: 0,
      calls: 1,
      maxConcurrency: 1,
    });
    expect(
      afterLogoutResynchronization.length === beforeLogoutResynchronization.length &&
        afterLogoutResynchronization.every(
          (cookie, index) =>
            cookie.name === beforeLogoutResynchronization[index]?.name &&
            cookie.value !== beforeLogoutResynchronization[index]?.value,
        ),
    ).toBe(true);
    await isolateRefreshRateLimitBoundary(privateChannel);
    let browserLogoutRequests = 0;
    const countLogoutRequest = (request: Request): void => {
      if (
        request.method() === 'DELETE' &&
        request.url().endsWith('/api/v1/admin/auth/sessions/current')
      ) {
        browserLogoutRequests += 1;
      }
    };
    page.on('request', countLogoutRequest);
    try {
      const before = await privateChannel.logoutFaultState();
      await privateChannel.loseNextLogoutResponseAfterCommit();
      await page.getByRole('button', { name: 'Me déconnecter' }).click();
      await expect(page).toHaveURL(/\/login\?reason=logout-result-unknown$/u);
      await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
      await expect(
        page.getByText(
          'La session locale est fermée. La révocation distante n’a pas pu être confirmée.',
        ),
      ).toBeVisible();
      const remaining = (await page.context().cookies()).filter((cookie) =>
        authCookieNames.has(cookie.name),
      );
      expect(remaining.length).toBe(0);
      const after = await privateChannel.logoutFaultState();
      expect(browserLogoutRequests).toBe(1);
      expect(after.calls).toBe(before.calls + 1);
      expect(after.committedResponseLosses).toBe(before.committedResponseLosses + 1);
      await page.waitForTimeout(250);
      expect(browserLogoutRequests).toBe(1);
      await page.goto('/compte/securite');
      await expect(page).toHaveURL(/\/login(?:\?|$)/u);
      await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
    } finally {
      page.off('request', countLogoutRequest);
    }
  });

  test('an expired preauth returns 410 and clears the terminal browser context', async ({
    chainPage: page,
    privateChannel,
  }) => {
    const expired = await privateChannel.createExpiredPreAuth(bootstrapEmail, bootstrapPassword);
    await page.context().clearCookies();
    const cookieOrigin = new URL(page.url()).origin;
    await page.context().addCookies([
      {
        httpOnly: true,
        name: '__Host-kora_admin_preauth',
        sameSite: 'Strict',
        secure: true,
        url: cookieOrigin,
        value: expired.preAuthToken,
      },
      {
        httpOnly: false,
        name: '__Host-kora_admin_csrf',
        sameSite: 'Strict',
        secure: true,
        url: cookieOrigin,
        value: expired.csrfToken,
      },
    ]);
    await page.goto('/2fa/verify');
    const terminal = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/admin/auth/totp/verify') &&
        response.request().method() === 'POST',
    );
    const expiredTotp = totp(bootstrapTotpSecret);
    privateChannel.registerSensitiveValues([expiredTotp]);
    await page.getByRole('textbox', { name: 'Code à six chiffres' }).fill(expiredTotp);
    await page.getByRole('button', { name: 'Ouvrir ma session' }).click();
    expect((await terminal).status()).toBe(410);
    await expect(page).toHaveURL(/\/login\?reason=preauth-expired$/u);
    await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
    await expect(
      page.getByText('Le parcours d’authentification a expiré. Recommencez.'),
    ).toBeVisible();
    expect(
      (await page.context().cookies()).filter((cookie) => authCookieNames.has(cookie.name)).length,
    ).toBe(0);
  });

  test('rate limiting applies the server Retry-After window and blocks new submission', async ({
    chainPage: page,
    privateChannel,
  }) => {
    await isolatePasswordRateLimitBoundary(privateChannel, {
      ipCounts: [1, 4],
      observedPasswordCalls: 5,
      subjectCounts: [5],
      targetKeys: 3,
    });
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Adresse e-mail' }).fill('limited-c3@example.test');
    await page.getByLabel('Mot de passe').fill('invalid-password-value');
    let loginRequests = 0;
    const observeLoginRequest = (request: Request): void => {
      if (request.url().endsWith('/api/v1/admin/auth/login')) loginRequests += 1;
    };
    page.on('request', observeLoginRequest);
    try {
      let rateLimitedResponse: Response | undefined;
      const visibleRetry = page.locator('p.auth-status[aria-hidden="true"]');
      const loginStatuses: number[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = page.waitForResponse(
          (candidate) =>
            candidate.url().endsWith('/api/v1/admin/auth/login') &&
            candidate.request().method() === 'POST',
        );
        await page.getByRole('button', { name: /Continuer|Veuillez patienter/iu }).click();
        const completedResponse = await response;
        loginStatuses.push(completedResponse.status());
        if (completedResponse.status() === 429) rateLimitedResponse = completedResponse;
      }
      expect(loginStatuses).toEqual([401, 401, 401, 401, 401, 429]);
      expect(loginRequests).toBe(6);
      await expect(visibleRetry).toBeVisible();
      await expect(page.getByRole('status')).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Veuillez patienter' })).toBeDisabled();
      expect(rateLimitedResponse).toBeDefined();
      const header = rateLimitedResponse?.headers()['retry-after'];
      expect(header).toMatch(/^[1-9][0-9]{0,4}$/u);
      const retryAfterSeconds = Number(header);
      const rendered = await visibleRetry.textContent();
      const displayed = /dans (\d+) secondes/u.exec(rendered ?? '')?.[1];
      expect(displayed).toBeDefined();
      expect(Math.abs(Number(displayed) - retryAfterSeconds)).toBeLessThanOrEqual(1);
      const loginRequestsBefore = loginRequests;
      await page.getByRole('button', { name: 'Veuillez patienter' }).click({ force: true });
      await page.waitForTimeout(250);
      expect(loginRequests).toBe(loginRequestsBefore);
    } finally {
      page.off('request', observeLoginRequest);
    }
  });

  test('cross-site login is rejected before authentication and creates no auth cookie', async ({
    chainPage: page,
    privateChannel,
  }) => {
    const adminOrigin = new URL(page.url()).origin;
    const loginUrl = new URL('/api/v1/admin/auth/login', adminOrigin).toString();
    const foreignOrigin = 'https://cross-site.invalid';
    const foreignProbeUrl = `${foreignOrigin}/__c3-boundary-probe`;
    const beforeDiagnostics = await privateChannel.passwordDiagnostics();
    const beforeAuthCookieCount = (await page.context().cookies()).filter((cookie) =>
      authCookieNames.has(cookie.name),
    ).length;
    expect(beforeAuthCookieCount).toBe(0);
    let crossSiteLoginRequests = 0;
    const probePage = await page.context().newPage();
    let foreignDocumentRouteInstalled = false;
    let requestListenerInstalled = false;
    const observeCrossSiteLogin = (request: Request): void => {
      if (request.method() === 'POST' && request.url() === loginUrl) {
        crossSiteLoginRequests += 1;
      }
    };
    const serveForeignDocument = async (route: Route): Promise<void> => {
      const request = route.request();
      if (
        request.url() !== foreignProbeUrl ||
        request.method() !== 'GET' ||
        request.resourceType() !== 'document'
      ) {
        throw new Error('Unexpected request reached the foreign-origin document route.');
      }
      await route.fulfill({
        body: [
          '<!doctype html><html lang="fr"><head><meta charset="utf-8">',
          '<title>Sonde de frontière cross-site</title></head><body><main>',
          '<form id="cross-site-login" method="post">',
          '<label>Adresse e-mail<input name="email" value="cross-site-c3@example.test"></label>',
          '<label>Mot de passe<input name="password" value="not-a-valid-password"></label>',
          '<button type="submit">Soumettre la sonde cross-site</button>',
          '</form></main></body></html>',
        ].join(''),
        contentType: 'text/html; charset=utf-8',
        status: 200,
      });
    };
    const removeForeignDocumentRoute = async (): Promise<void> => {
      if (!foreignDocumentRouteInstalled) return;
      await probePage.unroute(foreignProbeUrl, serveForeignDocument);
      foreignDocumentRouteInstalled = false;
    };
    try {
      await probePage.route(foreignProbeUrl, serveForeignDocument);
      foreignDocumentRouteInstalled = true;
      const foreignDocument = await probePage.goto(foreignProbeUrl);
      expect(foreignDocument?.status()).toBe(200);
      expect(await probePage.evaluate(() => location.origin)).toBe(foreignOrigin);
      await expect(
        probePage.getByRole('button', { name: 'Soumettre la sonde cross-site' }),
      ).toBeVisible();
      await removeForeignDocumentRoute();

      await probePage.evaluate((action) => {
        const form = document.querySelector('#cross-site-login');
        if (!(form instanceof HTMLFormElement)) throw new Error('Cross-site probe form missing.');
        form.action = action;
      }, loginUrl);
      probePage.on('request', observeCrossSiteLogin);
      requestListenerInstalled = true;
      const rejected = probePage.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url() === loginUrl,
      );
      await probePage.getByRole('button', { name: 'Soumettre la sonde cross-site' }).click();
      const completedRejection = await rejected;
      const wireHeaders = await completedRejection.request().allHeaders();
      expect(wireHeaders.origin).toBe(foreignOrigin);
      expect(wireHeaders['sec-fetch-site']).toBe('cross-site');
      expect(wireHeaders['sec-fetch-mode']).toBe('navigate');
      expect(wireHeaders['sec-fetch-dest']).toBe('document');
      expect(wireHeaders.cookie).toBeUndefined();
      expect(wireHeaders['x-kora-csrf']).toBeUndefined();
      expect(await refreshResponseDiagnostic(completedRejection)).toEqual({
        errorCode: 'FORBIDDEN',
        retryAfter: null,
        source: 'BFF',
        status: 403,
      });
      await probePage.waitForTimeout(250);
      expect(crossSiteLoginRequests).toBe(1);
      expect(
        (await page.context().cookies()).filter((cookie) => authCookieNames.has(cookie.name))
          .length,
      ).toBe(beforeAuthCookieCount);
      expect(await privateChannel.passwordDiagnostics()).toEqual(beforeDiagnostics);
    } finally {
      if (requestListenerInstalled) probePage.off('request', observeCrossSiteLogin);
      await removeForeignDocumentRoute();
      await probePage.close();
    }
  });

  test('representative public states have no axe violation at three viewports', async ({
    page,
  }) => {
    const globalStateProbeHeader = 'x-kora-c3-global-state-probe';
    let globalStateAuthRequests = 0;
    const observeGlobalStateAuthRequest = (request: Request): void => {
      if (new URL(request.url()).pathname.startsWith('/api/v1/admin/auth/')) {
        globalStateAuthRequests += 1;
      }
    };
    page.on('request', observeGlobalStateAuthRequest);
    try {
      await page.setExtraHTTPHeaders({ [globalStateProbeHeader]: 'loading' });
      const streamedNotFound = await page.goto('/login?c3-global-state=loading', {
        waitUntil: 'commit',
      });
      expect(streamedNotFound?.status()).toBe(200);
      await page.setExtraHTTPHeaders({});
      await expect(page.locator('main[aria-busy="true"]')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Chargement sécurisé' })).toBeVisible();
      await expect(page.getByRole('status')).toHaveAttribute('aria-live', 'polite');
      await expectNoAxeViolations(page);
      await expect(page.getByRole('heading', { name: 'Chargement sécurisé' })).toBeVisible();
      await expect(page.getByRole('status')).toHaveAttribute('aria-live', 'polite');
      await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Aller à la connexion' })).toHaveAttribute(
        'href',
        '/login',
      );
      await expect(page.locator('body meta[name="robots"][content="noindex"]')).toHaveCount(1);

      await page.setExtraHTTPHeaders({ [globalStateProbeHeader]: 'error' });
      const errorResponse = await page.goto('/login?c3-global-state=error');
      expect(errorResponse).not.toBeNull();
      const errorMain = page.locator('main#contenu-principal');
      const errorAlert = errorMain.getByRole('alert');
      await expect(page.getByRole('heading', { name: 'Un problème est survenu' })).toBeVisible();
      await expect(errorAlert).toHaveCount(1);
      await expect(errorAlert).toHaveAttribute('aria-live', 'assertive');
      await expect(errorAlert).toContainText('Aucune opération n’est relancée automatiquement.');
      await expect(errorMain).toBeFocused();
      await expect(page.getByText('C3 global error boundary probe.')).toHaveCount(0);
      await expect(page.getByRole('navigation')).toHaveCount(0);
      await expectNoAxeViolations(page);
      await page.setExtraHTTPHeaders({ [globalStateProbeHeader]: 'not-found' });
      await page.getByRole('button', { name: 'Réessayer l’affichage' }).click();
      await expect(page).toHaveURL(/\/login\?c3-global-state=error$/u);
      await expect(errorMain).toHaveCount(1);
      await expect(errorAlert).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Réessayer l’affichage' })).toHaveCount(0);
      await expect(errorMain.getByRole('heading', { name: 'Page introuvable' })).toHaveCount(1);
      await expect(errorMain.getByRole('link', { name: 'Aller à la connexion' })).toHaveAttribute(
        'href',
        '/login',
      );
      await expect(errorMain.getByRole('textbox', { name: 'Adresse e-mail' })).toHaveCount(0);
      await expect(page.getByRole('navigation')).toHaveCount(0);
      await expectEffectiveNoIndex(page);
      await page.setExtraHTTPHeaders({});
      expect(globalStateAuthRequests).toBe(0);
    } finally {
      await page.setExtraHTTPHeaders({});
      page.off('request', observeGlobalStateAuthRequest);
    }

    for (const viewport of [
      { height: 812, width: 375 },
      { height: 1024, width: 768 },
      { height: 900, width: 1440 },
    ]) {
      await page.setViewportSize(viewport);
      for (const candidate of [
        { heading: 'Connexion', path: '/login', status: 200 },
        {
          heading: 'Récupération du mot de passe',
          path: '/recuperation',
          status: 200,
        },
        {
          heading: 'Accepter une invitation',
          path: '/invitation/accepter',
          status: 200,
        },
        {
          heading: 'Connexion',
          message: 'Votre session a expiré. Reconnectez-vous.',
          path: '/login?reason=session-expired',
          status: 200,
        },
        {
          heading: 'Page introuvable',
          loginLink: true,
          path: '/route-inexistante',
          status: 404,
        },
      ] as const) {
        const response = await page.goto(candidate.path);
        expect(response?.status()).toBe(candidate.status);
        await expect(page.getByRole('heading', { name: candidate.heading })).toBeVisible();
        if ('message' in candidate) {
          await expect(page.getByText(candidate.message)).toBeVisible();
        }
        if ('loginLink' in candidate) {
          await expect(page.getByRole('link', { name: 'Aller à la connexion' })).toHaveAttribute(
            'href',
            '/login',
          );
        }
        await expectNoAxeViolations(page);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(overflow).toBe(false);
      }
    }

    // This is deterministic CSS layout pressure, not a claim about native browser zoom.
    await page.setViewportSize({ height: 900, width: 1440 });
    await page.goto('/login');
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      ),
    ).toBe(false);

    await page.goto('/login');
    const emailField = page.getByRole('textbox', { name: 'Adresse e-mail' });
    await expect(emailField).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Aller au contenu principal' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'KORA plus Administration' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(emailField).toBeFocused();
    await emailField.fill('synthetic@example.invalid');
    await expect(emailField).toHaveValue('synthetic@example.invalid');
    expect(
      await emailField.evaluate((element) => (element as HTMLInputElement).checkValidity()),
    ).toBe(true);
    await page.keyboard.press('Tab');
    const passwordField = page.getByLabel('Mot de passe');
    await expect(passwordField).toBeFocused();

    let passwordValidationLoginRequests = 0;
    const observePasswordValidationLoginRequest = (request: Request): void => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/v1/admin/auth/login'
      ) {
        passwordValidationLoginRequests += 1;
      }
    };
    page.on('request', observePasswordValidationLoginRequest);
    try {
      await passwordField.fill('short-value');
      await page.getByRole('button', { name: 'Continuer' }).click();
      await expect(page).toHaveURL(/\/login$/u);
      await expect(passwordField).toBeFocused();
      await expect(passwordField).toHaveAttribute('aria-invalid', 'true');
      await expect(passwordField).toHaveAccessibleDescription(
        /Le mot de passe doit contenir entre 12 et 128 points de code Unicode\./u,
      );
      await page.waitForTimeout(250);
      expect(passwordValidationLoginRequests).toBe(0);
    } finally {
      page.off('request', observePasswordValidationLoginRequest);
    }
  });
});
