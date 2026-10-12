import { defineConfig } from '@playwright/test';

/**
 * Packing Desk PWA checks against the PRODUCTION build (Phase 7 §7.2–7.3): `vite build` + `vite
 * preview`, so the real generated service worker + manifest are live (the dev-server e2e in
 * playwright.config.ts never registers a SW). API mocked via context.route (tests/e2e/support).
 * Run: pnpm --filter @pk/admin test:pwa      (perf evidence too: PK_PWA_PERF=1)
 */
const PORT = 4173;
const ORIGIN = `http://localhost:${PORT}`;
// Read by the shared API mocks (CORS allow-origin) — set here so every worker inherits it
process.env.PK_E2E_ORIGIN = ORIGIN;
// Route the service worker's own requests (Background Sync replay of Mark Packed) through context.route too
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

export default defineConfig({
  testDir: 'tests/pwa',
  // One SW / one origin / timing-sensitive perf runs → serial
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 90_000,
  use: {
    baseURL: ORIGIN,
    // Full Chromium in new headless mode — the stripped headless shell has no push / notifications / install checks
    channel: 'chromium',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'pwa-mobile-375',
      use: {
        browserName: 'chromium',
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `${ORIGIN}/manifest.webmanifest`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
