# 🚚 Phase 6: Shiprocket, AWB, Labels, Pickup, Tracking Webhooks & NDR Basics

> [!IMPORTANT]
> **Read first:** `Rules/00-project-rules.md` · `architecture/08-decisions-log.md` · `architecture/07-order-state-machine.md` · `architecture/01-database-schema-models.md`
> **Depends on:** Phase 1, Phase 5  ·  **Migration:** `0004_logistics.sql`

---

## 🎯 Objective
Order `CONFIRMED` hote hi delivery pipeline poori tarah automatic chalni chahiye: Shiprocket order create karna, courier select karna, AWB lena, label PDF **private R2** me save karna, aur order ko `AWAITING_PACKING` me le jana. Uske baad pickup schedule karna, tracking webhooks aur polling se status sync karna, aur NDR/RTO ka basic handling. Ek bhi order silently drop nahi hona chahiye: har permanent failure `ops_issue` set karke admin ko alert karega.

---

## 📋 Granular Tasks & Checklist

### 6.1 Migration & Worker Infrastructure
- [ ] `0004_logistics.sql` apply karo (`shipments`, `tracking_events`) — `dbmate up` + `dbmate down` round-trip CI me.
- [ ] `apps/api-server/src/worker.ts` entrypoint (D-06) — HTTP server se alag process.
- [ ] BullMQ queues (shared Redis connection, `maxRetriesPerRequest: null`):
  | Queue | Jobs |
  | :--- | :--- |
  | `orders` | `SHIPROCKET_CREATE_ORDER`, `SHIPROCKET_SCHEDULE_PICKUP`, `SHIPROCKET_CANCEL_SHIPMENT` |
  | `documents` | `GENERATE_INVOICE`, `FETCH_AND_STORE_LABEL` |
  | `notify` | Phase 8 templates (yahan sirf enqueue hook) |
  | `payments` | `INITIATE_REFUND` (Phase 5 se) |
  | `maintenance` | repeat jobs: `EXPIRE_RESERVATIONS`, `RECONCILE_CONFIRMED`, `POLL_TRACKING`, `CHECK_WALLET_BALANCE` |
- [ ] **Deterministic `jobId`** har job par (`ship:<orderId>`, `label:<orderId>`, `pickup:<orderId>`, `cancel-ship:<orderId>`) → duplicate enqueue = no-op (`07` §4.2).
- [ ] Retry policy: `attempts: 5`, `backoff: { type: 'exponential', delay: 30_000 }`. Sirf retryable errors retry hon (network, 5xx, 429). 4xx validation errors turant fail.
- [ ] **Dead-letter handling:** final failure par `orders.ops_issue = '<JOB>: <error>'`, `shipments.last_error` update, `booking_attempts++`, admin alert enqueue. Admin "Retry booking" button (Phase 9) same `jobId` se re-enqueue karega.
- [ ] Worker graceful shutdown (`SIGTERM` → `worker.close()`), concurrency config env se.

### 6.2 Shiprocket API Client (`apps/api-server/src/integrations/shiprocket/client.ts`)
- [ ] Base URL `https://apiv2.shiprocket.in/v1/external/` — ⚠️ endpoint paths aur payload fields Shiprocket ke **current official API docs** se verify karke likhna (yahan sirf method contract hai).
- [ ] Token management: `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD` (API user) se login, token Redis me (`shiprocket:token`) TTL ke saath, **expiry se pehle refresh**. Concurrent refresh ke liye Redis lock (`SET NX PX`). `401` aaye toh ek baar force-refresh + retry.
- [ ] Typed methods (har response Zod se parse):
  - `checkServiceability({ pickupPincode, deliveryPincode, weightKg, cod: false })`
  - `createOrder(payload)` → `{ shiprocketOrderId, shipmentId }`
  - `getCourierRates(shipmentId)` → list (rate, rating, ETD, courier id)
  - `assignAwb(shipmentId, courierId)` → `{ awb, courierName }`
  - `generateLabel(shipmentIds)` → label URL
  - `generatePickup(shipmentIds)` / `generateManifest(shipmentIds)`
  - `cancelShipment(awbs)` / `cancelOrder(ids)`
  - `trackByAwb(awb)`
  - `getWalletBalance()`
- [ ] Har outbound call: timeout (10s), structured log (pino) **bina PII** ke, Sentry breadcrumb.
- [ ] Shiprocket me pickup location pehle register + verify honi chahiye; `pickup_locations.shiprocket_pickup_name` usi nickname se match kare (Phase 0 prerequisite).

### 6.3 Pincode Serviceability (`POST /api/v1/shipping/check-pincode`)
- [ ] Zod: `{ pincode: /^[1-9][0-9]{5}$/ }`.
- [ ] Redis cache `svc:<pickupPincode>:<pincode>` (TTL 24h; non-serviceable result TTL 6h).
- [ ] Response: `{ serviceable, estimatedDays, couriers: number }` — courier names customer ko dikhane ki zaroorat nahi.
- [ ] Rate limit per IP (e.g. 30 / min). Shiprocket down → `serviceable: null` + "We'll confirm at checkout" (checkout block nahi hoga).

