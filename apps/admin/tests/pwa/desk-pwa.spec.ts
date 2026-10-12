import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { API } from '../e2e/support/catalog-api';
import { LABELS, mockDeskApi } from '../e2e/support/desk-api';
import { EVIDENCE, EVIDENCE_ON, recordEvidence, writeEvidenceText } from './support/evidence';
import { courierLabelPdf } from './support/label-pdf';

/**
 * Phase 7 — Packing Desk PWA against the PRODUCTION build (`vite build` + `vite preview`, real
 * generated sw.js + manifest). API mocked at context level (pages AND the service worker).
 * Config: playwright.pwa.config.ts. Results → Phases/evidence/phase-07/pwa-checks.json (+ perf).
 * Desktop Chromium in mobile emulation — NOT a real phone; real-device checks stay open.
 */
const ORIGIN = process.env.PK_E2E_ORIGIN ?? 'http://localhost:4173';
const CHECKS = 'pwa-checks.json';

const card = (page: Page, code: string) => page.locator(`article[data-order="${code}"]`);
const markPackedButton = (page: Page) => page.getByRole('button', { name: '✅ Pack ho gaya' });

async function tickAll(page: Page) {
  const boxes = page.getByRole('checkbox');
  await expect(boxes).toHaveCount(6);
  for (let i = 0; i < 6; i++) await boxes.nth(i).check();
  await expect(markPackedButton(page)).toBeEnabled();
}

/** Wait until the SW controls this page (first install: activate → clients.claim()). */
async function swControlled(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve()));
  });
}

/**
 * Top-priority API switch: `down` → every API call fails like a dead connection (no response at all);
 * `signedOut` → the session is gone server-side (/auth/me + /auth/refresh answer 401).
 */
async function apiSwitch(context: BrowserContext) {
  const state = { down: false, signedOut: false };
  await context.route(`${API}/**`, (route) => {
    if (state.down) return route.abort('internetdisconnected');
    const path = new URL(route.request().url()).pathname;
    if (state.signedOut && route.request().method() !== 'OPTIONS' && /\/auth\/(me|refresh)$/.test(path))
      return route.fulfill({
        status: 401,
        headers: { 'access-control-allow-origin': ORIGIN, 'access-control-allow-credentials': 'true' },
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          data: null,
          error: { code: 'UNAUTHENTICATED', message: 'Please sign in' },
          requestId: 'req_pwa',
          timestamp: new Date().toISOString(),
        }),
      });
    return route.fallback();
  });
  return state;
}

const idbGetAll = (page: Page, db: string, store: string) =>
  page.evaluate(
    ([dbName, storeName]) =>
      new Promise<unknown[]>((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.onsuccess = () => {
          if (!open.result.objectStoreNames.contains(storeName)) return resolve([]);
          const req = open.result.transaction(storeName).objectStore(storeName).getAll();
          req.onsuccess = () => resolve(req.result as unknown[]);
          req.onerror = () => reject(req.error);
        };
        open.onerror = () => reject(open.error);
      }),
    [db, store] as const,
  );

/** PNG width × height from the IHDR chunk. */
const pngSize = (buf: Buffer) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) });

