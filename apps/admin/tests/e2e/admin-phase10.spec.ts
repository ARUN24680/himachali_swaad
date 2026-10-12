import { expect, test, type Page, type Route } from '@playwright/test';
import { mockAdminApi } from './support/admin-api';
import { API, expectNoHorizontalOverflow, ORIGIN } from './support/catalog-api';
import { EVIDENCE_ON, phase10Shot } from './support/evidence';

/**
 * Phase 10 admin UI: §10.3 Operations section on the dashboard (orders/hour, refunds, NDR/RTO,
 * test alert) and §10.1 mandatory ADMIN 2FA (403 TOTP_ENROLLMENT_REQUIRED → /account → back).
 */
const cors = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type, accept, idempotency-key',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE',
};
const reply = (route: Route, status: number, success: boolean, data: unknown, error: unknown = null) =>
  route.fulfill({
    status,
    headers: cors,
    contentType: 'application/json',
    body: JSON.stringify({ success, data, error, requestId: 'req_p10', timestamp: new Date().toISOString() }),
  });

const admin = (totpEnabled: boolean) => ({
  id: '6c2b1f4e-8a3d-4b7c-9e1f-2a3b4c5d6e7f',
  role: 'ADMIN',
  fullName: 'Asha Negi',
  phoneMasked: null,
  email: 'asha@pahadikhatki.in',
  totpEnabled,
});

/**
 * Production-style enforcement on top of the admin mock (registered later → wins): until the
 * admin verifies a code, every /admin/* call answers 403 TOTP_ENROLLMENT_REQUIRED.
 */
async function enforceTotp(page: Page) {
  const state = { enrolled: false, blocked: 0 };
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const path = new URL(req.url()).pathname.replace('/api/v1', '');
    if (path === '/auth/me') return reply(route, 200, true, { user: admin(state.enrolled), pickupLocationIds: [] });
    if (path === '/auth/staff/2fa/setup')
      return reply(route, 200, true, {
        otpauthUrl:
          'otpauth://totp/Pahadi%20Khatki:asha%40pahadikhatki.in?secret=JBSWY3DPEHPK3PXPJBSWY3DP&issuer=Pahadi%20Khatki',
      });
    if (path === '/auth/staff/2fa/verify') {
      const { code } = req.postDataJSON() as { code: string };
      if (code !== '246810')
        return reply(route, 400, false, null, { code: 'VALIDATION_ERROR', message: 'That code didn’t match.' });
      state.enrolled = true; // server sets the MFA access cookie here
      return reply(route, 200, true, { enabled: true });
    }
    if (path.startsWith('/admin/') && !state.enrolled) {
      state.blocked++;
      return reply(route, 403, false, null, {
        code: 'FORBIDDEN',
        message: 'Turn on two-factor authentication to use the admin console.',
        details: { reason: 'TOTP_ENROLLMENT_REQUIRED' },
      });
    }
    return route.fallback();
  });
  return state;
}

/** Evidence runs: phone shots at 390 px (the 375 project resized), desktop at 1440; tablet skipped. */
async function evidenceWidth(page: Page, project: string): Promise<390 | 1440 | null> {
  if (!EVIDENCE_ON) return null;
  if (project === 'mobile-375') {
    await page.setViewportSize({ width: 390, height: 844 });
    return 390;
  }
  return project === 'desktop-1440' ? 1440 : null;
}

