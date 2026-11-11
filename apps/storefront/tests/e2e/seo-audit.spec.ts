import { expect, test, type Page } from '@playwright/test';
import { seedConsentDeclined } from './helpers';

/** Audit 2026-11-03 R-17…R-20 + §5.3: structured data, canonicals, breadcrumbs and the journal. */
type Ld = Record<string, unknown> & { '@type'?: unknown; '@graph'?: Ld[] };

async function jsonLd(page: Page): Promise<Ld[]> {
  const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
  return raw.flatMap((text) => {
    const data = JSON.parse(text) as Ld; // throws → test fails on invalid JSON
    return data['@graph'] ? data['@graph'] : [data];
  });
}

const hasType = (node: Ld, type: string) =>
  Array.isArray(node['@type']) ? (node['@type'] as string[]).includes(type) : node['@type'] === type;

async function expectCanonical(page: Page, path: string) {
  const href = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(href, 'canonical').toBeTruthy();
  expect(new URL(href!).pathname).toBe(path);
}

test.beforeEach(async ({ page }) => {
  await seedConsentDeclined(page);
});

test('Organization + LocalBusiness JSON-LD is rendered site-wide', async ({ page }) => {
  await page.goto('/');
  const nodes = await jsonLd(page);
  expect(nodes.some((n) => hasType(n, 'Organization'))).toBe(true);
  expect(nodes.some((n) => hasType(n, 'LocalBusiness'))).toBe(true);
});

test('PDP has BreadcrumbList + Product JSON-LD, long-tail title and canonical', async ({ page }) => {
  await page.goto('/products');
  const href = await page.getByTestId('product-card').first().getByRole('link').first().getAttribute('href');
  expect(href).toMatch(/^\/products\//);
  await page.goto(href!);
  const nodes = await jsonLd(page);
  const crumbs = nodes.find((n) => hasType(n, 'BreadcrumbList'));
  expect(crumbs, 'BreadcrumbList').toBeTruthy();
  const items = crumbs!.itemListElement as { position: number; name: string; item: string }[];
  expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
  expect(items[0]!.name).toBe('Home');
  expect(new URL(items[2]!.item).pathname).toBe(href);
  expect(nodes.some((n) => hasType(n, 'Product'))).toBe(true);
  await expect(page).toHaveTitle(/Himachali (chicken|mutton|fish|prawn) pickle online/);
  await expectCanonical(page, href!);
});

for (const [path, name] of [
  ['/products', 'Pickles'],
  ['/about', 'Our story'],
  ['/faq', 'FAQ'],
  ['/contact', 'Contact'],
  ['/blog', 'Journal'],
] as const) {
  test(`${path} has BreadcrumbList JSON-LD and a canonical`, async ({ page }) => {
    await page.goto(path);
    const crumbs = (await jsonLd(page)).find((n) => hasType(n, 'BreadcrumbList'));
    expect(crumbs, 'BreadcrumbList').toBeTruthy();
    const items = crumbs!.itemListElement as { name: string }[];
    expect(items.at(-1)!.name).toBe(name);
    await expectCanonical(page, path);
  });
}

test('journal index lists articles and each article has Article JSON-LD + reading time', async ({ page }) => {
  await page.goto('/blog');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const cards = page.getByTestId('post-card');
  expect(await cards.count()).toBeGreaterThanOrEqual(2);
  const href = await cards.first().getByRole('link').getAttribute('href');
  await page.goto(href!);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByTestId('reading-time')).toHaveText(/\d+ min read/);
  const nodes = await jsonLd(page);
  const article = nodes.find((n) => hasType(n, 'Article'));
  expect(article, 'Article').toBeTruthy();
  expect(article!.headline).toBeTruthy();
  expect(article!.datePublished).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(nodes.some((n) => hasType(n, 'BreadcrumbList'))).toBe(true);
  await expectCanonical(page, href!);
});

test('sitemap lists the journal', async ({ page }) => {
  const xml = (await (await page.goto('/sitemap.xml'))?.text()) ?? '';
  expect(xml).toContain('/blog</loc>');
  expect(xml).toContain('/blog/how-traditional-kangra-pickle-is-made</loc>');
  expect(xml).toContain('/blog/how-to-store-himachali-non-veg-pickle</loc>');
});

test('unknown journal slug is a 404', async ({ page }) => {
  const res = await page.goto('/blog/no-such-article');
  expect(res?.status()).toBe(404);
});
