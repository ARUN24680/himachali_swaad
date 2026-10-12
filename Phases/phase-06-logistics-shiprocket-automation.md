# 🚚 Phase 6: Shiprocket, AWB, Labels, Pickup, Tracking Webhooks & NDR Basics

> [!IMPORTANT]
> **Read first:** `Rules/00-project-rules.md` · `architecture/08-decisions-log.md` · `architecture/07-order-state-machine.md` · `architecture/01-database-schema-models.md`
> **UI work:** `Rules/00-project-rules.md` §1.5 **Design Reference Policy** follow karo — Stitch design sirf reference hai, better bana sakte ho to banao. UI tasks **`ui-developer` agent** (`.claude/agents/ui-developer.md`) se.
> **Depends on:** Phase 1, Phase 5  ·  **Migration:** `0004_logistics.sql`

---

## 🎯 Objective
Order `CONFIRMED` hote hi delivery pipeline poori tarah automatic chalni chahiye: Shiprocket order create karna, courier select karna, AWB lena, label PDF **private R2** me save karna, aur order ko `AWAITING_PACKING` me le jana. Uske baad pickup schedule karna, tracking webhooks aur polling se status sync karna, aur NDR/RTO ka basic handling. Ek bhi order silently drop nahi hona chahiye: har permanent failure `ops_issue` set karke admin ko alert karega.

---

## 📋 Granular Tasks & Checklist

### 6.1 Migration & Worker Infrastructure
- [x] `0004_logistics.sql` apply karo (`shipments`, `tracking_events`) — `dbmate up` + `dbmate down` round-trip CI me.
  > ⏳ Local: `Phases/evidence/phase-06/migration-0004-roundtrip.log` (dbmate up → down → up) + `apps/backend/tests/integration/migration-0004.test.ts`. CI: PR #8 "Migrations up → down → up (PostgreSQL 17)" ✅ run 38228402872.
- [x] `apps/backend/src/worker.ts` entrypoint (D-06) — HTTP server se alag process.
  > Evidence: `Phases/evidence/phase-06/worker-separate-process.log` + `live-order-PK-23K2NF.log` (API aur worker alag process; worker ne booking + label kiya).
- [x] BullMQ queues (shared Redis connection, `maxRetriesPerRequest: null`):
  > Evidence: `apps/backend/src/jobs/queues.ts`, `jobs.test.ts`. Deviation (D-53 c): queue `cron` (doc 02), phase file ka `maintenance` nahi; `FETCH_AND_STORE_LABEL` → `documents`; `PICKUP_BATCH` cron add.
  | Queue | Jobs |
  | :--- | :--- |
  | `orders` | `SHIPROCKET_CREATE_ORDER`, `SHIPROCKET_SCHEDULE_PICKUP`, `SHIPROCKET_CANCEL_SHIPMENT` |
  | `documents` | `GENERATE_INVOICE`, `FETCH_AND_STORE_LABEL` |
  | `notify` | Phase 8 templates (yahan sirf enqueue hook) |
  | `payments` | `INITIATE_REFUND` (Phase 5 se) |
  | `maintenance` | repeat jobs: `EXPIRE_RESERVATIONS`, `RECONCILE_CONFIRMED`, `POLL_TRACKING`, `CHECK_WALLET_BALANCE` |
- [x] **Deterministic `jobId`** har job par (`ship:<orderId>`, `label:<orderId>`, `pickup:<orderId>`, `cancel-ship:<orderId>`) → duplicate enqueue = no-op (`07` §4.2).
  > Evidence: `apps/backend/tests/integration/shiprocket-create-order.test.ts` (`label-<id>`, `alert-…-<id>`), `courier-webhook.test.ts` (`notify-order_shipped-<id>`). `:` → `-` (D-52).
- [x] Retry policy: `attempts: 5`, `backoff: { type: 'exponential', delay: 30_000 }`. Sirf retryable errors retry hon (network, 5xx, 429). 4xx validation errors turant fail.
  > Evidence: `apps/backend/tests/integration/shiprocket-create-order.test.ts` › "503 twice → retried … 422 → no retry" (real BullMQ workers, `jobs/runner.ts` `toJobError`), `tests/unit/shiprocket-client.test.ts` (error classes).
