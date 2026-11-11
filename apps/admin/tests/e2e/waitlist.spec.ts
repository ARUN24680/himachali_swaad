import { AdminWaitlistResponseSchema, type WaitlistEntry } from '@pk/shared';
import { expect, test, type Page, type Route } from '@playwright/test';
import { API, expectNoHorizontalOverflow, ORIGIN } from './support/catalog-api';
import { mockDeskApi } from './support/desk-api';
import { auditShot } from './support/evidence';

/**
 * Website audit 2026-11-03 (R-5): /waitlist lists coming-soon + storefront sign-ups for ADMIN —
 * search (q), source filter, pagination, CSV export with credentials, every state. API mocked;
 * every list response is parsed through AdminWaitlistResponseSchema so contract drift fails here.
 */
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
  'access-control-expose-headers': 'content-disposition',
};
const reply = (route: Route, status: number, success: boolean, data: unknown, error: unknown = null) =>
  route.fulfill({
    status,
    headers: cors,
    contentType: 'application/json',
    body: JSON.stringify({ success, data, error, requestId: 'req_wl', timestamp: new Date().toISOString() }),
  });

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const NAMES = ['Arun Kumar', null, 'Meera Shah', 'Vikram Negi', null, 'Sneha Nair', 'Rohan Gupta', null];

function seed(): WaitlistEntry[] {
  return Array.from({ length: 32 }, (_, i) => {
    const kind = i % 3; // 0 phone only · 1 e-mail only · 2 both
    const phone = kind === 1 ? null : `+919${String(876543210 - i * 7).padStart(9, '0')}`;
    const email = kind === 0 ? null : `person${i}@example.in`;
    return {
      id: uuid(900 + i),
      phone,
      email,
      name: NAMES[i % NAMES.length]!,
      source: i % 4 === 3 ? 'storefront' : 'coming-soon',
      consentAt: hoursAgo(i * 11 + 1),
      createdAt: hoursAgo(i * 11 + 1),
    };
  });
}

interface Options {
  empty?: boolean;
  failList?: boolean;
  failExport?: boolean;
}

async function mockWaitlistApi(page: Page, opts: Options = {}) {
  const entries = opts.empty ? [] : seed();
  const listCalls: URLSearchParams[] = [];
  let exportCalls = 0;
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const url = new URL(req.url());
    const path = url.pathname.replace('/api/v1', '');
    if (path === '/auth/me') return reply(route, 200, true, { user: admin, pickupLocationIds: [] });
    if (path === '/admin/waitlist/export.csv') {
      exportCalls++;
      if (opts.failExport)
        return reply(route, 500, false, null, { code: 'INTERNAL_ERROR', message: 'Export storage is unavailable.' });
      return route.fulfill({
        status: 200,
        headers: { ...cors, 'content-disposition': 'attachment; filename="waitlist-2026-11-03.csv"' },
        contentType: 'text/csv; charset=utf-8',
        body: 'joined_at,name,phone,email,source,consent_at\n',
      });
    }
    if (path === '/admin/waitlist') {
      listCalls.push(url.searchParams);
      if (opts.failList)
        return reply(route, 500, false, null, { code: 'INTERNAL_ERROR', message: 'Database unavailable.' });
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const source = url.searchParams.get('source');
      const page_ = Number(url.searchParams.get('page') ?? 1);
      const pageSize = Number(url.searchParams.get('pageSize') ?? 25);
      const filtered = entries.filter(
        (e) => (!q || e.phone?.includes(q) || e.email?.toLowerCase().includes(q)) && (!source || e.source === source),
      );
      return reply(
        route,
        200,
        true,
        AdminWaitlistResponseSchema.parse({
          entries: filtered.slice((page_ - 1) * pageSize, page_ * pageSize),
          total: filtered.length,
          page: page_,
          pageSize,
        }),
      );
    }
    return reply(route, 404, false, null, { code: 'NOT_FOUND', message: 'Not found' });
  });
  return { listCalls, exportCalls: () => exportCalls, entries };
}

