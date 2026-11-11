import type { AdminWaitlistQuery } from '@pk/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/api/query-keys';
import { waitlistApi } from '../api/waitlistApi';

export function useWaitlist(q: AdminWaitlistQuery) {
  return useQuery({
    queryKey: queryKeys.waitlist.list(q),
    queryFn: ({ signal }) => waitlistApi.list(q, signal),
    placeholderData: keepPreviousData,
  });
}
