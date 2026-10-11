# 💳 Phase 5: Checkout, Stock Reservation, Payments, Webhooks, Refunds & Invoices

> [!IMPORTANT]
> **Read first:** `Rules/00-project-rules.md` · `architecture/08-decisions-log.md` · `architecture/07-order-state-machine.md` · `architecture/01-database-schema-models.md`
> **UI work:** `Rules/00-project-rules.md` §1.5 **Design Reference Policy** follow karo — Stitch design sirf reference hai, better bana sakte ho to banao. UI tasks **`ui-developer` agent** (`.claude/agents/ui-developer.md`) se.
> **Depends on:** Phase 2, 3, 4  ·  **Migration:** `0003_orders_payments.sql`
> **Yeh phase `architecture/07-order-state-machine.md` §4 ka exact implementation hai.** Wahan ka reference code canonical hai — deviate karna ho toh pehle 07 update karo.

---

## 🎯 Objective
30-second single-screen **prepaid** checkout (D-25) with DB-based stock reservation (D-22), Razorpay UPI-first payment, ek hi idempotent `confirmPayment()` jo client verify aur webhook dono use karte hain, late-payment + stockout par **automatic refund**, background sweepers, state machine enforcement, aur har confirmed order ka GST tax invoice. Zero overselling, zero "paisa kata par order nahi".

---

## 📋 Granular Tasks & Checklist

### 5.1 Migration `0003_orders_payments.sql`
- [x] Copy exactly from `architecture/01`: enums (`order_status`, `payment_status`, `payment_attempt_status`, `allocation_status`, `refund_status`, `actor_type`), `addresses`, `orders`, `order_items`, `order_item_allocations`, `order_status_logs`, `payments`, `refunds`, `webhook_events`, `invoice_sequences`, `inventory_movements.order_id` FK. — ✅ `packages/database/migrations/0003_orders_payments.sql` (D-52: refunds key VARCHAR(100), `seller_details` setting); `apps/backend/tests/integration/migration-0003.test.ts`
- [x] Row Zod schemas in `packages/shared`. — ✅ `packages/shared/src/order/rows.ts` (every orders/payments/refunds/addresses query parsed)

### 5.2 State Machine Core (`packages/shared` + backend)
- [x] `packages/shared/src/order/transitions.ts` — allowed map **exactly** 07 §1.2 (from, to, allowed actors) + `canTransition(from, to, actor)`; payment status map 07 §2. — ✅ `packages/shared/src/order/transitions.ts`
- [x] `transitionOrder()` (07 §4.5) — guarded `UPDATE ... WHERE status = $from`, whitelisted timestamp column, `order_status_logs` row. Lint/grep CI check: `UPDATE orders SET status` sirf is function me. — ✅ `modules/orders/orders.service.ts` + `orders.repository.ts updateOrderStatusGuarded`; grep check `apps/backend/tests/unit/status-guard.test.ts`
- [x] Unit test: har (from, to, actor) combination ka allowed/denied table snapshot. — ✅ `packages/shared/tests/order.test.ts` (1176 combinations, `__snapshots__/order.test.ts.snap`)

### 5.3 Saved Addresses (logged-in customers)
- [x] `GET/POST/PATCH/DELETE /api/v1/me/addresses` (`CUSTOMER`), ek default (partial unique index). — ✅ `modules/account/*`; `apps/backend/tests/integration/orders-lifecycle.test.ts › /me/addresses` (single default, max 10, owner scope)

### 5.4 Checkout Page (`apps/storefront/src/app/checkout/page.tsx`)
- [x] Single screen: contact (name, 10-digit phone → E.164, optional email), address (pincode first → auto-fill city/state via India Post PIN lookup with manual override), saved-address picker if logged in. — ✅ `modules/checkout` (pincode-first locality auto-fill, saved-address picker); Phases/evidence/phase-05/`checkout-*-{light,dark}.png`; `apps/storefront/tests/e2e/checkout.spec.ts`
- [x] Order summary from **`POST /api/v1/cart/quote`** (server prices, issues shown), shipping fee, total in ₹ (from paise). — ✅ `OrderSummary.tsx` (server quote, line issues block Pay); `apps/storefront/tests/e2e/checkout.spec.ts`
- [x] Payment: **Prepaid only** (UPI / GPay / PhonePe / Cards via Razorpay). COD UI hidden (`settings.cod_enabled = false`). — ✅ no COD UI (D-25); `TrustPanel.tsx`
- [x] Client generates **`Idempotency-Key`** (UUID) per checkout attempt; double-click / retry same key bhejta hai. — ✅ `modules/checkout/lib/attempt-key.ts` (sessionStorage per cart signature; superseded attempt released via `POST /checkout/abandon`, D-52)
- [x] Reservation countdown ("Jars reserved for 14:59") from `expiresAt`. — ✅ `ReservationTimer.tsx`; Phases/evidence/phase-05/`checkout-*` evidence

