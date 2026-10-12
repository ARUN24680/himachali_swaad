import type { SettlementGenerateRequest } from '@pk/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/query-keys';
import { partnerSettlementsApi, settlementsApi } from '../api/settlementsApi';

// ── ADMIN ────────────────────────────────────────────────────────────────
export function useSettlements() {
  return useQuery({
    queryKey: queryKeys.settlements.list,
    queryFn: ({ signal }) => settlementsApi.list(signal).then((r) => r.settlements),
  });
}

export function useSettlement(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.settlements.detail(id ?? 'none'),
    queryFn: ({ signal }) => settlementsApi.detail(id as string, signal),
    enabled: Boolean(id),
  });
}

/** A settlement changed → lists, the detail and expense locks are stale. */
function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.settlements.all }),
      qc.invalidateQueries({ queryKey: queryKeys.expenses.all }),
    ]);
}

export function useGenerateSettlement() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (b: SettlementGenerateRequest) => settlementsApi.generate(b),
    onSuccess: () => invalidate(),
  });
}

export function useSettlementActions(id: string) {
  const invalidate = useInvalidate();
  const opts = { onSuccess: () => invalidate() };
  return {
    remove: useMutation({ mutationFn: () => settlementsApi.remove(id), ...opts }),
    finalize: useMutation({ mutationFn: () => settlementsApi.finalize(id), ...opts }),
    markPaid: useMutation({
      mutationFn: (b: { bankReference: string; paidAt: string }) => settlementsApi.markPaid(id, b),
      ...opts,
    }),
  };
}

// ── KITCHEN_PARTNER (desk "Hisaab") ─────────────────────────────────────
export function usePartnerSettlements() {
  return useQuery({
    queryKey: queryKeys.partner.settlements.all,
    queryFn: ({ signal }) => partnerSettlementsApi.list(signal).then((r) => r.settlements),
  });
}

export function usePartnerSettlement(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.partner.settlements.detail(id ?? 'none'),
    queryFn: ({ signal }) => partnerSettlementsApi.detail(id as string, signal),
    enabled: Boolean(id),
  });
}

export function useAcknowledgeSettlement(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => partnerSettlementsApi.acknowledge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.partner.settlements.all }),
  });
}
