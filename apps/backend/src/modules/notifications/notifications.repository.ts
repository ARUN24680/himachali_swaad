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
