/** Date helpers for API date strings. Calendar dates ('YYYY-MM-DD') are formatted in UTC so they never shift a day. */

const calendarFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});

/** '2026-10-11' → '11 Oct 2026' */
export function formatCalendarDate(isoDate: string): string {
  return calendarFmt.format(new Date(`${isoDate}T00:00:00Z`));
}

/** ISO datetime → '11 Oct, 2:05 pm' (IST) */
export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}

/** '2026-10-11' + 180 → '2027-04-09' (pure calendar math in UTC). */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const fullDateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});
const istDayFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });

/** ISO datetime → '11 Oct 2026, 2:05 pm' (IST) */
export function formatDateTimeFull(iso: string): string {
  return fullDateTimeFmt.format(new Date(iso));
}

/** ISO datetime → '11 Oct' (IST calendar day) */
export function formatIstDay(iso: string): string {
  return istDayFmt.format(new Date(iso));
}

/** '2026-10-01' → '1 Oct' (calendar date, no year) */
export function formatShortDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

/** "Oct 2026"-style first/last day of the IST month containing `isoDate`. */
export function monthRange(isoDate: string, offsetMonths = 0): { from: string; to: string } {
  const [y, m] = isoDate.split('-').map(Number) as [number, number];
  const start = new Date(Date.UTC(y, m - 1 + offsetMonths, 1));
  const end = new Date(Date.UTC(y, m + offsetMonths, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
