import type { Logger } from 'pino';
import type { ErrorReporter } from '../config/sentry';
import type { PaymentGateway } from '../integrations/razorpay/gateway';
import { orderStore } from '../modules/orders/orders.service';
import type { CommerceServices } from '../services';
import type { Db } from '../config/db';
import { jobIds, type JobQueue } from './queues';

/**
 * Background sweepers (architecture/07 §4.4). Each is safe to run concurrently with checkout,
 * webhooks and itself: reads candidates without locks, does gateway calls outside transactions,
 * re-checks state under `FOR UPDATE SKIP LOCKED` before changing anything.
 */
export function createSweepers(deps: {
  db: Db;
  svc: CommerceServices;
  gateway: PaymentGateway;
  jobs: JobQueue;
  logger: Logger;
  reporter: ErrorReporter;
}) {
  const { db, svc, gateway, jobs, logger, reporter } = deps;

  return {
    /** Every minute: unpaid holds past reservation_expires_at → EXPIRED + stock released. */
    async expireReservations(batchSize = 100): Promise<{ expired: number; confirmed: number }> {
      const candidates = await orderStore.listExpiredPending(db, batchSize);
      let expired = 0;
      let confirmed = 0;
      for (const c of candidates) {
        try {
          // (2) Paid but the webhook hasn't landed? Ask Razorpay first — outside any transaction
          if (c.gateway_order_id) {
            const captured = (await gateway.fetchOrderPayments(c.gateway_order_id)).find(
              (p) => p.status === 'captured',
            );
            if (captured) {
              const outcome = await svc.payments.confirmPayment({
                gatewayOrderId: c.gateway_order_id,
                gatewayPaymentId: captured.id,
                amountPaise: captured.amountPaise,
                method: captured.method,
                source: 'RECONCILE',
              });
              if (outcome.kind === 'CONFIRMED') {
                confirmed += 1;
                continue;
              }
            }
          }
          // (3) Short transaction with SKIP LOCKED + state re-check inside expireOrder
          if (await svc.orders.expireOrder(c.id, 'RESERVATION_EXPIRED', { skipLocked: true })) expired += 1;
        } catch (err) {
          // One bad order (gateway down, …) must not stop the sweep; it is retried next minute
          logger.error({ err, orderId: c.id }, 'expire sweeper: order skipped');
        }
      }
      if (expired || confirmed) logger.info({ expired, confirmed }, 'expire sweeper');
      return { expired, confirmed };
    },

    /** Every 5 min: confirmed orders whose follow-up jobs never ran → re-enqueue with the same ids. */
    async reconcileConfirmed(): Promise<number> {
      const stale = await orderStore.listStaleConfirmed(db, 200);
      for (const o of stale) {
        if (o.needs_invoice) await jobs.add('GENERATE_INVOICE', { orderId: o.id }, jobIds.invoice(o.id));
        // Still CONFIRMED after 5 min = booking or label not done; both jobs are idempotent per order
        if (o.status === 'CONFIRMED') await jobs.add('SHIPROCKET_CREATE_ORDER', { orderId: o.id }, jobIds.ship(o.id));
      }
      await svc.logistics.reconcileLabels();
      return stale.length;
    },

    reconcileRefunds: () => svc.payments.reconcileRefunds(),

    /** Daily: stock ledger invariant (07 invariant 2) — any drift is an alert, never auto-fixed. */
    async ledgerCheck(): Promise<number> {
      const mismatches = await svc.inventory.findLedgerMismatches(db);
      if (mismatches.length) {
        logger.error({ mismatches }, 'LEDGER MISMATCH: available_stock != SUM(movements)');
        reporter.capture(new Error(`Stock ledger mismatch on ${mismatches.length} batch(es)`), {
          batchIds: mismatches.map((m) => m.batchId).join(','),
        });
      }
      return mismatches.length;
    },
  };
}

export type Sweepers = ReturnType<typeof createSweepers>;
