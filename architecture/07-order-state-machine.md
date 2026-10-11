# 🔄 07. Order State Machine, Payment Lifecycle & Stock Reservation

> **Source of truth** for: order statuses, kaun sa transition allowed hai, kaun trigger karta hai, har transition ke side-effects (stock, refunds, notifications), aur Razorpay/Shiprocket events ka mapping.
> Related: `01-database-schema-models.md` (tables), `08-decisions-log.md` (D-22 … D-31).

---

## 🎯 Core Invariants (kabhi break nahi hone chahiye)

1. **Har status change sirf `transitionOrder()` se** hoga — allowed map ke against validate, `UPDATE ... WHERE status = $from` (optimistic guard), aur `order_status_logs` me row. Direct `UPDATE orders SET status` **banned** (D-29).
2. **Stock ledger balanced rahega:** `inventory_batches.available_stock = SUM(inventory_movements.quantity_delta)` har batch ke liye. Reconciliation test CI me chalega.
3. **Paisa liya hai toh ya toh order fulfil hoga, ya refund hoga.** `payment_status = 'PAID'` aur `status IN ('EXPIRED','CANCELLED')` ka combination **sirf transient** ho sakta hai — refund job turant enqueue hota hai.
4. **External API calls kabhi transaction ke andar nahi** (D-30).
5. **Har webhook idempotent:** `webhook_events (provider, event_id)` UNIQUE + business-level guards.

---

## 📦 1. Order Status (`order_status` enum)

| Status | Meaning | Terminal? |
| :--- | :--- | :--- |
| `PENDING_PAYMENT` | Order bana, stock **RESERVED**, `reservation_expires_at = now + 15 min`. | No |
| `EXPIRED` | Payment window nikal gaya, stock release ho gaya. | Yes* |
| `CONFIRMED` | Payment captured + verified, stock **COMMITTED**. Shiprocket booking queue me. | No |
| `AWAITING_PACKING` | AWB assign ho gaya + label PDF R2 me ready. Partner desk par dikhta hai. | No |
| `PACKED` | Partner ne seal + pack karke mark kiya. | No |
| `PICKUP_SCHEDULED` | Shiprocket pickup request successful. | No |
| `IN_TRANSIT` | Courier ne pick kar liya (first scan). | No |
| `OUT_FOR_DELIVERY` | Last-mile par. | No |
| `DELIVERY_FAILED` | NDR — delivery attempt fail (customer unavailable / refused / address issue). | No |
| `DELIVERED` | Delivered. | Yes |
| `RTO_IN_TRANSIT` | Return-to-origin shuru. | No |
| `RTO_DELIVERED` | Parcel kitchen wapas pahunch gaya. | Yes |
| `CANCELLED` | Pickup se pehle cancel (customer/admin/system). | Yes |
| `LOST` | Courier ne lost/damaged declare kiya. | Yes |

\* `EXPIRED` sirf late-payment case me `CONFIRMED`/`CANCELLED` me ja sakta hai.

### 1.1 Diagram

```text
                       ┌──────────────┐  15 min, no payment   ┌─────────┐
  create-order ──────▶ │PENDING_PAYMENT├─────────────────────▶ │ EXPIRED │
                       └──────┬───────┘                        └──┬───┬──┘
                    payment ✓ │          late payment + stock ✓   │   │ late payment + no stock
                              ▼  ◀────────────────────────────────┘   ▼  (auto-refund)
                       ┌──────────────┐                          ┌───────────┐
                       │  CONFIRMED   ├────────── cancel ──────▶ │ CANCELLED │
                       └──────┬───────┘                          └───────────┘
                AWB + label ✓ │                                     ▲   ▲   ▲
                              ▼                                     │   │   │
                       ┌──────────────┐ ───────── cancel ───────────┘   │   │
                       │AWAITING_PACK.│                                 │   │
                       └──────┬───────┘                                 │   │
                partner ✓     ▼                                         │   │
                       ┌──────────────┐ ───── admin cancel ─────────────┘   │
                       │    PACKED    │                                     │
                       └──────┬───────┘                                     │
                pickup API ✓  ▼                                             │
                       ┌──────────────┐ ── admin cancel (AWB cancel) ───────┘
                       │PICKUP_SCHED. │
                       └──────┬───────┘
            courier first scan▼
                       ┌──────────────┐ ────────────────▶ LOST
                       │  IN_TRANSIT  │ ◀───────┐
                       └──────┬───────┘         │ reroute
                              ▼                 │
                       ┌──────────────┐ ────────┘          ┌──────────┐
                       │OUT_FOR_DELIV.├──────────────────▶ │DELIVERED │
                       └──────┬───────┘                    └──────────┘
                     attempt ✗▼        ▲ reattempt
                       ┌──────────────┐│
                       │DELIVERY_FAIL.├┘
                       └──────┬───────┘
                 RTO initiated▼
                       ┌──────────────┐        ┌─────────────┐
                       │RTO_IN_TRANSIT├──────▶ │RTO_DELIVERED│
                       └──────────────┘        └─────────────┘
```

