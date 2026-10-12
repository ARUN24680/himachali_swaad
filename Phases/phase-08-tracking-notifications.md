# 🔔 Phase 8: Customer Order Tracking (`/track`) & Notifications

> [!IMPORTANT]
> **Read first:** `Rules/00-project-rules.md` · `architecture/08-decisions-log.md` · `architecture/07-order-state-machine.md` · `architecture/01-database-schema-models.md`
> **UI work:** `Rules/00-project-rules.md` §1.5 **Design Reference Policy** follow karo — Stitch design sirf reference hai, better bana sakte ho to banao. UI tasks **`ui-developer` agent** (`.claude/agents/ui-developer.md`) se.
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
- [x] Zod: `{ orderCode: /^PK-[0-9A-HJKMNP-TV-Z]{6}$/, phone: 10-digit Indian mobile }` — **dono required**. Sirf phone se lookup nahi.
  > `packages/shared/src/contracts/tracking.ts` — both required; phone 10-digit or +91 (normalised, D-55 a); `apps/backend/tests/integration/track.test.ts` › 400 on bad phone.
- [x] Rate limit: 10 requests / 10 min per IP + per orderCode; mismatch par generic "Order not found" (enumeration se bachne ke liye same response).
  > `apps/backend/tests/integration/track.test.ts` › "11th lookup … per IP → 429; … per order code → 429"; same 404 body for wrong phone and unknown code.
- [x] Response (**no PII** beyond first name + city):
  > `apps/backend/tests/integration/track.test.ts` › privacy snapshot (keys + no phone/address/email/pincode). Shape per phase file (D-55 a).
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
- [x] **Timeline merge:** `order_status_logs` (internal milestones) + `tracking_events` (courier scans) → time-sorted, customer-friendly labels:
  > `apps/backend/tests/integration/track.test.ts` › "timeline merges bottling + our milestones + courier scans" (first transit scan folded into handover, D-55 c).
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
- [x] Response cache: Redis 60s per order (webhook processing par invalidate).
  > 60 s Redis, key = order + shipment `updated_at` → webhook invalidates automatically (D-55 b); `apps/backend/tests/integration/track.test.ts` › "cached for 60 s, but a courier webhook shows up immediately".

### 8.2 Tracking Page (`apps/storefront/src/app/track/page.tsx`)
- [x] Form: Order code + phone (`/order/[orderCode]` page aur WhatsApp link se `?code=` prefill; phone hamesha user type kare).
  > `apps/storefront/tests/e2e/track.spec.ts` (`?code` prefill, phone never in URL); `/order/[code]` links to `/track?code=`.
- [x] Vertical stepper (mobile) / horizontal (desktop), semantic tokens (`--success`, `--warning`, `--info`) — koi hardcoded color nahi.
  > `apps/storefront/src/modules/tracking/components/JourneyTimeline.tsx` (vertical < 1024 px, horizontal ≥ 1024, tone tokens); `apps/storefront/tests/e2e/track.spec.ts` asserts layout; `pnpm check:colors`.
- [x] Courier AWB + "Track on courier site" link, ETD.
  > `Phases/evidence/phase-08/track-in-transit-*` (AWB copy, "Track on courier site", ETD band).
- [x] WhatsApp support CTA: *"Parcel ke baare me help chahiye? Chat with us"* (pre-filled order code).
  > `src/lib/whatsapp.ts` from `NEXT_PUBLIC_SELLER_WHATSAPP` (wa.me + pre-filled order code), verified on a build with a test number (`Phases/evidence/phase-08/track-whatsapp-cta-mobile-375-light.png`); falls back to /contact while the number is unset (pending-requirements).
- [x] Skeleton loaders, error/empty states, `noindex` meta.
  > `Phases/evidence/phase-08/track-*` skeleton / not-found / rate-limited / empty states; `noindex` asserted in `apps/storefront/tests/e2e/track.spec.ts`.

### 8.3 My Orders (OTP-logged-in customers, D-18)
- [x] `GET /api/v1/me/orders` (paginated) + `GET /api/v1/me/orders/:orderCode` — `requireAuth`, `user_id` **ya** verified phone = `customer_phone` (guest orders bhi OTP login ke baad dikhein).
  > `apps/backend/tests/integration/track.test.ts` › My Orders (own + guest-with-verified-phone, other customer 404, 401/403).
- [x] Storefront `/account/orders` list + detail (same timeline component).
  > `apps/storefront/tests/e2e/account-orders.spec.ts`; `Phases/evidence/phase-08/my-orders-*`.

### 8.4 Notification Service (`apps/backend/src/modules/notifications/`)
- [x] Provider interface:
  > `apps/backend/src/integrations/messaging/{provider,mock,whatsapp-cloud,msg91-sms}.ts`; `tests/unit/messaging-providers.test.ts` (Cloud API payload + error mapping, MSG91 flow). BSP adapter not built — Q-06 still open (pending-requirements).
  ```typescript
  interface MessageProvider {
    sendTemplate(input: { to: string; template: string; language: 'en' | 'hi'; variables: Record<string, string> }):
      Promise<{ providerMessageId: string }>;
  }
  ```
  Implementations: `WhatsAppCloudProvider` / BSP (D-38 decision ke hisaab se), `SmsProvider` (MSG91, DLT templates), `MockProvider` (dev/test — log only).
