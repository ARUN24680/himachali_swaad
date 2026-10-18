import {
  STATUS_TIMESTAMP_COLUMN,
  canTransition,
  type ActorType,
  type CancelOrderResponse,
  type InvoiceUrlResponse,
  type OrderRow,
  type OrderStatus,
  type OrderStatusResponse,
  type RefundReason,
} from '@pk/shared';
import type { Logger } from 'pino';
import type { Db, Queryable } from '../../config/db';
import type { PaymentGateway } from '../../integrations/razorpay/gateway';
import { SIGNED_URL_TTL_SEC, type PrivateStorage } from '../../integrations/storage/private';
import { jobIds, type JobQueue } from '../../jobs/queues';
import type { AuthContext } from '../../middleware/auth';
import { AppError } from '../../utils/app-error';
import { audit } from '../audit/audit.service';
import type { InventoryService } from '../inventory/inventory.service';
import { latestOrderRefund, requestRefund } from '../payments/refund-requests';
import * as repo from './orders.repository';

// ── The state machine (architecture/07 §4.5, D-29) ─────────────────────────

export interface TransitionOpts {
  actor: ActorType;
  actorId?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  /** Stored on orders.cancel_reason (customer-safe code) when moving to CANCELLED. */
  cancelReason?: RefundReason | 'PAYMENT_WINDOW_EXPIRED' | null;
}

/**
 * The ONLY way an order's status changes. Validates against the shared allowed map, updates with
 * an optimistic `WHERE status = from` guard, stamps the whitelisted timestamp column and writes
 * an order_status_logs row — all on the caller's transaction client.
 */
export async function transitionOrder(
  client: Queryable,
  orderId: string,
  from: OrderStatus,
  to: OrderStatus,
  opts: TransitionOpts,
): Promise<void> {
  if (!canTransition(from, to, opts.actor)) {
    throw new AppError('ILLEGAL_TRANSITION', `An order cannot move from ${from} to ${to}.`, { from, to });
  }
  const moved = await repo.updateOrderStatusGuarded(client, orderId, from, to, {
    timestampColumn: STATUS_TIMESTAMP_COLUMN[to] ?? null,
    cancelReason: to === 'CANCELLED' ? (opts.cancelReason ?? null) : null,
  });
  if (!moved)
    throw new AppError('STALE_STATE', 'This order was updated meanwhile. Refresh and try again.', { from, to });
  await repo.insertStatusLog(client, {
    orderId,
    from,
    to,
    actor: opts.actor,
    actorId: opts.actorId ?? null,
    reason: opts.reason ?? null,
    metadata: opts.metadata ?? {},
  });
}

/** First log row of a new order (no `from`). */
export function logOrderCreated(client: Queryable, orderId: string, actorId: string | null): Promise<void> {
  return repo.insertStatusLog(client, {
    orderId,
    from: null,
    to: 'PENDING_PAYMENT',
    actor: 'CUSTOMER',
    actorId,
    reason: null,
    metadata: {},
  });
}

// ── Access ────────────────────────────────────────────────────────────────

export interface OrderAccess {
  auth?: AuthContext;
  /** E.164 phone typed by a guest. */
  phone?: string;
}

const NOT_FOUND = () => new AppError('NOT_FOUND', 'Order not found.');

/** Customer statuses that can still be cancelled online (07 §1.2). */
const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = ['CONFIRMED', 'AWAITING_PACKING'];
/**
 * A Shiprocket booking may exist from CONFIRMED on (the booking job runs right after payment), so
 * its cancel job is enqueued for all of these; the job is a no-op when nothing was booked.
 */
const MAY_HAVE_SHIPMENT: readonly OrderStatus[] = ['CONFIRMED', 'AWAITING_PACKING', 'PACKED', 'PICKUP_SCHEDULED'];