### 1.2 Allowed Transitions Map (`packages/shared/src/order/transitions.ts`)

| From | To | Actor(s) | Trigger |
| :--- | :--- | :--- | :--- |
| `PENDING_PAYMENT` | `CONFIRMED` | `RAZORPAY` / `CUSTOMER` | `confirmPayment()` (verify endpoint ya webhook) |
| `PENDING_PAYMENT` | `EXPIRED` | `SYSTEM` | Expiry sweeper / Razorpay order create fail |
| `EXPIRED` | `CONFIRMED` | `RAZORPAY` | Late payment, re-reserve successful |
| `EXPIRED` | `CANCELLED` | `RAZORPAY` | Late payment, stock nahi → auto-refund |
| `CONFIRMED` | `AWAITING_PACKING` | `SYSTEM` | Worker: AWB + label stored |
| `CONFIRMED` | `CANCELLED` | `CUSTOMER`, `ADMIN` | Cancel request |
| `AWAITING_PACKING` | `PACKED` | `KITCHEN_PARTNER`, `ADMIN` | Packing desk button |
| `AWAITING_PACKING` | `CANCELLED` | `CUSTOMER`, `ADMIN` | Cancel request (AWB cancel job) |
| `PACKED` | `PICKUP_SCHEDULED` | `SYSTEM` | Worker: Shiprocket pickup API success |
| `PACKED` | `CANCELLED` | `ADMIN` | Admin cancel (AWB cancel job) |
| `PICKUP_SCHEDULED` | `IN_TRANSIT` | `SHIPROCKET` | First courier scan |
| `PICKUP_SCHEDULED` | `CANCELLED` | `ADMIN` | Admin cancel (AWB cancel job) |
| `IN_TRANSIT` | `OUT_FOR_DELIVERY` / `DELIVERED` / `RTO_IN_TRANSIT` / `LOST` | `SHIPROCKET` | Webhook / poll |
| `OUT_FOR_DELIVERY` | `DELIVERED` / `DELIVERY_FAILED` / `IN_TRANSIT` | `SHIPROCKET` | Webhook / poll |
| `DELIVERY_FAILED` | `OUT_FOR_DELIVERY` / `RTO_IN_TRANSIT` | `SHIPROCKET`, `ADMIN` | Reattempt / NDR action |
| `RTO_IN_TRANSIT` | `RTO_DELIVERED` / `LOST` | `SHIPROCKET` | Webhook / poll |

> **Customer self-cancel** sirf `CONFIRMED` aur `AWAITING_PACKING` me. `PACKED` ke baad sirf ADMIN.
> **Out-of-order webhooks:** agar incoming Shiprocket status ka transition map me allowed nahi hai (e.g. `DELIVERED` ke baad `IN_TRANSIT` aaya), toh `tracking_events` me **store karo** lekin order status **change mat karo**.

---

## 💳 2. Payment Status (`payment_status` enum)

| From | To | Trigger |
| :--- | :--- | :--- |
| `UNPAID` | `PAID` | `confirmPayment()` — amount match ✓ |
| `PAID` | `REFUND_PENDING` | Cancel / late-payment stockout / RTO / damage claim |
| `REFUND_PENDING` | `PARTIALLY_REFUNDED` / `REFUNDED` | Razorpay `refund.processed` webhook |
| `REFUND_PENDING` | `PAID` | Refund failed permanently → `ops_issue` set, admin manual |

> Har payment attempt `payments` table me alag row (UPI fail → retry → success = 2 rows). Order par sirf summary `payment_status`.
> COD (v2, D-25) aane par `COD_PENDING` → `COD_COLLECTED` add honge.

---

## 🧮 3. Stock Side-Effects per Transition

