# 🔌 02. Backend Services & API Specifications (Fastify 5 + Pure Raw SQL)

> Related: `07-order-state-machine.md` (business flows), `01-database-schema-models.md` (tables), `08-decisions-log.md` (D-xx).
> Base URL: `https://api.pahadikhatki.in/api/v1`. Saare request/response schemas `packages/shared/src/contracts/` me Zod se defined honge — neeche sketches hain.
> **Orders har jagah `:orderCode` (e.g. `PK-7KQ2M9`) se address hote hain** — admin, partner aur customer teeno routes me.

---

## 🎯 Architectural Invariants
* Har endpoint ka body/query/params/headers **Zod** se validate (`fastify-type-provider-zod`).
* Sensitive writes (checkout, payment confirmation, inventory, refunds) **`db.transaction()`** me — raw SQL, **no ORM**.
* External calls (Razorpay, Shiprocket, WhatsApp, R2) **transaction ke bahar** (D-30); slow ones **BullMQ jobs** me.
* Order status sirf `transitionOrder()` se (D-29).
* Money hamesha **integer paise** (`...Paise` fields) (D-26).
* Har response me `requestId` (header `x-request-id` bhi).
* CSRF: mutating requests par `Origin` allow-list check — **`/webhooks/*` routes is guard se exempt** (unka auth signature/token hai).

---

## 📨 Response Envelope & Error Codes

```json
{ "success": true,  "data": { }, "error": null, "requestId": "req_01J9...", "timestamp": "2026-10-08T18:50:00Z" }
{ "success": false, "data": null, "error": { "code": "OUT_OF_STOCK", "message": "Only 2 jars left", "details": { "productId": "..." } }, "requestId": "req_01J9...", "timestamp": "..." }
```

| Code | HTTP | Meaning |
| :--- | :--- | :--- |
| `VALIDATION_ERROR` | 400 | Zod validation failed (`details.issues`) |
| `INVALID_SIGNATURE` | 400 | Razorpay signature / webhook HMAC mismatch |
| `OTP_INVALID` | 400 | Wrong/expired OTP |
| `UNAUTHENTICATED` | 401 | No/expired session |
| `TOTP_REQUIRED` | 401 | ADMIN 2FA code missing |
| `FORBIDDEN` | 403 | Role/location not allowed, or CSRF origin check failed |
| `NOT_FOUND` | 404 | Resource not found (also track lookup mismatch — no enumeration) |
| `OUT_OF_STOCK` | 409 | Not enough sellable stock (`details.productId`, `details.available`) |
| `ILLEGAL_TRANSITION` | 409 | Transition not in allowed map |
| `STALE_STATE` | 409 | Order moved by someone else; refetch |
| `IDEMPOTENCY_CONFLICT` | 409 | Same `Idempotency-Key` with different payload |
| `PINCODE_NOT_SERVICEABLE` | 422 | Shiprocket says no courier |
| `RATE_LIMITED` | 429 | Too many requests (`Retry-After` header) |
| `INTERNAL_ERROR` | 500 | Unexpected (Sentry event id in `details`) |
| `PAYMENT_INIT_FAILED` | 502 | Razorpay order creation failed (stock auto-released) |
| `UPSTREAM_UNAVAILABLE` | 503 | Shiprocket/SMS provider down |

---

## 🔐 1. Auth (D-18 … D-21)

