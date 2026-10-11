import type { Queryable } from '../../config/db';

/** Raw SQL for the webhook idempotency store (architecture/01, Rules §2.2). */

/** Returns the stored event; `isNew` false means a redelivery. */
export async function recordWebhookEvent(
  q: Queryable,
  e: { provider: 'RAZORPAY' | 'SHIPROCKET'; eventId: string; eventType: string; payload: unknown },
) {
  const inserted = await q.query<{ id: number }>(
    `INSERT INTO webhook_events (provider, event_id, event_type, payload, attempts)
     VALUES ($1, $2, $3, $4, 1)
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING id`,
    [e.provider, e.eventId, e.eventType, e.payload],
  );
  if (inserted.rows[0]) return { id: inserted.rows[0].id, isNew: true, processed: false };
  const { rows } = await q.query<{ id: number; processed_at: Date | null }>(
    `UPDATE webhook_events SET attempts = attempts + 1 WHERE provider = $1 AND event_id = $2
     RETURNING id, processed_at`,
    [e.provider, e.eventId],
  );
  return { id: rows[0]!.id, isNew: false, processed: rows[0]!.processed_at !== null };
}

export async function markWebhookProcessed(q: Queryable, id: number): Promise<void> {
  await q.query('UPDATE webhook_events SET processed_at = NOW(), last_error = NULL WHERE id = $1', [id]);
}

export async function markWebhookError(q: Queryable, id: number, error: string): Promise<void> {
  await q.query('UPDATE webhook_events SET last_error = $2 WHERE id = $1', [id, error.slice(0, 1000)]);
}