| Event | `order_item_allocations.status` | `inventory_batches.available_stock` | `inventory_movements` |
| :--- | :--- | :--- | :--- |
| create-order (→ `PENDING_PAYMENT`) | `RESERVED` | `− qty` | `RESERVE` (−qty) |
| → `EXPIRED` | `RELEASED` | `+ qty` | `RELEASE` (+qty) |
| → `CONFIRMED` | `COMMITTED` | no change | — |
| `EXPIRED` → `CONFIRMED` (late pay) | new rows `COMMITTED` | `− qty` | `RESERVE` (−qty) |
| → `CANCELLED` from `CONFIRMED`/`AWAITING_PACKING`/`PACKED`/`PICKUP_SCHEDULED` | `RELEASED` | `+ qty` | `RELEASE` (+qty) — jar kitchen se nikla hi nahi |
| → `RTO_DELIVERED` | stays `COMMITTED` | no change (jar already sold) | none — jar physically discard hota hai, `order_status_logs` me note (D-31) |
| Admin adjustment (breakage, QC fail) | — | `± qty` | `ADJUSTMENT` / `WASTAGE` |

---

## 🧾 4. Canonical Flows (Reference Implementation)

### 4.1 Create Order + Reserve Stock — `POST /api/v1/checkout/create-order`

```typescript
// apps/backend/src/modules/checkout/checkout.service.ts — createOrder()
export async function createOrder(input: CreateOrderInput, ctx: RequestCtx) {
  // 0. Idempotency: same Idempotency-Key header → return existing order (no double reservation)
  const existing = await db.query(
    `SELECT order_code, gateway_order_id, total_paise FROM orders WHERE idempotency_key = $1`,
    [ctx.idempotencyKey]
  );
  if (existing.rowCount) return toCheckoutResponse(existing.rows[0]);

  // 1. Server-side pricing (NEVER trust client totals)
  const quote = await quoteCart(input.items, input.shippingAddress.pincode);

  // 2. Short transaction: create order + reserve stock
  const order = await db.transaction(async (client) => {
    const ttl = await getSetting<number>(client, 'reservation_ttl_minutes'); // default 15
    const orderRow = await insertOrderWithUniqueCode(client, quote, input, ctx, ttl);

    // Lock order: products sorted ASC → no deadlocks between concurrent checkouts
    const items = [...quote.items].sort((a, b) => a.productId.localeCompare(b.productId));
    for (const item of items) {
      const orderItemId = await insertOrderItem(client, orderRow.id, item);
      await reserveForItem(client, orderRow.id, orderItemId, item.productId, item.quantity);
    }
    await insertStatusLog(client, orderRow.id, null, 'PENDING_PAYMENT', 'CUSTOMER', ctx.userId);
    return orderRow;
  });

  // 3. External call OUTSIDE transaction (D-30)
  try {
    const rzp = await razorpay.orders.create({
      amount: order.total_paise, currency: 'INR', receipt: order.order_code,
      notes: { order_id: order.id },
    });
    await db.query(`UPDATE orders SET gateway_order_id = $1 WHERE id = $2`, [rzp.id, order.id]);
    return { orderCode: order.order_code, razorpayOrderId: rzp.id, amount: order.total_paise,
             keyId: env.RAZORPAY_KEY_ID, expiresAt: order.reservation_expires_at };
  } catch (err) {
    await expireOrder(order.id, 'RAZORPAY_ORDER_CREATE_FAILED'); // releases stock immediately
    throw new AppError('PAYMENT_INIT_FAILED', 502);
  }
}

// FIFO-by-expiry, split across batches, skip non-sellable batches (D-23, D-24)
async function reserveForItem(client: PoolClient, orderId: string, orderItemId: string,
                              productId: string, qty: number) {
  const { rows: batches } = await client.query<{ id: string; available_stock: number }>(
    `SELECT b.id, b.available_stock
       FROM inventory_batches b
      WHERE b.product_id = $1
        AND b.available_stock > 0
        AND b.expiry_date >= ist_today() + $2::int   -- IST calendar day (D-49)
      ORDER BY b.expiry_date ASC, b.manufactured_at ASC, b.id ASC
      FOR UPDATE`,
    [productId, await sellableBufferDays(client)] // min_remaining_shelf_days + transit_buffer_days
  );

  let remaining = qty;
  for (const batch of batches) {
    if (remaining === 0) break;
    const take = Math.min(remaining, batch.available_stock);
    await client.query(
      `UPDATE inventory_batches SET available_stock = available_stock - $1 WHERE id = $2`,
      [take, batch.id]
    );
    await client.query(
      `INSERT INTO order_item_allocations (order_item_id, batch_id, quantity, status)
       VALUES ($1, $2, $3, 'RESERVED')`,
      [orderItemId, batch.id, take]
    );
    await client.query(
      `INSERT INTO inventory_movements (batch_id, movement_type, quantity_delta, order_id, reason)
       VALUES ($1, 'RESERVE', $2, $3, 'checkout reservation')`,
      [batch.id, -take, orderId]
    );
    remaining -= take;
  }
  if (remaining > 0) throw new AppError('OUT_OF_STOCK', 409, { productId }); // whole txn rolls back
}
```

