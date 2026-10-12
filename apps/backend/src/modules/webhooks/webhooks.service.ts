import { createHash, timingSafeEqual } from 'node:crypto';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { Db } from '../../config/db';
import type { ErrorReporter } from '../../config/sentry';
import type { GatewayPayment, PaymentGateway } from '../../integrations/razorpay/gateway';
import { AppError } from '../../utils/app-error';
import { parseShiprocketTime } from '../../integrations/shiprocket/time';
import { jobIds, type JobQueue } from '../../jobs/queues';
import * as repo from './webhooks.repository';
import type { LogisticsService } from '../logistics/logistics.service';
import type { PaymentsService } from '../payments/payments.service';

const PaymentEntity = z.object({
  id: z.string(),
  order_id: z.string().nullable().optional(),
  amount: z.number().int(),
  status: z.string(),
  method: z.string().nullable().optional(),
  error_code: z.string().nullable().optional(),
  error_description: z.string().nullable().optional(),
});
const RefundEntity = z.object({
  id: z.string(),
  payment_id: z.string(),
  amount: z.number().int(),
  status: z.string(),
  notes: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]).optional(),
});
const RazorpayEvent = z.object({
  event: z.string(),
  payload: z.object({
    payment: z.object({ entity: PaymentEntity }).optional(),
    refund: z.object({ entity: RefundEntity }).optional(),
  }),
});

const toPayment = (e: z.infer<typeof PaymentEntity>): GatewayPayment => ({
  id: e.id,
  orderId: e.order_id ?? '',
  amountPaise: e.amount,
  status: e.status as GatewayPayment['status'],
  method: e.method ?? null,
  errorCode: e.error_code ?? null,
  errorDescription: e.error_description ?? null,
});

export type WebhookResult = { status: 'processed' | 'duplicate' | 'ignored' | 'business_error' };

/** Shiprocket tracking push (fields we use; the rest is stored raw). */
const CourierTrackingEvent = z.looseObject({
  awb: z.union([z.string(), z.number()]).transform(String),
  current_status: z.string().min(1),
  current_status_id: z.coerce.number().int().nullish(),
  shipment_status: z.string().nullish(),
  shipment_status_id: z.coerce.number().int().nullish(),
  current_timestamp: z.string().nullish(),
  scans: z.array(z.looseObject({ location: z.string().nullish() })).nullish(),
});

