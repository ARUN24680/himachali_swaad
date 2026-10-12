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
| `INSUFFICIENT_STOCK` | 409 | Batch adjustment would take stock below 0 or above `initial_quantity` (`details.available`, `details.initialQuantity`) — Phase 3 |
| `DUPLICATE` | 409 | Unique value already used (`details.field`: `sku` / `slug` / `netWeightG` in group) — Phase 3 |
| `ILLEGAL_TRANSITION` | 409 | Transition not in allowed map |
| `STALE_STATE` | 409 | Order moved by someone else; refetch |
| `IDEMPOTENCY_CONFLICT` | 409 | Same `Idempotency-Key` with different payload |
| `VALIDATION_FAILED` | 422 | Well-formed request breaks a business rule (publish without required fields → `details.missing`, future mfg date, no kitchen → `details.field`) — Phase 3 |
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
| GET | `/products` | Public | → `{ freshestBatch: { batchCode, manufacturedAt, productTitle } \| null, groups: [{ productGroup, variants: [{ id, slug, productGroup, title, shortDescription, meatType, netWeightG, pricePaise, comparePricePaise, images, spiceLevel, sellableStock, stockBadge: 'IN_STOCK' \| 'LOW_STOCK' \| 'SOLD_OUT' }] }] }` (sellable = D-24 filter; `Cache-Control: public, max-age=60, stale-while-revalidate=300`; storefront tag `products`) |
| GET | `/products/:slug` | Public | → full detail incl. ingredients, allergens, nutrition, shelfLifeDays, storageInstructions, variants (same `productGroup`), `fssaiLicenseNo`, current batch `{ batchCode, manufacturedAt, expiryDate }` (FIFO sellable). Drafts → 404 |
| POST | `/shipping/check-pincode` | Public | `{ pincode: /^[1-9]\d{5}$/ }` → `{ pincode, serviceable: boolean \| null, estimatedDays: { min, max } \| null, courierHint: null }` (no COD field at launch, D-25). Shiprocket serviceability from the default kitchen, 0.5 kg prepaid (Phase 6). `serviceable: null` = Shiprocket unreachable → "we'll confirm at checkout", never blocks, not cached. Redis `pk:svc:<origin>:<pincode>` 24 h (serviceable) / 6 h (not) (D-53 j). 30 / min per IP. |
| POST | `/cart/quote` | Public | `{ items: [{ productId, quantity }] (≤ 20), pincode? }` → `{ items: [{ productId, slug, title, netWeightG, image, unitPricePaise, comparePricePaise, requestedQuantity, quantity, availableQuantity, lineTotalPaise, issue: 'OUT_OF_STOCK' \| 'QTY_REDUCED' \| 'INACTIVE' \| null }], subtotalPaise, shippingFeePaise, discountPaise, totalPaise, freeShippingThresholdPaise, freeShippingRemainingPaise, maxQtyPerItem }` — `quantity` = min(requested, sellable D-24, `max_qty_per_item`); duplicate lines merged. Same `quoteCart()` Phase 5 `create-order` runs (D-15, D-50). |
| POST | `/analytics/events` | Public | `{ eventName: 'ViewContent' \| 'AddToCart' \| 'InitiateCheckout', eventId, eventSourceUrl, contentIds?, valuePaise?, consent: true }` → `202` — Meta Conversions API relay (same `eventId` as the Pixel → dedup). No-op until `META_PIXEL_ID` + token set. `Purchase` only server-side (Phase 5). |

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

### `POST /checkout/abandon` — Public (Phase 5, D-52)
* Header `Idempotency-Key` (same key as the order — ownership proof), body `{ orderCode }` → `{ orderCode, released }`. Releases a superseded attempt's jars now; never when the gateway already has a payment.

### `POST /dev/payments/simulate` — dev/CI only (`PAYMENT_GATEWAY=mock`, refused in production)
* `{ razorpayOrderId, outcome: 'success' | 'failure', sendWebhook?, skipClientVerify? }` → `{ razorpayOrderId, razorpayPaymentId, razorpaySignature }`; delivers the signed webhook ~2 s later through `/webhooks/razorpay`.

