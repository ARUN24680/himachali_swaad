import type { AdminWaitlistQuery, AdminWaitlistResponse } from '@pk/shared';
import { http } from '@/services/api/http';

const qs = (q: AdminWaitlistQuery) => {
  const p = new URLSearchParams();
  if (q.q) p.set('q', q.q);
  if (q.source) p.set('source', q.source);
  if (q.page && q.page !== 1) p.set('page', String(q.page));
  if (q.pageSize) p.set('pageSize', String(q.pageSize));
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** Pre-launch waitlist (audit 2026-11-03, R-5). ADMIN only — phone and e-mail are PII. */
export const waitlistApi = {
  list: (q: AdminWaitlistQuery, signal?: AbortSignal) =>
    http<AdminWaitlistResponse>(`/admin/waitlist${qs(q)}`, { signal }),
  /** Streamed CSV (text/csv attachment) — fetched with credentials by services/api/download. */
  exportPath: '/admin/waitlist/export.csv',
};