- [x] **Dead-letter handling:** final failure par `orders.ops_issue = '<JOB>: <error>'`, `shipments.last_error` update, `booking_attempts++`, admin alert enqueue. Admin "Retry booking" button (Phase 9) same `jobId` se re-enqueue karega.
  > Evidence: same test (5 × 503 → `ops_issue`, `booking_attempts = 5`, `last_error`, `ADMIN_ALERT`) + "AWB cancel dead letter". Retry button = Phase 9 (completed job ko pehle `job.retry()` / remove karna hoga — same id re-add no-op hai).
- [x] Worker graceful shutdown (`SIGTERM` → `worker.close()`), concurrency config env se.
  > Evidence: `worker-separate-process.log` last line (`SIGTERM` → "worker shutting down: finish active jobs" → `worker.close()`); `WORKER_CONCURRENCY` env (`tests/unit/shipping-config.test.ts`).

### 6.2 Shiprocket API Client (`apps/backend/src/integrations/shiprocket/client.ts`)
- [x] Base URL `https://apiv2.shiprocket.in/v1/external/` — ⚠️ endpoint paths aur payload fields Shiprocket ke **current official API docs** se verify karke likhna (yahan sirf method contract hai).
  > Paths/fields: Shiprocket public API docs (apidocs.shiprocket.in → Postman "Shiprocket API" collection). Fixtures doc samples se (`apps/backend/tests/fixtures/shiprocket/README.md`) — staging account aane par re-record.
- [x] Token management: `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD` (API user) se login, token Redis me (`shiprocket:token`) TTL ke saath, **expiry se pehle refresh**. Concurrent refresh ke liye Redis lock (`SET NX PX`). `401` aaye toh ek baar force-refresh + retry.
  > Evidence: `tests/unit/shiprocket-client.test.ts` (cache 9 d, Bearer, 401 → one re-login), `shiprocket-create-order.test.ts` › "expired token".
- [x] Typed methods (har response Zod se parse):
  > Evidence: `tests/unit/shiprocket-client.test.ts` › fixtures. `getCourierRates` = `checkServiceability` (pickup/delivery/weight params), alag method nahi.
  - `checkServiceability({ pickupPincode, deliveryPincode, weightKg, cod: false })`
  - `createOrder(payload)` → `{ shiprocketOrderId, shipmentId }`
  - `getCourierRates(shipmentId)` → list (rate, rating, ETD, courier id)
  - `assignAwb(shipmentId, courierId)` → `{ awb, courierName }`
  - `generateLabel(shipmentIds)` → label URL
  - `generatePickup(shipmentIds)` / `generateManifest(shipmentIds)`
  - `cancelShipment(awbs)` / `cancelOrder(ids)`
  - `trackByAwb(awb)`
  - `getWalletBalance()`
- [x] Har outbound call: timeout (10s), structured log (pino) **bina PII** ke, Sentry breadcrumb.
  > Evidence: `client.ts` (10 s `withTimeout`, pino `{endpoint,status,ms}` only, `reporter.breadcrumb`); `worker-separate-process.log` me koi PII nahi.
- [ ] Shiprocket me pickup location pehle register + verify honi chahiye; `pickup_locations.shiprocket_pickup_name` usi nickname se match kare (Phase 0 prerequisite).

### 6.3 Pincode Serviceability (`POST /api/v1/shipping/check-pincode`)
- [x] Zod: `{ pincode: /^[1-9][0-9]{5}$/ }`.
  > Existing `PincodeCheckRequestSchema` (Phase 4).
- [x] Redis cache `svc:<pickupPincode>:<pincode>` (TTL 24h; non-serviceable result TTL 6h).
  > Evidence: `apps/backend/tests/integration/courier-webhook.test.ts` › "check-pincode via Shiprocket" (key `pk:svc:<origin>:<pin>`, 24 h / 6 h, down = not cached).
- [x] Response: `{ serviceable, estimatedDays, couriers: number }` — courier names customer ko dikhane ki zaroorat nahi.
  > Deviation (D-53 j): Phase 4 contract rakha `{ pincode, serviceable: boolean | null, estimatedDays, courierHint: null }` — courier names/count nahi dikhate.
