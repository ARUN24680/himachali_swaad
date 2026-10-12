import type { MyOrderDetail, MyOrdersResponse } from '@pk/shared';
import { apiRequest } from '@/lib/api-client';

/** OTP-signed-in customer's orders (Phase 8 §8.3, D-18) — session cookie, no phone needed. */
export const myOrdersApi = {
  list: (page: number, pageSize: number, signal?: AbortSignal) =>
    apiRequest<MyOrdersResponse>(`/me/orders?page=${page}&pageSize=${pageSize}`, { signal }),
  detail: (orderCode: string, signal?: AbortSignal) =>
    apiRequest<MyOrderDetail>(`/me/orders/${encodeURIComponent(orderCode)}`, { signal }),
};
