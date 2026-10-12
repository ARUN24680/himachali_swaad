import type { VerifyPaymentRequest, VerifyPaymentResponse } from '@pk/shared';
import type { Logger } from 'pino';
import type { Db } from '../../config/db';
import type { ErrorReporter } from '../../config/sentry';
import { GatewayError, type GatewayPayment, type PaymentGateway } from '../../integrations/razorpay/gateway';
import { jobIds, type JobQueue } from '../../jobs/queues';
import { AppError } from '../../utils/app-error';
import type { InventoryService } from '../inventory/inventory.service';
import { orderStore, transitionOrder } from '../orders/orders.service';
import * as repo from './payments.repository';
import { changePaymentStatus, requestRefund } from './refund-requests';

export type ConfirmSource = 'CLIENT_VERIFY' | 'WEBHOOK' | 'RECONCILE';

export type ConfirmOutcome =
  | { kind: 'CONFIRMED'; orderId: string; orderCode: string }
  | { kind: 'REFUND'; orderId: string; orderCode: string; refundId: string }
  | { kind: 'ALREADY_PROCESSED'; orderId: string; orderCode: string; refundId: string | null };

/**
 * confirmPayment() — architecture/07 §4.2. The ONE path from "Razorpay says captured" to an order:
 * the verify endpoint, the webhook and the expiry sweeper all call it, so it must be idempotent.
 * Locks the order row; side-effect jobs are enqueued after COMMIT with deterministic ids.
 */
