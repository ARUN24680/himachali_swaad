import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, seedConsentDeclined } from './helpers';

/**
 * Phase 4 verification: browse → variant toggle → add to cart → reload → cart persists, at
 * 375 / 768 / 1440 with no horizontal overflow. Runs against the real backend + seeded demo catalogue
 * (quote endpoint live); stock counts are never hard-coded.
 */
test.beforeEach(async ({ page }) => {
  await seedConsentDeclined(page);
});

test('browse → variant toggle → add to cart → reload → cart persists', async ({ page }) => {
  await page.goto('/products');
  await expect(page.getByRole('heading', { level: 1, name: 'Himachali non-veg pickles' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // 1) Grid card: switch to the 500 g jar and add it
  const card = page.getByTestId('product-card').first();
  await expect(card.getByRole('img', { name: 'Non-vegetarian' })).toBeVisible();
  const big = card.getByRole('radio', { name: '500 g jar' });
  await big.click();
  await expect(big).toHaveAttribute('aria-checked', 'true');
  await expect(card.getByText('Net wt. 500 g')).toBeVisible();
  const cardTitle = (await card.getByRole('heading', { level: 3 }).textContent())!.trim();
  await card.getByRole('button', { name: 'Add to cart' }).click();
  await expect(card.getByRole('button', { name: 'Added' })).toBeVisible();
  await expect(page.getByTestId('cart-button')).toHaveAccessibleName('Cart, 1 jar');

  // 2) Product detail of the second recipe: variant switch is a real URL change
  const second = page.getByTestId('product-card').nth(1);
  const secondTitle = (await second.getByRole('heading', { level: 3 }).textContent())!.trim();
  await second.getByRole('link', { name: secondTitle }).click();
  await expect(page.getByRole('heading', { level: 1, name: secondTitle })).toBeVisible();
  await expect(page.getByText('MRP inclusive of all taxes').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nutrition (per 100 g)' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page
    .getByRole('navigation', { name: 'Jar size' })
    .getByRole('link', { name: /500 g jar/ })
    .click();
  await expect(page).toHaveURL(/-500g$/);
  await expect(page.getByText('Net wt. 500 g')).toBeVisible();
  await page
    .getByRole('button', { name: /Increase quantity/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Add to cart' }).first().click();
  await expect(page.getByTestId('cart-button')).toHaveAccessibleName('Cart, 3 jars');

  // 3) Only ids + quantities are persisted (D-15) — never prices
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pk-cart-v1') ?? 'null'));
  expect(stored.state.items).toHaveLength(2);
  for (const item of stored.state.items) expect(Object.keys(item).sort()).toEqual(['productId', 'quantity']);

  // 4) Reload → still there; the drawer shows server-quoted lines
  await page.reload();
  await expect(page.getByTestId('cart-button')).toHaveAccessibleName('Cart, 3 jars');
  await page.getByTestId('cart-button').click();
  const drawer = page.getByTestId('cart-drawer');
  await expect(drawer.getByTestId('cart-line')).toHaveCount(2);
  await expect(drawer.getByText(cardTitle)).toBeVisible();
  await expect(drawer.getByText(secondTitle)).toBeVisible();
  await expect(drawer.getByRole('img', { name: 'Non-vegetarian' })).toHaveCount(2);
  await expect(drawer.getByRole('link', { name: 'Checkout' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('remove with undo restores the line', async ({ page }) => {
  await page.goto('/products');
  await page.getByTestId('product-card').first().getByRole('button', { name: 'Add to cart' }).click();
  await page.getByTestId('cart-button').click();
  const drawer = page.getByTestId('cart-drawer');
  await expect(drawer.getByTestId('cart-line')).toHaveCount(1);
  await drawer.getByRole('button', { name: /^Remove .* from cart$/ }).click();
  await expect(drawer.getByText('Your cart is empty now')).toBeVisible();
  await drawer.getByRole('button', { name: 'Undo' }).click();
  await expect(drawer.getByTestId('cart-line')).toHaveCount(1);
});

test('server quantity adjustment is applied with an inline notice', async ({ page }) => {
  await page.goto('/products');
  const card = page.getByTestId('product-card').first();
  await card.getByRole('button', { name: 'Add to cart' }).click();
  // Simulate the batch selling down to 2 jars while the cart sat in localStorage
  await page.route('**/api/v1/cart/quote', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    for (const line of body.data.items) {
      line.availableQuantity = 2;
      line.quantity = Math.min(line.requestedQuantity, 2);
      line.issue = line.requestedQuantity > 2 ? 'QTY_REDUCED' : null;
      line.lineTotalPaise = line.unitPricePaise * line.quantity;
    }
    await route.fulfill({ response: res, json: body });
  });
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('pk-cart-v1')!);
    raw.state.items[0].quantity = 5;
    localStorage.setItem('pk-cart-v1', JSON.stringify(raw));
  });
  await page.reload();
  await page.getByTestId('cart-button').click();
  const drawer = page.getByTestId('cart-drawer');
  await expect(drawer.getByText('Only 2 jars available — quantity updated')).toBeVisible();
  await expect(drawer.getByRole('heading', { name: /Your cart\s*2 jars/ })).toBeVisible();
  await expect(drawer.getByRole('button', { name: /Increase quantity/ })).toBeDisabled();
});

test('pincode checker reports serviceable / not serviceable and remembers the pincode', async ({ page }) => {
  await page.route('**/api/v1/shipping/check-pincode', async (route) => {
    const { pincode } = route.request().postDataJSON() as { pincode: string };
    const serviceable = pincode !== '999999';
    await route.fulfill({
      json: {
        success: true,
        data: { pincode, serviceable, estimatedDays: serviceable ? { min: 2, max: 4 } : null, courierHint: null },
        error: null,
        requestId: 'req_test',
        timestamp: new Date().toISOString(),
      },
    });
  });
  await page.goto('/products');
  await page.getByTestId('product-card').first().getByRole('heading', { level: 3 }).getByRole('link').click();
  const checker = page.getByTestId('pincode-checker');
  const input = checker.getByLabel('Check delivery to your pincode');
  await input.fill('110001');
  await expect(checker.getByText('We deliver to 110001')).toBeVisible();
  await expect(checker.getByText('Usually 2–4 days after dispatch')).toBeVisible();
  await input.fill('999999');
  await expect(checker.getByText(/can.t deliver to 999999/)).toBeVisible();
  await input.fill('012345');
  await expect(checker.getByText('Enter a valid 6-digit pincode')).toBeVisible();
  await input.fill('110001');
  await expect(checker.getByText('We deliver to 110001')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('pincode-checker').getByLabel('Check delivery to your pincode')).toHaveValue('110001');
});
