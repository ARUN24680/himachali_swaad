import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { expectNoHorizontalOverflow } from './support/catalog-api';
import { mockDeskApi } from './support/desk-api';

/**
 * Phase 7 — Kitchen Partner Packing Desk PWA (`/desk/*`). API MOCKED (page.route; fixtures + responses
 * parsed by the @pk/shared partner contracts). Runs at 375 / 768 / 1440 (+ a 414 block on the
 * mobile project). Evidence screenshots → Phases/evidence/phase-07/.
 * (The phase file names this `desk.e2e.ts`; the repo convention / Playwright testDir use `*.spec.ts`.)
 */
const EVIDENCE = fileURLToPath(new URL('../../../../Phases/evidence/phase-07/', import.meta.url));
const width = (page: Page) => page.viewportSize()?.width ?? 0;
const isMobile = (info: TestInfo) => info.project.name.startsWith('mobile');

/** Evidence: every shot on phones; only `wide` shots at 768 / 1440. */
async function shot(page: Page, info: TestInfo, name: string, scheme: string, wide = false) {
  if (!isMobile(info) && !wide) return;
  await page.screenshot({ path: `${EVIDENCE}desk-${name}-${width(page)}-${scheme}.png`, fullPage: true });
}

/** Every visible button / link in the desk is ≥ 44 px tall (Rules §1.1, Phase 7 §7.4). */
async function expectTouchTargets(page: Page) {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('main button, main a, nav a, header button, header a')]
      .filter((el) => el.offsetParent !== null && !el.classList.contains('sr-only'))
      // A checkbox's tap target is its whole label row
      .map((el) => (el.getAttribute('role') === 'checkbox' ? (el.closest('label') ?? el) : el))
      .map((el) => ({
        text: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim(),
        h: el.getBoundingClientRect().height,
      }))
      .filter((x) => x.h > 0 && x.h < 44),
  );
  expect(small, `touch targets under 44px: ${JSON.stringify(small)}`).toEqual([]);
}

/** Record Web Share calls (headless Chromium has no share sheet). */
async function stubShare(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: { name: string; type: string; size: number; title?: string }[] };
    w.__shared = [];
    Object.defineProperty(navigator, 'canShare', { value: (d: { files?: File[] }) => Boolean(d.files?.length) });
    Object.defineProperty(navigator, 'share', {
      value: async (d: { files: File[]; title?: string }) => {
        for (const f of d.files) w.__shared.push({ name: f.name, type: f.type, size: f.size, title: d.title });
      },
    });
  });
}
const shared = (page: Page) =>
  page.evaluate(() => (window as unknown as { __shared: { name: string; type: string }[] }).__shared);

const card = (page: Page, code: string) => page.locator(`article[data-order="${code}"]`);
const markPackedButton = (page: Page) => page.getByRole('button', { name: '✅ Pack ho gaya' });

async function tickAll(page: Page) {
  const boxes = page.getByRole('checkbox');
  await expect(boxes).toHaveCount(6);
  for (let i = 0; i < 6; i++) await boxes.nth(i).check();
  await expect(markPackedButton(page)).toBeEnabled();
}

