import type { MeResponse } from '@pk/shared';
import { useQuery } from '@tanstack/react-query';
import { http, isApiError } from '@/services/api/http';
import { queryKeys } from '@/services/api/query-keys';

/** Signed-in staff member (GET /auth/me). Signed out = error with code UNAUTHENTICATED. */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    // Guards render their own signed-out UI, so no global redirect from here
    queryFn: ({ signal }) => http<MeResponse>('/auth/me', { signal, redirectOnAuthFailure: false }),
    staleTime: 5 * 60_000,
    retry: (count, err) => isApiError(err, 'NETWORK_ERROR') && count < 2,
  });
}

export const isSignedOutError = (err: unknown) => isApiError(err, 'UNAUTHENTICATED') || isApiError(err, 'FORBIDDEN');
