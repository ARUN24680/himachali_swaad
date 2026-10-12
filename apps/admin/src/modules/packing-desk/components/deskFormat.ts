import type { Translate } from '@/i18n';
import { formatCalendarDate } from '@/lib/dates';

const IST = 'Asia/Kolkata';
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: IST });
const istDate = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(ms); // YYYY-MM-DD

/** '2026-10-12T05:30:00Z' → '11:00 am' (IST). */
export const formatIstTime = (iso: string) => timeFmt.format(new Date(iso));

/** Pickup cut-off hour (IST, 0–23) → '11:00 am'. */
export const formatCutoffHour = (hourIst: number) =>
  timeFmt.format(new Date(Date.UTC(2000, 0, 1, hourIst, 0) - 330 * 60_000));

/** 'aaj' / 'kal' / '14 Oct 2026' relative to `now`, in IST. */
export function istDayLabel(iso: string, now: number, t: Translate): string {
  const day = istDate(Date.parse(iso));
  if (day === istDate(now)) return t('common.today');
  if (day === istDate(now + 86_400_000)) return t('common.tomorrow');
  return formatCalendarDate(day);
}