// ── a. Installability ──────────────────────────────────────────────────────────────────────────
test('installable: Chrome reports no installability errors; manifest + icons complete', async () => {
  // Installability is never reported for incognito profiles — Playwright's default contexts are
  // incognito-like, so this check runs in a real (persistent) profile.
  const dir = mkdtempSync(join(tmpdir(), 'pk-pwa-'));
  const context = await chromium.launchPersistentContext(dir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    // Lets Chrome fire beforeinstallprompt without days of "site engagement"
    args: ['--bypass-app-banner-engagement-checks'],
  });
  try {
    await mockDeskApi(context, context);
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`${ORIGIN}/desk`);
    await expect(card(page, 'PK-7KQ2M9')).toBeVisible();
    await swControlled(page);

    const cdp = await context.newCDPSession(page);
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    const appManifest = await cdp.send('Page.getAppManifest');
    expect(installabilityErrors).toEqual([]);
    expect(appManifest.errors).toEqual([]);

    const res = await page.request.get(`${ORIGIN}/manifest.webmanifest`);
    expect(res.headers()['content-type']).toContain('manifest+json');
    const manifest = (await res.json()) as {
      name: string;
      short_name: string;
      start_url: string;
      scope: string;
      display: string;
      icons: { src: string; sizes: string; type: string; purpose: string }[];
    };
    expect(manifest).toMatchObject({ start_url: '/desk', scope: '/', display: 'standalone' });
    expect(manifest.name).toContain('Packing Desk');
    const icons = [];
    for (const icon of manifest.icons) {
      const r = await page.request.get(`${ORIGIN}${icon.src}`);
      expect(r.ok()).toBe(true);
      const size = pngSize(await r.body());
      expect(`${size.width}x${size.height}`).toBe(icon.sizes);
      icons.push({ ...icon, actual: `${size.width}x${size.height}` });
    }
    expect(icons.some((i) => i.sizes === '192x192' && i.purpose.includes('any'))).toBe(true);
    expect(icons.some((i) => i.sizes === '512x512' && i.purpose.includes('any'))).toBe(true);
    expect(icons.some((i) => i.sizes === '512x512' && i.purpose.includes('maskable'))).toBe(true);

    // Our own "Install" banner appears once Chrome offers the prompt (best effort — recorded, not asserted)
    const installBanner = await page
      .getByRole('button', { name: 'Install', exact: true })
      .waitFor({ timeout: 5_000 })
      .then(() => true)
      .catch(() => false);

    recordEvidence(CHECKS, 'installability', {
      check: 'CDP Page.getInstallabilityErrors on the production build (vite preview), persistent profile',
      browser: `Chromium ${context.browser()?.version() ?? '(persistent context)'} headless, 375×812 mobile emulation`,
      installabilityErrors,
      manifestParseErrors: appManifest.errors,
      manifest: {
        name: manifest.name,
        short_name: manifest.short_name,
        start_url: manifest.start_url,
        scope: manifest.scope,
        display: manifest.display,
      },
      icons,
      serviceWorkerControlsPage: true,
      beforeInstallPromptFired: installBanner,
      note: 'Desktop Chromium in mobile emulation; a real Android Chrome / iOS Safari install is still a device check.',
    });
  } finally {
    await context.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── b. Offline cold start ──────────────────────────────────────────────────────────────────────
test('offline cold start: desk renders from cache with the banner; Mark Packed queues; one sync on reconnect', async ({
  context,
}) => {
  const api = await mockDeskApi(context, context);
  const net = await apiSwitch(context);

  // 1. Online visit — SW installs + precaches the shell, identity + queue get cached
  const first = await context.newPage();
  await first.goto('/desk');
  await expect(card(first, 'PK-6AB19C')).toBeVisible();
  await swControlled(first);
  await expect
    .poll(async () => (await idbGetAll(first, 'pk-desk-cache', 'snapshots')).length)
    .toBeGreaterThanOrEqual(1);
  const identity = await first.evaluate(() => localStorage.getItem('pk-desk-identity'));
  expect(JSON.parse(identity ?? '{}')).toMatchObject({ user: { role: 'KITCHEN_PARTNER' } });
  // Nothing secret is cached: just id / role / name / kitchens
  expect(identity).not.toMatch(/token|cookie|email|phone/i);
  await first.close();

  // 2. Phone offline, app opened from the home screen
  net.down = true;
  await context.setOffline(true);
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/desk');
  const banner = page.getByTestId('offline-banner');
  await expect(banner).toContainText('Offline — purani list dikh rahi hai, last updated');
  await expect(banner).toContainText('Internet nahi hai. Packing chalti rahegi');
  await expect(page.locator('article[data-order]')).toHaveCount(3);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/3 pack karne hain/);
  if (EVIDENCE_ON)
    await page.screenshot({ path: `${EVIDENCE}desk-pwa-offline-coldstart-375-light.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  if (EVIDENCE_ON)
    await page.screenshot({ path: `${EVIDENCE}desk-pwa-offline-coldstart-375-dark.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });

  // Labels need the server → disabled with a "needs internet" note, not a failing tap
  await card(page, 'PK-6AB19C')
    .getByRole('link', { name: /Ye order pack karein/ })
    .click();
  await expect(page.getByRole('button', { name: '🖨️ Label Print karein' })).toBeDisabled();
  await expect(page.getByText('Label ke liye internet chahiye.')).toBeVisible();

  // 3. Pack offline → outbox
  await tickAll(page);
  await markPackedButton(page).click();
  await expect(page).toHaveURL(/\/desk$/);
  await expect(card(page, 'PK-6AB19C')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /⏳ Sync pending \(1\)/ })).toBeVisible();
  const queued = (await idbGetAll(page, 'pk-desk', 'outbox')) as { key: string; orderCode: string; status: string }[];
  expect(queued).toEqual([expect.objectContaining({ orderCode: 'PK-6AB19C', status: 'pending' })]);
  const key = queued[0]!.key;
  expect(api.markPacked).toHaveLength(0);
  if (EVIDENCE_ON)
    await page.screenshot({ path: `${EVIDENCE}desk-pwa-offline-sync-pending-375-light.png`, fullPage: true });

  // 4. Back online → exactly one successful POST, same Idempotency-Key, badge clears, live list
  net.down = false;
  await context.setOffline(false);
  await expect(page.getByRole('button', { name: /Sync pending/ })).toHaveCount(0, { timeout: 15_000 });
  await expect(banner).toHaveCount(0);
  await page.waitForTimeout(1_500); // give a late Background Sync replay the chance to (wrongly) fire
  const calls = api.markPacked.filter((c) => c.orderCode === 'PK-6AB19C');
  expect(calls.filter((c) => c.status === 200)).toHaveLength(1);
  expect(calls.every((c) => c.key === key)).toBe(true);
  await expect(card(page, 'PK-6AB19C')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/2 pack karne hain/);

  recordEvidence(CHECKS, 'offlineColdStart', {
    check: 'Production build + active SW; page closed; context offline + API unreachable; /desk opened in a new page',
    shellFromServiceWorker: true,
    rendersCachedQueue: { cards: 3, banner: 'Offline — purani list dikh rahi hai, last updated <time>' },
    labelButtonsOffline: 'disabled + "Label ke liye internet chahiye."',
    markPackedOffline: { queuedInOutbox: true, idempotencyKey: key },
    onReconnect: { markPackedCalls: calls, successfulCalls: calls.filter((c) => c.status === 200).length },
    screenshots: [
      'desk-pwa-offline-coldstart-375-light.png',
      'desk-pwa-offline-coldstart-375-dark.png',
      'desk-pwa-offline-sync-pending-375-light.png',
    ],
  });
});

