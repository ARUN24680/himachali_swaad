import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/query-keys';
import { settingsApi } from '../api/settingsApi';

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: ({ signal }) => settingsApi.list(signal).then((r) => r.settings),
  });
}

export function useUpdateSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => settingsApi.update(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings }),
  });
}
