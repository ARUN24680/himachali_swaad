import type { AdminDashboardResponse, AdminOpsMetricsResponse, AdminTestAlertResponse } from '@pk/shared';
import { http } from '@/services/api/http';

/** GET /admin/dashboard — one aggregated payload, cached 60 s server-side (Phase 9 §9.2). */
export const dashboardApi = {
  get: (signal?: AbortSignal) => http<AdminDashboardResponse>('/admin/dashboard', { signal }),
  /** Phase 10 §10.3: last-24h orders per IST hour + 30-day refunds / NDR / RTO. */
  opsMetrics: (signal?: AbortSignal) => http<AdminOpsMetricsResponse>('/admin/ops/metrics', { signal }),
  /** Queues a WhatsApp + e-mail test alert to every admin (audited server-side). */
  sendTestAlert: () => http<AdminTestAlertResponse>('/admin/ops/test-alert', { method: 'POST', body: {} }),
};
