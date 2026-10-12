import { expect, test, type Page } from '@playwright/test';
import { seedConsentDeclined } from './helpers';
import { CODE, PHONE_DIGITS, TRACK_STATES, mockAccount, mockTrack, type TrackState } from './tracking-mocks';

/**
 * Screenshot evidence for Phases/evidence/phase-08 (/track form + result states, My orders list +
 * detail) at 375 / 768 / 1440, light + dark. Opt-in:
 *   EVIDENCE=1 pnpm --filter @pk/storefront test:e2e phase8-evidence
 */
test.skip(!process.env.EVIDENCE, 'evidence screenshots only when EVIDENCE=1');

const DIR = '../../Phases/evidence/phase-08';
const shot = (page: Page, name: string, project: string, scheme: string, fullPage = true) =>
  page.screenshot({ path: `${DIR}/${name}-${project}-${scheme}.png`, fullPage });

for (const scheme of ['light', 'dark'] as const) {
  test(`track form ${scheme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await seedConsentDeclined(page);
    await mockAccount(page, { signedIn: false });
    await page.goto(`/track?code=${CODE}`);
    await expect(page.getByTestId('track-intro')).toBeVisible();
    await shot(page, 'track-form', info.project.name, scheme);
  });

  for (const state of Object.keys(TRACK_STATES) as TrackState[]) {
    test(`track ${state} ${scheme}`, async ({ page }, info) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await seedConsentDeclined(page);
      await mockAccount(page, { signedIn: false });
      await mockTrack(page, { state });
      await page.goto(`/track?code=${CODE}`);
      await page.getByLabel('Mobile number used at checkout').fill(PHONE_DIGITS);
      await page.getByRole('button', { name: 'Track order' }).click();
      await expect(page.getByTestId('track-result')).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, `track-${state}`, info.project.name, scheme);
    });
  }

  test(`my orders ${scheme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await seedConsentDeclined(page);
    await mockAccount(page, { signedIn: true, total: 12, canCancel: true });
    await page.goto('/account/orders');
    await expect(page.getByTestId('my-order-row')).toHaveCount(3);
    await shot(page, 'my-orders', info.project.name, scheme);
    await page.getByTestId('my-order-row').first().click();
    await expect(page.getByTestId('track-result')).toBeVisible();
    await shot(page, 'my-order-detail', info.project.name, scheme);
  });

  test(`my orders signed out ${scheme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await seedConsentDeclined(page);
    await mockAccount(page, { signedIn: false });
    await page.goto('/account/orders');
    await expect(page.getByRole('heading', { name: 'Sign in to see your orders' })).toBeVisible();
    await shot(page, 'my-orders-signed-out', info.project.name, scheme, false);
  });
}

test('track 429 + not found (light)', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedConsentDeclined(page);
  await mockAccount(page, { signedIn: false });
  await mockTrack(page);
  await page.goto(`/track?code=${CODE}`);
  await page.getByLabel('Mobile number used at checkout').fill('9123456780');
  await page.getByRole('button', { name: 'Track order' }).click();
  await expect(page.getByTestId('track-not-found')).toBeVisible();
  await shot(page, 'track-not-found', info.project.name, 'light', false);
  await page.unroute('**/api/v1/track');
  await mockTrack(page, { rateLimited: true });
  await page.getByRole('button', { name: 'Track order' }).click();
  await expect(page.getByTestId('track-rate-limited')).toBeVisible();
  await shot(page, 'track-rate-limited', info.project.name, 'light', false);
});
