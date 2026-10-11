import type { CancelOrderResponse, InvoiceUrlResponse, OrderStatusResponse } from '@pk/shared';
import { apiRequest } from '@/lib/api-client';

const access = (phone: string | undefined) => (phone ? `?phone=${encodeURIComponent(phone)}` : '');

/** Customer order endpoints (Phase 5 §5.8, §5.10, §5.11). Guests pass the checkout phone; owners don't. */
export const ordersApi = {
  status: (orderCode: string, phone: string | undefined, signal?: AbortSignal) =>
    apiRequest<OrderStatusResponse>(`/orders/${encodeURIComponent(orderCode)}/status${access(phone)}`, { signal }),

  /** 5-minute signed URL to the private invoice PDF (D-11). */
  invoice: (orderCode: string, phone: string | undefined) =>
    apiRequest<InvoiceUrlResponse>(`/orders/${encodeURIComponent(orderCode)}/invoice${access(phone)}`),

  /** Session owners only (`canCancel` tells the UI when it's allowed). */
  cancel: (orderCode: string, reason: string) =>
    apiRequest<CancelOrderResponse>(`/orders/${encodeURIComponent(orderCode)}/cancel`, {
      method: 'POST',
      body: { reason },
    }),
};