test('offline cold start: a 401 still goes to login and wipes the cached identity + queues', async ({ context }) => {
  await mockDeskApi(context, context);
  const net = await apiSwitch(context);
  const page = await context.newPage();
  await page.goto('/desk');
  await expect(card(page, 'PK-6AB19C')).toBeVisible();
  await swControlled(page);
  expect(await page.evaluate(() => localStorage.getItem('pk-desk-identity'))).not.toBeNull();

  net.signedOut = true;
  await page.goto('/desk');
  await expect(page).toHaveURL(/\/login\?next=%2Fdesk$/);
  expect(await page.evaluate(() => localStorage.getItem('pk-desk-identity'))).toBeNull();
  await expect.poll(async () => (await idbGetAll(page, 'pk-desk-cache', 'snapshots')).length).toBe(0);

  // …and offline after that there is no desk to fall back to
  net.down = true;
  await context.setOffline(true);
  await page.goto('/desk');
  await expect(page.getByText("Can't reach the server")).toBeVisible();
  recordEvidence(CHECKS, 'offlineAuthBoundary', {
    check:
      '/auth/me 401 → /login?next=/desk; pk-desk-identity + pk-desk-cache cleared; offline afterwards → "Can\'t reach the server", no desk',
    passed: true,
  });
});

// ── c. Push handler in the real service worker ─────────────────────────────────────────────────
interface SwScope {
  registration: ServiceWorkerRegistration;
  clients: { matchAll: unknown; openWindow: unknown };
  dispatchEvent: (e: Event) => boolean;
}

