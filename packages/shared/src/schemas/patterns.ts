/**
 * Zod-free validation patterns. Browser code imports these via `@pk/shared/patterns` so the
 * client bundle doesn't pull in zod; the Zod schemas in common.ts are built from the same regexes.
 */
/** E.164 Indian mobile: +91 followed by 10 digits starting 6–9 (users_phone_format CHECK). */
export const PHONE_REGEX = /^\+91[6-9]\d{9}$/;
/** 6-digit Indian PIN code, cannot start with 0 (pickup_locations CHECK). */
export const PINCODE_REGEX = /^[1-9]\d{5}$/;

/** +919876543210 → +91******3210 (every auth response masks the phone). */
export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  return `${phone.slice(0, 3)}******${phone.slice(-4)}`;
}
