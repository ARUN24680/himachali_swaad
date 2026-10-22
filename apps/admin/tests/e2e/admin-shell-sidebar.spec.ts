import { expect, test } from '@playwright/test';
import { mockAdminApi } from './support/admin-api';
import { expectNoHorizontalOverflow } from './support/catalog-api';

/**
 * Shell regression: the sticky sidebar (tablet rail / desktop sidebar) must stay pinned to the top of
 * the viewport at the very bottom of every page. Nothing on a page may make the document taller than
 * the shell — the Dashboard's sr-only chart tables once did, and the sidebar scrolled away with it.
 */
for (const path of ['/', '/orders', '/products']) {
  test(`sidebar stays pinned when ${path} is scrolled to the bottom`, async ({ page }, info) => {
    test.skip(info.project.name === 'mobile-375', 'phones use the bottom nav, no sidebar');
    await mockAdminApi(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('status')).toHaveCount(0); // charts / tables loaded
    const m = await page.evaluate(async () => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const shell = document.querySelector('#main')!.closest('.min-h-dvh')!.getBoundingClientRect();
      const nav = document.querySelector('aside nav[aria-label="Main"]')!.parentElement!.getBoundingClientRect();
      return {
        scrolled: scrollY,
        navTop: nav.top,
        shellBottom: shell.bottom + scrollY,
        docH: document.documentElement.scrollHeight,
      };
    });
    expect(m.navTop).toBeGreaterThanOrEqual(-1);
    expect(m.navTop).toBeLessThanOrEqual(1);
    expect(m.docH).toBeLessThanOrEqual(Math.ceil(m.shellBottom) + 1);
    await expectNoHorizontalOverflow(page);
  });
}
