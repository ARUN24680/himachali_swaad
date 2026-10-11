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
