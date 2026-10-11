import { expect, test, type Page, type Route } from '@playwright/test';
import { seedConsentDeclined } from './helpers';

/**
 * Screenshot evidence for Phases/evidence/phase-05 (checkout light + dark × 375/768/1440, payment
 * retry, confirming, confirmed, expired, cancelled + refund). Opt-in:
 *   EVIDENCE=1 pnpm --filter @pk/storefront test:e2e phase5-evidence
 *
 * Catalogue, cart quote and pincode lookups hit the real API. Order/payment endpoints are mocked with
 * page.route so every state (late webhook, expiry, stock-out refund) is reachable on demand — the
 * live, un-mocked flow is covered by checkout.spec.ts.
 */
test.skip(!process.env.EVIDENCE, 'evidence screenshots only when EVIDENCE=1');

const DIR = '../../Phases/evidence/phase-05';
const ORIGIN = 'http://localhost:3000';
const CODE = 'PK-7KQ2M9';
const shot = (page: Page, name: string, project: string, scheme: string, fullPage = true) =>
  page.screenshot({ path: `${DIR}/${name}-${project}-${scheme}.png`, fullPage });

const cors = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type, accept, idempotency-key',
  'access-control-allow-methods': 'GET, POST',
};
const ok = (route: Route, data: unknown, status = 200) =>
  route.fulfill({
    status,
    headers: cors,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      data,
      error: null,
      requestId: 'req_evidence',
      timestamp: new Date().toISOString(),
    }),
  });

const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

function orderStatus(overrides: Record<string, unknown>) {
  return {
    orderCode: CODE,
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    items: [
      {
        productId: '4acddec7-eeea-41b5-8401-708d03f5948e',
        title: 'Himachali Chicken Pickle',
        netWeightG: 250,
        quantity: 2,
        unitPricePaise: 44900,
        totalPricePaise: 89800,
      },
      {
        productId: '5bcddec7-eeea-41b5-8401-708d03f5948f',
        title: 'Pahadi Mutton Pickle',
        netWeightG: 500,
        quantity: 1,
        unitPricePaise: 79900,
        totalPricePaise: 79900,
      },
    ],
    subtotalPaise: 169700,
    shippingFeePaise: 0,
    totalPaise: 169700,
    shippingCity: 'Kullu',
    createdAt: inMinutes(-3),
    confirmedAt: inMinutes(-2),
    reservationExpiresAt: inMinutes(12),
    cancelReason: null,
    refund: null,
    invoiceAvailable: true,
    canCancel: true,
    retryPayment: null,
    whatsappOptIn: true,
    ...overrides,
  };
}

async function mockPayments(page: Page) {
  await page.route('https://checkout.razorpay.com/**', (r) => r.abort());
  await page.route('**/api/v1/checkout/create-order', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return ok(
      route,
      {
        orderCode: CODE,
        razorpayOrderId: 'order_mock_7KQ2M9',
        amountPaise: 44900,
        currency: 'INR',
        keyId: 'mock',
        gateway: 'mock',
        expiresAt: inMinutes(15),
        prefill: { name: 'Asha Thakur', contact: '+919876543210', email: null },
      },
      201,
    );
  });
  await page.route('**/api/v1/dev/payments/simulate', (route) =>
    ok(route, { razorpayOrderId: 'order_mock_7KQ2M9', razorpayPaymentId: 'pay_mock_1', razorpaySignature: null }),
  );
}

async function addJarAndFill(page: Page) {
  await page.goto('/products');
  await page.getByTestId('product-card').first().getByRole('button', { name: 'Add to cart' }).click();
  await page.goto('/checkout');
  await expect(page.getByTestId('summary-line')).toHaveCount(1);
  await page.getByLabel('Full name').fill('Asha Thakur');
  await page.getByLabel('Mobile number').fill('9876543210');
  await page.getByRole('textbox', { name: /^Email/ }).fill('asha@example.com');
  await page.getByLabel('Pincode').fill('175101');
  await page.getByLabel('House no., building, street').fill('House 12, Akhara Bazaar');
  await page.getByLabel('Landmark').fill('Near Kalath Temple');
  await expect(page.getByLabel('City'))
    .toHaveValue(/.+/, { timeout: 10_000 })
    .catch(async () => {
      await page.getByLabel('City').fill('Kullu');
      await page.getByLabel('State').fill('Himachal Pradesh');
    });
  await page.getByRole('checkbox', { name: /Send me updates about this order/ }).check();
  await page.waitForLoadState('networkidle');
}

