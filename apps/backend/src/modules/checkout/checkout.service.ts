import {
  generateOrderCode,
  gstIncludedPaise,
  type CreateOrderRequest,
  type AbandonOrderResponse,
  type CreateOrderResponse,
  type OrderRow,
} from '@pk/shared';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import type { Logger } from 'pino';
import type { Db } from '../../config/db';
import type { PaymentGateway } from '../../integrations/razorpay/gateway';
import type { AuthContext } from '../../middleware/auth';
import { AppError } from '../../utils/app-error';
import type { AccountService } from '../account/account.service';
import type { CartService } from '../cart/cart.service';
import type { InventoryService } from '../inventory/inventory.service';
import { logOrderCreated, orderStore, type OrdersService } from '../orders/orders.service';
import type { SettingsService } from '../settings/settings.service';

const TtlMinutes = z.number().int().min(1).max(120);
const MAX_CODE_ATTEMPTS = 5; // D-27
const REPLAY_WAIT_STEPS = 40;
const REPLAY_WAIT_MS = 250; // ≤ 10 s ≈ the gateway timeout
/** architecture/02 §9: 5 create-order calls / 10 min per phone (per-IP limit is on the route). */
export const PHONE_LIMIT = { max: 5, windowSec: 600 };

export interface CheckoutContext {
  idempotencyKey: string;
  auth?: AuthContext;
}

/** Thrown inside the transaction when a concurrent request with the same key already created the order. */
class IdempotentReplay extends Error {
  constructor(readonly order: OrderRow) {
    super('idempotent replay');
  }
}

/**
 * Prepaid checkout (Phase 5 §5.5) — architecture/07 §4.1: re-quote on the server, one short
 * transaction that inserts the order and reserves stock FIFO-by-expiry, then Razorpay order
 * creation OUTSIDE the transaction (D-30). If that fails the stock is released straight away.
 */
