import { expect, test } from '@playwright/test';

test('design token preview renders light + dark without horizontal overflow', async ({ page }, testInfo) => {
  await page.goto('/dev/tokens');
  await expect(page.getByRole('heading', { name: 'Design tokens' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Light theme' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Dark theme' })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);

  await page.screenshot({ path: testInfo.outputPath(`tokens-${testInfo.project.name}.png`), fullPage: true });
});
