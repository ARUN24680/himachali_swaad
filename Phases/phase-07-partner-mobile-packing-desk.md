# 📱 Phase 7: Kitchen Partner Packing Desk (PWA)

> [!IMPORTANT]
> **Read first:** `Rules/00-project-rules.md` · `architecture/08-decisions-log.md` · `architecture/07-order-state-machine.md` · `architecture/01-database-schema-models.md` · `architecture/05-logistics-packaging-sop.md`
> **UI work:** `Rules/00-project-rules.md` §1.5 **Design Reference Policy** follow karo — Stitch design sirf reference hai, better bana sakte ho to banao. UI tasks **`ui-developer` agent** (`.claude/agents/ui-developer.md`) se.
> **Depends on:** Phase 2, Phase 3, Phase 6  ·  **Migration:** `0005_notifications.sql`

---

## 🎯 Objective
Himachal kitchen partner ke liye ek ultra-simple, mobile-first **installable PWA** (D-16) banana. Partner computer nahi, smartphone use karega. Ismein ye sab hoga:
- naye order ka push alert
- Hindi/English packing checklist
- 1-tap label print/share
- "Mark Packed" button
- 30-second batch logging

Kahin bhi technical complexity nahi, aur partner ko confidential business data nahi dikhega (D-40).

---

## 📋 Granular Tasks & Checklist

### 7.1 Migration & Access Scope
- [ ] `0005_notifications.sql` apply (`push_subscriptions`, `notifications_log`).
  > Local: `Phases/evidence/phase-07/migration-0005-roundtrip.log` (up → down → up) + `apps/backend/tests/integration/migration-0005.test.ts`. CI migrations job → PR par tick.
- [x] Partner routes `apps/admin` me `/desk/*`, `requireRole(['KITCHEN_PARTNER', 'ADMIN'])`.
  > `apps/admin/src/app/router/index.tsx` (`/desk`, `/desk/pack/:orderCode`, `/desk/batches`, `/desk/hisaab`, `/desk/settings`, RoleGuard `packing:operate`); API `/api/v1/partner/*` whole prefix `requireAuth` + `KITCHEN_PARTNER|ADMIN` (D-54 g).
- [x] **Data scoping:** har partner query `user_pickup_locations` se filter — partner sirf apne kitchen ke orders/batches dekhe. API: `/api/v1/partner/*`.
  > `apps/backend/tests/integration/packing-desk.test.ts` › "partner sees only their kitchen's queue", "another kitchen's order → 404"; batches scope: `batches.test.ts` (Phase 3, D-49 c).
- [x] Partner ko **kabhi nahi** dikhega: revenue dashboard, customer list, settings, expenses edit, ad data. Order card par sirf: order code, items, customer **first name + city** (label par full address already printed hai).
  > `apps/backend/tests/integration/packing-desk.test.ts` asserts no phone / address / surname / prices in the card JSON; desk UI has no revenue/customer/settings screens (`Phases/evidence/phase-07/desk-*`).

### 7.2 PWA Setup
- [x] Web App Manifest (name, icons, `display: standalone`, theme color token se derived), "Add to Home Screen" prompt UI.
  > `apps/admin/src/pwa/build/pwa-plugin.ts` emits `manifest.webmanifest` (standalone, icons 192/512/maskable); theme colour from `src/pwa/brand-colors.ts` (`pk-allow-color`, build fails if it drifts from `globals.css`, D-51 pattern); install prompt in Settings (`desk-settings-*`).
- [x] Service worker (Vite PWA plugin ya Workbox): app shell cache, offline fallback page.
  > Hand-written `src/pwa/sw.js` (app shell precache 70 files, network-first pages → `/offline.html`, no API caching). Verified with `vite preview` + Playwright: SW controls page, offline app shell boots `/desk`. Gap: cold start offline stops at the session check (follow-up in `requirement/pending-requirements.md`).
- [x] **Offline action queue:** "Mark Packed" offline me tap hua → IndexedDB queue → online aate hi retry (Background Sync jahan supported, warna app open par flush). UI me "⏳ Sync pending" badge.
  > `apps/admin/src/modules/packing-desk/offline/*` (IndexedDB outbox keyed by Idempotency-Key, Background Sync + flush on open/online, "⏳ Sync pending"); `apps/admin/tests/e2e/desk.spec.ts` › offline mark packed (one successful POST, same key); `Phases/evidence/phase-07/desk-offline-sync-pending-*`.