test('push: the real SW shows the new-order notification; click focuses + opens /desk?order=…', async ({ context }) => {
  await context.grantPermissions(['notifications'], { origin: ORIGIN });
  await mockDeskApi(context, context);
  const page = await context.newPage();
  await page.goto('/desk');
  await expect(card(page, 'PK-7KQ2M9')).toBeVisible();
  await swControlled(page);

  // DevTools' "Push" button: CDP delivers a push event straight to the registration (no push service)
  const cdp = await context.newCDPSession(page);
  const registrations = new Promise<{ registrationId: string; scopeURL: string }[]>((resolve) =>
    cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => {
      if (e.registrations.length) resolve(e.registrations);
    }),
  );
  await cdp.send('ServiceWorker.enable');
  const reg = (await registrations).find((r) => r.scopeURL === `${ORIGIN}/`);
  expect(reg).toBeDefined();
  const payload = {
    title: 'Naya order PK-7KQ2M9',
    body: '2 × Chicken 250 g, 1 × Mutton 250 g — 11 baje tak pack karein',
    url: '/desk?order=PK-7KQ2M9',
    tag: 'PK-7KQ2M9',
  };
  const sentAt = Date.now();
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: ORIGIN,
    registrationId: reg!.registrationId,
    data: JSON.stringify(payload),
  });

  const shown = async () =>
    page.evaluate(async (tag) => {
      const r = await navigator.serviceWorker.ready;
      return (await r.getNotifications({ tag })).map((n) => ({
        title: n.title,
        body: n.body,
        tag: n.tag,
        icon: n.icon,
        data: n.data as unknown,
      }));
    }, payload.tag);
  await expect.poll(shown).toHaveLength(1);
  const notification = (await shown())[0]!;
  const shownMs = Date.now() - sentAt;
  expect(notification).toMatchObject({
    title: payload.title,
    body: payload.body,
    tag: payload.tag,
    data: { url: payload.url },
  });

  // notificationclick: the browser only lets a REAL click focus a window / open one, so we dispatch
  // the SW's own handler with focus()/openWindow() recorded and assert what it does with them.
  const sw = context.serviceWorkers().find((w) => w.url() === `${ORIGIN}/sw.js`);
  expect(sw).toBeDefined();
  const clickExisting = await sw!.evaluate(async (tag) => {
    const scope = self as unknown as SwScope;
    const [n] = await scope.registration.getNotifications({ tag });
    const proto = (self as unknown as { WindowClient: { prototype: { focus: () => Promise<unknown> } } }).WindowClient
      .prototype;
    const realFocus = proto.focus;
    let focused = 0;
    proto.focus = async function (this: unknown) {
      focused += 1;
      return this;
    };
    let work: Promise<unknown> = Promise.resolve();
    const ev = new Event('notificationclick');
    Object.defineProperty(ev, 'notification', { value: n });
    Object.defineProperty(ev, 'waitUntil', { value: (p: Promise<unknown>) => (work = p) });
    scope.dispatchEvent(ev);
    await work;
    proto.focus = realFocus;
    return { focused, remaining: (await scope.registration.getNotifications({ tag })).length };
  }, payload.tag);
  expect(clickExisting).toEqual({ focused: 1, remaining: 0 }); // closed + focused the open desk
  await expect(page).toHaveURL(`${ORIGIN}/desk?order=PK-7KQ2M9`); // …and navigated it to the order

  // No desk window open + a payload pointing off-site → opens OUR /desk, never the foreign URL
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: ORIGIN,
    registrationId: reg!.registrationId,
    data: JSON.stringify({ title: 'x', body: 'y', url: 'https://evil.example/phish', tag: 'offsite' }),
  });
  await expect
    .poll(async () =>
      page.evaluate(
        async () => (await (await navigator.serviceWorker.ready).getNotifications({ tag: 'offsite' })).length,
      ),
    )
    .toBe(1);
  const clickNoWindow = await sw!.evaluate(async () => {
    const scope = self as unknown as SwScope;
    const [n] = await scope.registration.getNotifications({ tag: 'offsite' });
    const opened: string[] = [];
    Object.defineProperty(scope.clients, 'matchAll', { value: async () => [], configurable: true });
    Object.defineProperty(scope.clients, 'openWindow', {
      value: async (url: string) => {
        opened.push(url);
        return null;
      },
      configurable: true,
    });
    let work: Promise<unknown> = Promise.resolve();
    const ev = new Event('notificationclick');
    Object.defineProperty(ev, 'notification', { value: n });
    Object.defineProperty(ev, 'waitUntil', { value: (p: Promise<unknown>) => (work = p) });
    scope.dispatchEvent(ev);
    await work;
    delete (scope.clients as Partial<SwScope['clients']>).matchAll;
    delete (scope.clients as Partial<SwScope['clients']>).openWindow;
    return opened;
  });
  expect(clickNoWindow).toEqual([`${ORIGIN}/desk`]);

  recordEvidence(CHECKS, 'push', {
    check: 'CDP ServiceWorker.deliverPushMessage into the production sw.js (no push service / VAPID involved)',
    payload,
    shownNotification: notification,
    pushToNotificationMs: shownMs,
    notificationClick: {
      existingWindow: 'notification closed, client.focus() called once, window navigated to /desk?order=PK-7KQ2M9',
      noWindowOffsiteUrl: `openWindow(${clickNoWindow[0]}) — foreign URL ignored`,
      method:
        "handler dispatched inside the SW with focus()/openWindow() recorded — a real click can't be simulated headless",
    },
    note: 'Real delivery through FCM/APNs within 10 s on a phone needs VAPID keys + a device (still open).',
  });
});