> Razorpay Checkout options me `timeout` = reservation ke bache hue seconds pass karo, taaki modal khud band ho jaye jab reservation expire ho.

### 4.2 Confirm Payment — verify endpoint **aur** webhook dono yahi call karte hain

```typescript
// apps/backend/src/modules/payments/payments.service.ts — confirmPayment()
export async function confirmPayment(p: {
  gatewayOrderId: string; gatewayPaymentId: string; amountPaise: number;
  method?: string; source: 'CLIENT_VERIFY' | 'WEBHOOK';
}) {
  const outcome = await db.transaction(async (client) => {
    const { rows: [order] } = await client.query(
      `SELECT id, status, payment_status, total_paise
         FROM orders WHERE gateway_order_id = $1 FOR UPDATE`,
      [p.gatewayOrderId]
    );
    if (!order) throw new AppError('ORDER_NOT_FOUND', 404);

    // Record the attempt (idempotent on gateway_payment_id)
    await client.query(
      `INSERT INTO payments (order_id, gateway_order_id, gateway_payment_id, amount_paise, method, status)
       VALUES ($1, $2, $3, $4, $5, 'CAPTURED')
       ON CONFLICT (gateway_payment_id) DO UPDATE SET status = 'CAPTURED', updated_at = NOW()`,
      [order.id, p.gatewayOrderId, p.gatewayPaymentId, p.amountPaise, p.method ?? null]
    );

    if (order.payment_status !== 'UNPAID') return { kind: 'ALREADY_PROCESSED' as const }; // idempotent

    if (p.amountPaise !== Number(order.total_paise)) {
      await flagOpsIssue(client, order.id, `AMOUNT_MISMATCH paid=${p.amountPaise}`);
      await markRefundPending(client, order.id);
      return { kind: 'REFUND' as const, orderId: order.id };
    }

    await client.query(`UPDATE orders SET payment_status = 'PAID', confirmed_at = NOW() WHERE id = $1`, [order.id]);

    if (order.status === 'PENDING_PAYMENT') {
      await client.query(
        `UPDATE order_item_allocations a SET status = 'COMMITTED', updated_at = NOW()
           FROM order_items oi
          WHERE a.order_item_id = oi.id AND oi.order_id = $1 AND a.status = 'RESERVED'`,
        [order.id]
      );
      await transitionOrder(client, order.id, 'PENDING_PAYMENT', 'CONFIRMED', { actor: 'RAZORPAY' });
      return { kind: 'CONFIRMED' as const, orderId: order.id };
    }

    if (order.status === 'EXPIRED') {
      // Late payment: try to re-reserve inside a SAVEPOINT
      await client.query('SAVEPOINT late_reserve');
      try {
        await reReserveAllItems(client, order.id); // same FIFO logic, allocations straight to COMMITTED
        await transitionOrder(client, order.id, 'EXPIRED', 'CONFIRMED', { actor: 'RAZORPAY', reason: 'LATE_PAYMENT' });
        return { kind: 'CONFIRMED' as const, orderId: order.id };
      } catch (e) {
        if (!isAppError(e, 'OUT_OF_STOCK')) throw e;
        await client.query('ROLLBACK TO SAVEPOINT late_reserve');
        await transitionOrder(client, order.id, 'EXPIRED', 'CANCELLED', { actor: 'RAZORPAY', reason: 'LATE_PAYMENT_STOCKOUT' });
        await markRefundPending(client, order.id);
        return { kind: 'REFUND' as const, orderId: order.id };
      }
    }
    throw new AppError('INVALID_STATE', 409);
  });

  // Side-effects AFTER commit (D-30). If enqueue fails, sweeper (§4.4) picks it up.
  if (outcome.kind === 'CONFIRMED') {
    await queues.orders.add('SHIPROCKET_CREATE_ORDER', { orderId: outcome.orderId }, { jobId: `ship:${outcome.orderId}` });
    await queues.documents.add('GENERATE_INVOICE', { orderId: outcome.orderId }, { jobId: `inv:${outcome.orderId}` });
    await queues.notify.add('ORDER_CONFIRMED', { orderId: outcome.orderId }, { jobId: `notify:confirmed:${outcome.orderId}` });
  }
  if (outcome.kind === 'REFUND') {
    await queues.payments.add('INITIATE_REFUND', { orderId: outcome.orderId }, { jobId: `refund:${outcome.orderId}` });
  }
  return outcome;
}
```

