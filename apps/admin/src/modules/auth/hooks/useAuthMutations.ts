import type { MeResponse, StaffLoginRequest } from '@pk/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { isApiError } from '@/services/api/http';
import { queryKeys } from '@/services/api/query-keys';
import { authApi } from '../api/authApi';

export function useStaffLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StaffLoginRequest) => authApi.staffLogin(body),
    onSuccess: ({ user }) => {
      // Seed the session so guards pass immediately; refetch fills pickupLocationIds
      qc.setQueryData<MeResponse>(queryKeys.me, { user, pickupLocationIds: [] });
      void qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

/** Sign out of this device, or of every device (`everywhere`). Either way: clear all cached data. */
export function useSignOut({ everywhere = false }: { everywhere?: boolean } = {}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const done = () => {
    qc.clear();
    void navigate('/login', { replace: true });
  };
  return useMutation({
    mutationFn: () => (everywhere ? authApi.logoutAll() : authApi.logout()),
    onSuccess: done,
    onError: (err) => {
      if (isApiError(err, 'UNAUTHENTICATED')) done(); // already signed out server-side
    },
  });
}

export function useTotpSetup() {
  return useMutation({ mutationFn: () => authApi.totpSetup() });
}

export function useTotpVerify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => authApi.totpVerify(code),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}
