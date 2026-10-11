'use client';

import type { OtpSendRequest, OtpVerifyRequest } from '@pk/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '@/lib/api-client';
import { authApi } from '../api/authApi';
import { sessionKeys, type Session } from './useSession';

export function useSendOtp() {
  return useMutation({ mutationFn: (body: OtpSendRequest) => authApi.sendOtp(body) });
}

export function useVerifyOtp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OtpVerifyRequest) => authApi.verifyOtp(body),
    onSuccess: ({ user }) => {
      const session: Session = { user, pickupLocationIds: [] };
      qc.setQueryData(sessionKeys.me, session);
      void qc.invalidateQueries({ queryKey: sessionKeys.me });
    },
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  const signedOut = () => {
    const session: Session = null;
    qc.setQueryData(sessionKeys.me, session);
  };
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: signedOut,
    onError: (err) => {
      // Session already gone server-side → the UI should agree
      if (isApiError(err, 'UNAUTHENTICATED')) signedOut();
    },
  });
}
