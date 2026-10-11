/** Accepts what people actually type or paste: "98765 43210", "+91 98765-43210", "098765 43210". */
export function toNationalDigits(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return d.slice(2);
  if (d.length === 11 && d.startsWith('0')) return d.slice(1);
  return d.slice(0, 10);
}

/** "+919876543210" → "98765 43210" for display. */
export const formatNationalPhone = (e164: string) => {
  const d = e164.replace(/^\+91/, '');
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
};