| Method | Path | Roles | Request → Response |
| :--- | :--- | :--- | :--- |
| POST | `/auth/otp/send` | Public | `{ phone: E164 }` → `{ sent: true, resendAfterSec }` |
| POST | `/auth/otp/verify` | Public | `{ phone, otp: string(6) }` → `{ user: { id, phone, fullName, role } }` + sets `pk_at`, `pk_rt` cookies. New phone → `CUSTOMER` upsert (`INSERT ... ON CONFLICT (phone) DO UPDATE`). |
| POST | `/auth/staff/login` | Public | `{ email, password, totp?: string(6) }` → `{ user }` + cookies. `TOTP_REQUIRED` if ADMIN 2FA enabled and code missing. |
| POST | `/auth/staff/2fa/setup` | ADMIN | → `{ otpauthUrl }` (QR) |
| POST | `/auth/staff/2fa/verify` | ADMIN | `{ code }` → `{ enabled: true }` |
| POST | `/auth/staff/change-password` | ADMIN, KITCHEN_PARTNER | `{ currentPassword, newPassword }` → revokes other sessions |
| POST | `/auth/refresh` | Cookie `pk_rt` | Rotates refresh token (reuse of a revoked token ⇒ whole family revoked) |
| POST | `/auth/logout` | Any | Revokes current refresh token, clears cookies |
| POST | `/auth/logout-all` | Any | Revokes all refresh-token families of the user |
| GET | `/auth/me` | Any authenticated | → `{ user, pickupLocationIds? }` |

Notes: OTP 6-digit, Redis TTL 5 min (HMAC hash only), max 5 verify attempts, 30 s resend cooldown (D-21, D-48). OTP never logs in staff/deactivated users (D-48). `/auth/refresh` 401 carries `details.reason` = `reuse` · `expired` · `unknown` · `inactive` · `race` (race = 10 s two-tab grace, retry the request). Cookies `pk_at` (15 min JWT) and `pk_rt` (30 din opaque) — `httpOnly; Secure; SameSite=Lax; Domain=.pahadikhatki.in` (D-20).

---

## 🛍️ 2. Public Catalog, Shipping & Cart

| Method | Path | Roles | Request → Response |
| :--- | :--- | :--- | :--- |
| GET | `/products` | Public | → `[{ id, slug, productGroup, title, shortDescription, meatType, netWeightG, pricePaise, comparePricePaise, images, spiceLevel, sellableStock, stockBadge: 'IN_STOCK' \| 'LOW' \| 'SOLD_OUT' }]` (sellable = D-24 filter) |
| GET | `/products/:slug` | Public | → full detail incl. ingredients, allergens, nutrition, shelfLifeDays, storageInstructions, variants (same `productGroup`), current batch `{ batchCode, manufacturedAt }` |
| POST | `/shipping/check-pincode` | Public | `{ pincode: /^[1-9]\d{5}$/ }` → `{ serviceable, estimatedDays, courierName? }` (no COD field at launch, D-25). Redis cache 24h per pincode + weight slab. |
| POST | `/cart/quote` | Public | `{ items: [{ productId, quantity }], pincode? }` → `{ items: [{ productId, unitPricePaise, quantity, available, adjusted }], subtotalPaise, shippingFeePaise, discountPaise, totalPaise, freeShippingRemainingPaise }` — server-side pricing + stock revalidation (D-15). `create-order` re-quotes anyway. |

---

## 💳 3. Checkout, Payments & Customer Orders (see `07-order-state-machine.md` §4)

### `POST /checkout/create-order` — Public (guest) or CUSTOMER
* Headers: **`Idempotency-Key: <uuid>`** (required; same key → same order, D-22).
* Body:
  ```ts
  {
    items: { productId: uuid, quantity: int(1..max_qty_per_item) }[],
    customer: { fullName: string(2..120), phone: E164, email?: email },
    shippingAddress: { line1, line2?, landmark?, city, state, pincode },
    saveAddress?: boolean,                                   // logged-in only
    consent: { orderUpdates: true, whatsappOptIn: boolean }  // DPDP → orders.whatsapp_opt_in(_at)
  }
  ```
* Logic: re-quote → transaction (insert order `PENDING_PAYMENT`, sorted FIFO-by-expiry reservation across batches) → commit → Razorpay order create (outside txn) → on failure release stock + `PAYMENT_INIT_FAILED`.
* Response: `{ orderCode: "PK-7KQ2M9", razorpayOrderId: "order_xxx", amountPaise: 79800, keyId, expiresAt }` — client Razorpay `timeout` = seconds till `expiresAt`.

