import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, seedConsentDeclined } from './helpers';

test('home renders hero, quick shop and pillars with no horizontal overflow', async ({ page }) => {
  await seedConsentDeclined(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Taste the mountains');
  // Both hero CTAs above the fold at every viewport
  const heroCtas = page.locator('#hero-ctas');
  await expect(heroCtas.getByRole('link', { name: 'Shop pickles' })).toBeInViewport();
  await expect(heroCtas.getByRole('link', { name: 'Our story' })).toBeInViewport();
  await expect(page.getByRole('heading', { name: 'Our non-veg pickles' })).toBeVisible();
  await expect(page.getByTestId('product-card').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'What goes into every jar' })).toBeVisible();
  // Pre-launch: no rating / "Verified Buyer" sample content on the home page
  await expect(page.getByText(/verified buyer/i)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('home quick-shop adds to cart from the card', async ({ page }) => {
  await seedConsentDeclined(page);
  await page.goto('/');
  const card = page.getByTestId('product-card').first();
  await card.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByTestId('cart-button')).toHaveAccessibleName('Cart, 1 jar');
});

test('unknown route shows the not-found page', async ({ page }) => {
  const res = await page.goto('/this-page-does-not-exist');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('unknown product slug is a 404 with a way back to the shop', async ({ page }) => {
  const res = await page.goto('/products/no-such-pickle-250g');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('link', { name: 'Browse all pickles' })).toBeVisible();
});

test('robots blocks private flows and sitemap lists products', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  for (const path of ['/checkout', '/order/', '/track', '/account']) expect(robots).toContain(`Disallow: ${path}`);
  const sitemap = await (await request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/privacy-policy');
  expect(sitemap).toMatch(/\/products\/[a-z0-9-]+/);
});
