import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { expectNoHorizontalOverflow, mockCatalogApi } from './support/catalog-api';

/**
 * Phase 3 §3.7 — admin Products screens at 375 / 768 / 1440 (viewport projects), light + dark.
 * API is MOCKED (page.route, fixtures parsed by @pk/shared schemas) — backend endpoints were not live yet.
 */
const shot = (page: Page, info: TestInfo, name: string, scheme: string) =>
  page.screenshot({ path: info.outputPath(`admin-${name}-${info.project.name}-${scheme}.png`), fullPage: true });

const isMobile = (info: TestInfo) => info.project.name.startsWith('mobile');

for (const scheme of ['light', 'dark'] as const) {
  test(`products list + editor render cleanly (${scheme})`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await mockCatalogApi(page);

    await page.goto('/products');
    await expect(page.getByRole('heading', { name: 'Products', level: 1 })).toBeVisible();
    const kpis = page.getByRole('region', { name: 'Catalog summary' });
    await expect(kpis).toContainText('Live');
    await expect(kpis).toContainText('3');
    await expect(kpis).toContainText('1 need info to publish');
    await expect(page.getByText('Himalayan Trout Pickle').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('5 to fill before publishing').filter({ visible: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shot(page, info, 'products-list', scheme);

    // Draft editor with the publish checklist
    await page.getByText('Himalayan Trout Pickle').filter({ visible: true }).first().click();
    await expect(page.getByRole('heading', { name: 'Himalayan Trout Pickle', level: 1 })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Publish checklist' })).toContainText('GST rate');
    await expect(page.getByRole('button', { name: 'Publish to storefront' })).toBeDisabled();
    await expectNoHorizontalOverflow(page);
    await shot(page, info, 'product-editor-draft', scheme);
  });
}

test('filters, search and empty-match state', async ({ page }) => {
  await mockCatalogApi(page);
  await page.goto('/products');
  await page.getByRole('tab', { name: /Draft/ }).click();
  await expect(page).toHaveURL(/status=draft/);
  await expect(page.getByText('Himachali Chicken Pickle').filter({ visible: true })).toHaveCount(0);
  await page.getByRole('tab', { name: /All/ }).click();
  await page.getByRole('searchbox', { name: 'Search products' }).fill('MTN');
  await expect(page.getByText('Pahadi Mutton Pickle').filter({ visible: true }).first()).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search products' }).fill('zzz');
  await expect(page.getByRole('heading', { name: 'No products match' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByText('Pahadi Mutton Pickle').filter({ visible: true }).first()).toBeVisible();
});

test('complete a draft: ₹/% converted to integers, photo upload, publish', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const api = await mockCatalogApi(page);
  const trout = api.state.products.find((p) => p.sku === 'TRT250');
  await page.goto(`/products/${trout?.id}`);
  await expect(page.getByRole('heading', { name: 'Himalayan Trout Pickle', level: 1 })).toBeVisible();

  await page.getByLabel('Price (MRP incl. GST)').fill('620.10');
  await page.getByLabel('GST rate').fill('12.5');
  await page.getByLabel('Shelf life').fill('150');
  await page.getByLabel('Packed weight').fill('480');
  // Partial nutrition is rejected client-side
  await page.getByLabel('Energy').fill('290');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Fill all six nutrition values')).toBeVisible();
  for (const [label, v] of [
    ['Protein', '17'],
    ['Total fat', '22.5'],
    ['Carbohydrate', '5'],
    ['Total sugars', '0.8'],
    ['Sodium', '1300'],
  ] as const)
    await page.getByLabel(label, { exact: true }).fill(v);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('All changes saved.')).toBeVisible();

  const patch = api.bodies['PATCH /admin/products/:id']?.at(-1) as Record<string, unknown>;
  expect(patch.pricePaise).toBe(62010); // no float drift
  expect(patch.gstRateBp).toBe(1250);
  expect(patch.shelfLifeDays).toBe(150);
  expect(patch.nutrition).toEqual({
    energyKcal: 290,
    proteinG: 17,
    fatG: 22.5,
    carbsG: 5,
    sugarG: 0.8,
    sodiumMg: 1300,
  });
  expect(patch).not.toHaveProperty('sku');
  expect(patch).not.toHaveProperty('title'); // only changed fields are sent

  // Photo upload → presigned PUT (no cookies) → PATCH images
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'jar.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') });
  await expect(page.getByRole('list', { name: 'Product photos' }).getByText('Primary')).toBeVisible();
  const imagesPatch = api.bodies['PATCH /admin/products/:id']?.at(-1) as { images: string[] };
  expect(imagesPatch.images).toHaveLength(1);
  expect(api.bodies['storage-put']?.[0]).toMatchObject({
    headers: expect.not.objectContaining({ cookie: expect.anything() }),
  });

  // Too-big / wrong type files are refused before any request
  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'menu.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') });
  await expect(page.getByText('menu.pdf: use a JPG, PNG or WebP photo')).toBeVisible();

  const publish = page.getByRole('button', { name: 'Publish to storefront' });
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.getByText('Himalayan Trout Pickle is live', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: info.outputPath(`admin-product-editor-live-${info.project.name}.png`),
    fullPage: true,
  });
});

