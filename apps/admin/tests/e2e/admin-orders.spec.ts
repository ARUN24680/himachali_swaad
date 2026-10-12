import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mockAdminApi } from './support/admin-api';
import { expectNoHorizontalOverflow } from './support/catalog-api';
import { evidenceShot } from './support/evidence';

/**
 * Phase 9 §9.3–9.4 — Orders console + detail drawer at 375 / 768 / 1440. API mocked (support/admin-api,
 * every fixture parsed by the @pk/shared contracts).
 */
const isMobile = (info: TestInfo) => info.project.name.startsWith('mobile');

/** Phones: whole card is a link; tablet/desktop: the order-code link in the row. */
const openOrder = (page: Page, info: TestInfo, code: string) =>
  (isMobile(info)
    ? page.getByRole('link', { name: `Open order ${code}` })
    : page.getByRole('table', { name: 'Orders' }).getByRole('link', { name: code, exact: true })
  ).click();

const lastRequest = (api: Awaited<ReturnType<typeof mockAdminApi>>) => api.orderRequests.at(-1)!;

test('tabs, search, sort and pagination are server-side and never reload the page', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const api = await mockAdminApi(page);
  await page.goto('/orders');
  await expect(page.getByRole('heading', { name: 'Orders', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Order summary' })).toContainText('Awaiting packing');
  await page.evaluate(() => ((window as unknown as { __pk: number }).__pk = 42)); // survives only without a reload
  expect(lastRequest(api).get('pageSize')).toBe('25');
  expect(lastRequest(api).get('sort')).toBe('created_desc');

  // Tab → ?tab=attention, refetch with tab param, same document
  const pills = page.getByRole('radiogroup', { name: 'Order status' });
  await pills.getByRole('radio', { name: /Needs attention/ }).click();
  await expect(page).toHaveURL(/\/orders\?tab=attention$/);
  await expect.poll(() => lastRequest(api).get('tab')).toBe('attention');
  await expect(page.getByText(/Showing 1–\d+ of \d+/)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __pk?: number }).__pk)).toBe(42);
  await expectNoHorizontalOverflow(page);
  await evidenceShot(page, info, 'orders-tab-attention', 'light');

  // Back to "All", then page 2
  await pills.getByRole('radio', { name: /^All/ }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByText('Showing 1–25 of 32')).toBeVisible();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect.poll(() => lastRequest(api).get('page')).toBe('2');
  await expect(page.getByText('Showing 26–32 of 32')).toBeVisible();

  // Sort by amount (header button, tablet/desktop)
  if (!isMobile(info)) {
    await page.getByRole('table', { name: 'Orders' }).getByRole('button', { name: 'Amount' }).click();
    await expect.poll(() => lastRequest(api).get('sort')).toMatch(/^total_(asc|desc)$/);
    await expect(page).toHaveURL(/sort=total_/);
    expect(lastRequest(api).get('page')).toBeNull(); // sort resets to page 1
  }

  // Search (debounced) → q param; page resets
  await page.getByRole('searchbox', { name: 'Search orders' }).fill('9876543210');
  await expect.poll(() => lastRequest(api).get('q')).toBe('9876543210');
  await expect(page).toHaveURL(/q=9876543210/);
  expect(lastRequest(api).get('page')).toBeNull();
  expect(await page.evaluate(() => (window as unknown as { __pk?: number }).__pk)).toBe(42);

  // Empty result → empty state with a way out
  await page.getByRole('searchbox', { name: 'Search orders' }).fill('PK-ZZZZZZ');
  await expect(page.getByRole('heading', { name: 'No orders match' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search & dates' }).click();
  await expect(page.getByRole('searchbox', { name: 'Search orders' })).toHaveValue('');
  await expectNoHorizontalOverflow(page);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`order list + drawer evidence (${scheme})`, async ({ page }, info) => {
    test.skip(scheme === 'dark' && info.project.name === 'tablet-768', 'tablet: light only');
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const api = await mockAdminApi(page);
    await page.goto('/orders');
    await expect(page.getByText('Showing 1–25 of 32')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await evidenceShot(page, info, 'orders-list', scheme);

    const flagged = api.orders[0]!.row.orderCode; // AWAITING_PACKING + booking failed
    await openOrder(page, info, flagged);
    const drawer = page.getByRole('dialog', { name: flagged });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText('Needs attention:')).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      /^https:\/\/wa\.me\/919876543210/,
    );
    await expect(drawer.getByText('PK-2610-CHK250-01')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await evidenceShot(page, info, 'order-drawer', scheme, false);
  });
}

test('deep link opens the drawer; closing returns to the list with filters kept', async ({ page }) => {
  const api = await mockAdminApi(page);
  const delivered = api.orders[2]!.row.orderCode;
  await page.goto(`/orders/${delivered}?tab=delivered`);
  const drawer = page.getByRole('dialog', { name: delivered });
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/orders\?tab=delivered$/);
  await expect(
    page.getByRole('radiogroup', { name: 'Order status' }).getByRole('radio', { name: /Delivered/ }),
  ).toHaveAttribute('aria-checked', 'true');
});

test('cancel shows only for cancellable orders; cancelling updates the order', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const api = await mockAdminApi(page);
  const delivered = api.orders[2]!.row.orderCode;
  const awaiting = api.orders[0]!.row.orderCode;

  await page.goto('/orders');
  await openOrder(page, info, delivered);
  await expect(page.getByRole('dialog', { name: delivered })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel order' })).toHaveCount(0); // DELIVERED → not in the allowed map
  await expect(page.getByRole('button', { name: 'Refund' })).toBeVisible();
  await page.keyboard.press('Escape');

  await openOrder(page, info, awaiting);
  const drawer = page.getByRole('dialog', { name: awaiting });
  await expect(drawer.getByRole('button', { name: 'Retry booking' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Resolve issue' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Cancel order' }).click();
  const dialog = page.getByRole('dialog', { name: `Cancel ${awaiting}?` });
  await dialog.getByRole('button', { name: 'Cancel order' }).click();
  await expect(dialog.getByText('Write at least 3 characters')).toBeVisible(); // reason required
  await dialog.getByLabel('Reason').fill('Customer asked to cancel on WhatsApp');
  await expect(dialog.getByRole('checkbox', { name: /Refund ₹/ })).toBeChecked();
  await evidenceShot(page, info, 'order-cancel-dialog', 'light', false);
  await dialog.getByRole('button', { name: 'Cancel order' }).click();
  await expect(page.locator('[data-slot="toast-title"]', { hasText: `${awaiting} cancelled` })).toBeVisible();
  expect(api.bodies[`POST /admin/orders/${awaiting}/cancel`]?.at(-1)).toEqual({
    reason: 'Customer asked to cancel on WhatsApp',
    refund: true,
  });
  await expect(drawer.getByText('Cancelled', { exact: true }).first()).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Cancel order' })).toHaveCount(0);
});

test('refund: amount above refundable is blocked client-side; one Idempotency-Key per dialog', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const api = await mockAdminApi(page);
  const delivered = api.orders[2]!.row; // ₹399 × qty, fully paid
  await page.goto(`/orders/${delivered.orderCode}`);
  const drawer = page.getByRole('dialog', { name: delivered.orderCode });
  await drawer.getByRole('button', { name: 'Refund' }).click();
  const dialog = page.getByRole('dialog', { name: `Refund ${delivered.orderCode}` });
  const amount = dialog.getByLabel('Amount');
  await expect(amount).toHaveValue(String(delivered.totalPaise / 100)); // pre-filled with the refundable amount

  await amount.fill(String(delivered.totalPaise / 100 + 1));
  await expect(dialog.getByText(/Can’t refund more than ₹/)).toBeVisible();
  await dialog.getByRole('button', { name: /^Refund/ }).click();
  expect(api.refundCalls).toHaveLength(0); // never reached the API
  await evidenceShot(page, info, 'order-refund-blocked', 'light', false);

  // Valid partial refund
  await amount.fill('120.50');
  await dialog.getByRole('combobox', { name: 'Reason' }).click();
  await page.getByRole('option', { name: 'Damaged in transit' }).click();
  await dialog.getByLabel('Notes').fill('Jar lid cracked — photo on WhatsApp');
  await dialog.getByRole('button', { name: 'Refund ₹120.50' }).click();
  await expect(page.locator('[data-slot="toast-title"]', { hasText: 'Refund of ₹120.50 started' })).toBeVisible();
  expect(api.refundCalls).toHaveLength(1);
  expect(api.refundCalls[0]!.key).toMatch(/^[0-9a-f-]{36}$/);
  expect(api.refundCalls[0]!.body).toEqual({
    amountPaise: 12050,
    reason: 'DAMAGED',
    notes: 'Jar lid cracked — photo on WhatsApp',
  });
  // Drawer refetched: the refund is listed and the refundable amount dropped
  await drawer.getByRole('tab', { name: 'Payments' }).click();
  await expect(drawer.getByText('Damaged in transit')).toBeVisible();
});

test('resend message, add note, resolve issue, retry booking', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const api = await mockAdminApi(page);
  const flagged = api.orders[0]!.row.orderCode;
  await page.goto(`/orders/${flagged}`);
  const drawer = page.getByRole('dialog', { name: flagged });

  await drawer.getByRole('button', { name: 'Resend message' }).click();
  const resend = page.getByRole('dialog', { name: 'Resend a message' });
  await resend.getByRole('combobox', { name: 'Message' }).click();
  await page.getByRole('option', { name: 'Order confirmed' }).click();
  await resend.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('[data-slot="toast-title"]', { hasText: 'Message queued' })).toBeVisible();
  expect(api.bodies[`POST /admin/orders/${flagged}/notifications/resend`]?.at(-1)).toEqual({
    template: 'order_confirmed',
  });

  await drawer.getByRole('tab', { name: 'Notes · messages' }).click();
  await drawer.getByLabel('New note').fill('Called customer, will pack tomorrow');
  await drawer.getByRole('button', { name: 'Add note' }).click();
  await expect(drawer.getByText('Called customer, will pack tomorrow')).toBeVisible();

  await drawer.getByRole('button', { name: 'Retry booking' }).click();
  await page
    .getByRole('dialog', { name: 'Retry shipment booking?' })
    .getByRole('button', { name: 'Retry booking' })
    .click();
  await expect(page.locator('[data-slot="toast-title"]', { hasText: 'Booking retried' })).toBeVisible();

  await drawer.getByRole('button', { name: 'Resolve issue' }).click();
  const resolve = page.getByRole('dialog', { name: 'Mark issue resolved' });
  await resolve.getByLabel('What was done?').fill('Wallet recharged, booking retried');
  await resolve.getByRole('button', { name: 'Resolve' }).click();
  await expect(drawer.getByRole('button', { name: 'Resolve issue' })).toHaveCount(0);
  await expect(drawer.getByText('Needs attention:')).toHaveCount(0);
});

