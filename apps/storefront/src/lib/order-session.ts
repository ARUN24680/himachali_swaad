import { PHONE_REGEX } from '@pk/shared/patterns';

/**
 * The phone used at checkout, kept per order code for this browser tab (Phase 5 §5.11). Guests prove
 * ownership of `/order/:code` with it; a new device asks for it instead. Session storage only — it is
 * gone when the tab closes, and nothing else (address, name) is ever stored.
 */
const key = (orderCode: string) => `pk-order-phone:${orderCode}`;

export function rememberOrderPhone(orderCode: string, phone: string): void {
  try {
    window.sessionStorage.setItem(key(orderCode), phone);
  } catch {
    // storage blocked — the order page falls back to asking for the phone
  }
}

export function readOrderPhone(orderCode: string): string | undefined {
  try {
    const v = window.sessionStorage.getItem(key(orderCode));
    return v && PHONE_REGEX.test(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Set by checkout right after a successful payment (verify OK, or paid-then-left in the mock). The
 * order page then shows "Confirming your payment…" for a PENDING_PAYMENT order instead of offering
 * to pay again while the webhook is still on its way.
 */
const paidKey = (orderCode: string) => `pk-order-paid:${orderCode}`;

export function markOrderPaid(orderCode: string): void {
  try {
    window.sessionStorage.setItem(paidKey(orderCode), '1');
  } catch {
    // ignore
  }
}

export function wasOrderPaid(orderCode: string): boolean {
  try {
    return window.sessionStorage.getItem(paidKey(orderCode)) === '1';
  } catch {
    return false;
  }
}
