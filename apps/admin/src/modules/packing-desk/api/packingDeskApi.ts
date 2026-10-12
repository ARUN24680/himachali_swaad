import type {
  MarkPackedResponse,
  PackingChecklist,
  PartnerManifestsResponse,
  PartnerOrdersQuery,
  PartnerOrdersResponse,
  PushConfigResponse,
  PushSubscriptionRequest,
  SignedUrlResponse,
} from '@pk/shared';
import { http } from '@/services/api/http';

type OrderStatusTab = NonNullable<PartnerOrdersQuery['status']>;

/** Typed calls for /partner/* (Phase 7, packages/shared/src/contracts/partner.ts). KITCHEN_PARTNER + ADMIN. */
export const packingDeskApi = {
  orders: (status: OrderStatusTab, signal?: AbortSignal) =>
    http<PartnerOrdersResponse>(`/partner/orders?status=${status}`, { signal }),

  /** Idempotent by state (D-54 b): replays with the same key answer 200 `changed: false`. */
  markPacked: (orderCode: string, idempotencyKey: string, checklist: PackingChecklist) =>
    http<MarkPackedResponse>(`/partner/orders/${encodeURIComponent(orderCode)}/mark-packed`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: { checklist },
    }),

  /** 5-minute signed 4×6 PDF (D-11, D-37). 404 = label not ready yet. */
  label: (orderCode: string) => http<SignedUrlResponse>(`/partner/orders/${encodeURIComponent(orderCode)}/label`),

  /** 4 labels per A4 page, 1–20 orders (cyber-café print). */
  a4Labels: (orderCodes: string[]) =>
    http<SignedUrlResponse>(`/partner/labels/a4?orders=${orderCodes.map(encodeURIComponent).join(',')}`),

  manifests: (signal?: AbortSignal) => http<PartnerManifestsResponse>('/partner/manifests', { signal }),

  pushConfig: (signal?: AbortSignal) => http<PushConfigResponse>('/partner/push-subscriptions', { signal }),
  subscribePush: (body: PushSubscriptionRequest) =>
    http<unknown>('/partner/push-subscriptions', { method: 'POST', body }),
  unsubscribePush: (endpoint: string) =>
    http<unknown>('/partner/push-subscriptions', { method: 'DELETE', body: { endpoint } }),
};
