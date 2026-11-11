import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, seedConsentDeclined } from './helpers';

/**
 * Audit 2026-11-03 §4.2 — storefront UI fixes. Runs on the seeded demo catalogue at 375 / 768 / 1440.
 * The social block test assumes NEXT_PUBLIC_SOCIAL_*_URL are blank (dev default).
 */
test.beforeEach(async ({ page }) => {
  await seedConsentDeclined(page);
});

test('trust strip shows every compliance fact without page overflow', async ({ page }) => {
  await page.goto('/');
  const strip = page.getByTestId('trust-strip');
  await strip.scrollIntoViewIfNeeded();
  await expect(strip).toBeVisible();
  for (const term of ['FSSAI Lic. No.', 'GSTIN', 'Made in', 'In the jar', 'Payment', 'Food type']) {
    await expect(strip.getByText(term, { exact: true })).toBeAttached();
  }
  await expect(strip.getByText('Kangra, Himachal Pradesh')).toBeAttached();
  await expect(strip.getByText('No added preservatives')).toBeAttached();
  await expect(strip.getByText('100% non-vegetarian')).toBeAttached();
  // The mark is decorative here (the text says it), so it sits inside an aria-hidden medallion
  await expect(strip.locator('[role="img"][aria-label="Non-vegetarian"]')).toBeAttached();
  await expectNoHorizontalOverflow(page);
});

for (const path of ['/', '/products', '/about', '/faq', '/contact', '/blog']) {
  test(`no horizontal overflow on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
}

test('footer keeps legal links, seller facts, support hours, journal + payments line', async ({ page }) => {
  await page.goto('/');
  const footer = page.getByTestId('site-footer');
  for (const name of [
    'Privacy policy',
    'Terms of service',
    'Refund & cancellation',
    'Shipping policy',
    'Grievance redressal',
    'Journal',
  ]) {
    await expect(footer.getByRole('link', { name, exact: true })).toBeAttached();
  }
  await expect(footer.getByTestId('seller-details')).toBeAttached();
  await expect(footer.getByText(/support hours/i).first()).toBeAttached();
  await expect(footer.getByText(/Prepaid orders only/)).toBeAttached();
});

test('social block is hidden when no social URL is configured', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('site-footer')).toBeAttached();
  await expect(page.getByTestId('footer-social')).toHaveCount(0);
});

test('every product card has a stock line, a jar-size price unit and a descriptive photo alt', async ({ page }) => {
  await page.goto('/products');
  const cards = page.getByTestId('product-card');
  await expect(cards.first()).toBeVisible();
  const count = await cards.count();
  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    await expect(card.getByTestId('product-card-stock')).toHaveText(/In stock|Only \d+ jars? left|Sold out/);
    await expect(card.getByText(/\d+ (g|kg) jar/).first()).toBeAttached();
    const alt = await card.locator('img').first().getAttribute('alt');
    expect(alt?.trim(), 'card photo alt').toMatch(/, \d+ (g|kg) jar$/);
    const stock = await card.getAttribute('data-stock');
    const atc = card.getByRole('button', { name: /add to cart|sold out/i });
    if (stock === 'SOLD_OUT') await expect(atc).toBeDisabled();
    else await expect(atc).toBeEnabled();
  }
});

test('"Limited batch" tag only appears on low-stock cards', async ({ page }) => {
  await page.goto('/products');
  await expect(page.getByTestId('product-card').first()).toBeVisible();
  const tagged = page.getByTestId('product-card').filter({ hasText: 'Limited batch' });
  const n = await tagged.count();
  for (let i = 0; i < n; i++) await expect(tagged.nth(i)).toHaveAttribute('data-stock', 'LOW_STOCK');
});

test('pages show visible breadcrumbs', async ({ page }) => {
  for (const [path, current] of [
    ['/products', 'Pickles'],
    ['/about', 'Our story'],
    ['/faq', 'FAQ'],
    ['/contact', 'Contact'],
    ['/blog', 'Journal'],
  ] as const) {
    await page.goto(path);
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText(current);
  }
});

test('phone sticky CTA appears once the hero has scrolled away', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-375', 'phone-only bar (md:hidden)');
  await page.goto('/', { waitUntil: 'networkidle' });
  const bar = page.getByTestId('home-sticky-cta');
  await expect(bar).toBeHidden();
  // Past the hero AND the quick-shop cards (the bar hides while they are on screen)
  await page
    .getByRole('heading', { name: 'What goes into every jar' })
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await expect(bar).toBeVisible();
  await expect(bar.getByRole('link', { name: /Shop pickles/ })).toBeVisible();
});
