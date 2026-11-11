'use client';

import type { WaitlistJoinRequest } from '@pk/shared';
import { useMutation } from '@tanstack/react-query';
import { waitlistApi } from '../api/waitlistApi';

/** Mutation around `POST /waitlist`; the form maps `ApiRequestError` codes to its states. */
export function useJoinWaitlist() {
  return useMutation({ mutationFn: (body: WaitlistJoinRequest) => waitlistApi.join(body) });
}
