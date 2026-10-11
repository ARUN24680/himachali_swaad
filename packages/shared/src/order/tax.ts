/**
 * GST on GST-inclusive prices (D-26, D-32). Integer paise only.
 * tax = round(lineTotal × rateBp / (10000 + rateBp)) — Phase 5 §5.10, CA to confirm format (Phase 0).
 */
export function gstIncludedPaise(lineTotalPaise: number, gstRateBp: number): number {
  if (!Number.isSafeInteger(lineTotalPaise) || !Number.isSafeInteger(gstRateBp) || gstRateBp < 0) {
    throw new TypeError('gstIncludedPaise needs integer paise and basis points');
  }
  if (gstRateBp === 0) return 0;
  const num = lineTotalPaise * gstRateBp;
  const den = 10_000 + gstRateBp;
  // Round half up without floats: floor((2·num + den) / (2·den))
  return Math.floor((2 * num + den) / (2 * den));
}

/** Indian financial year (April–March) for an IST calendar date 'YYYY-MM-DD' → '2026-27'. */
export function financialYearOf(istDate: string): string {
  const [y, m] = istDate.split('-').map(Number) as [number, number];
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** D-32: PK/<FY>/<6-digit seq>, e.g. PK/2026-27/000123. */
export function formatInvoiceNumber(financialYear: string, seq: number): string {
  return `PK/${financialYear}/${String(seq).padStart(6, '0')}`;
}

/** 'YYYY-MM-DD' of an instant in IST. */
export function istDateOf(instant: Date): string {
  return new Date(instant.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
}
