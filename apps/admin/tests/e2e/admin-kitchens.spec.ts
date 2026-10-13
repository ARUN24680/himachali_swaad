import { expect, test, type Page } from '@playwright/test';
import { mockAdminApi } from './support/admin-api';
import { expectNoHorizontalOverflow, ORIGIN } from './support/catalog-api';
import { EVIDENCE_ON, phase10Shot } from './support/evidence';

/**
 * Ops gaps (workflow/01, 05, 07): Kitchens page (create / edit / Shiprocket link / deactivate), admin
 * password reset for staff, change own password on /account, and the cancel dialog's refund lock.
 * API mocked (support/admin-api — every body parsed by the @pk/shared contracts).
 */

/** Evidence: phone shots at 390 px (the 375 project resized), desktop at 1440; tablet skipped. */
async function evidenceWidth(page: Page, project: string): Promise<390 | 1440 | null> {
  if (!EVIDENCE_ON) return null;
  if (project === 'mobile-375') {
    await page.setViewportSize({ width: 390, height: 844 });
    return 390;
  }
  return project === 'desktop-1440' ? 1440 : null;
}

const toast = (page: Page, title: string) => page.locator('[data-slot="toast-title"]', { hasText: title });

for (const scheme of ['light', 'dark'] as const) {
  test(`kitchens: create → link Shiprocket (409 on a taken name) → deactivate (${scheme})`, async ({ page }, info) => {
    test.skip(scheme === 'dark' && !EVIDENCE_ON, 'dark runs only for evidence');
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const width = await evidenceWidth(page, info.project.name);
    const api = await mockAdminApi(page);
    await page.goto('/kitchens');

    await expect(page.getByRole('heading', { name: 'Kitchens', level: 1 })).toBeVisible();
    await expect(page.getByText('Kullu Kitchen').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByTestId('unlinked-banner')).toHaveCount(0); // seeded kitchen is linked
    await expectNoHorizontalOverflow(page);

    // ── Create ──
    await page.getByRole('button', { name: 'Add kitchen' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Add a kitchen' });
    await expect(dialog.getByTestId('pickup-name-hint')).toContainText(
      'Must match the pickup address nickname in Shiprocket exactly — without it orders from this kitchen can’t be booked',
    );
    await dialog.getByRole('button', { name: 'Add kitchen' }).click();
    await expect(dialog.getByText(/capital letters, digits and dashes/i).first()).toBeVisible();
    await expect(dialog.getByText('Enter a valid 6-digit pincode')).toBeVisible();

    await dialog.getByLabel('Code', { exact: true }).fill('hp-mandi-01');
    await expect(dialog.getByLabel('Code', { exact: true })).toHaveValue('HP-MANDI-01');
    await dialog.getByLabel('Name', { exact: true }).fill('Mandi Kitchen');
    await dialog.getByLabel(/FSSAI licence no/).fill('1234');
    await dialog.getByLabel('Address line 1').fill('Near bus stand, Ward 4');
    await dialog.getByLabel('City', { exact: true }).fill('Mandi');
    await dialog.getByLabel('PIN code').fill('175001');
    await dialog.getByLabel('Contact name').fill('Ramesh Thakur');
    await dialog.getByLabel('Contact mobile').fill('98160 00001');
    await dialog.getByRole('button', { name: 'Add kitchen' }).click();
    await expect(dialog.getByText('FSSAI licence number has 14 digits')).toBeVisible();
    await dialog.getByLabel(/FSSAI licence no/).fill('');
    if (width) await phase10Shot(page, 'kitchen-create-dialog', width, scheme, false);
    await dialog.getByRole('button', { name: 'Add kitchen' }).click();
    await expect(dialog).toBeHidden();
    await expect(toast(page, 'Mandi Kitchen added')).toBeVisible();
    expect(api.bodies['POST /admin/kitchens']?.at(-1)).toEqual({
      code: 'HP-MANDI-01',
      name: 'Mandi Kitchen',
      contactName: 'Ramesh Thakur',
      contactPhone: '+919816000001',
      addressLine1: 'Near bus stand, Ward 4',
      addressLine2: null,
      city: 'Mandi',
      state: 'Himachal Pradesh',
      pincode: '175001',
      shiprocketPickupName: null,
      fssaiLicenseNo: null,
    });
    // Not linked yet → warning badge + page banner
    await expect(page.getByTestId('unlinked-banner')).toContainText('Mandi Kitchen isn’t linked to Shiprocket.');
    await expect(page.getByText('Shiprocket not linked').filter({ visible: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    if (width) await phase10Shot(page, 'kitchens-page', width, scheme);

    // ── Edit: a pickup name another kitchen already uses → 409 on the field; then a free one ──
    await page.getByRole('button', { name: 'Edit Mandi Kitchen' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Mandi Kitchen' });
    await expect(edit.getByText('HP-MANDI-01')).toBeVisible();
    await expect(edit.getByText('No kitchen partner assigned yet.')).toBeVisible();
    await expect(edit.getByRole('link', { name: 'Assign on Staff page' })).toHaveAttribute(
      'href',
      '/staff?role=KITCHEN_PARTNER',
    );
    await edit.getByLabel(/Shiprocket pickup name/).fill('Kullu Kitchen');
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(edit.getByText('Another kitchen already uses this Shiprocket pickup name.')).toBeVisible();
    await edit.getByLabel(/Shiprocket pickup name/).fill('Mandi Kitchen');
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(edit).toBeHidden();
    expect(api.bodies[`PATCH /admin/kitchens/${api.kitchens[1]!.id}`]?.at(-1)).toEqual({
      shiprocketPickupName: 'Mandi Kitchen',
    });
    await expect(page.getByTestId('unlinked-banner')).toHaveCount(0);

    // ── Deactivate ──
    await page.getByRole('button', { name: 'Edit Mandi Kitchen' }).click();
    await expect(edit.getByText('Inactive: no new batches can be added; existing stock still sells.')).toBeVisible();
    await edit.getByRole('switch', { name: /Active/ }).click();
    await expect(edit.getByText(/Jars already in stock here keep selling/)).toBeVisible();
    if (width) await phase10Shot(page, 'kitchen-edit-deactivate', width, scheme, false);
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(edit).toBeHidden();
    await expect(toast(page, 'Mandi Kitchen updated').last()).toContainText('Mandi Kitchen updated');
    await expect(
      page.getByText('Deactivated — no new batches can be added; existing stock still sells.', { exact: true }),
    ).toBeVisible();
    expect(api.bodies[`PATCH /admin/kitchens/${api.kitchens[1]!.id}`]?.at(-1)).toEqual({ isActive: false });
    await page.getByRole('radio', { name: /Inactive/ }).click();
    await expect(page.getByText('Mandi Kitchen').filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText('Kullu Kitchen').filter({ visible: true })).toHaveCount(0);
  });
}

test('kitchens: error state with retry, and the audit log can filter kitchen changes', async ({ page }) => {
  await mockAdminApi(page);
  let fail = true;
  await page.route('**/api/v1/admin/kitchens', (route) =>
    fail && route.request().method() === 'GET'
      ? route.fulfill({
          status: 500,
          headers: { 'access-control-allow-origin': ORIGIN, 'access-control-allow-credentials': 'true' },
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            data: null,
            error: { code: 'INTERNAL_ERROR', message: 'The server had a hiccup. Please try again.' },
            requestId: 'req_k',
            timestamp: new Date().toISOString(),
          }),
        })
      : route.fallback(),
  );
  await page.goto('/kitchens');
  await expect(page.getByText('Couldn’t load kitchens')).toBeVisible();
  fail = false;
  await page.getByRole('button', { name: /try again/i }).click();
  await expect(page.getByText('Kullu Kitchen').filter({ visible: true }).first()).toBeVisible();

  await page.goto('/audit-log');
  await page.getByRole('radio', { name: 'Kitchens' }).click();
  await expect(page).toHaveURL(/entityType=pickup_location/);
});

test('staff: reset another member’s password (generate, validate, copy) — never your own', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const width = await evidenceWidth(page, info.project.name);
  const api = await mockAdminApi(page);
  await page.goto('/staff');

  // Own row: no reset, pointer to Account instead
  await page.getByRole('button', { name: 'Edit Asha Negi' }).click();
  const self = page.getByRole('dialog', { name: 'Edit Asha Negi' });
  await expect(self.getByRole('button', { name: 'Reset password' })).toHaveCount(0);
  await expect(self.getByRole('link', { name: 'Account page' })).toHaveAttribute('href', '/account');
  await self.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Edit Ramesh Thakur' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit Ramesh Thakur' });
  // Kitchen picker now reads GET /admin/kitchens
  await expect(edit.getByText('Kullu Kitchen')).toBeVisible();
  await edit.getByRole('button', { name: 'Reset password' }).click();
  const reset = page.getByRole('dialog', { name: 'Reset Ramesh Thakur’s password?' });
  await expect(reset).toContainText(
    'They are signed out everywhere and any login lockout is lifted. Share the password privately; they should change it from Account.',
  );
  const field = reset.getByLabel('Temporary password');
  const first = await field.inputValue();
  expect(first).toMatch(/^[A-HJ-NP-Za-km-z2-9]{16}$/);
  await reset.getByRole('button', { name: 'Generate' }).click();
  await expect(field).not.toHaveValue(first);

  await field.fill('short');
  await reset.getByRole('button', { name: 'Reset password' }).click();
  await expect(reset.getByText('Use at least 12 characters')).toBeVisible();
  expect(api.passwordResets).toHaveLength(0);

  await field.fill('Deodar-Snow-4471');
  if (width) await phase10Shot(page, 'staff-reset-password', width, 'light', false);
  await reset.getByRole('button', { name: 'Reset password' }).click();
  const done = page.getByRole('dialog', { name: 'Temporary password set' });
  await expect(done.getByTestId('reset-password-done')).toContainText('Ramesh Thakur was signed out of 2 sessions.');
  expect(api.passwordResets).toEqual([{ id: api.staff[1]!.id, password: 'Deodar-Snow-4471' }]);
  await done.getByRole('button', { name: 'Copy' }).click();
  await expect(done.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Deodar-Snow-4471');
  await done.getByRole('button', { name: 'Done' }).click();
  await expect(done).toBeHidden();
  await expect(edit).toBeVisible(); // back on the edit dialog
});

test('account: change password — wrong current stays on the page, success keeps you signed in', async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const width = await evidenceWidth(page, info.project.name);
  const api = await mockAdminApi(page);
  await page.goto('/account');
  const card = page.getByTestId('change-password-card');
  await expect(card.getByText('You stay signed in on this device; every other device')).toBeVisible();

  await card.getByLabel('Current password').fill('not-my-password');
  await card.getByLabel('New password', { exact: true }).fill('Kullu-valley-spring-2027');
  await card.getByLabel('Confirm new password').fill('Kullu-valley-spring-2028');
  await card.getByRole('button', { name: 'Change password' }).click();
  await expect(card.getByText('The two new passwords don’t match')).toBeVisible();

  await card.getByLabel('Confirm new password').fill('Kullu-valley-spring-2027');
  await card.getByRole('button', { name: 'Change password' }).click();
  await expect(card.getByText('Your current password is incorrect.')).toBeVisible();
  await expect(page).toHaveURL(/\/account$/); // a 401 here is an answer, not a dead session
  if (width) await phase10Shot(page, 'account-change-password', width, 'light');

  await card.getByLabel('Current password').fill(api.CURRENT_PASSWORD);
  await card.getByRole('button', { name: 'Change password' }).click();
  await expect(toast(page, 'Password changed')).toBeVisible();
  await expect(card.getByLabel('Current password')).toHaveValue('');
  expect(api.bodies['POST /auth/staff/change-password']?.at(-1)).toEqual({
    currentPassword: api.CURRENT_PASSWORD,
    newPassword: 'Kullu-valley-spring-2027',
  });
  await expectNoHorizontalOverflow(page);
});

test('cancel: a paid order’s refund is locked on; an unpaid order shows no refund option', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const api = await mockAdminApi(page);
  const paid = api.orders[0]!.row.orderCode; // AWAITING_PACKING, PAID
  const unpaidOrder = api.orders[10]!; // AWAITING_PACKING too
  unpaidOrder.row.paymentStatus = 'UNPAID';
  const unpaid = unpaidOrder.row.orderCode;
  const open = (code: string) =>
    (info.project.name.startsWith('mobile')
      ? page.getByRole('link', { name: `Open order ${code}` })
      : page.getByRole('table', { name: 'Orders' }).getByRole('link', { name: code, exact: true })
    ).click();

  await page.goto('/orders');
  await open(paid);
  await page.getByRole('dialog', { name: paid }).getByRole('button', { name: 'Cancel order' }).click();
  let dialog = page.getByRole('dialog', { name: `Cancel ${paid}?` });
  const refund = dialog.getByRole('checkbox', { name: /Refund ₹/ });
  await expect(refund).toBeChecked();
  await expect(refund).toBeDisabled();
  await expect(dialog.getByTestId('cancel-refund')).toContainText('a paid order is always refunded in full');
  await dialog.getByLabel('Reason').fill('Out of stock at the kitchen');
  await dialog.getByRole('button', { name: 'Cancel order' }).click();
  await expect(toast(page, `${paid} cancelled`)).toBeVisible();
  expect(api.bodies[`POST /admin/orders/${paid}/cancel`]?.at(-1)).toEqual({
    reason: 'Out of stock at the kitchen',
    refund: true,
  });

  await page.goto(`/orders/${unpaid}`); // deep link opens the drawer
  await page.getByRole('dialog', { name: unpaid }).getByRole('button', { name: 'Cancel order' }).click();
  dialog = page.getByRole('dialog', { name: `Cancel ${unpaid}?` });
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await expect(dialog.getByTestId('cancel-no-refund')).toHaveText(
    'Nothing was paid on this order, so there is nothing to refund.',
  );
  await dialog.getByLabel('Reason').fill('Customer asked to cancel');
  await dialog.getByRole('button', { name: 'Cancel order' }).click();
  await expect(toast(page, `${unpaid} cancelled`)).toBeVisible();
  expect(api.bodies[`POST /admin/orders/${unpaid}/cancel`]?.at(-1)).toEqual({
    reason: 'Customer asked to cancel',
    refund: false,
  });
});
