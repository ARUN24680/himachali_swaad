import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, seedConsentDeclined } from './helpers';
import { CODE, PHONE_DIGITS, mockAccount, mockTrack, ok } from './tracking-mocks';

/**
 * /track (Phase 8 §8.2, D-39). POST /api/v1/track is mocked with page.route (contract:
 * packages/shared/src/contracts/tracking.ts) so every status, the generic 404 and the 429 are reachable.
 */
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedConsentDeclined(page);
  await mockAccount(page, { signedIn: false });
});

async function lookUp(page: Page, phone = PHONE_DIGITS, code?: string) {
  if (code !== undefined) await page.getByLabel('Order code').fill(code);
  await page.getByLabel('Mobile number used at checkout').fill(phone);
  await page.getByRole('button', { name: 'Track order' }).click();
}

test('empty state, ?code prefill, phone typed by the user, noindex', async ({ page }) => {
  await page.goto(`/track?code=pk-7kq2m9`);
  await expect(page.getByRole('heading', { level: 1, name: 'Track your order' })).toBeVisible();
  await expect(page.getByLabel('Order code')).toHaveValue(CODE);
  await expect(page.getByLabel('Mobile number used at checkout')).toHaveValue('');
  await expect(page.getByTestId('track-intro')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expectNoHorizontalOverflow(page);
});

test('client validation: nothing is sent for a malformed code or phone', async ({ page }) => {
  const calls = await mockTrack(page);
  await page.goto('/track');
  await lookUp(page, '12345', 'hello');
  await expect(page.getByText('Order codes look like PK-7KQ2M9')).toBeVisible();
  await expect(page.getByText('Enter a valid 10-digit Indian mobile number')).toBeVisible();
  expect(calls).toHaveLength(0);
});

test('lookup → journey in time order, courier link, WhatsApp CTA with the code, phone never in the URL', async ({
  page,
}) => {
  const calls = await mockTrack(page, { state: 'in-transit' });
  await page.goto(`/track?code=${CODE}`);
  await lookUp(page);

  await expect(page.getByTestId('track-result')).toBeVisible();
  await expect(page.getByTestId('shipment-status')).toHaveText('In transit');
  await expect(page.getByRole('heading', { name: 'On its way to Chennai' })).toBeFocused();
  await expect(page.getByTestId('arrival-date')).toContainText('14 Oct');

  // Server timeline (two hub scans folded into one node) + upcoming milestones, in order
  const steps = page.getByTestId('journey-step');
  await expect(steps).toHaveCount(7);
  expect(
    await steps.evaluateAll((els) => els.map((e) => `${e.getAttribute('data-key')}:${e.getAttribute('data-state')}`)),
  ).toEqual([
    'BOTTLED:done',
    'CONFIRMED:done',
    'PACKED:done',
    'HANDED_TO_COURIER:done',
    'IN_TRANSIT:current',
    'OUT_FOR_DELIVERY:upcoming',
    'DELIVERED:upcoming',
  ]);
  await expect(steps.nth(4)).toContainText('Delhi hub');
  await expect(steps.nth(4)).toContainText('1 earlier scan');
  await expect(steps.nth(6)).toContainText('Expected by');

  // Items: batch code + bottled date (compliance / provenance)
  await expect(page.getByTestId('shipment-item').first()).toContainText('Batch PK-2610-CHK250-01');
  await expect(page.getByTestId('shipment-item').first()).toContainText('Bottled in Himachal on 4 Oct 2026');

  const courier = page.getByTestId('courier-link');
  await expect(courier).toHaveAttribute('href', 'https://www.delhivery.com/track/package/1490810293847');
  await expect(courier).toHaveAttribute('target', '_blank');
  await expect(courier).toHaveAttribute('rel', /noopener/);
  await expect(page.getByTestId('awb')).toHaveText('1490810293847');

  // WhatsApp CTA: wa.me link with the code pre-filled — or, until the number is published, /contact + the code
  const cta = page.getByTestId('support-cta');
  await expect(cta).toContainText('Parcel ke baare me help chahiye?');
  await expect(cta).toContainText(CODE);
  const wa = cta.getByTestId('support-whatsapp');
  if (await wa.count()) {
    const href = (await wa.getAttribute('href'))!;
    expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/);
    expect(decodeURIComponent(href.split('text=')[1]!)).toContain(CODE);
    await expect(wa).toHaveAttribute('rel', /noopener/);
  } else {
    await expect(cta.getByTestId('support-contact')).toHaveAttribute('href', '/contact');
  }

  // The phone went in the POST body only
  expect(calls).toEqual([{ orderCode: CODE, phone: `+91${PHONE_DIGITS}` }]);
  expect(page.url()).not.toContain(PHONE_DIGITS);
  expect(page.url()).toContain(`code=${CODE}`);
  await expectNoHorizontalOverflow(page);

  // Desktop: horizontal stepper (all nodes on one row)
  if (page.viewportSize()!.width >= 1024) {
    const ys = await steps.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(ys).size).toBe(1);
  } else {
    const xs = await steps.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
    expect(new Set(xs).size).toBe(1);
  }
});

