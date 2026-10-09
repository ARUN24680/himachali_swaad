# 💳 Phase 5: Checkout, Stock Reservation, Payments, Webhooks, Refunds & Invoices

> [!IMPORTANT]
> **Read first:** `Rules/00-project-rules.md` · `architecture/08-decisions-log.md` · `architecture/07-order-state-machine.md` · `architecture/01-database-schema-models.md`
> **Depends on:** Phase 2, 3, 4  ·  **Migration:** `0003_orders_payments.sql`
> **Yeh phase `architecture/07-order-state-machine.md` §4 ka exact implementation hai.** Wahan ka reference code canonical hai — deviate karna ho toh pehle 07 update karo.

---

## 🎯 Objective
30-second single-screen **prepaid** checkout (D-25) with DB-based stock reservation (D-22), Razorpay UPI-first payment, ek hi idempotent `confirmPayment()` jo client verify aur webhook dono use karte hain, late-payment + stockout par **automatic refund**, background sweepers, state machine enforcement, aur har confirmed order ka GST tax invoice. Zero overselling, zero "paisa kata par order nahi".

---

## 📋 Granular Tasks & Checklist

### 5.1 Migration `0003_orders_payments.sql`
- [ ] Copy exactly from `architecture/01`: enums (`order_status`, `payment_status`, `payment_attempt_status`, `allocation_status`, `refund_status`, `actor_type`), `addresses`, `orders`, `order_items`, `order_item_allocations`, `order_status_logs`, `payments`, `refunds`, `webhook_events`, `invoice_sequences`, `inventory_movements.order_id` FK.
- [ ] Row Zod schemas in `packages/shared`.

### 5.2 State Machine Core (`packages/shared` + api-server)
- [ ] `packages/shared/src/order/transitions.ts` — allowed map **exactly** 07 §1.2 (from, to, allowed actors) + `canTransition(from, to, actor)`; payment status map 07 §2.
- [ ] `transitionOrder()` (07 §4.5) — guarded `UPDATE ... WHERE status = $from`, whitelisted timestamp column, `order_status_logs` row. Lint/grep CI check: `UPDATE orders SET status` sirf is function me.
- [ ] Unit test: har (from, to, actor) combination ka allowed/denied table snapshot.

### 5.3 Saved Addresses (logged-in customers)
- [ ] `GET/POST/PATCH/DELETE /api/v1/me/addresses` (`CUSTOMER`), ek default (partial unique index).

### 5.4 Checkout Page (`apps/storefront/src/app/checkout/page.tsx`)
- [ ] Single screen: contact (name, 10-digit phone → E.164, optional email), address (pincode first → auto-fill city/state via India Post PIN lookup with manual override), saved-address picker if logged in.
- [ ] Order summary from **`POST /api/v1/cart/quote`** (server prices, issues shown), shipping fee, total in ₹ (from paise).
- [ ] Payment: **Prepaid only** (UPI / GPay / PhonePe / Cards via Razorpay). COD UI hidden (`settings.cod_enabled = false`).
- [ ] Client generates **`Idempotency-Key`** (UUID) per checkout attempt; double-click / retry same key bhejta hai.
- [ ] Reservation countdown ("Jars reserved for 14:59") from `expiresAt`.

### 5.5 Create Order + Reserve Stock — `POST /api/v1/checkout/create-order`
- [ ] Implement 07 §4.1 exactly:
  - Idempotency-Key header required → existing order return.
  - `quoteCart()` server pricing (shared with 4.5 quote endpoint); client totals ignore.
  - Short transaction: order insert with unique code (D-27, `PK-7KQ2M9`, max 5 retries), items **sorted by `product_id`**, `reserveForItem()` FIFO-by-expiry with sellable buffer (same as Phase 3 storefront query), split across batches, `RESERVED` allocations + `RESERVE` movements, status log.
  - `OUT_OF_STOCK` → `409` with `productId`, poora transaction rollback.
  - **Razorpay `orders.create` transaction ke bahar** (D-30); fail → `expireOrder()` (stock turant release) + `502 PAYMENT_INIT_FAILED`.