### 6.4 Package Weight & Box Rules (D-33, D-34)
- [ ] Weight/dimensions `products.packed_weight_g` + `package_*_cm` se aayenge — kahin hardcode nahi.
- [ ] Multi-jar box rules `packages/shared/src/logistics/boxRules.ts` me config table:
  | Jars (250g-equivalent) | Box | Notes |
  | :--- | :--- | :--- |
  | 1 | 15 × 10 × 10 cm (standard) | D-33 |
  | 2 | TBD (Phase 0 procurement) | |
  | 3–4 | TBD | |
  | > 4 | Split into multiple boxes → v2 (abhi single shipment, admin alert) | |
- [ ] Dead weight = Σ packed_weight + extra box overhead; volumetric = L×B×H / 5000 — dono log karo, Shiprocket ko actual dimensions bhejo.
- [ ] Unit test: 1 × 250g SKU ka computed weight **≤ 500g** target ke against warn (D-34).

### 6.5 `SHIPROCKET_CREATE_ORDER` Job (CONFIRMED → AWAITING_PACKING)
- [ ] Guard: order `status = 'CONFIRMED'` aur `payment_status = 'PAID'` nahi hai toh job no-op.
- [ ] Idempotency: `shipments` row pehle se hai aur `awb_code` set hai → sirf label step continue karo; `shiprocket_order_id` hai lekin AWB nahi → create skip, AWB step se resume.
- [ ] Payload: `order_id = order_code`, `pickup_location = shiprocket_pickup_name`, customer address snapshot (`orders.shipping_address`), line items (sku, name, units, selling price in rupees from paise), `payment_method: 'Prepaid'`, sub_total, dimensions/weight (6.4), invoice number agar available.
- [ ] Courier selection (configurable via `settings`): filter → `rating >= settings.min_courier_rating`, ETD ≤ `settings.max_courier_etd_days`; sort by `rate ASC`, tie → faster ETD. Fallback: agar filter ke baad koi nahi bacha toh cheapest available + admin note.
- [ ] Assign AWB → `shipments` update (`awb_code`, `courier_name`, `courier_company_id`, `freight_paise`, `etd`).
- [ ] Enqueue `FETCH_AND_STORE_LABEL`.
- [ ] Har external call ke baad **short transaction** me DB update (D-30) — kabhi API call transaction ke andar nahi.

### 6.6 Label Storage (D-11, D-37)
- [ ] `FETCH_AND_STORE_LABEL`: Shiprocket se label PDF download → **private** R2 bucket key `labels/<orderCode>.pdf` → `shipments.label_key`.
- [ ] Phir transaction: `transitionOrder(CONFIRMED → AWAITING_PACKING, actor: SYSTEM)`.
- [ ] Signed URL endpoint: `GET /api/v1/partner/orders/:orderCode/label` aur `GET /api/v1/admin/orders/:orderCode/label` → 302 to R2 signed URL (TTL 5 min). Har access `admin_audit_log` me (`LABEL_VIEW`).
- [ ] Label format 4×6 inch thermal; A4 4-up fallback Phase 7 me client-side.

### 6.7 Pickup Scheduling & Manifest (D-36)
- [ ] `PACKED` transition (Phase 7) → `SHIPROCKET_SCHEDULE_PICKUP` enqueue.
- [ ] Cut-off: `pickup_cutoff_hour_ist` (default 11). Cut-off se pehle packed → same-day pickup request; baad me → next working day (`shipments.pickup_scheduled_for`).
- [ ] Batching: din ke saare pending shipments ke liye ek pickup + manifest call (repeat job `PICKUP_BATCH` cut-off time par) — per-order request sirf fallback.
- [ ] Success → `pickup_token`, manifest PDF private R2 (`manifest_key`) → `transitionOrder(PACKED → PICKUP_SCHEDULED)`.
- [ ] Manifest partner desk par print/share ke liye available (Phase 7).

### 6.8 Shipment Cancellation (Admin cancel)
- [ ] Admin cancel (Phase 9 UI) jab order `AWAITING_PACKING` / `PACKED` / `PICKUP_SCHEDULED` me ho → transaction me `transitionOrder(... → CANCELLED)` + stock release (`07` §3) + refund enqueue, phir commit ke baad `SHIPROCKET_CANCEL_SHIPMENT` (AWB cancel).
- [ ] AWB cancel fail → `ops_issue` + admin alert (courier pickup na kare isliye partner ko bhi notify).

