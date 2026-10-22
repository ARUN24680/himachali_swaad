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

/**
 * Set by checkout when THIS tab places the order. The order page uses it to empty the cart once the
 * order is paid — needed for Direct UPI, which leaves the store for the pay page and comes back to
 * /order/<code> without checkout's success callback. One-shot: taking it removes it, so the cart is
 * cleared at most once, and someone opening an order link elsewhere (no marker) never loses theirs.
 */
const placedKey = (orderCode: string) => `pk-order-placed:${orderCode}`;

export function markOrderPlacedHere(orderCode: string): void {
  try {
    window.sessionStorage.setItem(placedKey(orderCode), '1');
  } catch {
    // ignore — worst case the cart keeps the paid jars and the shopper removes them
  }
}

/** True (and the marker is removed) if this tab placed the order and hasn't consumed the marker yet. */
export function takeOrderPlacedHere(orderCode: string): boolean {
  try {
    if (window.sessionStorage.getItem(placedKey(orderCode)) !== '1') return false;
    window.sessionStorage.removeItem(placedKey(orderCode));
    return true;
  } catch {
    return false;
  }
}
