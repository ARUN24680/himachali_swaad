import { expect, test, type Page } from '@playwright/test';
import { mockAdminApi, uuid } from './support/admin-api';
import { expectNoHorizontalOverflow } from './support/catalog-api';
import { mockDeskApi } from './support/desk-api';
import { evidenceShot } from './support/evidence';

/**
 * Phase 9 §9.1 — every admin page follows the Nexus 3-tier layout: ONE PageHeader → ONE KPI grid of
 * four summary cards → ONE TableCard (controls bar + table/list), with no nested padded wrappers and
 * no horizontal overflow at 375 / 768 / 1440. Light + dark.
 */
interface PageCase {
  path: string;
  heading: string | RegExp;
  /** Evidence file name (only the pages listed in the phase evidence). */
  shot?: string;
  /** Dark-mode phone shot too (main pages). */
  mainPage?: boolean;
  /** Something that proves data rendered inside the TableCard. */
  ready: (p: Page) => ReturnType<Page['getByText']>;
}

const PAGES: PageCase[] = [
  {
    path: '/',
    heading: 'Welcome back, Asha',
    shot: 'dashboard',
    mainPage: true,
    ready: (p) => p.getByText(/Last 30 days/),
  },
  { path: '/orders', heading: 'Orders', ready: (p) => p.getByText('Showing 1–25 of 32') },
  {
    path: '/customers',
    heading: 'Customers',
    shot: 'customers',
    mainPage: true,
    ready: (p) => p.getByText('Arun Kumar'),
  },
  {
    path: `/customers/${encodeURIComponent('+919876543210')}`,
    heading: 'Arun Kumar',
    shot: 'customer-detail',
    ready: (p) => p.getByText(/Showing|PK-/),
  },
  { path: '/products', heading: 'Products', ready: (p) => p.getByText('Himachali Chicken Pickle') },
  { path: '/batches', heading: 'Batches', shot: 'inventory-batches', ready: (p) => p.getByText(/CHK250-0/) },
  {
    path: '/batches?view=alerts',
    heading: 'Batches',
    shot: 'inventory-expiry-alerts',
    mainPage: true,
    ready: (p) => p.getByText(/to sell/),
  },
  {
    path: `/batches/${uuid(103)}/ledger`,
    heading: /^Ledger · PK-/,
    shot: 'inventory-ledger',
    ready: (p) => p.getByText('Reserved for order'),
  },
  {
    path: '/settings',
    heading: 'Settings',
    shot: 'settings',
    mainPage: true,
    ready: (p) => p.getByText('Checkout stock hold'),
  },
  { path: '/staff', heading: 'Staff', shot: 'staff', ready: (p) => p.getByText('Ramesh Thakur') },
  {
    path: '/expenses',
    heading: 'Expenses',
    shot: 'expenses',
    mainPage: true,
    ready: (p) => p.getByText('Shiprocket plan'),
  },
  { path: '/settlements', heading: 'Settlements', ready: (p) => p.getByText(/finalized, not paid/) },
  {
    path: `/settlements/${uuid(703)}`,
    heading: /–/,
    shot: 'settlement-draft',
    ready: (p) => p.getByText('Partner payout'),
  },
  { path: '/exports', heading: 'Exports', shot: 'exports', ready: (p) => p.getByText('GST summary') },
  { path: '/ops', heading: 'Queues & webhooks', shot: 'webhooks', ready: (p) => p.getByText('payment.captured') },
  {
    path: '/ops?view=queues',
    heading: 'Queues & webhooks',
    shot: 'queues',
    ready: (p) => p.getByTitle('Job queues (bull-board)'),
  },
  { path: '/audit-log', heading: 'Audit log', shot: 'audit-log', ready: (p) => p.getByText('Showing 1–50 of 60') },
];

async function expectThreeTier(page: Page) {
  const layout = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const header = main.querySelectorAll('[data-testid="page-header"]');
    const kpi = main.querySelectorAll('[data-testid="kpi-grid"]');
    const cards = main.querySelectorAll('[data-testid="table-card"]');
    const order =
      header.length && kpi.length && cards.length
        ? header[0]!.compareDocumentPosition(kpi[0]!) & Node.DOCUMENT_POSITION_FOLLOWING &&
          kpi[0]!.compareDocumentPosition(cards[0]!) & Node.DOCUMENT_POSITION_FOLLOWING
        : 0;
    const card = cards[0] as HTMLElement | undefined;
    const body = card?.querySelector(':scope > [data-slot="table-card-body"]') as HTMLElement | null;
    const cs = card ? getComputedStyle(card) : null;
    return {
      headers: header.length,
      kpiGrids: kpi.length,
      kpiCards: kpi[0]?.querySelectorAll('[data-testid="kpi-card"]').length ?? 0,
      tableCards: cards.length,
      nestedCards: main.querySelectorAll(
        '[data-testid="table-card"] [data-testid="table-card"], [data-testid="kpi-card"] [data-testid="kpi-card"]',
      ).length,
      inOrder: Boolean(order),
      cardPadding: cs?.paddingLeft,
      cardRadius: cs?.borderTopLeftRadius,
      // body bleeds to the card's border box → no second padded wrapper around the table
      bodyBleeds: card && body ? Math.abs(body.getBoundingClientRect().width - card.clientWidth) <= 1 : false,
      bodyPadding: body ? getComputedStyle(body).paddingLeft : null,
    };
  });
  expect(layout).toMatchObject({
    headers: 1,
    kpiGrids: 1,
    kpiCards: 4,
    tableCards: 1,
    nestedCards: 0,
    inOrder: true,
    cardPadding: '20px',
    cardRadius: '12px', // rounded-xl (Tailwind default 0.75rem = the --radius card token)
    bodyBleeds: true,
    bodyPadding: '0px',
  });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`every admin page renders the 3-tier layout without overflow (${scheme})`, async ({ page }, info) => {
    test.setTimeout(120_000);
    const phone = info.project.name === 'mobile-375';
    const tablet = info.project.name === 'tablet-768';
    test.skip(scheme === 'dark' && tablet, 'tablet: light only');
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await mockAdminApi(page);
    for (const c of PAGES) {
      await page.goto(c.path);
      await expect(page.getByRole('heading', { level: 1, name: c.heading })).toBeVisible();
      await expect(c.ready(page).filter({ visible: true }).first()).toBeVisible();
      await expectThreeTier(page);
      await expectNoHorizontalOverflow(page);
      const wanted = c.shot && (!phone || scheme === 'light' || c.mainPage) && (!tablet || c.mainPage);
      if (wanted) await evidenceShot(page, info, c.shot!, scheme);
    }
  });
}

test('KITCHEN_PARTNER cannot reach any admin console route (UX guard; API answers 403)', async ({ page, context }) => {
  // 11 navigations on the dev server: slow when the whole suite runs in parallel
  test.setTimeout(120_000);
  await mockDeskApi(page, context);
  const routes = [
    '/orders',
    '/orders/PK-7KQ240',
    '/customers',
    '/products',
    '/settings',
    '/staff',
    '/expenses',
    '/settlements',
    '/exports',
    '/audit-log',
    '/ops',
  ];
  for (const path of routes) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'This page isn’t part of your role' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole('link', { name: 'Orders' })).toHaveCount(0);
  }
  await page.goto('/');
  await expect(page).toHaveURL(/\/desk$/, { timeout: 20_000 });
  // And the API itself refuses (mock mirrors requireRole)
  const status = await page.evaluate(
    async () => (await fetch('http://localhost:4000/api/v1/admin/dashboard', { credentials: 'include' })).status,
  );
  expect(status).toBe(403);
});
