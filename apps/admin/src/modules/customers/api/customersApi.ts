import type { AdminCustomerDetail, AdminCustomersQuerySchema, AdminCustomersResponseSchema } from '@pk/shared';
import type { z } from 'zod';
import { http } from '@/services/api/http';

export type CustomersQuery = z.input<typeof AdminCustomersQuerySchema>;
export type CustomersResponse = z.infer<typeof AdminCustomersResponseSchema>;

const qs = (q: CustomersQuery) => {
  const p = new URLSearchParams();
  if (q.q) p.set('q', q.q);
  if (q.page && q.page !== 1) p.set('page', String(q.page));
  if (q.pageSize) p.set('pageSize', String(q.pageSize));
  if (q.sort) p.set('sort', q.sort);
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** Customers (Phase 9 §9.5) — registered users + guest phones. ADMIN only; PII. */
export const customersApi = {
  list: (q: CustomersQuery, signal?: AbortSignal) => http<CustomersResponse>(`/admin/customers${qs(q)}`, { signal }),
  /** Phone is E.164 in the path, url-encoded ('+' → %2B). */
  detail: (phone: string, signal?: AbortSignal) =>
    http<AdminCustomerDetail>(`/admin/customers/${encodeURIComponent(phone)}`, { signal }),
};
