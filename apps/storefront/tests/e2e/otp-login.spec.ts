import { expect, test, type Page, type Route } from '@playwright/test';

/**
 * Customer OTP sign-in sheet (Phase 2 §2.7). The API is mocked with page.route — the dev OTP is
 * only visible in backend logs, so tests can't read it.
 */
const API = 'http://localhost:4000/api/v1';
const ORIGIN = 'http://localhost:3000';
const PHONE_DIGITS = '9876543210';

const user = {
  id: '0b7f8a62-3c1d-4f5e-9a2b-8c7d6e5f4a3b',
  role: 'CUSTOMER',
  fullName: null,
  phoneMasked: '+91******3210',
  email: null,
  totpEnabled: false,
};

const envelope = (data: unknown) => ({
  success: true,
  data,
  error: null,
  requestId: 'req_test',
  timestamp: new Date().toISOString(),
});
const failure = (code: string, message: string, details?: Record<string, unknown>) => ({
  success: false,
  data: null,
  error: { code, message, ...(details ? { details } : {}) },
  requestId: 'req_test',
  timestamp: new Date().toISOString(),
});

const cors = {
  'access-control-allow-origin': ORIGIN,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type, accept',
  'access-control-allow-methods': 'GET, POST',
};

async function reply(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(body) });
}

interface MockOptions {
  sendResponse?: { status: number; body: unknown };
  /** OTP codes the mock accepts. Anything else → OTP_INVALID. */
  validCode?: string;
}

async function mockAuthApi(page: Page, opts: MockOptions = {}) {
  const state = { signedIn: false, sendCalls: 0, verifyBodies: [] as unknown[] };
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const path = new URL(req.url()).pathname.replace('/api/v1', '');
    switch (path) {
      case '/auth/me':
        return state.signedIn
          ? reply(route, 200, envelope({ user, pickupLocationIds: [] }))
          : reply(route, 401, failure('UNAUTHENTICATED', 'Please sign in.'));
      case '/auth/refresh':
        return reply(route, 401, failure('UNAUTHENTICATED', 'Please sign in.'));
      case '/auth/otp/send':
        state.sendCalls++;
        if (opts.sendResponse) return reply(route, opts.sendResponse.status, opts.sendResponse.body);
        return reply(route, 200, envelope({ sent: true, resendAfterSec: 30 }));
      case '/auth/otp/verify': {
        const body = req.postDataJSON() as { otp: string };
        state.verifyBodies.push(body);
        if (body.otp !== (opts.validCode ?? '424242'))
          return reply(route, 400, failure('OTP_INVALID', 'That code is incorrect or has expired.'));
        state.signedIn = true;
        return reply(route, 200, envelope({ user }));
      }
      case '/auth/logout':
        state.signedIn = false;
        return reply(route, 200, envelope({ loggedOut: true }));
      default:
        return reply(route, 404, failure('NOT_FOUND', 'Not found'));
    }
  });
  return state;
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`OTP sheet: phone → wrong code → right code → signed in → sign out (${scheme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const api = await mockAuthApi(page);
    const shot = (name: string) =>
      page.screenshot({ path: testInfo.outputPath(`otp-${name}-${testInfo.project.name}-${scheme}.png`) });

    await page.goto('/');
    const signIn = page.getByRole('button', { name: 'Sign in' });
    await expect(signIn).toBeVisible();
    await signIn.click();

    const dialog = page.getByRole('dialog');
    await expect(page.getByRole('dialog', { name: 'Sign in with your mobile number' })).toBeVisible();
    await expect(dialog.getByText('you can also check out as a guest')).toBeVisible();

    // Layout: bottom sheet on phones, centered dialog from 640px
    const box = (await dialog.boundingBox())!;
    const viewport = page.viewportSize()!;
    if (viewport.width < 640) {
      expect(Math.round(box.y + box.height), JSON.stringify(box)).toBe(viewport.height);
      expect(Math.round(box.width)).toBe(viewport.width);
    } else {
      expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2);
      expect(box.y + box.height).toBeLessThan(viewport.height);
    }

    const phone = dialog.getByLabel('Mobile number');
    await expect(phone).toBeFocused();
    await expect(phone).toHaveAttribute('inputmode', 'numeric');
    await expect(phone).toHaveAttribute('autocomplete', 'tel-national');
    await shot('phone-step');

    // Client-side validation
    await phone.fill('12345');
    await dialog.getByRole('button', { name: 'Send code' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Enter your 10-digit mobile number');
    expect(api.sendCalls).toBe(0);

    // A pasted "+91 98765 43210" is normalised to 10 digits
    await phone.fill(`+91 98765 43210`);
    await expect(phone).toHaveValue(PHONE_DIGITS);
    await dialog.getByRole('button', { name: 'Send code' }).click();

    await expect(page.getByRole('dialog', { name: 'Enter your code' })).toBeVisible();
    await expect(dialog.getByText('+91 ******3210')).toBeVisible();
    await expect(dialog.getByText(/Resend in 0:(30|29|28)/)).toBeVisible();
    const first = dialog.getByLabel('Digit 1 of 6');
    await expect(first).toBeFocused();
    await expect(first).toHaveAttribute('autocomplete', 'one-time-code');
    await expect(first).toHaveAttribute('inputmode', 'numeric');

    // Typing auto-advances and auto-submits on the 6th digit → wrong code
    await page.keyboard.type('111111');
    await expect(dialog.getByRole('alert')).toContainText("That code didn't match");
    await expect(dialog.getByRole('alert')).toContainText('4 tries left');
    await expect(first).toHaveValue('');
    await expect(first).toBeFocused(); // caret returns so the user can just retype
    await shot('otp-error');

    // Paste the full code into box 1 (what SMS autofill does) → auto-submit → signed in
    await first.click();
    await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement;
      const dt = new DataTransfer();
      dt.setData('text/plain', '424242');
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    // Chromium doesn't insert on synthetic paste events — fall back to inserting the text the way autofill does
    if ((await first.inputValue()) === '') await page.keyboard.insertText('424242');

    await expect(dialog).toBeHidden();
    expect(api.verifyBodies.at(-1)).toEqual({ phone: `+91${PHONE_DIGITS}`, otp: '424242' });

    const account = page.getByRole('button', { name: /Account menu, signed in as \+91 \*{6}3210/ });
    await expect(account).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await shot('signed-in');

    await account.click();
    await expect(page.getByRole('menu')).toContainText('+91 ******3210');
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });
}

test('OTP sheet shows the wait time when the API rate-limits code requests', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockAuthApi(page, {
    sendResponse: {
      status: 429,
      body: failure('RATE_LIMITED', 'Too many codes requested. Try again later.', { retryAfterSeconds: 290 }),
    },
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Mobile number').fill(PHONE_DIGITS);
  await dialog.getByRole('button', { name: 'Send code' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Too many code requests. Please try again in 5 minutes.');
  await expect(dialog.getByRole('button', { name: 'Send code' })).toBeDisabled();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath(`otp-rate-limited-${testInfo.project.name}.png`) });
});

test('OTP sheet explains a network failure', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockAuthApi(page);
  await page.route(`${API}/auth/otp/send`, (route) => route.abort('internetdisconnected'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Mobile number').fill(PHONE_DIGITS);
  await dialog.getByRole('button', { name: 'Send code' }).click();
  await expect(dialog.getByRole('alert')).toContainText('You seem to be offline');
});
