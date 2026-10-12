import {
  formatINR,
  maskPhone,
  quietHoursRelease,
  TEMPLATES,
  type MessageLanguage,
  type OrderRow,
  type TemplateName,
} from '@pk/shared';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import type { Db } from '../../config/db';
import { MessageError, type EmailSender, type MessageProvider } from '../../integrations/messaging/provider';
import { jobIds, type JobQueue } from '../../jobs/queues';
import { orderStore } from '../orders/orders.service';
import { findRefund } from '../payments/refund-requests';
import * as repo from './notifications.repository';

/** A message already delivered for the same order + template + recipient isn't sent again. */
const DEDUP_WINDOW_MS = 30 * 24 * 3600_000;
/** Same admin-alert kind within this window → first one now, then one summary with the count. */
export const ALERT_BATCH_WINDOW_SEC = 600;

export type DeliveryOutcome =
  | { kind: 'sent'; channel: 'WHATSAPP' | 'SMS'; providerMessageId: string; fellBack: boolean }
  | { kind: 'duplicate' }
  | { kind: 'skipped'; reason: 'NO_CONSENT' | 'NO_PHONE' | 'NOT_APPLICABLE' }
  | { kind: 'failed'; error: string }
  | { kind: 'deferred'; until: Date };

export interface MessagingConfig {
  /** Public storefront origin for track links, e.g. https://pahadikhatki.in */
  storefrontUrl: string;
  adminPhones: string[];
  adminEmail: string | null;
  customerLanguage: MessageLanguage;
}

/**
 * Template messages (Phase 8 §8.4): WhatsApp first (with consent), SMS for critical templates when
 * WhatsApp isn't allowed / fails, quiet hours for non-urgent templates, every attempt in
 * notifications_log. Retryable provider errors are thrown so BullMQ retries; on the job's final
 * attempt they count as a failure and the SMS fallback runs.
 */
