import type {
  AdminCancelOrderRequest,
  AdminOrderDetail,
  AdminOrdersQuery,
  AdminOrdersResponse,
  AdminRefundRequest,
  RESENDABLE_TEMPLATES,
  SignedUrlResponse,
} from '@pk/shared';
import { http } from '@/services/api/http';

type ActionResult = { ok: true; message: string };
const enc = encodeURIComponent;

export function ordersQueryString(q: AdminOrdersQuery): string {
  const p = new URLSearchParams();
  if (q.tab && q.tab !== 'all') p.set('tab', q.tab);
  if (q.status) p.set('status', q.status);
  if (q.q) p.set('q', q.q);
  if (q.from) p.set('from', q.from);
  if (q.to) p.set('to', q.to);
  if (q.page && q.page !== 1) p.set('page', String(q.page));
  if (q.pageSize) p.set('pageSize', String(q.pageSize));
  if (q.sort) p.set('sort', q.sort);
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Typed calls for the admin orders console (Phase 9 §9.3–9.4). ADMIN only. */
export const ordersApi = {
  list: (q: AdminOrdersQuery, signal?: AbortSignal) =>
    http<AdminOrdersResponse>(`/admin/orders${ordersQueryString(q)}`, { signal }),
  detail: (code: string, signal?: AbortSignal) => http<AdminOrderDetail>(`/admin/orders/${enc(code)}`, { signal }),
  cancel: (code: string, body: AdminCancelOrderRequest) =>
    http<unknown>(`/admin/orders/${enc(code)}/cancel`, { method: 'POST', body }),
  refund: (code: string, body: AdminRefundRequest, idempotencyKey: string) =>
    http<unknown>(`/admin/orders/${enc(code)}/refunds`, {
      method: 'POST',
      body,
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  resend: (code: string, template: (typeof RESENDABLE_TEMPLATES)[number]) =>
    http<ActionResult>(`/admin/orders/${enc(code)}/notifications/resend`, { method: 'POST', body: { template } }),
  retryShipment: (code: string) =>
    http<ActionResult>(`/admin/orders/${enc(code)}/retry-shipment`, { method: 'POST', body: {} }),
  resolveIssue: (code: string, note: string) =>
    http<ActionResult>(`/admin/orders/${enc(code)}/resolve-issue`, { method: 'POST', body: { note } }),
  addNote: (code: string, text: string) =>
    http<ActionResult>(`/admin/orders/${enc(code)}/notes`, { method: 'POST', body: { text } }),
  label: (code: string) => http<SignedUrlResponse>(`/admin/orders/${enc(code)}/label`),
  invoice: (code: string) => http<SignedUrlResponse>(`/orders/${enc(code)}/invoice`),
};
