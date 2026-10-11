import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoHorizontalOverflow, mockCatalogApi } from './support/catalog-api';

/**
 * Phase 3 §3.7 — Batches (ADMIN + KITCHEN_PARTNER) at 375 / 768 / 1440, light + dark.
 * API is MOCKED (page.route, fixtures parsed by @pk/shared schemas).
 */
const shot = (page: Page, info: TestInfo, name: string, scheme: string) =>
  page.screenshot({ path: info.outputPath(`admin-${name}-${info.project.name}-${scheme}.png`), fullPage: true });
const isMobile = (info: TestInfo) => info.project.name.startsWith('mobile');

for (const scheme of ['light', 'dark'] as const) {
  test(`batches list, ledger drawer, create + adjust dialogs (${scheme})`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await mockCatalogApi(page);
    await page.goto('/batches');
    await expect(page.getByRole('heading', { name: 'Batches', level: 1 })).toBeVisible();
    const list = !info.project.name.startsWith('desktop')
      ? page.locator('ul').filter({ hasText: 'PK-' }).first()
      : page.getByRole('table', { name: /Batches/ });
    for (const label of ['Fresh', 'Sell first', 'Not sellable', 'Expired'])
      await expect(list.getByText(label, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Stock summary' })).toContainText('6 expired — log as wastage');
    await expectNoHorizontalOverflow(page);
    await shot(page, info, 'batches-list', scheme);

    await page.getByRole('button', { name: /Ledger for PK-.*CHK250-03/ }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('heading', { name: 'Stock ledger' })).toBeVisible();
    await expect(drawer).toContainText('Reserved for order');
    await expect(drawer).toContainText('bal. 22');
    await expectNoHorizontalOverflow(page);
    await shot(page, info, 'batch-ledger', scheme);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Log batch' }).first().click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Log a new batch' })).toBeVisible();
    await expect(page.getByText('Shelf life not set — ask the admin to add it')).toBeVisible();
    await shot(page, info, 'batch-create', scheme);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: /Adjust stock for PK-.*CHK250-03/ }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Adjust stock' })).toBeVisible();
    await shot(page, info, 'batch-adjust', scheme);
  });
}

test('partner logs a 50-jar batch in under 30 s; preview shows per-jar cost + expiry', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const api = await mockCatalogApi(page, { role: 'KITCHEN_PARTNER' });
  await page.goto('/batches');
  await expect(page.getByRole('heading', { name: 'Batches', level: 1 })).toBeVisible();

  const started = Date.now();
  await page.getByRole('button', { name: 'Log batch' }).first().click();
  await page.getByRole('radio', { name: 'Pahadi Mutton Pickle 250 g' }).click();
  await page.getByLabel('Jars').fill('50');
  await page.getByLabel('Total cost').fill('6,000');
  await expect(page.getByRole('dialog').getByText('₹120.00', { exact: true })).toBeVisible(); // 600000 / 50
  await expect(page.getByText(/^PK-\d{4}-MTN250-··$/)).toBeVisible();
  await page.getByRole('button', { name: 'Log batch' }).last().click();
  // The toast title (the live-region announcement repeats the text, so scope to the toast itself)
  await expect(page.locator('[data-slot="toast-title"]', { hasText: /Batch PK-\d{4}-MTN250-01 logged/ })).toBeVisible();
  const elapsedMs = Date.now() - started;
  expect(elapsedMs).toBeLessThan(30_000);
  info.annotations.push({ type: 'batch-entry-ms', description: String(elapsedMs) });

  expect(api.bodies['POST /batches']?.at(-1)).toEqual({
    productId: api.state.products[2]?.id,
    quantity: 50,
    totalCostPaise: 600000,
  });
  await expect(
    page
      .getByText(/MTN250-01/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
});

test('adjust: wastage writes a ledger row; going below zero is blocked client-side', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const api = await mockCatalogApi(page);
  await page.goto('/batches');
  await page.getByRole('button', { name: /Adjust stock for PK-.*CHK250-01/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Jars to remove').fill('7');
  await dialog.getByRole('button', { name: 'Broken jar' }).click();
  await dialog.getByRole('button', { name: 'Write off jars' }).click();
  await expect(dialog.getByText('Only 6 jars left in this batch')).toBeVisible();
  await dialog.getByLabel('Jars to remove').fill('2');
  await dialog.getByRole('button', { name: 'Write off jars' }).click();
  await expect(page.getByText('2 jars written off', { exact: true })).toBeVisible();
  expect(api.bodies['POST /batches/:id/adjustments']?.at(-1)).toEqual({
    type: 'WASTAGE',
    quantityDelta: -2,
    reason: 'Broken jar',
  });

  await page.getByRole('button', { name: /Ledger for PK-.*CHK250-01/ }).click();
  await expect(page.getByRole('dialog')).toContainText('“Broken jar”');
  await expect(page.getByRole('dialog')).toContainText('bal. 4');
});

test('filters live in the URL and in a bottom sheet on phones', async ({ page }, info) => {
  await mockCatalogApi(page);
  await page.goto('/batches');
  if (isMobile(info)) {
    await page.getByRole('button', { name: 'Filters' }).click();
    await page.getByRole('dialog').getByLabel('Shelf status').click();
  } else {
    await page.getByLabel('Shelf status').click();
  }
  await page.getByRole('option', { name: 'Expired' }).click();
  await expect(page).toHaveURL(/status=EXPIRED/);
  if (isMobile(info)) await page.getByRole('button', { name: /Show 1 batch/ }).click();
  await expect(page.getByText(/CHK250-03/).filter({ visible: true })).toHaveCount(0);
  await expect(
    page
      .getByText(/CHK250-01/)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('partner: role-aware nav and routes', async ({ page }) => {
  await mockCatalogApi(page, { role: 'KITCHEN_PARTNER' });
  await page.goto('/');
  await expect(page).toHaveURL(/\/batches$/);
  await expect(page.getByRole('link', { name: 'Products' })).toHaveCount(0);
  await page.goto('/products');
  await expect(page.getByRole('heading', { name: 'This page isn’t part of your role' })).toBeVisible();
});

test('admin nav has Overview, Products and Batches', async ({ page }, info) => {
  await mockCatalogApi(page);
  await page.goto('/batches');
  const nav = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });
  for (const name of ['Overview', 'Products', 'Batches']) await expect(nav.getByRole('link', { name })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Batches' })).toHaveAttribute('aria-current', 'page');
  if (isMobile(info))
    await expect(page.getByRole('navigation', { name: 'Main' }).filter({ visible: true })).toHaveCount(1);
});

test('batches loading, empty and error states', async ({ page }) => {
  await mockCatalogApi(page, { hangLists: true });
  await page.goto('/batches');
  await expect(page.getByRole('status', { name: 'Loading batches' })).toBeVisible();

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockCatalogApi(page, { empty: true });
  await page.goto('/batches');
  await expect(page.getByRole('heading', { name: 'No batches with stock' })).toBeVisible();

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockCatalogApi(page, { failLists: true });
  await page.goto('/batches');
  await expect(page.getByRole('heading', { name: 'Couldn’t load batches' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