### `POST /dev/shipping/simulate` — dev/CI only (`SHIPPING_PROVIDER=sandbox`, refused in production)
* `{ orderCode, status, location?, sendWebhook? }` → `{ awb, status, webhook }`; the sandbox shipment gets a courier scan and the `x-api-key`-signed tracking webhook goes through `/webhooks/courier-tracking` (D-53 b). The sandbox itself (Shiprocket-shaped API) is mounted at `/api/v1/dev/shiprocket/`.

### `/dev/messages` — dev/CI only (`WHATSAPP_PROVIDER=mock` + `SMS_PROVIDER=mock`, refused in production)
* `GET /dev/messages` → last 100 rendered WhatsApp + SMS messages (Redis outbox). `POST /dev/messages/status { providerMessageId, status }` → plays Meta's signed delivery receipt through `/webhooks/whatsapp`.

### `GET /shipping/pincode/:pincode/locality` — Public (Phase 5 §5.4)
* → `{ pincode, city | null, state | null }` from India Post, cached 30 days; checkout auto-fill (manual override kept).

### Orders (customer-facing)

| Method | Path | Roles | Request → Response |
| :--- | :--- | :--- | :--- |
| GET | `/orders/:orderCode/status` | Public with `?phone=` (E.164) **or** session owner | → `OrderStatusResponse` (`packages/shared/src/contracts/orders.ts`): status, paymentStatus, items, totals, shippingCity (never the full address), refund, invoiceAvailable, canCancel, whatsappOptIn, retryPayment (`/order/[orderCode]` page polls until webhook confirms) |
| GET | `/orders/:orderCode/invoice` | Session owner (or `?phone=`) | → `{ url, expiresAt }` signed private R2 URL (D-11, D-32) |
| POST | `/orders/:orderCode/cancel` | Session owner | `{ reason }` → allowed only in `CONFIRMED` / `AWAITING_PACKING`; triggers refund |
| POST | `/track` | Public | `{ orderCode, phone (10-digit or +91…) }` **both required** (D-39) → `TrackResponse` (`packages/shared/src/contracts/tracking.ts`): `{ orderCode, customerFirstName, destinationCity, status, paymentStatus, items[{ title, netWeightG, quantity, batchCode, manufacturedAt }], courier{ name, awb, trackingUrl }\|null, etd, refund, timeline[{ key, label, at, detail, tone }], updatedAt }`. Mismatch / unpaid → generic `NOT_FOUND`. 60 s cache (D-55 b). |

### Customer Account (CUSTOMER)

| Method | Path | Notes |
| :--- | :--- | :--- |
| GET | `/me/orders?page&pageSize` | → `{ orders[{ orderCode, status, paymentStatus, totalPaise, itemCount, firstItemTitle, createdAt }], page, pageSize, total }` — own + guest orders with the OTP-verified phone (D-55 d) |
| GET | `/me/orders/:orderCode` | → tracking view + `{ totalPaise, subtotalPaise, shippingFeePaise, invoiceAvailable, canCancel, createdAt }`; not yours → 404 |
| GET / POST | `/me/addresses` | List / create (max 10) |
| PATCH / DELETE | `/me/addresses/:id` | Update / delete; `isDefault` toggles unique default |

---

## 🪝 4. Webhooks (raw body, no cookies, exempt from Origin check)

| Method | Path | Verification | Handled events |
| :--- | :--- | :--- | :--- |
| POST | `/webhooks/razorpay` | `X-Razorpay-Signature` HMAC with **`RAZORPAY_WEBHOOK_SECRET`**; dedup `X-Razorpay-Event-Id` | `payment.captured`, `order.paid` → `confirmPayment`; `payment.failed`; `refund.processed`, `refund.failed` |
| POST | `/webhooks/courier-tracking` | `x-api-key` == `SHIPROCKET_WEBHOOK_TOKEN` (constant-time) else `401`; dedup `sha256(awb+current_status+current_timestamp)` | Shiprocket tracking updates → `tracking_events` + mapped transition (`07` §5). Path can't contain "shiprocket"/"sr"/"kr" (Shiprocket rule, D-53 a). Unknown AWB / test ping → `200`. |
| GET / POST | `/webhooks/whatsapp` | GET = Meta verify challenge (`WHATSAPP_VERIFY_TOKEN`); POST = `X-Hub-Signature-256` HMAC of the raw body with `WHATSAPP_APP_SECRET` (bad → 401) | Message status (`sent/delivered/read/failed`) → `notifications_log`, monotonic (D-55 h) |