### 5.5 Create Order + Reserve Stock — `POST /api/v1/checkout/create-order`
- [x] Implement 07 §4.1 exactly: — ✅ `modules/checkout/checkout.service.ts`; `apps/backend/tests/integration/reservation-concurrency.test.ts`
  - Idempotency-Key header required → existing order return.
  - `quoteCart()` server pricing (shared with 4.5 quote endpoint); client totals ignore.
  - Short transaction: order insert with unique code (D-27, `PK-7KQ2M9`, max 5 retries), items **sorted by `product_id`**, `reserveForItem()` FIFO-by-expiry with sellable buffer (same as Phase 3 storefront query), split across batches, `RESERVED` allocations + `RESERVE` movements, status log.
  - `OUT_OF_STOCK` → `409` with `productId`, poora transaction rollback.
  - **Razorpay `orders.create` transaction ke bahar** (D-30); fail → `expireOrder()` (stock turant release) + `502 PAYMENT_INIT_FAILED`.
- [x] Response: `{ orderCode, razorpayOrderId, amount, keyId, expiresAt }`. — ✅ `CreateOrderResponseSchema` (+ `currency`, `gateway`, `prefill`)
- [x] Rate limit per IP + per phone. — ✅ 10/10 min per IP (route) + 5/10 min per phone (Redis); `orders-lifecycle.test.ts › 5 attempts per phone`

### 5.6 Razorpay Checkout (Client)
- [x] Razorpay script `next/script` (lazy, checkout page only). — ✅ `modules/checkout/lib/razorpay.ts` (loaded only on checkout)
- [ ] Options: `order_id`, prefill name/phone/email, theme color from CSS token (runtime `getComputedStyle`, not hardcoded), **`timeout` = reservation ke bache hue seconds**, UPI intent first on mobile.
- [x] Success handler → `POST /api/v1/payments/verify` → redirect `/order/[orderCode]`. — ✅ `apps/storefront/tests/e2e/checkout.spec.ts` › happy path (mock gateway, live API, 375/768/1440)
- [x] Modal dismiss / failure → "Payment not completed — retry" (same order, jab tak reservation valid hai). — ✅ `usePayment.ts`; `apps/storefront/tests/e2e/checkout.spec.ts` › fail → retry → pay; Phases/evidence/phase-05/payment-retry screenshots

### 5.7 Confirm Payment — verify + webhook (07 §4.2, §4.3)
- [x] `POST /api/v1/payments/verify` — `HMAC_SHA256(order_id|payment_id, RAZORPAY_KEY_SECRET)` constant-time verify → invalid `400`; amount Razorpay API se fetch (client se nahi) → `confirmPayment({ source: 'CLIENT_VERIFY' })`. — ✅ `payments.service.ts verify()`; `apps/backend/tests/integration/payments.test.ts › verify`, `tests/unit/payments-config.test.ts`
- [x] `POST /api/v1/webhooks/razorpay`: — ✅ `modules/webhooks/*` (raw Buffer body, webhook secret, dedup, 200 on business errors); `apps/backend/tests/integration/payments.test.ts › webhook`
  - **Raw body** parser for this route; `X-Razorpay-Signature` with **`RAZORPAY_WEBHOOK_SECRET`** (alag secret) → fail `400`.
  - `webhook_events` insert `ON CONFLICT DO NOTHING` (`X-Razorpay-Event-Id`); processed → `200`.
  - `payment.captured` / `order.paid` → `confirmPayment({ source: 'WEBHOOK' })`; `payment.failed` → `payments` row `FAILED`; `refund.processed` / `refund.failed` → refunds update.
  - Business errors → `200` + `last_error` + admin alert flag; infra errors → `5xx`. Origin-check CSRF guard se exempt.
