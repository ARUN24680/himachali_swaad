/**
 * ₹ / % text ↔ integers for form inputs (D-26). Pure string math — "399.10" never becomes
 * 39909.999… paise. Display formatting stays with `formatINR` from @pk/shared.
 */

const DECIMAL_2 = /^(\d{1,12})(?:\.(\d{0,2}))?$/;

/** Strip spaces, commas and a leading ₹ so "₹1,299.50" parses. */
const clean = (raw: string) => raw.replace(/[\s,₹]/g, '');

/** "399" → 39900, "399.5" → 39950, "0.05" → 5. Returns null for empty / invalid / > 2 decimals. */
export function rupeesToPaise(raw: string): number | null {
  const m = DECIMAL_2.exec(clean(raw));
  if (!m) return null;
  const whole = m[1] ?? '0';
  const frac = (m[2] ?? '').padEnd(2, '0');
  const paise = Number(whole) * 100 + Number(frac);
  return Number.isSafeInteger(paise) ? paise : null;
}

/** 39950 → "399.50", 39900 → "399" (form field value, not a display price). */
export function paiseToRupeesInput(paise: number | null | undefined): string {
  if (paise == null) return '';
  const whole = Math.trunc(paise / 100);
  const frac = paise % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
}

/** GST shown as % but stored as basis points: "5" → 500, "12.5" → 1250, "0.25" → 25. */
export function percentToBasisPoints(raw: string): number | null {
  const m = DECIMAL_2.exec(clean(raw).replace(/%$/, ''));
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(bp) ? bp : null;
}

/** 500 → "5", 1250 → "12.5" */
export function basisPointsToPercentInput(bp: number | null | undefined): string {
  if (bp == null) return '';
  const whole = Math.trunc(bp / 100);
  const frac = bp % 100;
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

/** Same rounding as the DB generated column: ROUND(total / qty) (half away from zero), integers only. */
export function costPerUnitPaise(totalPaise: number, quantity: number): number {
  return Math.floor((2 * totalPaise + quantity) / (2 * quantity));
}