Rule: business errors → `webhook_events.last_error`, return `200` + admin alert; only infra errors return `5xx` (so the provider retries). Failed events can be replayed via `POST /admin/webhooks/:id/replay`.

---

## 📦 5. Batches & Inventory (shared: ADMIN + KITCHEN_PARTNER)

> KITCHEN_PARTNER sirf apni `user_pickup_locations` ke batches dekh/bana sakta hai; ADMIN sab.

| Method | Path | Roles | Request → Response |
| :--- | :--- | :--- | :--- |
| GET | `/batches` | ADMIN, KITCHEN_PARTNER | `?productId&locationId&status=FRESH\|AGING\|NOT_SELLABLE\|EXPIRED&includeEmpty` → `{ batches (FIFO, with shelfStatus + daysToExpiry), sellableBufferDays }` |
| GET | `/batches/product-options` | ADMIN, KITCHEN_PARTNER | Products a batch can be logged against (drafts too; `shelfLifeDays: null` = blocked) |
| POST | `/batches` | ADMIN, KITCHEN_PARTNER | `{ productId, quantity, totalCostPaise, manufacturedAt?, pickupLocationId?, notes? }` → server generates `batchCode` (`PK-2610-CHK250-01`, D-42), `expiryDate = manufacturedAt + product.shelf_life_days`, `PRODUCTION` movement |
| PATCH | `/batches/:id` | ADMIN, KITCHEN_PARTNER | `{ notes }` only — quantity fixes go through adjustments |
| GET | `/batches/:id/movements` | ADMIN, KITCHEN_PARTNER | Stock ledger (`inventory_movements`), newest first, with `balanceAfter` |
| POST | `/batches/:id/adjustments` | ADMIN, KITCHEN_PARTNER (own kitchen, D-49) | `{ quantityDelta, type: 'ADJUSTMENT' \| 'WASTAGE', reason }` → `FOR UPDATE` + bounds check (`409 INSUFFICIENT_STOCK`) + movement + audit |
| GET | `/partner/pickup-locations` | ADMIN, KITCHEN_PARTNER | Kitchens (ADMIN all, partner own) — batch form kitchen picker |

---

## 📱 6. Kitchen Partner (`KITCHEN_PARTNER`, also ADMIN) — scoped to own pickup locations

