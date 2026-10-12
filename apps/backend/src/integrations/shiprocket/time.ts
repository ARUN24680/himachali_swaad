/**
 * Shiprocket timestamps are IST wall-clock strings without a zone, in a few shapes:
 * webhook `current_timestamp` 'DD MM YYYY HH:mm:ss', scans/track 'YYYY-MM-DD HH:mm:ss'. ISO strings
 * with a zone are taken as-is. Returns null when unparseable (the caller falls back to "now").
 */
export function parseShiprocketTime(value: string | null | undefined): Date | null {
  if (!value) return null;
  const v = value.trim();
  let m = /^(\d{2})[ -/](\d{2})[ -/](\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v);
  if (m) return ist(+m[3]!, +m[2]!, +m[1]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
  m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v);
  if (m) return ist(+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!, +(m[6] ?? 0));
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function ist(y: number, mo: number, d: number, h: number, mi: number, s: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s) - 5.5 * 3600_000);
}

/** 'YYYY-MM-DD HH:mm' in IST — Shiprocket's `order_date`. */
export function shiprocketOrderDate(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');
}