export function createCheckoutService(deps: {
  db: Db;
  redis: Redis;
  cart: CartService;
  inventory: InventoryService;
  orders: OrdersService;
  account: AccountService;
  settings: SettingsService;
  gateway: PaymentGateway;
  logger: Logger;
}) {
  const { db, redis, cart, inventory, orders, account, settings, gateway, logger } = deps;

  function toResponse(order: OrderRow): CreateOrderResponse {
    return {
      orderCode: order.order_code,
      razorpayOrderId: order.gateway_order_id!,
      amountPaise: order.total_paise,
      currency: 'INR',
      keyId: gateway.keyId,
      gateway: gateway.kind,
      checkoutUrl: gateway.checkoutUrl(order.gateway_order_id!),
      expiresAt: order.reservation_expires_at.toISOString(),
      prefill: { name: order.customer_name, contact: order.customer_phone, email: order.customer_email },
    };
  }

  /** Same key must mean the same checkout: same phone and the same {product, qty} set. */
  async function assertSamePayload(order: OrderRow, input: CreateOrderRequest): Promise<void> {
    const items = await orderStore.listItems(db, order.id);
    const merged = new Map<string, number>();
    for (const i of input.items) merged.set(i.productId, (merged.get(i.productId) ?? 0) + i.quantity);
    const same =
      order.customer_phone === input.customer.phone &&
      items.length === merged.size &&
      items.every((i) => merged.get(i.product_id) === i.quantity);
    if (!same) {
      throw new AppError('IDEMPOTENCY_CONFLICT', 'This checkout was already used for a different cart. Please retry.');
    }
  }

  async function replay(order: OrderRow, input: CreateOrderRequest): Promise<CreateOrderResponse> {
    await assertSamePayload(order, input);
    // A concurrent double-submit can arrive while the first request is still creating the Razorpay
    // order (after COMMIT, before gateway_order_id is saved) — wait for it briefly
    for (let i = 0; i < REPLAY_WAIT_STEPS && order.status === 'PENDING_PAYMENT' && !order.gateway_order_id; i++) {
      await new Promise((r) => setTimeout(r, REPLAY_WAIT_MS));
      order = (await orderStore.findById(db, order.id)) ?? order;
    }
    if (!order.gateway_order_id || order.status !== 'PENDING_PAYMENT') {
      // Payment init failed earlier (order EXPIRED) or the order already moved on — start a new attempt
      throw new AppError('IDEMPOTENCY_CONFLICT', 'This checkout attempt has ended. Please start again.', {
        orderCode: order.order_code,
        status: order.status,
      });
    }
    return toResponse(order);
  }

  async function checkPhoneLimit(phone: string): Promise<void> {
    const key = `pk:rl:checkout-phone:${phone}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, PHONE_LIMIT.windowSec);
    if (count > PHONE_LIMIT.max) {
      const ttl = await redis.ttl(key);
      throw new AppError('RATE_LIMITED', 'Too many checkout attempts for this phone. Please wait a few minutes.', {
        retryAfterSeconds: Math.max(ttl, 1),
      });
    }
  }

  return {
    /** Customer started over: release the old attempt's jars now (unless a payment is already in). */
    async abandon(orderCode: string, idempotencyKey: string): Promise<AbandonOrderResponse> {
      const order = await orderStore.findByCode(db, orderCode);
      // Same 404 for unknown code and wrong key — the key is the browser's proof of ownership
      if (!order || order.idempotency_key !== idempotencyKey) throw new AppError('NOT_FOUND', 'Order not found.');
      if (order.status !== 'PENDING_PAYMENT' || order.payment_status !== 'UNPAID') {
        return { orderCode, released: false };
      }
      if (order.gateway_order_id) {
        // Outside any transaction (D-30). A captured/authorised payment wins — the webhook confirms it.
        const payments = await gateway.fetchOrderPayments(order.gateway_order_id);
        if (payments.some((p) => p.status === 'captured' || p.status === 'authorized')) {
          return { orderCode, released: false };
        }
      }
      return { orderCode, released: await orders.expireOrder(order.id, 'ABANDONED_BY_CUSTOMER') };
    },

    async createOrder(input: CreateOrderRequest, ctx: CheckoutContext): Promise<CreateOrderResponse> {
      // 0. Idempotency: same key → same order, no second reservation
      const existing = await orderStore.findByIdempotencyKey(db, ctx.idempotencyKey);
      if (existing) return replay(existing, input);

      await checkPhoneLimit(input.customer.phone);

      // 1. Server-side pricing — client totals are never trusted
      const { quote, snapshots } = await cart.quoteWithSnapshots(input.items);
      const problem = quote.items.find((l) => l.issue !== null || l.quantity === 0);
      if (problem) {
        throw new AppError(
          'OUT_OF_STOCK',
          problem.issue === 'INACTIVE' ? 'An item is no longer sold.' : 'Some jars just sold out.',
          {
            productId: problem.productId,
            available: problem.issue === 'INACTIVE' ? 0 : problem.availableQuantity,
          },
        );
      }
      const lines = quote.items.map((l) => {
        const snap = snapshots.get(l.productId)!;
        // Publish requires gst_rate_bp (D-49), so a live product always has it
        if (snap.gstRateBp === null) throw new Error(`Active product ${l.productId} has no GST rate`);
        return { ...l, ...snap, gstRateBp: snap.gstRateBp };
      });
      const taxPaise = lines.reduce((sum, l) => sum + gstIncludedPaise(l.lineTotalPaise, l.gstRateBp), 0);
      const userId = ctx.auth?.role === 'CUSTOMER' ? ctx.auth.userId : null;

      // 2. Short transaction: order + items + FIFO reservation (locks in product_id order, D-23)
      let order: OrderRow;
      try {
        order = await db.transaction(async (client) => {
          const ttl = await settings.getSetting(client, 'reservation_ttl_minutes', TtlMinutes);
          const placeholderLocation = await orderStore.defaultPickupLocationId(client);
          if (!placeholderLocation) {
            throw new AppError('OUT_OF_STOCK', 'Some jars just sold out.', {
              productId: lines[0]!.productId,
              available: 0,
            });
          }

          let row: OrderRow | null = null;
          for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS && !row; attempt++) {
            row = await orderStore.insert(client, {
              orderCode: generateOrderCode(),
              idempotencyKey: ctx.idempotencyKey,
              userId,
              customerName: input.customer.fullName,
              customerPhone: input.customer.phone,
              customerEmail: input.customer.email ?? null,
              shippingAddress: {
                fullName: input.customer.fullName,
                phone: input.customer.phone,
                line1: input.shippingAddress.line1,
                line2: input.shippingAddress.line2 ?? null,
                landmark: input.shippingAddress.landmark ?? null,
                city: input.shippingAddress.city,
                state: input.shippingAddress.state,
                pincode: input.shippingAddress.pincode,
              },
              whatsappOptIn: input.consent.whatsappOptIn,
              pickupLocationId: placeholderLocation,
              subtotalPaise: quote.subtotalPaise,
              shippingFeePaise: quote.shippingFeePaise,
              discountPaise: quote.discountPaise,
              totalPaise: quote.totalPaise,
              taxPaise,
              reservationTtlMinutes: ttl,
            });
            if (!row) {
              // Either an order_code clash (retry) or the same key committed by a concurrent request
              const winner = await orderStore.findByIdempotencyKey(client, ctx.idempotencyKey);
              if (winner) throw new IdempotentReplay(winner);
            }
          }
          if (!row) throw new Error('Could not allocate a unique order code');

          const sorted = [...lines].sort((a, b) => a.productId.localeCompare(b.productId));
          const locations = new Set<string>();
          for (const line of sorted) {
            const orderItemId = await orderStore.insertItem(client, {
              orderId: row.id,
              productId: line.productId,
              sku: line.sku,
              title: line.title!,
              netWeightG: line.netWeightG!,
              quantity: line.quantity,
              unitPricePaise: line.unitPricePaise,
              hsnCode: line.hsnCode,
              gstRateBp: line.gstRateBp,
            });
            const from = await inventory.reserveForItem(client, {
              orderId: row.id,
              orderItemId,
              productId: line.productId,
              quantity: line.quantity,
              status: 'RESERVED',
              reason: 'checkout reservation',
            });
            from.forEach((l) => locations.add(l));
          }
          // The kitchen the jars come from ships the parcel. One kitchen at launch; a split across
          // kitchens is flagged for the admin instead of silently picking one (D-52).
          const [first] = locations;
          if (first && first !== row.pickup_location_id) await orderStore.setPickupLocation(client, row.id, first);
          if (locations.size > 1) await orderStore.appendOpsIssue(client, row.id, 'MULTI_KITCHEN_SPLIT');

          await logOrderCreated(client, row.id, userId);
          if (userId && input.saveAddress) {
            await account.saveCheckoutAddress(client, userId, {
              fullName: input.customer.fullName,
              phone: input.customer.phone,
              ...input.shippingAddress,
            });
          }
          return (await orderStore.findById(client, row.id))!;
        });
      } catch (err) {
        if (err instanceof IdempotentReplay) return replay(err.order, input);
        throw err;
      }

      // 3. Razorpay order — outside the transaction (D-30). Failure releases the jars immediately.
      try {
        const rzp = await gateway.createOrder({
          amountPaise: order.total_paise,
          receipt: order.order_code,
          // reservation end: the Direct UPI service holds the payable amount until then (+ grace)
          notes: {
            order_id: order.id,
            order_code: order.order_code,
            reservation_expires_at: order.reservation_expires_at.toISOString(),
          },
        });
        await orderStore.setGatewayOrderId(db, order.id, rzp.id);
        return toResponse({ ...order, gateway_order_id: rzp.id });
      } catch (err) {
        logger.error({ err, orderCode: order.order_code }, 'payment gateway order creation failed');
        await orders.expireOrder(order.id, 'RAZORPAY_ORDER_CREATE_FAILED');
        throw new AppError(
          'PAYMENT_INIT_FAILED',
          'We could not start the payment. Your jars were released — please try again.',
        );
      }
    },
  };
}

export type CheckoutService = ReturnType<typeof createCheckoutService>;