| Method | Path | Request → Response |
| :--- | :--- | :--- |
| GET | `/partner/orders?status=AWAITING_PACKING\|PACKED\|PICKUP_SCHEDULED` | → `{ toPack, cutoffHourIst, orders: [{ orderCode, status, items: [{ title, sku, netWeightG, quantity, batches: [{ batchCode, quantity }] }], customerFirstName, city, state, courierName, awbCode, labelReady, confirmedAt, packBy, pickupDate }] }` oldest first — **no phone, full address or revenue** (D-54 c) |
| GET | `/partner/orders/:orderCode/label` | → `{ url, expiresAt }` 4×6 PDF, 5-min signed private R2 URL (D-11, D-37); own kitchen's orders only (else 404); audited `LABEL_VIEW` (Phase 6) |
| GET | `/partner/labels/a4?orders=PK-7KQ2M9,PK-...` | 1–20 codes → `{ url, expiresAt }` merged A4 (4-per-page) PDF for cyber-cafe printing; each label audited |
| GET | `/partner/manifests` | → `{ manifests: [{ pickupDate, kitchenCode, orderCodes, url, expiresAt }] }` latest pickup manifests (Phase 6 batches) |
| POST | `/partner/orders/:orderCode/mark-packed` | Header `Idempotency-Key` (uuid); body `{ checklist: { correctBatch, weighed, sealChecked, shrinkApplied, bubbleWrapped, labelApplied } }` (all `true`, D-54 a) → `{ orderCode, status, changed, pickupDate }`; `AWAITING_PACKING → PACKED`, `SHIPROCKET_SCHEDULE_PICKUP` enqueued (D-36). Already packed → 200 `changed: false`; cancelled → 409 `ORDER_CANCELLED` |
| GET | `/partner/push-subscriptions` | → `{ vapidPublicKey \| null, subscribed }` (null = push not configured → WhatsApp alerts) |
| POST / DELETE | `/partner/push-subscriptions` | `{ endpoint (https), keys: { p256dh, auth } }` → `201` save / `{ endpoint }` remove (PWA push, D-16) |
| GET | `/partner/settlements` | Finalized/paid settlements, read-only (D-40) |
| GET | `/partner/settlements/:id` | Statement + line items + expenses + signed PDF URL |
| POST | `/partner/settlements/:id/acknowledge` | Sets `partner_acknowledged_at` |

---

## 🖥️ 7. Admin (`ADMIN` only; every mutation → `admin_audit_log`)

| Area | Method & Path | Notes |
| :--- | :--- | :--- |
| Dashboard | `GET /admin/dashboard` | KPIs: to pack, in transit, revenue (paise), ops issues, low stock |
| Products | `GET / POST /admin/products`, `GET / PATCH /admin/products/:id` | Full product fields (D-33 dims, `gstRateBp`, `shelfLifeDays`) |
| | `POST /admin/products/:id/publish`, `POST /admin/products/:id/unpublish` | `is_active` toggle; publish needs `gstRateBp`, `shelfLifeDays`, `ingredients`, `packedWeightG`, `nutrition`, ≥ 1 image → else `422 VALIDATION_FAILED` + `details.missing` (D-49). SKU immutable. Every write → audit + storefront `revalidateTag('products')` |
| | `POST /admin/uploads/product-image` | `{ productId, contentType: webp\|jpeg\|png, sizeBytes ≤ 5 MB }` → `{ key, uploadUrl, method: 'PUT', headers, publicUrl }`; key `products/<productId>/<uuid>.<ext>`, Content-Type + Content-Length signed. Then `PATCH images` |
| Orders | `GET /admin/orders` | Query: `status[]`, `tab`, `q` (code/phone/AWB), `from`, `to`, `page`, `sort` |
| | `GET /admin/orders/:orderCode` | Items, allocations (batches), payments, refunds, shipment, tracking, notifications, status log |
| | `GET /admin/orders/:orderCode/label` | `{ url, expiresAt }` signed label URL, audited `LABEL_VIEW` (Phase 6) |
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
| Queues | `/api/v1/admin/queues` | bull-board UI (ADMIN, `queues:view`) — Phase 5 |

---

## ⚙️ 8. Background Jobs (worker process, D-06)

