import type { Queryable } from '../../config/db';
import { insertAuditRow } from './audit.repository';

export type AuditAction =
  | 'STAFF_LOGIN_SUCCESS'
  | 'STAFF_LOGIN_FAILED'
  | 'PASSWORD_CHANGED'
  | 'TOTP_ENROLLED'
  | 'LOGOUT_ALL'
  | 'TOKEN_REUSE_DETECTED'
  | 'PRODUCT_CREATE'
  | 'PRODUCT_UPDATE'
  | 'PRODUCT_PUBLISH'
  | 'PRODUCT_UNPUBLISH'
  | 'BATCH_CREATE'
  | 'BATCH_UPDATE'
  | 'STOCK_ADJUST'
  | 'ORDER_CANCEL'
  | 'LABEL_VIEW';

export interface AuditEntry {
  actorId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
}

/**
 * Append-only audit trail (Phase 2 §2.6). Pass the SAME client as the mutation so the audit row
 * commits or rolls back with it. Never put PII (phone, email, password, tokens) in before/after.
 */
export function audit(client: Queryable, entry: AuditEntry): Promise<void> {
  return insertAuditRow(client, entry);
}
