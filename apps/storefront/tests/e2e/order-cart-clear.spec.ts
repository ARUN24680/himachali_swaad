import { expect, test, type Page } from '@playwright/test';
import { seedConsentDeclined } from './helpers';
import { CODE, PHONE_DIGITS, mockAccount, ok } from './tracking-mocks';

/**
 * Direct UPI returns from the separate pay page straight to /order/<code>, skipping checkout's
 * success callback — so the order page empties the cart once the order is paid, but only for the tab
 * that placed it (`pk-order-placed:<code>` in session storage) and only once. The order status
 * endpoint is mocked; the cart is seeded in localStorage (its count comes from the store, not a quote).
 */
const CART = JSON.stringify({
  state: { items: [{ productId: '00000000-0000-4000-8000-000000000001', quantity: 2 }] },
  version: 1,
});

function orderStatus(status: string, paymentStatus: string) {
  return {
    orderCode: CODE,
    status,
    paymentStatus,
    items: [],
    subtotalPaise: 44900,
    shippingFeePaise: 0,
    totalPaise: 44900,
    shippingCity: 'Chennai',
    createdAt: '2026-10-08T04:25:00.000Z',
    confirmedAt: status === 'CONFIRMED' ? '2026-10-08T04:30:00.000Z' : null,
    reservationExpiresAt: '2026-10-08T04:40:00.000Z',
    cancelReason: null,
    refund: null,
    invoiceAvailable: false,
    canCancel: false,
    retryPayment: null,
    whatsappOptIn: false,
  };
}

async function setup(page: Page, opts: { placedHere: boolean; status: string; paymentStatus: string }) {
  await seedConsentDeclined(page);
  await mockAccount(page, { signedIn: false });
  await page.route(`**/api/v1/orders/${CODE}/status**`, (route) =>
    ok(route, orderStatus(opts.status, opts.paymentStatus)),
  );
  // Seed once (first document only), so reloads see what the app left behind
  await page.addInitScript(
    ([code, phone, cart, placed]) => {
      if (sessionStorage.getItem('pk-e2e-seeded')) return;
      sessionStorage.setItem('pk-e2e-seeded', '1');
      localStorage.setItem('pk-cart-v1', cart!);
      sessionStorage.setItem(`pk-order-phone:${code}`, phone!);
      if (placed === '1') sessionStorage.setItem(`pk-order-placed:${code}`, '1');
    },
    [CODE, `+91${PHONE_DIGITS}`, CART, opts.placedHere ? '1' : '0'],
  );
}

const placedMarker = (page: Page) => page.evaluate((code) => sessionStorage.getItem(`pk-order-placed:${code}`), CODE);

test('paid order placed in this tab (Direct UPI return) empties the cart once', async ({ page }) => {
  await setup(page, { placedHere: true, status: 'CONFIRMED', paymentStatus: 'PAID' });
  await page.goto(`/order/${CODE}`);
  await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('cart-button')).toHaveAccessibleName('Cart, empty');
  expect(await placedMarker(page)).toBeNull(); // consumed → never clears again

  // A cart filled after the purchase survives a reload of the same order page
  await page.evaluate((cart) => localStorage.setItem('pk-cart-v1', cart), CART);
  await page.reload();
  await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('cart-button')).toHaveAccessibleName('Cart, 2 jars');
});

test('order link opened elsewhere (not placed in this tab) never touches the cart', async ({ page }) => {
  await setup(page, { placedHere: false, status: 'CONFIRMED', paymentStatus: 'PAID' });
  await page.goto(`/order/${CODE}`);
  await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('cart-button')).toHaveAccessibleName('Cart, 2 jars');
});

test('expired / unpaid UPI order keeps the cart and the marker', async ({ page }) => {
  await setup(page, { placedHere: true, status: 'EXPIRED', paymentStatus: 'UNPAID' });
  await page.goto(`/order/${CODE}`);
  await expect(page.getByTestId('order-expired')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('cart-button')).toHaveAccessibleName('Cart, 2 jars');
  expect(await placedMarker(page)).toBe('1');
});