> **BullMQ `jobId` deterministic** rakha hai → duplicate verify + webhook se duplicate jobs nahi bante. BullMQ custom id me `:` allowed nahi, isliye actual ids `ship-<id>`, `inv-<id>`, `notify-<template>-<id>`, `refund-<refundId>` (D-52).
>
> **Implementation notes (Phase 5, D-52):** `markRefundPending()` = `requestRefund()` — refund **intent row** (`refund:<paymentId>:<reason>`) same transaction me likhi jaati hai, job sirf gateway call karta hai. Amount mismatch par payment `UNPAID → PAID → REFUND_PENDING`. Paid order par doosra captured payment → `DUPLICATE_PAYMENT` refund + ops_issue (order untouched). `confirmed_at` sirf `CONFIRMED` transition par stamp hota hai. Code: `apps/backend/src/modules/payments/payments.service.ts`.

### 4.3 Razorpay Webhook — `POST /api/v1/webhooks/razorpay`

1. **Raw body** par HMAC-SHA256 verify with `RAZORPAY_WEBHOOK_SECRET` (`X-Razorpay-Signature`) — yeh `RAZORPAY_KEY_SECRET` se **alag** hai. Fail → `400`.
2. `INSERT INTO webhook_events (provider, event_id, ...) ON CONFLICT DO NOTHING` (`X-Razorpay-Event-Id`). Already exists + processed → `200` turant.
3. Event route:
   - `payment.captured` / `order.paid` → `confirmPayment({ source: 'WEBHOOK' })`
   - `payment.failed` → `payments` row `FAILED` (order `PENDING_PAYMENT` hi rahega; customer retry kar sakta hai)
   - `refund.processed` / `refund.failed` → `refunds` + `orders.payment_status` update
4. Business error (e.g. `ORDER_NOT_FOUND`) → `webhook_events.last_error` me likho, **`200` return** karo (warna Razorpay infinite retry) + admin alert. Sirf infra error (DB down) par `5xx`.
5. Client verify endpoint (`POST /payments/verify`) me signature `HMAC(order_id|payment_id, KEY_SECRET)` verify karke **same** `confirmPayment()`.

### 4.4 Background Sweepers (worker `repeat` jobs)

