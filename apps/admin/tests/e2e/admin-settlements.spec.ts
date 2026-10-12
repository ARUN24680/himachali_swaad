import { expect, test, type TestInfo } from '@playwright/test';
import { mockAdminApi } from './support/admin-api';
import { expectNoHorizontalOverflow } from './support/catalog-api';
import { mockDeskApi } from './support/desk-api';
import { evidenceShot } from './support/evidence';

/**
 * Phase 9 §9.9 — settlements (D-40, D-41): ADMIN generate → warnings block finalize → finalize → mark
 * paid; KITCHEN_PARTNER sees only finalized / paid statements in the desk and acknowledges once.
 */
const isMobile = (info: TestInfo) => info.project.name.startsWith('mobile');
const toast = (text: string | RegExp) => `[data-slot="toast-title"]:has-text("${String(text)}")`;

test('generate → warnings block finalize → regenerate → finalize → mark paid', async ({ page }, info) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const api = await mockAdminApi(page, { missingData: true });
  await page.goto('/settlements');
  await expect(page.getByRole('heading', { name: 'Settlements', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Settlement summary' })).toContainText('1 finalized, not paid');
  await expectNoHorizontalOverflow(page);
  await evidenceShot(page, info, 'settlements-list', 'light');

  // Generate a draft for the last month (preset) — one order has no freight yet
  await page.getByRole('button', { name: 'Generate settlement' }).first().click();
  const gen = page.getByRole('dialog', { name: 'Generate a settlement' });
  await gen.getByRole('button', { name: 'Last month' }).click();
  await gen.getByRole('button', { name: 'Generate draft' }).click();
  await expect(page).toHaveURL(/\/settlements\/[0-9a-f-]{36}$/);
  const blocked = page.getByRole('alert').filter({ hasText: 'Finalize is blocked' });
  await expect(blocked).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finalize' })).toBeDisabled();
  // D-41 ledger with the worked-example layout
  for (const line of [
    'Revenue ex-GST',
    'Raw cost (reimbursed to partner)',
    'Gateway fee incl. GST on fee',
    'Net profit pool',
    'Partner share (50%, rounded down)',
    'Admin share (remainder)',
  ])
    await expect(page.getByRole('term').filter({ hasText: line }).first()).toBeVisible();
  await expect(page.getByText('Refunds (already netted from revenue)')).toBeVisible();
  await page
    .getByRole('radiogroup', { name: 'Settlement section' })
    .getByRole('radio', { name: /Warnings/ })
    .click();
  await expect(page.getByRole('list', { name: 'Settlement warnings' })).toContainText(
    'Freight not billed by Shiprocket yet',
  );
  await expectNoHorizontalOverflow(page);
  await evidenceShot(page, info, 'settlement-draft-warnings', 'light');

  // Data arrives → delete the draft, regenerate, finalize
  api.resolveMissingData();
  await page.getByRole('button', { name: 'Delete draft' }).click();
  await page.getByRole('dialog', { name: 'Delete this draft?' }).getByRole('button', { name: 'Delete draft' }).click();
  await expect(page).toHaveURL(/\/settlements$/);
  await page.getByRole('button', { name: 'Generate settlement' }).first().click();
  await page.getByRole('dialog', { name: 'Generate a settlement' }).getByRole('button', { name: 'Last month' }).click();
  await page
    .getByRole('dialog', { name: 'Generate a settlement' })
    .getByRole('button', { name: 'Generate draft' })
    .click();
  await expect(page.getByRole('button', { name: 'Finalize' })).toBeEnabled();
  await page.getByRole('button', { name: 'Finalize' }).click();
  await page
    .getByRole('dialog', { name: 'Finalize this settlement?' })
    .getByRole('button', { name: 'Finalize' })
    .click();
  await expect(page.locator(toast('Settlement finalized'))).toBeVisible();
  await expect(page.getByText('Finalized numbers are locked — read-only.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete draft' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Statement PDF' })).toBeVisible();
  await evidenceShot(page, info, 'settlement-finalized', 'light');

  // Mark paid (bank reference required)
  await page.getByRole('button', { name: 'Mark paid' }).click();
  const pay = page.getByRole('dialog', { name: 'Mark as paid' });
  await pay.getByRole('button', { name: 'Mark paid' }).click();
  await expect(pay.getByText(/at least 4 characters/)).toBeVisible();
  await pay.getByLabel('Bank / UPI reference').fill('UTR998877665544');
  await pay.getByRole('button', { name: 'Mark paid' }).click();
  await expect(page.locator(toast('Settlement marked paid'))).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark paid' })).toHaveCount(0);
  await expect(page.getByTestId('page-header').getByText('UTR998877665544')).toBeVisible();
  const body = Object.entries(api.bodies)
    .find(([k]) => k.endsWith('/mark-paid'))?.[1]
    .at(-1) as { paidAt: string };
  expect(body.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

  // Export CSV for the statement
  if (!isMobile(info)) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    expect((await download).suggestedFilename()).toMatch(/^settlement-.*\.csv$/);
  }
});

for (const scheme of ['light', 'dark'] as const) {
  test(`settlement detail evidence (${scheme})`, async ({ page }, info) => {
    test.skip(scheme === 'dark' && info.project.name === 'tablet-768', 'tablet: light only');
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const api = await mockAdminApi(page);
    const finalized = [...api.settlements.values()].find((s) => s.settlement.status === 'FINALIZED')!;
    await page.goto(`/settlements/${finalized.settlement.id}`);
    await expect(page.getByText('Partner payout').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await evidenceShot(page, info, 'settlement-detail', scheme);
    await page.goto('/settlements');
    await expect(page.getByText(/finalized, not paid/)).toBeVisible();
    await evidenceShot(page, info, 'settlements-list', scheme);
  });
}

test('partner Hisaab: only finalized / paid statements; acknowledge works once', async ({ page, context }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const api = await mockDeskApi(page, context);
  await page.goto('/desk/hisaab');
  await page.getByRole('button', { name: 'Bhasha badlein: English' }).click();
  await expect(page.getByRole('heading', { name: 'Hisaab', level: 1 })).toBeVisible();
  const cards = page.getByRole('link', { name: /^Open statement for / });
  await expect(cards).toHaveCount(2); // the DRAFT never reaches the partner API
  await expect(page.getByText('Payment pending')).toBeVisible();
  await expect(page.getByText('Paid', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await evidenceShot(page, info, 'partner-hisaab-list', 'light');

  const pending = [...api.settlements.settlements.values()].find((s) => s.settlement.status === 'FINALIZED')!;
  await page
    .getByRole('link', { name: /^Open statement for / })
    .filter({ hasText: 'Please check' })
    .click();
  await expect(page).toHaveURL(new RegExp(`/desk/hisaab/${pending.settlement.id}$`));
  await expect(page.getByText('Your payout').first()).toBeVisible();
  await expect(page.getByText('Sales without GST')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await evidenceShot(page, info, 'partner-hisaab-detail', 'light');
  await page.getByRole('button', { name: 'Yes, I checked it — Acknowledge' }).click();
  await expect(page.getByText(/You acknowledged this statement on/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Acknowledge/ })).toHaveCount(0);
  expect(api.settlements.acknowledgeCalls).toEqual([{ id: pending.settlement.id, status: 200 }]);

  // Back on the list both are acknowledged; reopening shows the done state, no second call
  await page.getByRole('link', { name: 'All statements' }).click();
  await expect(page.getByText('Please check')).toHaveCount(0);
  await page
    .getByRole('link', { name: /^Open statement for / })
    .first()
    .click();
  await expect(page.getByText(/You acknowledged this statement on/)).toBeVisible();
  expect(api.settlements.acknowledgeCalls).toHaveLength(1);

  // Hindi
  await page.getByRole('button', { name: 'Change language to Hindi' }).click();
  await expect(page.getByText('Bikri (GST ke bina)')).toBeVisible();
  await evidenceShot(page, info, 'partner-hisaab-detail-hindi', 'light');
});

test('partner never reaches the admin settlements console', async ({ page, context }) => {
  await mockDeskApi(page, context);
  for (const path of ['/settlements', '/expenses', '/orders', '/customers', '/settings', '/exports']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'This page isn’t part of your role' })).toBeVisible();
  }
});
