import { newUuid } from '@pk/shared/uuid';
import type { CartItem } from '@/modules/cart';

/**
 * Idempotency-Key per checkout attempt (Phase 5 §5.4, 07 §4.1). Kept in sessionStorage so a
 * double-click, a retry or a reload in the same tab resends the SAME key (the backend then returns the
 * same order instead of reserving twice). A new key is made only when the cart changes or the order
 * behind the old key can no longer be paid (expired / cancelled / payment init failed).
 */
const STORAGE_KEY = 'pk-checkout-attempt-v1';

interface StoredAttempt {
  key: string;
  cart: string;
}

/** Stable signature of the cart lines (order-independent). */
export const cartSignature = (items: CartItem[]) =>
  items
    .map((i) => `${i.productId}:${i.quantity}`)
    .sort()
    .join('|');

function read(): StoredAttempt | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const v = raw ? (JSON.parse(raw) as Partial<StoredAttempt>) : null;
    return v && typeof v.key === 'string' && typeof v.cart === 'string' ? { key: v.key, cart: v.cart } : null;
  } catch {
    return null;
  }
}

function write(v: StoredAttempt): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(v));
  } catch {
    // blocked storage: the key still lives for this call; a reload makes a new one (server-safe)
  }
}

/** The key for this cart — reused while the cart is unchanged. */
export function attemptKeyFor(cart: string): string {
  const existing = read();
  if (existing && existing.cart === cart) return existing.key;
  const next = { key: newUuid(), cart };
  write(next);
  return next.key;
}

/** Force a fresh key (expired / cancelled order, payment init failure, idempotency conflict). */
export function renewAttemptKey(cart: string): string {
  const next = { key: newUuid(), cart };
  write(next);
  return next.key;
}

export function clearAttemptKey(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
