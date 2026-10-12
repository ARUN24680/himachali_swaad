/**
 * Pickup day (D-36, Phase 6 §6.7): packed before the IST cut-off on a working day → that day's
 * pickup batch; otherwise the next working day. Couriers don't pick up on Sundays; public
 * holidays are not modelled (the batch simply books the next run, admin can reschedule).
 */
const IST_OFFSET_MS = 5.5 * 3600_000;

const isWorkingDay = (istMidnightUtcMs: number) => new Date(istMidnightUtcMs).getUTCDay() !== 0;

/** 'YYYY-MM-DD' (IST) of the pickup batch an order packed at `packedAt` belongs to. */
export function pickupDateFor(packedAt: Date, cutoffHourIst: number): string {
  const ist = new Date(packedAt.getTime() + IST_OFFSET_MS);
  let day = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  if (!isWorkingDay(day) || ist.getUTCHours() >= cutoffHourIst) {
    do day += 86_400_000;
    while (!isWorkingDay(day));
  }
  return new Date(day).toISOString().slice(0, 10);
}

/** Has today's (IST) cut-off passed at `now`? The pickup batch books once it has. */
export function isPastCutoff(now: Date, cutoffHourIst: number): boolean {
  return new Date(now.getTime() + IST_OFFSET_MS).getUTCHours() >= cutoffHourIst;
}

/** The next pickup cut-off instant at or after `now` (IST, working days) — the partner's "pack by". */
export function nextCutoff(now: Date, cutoffHourIst: number): Date {
  const day = pickupDateFor(now, cutoffHourIst); // 'YYYY-MM-DD'
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, cutoffHourIst, 0) - IST_OFFSET_MS);
}
