import type { PlaywrightTestConfig } from '@playwright/test';

/** The 3-screen viewport mandate (Rules §1.1, D-08): every E2E spec runs at all three. */
export const viewportProjects: NonNullable<PlaywrightTestConfig['projects']> = [
  {
    name: 'mobile-375',
    use: {
      browserName: 'chromium',
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    },
  },
  { name: 'tablet-768', use: { browserName: 'chromium', viewport: { width: 768, height: 1024 }, hasTouch: true } },
  { name: 'desktop-1440', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
];
