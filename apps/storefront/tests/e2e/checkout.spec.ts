import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, seedConsentDeclined } from './helpers';

// CI runs `next dev`: the first visit to /checkout and /order/[orderCode] compiles the route, which can
// take well over Playwright's 5 s expect default — give navigations and the whole flow room.
const NAV = { timeout: 45_000 };
test.describe.configure({ timeout: 120_000 });

/**
 * Phase 5 checkout E2E at 375 / 768 / 1440, against the REAL API (CI: seed-catalog --demo --publish,
 * PAYMENT_GATEWAY=mock). Nothing on the order/payment path is mocked — the mock gateway's dialog
 * drives POST /dev/payments/simulate and the real /payments/verify.
 *
 * Only the Razorpay script is blocked (external network; never used with the mock gateway).
 *
 * Rate limits (create-order: 5 / phone / 10 min, 10 / IP / 10 min — CI is one IP): every test uses a
 * fresh random phone and places exactly ONE order (retries reuse it) → 3 tests × 3 viewports = 9.
 */
test.beforeEach(async ({ page }) => {
  await seedConsentDeclined(page);
  await page.route('https://checkout.razorpay.com/**', (route) => route.abort());
});

const visible = (page: Page, testId: string) => page.getByTestId(testId).filter({ visible: true });

/** Adds the first catalogue jar and opens /checkout through the cart drawer, like a shopper. */
async function addJarAndCheckout(page: Page) {
  await page.goto('/products');
  await page.getByTestId('product-card').first().getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByTestId('cart-button')).toHaveAccessibleName('Cart, 1 jar');
  await page.getByTestId('cart-button').click();
  await page.getByTestId('cart-drawer').getByRole('link', { name: 'Checkout' }).click();
  await expect(page).toHaveURL(/\/checkout$/, NAV);
  await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();
  await expect(page.getByTestId('summary-line')).toHaveCount(1);
}

/** '98' + 8 random digits → a distinct E.164 phone (+9198…) per test. */
const randomPhoneDigits = () => `98${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

async function fillCheckout(page: Page) {
  await page.getByLabel('Full name').fill('Asha Thakur');
  await page.getByLabel('Mobile number').fill(randomPhoneDigits());
  await page.getByLabel('Pincode').fill('175101');
  await page.getByLabel('House no., building, street').fill('House 12, Akhara Bazaar');
  // City/state normally auto-fill from the PIN lookup; set them explicitly so CI never depends on India Post
  await page.getByLabel('City').fill('Kullu');
  await page.getByLabel('State').fill('Himachal Pradesh');
  await page.getByRole('checkbox', { name: /Send me updates about this order/ }).check();
}

test('cart → checkout → mock "Pay successfully" → /order/PK-XXXXXX confirmed', async ({ page }) => {
  await addJarAndCheckout(page);
  await expect(page.getByTestId('order-summary').getByText('MRP inclusive of all taxes')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /WhatsApp/ })).not.toBeChecked(); // DPDP: default off
  await expectNoHorizontalOverflow(page);

  // Client-side validation first: required consent + fields
  await visible(page, 'pay-button').click();
  await expect(page.getByText('Enter your full name')).toBeVisible();
  await expect(page.getByLabel('Full name')).toBeFocused();

  await fillCheckout(page);
  await visible(page, 'pay-button').click();

  const mock = page.getByTestId('mock-payment');
  await expect(mock.getByRole('heading', { name: 'Test payment (no real money)' })).toBeVisible();
  await expect(visible(page, 'reservation-timer')).toContainText(/1[0-5]:\d\d/);
  await mock.getByRole('button', { name: 'Pay successfully' }).click();

  await expect(page).toHaveURL(/\/order\/PK-[0-9A-HJKMNP-TV-Z]{6}$/, NAV);
  await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('order-status')).toHaveText('Confirmed');
  await expect(page.getByText(/Delivering to\s+Kullu/)).toBeVisible();
  await expect(page.getByTestId('cart-button')).toHaveAccessibleName('Cart, empty');
  await expectNoHorizontalOverflow(page);
});

test('mock "Fail payment" → retry state → same order pays', async ({ page }) => {
  await addJarAndCheckout(page);
  await fillCheckout(page);
  await visible(page, 'pay-button').click();

  const mock = page.getByTestId('mock-payment');
  await mock.getByRole('button', { name: 'Fail payment' }).click();
  const retry = page.getByTestId('payment-retry');
  await expect(retry).toContainText('Payment not completed');
  await expect(page.getByLabel('Full name')).toBeDisabled(); // details locked to the reserved order
  await expectNoHorizontalOverflow(page);

  await retry.getByRole('button', { name: 'Retry payment' }).click();
  await expect(mock).toBeVisible();
  await mock.getByRole('button', { name: 'Pay successfully' }).click();
  await expect(page).toHaveURL(/\/order\/PK-/, NAV);
  await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 20_000 });
});

test('mock "Pay, then close browser" → order page confirms via webhook polling', async ({ page }, info) => {
  await addJarAndCheckout(page);
  await fillCheckout(page);
  await visible(page, 'pay-button').click();
  await page.getByTestId('mock-payment').getByRole('button', { name: 'Pay, then close browser' }).click();

  await expect(page).toHaveURL(/\/order\/PK-[0-9A-HJKMNP-TV-Z]{6}$/, NAV);
  // No client verify: the page shows "Confirming…" until the (≈2 s late) webhook confirms the order
  await expect(page.getByTestId('order-confirming')).toBeVisible();
  if (process.env.EVIDENCE) {
    await page.screenshot({ path: `../../Phases/evidence/phase-05/live-order-confirming-${info.project.name}.png` });
  }
  await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('order-status')).toHaveText('Confirmed');
  await expectNoHorizontalOverflow(page);
  if (process.env.EVIDENCE) {
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: `../../Phases/evidence/phase-05/live-order-confirmed-${info.project.name}.png`,
      fullPage: true,
    });
  }
});