// ── d. Performance under Fast 4G + 4× CPU (opt-in: PK_PWA_PERF=1) ──────────────────────────────
/**
 * Chrome DevTools "Fast 4G" preset (front_end/core/sdk/NetworkManager.ts):
 *   download 9 Mbps × 0.9, upload 1.5 Mbps × 0.9 (bytes/s = Mbps × 1e6 / 8 × 0.9), latency 60 ms × 2.75.
 */
const FAST_4G = {
  latency: 165,
  downloadThroughput: (9 * 1_000_000 * 0.9) / 8,
  uploadThroughput: (1.5 * 1_000_000 * 0.9) / 8,
};
const CPU_SLOWDOWN = 4;
const RUNS = 5;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

async function throttled(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, ...FAST_4G });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  // Bytes that really crossed the (throttled) wire — mocked API responses never do
  const wire = { bytes: 0, requests: 0 };
  cdp.on('Network.loadingFinished', (e) => {
    wire.bytes += e.encodedDataLength;
    wire.requests += 1;
  });
  return wire;
}

/**
 * Mocked responses are fulfilled by Playwright before the network stack, so DevTools throttling
 * never sees them — add the same Fast 4G cost by hand: one RTT + body size / download rate.
 */
async function fast4gMockCost(context: BrowserContext, pattern: string) {
  await context.route(pattern, async (route) => {
    await new Promise((r) => setTimeout(r, FAST_4G.latency));
    return route.fallback();
  });
}

