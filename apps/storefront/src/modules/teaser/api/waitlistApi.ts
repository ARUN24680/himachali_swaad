import type { WaitlistJoinRequest, WaitlistJoinResponse } from '@pk/shared';
import { apiRequest } from '@/lib/api-client';

/** `POST /api/v1/waitlist` (audit R-5). Contract: packages/shared/src/contracts/waitlist.ts. */
export const waitlistApi = {
  join: (body: WaitlistJoinRequest, signal?: AbortSignal) =>
    apiRequest<WaitlistJoinResponse>('/waitlist', { method: 'POST', body, signal }),
};
