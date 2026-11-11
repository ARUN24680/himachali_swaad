import { expect, test, type Page, type Route } from '@playwright/test';
import { expectNoHorizontalOverflow, seedConsentDeclined } from './helpers';

/**
 * Coming-soon waitlist (audit R-5, D-61). `POST /api/v1/waitlist` is mocked with page.route so the
 * spec does not depend on the backend route or its rate limit.
 */
const FORBIDDEN = /pickle|chicken|mutton|fish|trout|non-veg|nonveg|non veg/i;

const envelope = (data: unknown) => ({
  success: true,
  data,
  error: null,
  requestId: 'req_test',
  timestamp: new Date().toISOString(),
});
const failure = (code: string, message: string, extra: Record<string, unknown> = {}) => ({
  success: false,
  data: null,
  error: { code, message, ...extra },
  requestId: 'req_test',
  timestamp: new Date().toISOString(),
});

async function mockWaitlist(page: Page, handler: (route: Route) => Promise<void>) {
  const bodies: unknown[] = [];
  await page.route('**/api/v1/waitlist', async (route) => {
    if (route.request().method() === 'POST') bodies.push(route.request().postDataJSON());
    await handler(route);
  });
  return bodies;
}

/** Wait for the client bundle so typing/ticking isn't lost to hydration on a cold dev server. */
async function openTeaser(page: Page) {
  await page.goto('/coming-soon', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('waitlist-form')).toBeVisible();
}

async function fillAndSubmit(page: Page, contact: string, { consent = true, name = '' } = {}) {
  const form = page.getByTestId('waitlist-form');
  await form.getByLabel('Mobile number or e-mail').fill(contact);
  if (name) await form.getByLabel(/First name/).fill(name);
  if (consent) await form.getByRole('checkbox').check();
  await form.getByRole('button', { name: /Tell me first|Try again/ }).click();
}

test.beforeEach(async ({ page }) => {
  await seedConsentDeclined(page);
});

test('teaser never names the product and has no overflow', async ({ page }) => {
  await page.goto('/coming-soon');
  await expect(page.getByTestId('waitlist-form')).toBeVisible();
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(FORBIDDEN);
  expect(await page.title()).not.toMatch(FORBIDDEN);
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  expect(description ?? '').not.toMatch(FORBIDDEN);
  await expectNoHorizontalOverflow(page);
});

test('phone sign-up succeeds and sends a normalised E.164 number with consent', async ({ page }) => {
  const bodies = await mockWaitlist(page, (r) => r.fulfill({ json: envelope({ joined: true, alreadyJoined: false }) }));
  await openTeaser(page);
  await fillAndSubmit(page, '98765 43210', { name: 'Asha' });
  await expect(page.getByTestId('waitlist-success')).toContainText('You’re on the list.');
  expect(bodies[0]).toMatchObject({ phone: '+919876543210', name: 'Asha', consent: true, source: 'coming-soon' });
  expect(await page.locator('body').innerText()).not.toMatch(FORBIDDEN);
});

test('e-mail sign-up already on the list shows the friendly "already" state', async ({ page }) => {
  const bodies = await mockWaitlist(page, (r) => r.fulfill({ json: envelope({ joined: true, alreadyJoined: true }) }));
  await openTeaser(page);
  await fillAndSubmit(page, 'Asha@Example.in');
  await expect(page.getByTestId('waitlist-success')).toContainText('already on the list');
  expect(bodies[0]).toMatchObject({ email: 'asha@example.in', consent: true });
});

test('consent is required and invalid contact is caught before any request', async ({ page }) => {
  const bodies = await mockWaitlist(page, (r) => r.fulfill({ json: envelope({ joined: true, alreadyJoined: false }) }));
  await openTeaser(page);
  await fillAndSubmit(page, '12345', { consent: false });
  await expect(page.getByText('Enter a 10-digit mobile number or an e-mail address')).toBeVisible();
  await expect(page.getByText(/Tick the box/)).toBeVisible();
  expect(bodies).toHaveLength(0);
});

test('429 shows a countdown and disables the button', async ({ page }) => {
  await mockWaitlist(page, (r) =>
    r.fulfill({
      status: 429,
      headers: { 'retry-after': '42' },
      json: failure('RATE_LIMITED', 'Too many requests', { details: { retryAfterSeconds: 42 } }),
    }),
  );
  await openTeaser(page);
  await fillAndSubmit(page, '9876543210');
  await expect(page.getByTestId('waitlist-rate-limited')).toBeVisible();
  await expect(page.getByTestId('waitlist-form').getByRole('button', { name: /Tell me first/ })).toBeDisabled();
});

test('400 shows the server message on the field', async ({ page }) => {
  await mockWaitlist(page, (r) =>
    r.fulfill({ status: 400, json: failure('VALIDATION_ERROR', 'Enter a valid e-mail address') }),
  );
  await openTeaser(page);
  await fillAndSubmit(page, 'asha@example.in');
  await expect(page.getByRole('alert').filter({ hasText: 'Enter a valid e-mail address' })).toBeVisible();
  await expect(page.getByTestId('waitlist-success')).toHaveCount(0);
});

test('network failure offers a retry', async ({ page }) => {
  await mockWaitlist(page, (r) => r.abort('internetdisconnected'));
  await openTeaser(page);
  await fillAndSubmit(page, '9876543210');
  await expect(page.getByTestId('waitlist-error')).toBeVisible();
  await expect(page.getByTestId('waitlist-form').getByRole('button', { name: 'Try again' })).toBeEnabled();
});
