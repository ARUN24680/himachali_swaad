import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, seedConsentDeclined } from './helpers';
import { CODE, mockAccount } from './tracking-mocks';

/**
 * /account/orders + /account/orders/[code] (Phase 8 §8.3, D-18). /auth/me and /me/orders are mocked
 * (contract: packages/shared/src/contracts/tracking.ts); the sign-in sheet is the existing Phase 2 one.
 */
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedConsentDeclined(page);
});

test('signed out → sign-in prompt opens the OTP sheet', async ({ page }) => {
  await mockAccount(page, { signedIn: false });
  await page.goto('/account/orders');
  await expect(page.getByRole('heading', { name: 'Sign in to see your orders' })).toBeVisible();
  await page.getByTestId('orders-sign-in').click();
  await expect(page.getByRole('dialog', { name: 'Sign in with your mobile number' })).toBeVisible();
});

test('my orders list → detail → shared timeline, totals, invoice + cancel', async ({ page }) => {
  await mockAccount(page, { signedIn: true, total: 12, canCancel: true });
  await page.goto('/account/orders');
  await expect(page.getByRole('heading', { level: 1, name: 'My orders' })).toBeVisible();
  await expect(page.getByText(/Orders placed with/)).toContainText('3210');
  const rows = page.getByTestId('my-order-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText(CODE);
  await expect(rows.first()).toContainText('In transit');
  await expect(rows.first()).toContainText('₹1,697');
  await expect(rows.first()).toContainText('+ 1 more');
  await expect(page.getByText('Page 1 of 2')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Older' })).toHaveAttribute('href', '/account/orders?page=2');
  await expectNoHorizontalOverflow(page);

  await rows.first().click();
  await expect(page).toHaveURL(new RegExp(`/account/orders/${CODE}$`));
  await expect(page.getByRole('heading', { level: 1, name: 'On its way to Chennai' })).toBeVisible();
  await expect(page.getByTestId('journey-step')).toHaveCount(7);
  await expect(page.getByTestId('journey-step').nth(4)).toHaveAttribute('data-state', 'current');
  await expect(page.getByTestId('my-order-total')).toHaveText('₹1,697');
  await expect(page.getByTestId('track-result').getByText('MRP inclusive of all taxes')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download invoice' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel order' })).toBeVisible();
  await expect(page.getByTestId('support-cta')).toContainText(CODE);
  await expectNoHorizontalOverflow(page);
});

test('no orders yet', async ({ page }) => {
  await mockAccount(page, { signedIn: true, empty: true });
  await page.goto('/account/orders');
  await expect(page.getByRole('heading', { name: 'No orders yet' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Shop the current batch' })).toBeVisible();
});

test('account menu has a My orders entry', async ({ page }) => {
  await mockAccount(page, { signedIn: true });
  await page.goto('/');
  await page.getByRole('button', { name: /Account menu/ }).click();
  await expect(page.getByRole('menuitem', { name: 'My orders' })).toHaveAttribute('href', '/account/orders');
});
