import type {
  AdjustmentRequest,
  Batch,
  BatchCreateRequest,
  BatchListQuery,
  BatchListResponse,
  BatchProductOption,
  ExpiryAlertsResponse,
  Movement,
  PickupLocationSummary,
} from '@pk/shared';
import { http } from '@/services/api/http';

type BatchEnvelope = { batch: Batch };

function toQueryString(q: BatchListQuery): string {
  const params = new URLSearchParams();
  if (q.productId) params.set('productId', q.productId);
  if (q.locationId) params.set('locationId', q.locationId);
  if (q.status) params.set('status', q.status);
  if (q.includeEmpty) params.set('includeEmpty', q.includeEmpty);
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Typed calls for /batches and kitchen lookups (Phase 3 §3.4–3.5). ADMIN + KITCHEN_PARTNER. */
export const inventoryApi = {
  list: (q: BatchListQuery, signal?: AbortSignal) => http<BatchListResponse>(`/batches${toQueryString(q)}`, { signal }),
  productOptions: (signal?: AbortSignal) =>
    http<{ products: BatchProductOption[] }>('/batches/product-options', { signal }),
  pickupLocations: (signal?: AbortSignal) =>
    http<{ locations: PickupLocationSummary[] }>('/partner/pickup-locations', { signal }),
  create: (body: BatchCreateRequest) => http<BatchEnvelope>('/batches', { method: 'POST', body }),
  updateNotes: (id: string, notes: string | null) =>
    http<BatchEnvelope>(`/batches/${id}`, { method: 'PATCH', body: { notes } }),
  adjust: (id: string, body: AdjustmentRequest) =>
    http<BatchEnvelope>(`/batches/${id}/adjustments`, { method: 'POST', body }),
  /** ADMIN only (Phase 9 §9.6): sellable window ends within 14 days. */
  expiryAlerts: (signal?: AbortSignal) => http<ExpiryAlertsResponse>('/admin/inventory/expiry-alerts', { signal }),
  movements: (id: string, signal?: AbortSignal) =>
    http<{ movements: Movement[] }>(`/batches/${id}/movements`, { signal }),
};
