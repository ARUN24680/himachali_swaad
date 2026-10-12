import { istDateOf, type PushConfigResponse, type PushSubscriptionRequest } from '@pk/shared';
import type { Logger } from 'pino';
import type { Db } from '../../config/db';
import { pushTopic, type PushSender } from '../../integrations/push/web-push';
import { jobIds, type JobQueue } from '../../jobs/queues';
import type { AuthContext } from '../../middleware/auth';
import { AppError } from '../../utils/app-error';
import { orderStore } from '../orders/orders.service';
import * as repo from './notifications.repository';

/** How far back "already pushed" is checked when a job retries. */
const RESEND_WINDOW_MS = 24 * 3600_000;

export type PartnerTemplate = 'new_order_alert' | 'packing_digest' | 'order_cancelled_partner';

/**
 * Partner alerts (Phase 7 §7.3): Web Push to every subscribed device of the kitchen's partners,
 * each send logged in notifications_log. Nobody reachable by push (no subscription, all failed,
 * or push not configured) → WhatsApp fallback job (sender = Phase 8). Customer messages = Phase 8.
 */
export function createNotificationsService(deps: { db: Db; push: PushSender; jobs: JobQueue; logger: Logger }) {
  const { db, push, jobs, logger } = deps;
  const log = logger.child({ module: 'notifications' });

  async function whatsappFallback(
    template: PartnerTemplate,
    userId: string,
    orderId: string | null,
    subject: string,
    variables: Record<string, string>,
  ) {
    try {
      await jobs.add(
        'WHATSAPP_SEND',
        { template, userId, orderId, variables },
        jobIds.notify(`wa-${template}`, `${subject}-${userId}`),
      );
    } catch (err) {
      log.error({ err, template }, 'whatsapp fallback enqueue failed');
    }
  }

  /** Push to all of a kitchen's partners; returns per-partner reach and enqueues fallbacks. */
  async function alertKitchen(p: {
    pickupLocationId: string;
    orderId: string | null;
    template: PartnerTemplate;
    payload: { title: string; body: string; url: string; tag: string };
    variables: Record<string, unknown>;
    subject: string;
    /** Sends logged after this count as done (job retry / re-run guard). */
    since: Date;
  }): Promise<{ partners: number; pushed: number; fallbacks: number }> {
    const partners = await repo.listKitchenPartners(db, p.pickupLocationId);
    const subs = await repo.listSubscriptionsForUsers(
      db,
      partners.map((x) => x.id),
    );
    const already = await repo.sentRecipients(db, p.orderId, p.template, p.since);
    const reached = new Set<string>();
    let pushed = 0;

    for (const sub of subs) {
      if (already.has(sub.id)) {
        reached.add(sub.user_id);
        continue;
      }
      const res = await push.send(sub, p.payload, { topic: pushTopic(p.payload.tag) });
      if (res.kind === 'disabled') break;
      if (res.kind === 'gone') await repo.deletePushSubscriptionById(db, sub.id);
      const ok = res.kind === 'sent';
      if (ok) {
        reached.add(sub.user_id);
        pushed += 1;
      }
      await repo.insertNotificationLog(db, {
        orderId: p.orderId,
        userId: sub.user_id,
        channel: 'PUSH',
        recipient: sub.id,
        template: p.template,
        variables: p.variables,
        provider: 'web-push',
        status: ok ? 'SENT' : 'FAILED',
        error: res.kind === 'gone' ? `subscription gone (${res.status})` : res.kind === 'failed' ? res.error : null,
      });
    }

    let fallbacks = 0;
    for (const partner of partners) {
      if (reached.has(partner.id)) continue;
      await whatsappFallback(
        p.template,
        partner.id,
        p.orderId,
        p.subject,
        Object.fromEntries(Object.entries(p.variables).map(([k, v]) => [k, String(v)])),
      );
      fallbacks += 1;
    }
    if (partners.length === 0)
      log.warn({ pickupLocationId: p.pickupLocationId }, 'kitchen has no active partner to alert');
    return { partners: partners.length, pushed, fallbacks };
  }

  return {
    pushConfig: async (auth: AuthContext): Promise<PushConfigResponse> => ({
      vapidPublicKey: push.publicKey,
      subscribed: (await repo.countUserSubscriptions(db, auth.userId)) > 0,
    }),

    async subscribe(auth: AuthContext, body: PushSubscriptionRequest, userAgent: string | null): Promise<void> {
      if (!push.enabled) throw new AppError('INVALID_STATE', 'Push notifications are not configured on this server.');
      await repo.upsertPushSubscription(db, {
        userId: auth.userId,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent,
      });
    },

    unsubscribe: (auth: AuthContext, endpoint: string) => repo.deletePushSubscription(db, auth.userId, endpoint),

    /** PARTNER_NEW_ORDER_ALERT (order CONFIRMED, 07 §6): "🆕 Naya order PK-… — N jar". */
    async partnerNewOrderAlert(orderId: string) {
      const order = await orderStore.findById(db, orderId);
      if (!order || order.status === 'CANCELLED' || order.status === 'EXPIRED' || order.status === 'PENDING_PAYMENT') {
        return { skipped: true };
      }
      const items = await orderStore.listItems(db, orderId);
      const jars = items.reduce((n, i) => n + i.quantity, 0);
      return alertKitchen({
        pickupLocationId: order.pickup_location_id,
        orderId,
        template: 'new_order_alert',
        payload: {
          title: '🆕 Naya order',
          body: `${order.order_code} — ${jars} jar`,
          url: `/desk?order=${order.order_code}`,
          tag: order.order_code,
        },
        variables: { order_code: order.order_code, jars },
        subject: order.id,
        since: new Date(Date.now() - RESEND_WINDOW_MS),
      });
    },

    /** ORDER_CANCELLED after packing started → "pack mat karein" to the kitchen (Phase 8 §8.5). */
    async partnerCancelAlert(orderId: string) {
      const order = await orderStore.findById(db, orderId);
      if (!order) return { skipped: true };
      return alertKitchen({
        pickupLocationId: order.pickup_location_id,
        orderId,
        template: 'order_cancelled_partner',
        payload: {
          title: '⛔ Order cancel',
          body: `${order.order_code} — pack mat karein`,
          url: '/desk',
          tag: `cancel-${order.order_code}`,
        },
        variables: { order_code: order.order_code },
        subject: `cancel-${order.id}`,
        since: new Date(Date.now() - RESEND_WINDOW_MS),
      });
    },

    /** PARTNER_DAILY_DIGEST (09:00 IST): "Aaj N orders pack karne hain" — only kitchens with N > 0. */
    async partnerDailyDigest(now = new Date()) {
      const today = istDateOf(now);
      const kitchens = await repo.awaitingPackingByKitchen(db);
      let alerted = 0;
      for (const k of kitchens) {
        if (k.n <= 0) continue;
        await alertKitchen({
          pickupLocationId: k.pickup_location_id,
          orderId: null,
          template: 'packing_digest',
          payload: {
            title: '🏔️ Aaj ke orders',
            body: `Aaj ${k.n} order pack karne hain`,
            url: '/desk',
            tag: `digest-${today}`,
          },
          variables: { count: k.n },
          subject: `${today}-${k.pickup_location_id}`,
          since: new Date(`${today}T00:00:00+05:30`),
        });
        alerted += 1;
      }
      return { kitchens: alerted };
    },
  };
}

export type NotificationsService = ReturnType<typeof createNotificationsService>;