| Queue | Job | jobId pattern | Trigger | Retries |
| :--- | :--- | :--- | :--- | :--- |
| `orders` | `SHIPROCKET_CREATE_ORDER` (create order → courier select via `min_courier_rating` / `max_courier_etd_days` → AWB) | `ship-<orderId>` | `CONFIRMED` | 5, exponential (30s base), only network/5xx/429 retried (4xx → dead letter at once); then `ops_issue` + `shipments.last_error` + admin alert |
| `documents` | `FETCH_AND_STORE_LABEL` (label PDF → private R2 `labels/<orderCode>.pdf` → `AWAITING_PACKING`) | `label-<orderId>` | AWB assigned | 5, exponential |
| `orders` | `SHIPROCKET_SCHEDULE_PICKUP` (fixes the pickup day: before cut-off → today, else next working day) | `pickup-<orderId>` | `PACKED` | 5, exponential |
| `orders` | `SHIPROCKET_CANCEL_SHIPMENT` (AWB cancel, else Shiprocket order cancel; no-op if nothing booked) | `shipcancel-<orderId>` | Admin/customer cancel from `CONFIRMED` on | 5; then `ops_issue` + alert |
| `documents` | `GENERATE_INVOICE` | `inv:<orderId>` | `CONFIRMED` | 3 |
| `documents` | `GENERATE_SETTLEMENT_PDF` | `stmt:<settlementId>` | Finalize | 3 |
| `payments` | `INITIATE_REFUND` (`{ refundId }` — intent row already written, D-52) | `refund-<refundId>` | Cancel / stockout / mismatch / duplicate payment / RTO | 5; then `ops_issue` |
| `notify` | `ORDER_CONFIRMED`, `ORDER_CANCELLED`, `ORDER_STATUS_NOTIFY { template }` (WhatsApp → SMS fallback / push) | `notify-<template>-<orderId>` | Transitions (`07` §6) | 3 |
| `notify` | `PARTNER_NEW_ORDER_ALERT { orderId }` (Web Push to the kitchen's partners → `notifications_log`; unreached partners → `WHATSAPP_SEND`) | `notify-new_order_alert-<orderId>` | `CONFIRMED` (D-54 e) | 3 |
| `notify` | `REFUND_PROCESSED { refundId }` → `refund_processed` | `notify-refund_processed-<refundId>` | refund settled | 3 |
| `notify` | `ADMIN_ALERT_SUMMARY { kind, window }` (delayed 10 min, "N more …") | `alert-summary-<kind>-<window>` | 2nd+ alert of a kind in a window | 3 |
| `notify` | `WHATSAPP_SEND { template, userId, orderId, variables }` (staff WhatsApp; quiet-hours templates delayed to 08:00 IST) | `notify-wa-<template>-<subject>-<userId>` | Push fallback | 3 |
| `notify` | `ADMIN_ALERT { kind, orderId, message }` (booking failed, NDR, RTO, lost, pickup missed/exception, weight discrepancy, wallet low, unknown AWB) | `alert-<kind>-<orderId \| date>` | Logistics events (Phase 6) | 3 |
| `cron` | `EXPIRE_RESERVATIONS` | repeat 1 min | — | — |
| `cron` | `RECONCILE_CONFIRMED` | repeat 5 min | — | — |
| `cron` | `RECONCILE_REFUNDS` | repeat 30 min | — | — |
| `cron` | `PICKUP_BATCH` (one pickup + manifest per kitchen once today's `pickup_cutoff_hour_ist` has passed) | repeat 15 min | — | — |
| `cron` | `POLL_TRACKING` (concurrency 2 + jitter; also charged weight + "pickup missed" > 48 h) | repeat 3 hr | — | — |
| `cron` | `PARTNER_DAILY_DIGEST` ("Aaj N orders pack karne hain", only N > 0; push → WhatsApp fallback) | repeat 09:00 IST | — | — |
| `cron` | `LEDGER_CHECK`, `LOW_STOCK_ALERT` | daily | — | — |
| `cron` | `CHECK_WALLET_BALANCE` (vs `shiprocket_wallet_min_paise`) | hourly | — | — |

---

## 🚦 9. Rate Limits (Redis-backed, `@fastify/rate-limit`)

| Endpoint | Limit |
| :--- | :--- |
| `POST /auth/otp/send` | 3 / 10 min per phone; 10 / 10 min per IP |
| `POST /auth/otp/verify` | 5 attempts per OTP; 20 / 10 min per IP |
| `POST /auth/staff/login` | 5 / 15 min per email + IP |
| `POST /track` | 10 / 10 min per IP |
| `GET /orders/:orderCode/status` | 60 / 10 min per IP (3 s poll for 60 s, D-52) |
| `POST /shipping/check-pincode`, `POST /cart/quote` | 60 / min per IP |
| `POST /checkout/create-order` | 10 / 10 min per IP; 5 / 10 min per phone |
| Webhooks | No limit (signature verified) |
| Everything else | 300 / min per user/IP |
