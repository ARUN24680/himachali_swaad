import { useMutation, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/query-keys';
import { dashboardApi } from '../api/dashboardApi';

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: ({ signal }) => dashboardApi.get(signal),
    staleTime: 60_000, // matches the server cache
    refetchInterval: 120_000,
  });
}

/** Operations section (Phase 10 §10.3). */
export function useOpsMetrics() {
  return useQuery({
    queryKey: queryKeys.opsMetrics,
    queryFn: ({ signal }) => dashboardApi.opsMetrics(signal),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

/** "Send test alert" — proves the WhatsApp / e-mail alert path end to end. Nothing to invalidate. */
export function useSendTestAlert() {
  return useMutation({ mutationFn: () => dashboardApi.sendTestAlert() });
}
