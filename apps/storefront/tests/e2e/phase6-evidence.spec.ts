import { expect, test, type Page, type Route } from '@playwright/test';
import { seedConsentDeclined } from './helpers';

/**
 * Phase 6 §6.3 — courier partner unreachable → `serviceable: null`. The PDP checker says "we'll
 * confirm at checkout" and checkout shows a non-blocking note (only `false` blocks).
 *
 * The behaviour test always runs. Screenshots for Phases/evidence/phase-06 are opt-in:
 *   EVIDENCE=1 pnpm --filter @pk/storefront test:e2e phase6-evidence
 */
const DIR = '../../Phases/evidence/phase-06';
const ORIGIN = 'http://localhost:3000';
const PIN = '175101';

const cors = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type, accept, idempotency-key',
  'access-control-allow-methods': 'GET, POST',
};
const envelope = (data: unknown) => ({
  success: true,
  data,
  error: null,
  requestId: 'req_evidence',
  timestamp: new Date().toISOString(),
});
const ok = (route: Route, data: unknown, status = 200) =>
  route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(envelope(data)) });

async function mockUnknownServiceability(page: Page) {
  await page.route('**/api/v1/shipping/check-pincode', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const { pincode } = route.request().postDataJSON() as { pincode: string };
    return ok(route, { pincode, serviceable: null, estimatedDays: null, courierHint: null });
  });
}

async function openProduct(page: Page) {
  await page.goto('/products');
  await page.getByTestId('product-card').first().getByRole('heading', { level: 3 }).getByRole('link').click();
}

async function addJarAndFillCheckout(page: Page) {
  await page.goto('/products');
  await page.getByTestId('product-card').first().getByRole('button', { name: 'Add to cart' }).click();
  await page.goto('/checkout');
  await expect(page.getByTestId('summary-line')).toHaveCount(1);
  await page.getByLabel('Full name').fill('Asha Thakur');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByRole('textbox', { name: /^Email/ }).fill('asha@example.com');
  await page.getByLabel('Pincode').fill(PIN);
  await page.getByLabel('House no., building, street').fill('House 12, Akhara Bazaar');
  await expect(page.getByLabel('City'))
    .toHaveValue(/.+/, { timeout: 10_000 })
    .catch(async () => {
      await page.getByLabel('City').fill('Kullu');
      await page.getByLabel('State').fill('Himachal Pradesh');
    });
}

/** Put the element ~120px below the viewport top (clear of the sticky header and mobile pay bar). */
async function scrollToTop(page: Page, selector: string) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 120);
  }, selector);
}

const unknownNote = /Couldn.t confirm delivery to this pincode right now/;

test('serviceability unknown: PDP says confirm at checkout; checkout is not blocked', async ({ page }) => {
  test.setTimeout(90_000);
  await seedConsentDeclined(page);
  await mockUnknownServiceability(page);
  await page.route('https://checkout.razorpay.com/**', (r) => r.abort());
  let createOrderCalled = false;
  await page.route('**/api/v1/checkout/create-order', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    createOrderCalled = true;
    return route.fulfill({ status: 503, headers: cors, contentType: 'application/json', body: '{}' });
  });

  await openProduct(page);
  const checker = page.getByTestId('pincode-checker');
  await checker.getByLabel('Check delivery to your pincode').fill(PIN);
  await expect(checker.getByText(`We’ll confirm delivery to ${PIN} at checkout`)).toBeVisible();
  await expect(checker.getByText(/can.t deliver/)).toHaveCount(0);

  await addJarAndFillCheckout(page);
  await expect(page.getByText(unknownNote)).toBeVisible();
  await expect(page.getByText("Sorry, we don't deliver to this pincode yet.")).toHaveCount(0);
  await expect(page.getByLabel('Pincode')).not.toHaveAttribute('aria-invalid', 'true');

  // Submitting must reach create-order (not stopped by a pincode validation error).
  await page.getByRole('checkbox', { name: /Send me updates about this order/ }).check();
  await page.getByTestId('pay-button').filter({ visible: true }).click();
  await expect.poll(() => createOrderCalled, { timeout: 10_000 }).toBe(true);
  await expect(page.getByText("Sorry, we don't deliver to this pincode yet.")).toHaveCount(0);
});

test.describe('evidence screenshots', () => {
  test.skip(!process.env.EVIDENCE, 'evidence screenshots only when EVIDENCE=1');

  for (const scheme of ['light', 'dark'] as const) {
    test(`pincode unknown ${scheme}`, async ({ page }, info) => {
      test.setTimeout(120_000);
      const vp = info.project.name.split('-').pop();
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await seedConsentDeclined(page);
      await mockUnknownServiceability(page);

      await openProduct(page);
      const checker = page.getByTestId('pincode-checker');
      await checker.getByLabel('Check delivery to your pincode').fill(PIN);
      await expect(checker.getByText(/confirm delivery to .* at checkout/)).toBeVisible();
      await scrollToTop(page, '[data-testid="pincode-checker"]');
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${DIR}/pincode-unknown-pdp-${vp}-${scheme}.png` });

      await addJarAndFillCheckout(page);
      await expect(page.getByText(unknownNote)).toBeVisible();
      await page.getByLabel('Pincode').blur();
      await scrollToTop(page, '#checkout-pincode');
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${DIR}/pincode-unknown-checkout-${vp}-${scheme}.png` });
    });
  }
});
