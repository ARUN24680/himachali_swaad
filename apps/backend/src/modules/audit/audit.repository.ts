import type { Queryable } from '../../config/db';
import type { AuditEntry } from './audit.service';

export async function insertAuditRow(db: Queryable, e: AuditEntry): Promise<void> {
  await db.query(
    `INSERT INTO admin_audit_log (actor_id, action, entity_type, entity_id, before, after, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [e.actorId ?? null, e.action, e.entityType, e.entityId, e.before ?? null, e.after ?? null, e.ip ?? null],
  );
}