| Job | Frequency | Logic |
| :--- | :--- | :--- |
| `EXPIRE_RESERVATIONS` | every 1 min | (1) Candidates **bina lock**: `SELECT id, gateway_order_id FROM orders WHERE status='PENDING_PAYMENT' AND reservation_expires_at < NOW() LIMIT 100`. (2) Har order ke liye **transaction ke bahar** Razorpay se order payments fetch — captured mila toh `confirmPayment()` aur skip. (3) Warna short transaction: `SELECT ... FOR UPDATE SKIP LOCKED`, status abhi bhi `PENDING_PAYMENT` hai ye re-check, allocations `RELEASED`, stock `+qty`, `RELEASE` movement, → `EXPIRED`. |
| `RECONCILE_CONFIRMED` | every 5 min | `CONFIRMED` orders jinki `shipments` row nahi aur `confirmed_at < NOW() - 5 min` → `SHIPROCKET_CREATE_ORDER` re-enqueue (same `jobId`). Invoice/notification ke liye bhi same pattern. |
| `RECONCILE_REFUNDS` | every 30 min | `REFUND_PENDING` > 30 min aur koi `refunds` row nahi → `INITIATE_REFUND` re-enqueue. |
| `POLL_TRACKING` | every 3 hr | Active shipments (`PICKUP_SCHEDULED` … `RTO_IN_TRANSIT`) ka Shiprocket track API se status sync (webhook miss fallback, D-35). |
| `LEDGER_CHECK` | daily | Stock ledger invariant (#2) verify → mismatch par admin alert. |

### 4.5 `transitionOrder()` — the only way to change status

```typescript
export async function transitionOrder(
  client: PoolClient, orderId: string, from: OrderStatus, to: OrderStatus,
  opts: { actor: ActorType; actorId?: string; reason?: string; metadata?: object }
) {
  if (!canTransition(from, to, opts.actor)) throw new AppError('ILLEGAL_TRANSITION', 409, { from, to });
  const res = await client.query(
    `UPDATE orders SET status = $3, updated_at = NOW() ${timestampColumnSql(to)}
      WHERE id = $1 AND status = $2`,
    [orderId, from, to]
  );
  if (res.rowCount !== 1) throw new AppError('STALE_STATE', 409, { from, to }); // someone else moved it
  await client.query(
    `INSERT INTO order_status_logs (order_id, from_status, to_status, actor_type, actor_id, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [orderId, from, to, opts.actor, opts.actorId ?? null, opts.reason ?? null, opts.metadata ?? {}]
  );
}
```

> `timestampColumnSql(to)` whitelisted mapping hai (`PACKED → packed_at = NOW()`, `IN_TRANSIT → shipped_at`, `DELIVERED → delivered_at`, `CANCELLED → cancelled_at`) — user input kabhi SQL me interpolate nahi hota.

---

## 🚚 5. Shiprocket Status → Order Status Mapping

> ⚠️ Shiprocket webhook payload me `current_status` (text) aur `shipment_status_id` (numeric) aate hain. **Phase 6 me Shiprocket ki official status list se numeric IDs verify karke** `packages/shared/src/logistics/shiprocketStatusMap.ts` me map finalize karna. Neeche text-based mapping hai:

| Shiprocket `current_status` (normalized UPPERCASE) | Order Status |
| :--- | :--- |
| `PICKED UP`, `SHIPPED`, `IN TRANSIT`, `REACHED AT DESTINATION HUB`, `MISROUTED` | `IN_TRANSIT` |
| `OUT FOR DELIVERY` | `OUT_FOR_DELIVERY` |
| `DELIVERED` | `DELIVERED` |
| `UNDELIVERED`, `NDR`, `DELIVERY DELAYED` (attempt failed) | `DELIVERY_FAILED` |
| `RTO INITIATED`, `RTO IN TRANSIT`, `RTO OFD` | `RTO_IN_TRANSIT` |
| `RTO DELIVERED` | `RTO_DELIVERED` |
| `LOST`, `DAMAGED`, `DESTROYED` | `LOST` |
| `PICKUP SCHEDULED`, `OUT FOR PICKUP`, `PICKUP EXCEPTION`, `AWB ASSIGNED`, others | **No status change** — sirf `tracking_events` me store; `PICKUP EXCEPTION` par admin alert |

- Webhook dedup key: `sha256(awb + current_status + event_timestamp)` → `webhook_events.event_id` (Shiprocket event id nahi bhejta).
- Auth: `x-api-key` header = `SHIPROCKET_WEBHOOK_TOKEN` (Shiprocket dashboard me configure). Mismatch → `401`.

---

## 🔔 6. Notifications per Transition

| Transition | Customer (WhatsApp → SMS fallback) | Partner / Admin |
| :--- | :--- | :--- |
| → `CONFIRMED` | `order_confirmed` (order code, items, track link) | Partner: `new_order_alert` (push + WhatsApp). Admin: dashboard |
| → `AWAITING_PACKING` | — | Partner: daily 9 AM digest "N orders to pack" |
| → `IN_TRANSIT` | `order_shipped` (courier, AWB, track link) | — |
| → `OUT_FOR_DELIVERY` | `out_for_delivery` | — |
| → `DELIVERED` | `delivered_storage_tip` | — |
| → `DELIVERY_FAILED` | `delivery_attempt_failed` (reattempt/address update link) | Admin alert (NDR queue) |
| → `CANCELLED` | `order_cancelled` (+ refund ETA agar paid) | Partner (agar `AWAITING_PACKING`/`PACKED` tha) |
| → `RTO_*`, `LOST`, `ops_issue` set | — | Admin alert |
| Refund processed | `refund_processed` | — |

> Har notification job ka `jobId = notify:<template>:<orderId>` → duplicate message nahi jayega. Har send `notifications_log` me.
