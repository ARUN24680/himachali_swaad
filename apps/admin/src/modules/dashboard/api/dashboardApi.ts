import type { AdminDashboardResponse } from '@pk/shared';
import { http } from '@/services/api/http';

/** GET /admin/dashboard — one aggregated payload, cached 60 s server-side (Phase 9 §9.2). */
export const dashboardApi = {
  get: (signal?: AbortSignal) => http<AdminDashboardResponse>('/admin/dashboard', { signal }),
};
