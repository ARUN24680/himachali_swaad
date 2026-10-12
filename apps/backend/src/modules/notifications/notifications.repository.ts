import type { Queryable } from '../../config/db';

/** Raw SQL for push_subscriptions + notifications_log (migration 0005). */

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Same endpoint re-subscribing (another login on the phone) moves to the current user. */
export async function upsertPushSubscription(
  q: Queryable,
  s: { userId: string; endpoint: string; p256dh: string; auth: string; userAgent: string | null },
): Promise<void> {
  await q.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
    [s.userId, s.endpoint, s.p256dh, s.auth, s.userAgent?.slice(0, 300) ?? null],
  );
}

export async function deletePushSubscription(q: Queryable, userId: string, endpoint: string): Promise<boolean> {
  const { rowCount } = await q.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [
    userId,
    endpoint,
  ]);
  return rowCount === 1;
}

export async function deletePushSubscriptionById(q: Queryable, id: string): Promise<void> {
  await q.query('DELETE FROM push_subscriptions WHERE id = $1', [id]);
}

export async function countUserSubscriptions(q: Queryable, userId: string): Promise<number> {
  const { rows } = await q.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = $1',
    [userId],
  );
  return rows[0]!.n;
}

/** Active partners mapped to a kitchen (D-17) — who gets the kitchen's alerts. */
export async function listKitchenPartners(q: Queryable, pickupLocationId: string): Promise<{ id: string }[]> {
  const { rows } = await q.query<{ id: string }>(
    `SELECT u.id FROM users u JOIN user_pickup_locations upl ON upl.user_id = u.id
      WHERE upl.pickup_location_id = $1 AND u.role = 'KITCHEN_PARTNER' AND u.is_active
      ORDER BY u.id`,
    [pickupLocationId],
  );
  return rows;
}

export async function listSubscriptionsForUsers(q: Queryable, userIds: string[]): Promise<PushSubscriptionRow[]> {
  if (userIds.length === 0) return [];
  const { rows } = await q.query<PushSubscriptionRow>(
    'SELECT id, user_id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::uuid[]) ORDER BY created_at',
    [userIds],
  );
  return rows;
}

/** Recipients already sent this template for this order (job retries don't double-push). */
export async function sentRecipients(
  q: Queryable,
  orderId: string | null,
  template: string,
  since: Date,
): Promise<Set<string>> {
  const { rows } = await q.query<{ recipient: string }>(
    `SELECT recipient FROM notifications_log
      WHERE template = $2 AND status = 'SENT' AND created_at >= $3
        AND ($1::uuid IS NULL AND order_id IS NULL OR order_id = $1)`,
    [orderId, template, since],
  );
  return new Set(rows.map((r) => r.recipient));
}

export async function insertNotificationLog(
  q: Queryable,
  n: {
    orderId: string | null;
    userId: string | null;
    channel: 'WHATSAPP' | 'SMS' | 'EMAIL' | 'PUSH';
    recipient: string;
    template: string;
    variables: Record<string, unknown>;
    provider: string | null;
    status: 'QUEUED' | 'SENT' | 'FAILED';
    error: string | null;
  },
): Promise<void> {
  await q.query(
    `INSERT INTO notifications_log (order_id, user_id, channel, recipient, template, variables, provider, status, error, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::notification_status, $9, CASE WHEN $8::text = 'SENT' THEN NOW() END)`,
    [n.orderId, n.userId, n.channel, n.recipient, n.template, n.variables, n.provider, n.status, n.error],
  );
}

/** Kitchens with orders waiting to be packed (daily digest). */
export async function awaitingPackingByKitchen(q: Queryable): Promise<{ pickup_location_id: string; n: number }[]> {
  const { rows } = await q.query<{ pickup_location_id: string; n: number }>(
    `SELECT pickup_location_id, count(*)::int AS n FROM orders WHERE status = 'AWAITING_PACKING'
      GROUP BY pickup_location_id ORDER BY pickup_location_id`,
  );
  return rows;
}

// ── Template messages (Phase 8) ────────────────────────────────────────────────────────────────

/** Already delivered on WhatsApp or SMS? (dedup across job retries / duplicate triggers). */
export async function wasDelivered(
  q: Queryable,
  p: { orderId: string | null; template: string; recipient: string; since: Date },
): Promise<boolean> {
  const { rowCount } = await q.query(
    `SELECT 1 FROM notifications_log
      WHERE template = $2 AND recipient = $3 AND channel IN ('WHATSAPP', 'SMS')
        AND status IN ('SENT', 'DELIVERED', 'READ') AND created_at >= $4
        AND ($1::uuid IS NULL AND order_id IS NULL OR order_id = $1)
      LIMIT 1`,
    [p.orderId, p.template, p.recipient, p.since],
  );
  return (rowCount ?? 0) > 0;
}

