import { expect, test, type Page, type Route } from '@playwright/test';
import { API, ORIGIN } from './support/catalog-api';
import { mockDeskApi } from './support/desk-api';
import { auditShot } from './support/evidence';

/**
 * Website audit 2026-11-03 (R-12 / M-8): ADMIN sessions sign out after VITE_ADMIN_IDLE_MINUTES of
 * inactivity — a "Still there?" warning with a countdown first, then /login?reason=idle with a calm
 * notice. The Packing Desk (KITCHEN_PARTNER) is never idle-logged-out. The server's own idle rule
 * (refresh → 401 idle_timeout) lands on the same notice. Limits are shortened through the DEV-only
 * localStorage override (`pk-admin-idle-ms-override`), which production builds ignore.
 */
const OVERRIDE_KEY = 'pk-admin-idle-ms-override';
const LAST_ACTIVE_KEY = 'pk-admin-last-active';

const admin = {
  id: '6c2b1f4e-8a3d-4b7c-9e1f-2a3b4c5d6e7f',
  role: 'ADMIN',
  fullName: 'Asha Negi',
  phoneMasked: null,
  email: 'asha@pahadikhatki.in',
  totpEnabled: true,
};
const cors = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type, accept',
  'access-control-allow-methods': 'GET, POST',
};
const reply = (route: Route, status: number, success: boolean, data: unknown, error: unknown = null) =>
  route.fulfill({
    status,
    headers: cors,
    contentType: 'application/json',
    body: JSON.stringify({ success, data, error, requestId: 'req_idle', timestamp: new Date().toISOString() }),
  });

/** ADMIN session mock. `serverIdle`: the access cookie is gone and refresh refuses with idle_timeout. */
async function mockAdminSession(page: Page, opts: { serverIdle?: boolean } = {}) {
  const calls: Record<string, number> = {};
  const state = { signedIn: true };
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const path = new URL(req.url()).pathname.replace('/api/v1', '');
    calls[path] = (calls[path] ?? 0) + 1;
    if (path === '/auth/me') {
      if (opts.serverIdle || !state.signedIn)
        return reply(route, 401, false, null, { code: 'UNAUTHENTICATED', message: 'Please sign in.' });
      return reply(route, 200, true, { user: admin, pickupLocationIds: [] });
    }
    if (path === '/auth/refresh')
      return reply(route, 401, false, null, {
        code: 'UNAUTHENTICATED',
        message: 'Your session ended after a period of inactivity.',
        details: { reason: opts.serverIdle ? 'idle_timeout' : 'expired' },
      });
    if (path === '/auth/logout') {
      state.signedIn = false;
      return reply(route, 200, true, { loggedOut: true });
    }
    return reply(route, 404, false, null, { code: 'NOT_FOUND', message: 'Not found' });
  });
  return calls;
}

const setOverride = (page: Page, ms: number) =>
  page.addInitScript(
    ([key, value]) => {
      localStorage.setItem(key!, value!);
    },
    [OVERRIDE_KEY, String(ms)],
  );

for (const scheme of ['light', 'dark'] as const) {
  test(`ADMIN: warning with countdown → "Stay signed in" resets → expiry lands on /login?reason=idle (${scheme})`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const calls = await mockAdminSession(page);
    await setOverride(page, 6_000); // limit 6 s → warning at 3 s, sign-out at 6 s

    await page.goto('/account');
    await expect(page.getByRole('heading', { level: 1, name: /account/i })).toBeVisible();

    const dialog = page.getByRole('dialog', { name: 'Still there?' });
    await expect(dialog).toBeVisible({ timeout: 6_000 });
    await expect(dialog).toContainText(/signed out in [1-3] seconds?/);
    await expect(dialog).toContainText('Sessions end after 30 minutes of inactivity');
    await expect(dialog.getByRole('button', { name: 'Stay signed in' })).toBeFocused();
    // No escape hatch except the buttons: no close (X) button
    await expect(dialog.getByRole('button', { name: 'Close' })).toHaveCount(0);
    await auditShot(page, info, 'admin-idle-dialog', scheme, false);

    await dialog.getByRole('button', { name: 'Stay signed in' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/account$/);
    const lastActive = await page.evaluate((k) => Number(localStorage.getItem(k)), LAST_ACTIVE_KEY);
    expect(Date.now() - lastActive).toBeLessThan(2_000);
    await page.waitForTimeout(1_500); // still well inside the fresh 6 s window
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/account$/);

    // Walk away: the warning returns and the countdown runs out
    await expect(dialog).toBeVisible({ timeout: 6_000 });
    await expect(page).toHaveURL(/\/login\?reason=idle$/, { timeout: 8_000 });
    const notice = page.getByTestId('idle-notice');
    await expect(notice).toHaveText(/You were signed out after 30 minutes of inactivity/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    expect(calls['/auth/logout']).toBeGreaterThanOrEqual(1);
    await auditShot(page, info, 'admin-login-idle-notice', scheme);
  });
}