export function createMessagesService(deps: {
  db: Db;
  redis: Redis;
  whatsapp: MessageProvider;
  sms: MessageProvider;
  email: EmailSender;
  jobs: JobQueue;
  logger: Logger;
  config: MessagingConfig;
  now?: () => Date;
}) {
  const { db, redis, whatsapp, sms, email, jobs, config } = deps;
  const now = deps.now ?? (() => new Date());
  const log = deps.logger.child({ module: 'messages' });
  const trackUrl = (code: string) =>
    `${config.storefrontUrl.replace(/\/$/, '')}/track?code=${encodeURIComponent(code)}`;

  async function attempt(
    provider: MessageProvider,
    p: {
      orderId: string | null;
      userId: string | null;
      to: string;
      template: TemplateName;
      language: MessageLanguage;
      variables: Record<string, string>;
    },
    finalAttempt: boolean,
  ): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
    const rowId = await repo.openMessageRow(db, {
      orderId: p.orderId,
      userId: p.userId,
      channel: provider.channel,
      recipient: p.to,
      template: p.template,
      variables: p.variables,
      provider: provider.name,
    });
    try {
      const { providerMessageId } = await provider.sendTemplate({
        to: p.to,
        template: p.template,
        language: p.language,
        variables: p.variables,
        variableOrder: TEMPLATES[p.template].variables,
      });
      await repo.markMessageSent(db, rowId, providerMessageId);
      log.info({ channel: provider.channel, template: p.template, to: maskPhone(p.to) }, 'message sent');
      return { ok: true, id: providerMessageId };
    } catch (err) {
      const e = err instanceof MessageError ? err : new MessageError((err as Error).message, true);
      const final = !e.retryable || finalAttempt;
      await repo.markMessageError(db, rowId, e.message, final);
      log.warn(
        { channel: provider.channel, template: p.template, to: maskPhone(p.to), reason: e.reason, final },
        'message failed',
      );
      if (!final) throw e; // BullMQ retries; the QUEUED row is reused
      return { ok: false, error: e.message };
    }
  }

  /**
   * One template to one phone. `whatsappAllowed` = consent (customers) / always (staff);
   * SMS only for critical templates.
   */
  async function deliver(p: {
    orderId: string | null;
    userId: string | null;
    to: string | null;
    template: TemplateName;
    variables: Record<string, string>;
    language: MessageLanguage;
    whatsappAllowed: boolean;
    finalAttempt?: boolean;
    /** false for admin alerts (they repeat by design; batching limits them instead). */
    dedup?: boolean;
  }): Promise<DeliveryOutcome> {
    const spec = TEMPLATES[p.template];
    if (!p.to) return { kind: 'skipped', reason: 'NO_PHONE' };
    if (spec.quietHours) {
      const until = quietHoursRelease(now());
      if (until) return { kind: 'deferred', until };
    }
    const since = new Date(now().getTime() - DEDUP_WINDOW_MS);
    if (
      p.dedup !== false &&
      (await repo.wasDelivered(db, { orderId: p.orderId, template: p.template, recipient: p.to, since }))
    ) {
      return { kind: 'duplicate' };
    }
    const finalAttempt = p.finalAttempt ?? true;
    const args = { ...p, to: p.to };
    let waError: string | null = null;
    if (p.whatsappAllowed) {
      const r = await attempt(whatsapp, args, finalAttempt);
      if (r.ok) return { kind: 'sent', channel: 'WHATSAPP', providerMessageId: r.id, fellBack: false };
      waError = r.error;
    }
    if (!spec.critical) {
      return waError ? { kind: 'failed', error: waError } : { kind: 'skipped', reason: 'NO_CONSENT' };
    }
    const r = await attempt(sms, args, finalAttempt);
    if (r.ok) return { kind: 'sent', channel: 'SMS', providerMessageId: r.id, fellBack: p.whatsappAllowed };
    return { kind: 'failed', error: r.error };
  }

  const itemsLine = async (orderId: string) =>
    (await orderStore.listItems(db, orderId)).map((i) => `${i.quantity}× ${i.title} ${i.net_weight_g}g`).join(', ');

  async function customerVars(order: OrderRow, template: TemplateName): Promise<Record<string, string>> {
    const code = order.order_code;
    const base: Record<string, string> = { order_code: code, track_url: trackUrl(code) };
    switch (template) {
      case 'order_confirmed':
        return {
          ...base,
          customer_name: order.customer_name.trim().split(/\s+/)[0] ?? '',
          items: await itemsLine(order.id),
        };
      case 'order_shipped': {
        const s = await repo.findShipmentForMessage(db, order.id);
        return { ...base, courier: s?.courier_name ?? 'our courier', awb: s?.awb_code ?? '—', etd: s?.etd ?? 'soon' };
      }
      case 'delivery_attempt_failed':
        return { ...base, help_url: trackUrl(code) };
      case 'order_cancelled':
        return {
          ...base,
          refund_note:
            order.payment_status === 'PAID' || order.payment_status === 'REFUND_PENDING'
              ? `Your refund of ${formatINR(order.total_paise)} is on its way (5–7 working days).`
              : '',
        };
      default:
        return base;
    }
  }

  return {
    deliver,

    /** ORDER_CONFIRMED / ORDER_CANCELLED / ORDER_STATUS_NOTIFY → customer template (07 §6). */
    async notifyCustomer(
      orderId: string,
      template: TemplateName,
      opts: { finalAttempt?: boolean } = {},
    ): Promise<DeliveryOutcome> {
      const order = await orderStore.findById(db, orderId);
      if (!order) return { kind: 'skipped', reason: 'NOT_APPLICABLE' };
      return deliver({
        orderId,
        userId: order.user_id,
        to: order.customer_phone,
        template,
        variables: await customerVars(order, template),
        language: config.customerLanguage,
        whatsappAllowed: order.whatsapp_opt_in,
        finalAttempt: opts.finalAttempt,
      });
    },

    /** REFUND_PROCESSED → refund_processed with the refunded amount. */
    async notifyRefund(refundId: string, opts: { finalAttempt?: boolean } = {}): Promise<DeliveryOutcome> {
      const refund = await findRefund(db, refundId);
      if (!refund || refund.status !== 'PROCESSED' || refund.reason === 'DUPLICATE_PAYMENT') {
        return { kind: 'skipped', reason: 'NOT_APPLICABLE' };
      }
      const order = (await orderStore.findById(db, refund.order_id))!;
      return deliver({
        orderId: order.id,
        userId: order.user_id,
        to: order.customer_phone,
        template: 'refund_processed',
        variables: { order_code: order.order_code, amount: formatINR(refund.amount_paise) },
        language: config.customerLanguage,
        whatsappAllowed: order.whatsapp_opt_in,
        finalAttempt: opts.finalAttempt,
      });
    },

    /** WHATSAPP_SEND — staff (partner push fallback). Staff numbers are contacted for work: no consent gate. */
    async notifyStaff(
      p: { template: TemplateName; userId: string | null; orderId: string | null; variables?: Record<string, string> },
      opts: { finalAttempt?: boolean } = {},
    ): Promise<DeliveryOutcome> {
      const to = p.userId ? await repo.findUserPhone(db, p.userId) : null;
      let variables = p.variables ?? {};
      if (p.orderId && Object.keys(variables).length === 0) {
        const order = await orderStore.findById(db, p.orderId);
        const items = order ? await orderStore.listItems(db, order.id) : [];
        variables = { order_code: order?.order_code ?? '', jars: String(items.reduce((n, i) => n + i.quantity, 0)) };
      }
      return deliver({
        orderId: p.orderId,
        userId: p.userId,
        to,
        template: p.template,
        variables,
        language: 'hi',
        whatsappAllowed: true,
        finalAttempt: opts.finalAttempt,
      });
    },

    /**
     * WhatsApp delivery receipts (POST /webhooks/whatsapp, Phase 8 §8.4) → notifications_log status
     * (monotonic). Unknown ids (other WABA apps, very old) are counted, not errors.
     */
    async applyReceipts(
      statuses: { id: string; status: string; timestamp?: string; errors?: { title?: string; message?: string }[] }[],
    ): Promise<{ updated: number; unknown: number }> {
      let updated = 0;
      let unknown = 0;
      for (const s of statuses) {
        const status = ({ sent: 'SENT', delivered: 'DELIVERED', read: 'READ', failed: 'FAILED' } as const)[
          s.status as 'sent' | 'delivered' | 'read' | 'failed'
        ];
        if (!status) continue;
        const at = s.timestamp && /^\d+$/.test(s.timestamp) ? new Date(Number(s.timestamp) * 1000) : now();
        const err = s.errors?.[0]
          ? `${s.errors[0].title ?? ''} ${s.errors[0].message ?? ''}`.trim().slice(0, 300)
          : null;
        if (await repo.applyDeliveryStatus(db, { providerMessageId: s.id, status, at, error: err })) updated += 1;
        else unknown += 1;
      }
      return { updated, unknown };
    },

    /** Was this order cancelled after it reached the packing desk? (partner "pack mat karein"). */
    async partnerShouldKnowCancel(orderId: string): Promise<boolean> {
      const from = await repo.cancelledFrom(db, orderId);
      return from === 'AWAITING_PACKING' || from === 'PACKED' || from === 'PICKUP_SCHEDULED';
    },

    /**
     * ADMIN_ALERT (Phase 8 §8.6): WhatsApp to every admin number, e-mail fallback. Batched per kind:
     * the first alert in a 10-min window goes now; later ones only bump a counter and the window's
     * ADMIN_ALERT_SUMMARY job sends "N more" once.
     */
    async adminAlert(
      p: { kind: string; orderId: string | null; message: string },
      opts: { finalAttempt?: boolean } = {},
    ) {
      const window = String(Math.floor(now().getTime() / (ALERT_BATCH_WINDOW_SEC * 1000)));
      const key = `pk:alert-batch:${p.kind}:${window}`;
      const n = await redis.incr(key);
      if (n === 1) {
        await redis.expire(key, ALERT_BATCH_WINDOW_SEC * 2);
        await jobs
          .add('ADMIN_ALERT_SUMMARY', { kind: p.kind, window }, jobIds.alert(`summary-${p.kind}`, window), {
            delayMs: ALERT_BATCH_WINDOW_SEC * 1000,
          })
          .catch((err: unknown) => log.error({ err }, 'alert summary enqueue failed'));
        return sendAdmin(p.kind, p.message, p.orderId, opts.finalAttempt);
      }
      return { batched: n };
    },

    async adminAlertSummary(p: { kind: string; window: string }, opts: { finalAttempt?: boolean } = {}) {
      const n = Number((await redis.get(`pk:alert-batch:${p.kind}:${p.window}`)) ?? 0);
      if (n <= 1) return { batched: 0 };
      return sendAdmin(
        p.kind,
        `${n - 1} more "${p.kind}" alert(s) in the last 10 minutes — see the admin dashboard`,
        null,
        opts.finalAttempt,
      );
    },
  };

  async function sendAdmin(kind: string, message: string, orderId: string | null, finalAttempt?: boolean) {
    const results: DeliveryOutcome[] = [];
    for (const phone of config.adminPhones) {
      results.push(
        await deliver({
          orderId,
          userId: null,
          to: phone,
          template: 'admin_alert',
          variables: { kind, message },
          language: 'en',
          whatsappAllowed: true,
          finalAttempt,
          dedup: false,
        }).catch((err: unknown) => {
          if (finalAttempt === false) throw err;
          return { kind: 'failed', error: (err as Error).message } as DeliveryOutcome;
        }),
      );
    }
    const reached = results.some((r) => r.kind === 'sent');
    if (!reached && config.adminEmail) {
      await email.send({ to: config.adminEmail, subject: `[Pahadi Khatki ops] ${kind}`, text: message });
      return { sent: 'EMAIL' as const };
    }
    return { sent: reached ? ('WHATSAPP' as const) : ('NONE' as const) };
  }
}

export type MessagesService = ReturnType<typeof createMessagesService>;