### `POST /payments/verify` — Public
* Body: `{ razorpayOrderId, razorpayPaymentId, razorpaySignature }`
* Verify `HMAC_SHA256(order_id|payment_id, RAZORPAY_KEY_SECRET)` → `confirmPayment({ source: 'CLIENT_VERIFY' })`.
* Response: `{ orderCode, status: 'CONFIRMED' | 'REFUND_INITIATED' | 'ALREADY_PROCESSED' }` → client redirects to `/order/:orderCode`.

### Orders (customer-facing)

| Method | Path | Roles | Request → Response |
| :--- | :--- | :--- | :--- |
| GET | `/orders/:orderCode/status` | Public with `?phone=` **or** session owner | → `{ orderCode, status, paymentStatus, items, totalPaise }` (`/order/[orderCode]` page polls until webhook confirms) |
| GET | `/orders/:orderCode/invoice` | Session owner (or `?phone=`) | → `{ url, expiresAt }` signed private R2 URL (D-11, D-32) |
| POST | `/orders/:orderCode/cancel` | Session owner | `{ reason }` → allowed only in `CONFIRMED` / `AWAITING_PACKING`; triggers refund |
| POST | `/track` | Public | `{ orderCode, phone }` **both required** (D-39) → `{ orderCode, status, timeline: [{ status, label, at, location? }], courierName?, awbCode?, trackingUrl?, etd? }`. Mismatch → `NOT_FOUND`. |

### Customer Account (CUSTOMER)

| Method | Path | Notes |
| :--- | :--- | :--- |
| GET | `/me/orders` | Paginated, own orders only |
| GET | `/me/orders/:orderCode` | Detail + timeline + invoice availability |
| GET / POST | `/me/addresses` | List / create (max 10) |
| PATCH / DELETE | `/me/addresses/:id` | Update / delete; `isDefault` toggles unique default |

---

## 🪝 4. Webhooks (raw body, no cookies, exempt from Origin check)

| Method | Path | Verification | Handled events |
| :--- | :--- | :--- | :--- |
| POST | `/webhooks/razorpay` | `X-Razorpay-Signature` HMAC with **`RAZORPAY_WEBHOOK_SECRET`**; dedup `X-Razorpay-Event-Id` | `payment.captured`, `order.paid` → `confirmPayment`; `payment.failed`; `refund.processed`, `refund.failed` |
| POST | `/webhooks/shiprocket` | `x-api-key` == `SHIPROCKET_WEBHOOK_TOKEN`; dedup `sha256(awb+status+time)` | Tracking updates → `tracking_events` + mapped transition (`07` §5) |
| GET / POST | `/webhooks/whatsapp` | GET = Meta verify challenge; POST = `X-Hub-Signature-256` (or BSP equivalent) | Message status (`sent/delivered/read/failed`) → `notifications_log` |

Rule: business errors → `webhook_events.last_error`, return `200` + admin alert; only infra errors return `5xx` (so the provider retries). Failed events can be replayed via `POST /admin/webhooks/:id/replay`.

---

## 📦 5. Batches & Inventory (shared: ADMIN + KITCHEN_PARTNER)

> KITCHEN_PARTNER sirf apni `user_pickup_locations` ke batches dekh/bana sakta hai; ADMIN sab.

| Method | Path | Roles | Request → Response |
| :--- | :--- | :--- | :--- |
| GET | `/batches` | ADMIN, KITCHEN_PARTNER | `?productId&status=SELLABLE\|AGING\|NOT_SELLABLE\|EXPIRED` → batches with jars left + badge |
| POST | `/batches` | ADMIN, KITCHEN_PARTNER | `{ productId, quantity, totalCostPaise, manufacturedAt?, pickupLocationId?, notes? }` → server generates `batchCode` (`PK-2610-CHK250-01`, D-42), `expiryDate = manufacturedAt + product.shelf_life_days`, `PRODUCTION` movement |
| GET | `/batches/:id/movements` | ADMIN, KITCHEN_PARTNER | Stock ledger (`inventory_movements`) |
| POST | `/batches/:id/adjustments` | **ADMIN only** | `{ quantityDelta, type: 'ADJUSTMENT' \| 'WASTAGE', reason }` → transaction + movement + audit |

