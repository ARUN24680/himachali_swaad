import { PincodeSchema } from '@pk/shared';

/** Last pincode the customer checked (Phase 4 §4.6) — prefills the checker, cart quote and Phase 5 checkout. */
const KEY = 'pk-last-pincode';

export function readLastPincode(): string | undefined {
  try {
    const value = window.localStorage.getItem(KEY);
    return value && PincodeSchema.safeParse(value).success ? value : undefined;
  } catch {
    return undefined; // private mode / SSR
  }
}

export function writeLastPincode(pincode: string): void {
  try {
    window.localStorage.setItem(KEY, pincode);
  } catch {
    // storage full or blocked — non-critical
  }
}
