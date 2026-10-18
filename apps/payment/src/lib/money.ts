/** "1,234.5" / "1234" / "1234.50" → paise, by string arithmetic (no float maths on money, D-26). */
export function rupeesToPaise(text: string): number | null {
  const m = /^(\d{1,3}(?:,\d{2,3})*|\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const rupees = Number(m[1]!.replace(/,/g, ''));
  const paise = Number((m[2] ?? '').padEnd(2, '0'));
  const total = rupees * 100 + paise;
  return Number.isSafeInteger(total) ? total : null;
}

/** 12345 → "123.45" — the UPI `am` parameter format. */
export const paiseToRupees = (paise: number) => `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