- [x] `confirmPayment()` exactly 07 §4.2: order `FOR UPDATE` by `gateway_order_id`, payments upsert, `payment_status <> 'UNPAID'` → idempotent return, **amount mismatch** → `ops_issue` + refund, `PENDING_PAYMENT` → allocations `COMMITTED` + `CONFIRMED`, `EXPIRED` → SAVEPOINT re-reserve → `CONFIRMED` ya `CANCELLED` (`LATE_PAYMENT_STOCKOUT`) + refund. — ✅ `payments.service.ts`; plus duplicate-payment refund (D-52); `payments.test.ts › money safety`
- [x] Post-commit jobs with **deterministic `jobId`**: `SHIPROCKET_CREATE_ORDER` (consumer Phase 6 — is phase me no-op stub worker), `GENERATE_INVOICE`, `ORDER_CONFIRMED` notify (consumer Phase 8 — stub), `INITIATE_REFUND`. — ✅ `jobs/queues.ts` (`ship-`/`inv-`/`notify-`/`refund-` ids, D-52), `jobs/processors/index.ts`; `payments.test.ts › verify + webhook racing`, `jobs.test.ts › same job id is enqueued once`
- [ ] Meta CAPI `Purchase` event (consent-based, `event_id = orderCode`) + GA4 purchase on success page.

### 5.8 Refunds
- [x] Worker job `INITIATE_REFUND`: `refunds` row with `idempotency_key = refund:<orderId>:<reason>` (exists → skip), Razorpay refund API call (outside txn), store `gateway_refund_id`; `payment_status → REFUND_PENDING`. — ✅ intent row written in the deciding txn, key `refund:<paymentId>:<reason>` (D-52); retry-safe via gateway lookup; `payments.test.ts › refund lifecycle`
- [x] Webhook `refund.processed` → `refunds.status = PROCESSED`, `payment_status → REFUNDED / PARTIALLY_REFUNDED`; `refund.failed` → `FAILED` + `ops_issue`. — ✅ `payments.test.ts › refund lifecycle`
- [x] Admin API (UI in Phase 9): `POST /api/v1/admin/orders/:orderCode/cancel` `{ reason, refund: true }` — 07 allowed states only, stock `RELEASE`, AWB cancel job hook (Phase 6), audit log. Customer self-cancel: `POST /api/v1/orders/:orderCode/cancel` (phone verified / logged-in owner; `CONFIRMED` / `AWAITING_PACKING` only). — ✅ `orders.service.ts cancel()`; `orders-lifecycle.test.ts › cancel`

### 5.9 Background Sweepers (worker, 07 §4.4)
- [x] `EXPIRE_RESERVATIONS` every 1 min — candidates without lock → Razorpay order payments check **outside txn** (captured → `confirmPayment`) → `FOR UPDATE SKIP LOCKED` re-check → release + `EXPIRED`. — ✅ `jobs/sweepers.ts`; `orders-lifecycle.test.ts › EXPIRE_RESERVATIONS sweeper`
- [x] `RECONCILE_CONFIRMED` every 5 min (re-enqueue shipment/invoice/notify jobs by same `jobId`). — ✅ `jobs.test.ts` (notify re-enqueue waits for `notifications_log`, Phase 7/8)
- [x] `RECONCILE_REFUNDS` every 30 min. — ✅ `jobs.test.ts`
- [x] `LEDGER_CHECK` daily (Phase 3 invariant function) → admin alert on mismatch. — ✅ Sentry alert (admin notification channel arrives Phase 8); `jobs.test.ts`
- [x] Refresh-token cleanup daily (Phase 2). — ✅ `CLEANUP_REFRESH_TOKENS`; `jobs.test.ts`
- [x] BullMQ: exponential backoff, `removeOnComplete` limits, dead-letter visibility (bull-board admin-only route, D-09). — ✅ `jobOptions()`, `plugins/queue-dashboard.ts` at `/api/v1/admin/queues`; `jobs.test.ts › BullMQ`; worker boot log (5 workers, 5 schedulers) run locally 2026-10-11

### 5.10 Tax Invoice (D-32)
- [x] `GENERATE_INVOICE` job: FY from `confirmed_at` (IST, April–March), number via `invoice_sequences` row lock (`PK/2026-27/000123`), PDF (seller name/address/GSTIN, buyer, place of supply, HSN, GST rate + tax amount per line from `order_items` snapshot, FSSAI no.) → **private R2** `invoices/<orderCode>.pdf` → `orders.invoice_number`, `invoice_key`. — ✅ `modules/orders/invoice.service.ts`, `integrations/pdf/invoice-pdf.ts`; sample `Phases/evidence/phase-05/invoice-sample-draft.png` (DRAFT until Q-02 seller details)
- [x] `GET /api/v1/orders/:orderCode/invoice` → 5-min signed URL (owner / phone-verified / staff only). — ✅ `orders-lifecycle.test.ts › invoice URL is signed and stops working after it expires`
- [x] Tax calc (GST-inclusive MRP): `tax = round(line_total × rate / (10000 + rate))` per line in paise — CA format review (Phase 0). — ✅ `packages/shared/src/order/tax.ts`; `order.test.ts › GST` (CA format review still pending)

