import type { MeResponse } from '@pk/shared';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import { clearOfflineData, saveIdentity } from '@/lib/offline-cache';
import { http, isApiError } from '@/services/api/http';
import { queryKeys } from '@/services/api/query-keys';

/** Signed-in staff member (GET /auth/me). Signed out = error with code UNAUTHENTICATED. */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    // Guards render their own signed-out UI, so no global redirect from here
    queryFn: async ({ signal }) => {
      try {
        const me = await http<MeResponse>('/auth/me', { signal, redirectOnAuthFailure: false });
        saveIdentity(me); // desk roles only — powers the offline cold start (lib/offline-cache)
        return me;
      } catch (err) {
        // The SERVER said no (401/403) → the cached desk identity + queues must go too
        if (isSignedOutError(err)) await clearOfflineData();
        throw err;
      }
    },
    staleTime: 5 * 60_000,
    // Retry a flaky network, but not when the phone knows it's offline (the guard goes offline-mode)
    retry: (count, err) => isApiError(err, 'NETWORK_ERROR') && navigator.onLine && count < 2,
  });
}

export const isSignedOutError = (err: unknown) => isApiError(err, 'UNAUTHENTICATED') || isApiError(err, 'FORBIDDEN');
export const isNetworkError = (err: unknown) => isApiError(err, 'NETWORK_ERROR');

/**
 * Set by AuthGuard when the desk runs from the cached identity because the API is unreachable
 * (offline cold start). null = normal online session.
 */
export const OfflineSessionContext = createContext<MeResponse | null>(null);

/**
 * Who is signed in, for rendering: the live /auth/me answer, or the cached desk identity in offline
 * mode (`offline: true`). Guards and desk pages use this; admin pages keep `useMe()` (online-only).
 */
export function useSession(): { me: MeResponse | undefined; offline: boolean } {
  const me = useMe();
  const offlineMe = useContext(OfflineSessionContext);
  if (me.data) return { me: me.data, offline: false };
  return offlineMe ? { me: offlineMe, offline: true } : { me: undefined, offline: false };
}
