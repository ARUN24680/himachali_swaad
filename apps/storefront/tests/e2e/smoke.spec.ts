import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, seedConsentDeclined } from './helpers';

test('home renders hero, pillars and products with no horizontal overflow', async ({ page }) => {
  await seedConsentDeclined(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Taste the mountains');
  await expect(page.getByRole('link', { name: 'Taste the Mountains' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Three pillars of purity' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
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
