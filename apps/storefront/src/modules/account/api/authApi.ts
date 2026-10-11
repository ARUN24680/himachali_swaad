import type { MeResponse, OtpSendRequest, OtpVerifyRequest, SessionUser } from '@pk/shared';
import { apiRequest } from '@/lib/api-client';

/** Customer auth calls (architecture/02 §1). Cookies only — nothing here touches a token. */
export const authApi = {
  sendOtp: (body: OtpSendRequest) =>
    apiRequest<{ sent: true; resendAfterSec: number }>('/auth/otp/send', { method: 'POST', body }),
  verifyOtp: (body: OtpVerifyRequest) =>
    apiRequest<{ user: SessionUser }>('/auth/otp/verify', { method: 'POST', body }),
  me: (signal?: AbortSignal) => apiRequest<MeResponse>('/auth/me', { signal }),
  refresh: () => apiRequest<{ user: SessionUser }>('/auth/refresh', { method: 'POST', body: {} }),
  logout: () => apiRequest<{ loggedOut: true }>('/auth/logout', { method: 'POST', body: {} }),
};