for (const scheme of ['light', 'dark'] as const) {
  test(`checkout ${scheme}`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await seedConsentDeclined(page);
    await mockPayments(page);
    const p = info.project.name;

    await page.goto('/checkout');
    await expect(page.getByText('Your cart is empty')).toBeVisible();
    await shot(page, 'checkout-empty', p, scheme, false);

    await addJarAndFill(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, 'checkout', p, scheme);

    // Validation state
    await page.getByLabel('Full name').fill('');
    await page.getByTestId('pay-button').filter({ visible: true }).click();
    await expect(page.getByText('Enter your full name')).toBeVisible();
    await shot(page, 'checkout-validation', p, scheme, false);
  });
}

test('payment: mock dialog → fail → retry state', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedConsentDeclined(page);
  await mockPayments(page);
  const p = info.project.name;
  await addJarAndFill(page);
  await page.getByTestId('pay-button').filter({ visible: true }).click();
  const mock = page.getByTestId('mock-payment');
  await expect(mock).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, 'mock-payment-dialog', p, 'light', false);
  await mock.getByRole('button', { name: 'Fail payment' }).click();
  await expect(page.getByTestId('payment-retry')).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, 'payment-retry', p, 'light', false);
});

const ORDER_STATES: { name: string; data: Record<string, unknown>; paid?: boolean; testId: string }[] = [
  { name: 'order-confirmed', data: {}, testId: 'order-confirmed' },
  {
    name: 'order-confirming',
    data: {
      status: 'PENDING_PAYMENT',
      paymentStatus: 'UNPAID',
      confirmedAt: null,
      invoiceAvailable: false,
      canCancel: false,
    },
    paid: true,
    testId: 'order-confirming',
  },
  {
    name: 'order-expired',
    data: {
      status: 'EXPIRED',
      paymentStatus: 'UNPAID',
      confirmedAt: null,
      reservationExpiresAt: inMinutes(-5),
      invoiceAvailable: false,
      canCancel: false,
    },
    testId: 'order-expired',
  },
  {
    name: 'order-cancelled-refund',
    data: {
      status: 'CANCELLED',
      paymentStatus: 'REFUND_PENDING',
      cancelReason: 'LATE_PAYMENT_STOCKOUT',
      refund: { status: 'PENDING', amountPaise: 169700 },
      invoiceAvailable: false,
      canCancel: false,
    },
    testId: 'refund-notice',
  },
];

for (const scheme of ['light', 'dark'] as const) {
  test(`order states ${scheme}`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await seedConsentDeclined(page);
    const p = info.project.name;
    for (const state of ORDER_STATES) {
      await page.unroute('**/api/v1/orders/**');
      await page.route('**/api/v1/orders/**', (route) => ok(route, orderStatus(state.data)));
      await page.goto('/');
      await page.evaluate(
        ([code, paid]) => {
          sessionStorage.setItem(`pk-order-phone:${code}`, '+919876543210');
          if (paid) sessionStorage.setItem(`pk-order-paid:${code}`, '1');
          else sessionStorage.removeItem(`pk-order-paid:${code}`);
        },
        [CODE, state.paid ?? false] as const,
      );
      await page.goto(`/order/${CODE}`);
      await expect(page.getByTestId(state.testId)).toBeVisible();
      await page.waitForLoadState('networkidle');
      await shot(page, state.name, p, scheme);
    }
    // New device: no phone in this tab → the phone gate
    await page.unroute('**/api/v1/orders/**');
    await page.route('**/api/v1/orders/**', (route) =>
      route.fulfill({
        status: 404,
        headers: cors,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, data: null, error: { code: 'NOT_FOUND', message: 'Order not found' } }),
      }),
    );
    await page.evaluate((code) => sessionStorage.removeItem(`pk-order-phone:${code}`), CODE);
    await page.goto(`/order/${CODE}`);
    await expect(page.getByTestId('phone-gate')).toBeVisible();
    await shot(page, 'order-phone-gate', p, scheme, false);
  });
}