test('publish refused by the server (422) lists what is missing', async ({ page }) => {
  const api = await mockCatalogApi(page);
  const trout = api.state.products.find((p) => p.sku === 'TRT250');
  // Client thinks it is ready (stale list) but the server still refuses
  if (trout) trout.missingForPublish = [];
  await page.route(`**/admin/products/${trout?.id}/publish`, (route) =>
    route.fulfill({
      status: 422,
      headers: { 'access-control-allow-origin': 'http://localhost:5173', 'access-control-allow-credentials': 'true' },
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        data: null,
        error: { code: 'VALIDATION_FAILED', message: 'Not ready', details: { missing: ['gstRateBp', 'images'] } },
        requestId: 'req_e2e',
        timestamp: new Date().toISOString(),
      }),
    }),
  );
  await page.goto(`/products/${trout?.id}`);
  await page.getByRole('button', { name: 'Publish to storefront' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Can’t publish yet' })).toContainText(
    'gst rate, at least one photo',
  );
});

test('create product: duplicate SKU is shown on the field, then saved as a draft', async ({ page }, info) => {
  const api = await mockCatalogApi(page);
  await page.goto('/products/new');
  await expect(page.getByRole('heading', { name: 'New product', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Some fields need attention.')).toBeVisible();

  await page.getByLabel('Product name').fill('Himachali Chicken Pickle Smoked');
  await expect(page.getByLabel('URL slug')).toHaveValue('himachali-chicken-pickle-smoked-250g');
  await page.getByLabel('SKU').fill('chk250');
  await page.getByRole('combobox', { name: 'Meat' }).click();
  await page.getByRole('option', { name: 'Chicken' }).click();
  await page.getByLabel('Description', { exact: true }).fill('Smoked over pine wood before pickling.');
  await page.getByLabel('Price (MRP incl. GST)').fill('449.5');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('SKU CHK250 is already used by another product')).toBeVisible();
  if (!isMobile(info)) await expectNoHorizontalOverflow(page);

  await page.getByLabel('SKU').fill('CHKS250');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByRole('heading', { name: 'Himachali Chicken Pickle Smoked', level: 1 })).toBeVisible();
  const created = api.bodies['POST /admin/products']?.at(-1) as Record<string, unknown>;
  expect(created.pricePaise).toBe(44950);
  expect(created.sku).toBe('CHKS250');
  await expect(page.getByLabel('SKU')).toHaveAttribute('readonly', '');
});

test('loading, empty and error states', async ({ page }) => {
  await mockCatalogApi(page, { hangLists: true });
  await page.goto('/products');
  await expect(page.getByRole('status', { name: 'Loading products' })).toBeVisible();

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockCatalogApi(page, { empty: true });
  await page.goto('/products');
  await expect(page.getByRole('heading', { name: 'No products yet' })).toBeVisible();

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockCatalogApi(page, { failLists: true });
  await page.goto('/products');
  await expect(page.getByRole('heading', { name: 'Couldn’t load products' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