for (const scheme of ['light', 'dark'] as const) {
  test(`queue → checklist → print / share / A4 → mark packed (${scheme})`, async ({ page, context }, info) => {
    await page.emulateMedia({ colorScheme: scheme });
    await stubShare(page);
    const api = await mockDeskApi(page, context);

    // KITCHEN_PARTNER lands on the desk; Hindi by default
    await page.goto('/');
    await expect(page).toHaveURL(/\/desk$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Aaj ke orders\s*—\s*3 pack karne hain/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi-Latn');
    const first = card(page, 'PK-7KQ2M9');
    await expect(first.getByText('PK-2610-CHK250-02 × 1')).toBeVisible(); // allocated batch → right jar
    await expect(first.getByText('Der ho gayi — abhi pack karein')).toBeVisible();
    await expect(first).toContainText('Arun · Chennai, Tamil Nadu'); // first name + city only (D-40)
    await expect(card(page, 'PK-5MM8T2').getByText('Label ban raha hai')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await shot(page, info, 'queue', scheme, true);

    // Pack screen: Mark Packed stays disabled until all 6 SOP steps are ticked
    await first.getByRole('link', { name: /Ye order pack karein/ }).click();
    await expect(page).toHaveURL(/\/desk\/pack\/PK-7KQ2M9$/);
    await expect(markPackedButton(page)).toBeDisabled();
    const boxes = page.getByRole('checkbox');
    await expect(boxes).toHaveCount(6);
    for (let i = 0; i < 5; i++) await boxes.nth(i).check();
    await expect(markPackedButton(page)).toBeDisabled();
    await expect(page.getByText('6 mein se 5 ho gaye')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shot(page, info, 'checklist-partial', scheme, true);

    // Ticks survive closing the app
    await page.reload();
    await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(5);
    await boxes.nth(5).check();
    await expect(markPackedButton(page)).toBeEnabled();
    await expectTouchTargets(page);
    await shot(page, info, 'checklist-complete', scheme, true);

    // 🖨️ Print → the signed 4×6 PDF opens in a new tab
    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: '🖨️ Label Print karein' }).click();
    const tab = await popup;
    // Headless Chromium downloads the PDF instead of rendering it — assert the tab fetched the signed URL
    await expect.poll(() => api.labelRequests).toContainEqual(expect.stringMatching(/label-PK-7KQ2M9\.pdf\?sig=e2e/));
    await tab.close().catch(() => undefined);

    // 📲 Share → the PDF FILE goes to the share sheet
    await page.getByRole('button', { name: '📲 Label Share karein' }).click();
    await expect
      .poll(() => shared(page))
      .toEqual([expect.objectContaining({ name: 'PK-7KQ2M9-label.pdf', type: 'application/pdf' })]);

    // ✅ Mark packed → back to the queue, card slides out, count drops (optimistic)
    await markPackedButton(page).click();
    await expect(page).toHaveURL(/\/desk$/);
    await expect(card(page, 'PK-7KQ2M9')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/2 pack karne hain/);
    await expect(page.locator('[data-slot="toast-title"]', { hasText: 'PK-7KQ2M9 pack ho gaya' })).toBeVisible();
    expect(api.markPacked).toHaveLength(1);
    expect(api.markPacked[0]).toMatchObject({ orderCode: 'PK-7KQ2M9', status: 200 });
    expect(api.markPacked[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    await shot(page, info, 'mark-packed-success', scheme);

    // A4 4-up sheet for the cyber café: only orders with a ready label can be picked
    await page.getByRole('button', { name: 'A4 sheet' }).click();
    await expect(page.getByRole('checkbox', { name: 'PK-5MM8T2 ko A4 sheet mein jodein' })).toBeDisabled();
    await page.getByRole('checkbox', { name: 'PK-6AB19C ko A4 sheet mein jodein' }).check();
    await expect(page.getByText('1 chune gaye')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shot(page, info, 'a4-select', scheme);
    const a4 = page.waitForEvent('popup');
    await page.getByRole('button', { name: '🖨️ A4 sheet print karein' }).click();
    await a4;
    await expect.poll(() => api.labelRequests).toContainEqual(expect.stringMatching(/a4-PK-6AB19C\.pdf/));

    // Packed + Pickup tabs: reprint labels, pickup manifest print/share
    await page.getByRole('button', { name: 'Ho gaya' }).click();
    await page.getByRole('tab', { name: 'Pack ho gaye' }).click();
    await expect(card(page, 'PK-7KQ2M9')).toBeVisible();
    await page.getByRole('tab', { name: 'Pickup' }).click();
    await expect(page.getByRole('heading', { name: 'Pickup manifest' })).toBeVisible();
    await page.getByRole('button', { name: '📲 Share' }).click();
    await expect
      .poll(async () => (await shared(page)).map((s) => s.name))
      .toContain(`manifest-KULLU-01-${new Date().toISOString().slice(0, 10)}.pdf`);
    await expectNoHorizontalOverflow(page);
    await shot(page, info, 'pickup-manifests', scheme);
  });
}

test('offline Mark Packed queues, then syncs on reconnect with the SAME Idempotency-Key', async ({
  page,
  context,
}, info) => {
  const api = await mockDeskApi(page, context);
  await page.goto('/desk');
  await card(page, 'PK-6AB19C')
    .getByRole('link', { name: /Ye order pack karein/ })
    .click();
  await tickAll(page);

  await context.setOffline(true);
  await expect(page.getByText('Internet nahi hai? Phir bhi pack mark karein')).toBeVisible();
  await markPackedButton(page).click();
  await expect(page).toHaveURL(/\/desk$/);
  await expect(card(page, 'PK-6AB19C')).toHaveCount(0);
  const badge = page.getByRole('button', { name: /⏳ Sync pending \(1\)/ });
  await expect(badge).toBeVisible();
  await expect(page.getByText(/Internet nahi hai\. Packing chalti rahegi/)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/2 pack karne hain/);
  await expectNoHorizontalOverflow(page);
  await shot(page, info, 'offline-sync-pending', 'light', true);

  // The queued call sits in IndexedDB under its Idempotency-Key
  const queued = await page.evaluate(
    () =>
      new Promise<{ key: string; orderCode: string; status: string }[]>((resolve, reject) => {
        const open = indexedDB.open('pk-desk');
        open.onsuccess = () => {
          const req = open.result.transaction('outbox').objectStore('outbox').getAll();
          req.onsuccess = () => resolve(req.result as { key: string; orderCode: string; status: string }[]);
          req.onerror = () => reject(req.error);
        };
        open.onerror = () => reject(open.error);
      }),
  );
  expect(queued).toEqual([expect.objectContaining({ orderCode: 'PK-6AB19C', status: 'pending' })]);
  const key = queued[0]!.key;
  expect(api.markPacked.filter((c) => c.status === 200)).toHaveLength(0);

  await context.setOffline(false);
  await expect(page.locator('[data-slot="toast-title"]', { hasText: 'PK-6AB19C sync ho gaya' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sync pending/ })).toHaveCount(0);
  const successes = api.markPacked.filter((c) => c.orderCode === 'PK-6AB19C' && c.status === 200);
  expect(successes).toHaveLength(1); // exactly one transition
  expect(api.markPacked.filter((c) => c.orderCode === 'PK-6AB19C').every((c) => c.key === key)).toBe(true);
  await expect(card(page, 'PK-6AB19C')).toHaveCount(0);
});

test('a cancelled order shows "Ye order cancel ho chuka hai — pack mat karein"', async ({ page, context }, info) => {
  await mockDeskApi(page, context, { cancelled: ['PK-6AB19C'] });
  await page.goto('/desk');
  await card(page, 'PK-6AB19C')
    .getByRole('link', { name: /Ye order pack karein/ })
    .click();
  await tickAll(page);
  await markPackedButton(page).click();
  await expect(page).toHaveURL(/\/desk$/);
  const alert = page
    .getByRole('alert')
    .filter({ hasText: 'PK-6AB19C: Ye order cancel ho chuka hai — pack mat karein' });
  await expect(alert).toBeVisible();
  await expect(card(page, 'PK-6AB19C')).toHaveCount(0); // server no longer lists it
  await shot(page, info, 'cancelled-order', 'light');
  await alert.getByRole('button', { name: 'Theek hai' }).click();
  await expect(alert).toHaveCount(0);
});

test('Hindi ↔ English toggle on every desk screen (persisted)', async ({ page, context }, info) => {
  // Six screens × navigation + toggles: well over 30 s on CI's cold Vite dev server
  test.setTimeout(120_000);
  await mockDeskApi(page, context);
  const screens: { path: string; hi: string; en: string }[] = [
    { path: '/desk', hi: 'Aaj ke orders', en: 'Today’s orders' },
    { path: '/desk/pack/PK-7KQ2M9', hi: '3. Packing checklist', en: '3. Packing checklist' },
    { path: '/desk/batches', hi: 'Kaunsa achaar?', en: 'Which pickle?' },
    { path: '/desk/batches?tab=stock', hi: 'Mera stock', en: 'My stock' },
    { path: '/desk/hisaab', hi: 'Jaldi aa raha hai', en: 'Coming soon' },
    { path: '/desk/settings', hi: 'Naye order ka alert', en: 'New order alerts' },
  ];
  for (const s of screens) {
    await page.goto(s.path);
    await expect(page.getByText(s.hi).first()).toBeVisible();
    await page.getByRole('button', { name: 'Bhasha badlein: English' }).click();
    await expect(page.getByText(s.en).first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expectNoHorizontalOverflow(page);
    if (s.path === '/desk/settings') await shot(page, info, 'settings-english', 'light', true);
    if (s.path === '/desk') await shot(page, info, 'queue-english', 'light');
    await page.getByRole('button', { name: 'Change language to Hindi' }).click();
    await expect(page.getByText(s.hi).first()).toBeVisible();
  }
  // The choice is remembered on this phone
  await page.getByRole('button', { name: 'Bhasha badlein: English' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('New order alerts')).toBeVisible();
});

test('settings / onboarding: push not configured → WhatsApp note; install guide incl. iOS', async ({
  page,
  context,
}, info) => {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await mockDeskApi(page, context, { vapidPublicKey: null });
    await page.goto('/desk/settings');
    await expect(
      page.getByText('Server par phone alert abhi set nahi hain — naye order WhatsApp par aayenge.'),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'iPhone / iPad' })).toBeVisible();
    await expect(page.getByText('“Add to Home Screen” chunein, phir “Add”.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectTouchTargets(page);
    await shot(page, info, 'settings', scheme, true);
  }
});

test('mobile batch logger: 50 jars in < 30 s, big code + Copy, own stock list', async ({ page, context }, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const api = await mockDeskApi(page, context);
  await page.goto('/desk/batches');
  const started = Date.now();
  await page.getByRole('radio', { name: 'Pahadi Mutton Pickle 250 g' }).click();
  await page.getByLabel('Kitne jar bane').fill('50');
  await page.getByLabel('Is batch ka kul kharcha').fill('6,000');
  await expect(page.getByText('₹120.00', { exact: true })).toBeVisible(); // 600000 paise / 50
  await expectNoHorizontalOverflow(page);
  await shot(page, info, 'batch-form', 'light');
  await page.getByRole('button', { name: 'Batch save karein' }).click();

  const code = page.getByTestId('batch-code');
  await expect(code).toHaveText(/^PK-\d{4}-MTN250-01$/);
  expect(Date.now() - started).toBeLessThan(30_000);
  expect(api.catalog.bodies['POST /batches']?.at(-1)).toEqual({
    productId: api.catalog.state.products[2]?.id,
    quantity: 50,
    totalCostPaise: 600000,
  });
  await page.getByRole('button', { name: 'Code copy karein' }).click();
  await expect(page.getByRole('button', { name: 'Copy ho gaya' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/MTN250-01$/);
  await expectNoHorizontalOverflow(page);
  await shot(page, info, 'batch-success', 'light', true);
  await page.mouse.move(0, 0);
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await shot(page, info, 'batch-success', 'dark');

  await page.getByRole('button', { name: 'Mera stock dekhein' }).click();
  const fresh = page.locator('li').filter({ hasText: /MTN250-01/ });
  await expect(fresh.getByText('50 jar bache')).toBeVisible();
  await expect(fresh.getByText('Taaza')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await shot(page, info, 'batch-stock', 'dark');
});

test('queue states: skeleton while loading, empty "Sab orders pack ho gaye 🎉"', async ({ page, context }, info) => {
  await mockDeskApi(page, context, { hangOrders: true });
  await page.goto('/desk');
  await expect(page.getByRole('status', { name: 'Orders load ho rahe hain' }).first()).toBeVisible();
  await shot(page, info, 'queue-loading', 'light');

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await context.unrouteAll({ behavior: 'ignoreErrors' });
  await mockDeskApi(page, context, { emptyQueue: true });
  await page.goto('/desk');
  await expect(page.getByRole('heading', { name: 'Sab orders pack ho gaye 🎉' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/0 pack karne hain/);
  await expectNoHorizontalOverflow(page);
  await shot(page, info, 'queue-empty', 'light');
});

test.describe('414 px (large phone)', () => {
  test.use({ viewport: { width: 414, height: 896 } });
  test('queue + pack screen fit, no overflow', async ({ page, context }, info) => {
    test.skip(!isMobile(info), '414 block runs once, on the mobile project');
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await mockDeskApi(page, context);
      await page.goto('/desk');
      await expect(card(page, 'PK-7KQ2M9')).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectTouchTargets(page);
      await shot(page, info, 'queue', scheme);
      await page.goto('/desk/pack/PK-6AB19C');
      await page.getByRole('checkbox').first().check();
      await expectNoHorizontalOverflow(page);
      await shot(page, info, 'checklist-partial', scheme);
    }
  });
});
