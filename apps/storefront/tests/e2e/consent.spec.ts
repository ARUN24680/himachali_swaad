import { expect, test, type Page, type Request } from '@playwright/test';

/**
 * DPDP consent (Phase 4 §4.8): GA4 / Meta Pixel / CAPI relay are silent until the visitor opts in.
 * The config injects fake GA4 + Pixel ids, so a "zero requests" result proves gating, not absence.
 */
const VENDOR = /googletagmanager\.com|google-analytics\.com|connect\.facebook\.net|facebook\.com/;
const CAPI = /\/api\/v1\/analytics\/events/;

function recordRequests(page: Page) {
  const seen: string[] = [];
  page.on('request', (r: Request) => {
    if (VENDOR.test(r.url()) || CAPI.test(r.url())) seen.push(r.url());
  });
  return seen;
}

async function browseAndAddToCart(page: Page) {
  await page.goto('/products');
  await page.getByTestId('product-card').first().getByRole('heading', { level: 3 }).getByRole('link').click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page.getByTestId('cart-button')).toHaveAccessibleName('Cart, 1 jar');
}

test('declining consent ⇒ zero GA4 / Pixel / CAPI requests', async ({ page }) => {
  const seen = recordRequests(page);
  await page.goto('/');
  const banner = page.getByRole('region', { name: 'Your privacy, your choice' });
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Reject all' }).click();
  await expect(banner).toBeHidden();
  await browseAndAddToCart(page);
  await page.waitForLoadState('networkidle');
  expect(seen).toEqual([]);
});

test('no request before any choice is made', async ({ page }) => {
  const seen = recordRequests(page);
  await page.goto('/products');
  await page.waitForLoadState('networkidle');
  expect(seen).toEqual([]);
});

test('accepting loads the vendors and relays AddToCart with a shared eventId', async ({ page }) => {
  await page.route(VENDOR, (route) => route.fulfill({ status: 204, body: '' }));
  const capi: unknown[] = [];
  await page.route(CAPI, async (route) => {
    capi.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        success: true,
        data: { received: true },
        error: null,
        requestId: 'req_test',
        timestamp: new Date().toISOString(),
      },
    });
  });
  const seen = recordRequests(page);
  await page.goto('/');
  await page
    .getByRole('region', { name: 'Your privacy, your choice' })
    .getByRole('button', { name: 'Accept all' })
    .click();
  await expect.poll(() => seen.some((u) => u.includes('googletagmanager.com'))).toBe(true);
  await expect.poll(() => seen.some((u) => u.includes('connect.facebook.net'))).toBe(true);
  await browseAndAddToCart(page);
  await expect.poll(() => capi.map((e) => (e as { eventName: string }).eventName)).toContain('AddToCart');
  const add = capi.find((e) => (e as { eventName: string }).eventName === 'AddToCart') as Record<string, unknown>;
  expect(add.consent).toBe(true);
  expect(typeof add.eventId).toBe('string');
});

test('consent choice is editable from the footer', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('region', { name: 'Your privacy, your choice' })
    .getByRole('button', { name: 'Reject all' })
    .click();
  await page.getByTestId('site-footer').getByRole('button', { name: 'Cookie preferences' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cookie preferences' });
  await expect(dialog.getByRole('switch', { name: 'Analytics' })).not.toBeChecked();
  await dialog.getByRole('switch', { name: 'Analytics' }).click();
  await dialog.getByRole('button', { name: 'Save choices' }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('pk-consent-v1')!).state);
  expect(saved).toMatchObject({ analytics: true, marketing: false });
});
