import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, seedConsentDeclined } from './helpers';

/** Razorpay KYC readiness: every legal page + contact resolves from the footer; seller facts are shown. */
const LINKS = [
  { name: 'Privacy policy', path: '/privacy-policy', h1: 'Privacy policy' },
  { name: 'Terms of service', path: '/terms', h1: 'Terms of service' },
  { name: 'Refund & cancellation', path: '/refund-cancellation', h1: 'Refund & cancellation policy' },
  { name: 'Shipping policy', path: '/shipping-policy', h1: 'Shipping policy' },
  { name: 'Grievance redressal', path: '/grievance', h1: 'Grievance redressal' },
  { name: 'Contact', path: '/contact', h1: 'Contact us' },
];

test.beforeEach(async ({ page }) => {
  await seedConsentDeclined(page);
});

test('footer shows seller, FSSAI, GSTIN and grievance officer', async ({ page }) => {
  await page.goto('/');
  const seller = page.getByTestId('seller-details');
  for (const term of ['Sold by', 'Registered address', 'FSSAI Lic. No.', 'GSTIN', 'Grievance officer']) {
    await expect(seller.getByText(term, { exact: true })).toBeVisible();
  }
});

for (const link of LINKS) {
  test(`footer link "${link.name}" resolves`, async ({ page }) => {
    await page.goto('/');
    const footer = page.getByTestId('site-footer');
    await footer.getByRole('link', { name: link.name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${link.path}$`));
    await expect(page.getByRole('heading', { level: 1, name: link.h1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}

test('grievance page lists officer details and the 48 h / one month timelines', async ({ page }) => {
  await page.goto('/grievance');
  await expect(page.getByTestId('grievance-officer')).toBeVisible();
  await expect(page.getByText('acknowledge your complaint within 48 hours')).toBeVisible();
  await expect(page.getByText('resolve it within one month')).toBeVisible();
});