### 6.9 Shiprocket Tracking Webhook (`POST /api/v1/webhooks/shiprocket`, D-35)
- [ ] Auth: header `x-api-key` === `SHIPROCKET_WEBHOOK_TOKEN` (constant-time compare). Mismatch → `401`.
- [ ] Dedup: `event_id = sha256(awb + current_status + event_timestamp)` → `INSERT INTO webhook_events ... ON CONFLICT DO NOTHING`; already processed → `200`.
- [ ] Payload Zod-parse; AWB se `shipments` lookup; unknown AWB → `last_error` + `200` + admin alert.
- [ ] `tracking_events` me insert (`source = 'WEBHOOK'`, `ON CONFLICT (shipment_id, status_text, event_time) DO NOTHING`), `shipments.last_status_*` update.
- [ ] Status mapping `packages/shared/src/logistics/shiprocketStatusMap.ts` (`07` §5). ⚠️ Shiprocket numeric `shipment_status_id` list official docs se verify karke finalize.
- [ ] **Out-of-order rule:** mapped transition allowed map me nahi hai → sirf event store, order status unchanged.
- [ ] Transitions ke side-effects: `IN_TRANSIT` (`shipped_at`), `DELIVERED` (`delivered_at`), notifications enqueue (Phase 8 templates).
- [ ] Business errors par `200` (Shiprocket retry storm avoid), sirf infra error par `5xx`.
- [ ] Shiprocket dashboard me webhook URL + token register karna (staging + prod alag).

### 6.10 Polling Fallback (`POLL_TRACKING`, every 3 hr)
- [ ] Active shipments (`PICKUP_SCHEDULED` … `RTO_IN_TRANSIT`) batches me `trackByAwb` → same processing function as webhook (`source = 'POLL'`).
- [ ] Rate-limit friendly: concurrency 2, jitter.
- [ ] Shipment `PICKUP_SCHEDULED` me 48h se zyada → admin alert ("pickup missed").

### 6.11 NDR & RTO Basics
- [ ] `DELIVERY_FAILED` → admin NDR queue (Phase 9 tab) + customer notification `delivery_attempt_failed` (Phase 8).
- [ ] NDR action (reattempt / address update) abhi **manual** Shiprocket panel se; automation `ndr_actions` table ke saath v2.
- [ ] `RTO_IN_TRANSIT` / `RTO_DELIVERED` → admin alert; `RTO_DELIVERED` par **no restock** (D-31) — status log me note; refund policy Q-04 ke hisaab se admin manually trigger karega.
- [ ] `rto_freight_paise` capture (settlements D-41).

### 6.12 Cost Tracking & Wallet
- [ ] `charged_weight_g` aur actual `freight_paise` webhook/billing data se update → **weight discrepancy** (charged > declared + 10%) par admin flag.
- [ ] `CHECK_WALLET_BALANCE` (hourly): balance < `settings.shiprocket_wallet_min_paise` → admin alert (wallet khatam = AWB fail).

### 6.13 Tests
- [ ] Shiprocket client ke liye **recorded fixtures** (sanitized JSON, `test/fixtures/shiprocket/`) + `nock`/`msw` interceptors — CI me real API call nahi.
- [ ] Integration (Testcontainers PG + Redis): create-order job happy path, retry after 503, idempotent re-run, dead-letter → `ops_issue`.
- [ ] Webhook tests: bad token 401, duplicate event, out-of-order event, unknown AWB.

---

## 🚫 Out of Scope
- NDR automated actions, reship for lost parcels, multi-box shipments → v2 backlog.
- COD remittance reconciliation → v2 (D-25).
- Partner packing UI → Phase 7. Customer tracking UI + notification sending → Phase 8. Admin cancel/retry UI → Phase 9.

---

## 🔍 Verification Checklist
- [ ] Sandbox/test order: payment confirm ke baad order **`AWAITING_PACKING`** me, `awb_code` + `label_key` set (`shiprocket.createOrder.int.test.ts`).
- [ ] Same `SHIPROCKET_CREATE_ORDER` job do baar run → ek hi Shiprocket order + ek hi AWB (idempotency test).
- [ ] Simulated Shiprocket 503 → retry with backoff → success; 5 failures → `ops_issue` set + admin alert enqueued.
- [ ] Token expire simulate → auto-refresh, koi job fail nahi.
- [ ] Label URL bina auth `401`; signed URL 5 min baad expire.
- [ ] Label PDF barcode courier scanner / phone barcode app se readable (manual).
- [ ] Webhook: wrong `x-api-key` → 401; duplicate payload → ek hi `tracking_events` row; `DELIVERED` ke baad `IN_TRANSIT` → status unchanged.
- [ ] Poll fallback webhook band karke bhi status update kar deta hai.
- [ ] Pickup after cut-off → `pickup_scheduled_for` = next working day.
- [ ] Admin cancel at `PACKED` → AWB cancelled, stock released, refund job queued.
- [ ] 1 × 250g SKU ka computed dead weight ≤ 500g (ya warning logged).

---

## ✅ Definition of Done
Migration 0004 applied + reversible; worker process deployable separately; poora CONFIRMED → PICKUP_SCHEDULED → DELIVERED path sandbox me automated; webhook + poll dono tested; har permanent failure admin ko visible; `tsc --noEmit`, lint, saare tests green.