test('wrong phone → the same generic not-found message', async ({ page }) => {
  await mockTrack(page);
  await page.goto(`/track?code=${CODE}`);
  await lookUp(page, '9123456780');
  await expect(page.getByTestId('track-not-found')).toContainText('check the order code');
  await expect(page.getByTestId('track-result')).toHaveCount(0);
  expect(page.url()).not.toContain('9123456780');
});

test('429 → wait message with time, submit disabled', async ({ page }) => {
  await mockTrack(page, { rateLimited: true });
  await page.goto(`/track?code=${CODE}`);
  await lookUp(page);
  await expect(page.getByTestId('track-rate-limited')).toContainText('try again in 7 minutes');
  await expect(page.getByRole('button', { name: 'Track order' })).toBeDisabled();
});

test('delivered, delivery failed and cancelled + refund states', async ({ page }) => {
  for (const [state, check] of [
    [
      'delivered',
      async () => {
        await expect(page.getByTestId('arrival-panel')).toContainText('Delivered on');
        await expect(page.locator('[data-testid="journey-step"][data-state="upcoming"]')).toHaveCount(0);
      },
    ],
    [
      'delivery-failed',
      async () => {
        await expect(page.getByTestId('delivery-failed')).toBeVisible();
        await expect(page.getByTestId('support-cta')).toContainText(CODE);
      },
    ],
    [
      'cancelled-refund',
      async () => {
        await expect(page.getByTestId('refund-card')).toContainText('Refund of ₹1,697 completed');
        await expect(page.getByTestId('courier-card')).toContainText('No courier shipment');
        await expect(page.getByTestId('arrival-panel')).toHaveCount(0);
      },
    ],
  ] as const) {
    await page.unroute('**/api/v1/track');
    await mockTrack(page, { state });
    await page.goto(`/track?code=${CODE}`);
    await lookUp(page);
    await expect(page.getByTestId('track-result')).toBeVisible();
    await check();
    await expectNoHorizontalOverflow(page);
  }
});

test('/order/[code] links to /track with the code', async ({ page }) => {
  await page.route(`**/api/v1/orders/${CODE}/status**`, (route) =>
    ok(route, {
      orderCode: CODE,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      items: [],
      subtotalPaise: 44900,
      shippingFeePaise: 0,
      totalPaise: 44900,
      shippingCity: 'Chennai',
      createdAt: '2026-10-08T04:25:00.000Z',
      confirmedAt: '2026-10-08T04:30:00.000Z',
      reservationExpiresAt: '2026-10-08T04:40:00.000Z',
      cancelReason: null,
      refund: null,
      invoiceAvailable: false,
      canCancel: false,
      retryPayment: null,
      whatsappOptIn: false,
    }),
  );
  await page.addInitScript(
    ([code, phone]) => sessionStorage.setItem(`pk-order-phone:${code}`, phone!),
    [CODE, `+91${PHONE_DIGITS}`],
  );
  await page.goto(`/order/${CODE}`);
  await expect(page.getByTestId('order-track-link')).toHaveAttribute('href', `/track?code=${CODE}`);
});
