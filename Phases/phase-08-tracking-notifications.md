# 🔔 Phase 8: Customer Order Tracking (`/track`) & Notifications

> [!IMPORTANT]
> **Read first:** `Rules/00-project-rules.md` · `architecture/08-decisions-log.md` · `architecture/07-order-state-machine.md` · `architecture/01-database-schema-models.md`
> **Depends on:** Phase 0 (WhatsApp templates approved), Phase 5, Phase 6, Phase 7  ·  **Migration:** — (uses `0005_notifications.sql`)

---

## 🎯 Objective
Customer ka trust aur delight maximize karna. Iske liye do cheezein chahiye:
- Privacy-safe live tracking page jo kitchen se doorstep tak ki kahani dikhaye.
- Reliable, deduplicated notifications (WhatsApp primary, SMS fallback), customer, partner aur admin teeno ke liye.

Har message `notifications_log` me traceable hoga.

---

## 📋 Granular Tasks & Checklist

### 8.1 Public Tracking API (`POST /api/v1/track`, D-39)
- [ ] Zod: `{ orderCode: /^PK-[0-9A-HJKMNP-TV-Z]{6}$/, phone: 10-digit Indian mobile }` — **dono required**. Sirf phone se lookup nahi.
- [ ] Rate limit: 10 requests / 10 min per IP + per orderCode; mismatch par generic "Order not found" (enumeration se bachne ke liye same response).
- [ ] Response (**no PII** beyond first name + city):
  ```json
  {
    "orderCode": "PK-7KQ2M9",
    "customerFirstName": "Arun",
    "destinationCity": "Chennai",
    "status": "IN_TRANSIT",
    "items": [{ "title": "Himachali Chicken Pickle", "netWeightG": 250, "quantity": 1,
                "batchCode": "PK-2610-CHK250-01", "manufacturedAt": "2026-10-04" }],
    "courier": { "name": "Delhivery", "awb": "…", "trackingUrl": "…" },
    "etd": "2026-10-14",
    "timeline": [ { "key": "BOTTLED", "label": "Bottled in Himachal", "at": "2026-10-04" }, "…" ]
  }
  ```
- [ ] **Timeline merge:** `order_status_logs` (internal milestones) + `tracking_events` (courier scans) → time-sorted, customer-friendly labels:
  | Source | Label |
  | :--- | :--- |
  | Batch `manufactured_at` | 🏔️ Bottled in Himachal (batch code + date) |
  | `CONFIRMED` | ✅ Order confirmed |
  | `PACKED` | 📦 Airtight packed & sealed |
  | `IN_TRANSIT` (first) | 🚚 Handed to courier |
  | courier scans | 📍 In transit — <hub city> |
  | `OUT_FOR_DELIVERY` | 🛵 Out for delivery |
  | `DELIVERED` | 🏡 Delivered |
  | `DELIVERY_FAILED` | ⚠️ Delivery attempt failed — help CTA |
  | `CANCELLED` / refund | ↩️ Cancelled · refund status |
- [ ] Response cache: Redis 60s per order (webhook processing par invalidate).

### 8.2 Tracking Page (`apps/storefront/src/app/track/page.tsx`)
- [ ] Form: Order code + phone (`/order/[orderCode]` page aur WhatsApp link se `?code=` prefill; phone hamesha user type kare).
- [ ] Vertical stepper (mobile) / horizontal (desktop), semantic tokens (`--success`, `--warning`, `--info`) — koi hardcoded color nahi.
- [ ] Courier AWB + "Track on courier site" link, ETD.
- [ ] WhatsApp support CTA: *"Parcel ke baare me help chahiye? Chat with us"* (pre-filled order code).
- [ ] Skeleton loaders, error/empty states, `noindex` meta.

### 8.3 My Orders (OTP-logged-in customers, D-18)
- [ ] `GET /api/v1/me/orders` (paginated) + `GET /api/v1/me/orders/:orderCode` — `requireAuth`, `user_id` **ya** verified phone = `customer_phone` (guest orders bhi OTP login ke baad dikhein).
- [ ] Storefront `/account/orders` list + detail (same timeline component).