/** The QUEUED row a previous (retried) attempt left, or a new one. */
export async function openMessageRow(
  q: Queryable,
  m: {
    orderId: string | null;
    userId: string | null;
    channel: 'WHATSAPP' | 'SMS';
    recipient: string;
    template: string;
    variables: Record<string, unknown>;
    provider: string;
  },
): Promise<string> {
  const existing = await q.query<{ id: string }>(
    `SELECT id FROM notifications_log
      WHERE channel = $1::notification_channel AND template = $2 AND recipient = $3 AND status = 'QUEUED'
        AND ($4::uuid IS NULL AND order_id IS NULL OR order_id = $4)
      ORDER BY created_at DESC LIMIT 1`,
    [m.channel, m.template, m.recipient, m.orderId],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const { rows } = await q.query<{ id: string }>(
    `INSERT INTO notifications_log (order_id, user_id, channel, recipient, template, variables, provider, status)
     VALUES ($1, $2, $3::notification_channel, $4, $5, $6, $7, 'QUEUED') RETURNING id`,
    [m.orderId, m.userId, m.channel, m.recipient, m.template, m.variables, m.provider],
  );
  return rows[0]!.id;
}

export async function markMessageSent(q: Queryable, id: string, providerMessageId: string): Promise<void> {
  await q.query(
    `UPDATE notifications_log SET status = 'SENT', provider_message_id = $2, sent_at = NOW(), error = NULL WHERE id = $1`,
    [id, providerMessageId],
  );
}

export async function markMessageError(q: Queryable, id: string, error: string, final: boolean): Promise<void> {
  await q.query(
    `UPDATE notifications_log SET error = $2, status = CASE WHEN $3 THEN 'FAILED'::notification_status ELSE status END
      WHERE id = $1`,
    [id, error.slice(0, 500), final],
  );
}

const RANK =
  "CASE status WHEN 'QUEUED' THEN 0 WHEN 'SENT' THEN 1 WHEN 'DELIVERED' THEN 2 WHEN 'READ' THEN 3 ELSE -1 END";

/**
 * Provider delivery receipt (WhatsApp webhook). Monotonic: SENT → DELIVERED → READ never goes
 * back; FAILED only before DELIVERED. Returns false for an unknown message id.
 */
export async function applyDeliveryStatus(
  q: Queryable,
  p: { providerMessageId: string; status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'; at: Date; error: string | null },
): Promise<boolean> {
  const newRank = { SENT: 1, DELIVERED: 2, READ: 3, FAILED: -1 }[p.status];
  const { rowCount } = await q.query(
    `UPDATE notifications_log
        SET status = CASE
              WHEN $2 = 'FAILED' AND ${RANK} < 2 THEN 'FAILED'::notification_status
              WHEN $2 <> 'FAILED' AND ${RANK} < $3 THEN $2::notification_status
              ELSE status END,
            delivered_at = CASE WHEN $2 IN ('DELIVERED', 'READ') THEN COALESCE(delivered_at, $4) ELSE delivered_at END,
            error = CASE WHEN $2 = 'FAILED' AND ${RANK} < 2 THEN $5 ELSE error END
      WHERE provider_message_id = $1`,
    [p.providerMessageId, p.status, newRank, p.at, p.error],
  );
  return (rowCount ?? 0) > 0;
}

export async function findUserPhone(q: Queryable, userId: string): Promise<string | null> {
  const { rows } = await q.query<{ phone: string | null }>('SELECT phone FROM users WHERE id = $1 AND is_active', [
    userId,
  ]);
  return rows[0]?.phone ?? null;
}

/** The status the order was cancelled FROM (partner "pack mat karein" alert). */
export async function cancelledFrom(q: Queryable, orderId: string): Promise<string | null> {
  const { rows } = await q.query<{ from_status: string | null }>(
    `SELECT from_status FROM order_status_logs WHERE order_id = $1 AND to_status = 'CANCELLED' ORDER BY id DESC LIMIT 1`,
    [orderId],
  );
  return rows[0]?.from_status ?? null;
}

export async function findShipmentForMessage(q: Queryable, orderId: string) {
  const { rows } = await q.query<{ courier_name: string | null; awb_code: string | null; etd: string | null }>(
    'SELECT courier_name, awb_code, etd FROM shipments WHERE order_id = $1',
    [orderId],
  );
  return rows[0] ?? null;
}