function sameSecret(given: string | undefined, expected: string): boolean {
  if (!given) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * POST /webhooks/razorpay — architecture/07 §4.3. Signature on the RAW body (webhook secret, not
 * the key secret) → dedup in webhook_events → route the event. Business errors are stored and
 * acknowledged with 200 (or Razorpay retries forever); only infrastructure errors return 5xx.
 */
export function createWebhooksService(deps: {
  db: Db;
  gateway: PaymentGateway;
  payments: PaymentsService;
  logistics: LogisticsService;
  jobs: JobQueue;
  /** Shared token Shiprocket sends as `x-api-key` (D-35). */
  courierWebhookToken: string;
  logger: Logger;
  reporter: ErrorReporter;
  now?: () => Date;
}) {
  const { db, gateway, payments, logistics, jobs, logger, reporter } = deps;
  const now = deps.now ?? (() => new Date());

  async function route(event: z.infer<typeof RazorpayEvent>): Promise<'processed' | 'ignored'> {
    const payment = event.payload.payment?.entity;
    const refund = event.payload.refund?.entity;
    switch (event.event) {
      case 'payment.captured':
      case 'order.paid': {
        if (!payment?.order_id) throw new AppError('VALIDATION_ERROR', 'Event has no payment/order id.');
        await payments.confirmPayment({
          gatewayOrderId: payment.order_id,
          gatewayPaymentId: payment.id,
          amountPaise: payment.amount,
          method: payment.method ?? null,
          source: 'WEBHOOK',
        });
        return 'processed';
      }
      case 'payment.failed': {
        if (!payment?.order_id) throw new AppError('VALIDATION_ERROR', 'Event has no payment/order id.');
        await payments.recordFailedPayment(toPayment(payment));
        return 'processed';
      }
      case 'refund.processed':
      case 'refund.failed': {
        if (!refund) throw new AppError('VALIDATION_ERROR', 'Event has no refund.');
        const notes = refund.notes && !Array.isArray(refund.notes) ? refund.notes : {};
        const key = typeof notes.idempotency_key === 'string' ? notes.idempotency_key : null;
        const known = await payments.settleRefund(
          refund.id,
          key,
          event.event === 'refund.processed' ? 'processed' : 'failed',
        );
        if (!known) throw new AppError('NOT_FOUND', 'Refund not initiated by us (dashboard refund?).');
        return 'processed';
      }
      default:
        return 'ignored'; // subscribed events we don't act on
    }
  }

  return {
    async handleRazorpay(
      raw: Buffer,
      signature: string | undefined,
      eventIdHeader: string | undefined,
    ): Promise<WebhookResult> {
      if (!signature || !gateway.verifyWebhookSignature(raw, signature)) {
        throw new AppError('INVALID_SIGNATURE', 'Webhook signature check failed.');
      }
      let parsed: z.infer<typeof RazorpayEvent>;
      let json: unknown;
      try {
        json = JSON.parse(raw.toString('utf8'));
        parsed = RazorpayEvent.parse(json);
      } catch {
        throw new AppError('VALIDATION_ERROR', 'Malformed webhook body.');
      }
      // Razorpay always sends X-Razorpay-Event-Id; the body hash is a defensive fallback
      const eventId = eventIdHeader ?? `sha256:${createHash('sha256').update(raw).digest('hex')}`;
      const stored = await repo.recordWebhookEvent(db, {
        provider: 'RAZORPAY',
        eventId,
        eventType: parsed.event,
        payload: json,
      });
      if (stored.processed) return { status: 'duplicate' };

      try {
        const result = await route(parsed);
        await repo.markWebhookProcessed(db, stored.id);
        return { status: result };
      } catch (err) {
        if (err instanceof AppError) {
          // Business error: keep it for admin replay, alert, acknowledge
          await repo.markWebhookError(db, stored.id, `${err.code}: ${err.message}`);
          logger.warn({ eventId, event: parsed.event, code: err.code }, 'razorpay webhook business error');
          reporter.capture(err, { webhook: 'razorpay', eventId, event: parsed.event });
          return { status: 'business_error' };
        }
        await repo.markWebhookError(db, stored.id, (err as Error).message).catch(() => undefined);
        throw err; // infra → 5xx → Razorpay retries
      }
    },

    /**
     * POST /webhooks/courier-tracking — Shiprocket tracking push (Phase 6 §6.9, 07 §5). Token in
     * `x-api-key` (constant-time compare) → dedup sha256(awb + status + timestamp) → shared tracking
     * processor. Shiprocket expects 200 for everything it sends; only a bad token (401) or an
     * infrastructure failure (5xx, it retries) differ.
     */
    async handleCourierTracking(raw: Buffer, apiKey: string | undefined): Promise<WebhookResult> {
      if (!sameSecret(apiKey, deps.courierWebhookToken)) {
        throw new AppError('UNAUTHENTICATED', 'Invalid webhook token.');
      }
      let json: unknown;
      try {
        json = raw.length ? JSON.parse(raw.toString('utf8')) : {};
      } catch {
        return { status: 'ignored' }; // the panel's "test webhook" ping may be empty / non-JSON
      }
      const parsed = CourierTrackingEvent.safeParse(json);
      if (!parsed.success) return { status: 'ignored' };
      const ev = parsed.data;
      const eventId = createHash('sha256')
        .update(`${ev.awb}|${ev.current_status}|${ev.current_timestamp ?? ''}`)
        .digest('hex');
      const stored = await repo.recordWebhookEvent(db, {
        provider: 'SHIPROCKET',
        eventId,
        eventType: ev.current_status.slice(0, 60),
        payload: json,
      });
      if (stored.processed) return { status: 'duplicate' };

      const outcome = await logistics.processTracking({
        awb: ev.awb,
        statusText: ev.current_status,
        statusId: ev.shipment_status_id ?? ev.current_status_id ?? null,
        eventTime: parseShiprocketTime(ev.current_timestamp) ?? now(),
        location: ev.scans?.at(-1)?.location ?? null,
        source: 'WEBHOOK',
        raw: json,
      });
      if (outcome.kind === 'unknown_awb') {
        await repo.markWebhookError(db, stored.id, `UNKNOWN_AWB: ${ev.awb}`);
        logger.warn({ eventId }, 'courier webhook for an unknown AWB');
        reporter.capture(new Error('Courier webhook for an unknown AWB'), { webhook: 'courier-tracking', eventId });
        await jobs
          .add(
            'ADMIN_ALERT',
            { kind: 'UNKNOWN_AWB', orderId: null, message: `Courier update for AWB ${ev.awb} not in our shipments` },
            jobIds.alert('UNKNOWN_AWB', ev.awb),
          )
          .catch((err: unknown) => logger.error({ err }, 'alert enqueue failed'));
        return { status: 'business_error' };
      }
      await repo.markWebhookProcessed(db, stored.id);
      return { status: outcome.kind === 'duplicate' ? 'duplicate' : 'processed' };
    },

    /**
     * Admin replay of a stored event (Phase 9 §9.11, POST /admin/webhooks/:id/replay). The
     * signature was checked when it arrived; processing is idempotent (business guards), so
     * re-running a half-processed or errored event is safe.
     */
    async replay(ev: { id: number; provider: string; payload: unknown }): Promise<WebhookResult> {
      try {
        if (ev.provider === 'RAZORPAY') {
          const parsed = RazorpayEvent.parse(ev.payload);
          const result = await route(parsed);
          await repo.markWebhookProcessed(db, ev.id);
          return { status: result };
        }
        const parsed = CourierTrackingEvent.parse(ev.payload);
        const outcome = await logistics.processTracking({
          awb: parsed.awb,
          statusText: parsed.current_status,
          statusId: parsed.shipment_status_id ?? parsed.current_status_id ?? null,
          eventTime: parseShiprocketTime(parsed.current_timestamp) ?? now(),
          location: parsed.scans?.at(-1)?.location ?? null,
          source: 'WEBHOOK',
          raw: ev.payload,
        });
        if (outcome.kind === 'unknown_awb') throw new AppError('NOT_FOUND', `UNKNOWN_AWB: ${parsed.awb}`);
        await repo.markWebhookProcessed(db, ev.id);
        return { status: outcome.kind === 'duplicate' ? 'duplicate' : 'processed' };
      } catch (err) {
        if (err instanceof AppError || err instanceof z.ZodError) {
          await repo.markWebhookError(db, ev.id, `REPLAY ${(err as Error).message}`);
          return { status: 'business_error' };
        }
        throw err;
      }
    },
  };
}

export type WebhooksService = ReturnType<typeof createWebhooksService>;
