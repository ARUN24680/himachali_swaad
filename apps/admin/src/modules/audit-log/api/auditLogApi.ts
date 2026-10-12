import type { AuditLogQuerySchema, AuditLogResponseSchema } from '@pk/shared';
import type { z } from 'zod';
import { http } from '@/services/api/http';

export type AuditLogQuery = z.input<typeof AuditLogQuerySchema>;
export type AuditLogResponse = z.infer<typeof AuditLogResponseSchema>;
export type AuditEntry = AuditLogResponse['entries'][number];

/** admin_audit_log viewer (Phase 9 — every admin mutation writes a row with before/after JSON). */
export const auditLogApi = {
  list: (q: AuditLogQuery, signal?: AbortSignal) => {
    const p = new URLSearchParams();
    if (q.action) p.set('action', q.action);
    if (q.entityType) p.set('entityType', q.entityType);
    if (q.entityId) p.set('entityId', q.entityId);
    if (q.page && q.page !== 1) p.set('page', String(q.page));
    if (q.pageSize) p.set('pageSize', String(q.pageSize));
    const s = p.toString();
    return http<AuditLogResponse>(`/admin/audit-log${s ? `?${s}` : ''}`, { signal });
  },
};