---

## 📱 6. Kitchen Partner (`KITCHEN_PARTNER`, also ADMIN) — scoped to own pickup locations

| Method | Path | Request → Response |
| :--- | :--- | :--- |
| GET | `/partner/orders?status=AWAITING_PACKING` | → `{ orderCode, items: [{ title, netWeightG, quantity, batchCodes[] }], customerFirstName, city, state, createdAt }` — **no phone, full address or revenue** |
| GET | `/partner/orders/:orderCode/label` | → `{ url, expiresAt }` 4×6 PDF, 5-min signed private R2 URL (D-11, D-37) |
| GET | `/partner/labels/a4?orders=PK-7KQ2M9,PK-...` | → signed URL of merged A4 (4-per-page) PDF for cyber-cafe printing |
| POST | `/partner/orders/:orderCode/mark-packed` | Header `Idempotency-Key`; body `{ checklist: { sealChecked, shrinkApplied, bubbleWrapped, weightOk } }` → `AWAITING_PACKING → PACKED`, pickup job enqueued (D-36) |
| POST / DELETE | `/partner/push-subscriptions` | `{ endpoint, keys: { p256dh, auth } }` → save / remove (PWA push, D-16) |
| GET | `/partner/settlements` | Finalized/paid settlements, read-only (D-40) |
| GET | `/partner/settlements/:id` | Statement + line items + expenses + signed PDF URL |
| POST | `/partner/settlements/:id/acknowledge` | Sets `partner_acknowledged_at` |

---

## 🖥️ 7. Admin (`ADMIN` only; every mutation → `admin_audit_log`)

| Area | Method & Path | Notes |
| :--- | :--- | :--- |
| Dashboard | `GET /admin/dashboard` | KPIs: to pack, in transit, revenue (paise), ops issues, low stock |
| Products | `GET / POST /admin/products`, `GET / PATCH /admin/products/:id` | Full product fields (D-33 dims, `gstRateBp`, `shelfLifeDays`) |
| | `POST /admin/products/:id/publish`, `POST /admin/products/:id/unpublish` | `is_active` toggle; publish validates FSSAI-required fields |
| | `POST /admin/uploads/product-image` | `{ contentType, sizeBytes }` → presigned PUT to public R2 |
| Orders | `GET /admin/orders` | Query: `status[]`, `tab`, `q` (code/phone/AWB), `from`, `to`, `page`, `sort` |
| | `GET /admin/orders/:orderCode` | Items, allocations (batches), payments, refunds, shipment, tracking, notifications, status log |
| | `GET /admin/orders/:orderCode/label` | Signed label URL |
| | `POST /admin/orders/:orderCode/cancel` | `{ reason }` → allowed per `07` §1.2; AWB cancel job + stock release + refund |
| | `POST /admin/orders/:orderCode/refunds` | `{ amountPaise, reason }` → partial/full |
| | `POST /admin/orders/:orderCode/notifications/resend` | `{ template }` |
| | `POST /admin/orders/:orderCode/retry-shipment` | Re-enqueue `SHIPROCKET_CREATE_ORDER` (same jobId) |
| | `POST /admin/orders/:orderCode/resolve-issue` | Clear `ops_issue` with note |
| | `POST /admin/orders/:orderCode/notes` | Internal note |
| Customers | `GET /admin/customers` | `?q`, orders count, LTV (paise) |
| Settings | `GET /admin/settings`, `PATCH /admin/settings` | `{ key, value }`, Zod per key (incl. `min_courier_rating`, `max_courier_etd_days`, `shiprocket_wallet_min_paise`) |
| Staff | `GET / POST /admin/staff`, `PATCH /admin/staff/:id` | Create partner/admin, assign pickup locations, deactivate |
| Expenses | `GET / POST /admin/expenses`, `PATCH / DELETE /admin/expenses/:id` | Delete only if not in a finalized settlement |
| Settlements | `POST /admin/settlements` | `{ periodStart, periodEnd }` → DRAFT computed (D-41) |
| | `POST /admin/settlements/:id/finalize` | Locks numbers, generates PDF, notifies partner |
| | `POST /admin/settlements/:id/mark-paid` | `{ bankReference, paidAt }` |
| Exports | `GET /admin/exports/:type` | `type = orders \| gst \| inventory \| settlements` → streamed CSV |
| Webhooks | `POST /admin/webhooks/:id/replay` | Re-process a stored `webhook_events` row |
| Queues | `/admin/queues` | bull-board UI |