- [ ] Response: `{ orderCode, razorpayOrderId, amount, keyId, expiresAt }`.
- [ ] Rate limit per IP + per phone.

### 5.6 Razorpay Checkout (Client)
- [ ] Razorpay script `next/script` (lazy, checkout page only).
- [ ] Options: `order_id`, prefill name/phone/email, theme color from CSS token (runtime `getComputedStyle`, not hardcoded), **`timeout` = reservation ke bache hue seconds**, UPI intent first on mobile.
- [ ] Success handler → `POST /api/v1/payments/verify` → redirect `/order/[orderCode]`.
- [ ] Modal dismiss / failure → "Payment not completed — retry" (same order, jab tak reservation valid hai).

### 5.7 Confirm Payment — verify + webhook (07 §4.2, §4.3)
- [ ] `POST /api/v1/payments/verify` — `HMAC_SHA256(order_id|payment_id, RAZORPAY_KEY_SECRET)` constant-time verify → invalid `400`; amount Razorpay API se fetch (client se nahi) → `confirmPayment({ source: 'CLIENT_VERIFY' })`.
- [ ] `POST /api/v1/webhooks/razorpay`:
  - **Raw body** parser for this route; `X-Razorpay-Signature` with **`RAZORPAY_WEBHOOK_SECRET`** (alag secret) → fail `400`.
  - `webhook_events` insert `ON CONFLICT DO NOTHING` (`X-Razorpay-Event-Id`); processed → `200`.
  - `payment.captured` / `order.paid` → `confirmPayment({ source: 'WEBHOOK' })`; `payment.failed` → `payments` row `FAILED`; `refund.processed` / `refund.failed` → refunds update.
  - Business errors → `200` + `last_error` + admin alert flag; infra errors → `5xx`. Origin-check CSRF guard se exempt.
- [ ] `confirmPayment()` exactly 07 §4.2: order `FOR UPDATE` by `gateway_order_id`, payments upsert, `payment_status <> 'UNPAID'` → idempotent return, **amount mismatch** → `ops_issue` + refund, `PENDING_PAYMENT` → allocations `COMMITTED` + `CONFIRMED`, `EXPIRED` → SAVEPOINT re-reserve → `CONFIRMED` ya `CANCELLED` (`LATE_PAYMENT_STOCKOUT`) + refund.
- [ ] Post-commit jobs with **deterministic `jobId`**: `SHIPROCKET_CREATE_ORDER` (consumer Phase 6 — is phase me no-op stub worker), `GENERATE_INVOICE`, `ORDER_CONFIRMED` notify (consumer Phase 8 — stub), `INITIATE_REFUND`.
- [ ] Meta CAPI `Purchase` event (consent-based, `event_id = orderCode`) + GA4 purchase on success page.

### 5.8 Refunds
- [ ] Worker job `INITIATE_REFUND`: `refunds` row with `idempotency_key = refund:<orderId>:<reason>` (exists → skip), Razorpay refund API call (outside txn), store `gateway_refund_id`; `payment_status → REFUND_PENDING`.
- [ ] Webhook `refund.processed` → `refunds.status = PROCESSED`, `payment_status → REFUNDED / PARTIALLY_REFUNDED`; `refund.failed` → `FAILED` + `ops_issue`.
- [ ] Admin API (UI in Phase 9): `POST /api/v1/admin/orders/:orderCode/cancel` `{ reason, refund: true }` — 07 allowed states only, stock `RELEASE`, AWB cancel job hook (Phase 6), audit log. Customer self-cancel: `POST /api/v1/orders/:orderCode/cancel` (phone verified / logged-in owner; `CONFIRMED` / `AWAITING_PACKING` only).