- [x] Rate limit per IP (e.g. 30 / min). Shiprocket down → `serviceable: null` + "We'll confirm at checkout" (checkout block nahi hoga).
  > Evidence: route `rateLimit 30/min` (`shipping.routes.ts`); down → null test above; UI `Phases/evidence/phase-06/pincode-unknown-{pdp,checkout}-{375,768,1440}-{light,dark}.png`, `apps/storefront/tests/e2e/phase6-evidence.spec.ts` (checkout not blocked).

### 6.4 Package Weight & Box Rules (D-33, D-34)
- [x] Weight/dimensions `products.packed_weight_g` + `package_*_cm` se aayenge — kahin hardcode nahi.
  > Evidence: `logistics.repository.ts` `listItemPackaging`; live log `dead_weight_g 730` (CHK500 product row).
- [x] Multi-jar box rules `packages/shared/src/logistics/boxRules.ts` me config table:
  > `packages/shared/src/logistics/box-rules.ts` (kebab-case, D-53 k). 2 / 3–4 jar boxes **PROVISIONAL** (Phase 0 procurement), > 4 → `OVERSIZE_PARCEL` ops issue.
  | Jars (250g-equivalent) | Box | Notes |
  | :--- | :--- | :--- |
  | 1 | 15 × 10 × 10 cm (standard) | D-33 |
  | 2 | TBD (Phase 0 procurement) | |
  | 3–4 | TBD | |
  | > 4 | Split into multiple boxes → v2 (abhi single shipment, admin alert) | |
- [x] Dead weight = Σ packed_weight + extra box overhead; volumetric = L×B×H / 5000 — dono log karo, Shiprocket ko actual dimensions bhejo.
  > Evidence: worker log "parcel computed" `{deadWeightG, volumetricWeightG}`; `shipments.volumetric_weight_g`.
- [x] Unit test: 1 × 250g SKU ka computed weight **≤ 500g** target ke against warn (D-34).
  > Evidence: `packages/shared/tests/logistics.test.ts` › computeParcel.

### 6.5 `SHIPROCKET_CREATE_ORDER` Job (CONFIRMED → AWAITING_PACKING)
- [x] Guard: order `status = 'CONFIRMED'` aur `payment_status = 'PAID'` nahi hai toh job no-op.
  > Evidence: `apps/backend/tests/integration/shiprocket-create-order.test.ts` › "no-op for an order that is not CONFIRMED + PAID".
- [x] Idempotency: `shipments` row pehle se hai aur `awb_code` set hai → sirf label step continue karo; `shiprocket_order_id` hai lekin AWB nahi → create skip, AWB step se resume.
  > Evidence: same file › "running the job twice (and resuming after a crash)". Gap: crash *between* Shiprocket create and our DB save can create a duplicate Shiprocket order (no lookup API used yet) — D-53.
- [x] Payload: `order_id = order_code`, `pickup_location = shiprocket_pickup_name`, customer address snapshot (`orders.shipping_address`), line items (sku, name, units, selling price in rupees from paise), `payment_method: 'Prepaid'`, sub_total, dimensions/weight (6.4), invoice number agar available.
  > Evidence: happy-path test (sandbox sees order code, pickup nickname, 0.48 kg).
- [x] Courier selection (configurable via `settings`): filter → `rating >= settings.min_courier_rating`, ETD ≤ `settings.max_courier_etd_days`; sort by `rate ASC`, tie → faster ETD. Fallback: agar filter ke baad koi nahi bacha toh cheapest available + admin note.
  > Evidence: `selectCourier` unit cases + happy path (rating 3.2 courier skipped). Fallback → `COURIER_FALLBACK` ops issue.
- [x] Assign AWB → `shipments` update (`awb_code`, `courier_name`, `courier_company_id`, `freight_paise`, `etd`).
  > Evidence: happy path + live log (`awb_code`, `courier_name`, `freight_paise 6250`, `etd`).
- [x] Enqueue `FETCH_AND_STORE_LABEL`.
  > Evidence: happy path (`label-<orderId>`).
- [x] Har external call ke baad **short transaction** me DB update (D-30) — kabhi API call transaction ke andar nahi.
  > Code review: `logistics.service.ts` — Shiprocket calls outside `db.transaction`; transactions only for label/pickup/tracking writes.

