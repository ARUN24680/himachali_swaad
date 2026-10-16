import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Admin sign-in, TOTP step, guards and silent refresh (Phase 2 §2.7). API mocked with page.route.
 */
const API = 'http://localhost:4000/api/v1';
const ORIGIN = 'http://localhost:5173';
const EMAIL = 'asha@pahadikhatki.in';
const PASSWORD = 'correct horse battery staple';

const admin: {
  id: string;
  role: 'ADMIN' | 'KITCHEN_PARTNER' | 'CUSTOMER';
  fullName: string | null;
  phoneMasked: string | null;
  email: string | null;
  totpEnabled: boolean;
} = {
  id: '6c2b1f4e-8a3d-4b7c-9e1f-2a3b4c5d6e7f',
  role: 'ADMIN',
  fullName: 'Asha Negi',
  phoneMasked: null,
  email: EMAIL,
  totpEnabled: false,
};

const ok = (data: unknown) => ({
  success: true,
  data,
  error: null,
  requestId: 'req_t',
  timestamp: new Date().toISOString(),
});
const fail = (code: string, message: string, details?: Record<string, unknown>) => ({
  success: false,
  data: null,
  error: { code, message, ...(details ? { details } : {}) },
  requestId: 'req_t',
  timestamp: new Date().toISOString(),
});
const cors = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type, accept',
  'access-control-allow-methods': 'GET, POST',
};
const reply = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });

interface Scenario {
  signedIn?: boolean;
  /** Requires a TOTP code at login (ADMIN with 2FA on). */
  totpCode?: string;
  /** Access cookie expired: /me answers 401 until a refresh succeeds (or races). */
  accessExpired?: boolean;
  refresh?: 'ok' | 'fail' | 'race';
  user?: typeof admin;
}