for (const scheme of ['light', 'dark'] as const) {
  test(`dashboard Operations section: metrics + test alert toast (${scheme})`, async ({ page }, info) => {
    test.skip(scheme === 'dark' && info.project.name === 'tablet-768', 'tablet: light only');
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const width = await evidenceWidth(page, info.project.name);
    const mock = await mockAdminApi(page);
    await page.goto('/');

    const ops = page.getByTestId('ops-section');
    await expect(ops.getByRole('heading', { level: 2, name: 'Operations' })).toBeVisible();
    await expect(ops.getByText(/^Last 24 hours ·/)).toBeVisible();
    await expect(ops.getByRole('img', { name: 'Orders per hour for the last 24 hours (IST)' })).toBeVisible();
    // Money from integer paise via formatINR; rates as %
    await expect(ops.getByText('₹1,247.00')).toBeVisible();
    await expect(ops.getByText('3 refunds processed')).toBeVisible();
    await expect(ops.getByText('6.9%')).toBeVisible();
    await expect(ops.getByText('3.4%')).toBeVisible();
    await expect(ops.getByText('of 58 orders shipped')).toHaveCount(2);
    await expectNoHorizontalOverflow(page);
    if (width) {
      // Viewport shot of the section (full-page captures paint the fixed bars mid-page)
      await ops.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await phase10Shot(page, 'dashboard-ops', width, scheme, false);
    }

    await ops.getByRole('button', { name: 'Send test alert' }).click();
    const dialog = page.getByRole('dialog', { name: 'Send a test alert?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Send test alert' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Test alert queued for 1 admin (WhatsApp + e-mail).', { exact: true })).toBeVisible();
    expect(mock.bodies['POST /admin/ops/test-alert']).toHaveLength(1);
    // Viewport shot: the toast is fixed to the screen, the Operations card scrolled into view under it
    if (width) {
      await ops.evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await phase10Shot(page, 'dashboard-ops-test-alert-toast', width, scheme, false);
    }
  });
}

test('Operations section: error state with retry, rest of the dashboard unaffected', async ({ page }) => {
  await mockAdminApi(page);
  let fail = true;
  await page.route(`${API}/admin/ops/metrics`, (route) =>
    fail
      ? reply(route, 500, false, null, {
          code: 'INTERNAL_ERROR',
          message: 'The server had a hiccup. Please try again.',
        })
      : route.fallback(),
  );
  await page.goto('/');
  await expect(page.getByText(/Last 30 days/)).toBeVisible();
  const ops = page.getByTestId('ops-section');
  await expect(ops.getByText('Couldn’t load operations numbers')).toBeVisible();
  fail = false;
  await ops.getByRole('button', { name: /try again|retry/i }).click();
  await expect(ops.getByText('6.9%')).toBeVisible();
});

for (const scheme of ['light', 'dark'] as const) {
  test(`ADMIN without 2FA → /account banner → enrol → back where they were (${scheme})`, async ({ page }, info) => {
    test.skip(scheme === 'dark' && info.project.name === 'tablet-768', 'tablet: light only');
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const width = await evidenceWidth(page, info.project.name);
    await mockAdminApi(page);
    const enforcement = await enforceTotp(page);

    await page.goto('/orders?tab=attention');
    await expect(page).toHaveURL(/\/account\?required=2fa&next=%2Forders%3Ftab%3Dattention$/);
    const banner = page.getByTestId('totp-required-banner');
    await expect(banner).toContainText(
      'Two-factor authentication is required for admin accounts — set it up to continue.',
    );
    await expect(banner).toContainText('back to where you were');
    // No redirect loop: the page settles on /account even though admin calls keep failing
    await page.waitForTimeout(600);
    await expect(page).toHaveURL(/\/account\?required=2fa/);
    await expectNoHorizontalOverflow(page);
    if (width) await phase10Shot(page, 'admin-2fa-required-banner', width, scheme);

    await page.getByRole('button', { name: 'Set up two-factor' }).click();
    await expect(page.getByRole('img', { name: /QR code/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    if (width) await phase10Shot(page, 'admin-2fa-required-setup', width, scheme);
    await page.getByLabel('Digit 1 of 6').click();
    await page.keyboard.type('246810');

    // Enrolled → straight back to the page the API refused, now loading normally
    await expect(page).toHaveURL(/\/orders\?tab=attention$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible();
    await expect(page.getByText('Two-factor is on', { exact: true })).toBeVisible();
    expect(enforcement.blocked).toBeGreaterThan(0);
  });
}

test('2FA required from the dashboard → banner says dashboard; enrolment lands on "/"', async ({ page }) => {
  await mockAdminApi(page);
  await enforceTotp(page);
  await page.goto('/');
  await expect(page).toHaveURL(/\/account\?required=2fa$/);
  await expect(page.getByTestId('totp-required-banner')).toContainText('You’ll go to the dashboard right after.');
  await page.getByRole('button', { name: 'Set up two-factor' }).click();
  await page.getByLabel('Digit 1 of 6').click();
  await page.keyboard.type('246810');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('ops-section').getByText('6.9%')).toBeVisible();
});

test('a plain FORBIDDEN (no TOTP reason) never redirects to /account', async ({ page }) => {
  await mockAdminApi(page);
  await page.route(`${API}/admin/orders**`, (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors })
      : reply(route, 403, false, null, { code: 'FORBIDDEN', message: 'You do not have access to this.' }),
  );
  await page.goto('/orders');
  await page.waitForTimeout(600);
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByTestId('totp-required-banner')).toHaveCount(0);
});