### 6.6 Label Storage (D-11, D-37)
- [x] `FETCH_AND_STORE_LABEL`: Shiprocket se label PDF download → **private** R2 bucket key `labels/<orderCode>.pdf` → `shipments.label_key`.
  > Evidence: happy path (`labels/<code>.pdf`), live `.uploads-private/labels/PK-23K2NF.pdf`.
- [x] Phir transaction: `transitionOrder(CONFIRMED → AWAITING_PACKING, actor: SYSTEM)`.
  > Evidence: status log assertion + live log (`CONFIRMED → AWAITING_PACKING SYSTEM`).
- [x] Signed URL endpoint: `GET /api/v1/partner/orders/:orderCode/label` aur `GET /api/v1/admin/orders/:orderCode/label` → 302 to R2 signed URL (TTL 5 min). Har access `admin_audit_log` me (`LABEL_VIEW`).
  > Evidence: `apps/backend/tests/integration/shiprocket-create-order.test.ts` › labels (401, partner/admin 200, other kitchen 404, `LABEL_VIEW` audit, link dead after 5 min). Deviation (D-53 d): JSON `{ url, expiresAt }` (doc 02), 302 nahi.
- [ ] Label format 4×6 inch thermal; A4 4-up fallback Phase 7 me client-side.

### 6.7 Pickup Scheduling & Manifest (D-36)
- [x] `PACKED` transition (Phase 7) → `SHIPROCKET_SCHEDULE_PICKUP` enqueue.
  > Done in Phase 7: `apps/backend/tests/integration/packing-desk.test.ts` › mark packed enqueues `pickup-<orderId>`.
- [x] Cut-off: `pickup_cutoff_hour_ist` (default 11). Cut-off se pehle packed → same-day pickup request; baad me → next working day (`shipments.pickup_scheduled_for`).
  > Evidence: `apps/backend/tests/integration/shiprocket-create-order.test.ts` › "packed before the 11:00 IST cut-off …" + `packages/shared/tests/logistics.test.ts` › pickupDateFor.
- [x] Batching: din ke saare pending shipments ke liye ek pickup + manifest call (repeat job `PICKUP_BATCH` cut-off time par) — per-order request sirf fallback.
  > Evidence: "batch: nothing before the cut-off; after it ONE pickup + manifest" (`PICKUP_BATCH` every 15 min).
- [x] Success → `pickup_token`, manifest PDF private R2 (`manifest_key`) → `transitionOrder(PACKED → PICKUP_SCHEDULED)`.
  > Evidence: same test (`pickup_token`, `manifest_key manifests/<date>-…`, `PICKUP_SCHEDULED`).
- [x] Manifest partner desk par print/share ke liye available (Phase 7).
  > Done in Phase 7: `GET /partner/manifests` (`packing-desk.test.ts`) + desk Pickup tab (`Phases/evidence/phase-07/desk-pickup-manifests-375-*`).

### 6.8 Shipment Cancellation (Admin cancel)
- [x] Admin cancel (Phase 9 UI) jab order `AWAITING_PACKING` / `PACKED` / `PICKUP_SCHEDULED` me ho → transaction me `transitionOrder(... → CANCELLED)` + stock release (`07` §3) + refund enqueue, phir commit ke baad `SHIPROCKET_CANCEL_SHIPMENT` (AWB cancel).
  > Evidence: `apps/backend/tests/integration/shiprocket-create-order.test.ts` › "cancel at PACKED" + "cancelled while the booking job was mid-flight" (cancel from `CONFIRMED` bhi cancel job enqueue karta hai, D-53 i).
- [x] AWB cancel fail → `ops_issue` + admin alert (courier pickup na kare isliye partner ko bhi notify).
  > Evidence: › "AWB cancel dead letter" (`AWB_CANCEL_FAILED` alert). Partner ko message Phase 8 bhejega.

### 6.9 Shiprocket Tracking Webhook (`POST /api/v1/webhooks/shiprocket`, D-35)
- [x] Auth: header `x-api-key` === `SHIPROCKET_WEBHOOK_TOKEN` (constant-time compare). Mismatch → `401`.
  > Evidence: `apps/backend/tests/integration/courier-webhook.test.ts` › "wrong or missing x-api-key → 401". Route `/webhooks/courier-tracking` (D-53 a — Shiprocket URL me "shiprocket"/"sr"/"kr" reject karta hai).
