import type { StaffCreateRequest, StaffResetPasswordRequest, StaffRow, StaffUpdateRequest } from '@pk/shared';
import { http } from '@/services/api/http';

/** Staff accounts (Phase 9 §9.7): create ADMIN / KITCHEN_PARTNER, kitchens, deactivate, force logout, password reset. */
export const staffApi = {
  list: (signal?: AbortSignal) => http<{ staff: StaffRow[] }>('/admin/staff', { signal }),
  create: (body: StaffCreateRequest) => http<{ staff: StaffRow }>('/admin/staff', { method: 'POST', body }),
  update: (id: string, body: StaffUpdateRequest) =>
    http<{ staff: StaffRow }>(`/admin/staff/${id}`, { method: 'PATCH', body }),
  /** Temporary password; the API signs them out everywhere and lifts any login lockout. */
  resetPassword: (id: string, body: StaffResetPasswordRequest) =>
    http<{ revokedSessions: number }>(`/admin/staff/${id}/reset-password`, { method: 'POST', body }),
};
