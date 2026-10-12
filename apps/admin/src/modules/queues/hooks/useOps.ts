import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/query-keys';
import { opsApi } from '../api/opsApi';

export function useWebhookFailures(enabled = true) {
  return useQuery({
    queryKey: queryKeys.webhookFailures,
    queryFn: ({ signal }) => opsApi.webhookFailures(signal).then((r) => r.events),
    enabled,
  });
}

export function useReplayWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => opsApi.replay(id),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.webhookFailures }),
        qc.invalidateQueries({ queryKey: queryKeys.orders.all }),
      ]),
  });
}