- [x] App update prompt (new service worker available → "Refresh").
  > `src/pwa/register.ts` — new SW waits for "Naya version — Refresh" tap (no auto reload on first install).

### 7.3 Web Push + WhatsApp Fallback (`new_order_alert`)
- [x] VAPID keys (env), `POST /api/v1/partner/push-subscriptions` (subscribe), `DELETE` (unsubscribe).
  > Env `VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT` (`tests/unit/shipping-config.test.ts`); `apps/backend/tests/integration/packing-desk.test.ts` › subscribe / unsubscribe / not configured.
- [x] Order `CONFIRMED` par `notify` queue → partner ke saare subscriptions par push ("🆕 Naya order PK-7KQ2M9 — 2 jars"). Expired subscription (`410`) → row delete.
  > `PARTNER_NEW_ORDER_ALERT` enqueued on confirm (`payments.test.ts` job ids); `apps/backend/tests/integration/packing-desk.test.ts` › "new-order alert pushed (encrypted, logged SENT) … 410 → subscription deleted".
- [x] Push fail / koi subscription nahi → WhatsApp `new_order_alert` fallback (Phase 8 provider; yahan sirf job wiring). iOS par push sirf installed PWA me kaam karta hai — onboarding screen me guide.
  > `apps/backend/tests/integration/packing-desk.test.ts` › "partner without any subscription → WhatsApp fallback enqueued" + "push not configured" (`WHATSAPP_SEND`, sender = Phase 8). iOS install guide in Settings.
- [x] Har send `notifications_log` me.
  > `apps/backend/tests/integration/packing-desk.test.ts` asserts `notifications_log` rows (SENT / FAILED with reason).
- [x] **Daily 9:00 AM IST digest** (repeat job): "Aaj N orders pack karne hain" — sirf jab N > 0.
  > `PARTNER_DAILY_DIGEST` cron `0 9 * * *` IST; `apps/backend/tests/integration/packing-desk.test.ts` › "daily digest: only kitchens with orders to pack, once per day".

