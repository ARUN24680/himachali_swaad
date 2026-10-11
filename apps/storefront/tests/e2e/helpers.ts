import { expect, type Page } from '@playwright/test';

/** Rules §1.1: no horizontal page scroll at any viewport. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, 'horizontal overflow (px)').toBeLessThanOrEqual(0);
}

/** Pre-records a "reject all" consent so the banner doesn't cover the page in non-consent specs. */
export async function seedConsentDeclined(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('pk-consent-v1')) {
      localStorage.setItem(
        'pk-consent-v1',
        JSON.stringify({
          state: { analytics: false, marketing: false, decidedAt: '2026-01-01T00:00:00.000Z' },
          version: 1,
        }),
      );
    }
  });
}
