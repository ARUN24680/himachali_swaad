import type { Queryable } from '../../config/db';

export interface OutboxRow {
  id: number;
  event_id: string;
  event: string;
  body: string;
  attempts: number;
}

/** Written in the SAME transaction as the state change it announces (transactional outbox). */
export async function enqueue(q: Queryable, e: { eventId: string; event: string; body: string }): Promise<void> {
  await q.query(`INSERT INTO upi_webhook_outbox (event_id, event, body) VALUES ($1, $2, $3)`, [
    e.eventId,
    e.event,
    e.body,
  ]);
}

/**
 * Leases due rows for `leaseSec` in one statement, so the HTTP call happens outside any transaction
 * (D-30). SKIP LOCKED lets several instances dispatch without double-sending; a crashed sender's
 * lease simply runs out and the row is retried (the store dedups on the event id).
 */
export async function claimDue(q: Queryable, limit: number, leaseSec = 60): Promise<OutboxRow[]> {
  const r = await q.query<OutboxRow>(
    `UPDATE upi_webhook_outbox SET next_attempt_at = NOW() + make_interval(secs => $2::int)
      WHERE id IN (SELECT id FROM upi_webhook_outbox
                    WHERE delivered_at IS NULL AND dead_at IS NULL AND next_attempt_at <= NOW()
                    ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED)
      RETURNING id, event_id, event, body, attempts`,
    [limit, leaseSec],
  );
  return r.rows.sort((a, b) => a.id - b.id);
}

export async function markDelivered(q: Queryable, id: number): Promise<void> {
  await q.query(`UPDATE upi_webhook_outbox SET delivered_at = NOW(), attempts = attempts + 1 WHERE id = $1`, [id]);
}

export async function markFailed(q: Queryable, id: number, error: string, retryInSec: number | null): Promise<void> {
  await q.query(
    `UPDATE upi_webhook_outbox
        SET attempts = attempts + 1, last_error = $2,
            next_attempt_at = CASE WHEN $3::int IS NULL THEN next_attempt_at ELSE NOW() + make_interval(secs => $3::int) END,
            dead_at = CASE WHEN $3::int IS NULL THEN NOW() ELSE NULL END
      WHERE id = $1`,
    [id, error.slice(0, 500), retryInSec],
  );
}