---

## ⚙️ 8. Background Jobs (worker process, D-06)

| Queue | Job | jobId pattern | Trigger | Retries |
| :--- | :--- | :--- | :--- | :--- |
| `orders` | `SHIPROCKET_CREATE_ORDER` (create order → courier select via `min_courier_rating` / `max_courier_etd_days` → AWB) | `ship:<orderId>` | `CONFIRMED` | 5, exponential (30s base); then `ops_issue` + admin alert |
| `orders` | `FETCH_AND_STORE_LABEL` (label PDF → private R2 → `AWAITING_PACKING`) | `label:<orderId>` | AWB assigned | 5, exponential |
| `orders` | `SHIPROCKET_SCHEDULE_PICKUP` | `pickup:<orderId>` | `PACKED` | 5, exponential |
| `orders` | `SHIPROCKET_CANCEL_SHIPMENT` | `shipcancel:<orderId>` | Admin/customer cancel after AWB | 5 |
| `documents` | `GENERATE_INVOICE` | `inv:<orderId>` | `CONFIRMED` | 3 |
| `documents` | `GENERATE_SETTLEMENT_PDF` | `stmt:<settlementId>` | Finalize | 3 |
| `payments` | `INITIATE_REFUND` | `refund:<orderId>:<reason>` | Cancel / stockout / mismatch / RTO | 5; then `ops_issue` |
| `notify` | `ORDER_CONFIRMED` and other templates (WhatsApp → SMS fallback / push) | `notify:<template>:<orderId>` | Transitions (`07` §6) | 3 |
| `cron` | `EXPIRE_RESERVATIONS` | repeat 1 min | — | — |
| `cron` | `RECONCILE_CONFIRMED` | repeat 5 min | — | — |
| `cron` | `RECONCILE_REFUNDS` | repeat 30 min | — | — |
| `cron` | `POLL_TRACKING` | repeat 3 hr | — | — |
| `cron` | `PARTNER_DAILY_DIGEST` | repeat 09:00 IST | — | — |
| `cron` | `LEDGER_CHECK`, `LOW_STOCK_ALERT` | daily | — | — |
| `cron` | `CHECK_WALLET_BALANCE` (vs `shiprocket_wallet_min_paise`) | hourly | — | — |

---

## 🚦 9. Rate Limits (Redis-backed, `@fastify/rate-limit`)

| Endpoint | Limit |
| :--- | :--- |
| `POST /auth/otp/send` | 3 / 10 min per phone; 10 / 10 min per IP |
| `POST /auth/otp/verify` | 5 attempts per OTP; 20 / 10 min per IP |
| `POST /auth/staff/login` | 5 / 15 min per email + IP |
| `POST /track`, `GET /orders/:orderCode/status` | 10 / 10 min per IP |
| `POST /shipping/check-pincode`, `POST /cart/quote` | 60 / min per IP |
| `POST /checkout/create-order` | 10 / 10 min per IP; 5 / 10 min per phone |
| Webhooks | No limit (signature verified) |
| Everything else | 300 / min per user/IP |
