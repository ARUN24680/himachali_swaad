import { createHash } from 'node:crypto';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { Db } from '../../config/db';
import type { ErrorReporter } from '../../config/sentry';
import type { GatewayPayment, PaymentGateway } from '../../integrations/razorpay/gateway';
import { AppError } from '../../utils/app-error';
import * as repo from './webhooks.repository';
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

/**
 * POST /webhooks/razorpay — architecture/07 §4.3. Signature on the RAW body (webhook secret, not
 * the key secret) → dedup in webhook_events → route the event. Business errors are stored and
 * acknowledged with 200 (or Razorpay retries forever); only infrastructure errors return 5xx.
 */
export function createWebhooksService(deps: {
  db: Db;
  gateway: PaymentGateway;
  payments: PaymentsService;
  logger: Logger;
  reporter: ErrorReporter;
}) {
  const { db, gateway, payments, logger, reporter } = deps;

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
  };
}

export type WebhooksService = ReturnType<typeof createWebhooksService>;