### 8.4 Notification Service (`apps/backend/src/modules/notifications/`)
- [ ] Provider interface:
  ```typescript
  interface MessageProvider {
    sendTemplate(input: { to: string; template: string; language: 'en' | 'hi'; variables: Record<string, string> }):
      Promise<{ providerMessageId: string }>;
  }
  ```
  Implementations: `WhatsAppCloudProvider` / BSP (D-38 decision ke hisaab se), `SmsProvider` (MSG91, DLT templates), `MockProvider` (dev/test — log only).
- [ ] Flow: `notify` queue job → `notifications_log` row (`QUEUED`) → WhatsApp send → fail (non-retryable / user not on WhatsApp) → SMS fallback (critical templates only) → status update.
- [ ] **Dedup:** `jobId = notify:<template>:<orderId>` (`07` §6) — same template same order par dobara nahi.
- [ ] **Quiet hours** (non-critical only, e.g. digest/marketing): 9 PM – 8 AM IST delay. Transactional (confirmed, OFD, delivered) turant.
- [ ] Provider delivery-status webhook: `POST /api/v1/webhooks/whatsapp` (signature verify per provider docs) → `notifications_log.status` (`SENT` / `DELIVERED` / `READ` / `FAILED`).
- [ ] Phone numbers E.164; PII logs me mask.

### 8.5 Templates (approved in Phase 0)
| Template | Audience | Trigger |
| :--- | :--- | :--- |
| `order_confirmed` | Customer | → `CONFIRMED` (order code, items, track link) |
| `order_shipped` | Customer | → `IN_TRANSIT` (courier, AWB, ETD) |
| `out_for_delivery` | Customer | → `OUT_FOR_DELIVERY` |
| `delivered_storage_tip` | Customer | → `DELIVERED` (*"Thandi jagah rakhein, hamesha sookha chammach use karein 🏔️"*) |
| `delivery_attempt_failed` | Customer | → `DELIVERY_FAILED` (reattempt / address update help link) |
| `order_cancelled` | Customer | → `CANCELLED` (+ refund ETA if paid) |
| `refund_processed` | Customer | `refunds.status = PROCESSED` |
| `new_order_alert` | Partner | → `CONFIRMED` (push primary, Phase 7) |
| `order_cancelled_partner` | Partner | → `CANCELLED` from `AWAITING_PACKING` / `PACKED` ("Pack mat karein") |
| `packing_digest` | Partner | Daily 9 AM |
| `admin_alert` | Admin | `ops_issue`, NDR, RTO, LOST, webhook failure, Shiprocket wallet low, stock ledger mismatch |

- [ ] Hindi + English variants jahan zaroori; variables named (`{{order_code}}`), template registry `packages/shared/src/notifications/templates.ts`.

### 8.6 Consent & Admin Alert Channel
- [ ] Checkout par **WhatsApp updates opt-in** checkbox (**default unchecked** — DPDP ke hisaab se consent affirmative hona chahiye, pre-ticked nahi; clearly labelled) → `orders.whatsapp_opt_in` + `whatsapp_opt_in_at` (architecture/01); opt-out → sirf SMS critical.
- [ ] Admin alert channel: WhatsApp (admin numbers) + email fallback; alerts batched (same type within 10 min → one message with count) taaki spam na ho.

---

## 🚫 Out of Scope
- Marketing broadcasts, abandoned-cart recovery, review requests → v2.
- NDR self-service address update form → v2 (abhi support chat).

---

## 🔍 Verification Checklist
- [ ] `/api/v1/track` sirf code + sahi phone par data deta hai; galat phone → same generic 404 (`track.int.test.ts`).
- [ ] 11th request in 10 min → `429`.
- [ ] Response me full address / full phone / email nahi (snapshot test).
- [ ] Timeline webhook events ke saath correct order me merge hota hai (fixture test).
- [ ] Status change ke baad WhatsApp message < 10s (staging, real number).
- [ ] Same webhook do baar → ek hi `order_shipped` message (`notifications.dedupe.int.test.ts`).
- [ ] WhatsApp failure → SMS fallback logged in `notifications_log`.
- [ ] Quiet-hours rule digest ko delay karta hai, `out_for_delivery` ko nahi.
- [ ] `/track` page 375 / 768 / 1440 par bina horizontal overflow; light + dark tokens.

---

## ✅ Definition of Done
Customer WhatsApp link se order track kar sakta hai bina login; saare templates approved aur staging me real devices par deliver hote hain; partner/admin alerts wired; har message `notifications_log` me audit-able.
