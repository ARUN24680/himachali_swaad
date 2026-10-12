const IST = 'Asia/Kolkata';

/** "14 Oct, 6:42 pm" in IST. */
export const formatWhen = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: IST,
  }).format(new Date(iso));

/** "4 Oct 2026" — calendar dates ('YYYY-MM-DD') or ISO instants, read in IST. */
export const formatDay = (value: string, opts: { weekday?: boolean; year?: boolean } = {}) =>
  new Intl.DateTimeFormat('en-IN', {
    weekday: opts.weekday ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
    year: opts.year === false ? undefined : 'numeric',
    timeZone: IST,
  }).format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+05:30` : value));