const visible = (page: Page, text: string | RegExp) => page.getByText(text).filter({ visible: true }).first();

for (const scheme of ['light', 'dark'] as const) {
  test(`renders rows, totals, source badges and pagination; no horizontal overflow (${scheme})`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const api = await mockWaitlistApi(page);
    await page.goto('/waitlist');
    await expect(page.getByRole('heading', { level: 1, name: 'Waitlist' })).toBeVisible();
    await expect(page.getByTestId('page-header')).toContainText('32 people asked to hear when the store opens');
    await expect(visible(page, 'Arun Kumar')).toBeVisible();
    await expect(visible(page, '+91 98765 43210')).toBeVisible();
    await expect(visible(page, 'person1@example.in')).toBeVisible();
    await expect(page.getByTestId('kpi-card').first()).toContainText('32');
    await expect(visible(page, 'Showing 1–25 of 32')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toBeVisible();
    // Source badges from the fixture (every 4th row is from the storefront)
    await expect(page.getByText('Storefront', { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await auditShot(page, info, 'admin-waitlist', scheme);

    // Next page: query carries page=2, URL keeps it (back button / reload safe)
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(visible(page, 'Showing 26–32 of 32')).toBeVisible();
    await expect(page).toHaveURL(/\/waitlist\?page=2$/);
    expect(api.listCalls.at(-1)?.get('page')).toBe('2');
    expect(api.listCalls.at(-1)?.get('pageSize')).toBe('25');
    await expectNoHorizontalOverflow(page);
  });
}

test('search sends q, filters rows and lives in the URL; clearing restores the list', async ({ page }) => {
  const api = await mockWaitlistApi(page);
  await page.goto('/waitlist');
  await expect(visible(page, 'Showing 1–25 of 32')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search waitlist' }).fill('person1');
  await expect(page).toHaveURL(/\/waitlist\?q=person1$/);
  await expect(page.getByTestId('page-header')).toContainText(/\d+ people match/);
  expect(api.listCalls.at(-1)?.get('q')).toBe('person1');
  expect(api.listCalls.at(-1)?.get('page')).toBeNull(); // search resets to page 1
  await expect(visible(page, 'person1@example.in')).toBeVisible();
  await expect(page.getByText('person2@example.in')).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page).toHaveURL(/\/waitlist$/);
  await expect(visible(page, 'Showing 1–25 of 32')).toBeVisible();
});

test('source filter pills send source=…; "All" removes it; no match → clear filters', async ({ page }) => {
  const api = await mockWaitlistApi(page);
  await page.goto('/waitlist');
  await expect(visible(page, 'Showing 1–25 of 32')).toBeVisible();
  const pills = page.getByRole('radiogroup', { name: 'Filter by source' });
  await pills.getByRole('radio', { name: 'Storefront' }).click();
  await expect(page).toHaveURL(/\/waitlist\?source=storefront$/);
  await expect(visible(page, 'Showing 1–8 of 8')).toBeVisible();
  expect(api.listCalls.at(-1)?.get('source')).toBe('storefront');

  await pills.getByRole('radio', { name: 'Coming soon' }).click();
  await expect(page).toHaveURL(/\/waitlist\?source=coming-soon$/);
  await expect(visible(page, 'Showing 1–24 of 24')).toBeVisible();
  expect(api.listCalls.at(-1)?.get('source')).toBe('coming-soon');

  // A search that matches nothing within the filter → "No one matches" + one-click reset
  await page.getByRole('searchbox', { name: 'Search waitlist' }).fill('zzz');
  await expect(page.getByRole('heading', { name: 'No one matches' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page).toHaveURL(/\/waitlist$/);
  await expect(visible(page, 'Showing 1–25 of 32')).toBeVisible();

  // "All" drops the param (the unfiltered page is cached, so check the URL + the rendered total, not a refetch)
  await pills.getByRole('radio', { name: 'Storefront' }).click();
  await expect(visible(page, 'Showing 1–8 of 8')).toBeVisible();
  await pills.getByRole('radio', { name: 'All' }).click();
  await expect(page).toHaveURL(/\/waitlist$/);
  await expect(pills.getByRole('radio', { name: 'All' })).toBeChecked();
  await expect(visible(page, 'Showing 1–25 of 32')).toBeVisible();
});

test('empty state points at the coming-soon page', async ({ page }) => {
  await mockWaitlistApi(page, { empty: true });
  await page.goto('/waitlist');
  await expect(page.getByRole('heading', { name: 'No one on the list yet' })).toBeVisible();
  await expect(page.getByText('Share the coming-soon page')).toBeVisible();
  const link = page.getByRole('link', { name: 'Open the coming-soon page' });
  await expect(link).toHaveAttribute('href', /\/coming-soon$/);
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(page.getByTestId('page-header')).toContainText('0 people asked');
});

test('error state with retry recovers once the API answers', async ({ page }) => {
  const api = await mockWaitlistApi(page, { failList: true });
  await page.goto('/waitlist');
  const alert = page.getByRole('alert').filter({ hasText: 'Couldn’t load the waitlist' });
  // One automatic retry on a 5xx (queryClient) → the error state appears after the retry back-off
  await expect(alert).toBeVisible({ timeout: 10_000 });
  await expect(alert).toContainText('Database unavailable.');
  // Fix the API, then retry
  await page.route(/\/api\/v1\/admin\/waitlist(\?.*)?$/, (route) =>
    reply(
      route,
      200,
      true,
      AdminWaitlistResponseSchema.parse({ entries: api.entries.slice(0, 25), total: 32, page: 1, pageSize: 25 }),
    ),
  );
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(visible(page, 'Showing 1–25 of 32')).toBeVisible();
});

test('Export CSV fetches the export with credentials and saves the server file name', async ({ page }) => {
  const api = await mockWaitlistApi(page);
  await page.goto('/waitlist');
  await expect(visible(page, 'Showing 1–25 of 32')).toBeVisible();
  const [request, download] = await Promise.all([
    page.waitForRequest((r) => r.url().endsWith('/admin/waitlist/export.csv')),
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export CSV' }).click(),
  ]);
  expect(request.headers()['accept']).toContain('text/csv');
  expect(download.suggestedFilename()).toBe('waitlist-2026-11-03.csv');
  expect(api.exportCalls()).toBe(1);
  await expect(page.getByText('Waitlist export downloaded', { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="toast-description"]')).toContainText('waitlist-2026-11-03.csv');
});

test('a failed export shows a toast with the server message', async ({ page }) => {
  await mockWaitlistApi(page, { failExport: true });
  await page.goto('/waitlist');
  await expect(visible(page, 'Showing 1–25 of 32')).toBeVisible();
  await page.getByRole('button', { name: 'Export CSV' }).click();
  await expect(page.getByText('Export failed', { exact: true })).toBeVisible();
  await expect(page.getByText('Export storage is unavailable.', { exact: true })).toBeVisible();
});

test('KITCHEN_PARTNER is refused by the role guard and has no Waitlist nav item', async ({ page, context }) => {
  await mockDeskApi(page, context);
  await page.goto('/waitlist');
  await expect(page.getByRole('heading', { name: 'This page isn’t part of your role' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('link', { name: 'Waitlist' })).toHaveCount(0);
});

test('ADMIN sees "Waitlist" in the navigation next to Customers', async ({ page }) => {
  await mockWaitlistApi(page);
  await page.goto('/waitlist');
  await expect(page.getByRole('heading', { level: 1, name: 'Waitlist' })).toBeVisible();
  const nav = page.getByRole('link', { name: 'Waitlist' }).filter({ visible: true });
  if ((await nav.count()) > 0) {
    await expect(nav.first()).toHaveAttribute('aria-current', 'page');
  } else {
    // Phones: the item lives behind the bottom bar's "More"
    await page.getByRole('button', { name: /More/ }).click();
    await expect(page.getByRole('link', { name: 'Waitlist' }).filter({ visible: true }).first()).toBeVisible();
  }
});