test('passive activity (scroll / key) keeps the session alive; the warning ignores stray scrolls once shown', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await mockAdminSession(page);
  await setOverride(page, 5_000); // warning at 2.5 s, sign-out at 5 s
  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 1, name: /account/i })).toBeVisible();
  const dialog = page.getByRole('dialog', { name: 'Still there?' });

  // Keep pressing a harmless key for 7 s (longer than the whole limit): never a warning
  for (let i = 0; i < 7; i++) {
    await page.keyboard.press('Shift');
    await page.waitForTimeout(1_000);
    await expect(dialog).toBeHidden();
  }
  await expect(page).toHaveURL(/\/account$/);

  // Now stop: the warning shows; a scroll must NOT dismiss it (only the button does)
  await expect(dialog).toBeVisible({ timeout: 6_000 });
  await page.mouse.wheel(0, 50);
  await page.waitForTimeout(600);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Sign out now' }).click();
  await expect(page).toHaveURL(/\/login\?reason=idle$/);
});

test('one active tab keeps the other admin tabs alive (shared last-activity timestamp)', async ({ context }) => {
  test.setTimeout(60_000);
  const quiet = await context.newPage();
  const busy = await context.newPage();
  await mockAdminSession(quiet);
  await mockAdminSession(busy);
  for (const p of [quiet, busy]) await setOverride(p, 5_000);
  await quiet.goto('/account');
  await busy.goto('/account');
  await expect(quiet.getByRole('heading', { level: 1, name: /account/i })).toBeVisible();
  await expect(busy.getByRole('heading', { level: 1, name: /account/i })).toBeVisible();

  const quietDialog = quiet.getByRole('dialog', { name: 'Still there?' });
  // 8 s of activity in the busy tab only — the quiet tab never warns
  for (let i = 0; i < 16; i++) {
    await busy.keyboard.press('Shift');
    await busy.waitForTimeout(500);
    await expect(quietDialog).toBeHidden();
  }
  await expect(quiet).toHaveURL(/\/account$/);
  // Both go quiet → both sign out
  await expect(quiet).toHaveURL(/\/login\?reason=idle$/, { timeout: 10_000 });
  await expect(busy).toHaveURL(/\/login\?reason=idle$/, { timeout: 10_000 });
});

test('server-side idle_timeout on refresh lands on /login?reason=idle with the notice (and keeps next)', async ({
  page,
}) => {
  await mockAdminSession(page, { serverIdle: true });
  await page.goto('/customers?q=arun');
  await expect(page).toHaveURL(/\/login\?reason=idle&next=%2Fcustomers%3Fq%3Darun$/);
  await expect(page.getByTestId('idle-notice')).toContainText('signed out after 30 minutes of inactivity');
});

test('an ordinary expired session shows no idle notice', async ({ page }) => {
  await mockAdminSession(page, { serverIdle: false });
  await page.route(`${API}/auth/me`, (route) =>
    reply(route, 401, false, null, { code: 'UNAUTHENTICATED', message: 'Please sign in.' }),
  );
  await page.goto('/customers');
  await expect(page).toHaveURL(/\/login\?next=%2Fcustomers$/);
  await expect(page.getByTestId('idle-notice')).toHaveCount(0);
});

test('KITCHEN_PARTNER on the Packing Desk never sees the idle warning', async ({ page, context }) => {
  test.setTimeout(60_000);
  await mockDeskApi(page, context);
  await setOverride(page, 3_000); // would have signed an admin out after 3 s
  await page.goto('/desk');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(7_000);
  await expect(page.getByRole('dialog', { name: 'Still there?' })).toHaveCount(0);
  await expect(page).toHaveURL(/\/desk$/);
  // The desk never even starts the clock
  expect(await page.evaluate((k) => localStorage.getItem(k), LAST_ACTIVE_KEY)).toBeNull();
});
