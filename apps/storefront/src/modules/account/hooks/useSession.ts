'use client';

import type { MeResponse } from '@pk/shared';
import { useQuery } from '@tanstack/react-query';
import { isApiError } from '@/lib/api-client';
import { authApi } from '../api/authApi';

export const sessionKeys = { me: ['auth', 'me'] as const };

/** `null` = signed out (guest). Guest checkout never needs a session (Phase 2 §2.2). */
export type Session = MeResponse | null;

async function fetchSession(signal: AbortSignal): Promise<Session> {
  try {
    return await authApi.me(signal);
  } catch (err) {
    if (!isApiError(err, 'UNAUTHENTICATED')) throw err;
  }
  // The 15-min access cookie may simply have expired: one silent refresh, then give up.
  // Exactly one attempt per fetch — anonymous visitors never loop (refresh 401 → signed out).
  try {
    await authApi.refresh();
    return await authApi.me(signal);
  } catch (err) {
    if (isApiError(err, 'UNAUTHENTICATED') || isApiError(err, 'FORBIDDEN')) return null;
    throw err;
  }
}

export function useSession() {
  return useQuery({
    queryKey: sessionKeys.me,
    queryFn: ({ signal }) => fetchSession(signal),
    staleTime: 5 * 60_000,
    retry: (count, err) => !isApiError(err) || (err.code === 'NETWORK_ERROR' && count < 2),
  });
}