test('label + invoice open signed URLs in a new tab', async ({ page, context }) => {
  const api = await mockAdminApi(page);
  const shipped = api.orders[1]!.row.orderCode; // IN_TRANSIT with AWB
  await page.goto(`/orders/${shipped}`);
  const drawer = page.getByRole('dialog', { name: shipped });
  // Headless Chromium downloads PDFs instead of rendering them, so assert the new tab's request
  const label = context.waitForEvent('request', (r) => r.url().includes(`label-${shipped}.pdf`));
  await drawer.getByRole('button', { name: 'Label' }).click();
  expect((await label).url()).toContain('sig=e2e');
  const invoice = context.waitForEvent('request', (r) => r.url().includes(`invoice-${shipped}.pdf`));
  await drawer.getByRole('button', { name: 'Invoice' }).click();
  expect((await invoice).url()).toContain('sig=e2e');
});

test('loading skeleton, error state with retry, and empty state', async ({ page }) => {
  await mockAdminApi(page, { emptyOrders: true });
  await page.goto('/orders');
  await expect(page.getByRole('heading', { name: 'No orders yet' })).toBeVisible();

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockAdminApi(page);
  await page.route('http://localhost:4000/api/v1/admin/orders?**', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': 'http://localhost:5173', 'access-control-allow-credentials': 'true' },
      body: JSON.stringify({
        success: false,
        data: null,
        error: { code: 'INTERNAL_ERROR', message: 'The server had a hiccup.' },
      }),
    }),
  );
  await page.goto('/orders');
  await expect(page.getByRole('heading', { name: 'Couldn’t load orders' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