async function mockApi(page: Page, s: Scenario = {}) {
  const calls: Record<string, number> = {};
  const state = {
    signedIn: s.signedIn ?? false,
    accessExpired: s.accessExpired ?? false,
    user: { ...(s.user ?? admin) },
  };
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const path = new URL(req.url()).pathname.replace('/api/v1', '');
    calls[path] = (calls[path] ?? 0) + 1;
    switch (path) {
      case '/auth/me':
        if (state.accessExpired) return reply(route, 401, fail('UNAUTHENTICATED', 'Please sign in.'));
        return state.signedIn
          ? reply(route, 200, ok({ user: state.user, pickupLocationIds: [] }))
          : reply(route, 401, fail('UNAUTHENTICATED', 'Please sign in.'));
      case '/auth/refresh':
        if (s.refresh === 'ok') {
          state.accessExpired = false;
          return reply(route, 200, ok({ user: state.user }));
        }
        if (s.refresh === 'race') {
          state.accessExpired = false; // the other tab already set fresh cookies
          return reply(route, 401, fail('UNAUTHENTICATED', 'Your session has ended.', { reason: 'race' }));
        }
        return reply(
          route,
          401,
          fail('UNAUTHENTICATED', 'Your session has ended. Please sign in again.', { reason: 'expired' }),
        );
      case '/auth/staff/login': {
        const body = req.postDataJSON() as { email: string; password: string; totp?: string };
        if (body.email !== EMAIL || body.password !== PASSWORD)
          return reply(route, 401, fail('UNAUTHENTICATED', 'Invalid email or password'));
        if (s.totpCode && !body.totp)
          return reply(route, 401, fail('TOTP_REQUIRED', 'Enter the code from your authenticator app.'));
        if (s.totpCode && body.totp !== s.totpCode)
          return reply(route, 401, fail('UNAUTHENTICATED', 'That authentication code is incorrect.'));
        state.signedIn = true;
        return reply(route, 200, ok({ user: state.user }));
      }
      case '/auth/logout':
      case '/auth/logout-all':
        state.signedIn = false;
        return reply(route, 200, ok({ loggedOut: true }));
      case '/auth/staff/2fa/setup':
        return reply(
          route,
          200,
          ok({
            otpauthUrl: `otpauth://totp/Pahadi%20Khatki:${EMAIL}?secret=JBSWY3DPEHPK3PXPJBSWY3DP&issuer=Pahadi%20Khatki`,
          }),
        );
      case '/auth/staff/2fa/verify': {
        const { code } = req.postDataJSON() as { code: string };
        if (code !== '135790')
          return reply(
            route,
            400,
            fail('VALIDATION_ERROR', 'That code is incorrect. Check your authenticator app and try again.'),
          );
        state.user.totpEnabled = true;
        return reply(route, 200, ok({ enabled: true }));
      }
      default:
        return reply(route, 404, fail('NOT_FOUND', 'Not found'));
    }
  });
  return calls;
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`signed out → /login; wrong password; TOTP step; home + user menu (${scheme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await mockApi(page, { totpCode: '246810' });
    const shot = (name: string) =>
      page.screenshot({
        path: testInfo.outputPath(`admin-${name}-${testInfo.project.name}-${scheme}.png`),
        fullPage: true,
      });

    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shot('login');

    // Field validation
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Enter your work email address')).toBeVisible();
    await expect(page.getByText('Enter your password')).toBeVisible();

    // Show / hide password
    const password = page.getByLabel('Password', { exact: true });
    await page.getByLabel('Work email').fill(EMAIL);
    await password.fill('wrong password');
    await expect(password).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(password).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(password).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
    await page.waitForTimeout(250); // let the field border transition settle before the evidence shot
    await shot('login-error');

    // Right password → TOTP_REQUIRED → 6-digit step
    await password.fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Two-factor check' })).toBeVisible();
    const first = page.getByLabel('Digit 1 of 6');
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute('autocomplete', 'one-time-code');
    await page.keyboard.type('111111'); // wrong → auto-submits on 6th digit
    await expect(page.getByRole('alert')).toContainText('That code is incorrect');
    await expect(first).toBeFocused();
    await shot('totp-error');
    await page.keyboard.type('246810');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Welcome back, Asha' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shot('home');

    await page.getByRole('button', { name: 'Account menu for Asha Negi' }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toContainText('Asha Negi');
    await expect(menu).toContainText('Admin');
    await expect(page.getByRole('menuitem', { name: 'Sign out of all devices' })).toBeVisible();
    await shot('user-menu');
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
}

test('expired access cookie: 401 → one refresh → original request retried', async ({ page }) => {
  const calls = await mockApi(page, { signedIn: true, accessExpired: true, refresh: 'ok' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back, Asha' })).toBeVisible();
  expect(calls['/auth/refresh']).toBe(1);
  expect(calls['/auth/me']).toBeGreaterThanOrEqual(2);
});

test('refresh race (another tab rotated first) → original request retried, user stays signed in', async ({ page }) => {
  const calls = await mockApi(page, { signedIn: true, accessExpired: true, refresh: 'race' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back, Asha' })).toBeVisible();
  expect(calls['/auth/refresh']).toBe(1);
  expect(calls['/auth/me']).toBeGreaterThanOrEqual(2);
});

test('concurrent 401s share ONE refresh (single-flight)', async ({ page }) => {
  const calls = await mockApi(page, { signedIn: true, refresh: 'ok' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back, Asha' })).toBeVisible();
  // Expire the access cookie, then fire three protected requests at once through the app's own client
  let expired = true;
  await page.route(`${API}/auth/me`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    calls['/auth/me'] = (calls['/auth/me'] ?? 0) + 1;
    if (expired) return reply(route, 401, fail('UNAUTHENTICATED', 'Please sign in.'));
    return reply(route, 200, ok({ user: admin, pickupLocationIds: [] }));
  });
  await page.route(`${API}/auth/refresh`, async (route) => {
    calls['/auth/refresh'] = (calls['/auth/refresh'] ?? 0) + 1;
    await new Promise((r) => setTimeout(r, 150)); // keep it in flight while the others arrive
    expired = false;
    return reply(route, 200, ok({ user: admin }));
  });
  const results = await page.evaluate(async () => {
    // Vite serves source modules in dev — use the app's real http client
    const mod = '/src/services/api/http.ts';
    const { http } = (await import(/* @vite-ignore */ mod)) as { http: (path: string) => Promise<unknown> };
    return Promise.all([http('/auth/me'), http('/auth/me'), http('/auth/me')]).then((r) => r.length);
  });
  expect(results).toBe(3);
  expect(calls['/auth/refresh']).toBe(1);
});

test('unresponsive API requests time out; caller cancellation remains an abort', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in', level: 1 })).toBeVisible();
  // Leave the request open: a backend accepting connections without answering used to hang forever.
  await page.route(`${API}/stalled`, () => {});
  const result = await page.evaluate(async () => {
    const mod = '/src/services/api/http.ts';
    const { http } = (await import(/* @vite-ignore */ mod)) as {
      http: (path: string, options?: { signal: AbortSignal }) => Promise<unknown>;
    };
    const describe = (error: unknown) => {
      const err = error as { code?: string; name: string; message: string };
      return { code: err.code, name: err.name, message: err.message };
    };
    const started = performance.now();
    const timeout = await http('/stalled').catch(describe);
    const elapsed = performance.now() - started;
    const controller = new AbortController();
    const cancelled = http('/stalled', { signal: controller.signal }).catch(describe);
    controller.abort();
    return { timeout, elapsed, cancelled: await cancelled };
  });
  expect(result.timeout).toMatchObject({ code: 'NETWORK_ERROR', message: expect.stringContaining('too long') });
  expect(result.elapsed).toBeLessThan(20_000);
  expect(result.cancelled).toMatchObject({ name: 'AbortError' });
});

test('refresh fails → /login?next=<path>, and sign-in returns there', async ({ page }) => {
  await mockApi(page, { signedIn: false, refresh: 'fail' });
  await page.goto('/?view=today');
  await expect(page).toHaveURL(/\/login\?next=%2F%3Fview%3Dtoday$/);
  await page.getByLabel('Work email').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/\?view=today$/);
});

test('open redirect is refused: ?next=//evil.example goes home', async ({ page }) => {
  await mockApi(page);
  await page.goto('/login?next=//evil.example');
  await page.getByLabel('Work email').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(`${ORIGIN}/`);
});

test('rate-limited sign-in shows the wait and disables the button', async ({ page }) => {
  await mockApi(page);
  await page.route(`${API}/auth/staff/login`, (route) =>
    reply(route, 429, fail('RATE_LIMITED', 'Too many requests.', { retryAfterSeconds: 840 })),
  );
  await page.goto('/login');
  await page.getByLabel('Work email').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Too many sign-in attempts. Please wait 14 minutes and try again.');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
});

test('customer session on the portal → "This portal is for staff"', async ({ page }) => {
  await mockApi(page, { signedIn: true, user: { ...admin, role: 'CUSTOMER', fullName: null, email: null } });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'This portal is for staff' })).toBeVisible();
});

test('admin enables two-factor: QR → code → On', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockApi(page, { signedIn: true });
  // Phase 9: "/" is the dashboard (nudges to turn 2FA on); the card lives on /account
  await page.goto('/');
  await page.getByRole('link', { name: 'Turn it on' }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText('Off', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Set up two-factor' }).click();
  await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();
  await expect(page.getByText('JBSW Y3DP EHPK 3PXP JBSW Y3DP')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`admin-2fa-setup-${testInfo.project.name}.png`), fullPage: true });
  await page.getByLabel('Digit 1 of 6').click();
  await page.keyboard.type('135790');
  await expect(page.getByText('Two-factor authentication is on.')).toBeVisible();
  await expect(page.getByText('On', { exact: true })).toBeVisible();
});