- [x] Dedup: `event_id = sha256(awb + current_status + event_timestamp)` → `INSERT INTO webhook_events ... ON CONFLICT DO NOTHING`; already processed → `200`.
  > Evidence: › "first scan → IN_TRANSIT … same payload twice → one tracking row" (`attempts = 2`).
- [x] Payload Zod-parse; AWB se `shipments` lookup; unknown AWB → `last_error` + `200` + admin alert.
  > Evidence: › "unknown AWB → 200 business_error".
- [x] `tracking_events` me insert (`source = 'WEBHOOK'`, `ON CONFLICT (shipment_id, status_text, event_time) DO NOTHING`), `shipments.last_status_*` update.
  > Evidence: tracking rows assertions; older event doesn't overwrite `last_status_text`.
- [x] Status mapping `packages/shared/src/logistics/shiprocketStatusMap.ts` (`07` §5). ⚠️ Shiprocket numeric `shipment_status_id` list official docs se verify karke finalize.
  > `packages/shared/src/logistics/shiprocket-status-map.ts` — text-first + ids from Shiprocket public docs status table; `packages/shared/tests/logistics.test.ts`. Re-check ids against the account panel (D-53 h).
- [x] **Out-of-order rule:** mapped transition allowed map me nahi hai → sirf event store, order status unchanged.
  > Evidence: › "DELIVERED then a late IN_TRANSIT".
- [x] Transitions ke side-effects: `IN_TRANSIT` (`shipped_at`), `DELIVERED` (`delivered_at`), notifications enqueue (Phase 8 templates).
  > Evidence: `shipped_at`/`delivered_at` asserts + `ORDER_STATUS_NOTIFY` jobs (sending = Phase 8).
- [x] Business errors par `200` (Shiprocket retry storm avoid), sirf infra error par `5xx`.
  > Evidence: unknown AWB / empty ping → 200; infra error rethrown (5xx).
- [ ] Shiprocket dashboard me webhook URL + token register karna (staging + prod alag).
  > Needs the account: URL `https://<api-host>/api/v1/webhooks/courier-tracking`, token = `SHIPROCKET_WEBHOOK_TOKEN`.

### 6.10 Polling Fallback (`POLL_TRACKING`, every 3 hr)
- [x] Active shipments (`PICKUP_SCHEDULED` … `RTO_IN_TRANSIT`) batches me `trackByAwb` → same processing function as webhook (`source = 'POLL'`).
  > Evidence: `apps/backend/tests/integration/courier-webhook.test.ts` › "with no webhook at all the poll moves the order".
- [x] Rate-limit friendly: concurrency 2, jitter.
  > `pollTracking` (2 loops, random jitter ≤ 500 ms).
- [x] Shipment `PICKUP_SCHEDULED` me 48h se zyada → admin alert ("pickup missed").
  > Evidence: › "poll records the charged weight … 48 h without a scan → pickup missed".

### 6.11 NDR & RTO Basics
- [x] `DELIVERY_FAILED` → admin NDR queue (Phase 9 tab) + customer notification `delivery_attempt_failed` (Phase 8).
  > Evidence: › "NDR → DELIVERY_FAILED" (`notify-delivery_attempt_failed-<id>`, `alert-DELIVERY_FAILED-<id>`). NDR tab = Phase 9, sending = Phase 8.
- [x] NDR action (reattempt / address update) abhi **manual** Shiprocket panel se; automation `ndr_actions` table ke saath v2.
  > No code by design (manual Shiprocket panel).
- [x] `RTO_IN_TRANSIT` / `RTO_DELIVERED` → admin alert; `RTO_DELIVERED` par **no restock** (D-31) — status log me note; refund policy Q-04 ke hisaab se admin manually trigger karega.
  > Evidence: same test (no stock movement, status log "no restock (D-31)", ops_issue Q-04). D-31 wording fixed (D-53 f).
- [ ] `rto_freight_paise` capture (settlements D-41).