export function createOrdersService(deps: {
  db: Db;
  inventory: InventoryService;
  gateway: PaymentGateway;
  jobs: JobQueue;
  privateStorage: PrivateStorage;
  logger: Logger;
}) {
  const { db, inventory, gateway, jobs, privateStorage, logger } = deps;

  /** Session owner = the order's user, or a CUSTOMER whose verified (OTP) phone placed it. */
  async function isSessionOwner(q: Queryable, order: OrderRow, auth: AuthContext | undefined): Promise<boolean> {
    if (!auth || auth.role !== 'CUSTOMER') return false;
    if (order.user_id === auth.userId) return true;
    return (await repo.findUserPhone(q, auth.userId)) === order.customer_phone;
  }

  async function canRead(order: OrderRow, access: OrderAccess): Promise<boolean> {
    if (access.auth?.role === 'ADMIN') return true;
    if (access.phone && access.phone === order.customer_phone) return true;
    return isSessionOwner(db, order, access.auth);
  }

  async function readable(orderCode: string, access: OrderAccess): Promise<OrderRow> {
    const order = await repo.findOrderByCode(db, orderCode);
    // Same 404 for "no such order" and "not yours" — no enumeration (D-39)
    if (!order || !(await canRead(order, access))) throw NOT_FOUND();
    return order;
  }

  /** Enqueue after COMMIT; a failure is logged and the reconcile sweepers re-enqueue (07 §4.2). */
  async function enqueue(fn: () => Promise<void>, what: string): Promise<void> {
    try {
      await fn();
    } catch (err) {
      logger.error({ err, what }, 'job enqueue failed — reconcile sweeper will retry');
    }
  }

  return {
    /**
     * PENDING_PAYMENT → EXPIRED with stock back on the shelf (sweeper, or Razorpay order creation
     * failed). `skipLocked` for the sweeper: a row someone else holds is skipped this round.
     * Returns true when this call expired the order.
     */
    async expireOrder(orderId: string, reason: string, opts: { skipLocked?: boolean } = {}): Promise<boolean> {
      return db.transaction(async (client) => {
        const order = await repo.findOrderById(client, orderId, opts.skipLocked ? 'skip-locked' : 'update');
        // payment_status may be PAID here only after an amount mismatch — its refund is already requested
        if (!order || order.status !== 'PENDING_PAYMENT') return false;
        await inventory.releaseOrderStock(client, orderId, ['RESERVED'], 'reservation expired');
        await transitionOrder(client, orderId, 'PENDING_PAYMENT', 'EXPIRED', { actor: 'SYSTEM', reason });
        return true;
      });
    },

    async statusFor(orderCode: string, access: OrderAccess): Promise<OrderStatusResponse> {
      const order = await readable(orderCode, access);
      const [items, refund] = await Promise.all([repo.listOrderItems(db, order.id), latestOrderRefund(db, order.id)]);
      const owner = await isSessionOwner(db, order, access.auth);
      const holdLeft = order.reservation_expires_at.getTime() > Date.now();
      return {
        orderCode: order.order_code,
        status: order.status,
        paymentStatus: order.payment_status,
        items: items.map((i) => ({
          productId: i.product_id,
          title: i.title,
          netWeightG: i.net_weight_g,
          quantity: i.quantity,
          unitPricePaise: i.unit_price_paise,
          totalPricePaise: i.total_price_paise,
        })),
        subtotalPaise: order.subtotal_paise,
        shippingFeePaise: order.shipping_fee_paise,
        totalPaise: order.total_paise,
        shippingCity: order.shipping_address.city,
        createdAt: order.created_at.toISOString(),
        confirmedAt: order.confirmed_at?.toISOString() ?? null,
        reservationExpiresAt: order.reservation_expires_at.toISOString(),
        cancelReason: order.cancel_reason,
        refund: refund ? { status: refund.status, amountPaise: refund.amount_paise } : null,
        invoiceAvailable: order.invoice_key !== null,
        canCancel: owner && CUSTOMER_CANCELLABLE.includes(order.status),
        whatsappOptIn: order.whatsapp_opt_in,
        retryPayment:
          order.status === 'PENDING_PAYMENT' && order.payment_status === 'UNPAID' && holdLeft && order.gateway_order_id
            ? {
                razorpayOrderId: order.gateway_order_id,
                keyId: gateway.keyId,
                gateway: gateway.kind,
                checkoutUrl: gateway.checkoutUrl(order.gateway_order_id),
                amountPaise: order.total_paise,
              }
            : null,
      };
    },

    /** Dev tooling (shipping simulator) — order id for a code, no access check. */
    async idForCode(orderCode: string): Promise<string | null> {
      return (await repo.findOrderByCode(db, orderCode))?.id ?? null;
    },

    /** Meta CAPI Purchase facts — only for orders that were actually confirmed. */
    async purchaseFacts(orderCode: string) {
      const order = await repo.findOrderByCode(db, orderCode);
      if (!order?.confirmed_at || order.status === 'PENDING_PAYMENT' || order.status === 'EXPIRED') return null;
      const items = await repo.listOrderItems(db, order.id);
      return { totalPaise: order.total_paise, productIds: items.map((i) => i.product_id), phone: order.customer_phone };
    },

    async invoiceUrl(orderCode: string, access: OrderAccess): Promise<InvoiceUrlResponse> {
      const order = await readable(orderCode, access);
      if (!order.invoice_key) throw new AppError('NOT_FOUND', 'The invoice is not ready yet.');
      const { url, expiresAt } = await privateStorage.signedGetUrl(order.invoice_key, SIGNED_URL_TTL_SEC);
      return { url, expiresAt: expiresAt.toISOString() };
    },

    /**
     * Customer (session owner; CONFIRMED / AWAITING_PACKING) or ADMIN (07 §1.2) cancel. Jars that
     * never left the kitchen go back on the shelf (D-31), a paid order gets a full refund intent,
     * and a booked shipment gets a cancel job.
     */
    async cancel(
      orderCode: string,
      by: { actor: 'CUSTOMER' | 'ADMIN'; auth: AuthContext; refund: boolean; reason: string; ip: string | null },
    ): Promise<CancelOrderResponse> {
      const outcome = await db.transaction(async (client) => {
        const order = await repo.findOrderByCode(client, orderCode, 'update');
        if (!order) throw NOT_FOUND();
        if (by.actor === 'CUSTOMER' && !(await isSessionOwner(client, order, by.auth))) throw NOT_FOUND();
        if (!canTransition(order.status, 'CANCELLED', by.actor)) {
          throw new AppError(
            'ILLEGAL_TRANSITION',
            by.actor === 'CUSTOMER'
              ? 'This order can no longer be cancelled online. Please contact us.'
              : `An order in ${order.status} cannot be cancelled.`,
            { from: order.status, to: 'CANCELLED' },
          );
        }
        const paid = order.payment_status === 'PAID';
        if (paid && !by.refund) {
          throw new AppError('VALIDATION_FAILED', 'A paid order must be refunded when cancelled.', { field: 'refund' });
        }
        const cancelReason: RefundReason = by.actor === 'CUSTOMER' ? 'CUSTOMER_CANCEL' : 'ADMIN_CANCEL';

        await inventory.releaseOrderStock(client, order.id, ['RESERVED', 'COMMITTED'], 'order cancelled');
        await transitionOrder(client, order.id, order.status, 'CANCELLED', {
          actor: by.actor,
          actorId: by.auth.userId,
          reason: by.reason,
          cancelReason,
        });
        const refundId = paid
          ? await requestRefund(client, {
              orderId: order.id,
              paymentStatus: order.payment_status,
              reason: cancelReason,
              by: { type: by.actor, id: by.auth.userId },
              notes: by.reason,
            })
          : null;
        if (by.actor === 'ADMIN') {
          await audit(client, {
            actorId: by.auth.userId,
            action: 'ORDER_CANCEL',
            entityType: 'order',
            entityId: order.id,
            before: { status: order.status, paymentStatus: order.payment_status },
            after: { status: 'CANCELLED', refund: Boolean(refundId), reason: by.reason },
            ip: by.ip,
          });
        }
        return { order, refundId };
      });

      const { order, refundId } = outcome;
      if (refundId) await enqueue(() => jobs.add('INITIATE_REFUND', { refundId }, jobIds.refund(refundId)), 'refund');
      if (MAY_HAVE_SHIPMENT.includes(order.status)) {
        await enqueue(
          () => jobs.add('SHIPROCKET_CANCEL_SHIPMENT', { orderId: order.id }, jobIds.shipCancel(order.id)),
          'ship-cancel',
        );
      }
      await enqueue(
        () => jobs.add('ORDER_CANCELLED', { orderId: order.id }, jobIds.notify('order_cancelled', order.id)),
        'notify',
      );
      const after = (await repo.findOrderById(db, order.id))!;
      return { orderCode: after.order_code, status: after.status, paymentStatus: after.payment_status };
    },
  };
}

export type OrdersService = ReturnType<typeof createOrdersService>;

/**
 * Order-row reads/writes other modules (checkout, payments, jobs) may use inside THEIR
 * transactions — the orders repository stays private to this module (09 §2). Status is NOT
 * here: it changes only through transitionOrder().
 */
export const orderStore = {
  findById: repo.findOrderById,
  findByCode: repo.findOrderByCode,
  findByIdempotencyKey: repo.findOrderByIdempotencyKey,
  findByGatewayOrderId: repo.findOrderByGatewayOrderId,
  insert: repo.insertOrder,
  insertItem: repo.insertOrderItem,
  listItems: repo.listOrderItems,
  setPickupLocation: repo.setPickupLocation,
  setGatewayOrderId: repo.setGatewayOrderId,
  appendOpsIssue: repo.appendOpsIssue,
  clearOpsIssue: repo.clearOpsIssue,
  defaultPickupLocationId: repo.findDefaultPickupLocationId,
  listExpiredPending: repo.listExpiredPendingOrders,
  listStaleConfirmed: repo.listStaleConfirmedOrders,
  listStatusLogs: repo.listStatusLogs,
};