### 5.9 Background Sweepers (worker, 07 §4.4)
- [ ] `EXPIRE_RESERVATIONS` every 1 min — candidates without lock → Razorpay order payments check **outside txn** (captured → `confirmPayment`) → `FOR UPDATE SKIP LOCKED` re-check → release + `EXPIRED`.
- [ ] `RECONCILE_CONFIRMED` every 5 min (re-enqueue shipment/invoice/notify jobs by same `jobId`).
- [ ] `RECONCILE_REFUNDS` every 30 min.
- [ ] `LEDGER_CHECK` daily (Phase 3 invariant function) → admin alert on mismatch.
- [ ] Refresh-token cleanup daily (Phase 2).
- [ ] BullMQ: exponential backoff, `removeOnComplete` limits, dead-letter visibility (bull-board admin-only route, D-09).

### 5.10 Tax Invoice (D-32)
- [ ] `GENERATE_INVOICE` job: FY from `confirmed_at` (IST, April–March), number via `invoice_sequences` row lock (`PK/2026-27/000123`), PDF (seller name/address/GSTIN, buyer, place of supply, HSN, GST rate + tax amount per line from `order_items` snapshot, FSSAI no.) → **private R2** `invoices/<orderCode>.pdf` → `orders.invoice_number`, `invoice_key`.
- [ ] `GET /api/v1/orders/:orderCode/invoice` → 5-min signed URL (owner / phone-verified / staff only).
- [ ] Tax calc (GST-inclusive MRP): `tax = round(line_total × rate / (10000 + rate))` per line in paise — CA format review (Phase 0).

### 5.11 Order Status Page (`/order/[orderCode]`)
- [ ] Poll `GET /api/v1/orders/:orderCode/status` (needs phone or session; returns minimal data) every 3s up to 60s while `PENDING_PAYMENT` — webhook-late case me "Confirming your payment…" state, phir `CONFIRMED` success UI.
- [ ] `EXPIRED` / `CANCELLED` + refund messaging.

---

## 🚫 Out of Scope
- Shiprocket booking/labels (job consumer) → **Phase 6**.
- WhatsApp/SMS sending (job consumer) → **Phase 8**.
- Admin cancel/refund **UI** → **Phase 9** (API is phase me).
- COD, coupons → **v2**.

---

## 🔍 Verification Checklist
- [ ] Migration `0003` up/down/up CI green.
- [ ] **Concurrency**: 10 parallel `create-order` for last 1 jar → exactly 1 `201`, 9 `409 OUT_OF_STOCK`, `available_stock = 0`, ledger invariant holds (test `reservation-concurrency.test.ts`).
- [ ] Multi-item orders in opposite product order, 50 parallel runs → zero deadlocks (test).
- [ ] Split allocation: batches 3 + 3, order 5 → 2 allocation rows, expiry-earlier batch first; `NOT_SELLABLE` batch untouched (test).
- [ ] Same `Idempotency-Key` twice → same order, stock reserved once.
- [ ] Reservation expiry → stock released, status `EXPIRED`, `RELEASE` movements (test with fake clock).
- [ ] **Late payment with stock** → `CONFIRMED`; **late payment stockout** → `CANCELLED` + `REFUND_PENDING` + `INITIATE_REFUND` job (tests).
- [ ] Duplicate webhook (same event id) and verify + webhook race → single confirmation, single set of jobs (test).
- [ ] Tampered signature (verify + webhook) → `400`; amount mismatch → `ops_issue` + refund, no `CONFIRMED` (tests).
- [ ] Illegal transition attempt → `409 ILLEGAL_TRANSITION`; every status change has a log row (test).
- [ ] Simulated browser close after payment → order confirmed via webhook within 1 min (Razorpay test mode, manual evidence).
- [ ] UPI intent opens GPay/PhonePe on a real Android device (test mode, video/screenshot).
- [ ] Invoice numbers gap-free & unique under 20 parallel confirmations; invoice URL signed + expires (tests).
- [ ] Checkout 375/768/1440 Playwright pass, no overflow.

---

## ✅ Definition of Done
Customer prepaid order place kar sakta hai; stock exactly-once reserve/commit/release hota hai; verify aur webhook dono safely idempotent hain; har failure path (expiry, late payment, stockout, amount mismatch) automated test se proven hai aur paisa ya toh order banta hai ya refund hota hai; har confirmed order ka GST invoice ban jata hai.
