import { expect, test, type Page } from '@playwright/test';
import { seedConsentDeclined } from './helpers';

/**
 * Screenshot evidence for Phases/evidence/phase-04 (light + dark × 375/768/1440).
 * Opt-in: EVIDENCE=1 pnpm --filter @pk/storefront test:e2e phase4-evidence
 */
test.skip(!process.env.EVIDENCE, 'evidence screenshots only when EVIDENCE=1');

const DIR = '../../Phases/evidence/phase-04';
const shot = (page: Page, name: string, project: string, scheme: string, fullPage = true) =>
  page.screenshot({ path: `${DIR}/${name}-${project}-${scheme}.png`, fullPage });

for (const scheme of ['light', 'dark'] as const) {
  test(`pages ${scheme}`, async ({ page }, info) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await seedConsentDeclined(page);
    const p = info.project.name;

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await shot(page, 'home', p, scheme);

    await page.goto('/products');
    await page.waitForLoadState('networkidle');
    await shot(page, 'products', p, scheme);

    await page.goto('/products/himachali-chicken-pickle-250g');
    await page.waitForLoadState('networkidle');
    await shot(page, 'product-detail', p, scheme);

    await page.getByRole('button', { name: 'Add to cart' }).first().click();
    await page.goto('/products');
    await page.getByTestId('product-card').nth(1).getByRole('radio', { name: '500 g jar' }).click();
    await page.getByTestId('product-card').nth(1).getByRole('button', { name: 'Add to cart' }).click();
    await page.getByTestId('cart-button').click();
    await expect(page.getByTestId('cart-line')).toHaveCount(2);
    await page.waitForTimeout(500);
    await shot(page, 'cart-drawer', p, scheme, false);

    await page.goto('/refund-cancellation');
    await page.waitForLoadState('networkidle');
    await shot(page, 'legal-refund', p, scheme);
  });
}

test('consent banner + mobile sticky add-to-cart', async ({ page }, info) => {
  const p = info.project.name;
  await page.goto('/products/pahadi-mutton-pickle-250g');
  await page.waitForLoadState('networkidle');
  await shot(page, 'consent-banner', p, 'light', false);
  await page.getByRole('button', { name: 'Reject all' }).click();
  if (p === 'mobile-375') {
    await page.mouse.wheel(0, 1400);
    await expect(page.getByTestId('sticky-atc')).toHaveAttribute('aria-hidden', 'false');
    await page.waitForTimeout(400);
    await shot(page, 'sticky-atc', p, 'light', false);
  }
});
