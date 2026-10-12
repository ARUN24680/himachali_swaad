import { useQuery } from '@tanstack/react-query';
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