### 6.12 Cost Tracking & Wallet
- [x] `charged_weight_g` aur actual `freight_paise` webhook/billing data se update → **weight discrepancy** (charged > declared + 10%) par admin flag.
  > Evidence: › "poll records the charged weight" (`WEIGHT_DISCREPANCY`). Source = tracking API `weight`; Shiprocket billing/weight-dispute data not wired yet (D-53 l). `freight_paise` = chosen courier rate at booking.
- [x] `CHECK_WALLET_BALANCE` (hourly): balance < `settings.shiprocket_wallet_min_paise` → admin alert (wallet khatam = AWB fail).
  > Evidence: `apps/backend/tests/integration/shiprocket-create-order.test.ts` › wallet.

### 6.13 Tests
- [x] Shiprocket client ke liye **recorded fixtures** (sanitized JSON, `test/fixtures/shiprocket/`) + `nock`/`msw` interceptors — CI me real API call nahi.
  > Evidence: `apps/backend/tests/fixtures/shiprocket/*.json` + `tests/unit/shiprocket-client.test.ts` (injected `fetch` in place of nock/msw, D-53 b); integration uses the sandbox on an ephemeral port. No real API call in CI.
- [x] Integration (Testcontainers PG + Redis): create-order job happy path, retry after 503, idempotent re-run, dead-letter → `ops_issue`.
  > Evidence: `shiprocket-create-order.test.ts` (14 tests).
- [x] Webhook tests: bad token 401, duplicate event, out-of-order event, unknown AWB.
  > Evidence: `courier-webhook.test.ts` (10 tests).

---

## 🚫 Out of Scope
- NDR automated actions, reship for lost parcels, multi-box shipments → v2 backlog.
- COD remittance reconciliation → v2 (D-25).
- Partner packing UI → Phase 7. Customer tracking UI + notification sending → Phase 8. Admin cancel/retry UI → Phase 9.

---

## 🔍 Verification Checklist
- [x] Sandbox/test order: payment confirm ke baad order **`AWAITING_PACKING`** me, `awb_code` + `label_key` set (`shiprocket.createOrder.int.test.ts`).
  > Evidence: `apps/backend/tests/integration/shiprocket-create-order.test.ts` › happy path (file name differs from `shiprocket.createOrder.int.test.ts`) + live dev run `Phases/evidence/phase-06/live-order-PK-23K2NF.log` against the **Shiprocket sandbox stand-in** (D-53 b). Real Shiprocket account run pending credentials.
- [x] Same `SHIPROCKET_CREATE_ORDER` job do baar run → ek hi Shiprocket order + ek hi AWB (idempotency test).
  > Evidence: › "running the job twice".
- [x] Simulated Shiprocket 503 → retry with backoff → success; 5 failures → `ops_issue` set + admin alert enqueued.
  > Evidence: › "503 twice → retried with backoff → booked; 5 × 503 → ops_issue …".
- [x] Token expire simulate → auto-refresh, koi job fail nahi.
  > Evidence: › "expired token → one forced re-login".
- [x] Label URL bina auth `401`; signed URL 5 min baad expire.
  > Evidence: › labels "401 without auth … link expires".
- [ ] Label PDF barcode courier scanner / phone barcode app se readable (manual).
- [x] Webhook: wrong `x-api-key` → 401; duplicate payload → ek hi `tracking_events` row; `DELIVERED` ke baad `IN_TRANSIT` → status unchanged.
  > Evidence: `courier-webhook.test.ts` (401, duplicate, out-of-order tests).
- [x] Poll fallback webhook band karke bhi status update kar deta hai.
  > Evidence: › "with no webhook at all the poll moves the order".
- [x] Pickup after cut-off → `pickup_scheduled_for` = next working day.
  > Evidence: › "packed before the 11:00 IST cut-off …".
- [x] Admin cancel at `PACKED` → AWB cancelled, stock released, refund job queued.
  > Evidence: › "cancel at PACKED".
- [x] 1 × 250g SKU ka computed dead weight ≤ 500g (ya warning logged).
  > Evidence: `packages/shared/tests/logistics.test.ts` (480 g ≤ 500 g; 520 g → warning).

---

## ✅ Definition of Done
Migration 0004 applied + reversible; worker process deployable separately; poora CONFIRMED → PICKUP_SCHEDULED → DELIVERED path sandbox me automated; webhook + poll dono tested; har permanent failure admin ko visible; `tsc --noEmit`, lint, saare tests green.
