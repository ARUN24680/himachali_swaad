import type { SettlementDetail, SettlementGenerateRequest, SettlementSummary, SignedUrlResponse } from '@pk/shared';
import { http } from '@/services/api/http';

type List = { settlements: SettlementSummary[] };

/** ADMIN settlements (Phase 9 §9.9, D-40, D-41): generate DRAFT → finalize → mark paid. */
export const settlementsApi = {
  list: (signal?: AbortSignal) => http<List>('/admin/settlements', { signal }),
  generate: (body: SettlementGenerateRequest) => http<SettlementDetail>('/admin/settlements', { method: 'POST', body }),
  detail: (id: string, signal?: AbortSignal) => http<SettlementDetail>(`/admin/settlements/${id}`, { signal }),
  remove: (id: string) => http<unknown>(`/admin/settlements/${id}`, { method: 'DELETE' }),
  finalize: (id: string) => http<SettlementDetail>(`/admin/settlements/${id}/finalize`, { method: 'POST', body: {} }),
  markPaid: (id: string, body: { bankReference: string; paidAt: string }) =>
    http<SettlementDetail>(`/admin/settlements/${id}/mark-paid`, { method: 'POST', body }),
  statement: (id: string) => http<SignedUrlResponse>(`/admin/settlements/${id}/statement`),
};

/** KITCHEN_PARTNER: own FINALIZED / PAID statements only, read-only + acknowledge once (D-40). */
export const partnerSettlementsApi = {
  list: (signal?: AbortSignal) => http<List>('/partner/settlements', { signal }),
  detail: (id: string, signal?: AbortSignal) => http<SettlementDetail>(`/partner/settlements/${id}`, { signal }),
  acknowledge: (id: string) =>
    http<SettlementDetail | { ok: true }>(`/partner/settlements/${id}/acknowledge`, { method: 'POST', body: {} }),
  statement: (id: string) => http<SignedUrlResponse>(`/partner/settlements/${id}/statement`),
};