### 7.4 i18n & Accessibility
- [x] Hindi (default for partner) + English toggle; strings `locales/hi.json`, `locales/en.json` — koi hardcoded UI string nahi.
  > Hindi default + English toggle (`pk-desk-lang`); strings in `apps/admin/src/i18n/{hi,en}/desk.json` (structure doc 09 §3.3, not phase file's `locales/` — D-54 note); `pnpm --filter @pk/admin check:i18n` (in `lint`).
- [x] Touch targets **≥ 44×44px**, primary buttons full-width, high-contrast semantic tokens (koi hardcoded color nahi), font size ≥ 16px.
  > `apps/admin/tests/e2e/desk.spec.ts` asserts touch targets ≥ 44px; semantic tokens only (`pnpm check:colors`); text ≥ 16px except 14px status chips / nav labels (deviation noted).
- [x] Ek screen = ek kaam; no nested dropdowns.
  > Separate screens: queue, pack order, batch, hisaab, settings (`Phases/evidence/phase-07/desk-*`).

### 7.5 Packing Queue (`/desk`)
- [x] `GET /api/v1/partner/orders?status=AWAITING_PACKING` (oldest first) — header: *"🏔️ Aaj ke orders — 5 pack karne hain"*.
  > `apps/backend/tests/integration/packing-desk.test.ts` › queue (oldest first, `toPack`); header "🏔️ Aaj ke orders — N pack karne hain" (`Phases/evidence/phase-07/desk-queue-*`).
- [x] Order card: bada order code (`#PK-7KQ2M9`), items with **allocated batch codes** (`PK-2610-CHK250-01`) taaki sahi jar uthaya jaye, packing deadline (pickup cut-off D-36).
  > Card: order code, items + allocated batch codes, `packBy` (red when late), courier/AWB (`Phases/evidence/phase-07/desk-queue-375-*`).
- [x] **Packing checklist** (SOP `05` se, tick karna mandatory before Mark Packed enable):
  > 6 SOP items; `apps/admin/tests/e2e/desk.spec.ts` › Mark Packed disabled until all 6; server rejects partial checklist (`apps/backend/tests/integration/packing-desk.test.ts`).
  - [x] Sahi batch ka jar (batch code match)
  - [x] Jar weigh kiya (net weight ✓)
  - [x] Cap tight + foam/induction seal check
  - [x] Shrink band heat-sealed
  - [x] 2–3 layer bubble wrap, box shake test (jar hile nahi)
  - [x] Label + FRAGILE / THIS SIDE UP sticker lagaya
- [x] Checklist state local (per order) save — app band hone par bhi rahe.
  > `apps/admin/tests/e2e/desk.spec.ts` › ticks survive reload (local store per order).
- [x] Empty state: "Sab orders pack ho gaye 🎉" + skeleton loaders while fetching.
  > `Phases/evidence/phase-07/desk-queue-empty-375-light.png`, `desk-queue-loading-375-light.png`.

### 7.6 Label Printing (D-37)
- [x] `[ 🖨️ Label Print karein ]` → `GET /api/v1/partner/orders/:orderCode/label` → signed URL (5 min) → PDF browser print dialog me open.
  > `apps/admin/tests/e2e/desk.spec.ts` › label print opens the signed PDF (popup-blocked → "Open label" link).
- [x] `[ 📲 Label Share karein ]` → Web Share API (file share) → WhatsApp / printer app; unsupported browser par download fallback.
  > `apps/admin/tests/e2e/desk.spec.ts` › share passes the PDF file; download fallback. Needs R2 CORS GET rule for the admin origin in prod (pending-requirements).
- [x] **A4 4-up fallback:** multiple selected orders ke labels ek A4 PDF me (cyber cafe print) — `GET /api/v1/partner/labels/a4?orders=...` server-side merge.
  > `apps/backend/tests/integration/packing-desk.test.ts` › "A4 4-up: 5 labels → 2 A4 pages"; UI multi-select `Phases/evidence/phase-07/desk-a4-select-375-*`.
- [x] Pickup manifest (Phase 6) bhi isi screen se print/share.
  > `GET /partner/manifests` (`apps/backend/tests/integration/packing-desk.test.ts` › manifests); UI Pickup tab `Phases/evidence/phase-07/desk-pickup-manifests-375-*`.
- [x] ❌ Web Bluetooth direct thermal printing scope me nahi.
  > Not built by design (D-37).

### 7.7 Mark Packed (AWAITING_PACKING → PACKED)
- [x] `POST /api/v1/partner/orders/:orderCode/mark-packed` — `Idempotency-Key` header (offline retries safe).
  > `apps/backend/tests/integration/packing-desk.test.ts` › "needs the Idempotency-Key and all six checklist ticks".
- [x] Server: transaction me `transitionOrder(AWAITING_PACKING → PACKED, actor: KITCHEN_PARTNER, actorId)` → commit → `SHIPROCKET_SCHEDULE_PICKUP` enqueue (Phase 6).
  > `apps/backend/tests/integration/packing-desk.test.ts` › "AWAITING_PACKING → PACKED … exactly one transition" (actor KITCHEN_PARTNER, `pickup-<orderId>` enqueued).
- [x] Already `PACKED` → `200` (idempotent), cancelled order → clear message "Ye order cancel ho chuka hai — pack mat karein".
  > `apps/backend/tests/integration/packing-desk.test.ts` › "cancelled order → 409 ORDER_CANCELLED"; UI message `Phases/evidence/phase-07/desk-cancelled-order-375-light.png`.
- [x] UI: TanStack Query optimistic removal + undo-free (state change irreversible for partner), card slide-out animation.
  > `apps/admin/tests/e2e/desk.spec.ts` › card removed + count drops; `Phases/evidence/phase-07/desk-mark-packed-success-375-*`.

### 7.8 Mobile Batch Logger (D-42)
- [x] `POST /api/v1/batches` (shared endpoint, partner scoped to own kitchen) — 3 fields: Product (big buttons: Chicken / Mutton / Fish × 250g/500g), Jars produced, Total cost (₹ → paise), optional mfg date (default today), notes.
  > Existing `POST /api/v1/batches` (partner-scoped, Phase 3); mobile logger `Phases/evidence/phase-07/desk-batch-form-375-light.png`.
- [x] Server generates batch code `PK-<YYMM>-<SKU>-<seq>`, `expiry_date = manufactured_at + products.shelf_life_days`, `pickup_location_id` = partner ka kitchen, `PRODUCTION` movement (+qty) same transaction me.
  > Phase 3 server logic (`batches.test.ts`: code format, expiry, PRODUCTION movement).
- [x] Success screen: batch code bada dikhao (dater stamp ke liye) + "Copy".
  > `Phases/evidence/phase-07/desk-batch-success-*` (big code + Copy).
- [x] `GET /api/v1/batches` — apne kitchen ke active batches, stock left, expiry badge.
  > "Mera stock" `Phases/evidence/phase-07/desk-batch-stock-375-dark.png`.

### 7.9 Settlements Nav (placeholder)
- [x] Bottom nav me "Hisaab / Settlements" item reserve — actual read-only statements + Acknowledge **Phase 9** me (D-40). Abhi "Jaldi aa raha hai".
  > `/desk/hisaab` "Jaldi aa raha hai" placeholder.

---

## 🚫 Out of Scope
- Settlement pages → Phase 9. Customer-facing notifications → Phase 8.
- Native app, Bluetooth printing → not planned. Multi-kitchen routing logic → v2 (data model ready hai).

---

## 🔍 Verification Checklist
- [x] Playwright (375px, 414px): queue → checklist → print → mark packed flow; horizontal overflow zero (`desk.e2e.ts`).
  > `apps/admin/tests/e2e/desk.spec.ts` (375 + 414 mobile project, 768/1440 sanity; no-overflow asserted). Admin e2e 103 passed. Name `desk.spec.ts` (repo convention).
- [ ] Low-end Android (real device) + Chrome DevTools "Fast 4G" throttling: queue first load < 3s, label opens < 2s.
  > Needs a real low-end Android device.
- [ ] PWA install hota hai (Android Chrome + iOS Safari Add to Home Screen); offline me app shell khulta hai.
  > SW + manifest + offline app shell verified in `vite preview`; real Android/iOS install pending (device).
- [x] Offline Mark Packed → online aane par exactly ek transition (`order_status_logs` me 1 row).
  > Server: `apps/backend/tests/integration/packing-desk.test.ts` › 3 parallel + later replay with the same key → 1 PACKED log row. Client: `apps/admin/tests/e2e/desk.spec.ts` › offline mark packed → exactly one successful POST.
- [ ] New order par push 10s ke andar; push subscription na ho toh WhatsApp fallback enqueue.
  > Push send + WhatsApp fallback tested (`apps/backend/tests/integration/packing-desk.test.ts`); "within 10 s on a real phone" needs VAPID keys + device.
- [x] Partner A doosre kitchen ke order/batch nahi dekh sakta (`partner.scope.int.test.ts` → 404).
  > `apps/backend/tests/integration/packing-desk.test.ts` › scope tests (named `packing-desk.test.ts`, not `partner.scope.int.test.ts`).
- [x] Partner token se `/api/v1/admin/*` → 403; revenue/customer endpoints inaccessible.
  > `apps/backend/tests/integration/packing-desk.test.ts` › partner → admin cancel / settings 403.
- [x] Batch logger: 50-jar batch < 30 seconds me log; batch code format + ledger movement correct.
  > `apps/admin/tests/e2e/desk.spec.ts` › batch logger 50 jars < 30 s (automated); real partner timing still pending (Phase 3 item).
- [x] Hindi/English toggle saari screens par; koi untranslated string nahi (i18n lint).
  > `apps/admin/tests/e2e/desk.spec.ts` › toggle on all 6 desk screens; `check:i18n` (205 keys, raw-string check).
- [x] Mark Packed button checklist complete hone tak disabled.
  > `apps/admin/tests/e2e/desk.spec.ts` › disabled until all 6.

---

## ✅ Definition of Done
Partner real phone par PWA install karke ek test order receive (push), pack checklist, label print/share aur Mark Packed kar sakta hai — bina kisi training ke. Scope/role tests green; responsive + i18n checks pass.
