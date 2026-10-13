import type { ChangePasswordRequest, SessionUser, StaffLoginRequest } from '@pk/shared';
import { http } from '@/services/api/http';

/** Staff auth calls (architecture/02 §1). Cookies only — nothing here touches a token. */
export const authApi = {
  staffLogin: (body: StaffLoginRequest) => http<{ user: SessionUser }>('/auth/staff/login', { method: 'POST', body }),
  logout: () => http<{ loggedOut: true }>('/auth/logout', { method: 'POST', body: {} }),
  logoutAll: () =>
    http<{ loggedOut: true }>('/auth/logout-all', { method: 'POST', body: {}, redirectOnAuthFailure: false }),
  /**
   * Answers 401 UNAUTHENTICATED for a wrong current password — that is an answer, not a dead
   * session, so it must never bounce the admin to /login. Success issues a fresh session cookie.
   */
  changePassword: (body: ChangePasswordRequest) =>
    http<{ user: SessionUser }>('/auth/staff/change-password', { method: 'POST', body, redirectOnAuthFailure: false }),
  totpSetup: () => http<{ otpauthUrl: string }>('/auth/staff/2fa/setup', { method: 'POST', body: {} }),
  totpVerify: (code: string) => http<{ enabled: true }>('/auth/staff/2fa/verify', { method: 'POST', body: { code } }),
};
