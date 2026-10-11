/** Server-generated batch codes (D-42): PK-<YYMM>-<SKU>-<seq>, seq per product per month, min 2 digits. */
export const SKU_REGEX = /^[A-Z0-9]{2,20}$/;
export const BATCH_CODE_REGEX = /^PK-\d{4}-[A-Z0-9]{2,20}-\d{2,}$/;
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** '2026-10-11' + 'CHK250' → 'PK-2610-CHK250-' */
export function batchCodePrefix(manufacturedAt: string, sku: string): string {
  if (!ISO_DATE_REGEX.test(manufacturedAt)) throw new TypeError(`Expected YYYY-MM-DD, got ${manufacturedAt}`);
  if (!SKU_REGEX.test(sku)) throw new TypeError(`Invalid SKU ${sku}`);
  return `PK-${manufacturedAt.slice(2, 4)}${manufacturedAt.slice(5, 7)}-${sku}-`;
}

export function formatBatchCode(manufacturedAt: string, sku: string, seq: number): string {
  if (!Number.isSafeInteger(seq) || seq < 1) throw new RangeError(`Batch sequence must be ≥ 1, got ${seq}`);
  return `${batchCodePrefix(manufacturedAt, sku)}${String(seq).padStart(2, '0')}`;
}

/** Today's calendar date in India (YYYY-MM-DD) — matches SQL ist_today(). */
export function todayInIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