- [x] Flow: `notify` queue job → `notifications_log` row (`QUEUED`) → WhatsApp send → fail (non-retryable / user not on WhatsApp) → SMS fallback (critical templates only) → status update.
  > `messages.service.ts`; `apps/backend/tests/integration/notifications.test.ts` › "not on WhatsApp → FAILED WhatsApp row + SMS fallback … retryable error retries first".
- [x] **Dedup:** `jobId = notify:<template>:<orderId>` (`07` §6) — same template same order par dobara nahi.
  > Job id `notify-<template>-<orderId>` + log dedup; `apps/backend/tests/integration/notifications.test.ts` › "the same courier webhook twice → ONE order_shipped", "second run is deduped".
- [x] **Quiet hours** (non-critical only, e.g. digest/marketing): 9 PM – 8 AM IST delay. Transactional (confirmed, OFD, delivered) turant.
  > `quietHoursRelease()` (`packages/shared/tests/notifications.test.ts`); `apps/backend/tests/integration/notifications.test.ts` › "quiet hours: packing_digest at 22:00 IST is held till 08:00 (job moved to delayed), out_for_delivery still goes".
- [x] Provider delivery-status webhook: `POST /api/v1/webhooks/whatsapp` (signature verify per provider docs) → `notifications_log.status` (`SENT` / `DELIVERED` / `READ` / `FAILED`).
  > `whatsapp-webhook.routes.ts` (GET challenge, X-Hub-Signature-256); `apps/backend/tests/integration/notifications.test.ts` › delivery receipts (401 bad sig, monotonic READ).
- [x] Phone numbers E.164; PII logs me mask.
  > All phones E.164; logs use `maskPhone()` (`+91******5678`) in `messages.service.ts` / mock provider.

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

- [x] Hindi + English variants jahan zaroori; variables named (`{{order_code}}`), template registry `packages/shared/src/notifications/templates.ts`.
  > `packages/shared/src/notifications/templates.ts` (en + hi, named `{{vars}}`, critical / quietHours flags); `packages/shared/tests/notifications.test.ts`. Meta / DLT approval of these templates = Phase 0 (B-11).

### 8.6 Consent & Admin Alert Channel
- [x] Checkout par **WhatsApp updates opt-in** checkbox (**default unchecked** — DPDP ke hisaab se consent affirmative hona chahiye, pre-ticked nahi; clearly labelled) → `orders.whatsapp_opt_in` + `whatsapp_opt_in_at` (architecture/01); opt-out → sirf SMS critical.
  > Done in Phase 5: `apps/storefront/src/modules/checkout/lib/checkout-form.ts` `whatsappOptIn: false` default, stored in `orders.whatsapp_opt_in(_at)`; Phase 8 sends WhatsApp only with it (`notifications.test.ts` › no consent).
- [x] Admin alert channel: WhatsApp (admin numbers) + email fallback; alerts batched (same type within 10 min → one message with count) taaki spam na ho.
  > `apps/backend/tests/integration/notifications.test.ts` › admin alerts (first now, one summary with count after 10 min, e-mail fallback). E-mail is a log driver until a provider is chosen (pending-requirements).

---

## 🚫 Out of Scope
- Marketing broadcasts, abandoned-cart recovery, review requests → v2.
- NDR self-service address update form → v2 (abhi support chat).

---

## 🔍 Verification Checklist
- [x] `/api/v1/track` sirf code + sahi phone par data deta hai; galat phone → same generic 404 (`track.int.test.ts`).
  > `apps/backend/tests/integration/track.test.ts` (named `track.test.ts`).
- [x] 11th request in 10 min → `429`.
  > `apps/backend/tests/integration/track.test.ts` › 429 test.
- [x] Response me full address / full phone / email nahi (snapshot test).
  > `apps/backend/tests/integration/track.test.ts` › privacy snapshot.
- [x] Timeline webhook events ke saath correct order me merge hota hai (fixture test).
  > `apps/backend/tests/integration/track.test.ts` › timeline merge (real courier webhooks via the sandbox).
- [ ] Status change ke baad WhatsApp message < 10s (staging, real number).
  > Needs WhatsApp Cloud API credentials + approved templates + a staging number (Q-06). Automated part: payment → `ORDER_CONFIRMED` job → mock WhatsApp send, and the live dev run (`PK-MBX42R` → `order_confirmed` SENT within ~1 s).
- [x] Same webhook do baar → ek hi `order_shipped` message (`notifications.dedupe.int.test.ts`).
  > `apps/backend/tests/integration/notifications.test.ts` (named `notifications.test.ts`).
- [x] WhatsApp failure → SMS fallback logged in `notifications_log`.
  > `apps/backend/tests/integration/notifications.test.ts` › FAILED WhatsApp + SENT SMS rows.
- [x] Quiet-hours rule digest ko delay karta hai, `out_for_delivery` ko nahi.
  > `apps/backend/tests/integration/notifications.test.ts` › quiet hours test.
- [x] `/track` page 375 / 768 / 1440 par bina horizontal overflow; light + dark tokens.
  > `apps/storefront/tests/e2e/track.spec.ts` overflow asserted at 375/768/1440; `Phases/evidence/phase-08/track-*-{375,768,1440}-{light,dark}.png`.

---

## ✅ Definition of Done
Customer WhatsApp link se order track kar sakta hai bina login; saare templates approved aur staging me real devices par deliver hote hain; partner/admin alerts wired; har message `notifications_log` me audit-able.
