import type { KitchenCreateRequest, KitchenListResponse, KitchenRow, KitchenUpdateRequest } from '@pk/shared';
import { http } from '@/services/api/http';

/** Kitchens = pickup_locations (Shiprocket pickup addresses). ADMIN only; create/update return the row. */
export const kitchensApi = {
  list: (signal?: AbortSignal) => http<KitchenListResponse>('/admin/kitchens', { signal }),
  create: (body: KitchenCreateRequest) => http<KitchenRow>('/admin/kitchens', { method: 'POST', body }),
  update: (id: string, body: KitchenUpdateRequest) =>
    http<KitchenRow>(`/admin/kitchens/${id}`, { method: 'PATCH', body }),
};
