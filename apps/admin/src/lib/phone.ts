/** '98765 43210' / '+91 98765…' → '+919876543210'; '' → undefined. Anything else is returned trimmed for the schema to reject. */
export function normalisePhone(raw: string): string | undefined {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return undefined;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return raw.trim();
}

/** '+919876543210' → '9876543210' for an input that shows a fixed +91 prefix. */
export const localPhone = (e164: string | null | undefined) => (e164 ? e164.replace(/^\+91/, '') : '');
