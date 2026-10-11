import { defineConfig } from '@playwright/test';
import { viewportProjects } from '../../playwright.viewports';

/**
 * Storefront E2E. Server Components fetch the real backend (:4000, seeded demo catalogue), so pages
 * are not page.route-mocked; browser-side calls (quote, pincode, analytics) can be.
 *
 * Fake GA4 / Pixel ids are injected so the consent specs can prove the vendor scripts stay off until
 * consent (and load after it). Point STOREFRONT_URL at an already-running server to reuse it.
 */
const baseURL = process.env.STOREFRONT_URL ?? 'http://localhost:3000';
export const TEST_GA4_ID = 'G-PKTEST0001';
export const TEST_META_PIXEL_ID = '1234567890123';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: viewportProjects,
  webServer: process.env.STOREFRONT_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { NEXT_PUBLIC_GA4_ID: TEST_GA4_ID, NEXT_PUBLIC_META_PIXEL_ID: TEST_META_PIXEL_ID },
      },
});