export function createPaymentsService(deps: {
  db: Db;
  gateway: PaymentGateway;
  inventory: InventoryService;
  jobs: JobQueue;
  logger: Logger;
  reporter: ErrorReporter;
}) {
  const { db, gateway, inventory, jobs, logger, reporter } = deps;

  async function enqueue(fn: () => Promise<void>, what: string): Promise<void> {
    try {
      await fn();
    } catch (err) {
      // RECONCILE_CONFIRMED / RECONCILE_REFUNDS re-enqueue with the same job id (07 §4.4)
      logger.error({ err, what }, 'job enqueue failed — reconcile sweeper will retry');
    }
  }

  async function confirmPayment(p: {
    gatewayOrderId: string;
    gatewayPaymentId: string;
    amountPaise: number;
    method: string | null;
    source: ConfirmSource;
  }): Promise<ConfirmOutcome> {
    const outcome = await db.transaction(async (client): Promise<ConfirmOutcome> => {
      const order = await orderStore.findByGatewayOrderId(client, p.gatewayOrderId, 'update');
      if (!order) throw new AppError('NOT_FOUND', 'No order for this payment.', { gatewayOrderId: p.gatewayOrderId });
      const base = { orderId: order.id, orderCode: order.order_code };

      const capturedBefore = await repo.listCapturedPayments(client, order.id);
      const payment = await repo.upsertCapturedPayment(client, {
        orderId: order.id,
        gatewayOrderId: p.gatewayOrderId,
        gatewayPaymentId: p.gatewayPaymentId,
        amountPaise: p.amountPaise,
        method: p.method,
      });

      if (order.payment_status !== 'UNPAID') {
        // Idempotent replay — unless this is a SECOND payment on a paid order: refund that one
        const isDuplicate = capturedBefore.length > 0 && !capturedBefore.some((c) => c.id === payment.id);
        if (!isDuplicate) return { kind: 'ALREADY_PROCESSED', ...base, refundId: null };
        await orderStore.appendOpsIssue(client, order.id, `DUPLICATE_PAYMENT ${p.gatewayPaymentId}`);
        const refundId = await requestRefund(client, {
          orderId: order.id,
          paymentStatus: order.payment_status,
          reason: 'DUPLICATE_PAYMENT',
          by: { type: 'RAZORPAY', id: null },
          paymentId: payment.id,
        });
        return { kind: 'ALREADY_PROCESSED', ...base, refundId };
      }

      // Money is in from here on: either the order is fulfilled or the payment is refunded (07 invariant 3)
      await changePaymentStatus(client, order.id, 'UNPAID', 'PAID');

      if (p.amountPaise !== order.total_paise) {
        await orderStore.appendOpsIssue(
          client,
          order.id,
          `AMOUNT_MISMATCH paid=${p.amountPaise} expected=${order.total_paise}`,
        );
        const refundId = await requestRefund(client, {
          orderId: order.id,
          paymentStatus: 'PAID',
          reason: 'AMOUNT_MISMATCH',
          by: { type: 'RAZORPAY', id: null },
          paymentId: payment.id,
        });
        return { kind: 'REFUND', ...base, refundId };
      }

      if (order.status === 'PENDING_PAYMENT') {
        await inventory.commitReservations(client, order.id);
        await transitionOrder(client, order.id, 'PENDING_PAYMENT', 'CONFIRMED', {
          actor: 'RAZORPAY',
          metadata: { source: p.source, gatewayPaymentId: p.gatewayPaymentId },
        });
        return { kind: 'CONFIRMED', ...base };
      }

      if (order.status === 'EXPIRED') {
        // Late payment: re-reserve inside a SAVEPOINT; stockout → cancel + refund
        await client.query('SAVEPOINT late_reserve');
        try {
          const items = await orderStore.listItems(client, order.id); // product_id order
          for (const item of items) {
            await inventory.reserveForItem(client, {
              orderId: order.id,
              orderItemId: item.id,
              productId: item.product_id,
              quantity: item.quantity,
              status: 'COMMITTED',
              reason: 'late payment re-reservation',
            });
          }
          await transitionOrder(client, order.id, 'EXPIRED', 'CONFIRMED', {
            actor: 'RAZORPAY',
            reason: 'LATE_PAYMENT',
            metadata: { source: p.source, gatewayPaymentId: p.gatewayPaymentId },
          });
          await client.query('RELEASE SAVEPOINT late_reserve');
          return { kind: 'CONFIRMED', ...base };
        } catch (err) {
          if (!(err instanceof AppError) || err.code !== 'OUT_OF_STOCK') throw err;
          await client.query('ROLLBACK TO SAVEPOINT late_reserve');
          await transitionOrder(client, order.id, 'EXPIRED', 'CANCELLED', {
            actor: 'RAZORPAY',
            reason: 'LATE_PAYMENT_STOCKOUT',
            cancelReason: 'LATE_PAYMENT_STOCKOUT',
          });
          const refundId = await requestRefund(client, {
            orderId: order.id,
            paymentStatus: 'PAID',
            reason: 'LATE_PAYMENT_STOCKOUT',
            by: { type: 'RAZORPAY', id: null },
            paymentId: payment.id,
          });
          return { kind: 'REFUND', ...base, refundId };
        }
      }

      // Paid for an order that can't take money (shouldn't happen) — refund rather than keep it
      await orderStore.appendOpsIssue(client, order.id, `PAYMENT_ON_${order.status}`);
      const refundId = await requestRefund(client, {
        orderId: order.id,
        paymentStatus: 'PAID',
        reason: 'AMOUNT_MISMATCH',
        by: { type: 'RAZORPAY', id: null },
        paymentId: payment.id,
      });
      return { kind: 'REFUND', ...base, refundId };
    });

    // Side-effects AFTER commit (D-30); deterministic ids collapse verify + webhook duplicates
    if (outcome.kind === 'CONFIRMED') {
      const id = outcome.orderId;
      await enqueue(() => jobs.add('SHIPROCKET_CREATE_ORDER', { orderId: id }, jobIds.ship(id)), 'ship');
      await enqueue(() => jobs.add('GENERATE_INVOICE', { orderId: id }, jobIds.invoice(id)), 'invoice');
      await enqueue(() => jobs.add('ORDER_CONFIRMED', { orderId: id }, jobIds.notify('order_confirmed', id)), 'notify');
      await enqueue(
        () => jobs.add('PARTNER_NEW_ORDER_ALERT', { orderId: id }, jobIds.notify('new_order_alert', id)),
        'partner-alert',
      );
    }
    const refundId = outcome.kind === 'CONFIRMED' ? null : outcome.refundId;
    if (refundId) {
      await enqueue(() => jobs.add('INITIATE_REFUND', { refundId }, jobIds.refund(refundId)), 'refund');
    }
    if (outcome.kind === 'REFUND') {
      reporter.capture(new Error('Payment taken for an order that could not be fulfilled — refund started'), {
        orderCode: outcome.orderCode,
      });
    }
    return outcome;
  }

  /** Captured (or capture now, if auto-capture is off) — never trust the client for the amount. */
  async function capturedPayment(paymentId: string, gatewayOrderId: string): Promise<GatewayPayment> {
    let payment = await gateway.fetchPayment(paymentId);
    if (payment.orderId !== gatewayOrderId) {
      throw new AppError('INVALID_SIGNATURE', 'Payment does not belong to this order.');
    }
    if (payment.status === 'authorized') payment = await gateway.capturePayment(payment.id, payment.amountPaise);
    if (payment.status !== 'captured') {
      throw new AppError('INVALID_STATE', 'The payment has not gone through.', { paymentStatus: payment.status });
    }
    return payment;
  }

  return {
    confirmPayment,

    /** POST /payments/verify — Razorpay Checkout success handler (07 §4.3 step 5). */
    async verify(input: VerifyPaymentRequest): Promise<VerifyPaymentResponse> {
      if (!gateway.verifyPaymentSignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature)) {
        throw new AppError('INVALID_SIGNATURE', 'Payment signature check failed.');
      }
      let payment: GatewayPayment;
      try {
        payment = await capturedPayment(input.razorpayPaymentId, input.razorpayOrderId);
      } catch (err) {
        if (err instanceof GatewayError) {
          throw new AppError('UPSTREAM_UNAVAILABLE', 'Payment provider is not responding. We will confirm by webhook.');
        }
        throw err;
      }
      const outcome = await confirmPayment({
        gatewayOrderId: input.razorpayOrderId,
        gatewayPaymentId: payment.id,
        amountPaise: payment.amountPaise,
        method: payment.method,
        source: 'CLIENT_VERIFY',
      });
      return {
        orderCode: outcome.orderCode,
        status:
          outcome.kind === 'CONFIRMED'
            ? 'CONFIRMED'
            : outcome.kind === 'REFUND'
              ? 'REFUND_INITIATED'
              : 'ALREADY_PROCESSED',
      };
    },

    /** payment.failed — the attempt is recorded; the order stays PENDING_PAYMENT so the customer can retry. */
    async recordFailedPayment(e: GatewayPayment): Promise<void> {
      const order = await orderStore.findByGatewayOrderId(db, e.orderId);
      if (!order) throw new AppError('NOT_FOUND', 'No order for this payment.', { gatewayOrderId: e.orderId });
      await repo.upsertFailedPayment(db, {
        orderId: order.id,
        gatewayOrderId: e.orderId,
        gatewayPaymentId: e.id,
        amountPaise: e.amountPaise,
        method: e.method,
        errorCode: e.errorCode,
        errorDescription: e.errorDescription,
      });
    },

    /**
     * INITIATE_REFUND job. The refund row (intent) already exists; this makes the gateway call
     * outside any transaction and stores the gateway id. A retried job first looks for a refund it
     * already created (notes.idempotency_key), so a crash between call and save can't double-refund.
     */
    async initiateRefund(refundId: string): Promise<void> {
      const refund = await repo.findRefundById(db, refundId);
      if (!refund) throw new Error(`refund ${refundId} not found`);
      if (refund.gateway_refund_id || refund.status !== 'PENDING') return;
      const payment = await repo.findPaymentById(db, refund.payment_id);
      if (!payment) throw new Error(`payment ${refund.payment_id} not found`);

      const already = (await gateway.listPaymentRefunds(payment.gateway_payment_id)).find(
        (r) => r.idempotencyKey === refund.idempotency_key,
      );
      const order = await orderStore.findById(db, refund.order_id);
      const made =
        already ??
        (await gateway.createRefund({
          paymentId: payment.gateway_payment_id,
          amountPaise: refund.amount_paise,
          idempotencyKey: refund.idempotency_key,
          notes: { order_code: order?.order_code ?? '', reason: refund.reason },
        }));
      await repo.setGatewayRefundId(db, refund.id, made.id);
      if (made.status === 'processed') await settleRefund(made.id, refund.idempotency_key, 'processed');
    },

    /** Final INITIATE_REFUND failure (retries exhausted) → admin must act. */
    async refundGaveUp(refundId: string, error: string): Promise<void> {
      const refund = await repo.findRefundById(db, refundId);
      if (!refund) return;
      await orderStore.appendOpsIssue(
        db,
        refund.order_id,
        `REFUND_INIT_FAILED ${refund.reason}: ${error}`.slice(0, 500),
      );
    },

    settleRefund,

    /** RECONCILE_REFUNDS: re-enqueue intents the gateway never accepted. */
    async reconcileRefunds(): Promise<number> {
      const ids = await repo.listStuckRefunds(db, 100);
      for (const id of ids) await jobs.add('INITIATE_REFUND', { refundId: id }, jobIds.refund(id));
      return ids.length;
    },
  };

  /**
   * refund.processed / refund.failed (webhook or immediate API answer). Order-level refunds move
   * the payment summary: all processed → REFUNDED, part → PARTIALLY_REFUNDED; failed → back to
   * PAID + ops_issue (07 §2). Returns false when the refund is unknown.
   */
  async function settleRefund(
    gatewayRefundId: string,
    idempotencyKey: string | null,
    status: 'processed' | 'failed',
  ): Promise<boolean> {
    let processedRefundId: string | null = null;
    const known = await db.transaction(async (client) => {
      const refund = await repo.findRefundForWebhook(client, gatewayRefundId, idempotencyKey);
      if (!refund) return false;
      const order = await orderStore.findById(client, refund.order_id, 'update');
      if (!order) return false;
      const orderLevel = refund.reason !== 'DUPLICATE_PAYMENT';

      if (status === 'failed') {
        if (!(await repo.markRefundFailed(client, refund.id, gatewayRefundId))) return true;
        await orderStore.appendOpsIssue(client, order.id, `REFUND_FAILED ${refund.reason} ${gatewayRefundId}`);
        if (orderLevel && order.payment_status === 'REFUND_PENDING') {
          await changePaymentStatus(client, order.id, 'REFUND_PENDING', 'PAID');
        }
        return true;
      }

      if (!(await repo.markRefundProcessed(client, refund.id, gatewayRefundId))) return true; // replay
      if (orderLevel) processedRefundId = refund.id;
      if (orderLevel && order.payment_status === 'REFUND_PENDING') {
        const sums = await repo.sumOrderRefunds(client, order.id);
        if (sums.pending === 0) {
          const paid = (await repo.listCapturedPayments(client, order.id))[0]?.amount_paise ?? order.total_paise;
          await changePaymentStatus(
            client,
            order.id,
            'REFUND_PENDING',
            sums.processed >= paid ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          );
        }
      }
      return true;
    });
    // Customer message after COMMIT (D-30); dedup by refund id
    if (processedRefundId) {
      const id: string = processedRefundId;
      await enqueue(
        () => jobs.add('REFUND_PROCESSED', { refundId: id }, jobIds.notify('refund_processed', id)),
        'refund-notify',
      );
    }
    return known;
  }
}

export type PaymentsService = ReturnType<typeof createPaymentsService>;
