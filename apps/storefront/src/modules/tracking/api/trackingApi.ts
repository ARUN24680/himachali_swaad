import type { TrackRequest, TrackResponse } from '@pk/shared';
import { apiRequest } from '@/lib/api-client';

/**
 * Public order tracking (Phase 8 §8.1, D-39). Code AND phone go in the POST body — never in the URL,
 * so the phone can't leak into history, logs or referrers.
 */
export const trackingApi = {
  track: (body: TrackRequest) => apiRequest<TrackResponse>('/track', { method: 'POST', body }),
};