### 5.11 Order Status Page (`/order/[orderCode]`)
- [x] Poll `GET /api/v1/orders/:orderCode/status` (needs phone or session; returns minimal data) every 3s up to 60s while `PENDING_PAYMENT` — webhook-late case me "Confirming your payment…" state, phir `CONFIRMED` success UI. — ✅ `useOrderStatus.ts` (3 s × 60 s); `apps/storefront/tests/e2e/checkout.spec.ts` › pay then close browser; Phases/evidence/phase-05/`live-order-confirming-*.png`, `live-order-confirmed-*.png`
- [x] `EXPIRED` / `CANCELLED` + refund messaging. — ✅ `OrderStatusView.tsx`; Phases/evidence/phase-05/expired / cancelled-refund screenshots (`phase5-evidence.spec.ts`)

---

## 🚫 Out of Scope
- Shiprocket booking/labels (job consumer) → **Phase 6**.
- WhatsApp/SMS sending (job consumer) → **Phase 8**.
- Admin cancel/refund **UI** → **Phase 9** (API is phase me).
- COD, coupons → **v2**.

---

## 🔍 Verification Checklist
- [x] Migration `0003` up/down/up CI green. — ✅ PR #6 CI job "Migrations up → down → up (PostgreSQL 17)" pass, run https://github.com/ARUN24680/himachali_swaad/actions/runs/38164679303
- [x] **Concurrency**: 10 parallel `create-order` for last 1 jar → exactly 1 `201`, 9 `409 OUT_OF_STOCK`, `available_stock = 0`, ledger invariant holds (test `reservation-concurrency.test.ts`). — ✅ `reservation-concurrency.test.ts › 10 parallel checkouts`
- [x] Multi-item orders in opposite product order, 50 parallel runs → zero deadlocks (test). — ✅ `reservation-concurrency.test.ts › 50 parallel`
- [x] Split allocation: batches 3 + 3, order 5 → 2 allocation rows, expiry-earlier batch first; `NOT_SELLABLE` batch untouched (test). — ✅ `reservation-concurrency.test.ts › splits across batches`
- [x] Same `Idempotency-Key` twice → same order, stock reserved once. — ✅ `reservation-concurrency.test.ts › same Idempotency-Key` (sequential + 5 concurrent)
- [x] Reservation expiry → stock released, status `EXPIRED`, `RELEASE` movements (test with fake clock). — ✅ `orders-lifecycle.test.ts › EXPIRE_RESERVATIONS` (hold backdated)
- [x] **Late payment with stock** → `CONFIRMED`; **late payment stockout** → `CANCELLED` + `REFUND_PENDING` + `INITIATE_REFUND` job (tests). — ✅ `payments.test.ts › late payment …` (2 tests)
- [x] Duplicate webhook (same event id) and verify + webhook race → single confirmation, single set of jobs (test). — ✅ `payments.test.ts › duplicate event id`, `› verify + webhook racing`
- [x] Tampered signature (verify + webhook) → `400`; amount mismatch → `ops_issue` + refund, no `CONFIRMED` (tests). — ✅ `payments.test.ts › tampered …`, `› amount mismatch`
- [x] Illegal transition attempt → `409 ILLEGAL_TRANSITION`; every status change has a log row (test). — ✅ `payments.test.ts › state machine enforcement`
- [ ] Simulated browser close after payment → order confirmed via webhook within 1 min (Razorpay test mode, manual evidence).
- [ ] UPI intent opens GPay/PhonePe on a real Android device (test mode, video/screenshot).
- [x] Invoice numbers gap-free & unique under 20 parallel confirmations; invoice URL signed + expires (tests). — ✅ `orders-lifecycle.test.ts › GST invoice` (2 tests)
- [x] Checkout 375/768/1440 Playwright pass, no overflow. — ✅ `apps/storefront/tests/e2e/checkout.spec.ts` 9/9 against the live API (incl. no-horizontal-overflow assertion); CI e2e job on the PR

---

## ✅ Definition of Done
Customer prepaid order place kar sakta hai; stock exactly-once reserve/commit/release hota hai; verify aur webhook dono safely idempotent hain; har failure path (expiry, late payment, stockout, amount mismatch) automated test se proven hai aur paisa ya toh order banta hai ya refund hota hai; har confirmed order ka GST invoice ban jata hai.
