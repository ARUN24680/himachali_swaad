import type { ChangePasswordRequest, MeResponse, StaffLoginRequest } from '@pk/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { clearOfflineData } from '@/lib/offline-cache';
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
    void clearOfflineData(); // offline desk identity + cached queues (Phase 7)
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
    // The server just set an MFA access cookie: every query that failed with
    // TOTP_ENROLLMENT_REQUIRED (Phase 10 §10.1) now works, so refetch them all — not only /auth/me
    onSuccess: () => qc.invalidateQueries(),
  });
}

/**
 * Change own password. The API revokes every session of this user, then issues a fresh one for
 * this device (new cookies) — so this tab stays signed in and every other device is signed out.
 */
export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangePasswordRequest) => authApi.changePassword(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}
