import type { WaitlistSource } from '@pk/shared';
import type { Queryable } from '../../config/db';
import {
  WaitlistEntryRowSchema,
  WaitlistListRowSchema,
  type WaitlistEntryRow,
  type WaitlistListRow,
} from './waitlist.validation';

const COLUMNS = 'id, phone, email, name, source, consent_at, created_at';

/** `%foo%` with the caller's own wildcards escaped (LIKE's default escape is a backslash). */
const containsPattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Inserts a waitlist entry. A phone or e-mail that is already on the list hits one of the partial
 * unique indexes and the insert is a no-op (returns null) — never an error for the visitor.
 */
export async function insertEntry(
  q: Queryable,
  e: {
    phone: string | null;
    email: string | null;
    name: string | null;
    source: WaitlistSource;
    consentAt: Date;
    ipHash: string | null;
    userAgent: string | null;
  },
): Promise<string | null> {
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO waitlist_entries (phone, email, name, source, consent_at, ip_hash, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [e.phone, e.email, e.name, e.source, e.consentAt, e.ipHash, e.userAgent],
  );
  return rows[0]?.id ?? null;
}

/** Admin list, newest first; `q` matches phone or e-mail (contains). `total` = count before paging. */
export async function listEntries(
  q: Queryable,
  p: { page: number; pageSize: number; q?: string; source?: WaitlistSource },
): Promise<WaitlistListRow[]> {
  const { rows } = await q.query(
    `SELECT ${COLUMNS}, count(*) OVER ()::int AS total
       FROM waitlist_entries
      WHERE ($1::text IS NULL OR phone LIKE $1 OR email LIKE $1)
        AND ($2::text IS NULL OR source = $2)
      ORDER BY created_at DESC, id
      LIMIT $3 OFFSET $4`,
    [p.q ? containsPattern(p.q) : null, p.source ?? null, p.pageSize, (p.page - 1) * p.pageSize],
  );
  return rows.map((r) => WaitlistListRowSchema.parse(r));
}

/** Every entry, oldest first (CSV export). */
export async function listAllEntries(q: Queryable): Promise<WaitlistEntryRow[]> {
  const { rows } = await q.query(`SELECT ${COLUMNS} FROM waitlist_entries ORDER BY created_at, id`);
  return rows.map((r) => WaitlistEntryRowSchema.parse(r));
}