test.describe('performance (Fast 4G + 4× CPU, 375 px)', () => {
  test.skip(!process.env.PK_PWA_PERF, 'perf evidence is opt-in: PK_PWA_PERF=1 pnpm --filter @pk/admin test:pwa');
  test.setTimeout(240_000);

  test('queue first load < 3 s and label open < 2 s (median of 5 cold runs)', async ({ browser }) => {
    const pdf = courierLabelPdf('PK-6AB19C');
    const pdfCost = FAST_4G.latency + Math.round((pdf.length / FAST_4G.downloadThroughput) * 1000);
    const queueRuns: { cardsVisibleMs: number; transferredKB: number; requests: number }[] = [];
    const labelRuns: number[] = [];

    for (let run = 0; run < RUNS; run++) {
      // Fresh context = cold cache: no service worker, no HTTP cache, no IndexedDB
      const context = await browser.newContext({
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      });
      await mockDeskApi(context, context);
      await fast4gMockCost(context, `${API}/**`);
      await context.route(`${LABELS}/**`, async (route) => {
        await new Promise((r) => setTimeout(r, pdfCost));
        return route.fulfill({ status: 200, contentType: 'application/pdf', body: pdf });
      });
      const page = await context.newPage();
      await page.addInitScript(() => {
        const w = window as unknown as { __pkCardsAt?: number };
        new MutationObserver((_, obs) => {
          if (document.querySelector('article[data-order]')) {
            w.__pkCardsAt = performance.now();
            obs.disconnect();
          }
        }).observe(document, { childList: true, subtree: true });
      });
      const wire = await throttled(context, page);

      // (i) navigation start → first order card in the DOM and visible
      await page.goto('/desk');
      await expect(card(page, 'PK-6AB19C')).toBeVisible({ timeout: 30_000 });
      const cardsAt = await page.evaluate(() => (window as unknown as { __pkCardsAt?: number }).__pkCardsAt ?? -1);
      queueRuns.push({
        cardsVisibleMs: Math.round(cardsAt),
        transferredKB: Math.round(wire.bytes / 1024),
        requests: wire.requests,
      });

      // (ii) tap "Label Print karein" → the 4×6 PDF response arrives in the new tab
      await card(page, 'PK-6AB19C')
        .getByRole('link', { name: /Ye order pack karein/ })
        .click();
      const print = page.getByRole('button', { name: '🖨️ Label Print karein' });
      await expect(print).toBeEnabled();
      const pdfResponse = context.waitForEvent('response', {
        predicate: (r) => r.url().startsWith(`${LABELS}/label-PK-6AB19C.pdf`),
        timeout: 30_000,
      });
      const t0 = Date.now();
      await print.click();
      const response = await pdfResponse;
      await response.finished();
      labelRuns.push(Date.now() - t0);
      expect(response.headers()['content-type']).toBe('application/pdf');
      await context.close();
    }

    const queueMedian = median(queueRuns.map((r) => r.cardsVisibleMs));
    const labelMedian = median(labelRuns);
    const result = {
      environment: {
        build: 'vite build → vite preview (production bundle, gzip-compressed by vite preview; no brotli / CDN)',
        browser: `Chromium ${browser.version()} headless (desktop machine), 375×812 mobile emulation`,
        network: {
          preset: 'Chrome DevTools "Fast 4G" via CDP Network.emulateNetworkConditions',
          latencyMs: FAST_4G.latency,
          downloadBytesPerSec: FAST_4G.downloadThroughput,
          uploadBytesPerSec: FAST_4G.uploadThroughput,
          mockedApi: `+${FAST_4G.latency} ms per mocked API call (Playwright-fulfilled responses bypass DevTools throttling)`,
        },
        cpu: `Emulation.setCPUThrottlingRate ${CPU_SLOWDOWN}× (low-end Android stand-in)`,
        runs: RUNS,
        cache: 'cold — new browser context per run (no SW, HTTP cache or IndexedDB)',
      },
      queueFirstLoad: {
        metric: 'navigation start → first order card (article[data-order]) in the DOM',
        targetMs: 3000,
        medianMs: queueMedian,
        runs: queueRuns,
        pass: queueMedian < 3000,
      },
      labelOpen: {
        metric: 'tap "🖨️ Label Print karein" → signed 4×6 PDF response finished in the new tab (API call + PDF fetch)',
        targetMs: 2000,
        pdfBytes: pdf.length,
        pdfMockCostMs: pdfCost,
        medianMs: labelMedian,
        runsMs: labelRuns,
        pass: labelMedian < 2000,
      },
      caveat: 'Emulated on a desktop CPU — NOT a real low-end Android phone; the real-device check stays open.',
    };
    recordEvidence('pwa-perf.json', 'fast4g', result);
    writeEvidenceText(
      'pwa-perf.md',
      [
        '# Phase 7 — Packing Desk performance (emulated)',
        '',
        `Generated by \`apps/admin/tests/pwa/desk-pwa.spec.ts\` (\`PK_PWA_PERF=1 pnpm --filter @pk/admin test:pwa\`) on ${new Date().toISOString().slice(0, 10)}. Raw numbers: \`pwa-perf.json\`.`,
        '',
        `- Build: production bundle via \`vite preview\` (gzip, localhost origin — no CDN / brotli).`,
        `- Network: Chrome DevTools **Fast 4G** — ${FAST_4G.latency} ms latency, ${(FAST_4G.downloadThroughput / 1000).toFixed(1)} kB/s down, ${(FAST_4G.uploadThroughput / 1000).toFixed(2)} kB/s up (CDP \`Network.emulateNetworkConditions\`); mocked API calls get +${FAST_4G.latency} ms each.`,
        `- CPU: ${CPU_SLOWDOWN}× slowdown (CDP \`Emulation.setCPUThrottlingRate\`), 375×812 mobile emulation, ${RUNS} cold runs (new context each).`,
        '',
        '| Metric | Target | Median | Runs (ms) | Result |',
        '| :-- | --: | --: | :-- | :-- |',
        `| Queue first load (nav start → order cards) | < 3000 ms | ${queueMedian} ms | ${queueRuns.map((r) => r.cardsVisibleMs).join(', ')} | ${queueMedian < 3000 ? 'PASS' : 'FAIL'} |`,
        `| Label open (tap Print → 4×6 PDF received) | < 2000 ms | ${labelMedian} ms | ${labelRuns.join(', ')} | ${labelMedian < 2000 ? 'PASS' : 'FAIL'} |`,
        '',
        `Transferred over the throttled network by the time the cards showed (run 1): ~${queueRuns[0]?.transferredKB ?? '?'} KB in ${queueRuns[0]?.requests ?? '?'} finished requests (static build only; mocked API excluded).`,
        '',
        '> Emulation on a desktop machine — **not** a real low-end Android device. The checklist item stays open until it is measured on a phone.',
        '',
      ].join('\n'),
    );
    expect(queueMedian).toBeLessThan(3000);
    expect(labelMedian).toBeLessThan(2000);
  });
});
