'use client';

import { useMutation } from '@tanstack/react-query';
import { trackingApi } from '../api/trackingApi';

/**
 * A lookup is a mutation, not a cached query: the phone is PII, so nothing is kept in the query
 * cache keyed by it, and every "Track" tap re-asks the server (rate-limited 10 / 10 min, D-39).
 */
export function useTrackLookup() {
  return useMutation({ mutationFn: trackingApi.track, retry: false });
}
