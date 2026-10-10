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
- [ ] Partner routes `apps/admin` me `/desk/*`, `requireRole(['KITCHEN_PARTNER', 'ADMIN'])`.
- [ ] **Data scoping:** har partner query `user_pickup_locations` se filter — partner sirf apne kitchen ke orders/batches dekhe. API: `/api/v1/partner/*`.
- [ ] Partner ko **kabhi nahi** dikhega: revenue dashboard, customer list, settings, expenses edit, ad data. Order card par sirf: order code, items, customer **first name + city** (label par full address already printed hai).

### 7.2 PWA Setup
- [ ] Web App Manifest (name, icons, `display: standalone`, theme color token se derived), "Add to Home Screen" prompt UI.
- [ ] Service worker (Vite PWA plugin ya Workbox): app shell cache, offline fallback page.
- [ ] **Offline action queue:** "Mark Packed" offline me tap hua → IndexedDB queue → online aate hi retry (Background Sync jahan supported, warna app open par flush). UI me "⏳ Sync pending" badge.
- [ ] App update prompt (new service worker available → "Refresh").

### 7.3 Web Push + WhatsApp Fallback (`new_order_alert`)
- [ ] VAPID keys (env), `POST /api/v1/partner/push-subscriptions` (subscribe), `DELETE` (unsubscribe).
- [ ] Order `CONFIRMED` par `notify` queue → partner ke saare subscriptions par push ("🆕 Naya order PK-7KQ2M9 — 2 jars"). Expired subscription (`410`) → row delete.
- [ ] Push fail / koi subscription nahi → WhatsApp `new_order_alert` fallback (Phase 8 provider; yahan sirf job wiring). iOS par push sirf installed PWA me kaam karta hai — onboarding screen me guide.
- [ ] Har send `notifications_log` me.
- [ ] **Daily 9:00 AM IST digest** (repeat job): "Aaj N orders pack karne hain" — sirf jab N > 0.

### 7.4 i18n & Accessibility
- [ ] Hindi (default for partner) + English toggle; strings `locales/hi.json`, `locales/en.json` — koi hardcoded UI string nahi.
- [ ] Touch targets **≥ 44×44px**, primary buttons full-width, high-contrast semantic tokens (koi hardcoded color nahi), font size ≥ 16px.
- [ ] Ek screen = ek kaam; no nested dropdowns.

### 7.5 Packing Queue (`/desk`)
- [ ] `GET /api/v1/partner/orders?status=AWAITING_PACKING` (oldest first) — header: *"🏔️ Aaj ke orders — 5 pack karne hain"*.
- [ ] Order card: bada order code (`#PK-7KQ2M9`), items with **allocated batch codes** (`PK-2610-CHK250-01`) taaki sahi jar uthaya jaye, packing deadline (pickup cut-off D-36).
- [ ] **Packing checklist** (SOP `05` se, tick karna mandatory before Mark Packed enable):
  - [ ] Sahi batch ka jar (batch code match)
  - [ ] Jar weigh kiya (net weight ✓)
  - [ ] Cap tight + foam/induction seal check
  - [ ] Shrink band heat-sealed
  - [ ] 2–3 layer bubble wrap, box shake test (jar hile nahi)
  - [ ] Label + FRAGILE / THIS SIDE UP sticker lagaya
- [ ] Checklist state local (per order) save — app band hone par bhi rahe.
- [ ] Empty state: "Sab orders pack ho gaye 🎉" + skeleton loaders while fetching.

### 7.6 Label Printing (D-37)
- [ ] `[ 🖨️ Label Print karein ]` → `GET /api/v1/partner/orders/:orderCode/label` → signed URL (5 min) → PDF browser print dialog me open.
- [ ] `[ 📲 Label Share karein ]` → Web Share API (file share) → WhatsApp / printer app; unsupported browser par download fallback.
- [ ] **A4 4-up fallback:** multiple selected orders ke labels ek A4 PDF me (cyber cafe print) — `GET /api/v1/partner/labels/a4?orders=...` server-side merge.
- [ ] Pickup manifest (Phase 6) bhi isi screen se print/share.
- [ ] ❌ Web Bluetooth direct thermal printing scope me nahi.

### 7.7 Mark Packed (AWAITING_PACKING → PACKED)
- [ ] `POST /api/v1/partner/orders/:orderCode/mark-packed` — `Idempotency-Key` header (offline retries safe).
- [ ] Server: transaction me `transitionOrder(AWAITING_PACKING → PACKED, actor: KITCHEN_PARTNER, actorId)` → commit → `SHIPROCKET_SCHEDULE_PICKUP` enqueue (Phase 6).
- [ ] Already `PACKED` → `200` (idempotent), cancelled order → clear message "Ye order cancel ho chuka hai — pack mat karein".
- [ ] UI: TanStack Query optimistic removal + undo-free (state change irreversible for partner), card slide-out animation.

### 7.8 Mobile Batch Logger (D-42)
- [ ] `POST /api/v1/batches` (shared endpoint, partner scoped to own kitchen) — 3 fields: Product (big buttons: Chicken / Mutton / Fish × 250g/500g), Jars produced, Total cost (₹ → paise), optional mfg date (default today), notes.
- [ ] Server generates batch code `PK-<YYMM>-<SKU>-<seq>`, `expiry_date = manufactured_at + products.shelf_life_days`, `pickup_location_id` = partner ka kitchen, `PRODUCTION` movement (+qty) same transaction me.
- [ ] Success screen: batch code bada dikhao (dater stamp ke liye) + "Copy".
- [ ] `GET /api/v1/batches` — apne kitchen ke active batches, stock left, expiry badge.

### 7.9 Settlements Nav (placeholder)
- [ ] Bottom nav me "Hisaab / Settlements" item reserve — actual read-only statements + Acknowledge **Phase 9** me (D-40). Abhi "Jaldi aa raha hai".

---

## 🚫 Out of Scope
- Settlement pages → Phase 9. Customer-facing notifications → Phase 8.
- Native app, Bluetooth printing → not planned. Multi-kitchen routing logic → v2 (data model ready hai).

---

## 🔍 Verification Checklist
- [ ] Playwright (375px, 414px): queue → checklist → print → mark packed flow; horizontal overflow zero (`desk.e2e.ts`).
- [ ] Low-end Android (real device) + Chrome DevTools "Fast 4G" throttling: queue first load < 3s, label opens < 2s.
- [ ] PWA install hota hai (Android Chrome + iOS Safari Add to Home Screen); offline me app shell khulta hai.
- [ ] Offline Mark Packed → online aane par exactly ek transition (`order_status_logs` me 1 row).
- [ ] New order par push 10s ke andar; push subscription na ho toh WhatsApp fallback enqueue.
- [ ] Partner A doosre kitchen ke order/batch nahi dekh sakta (`partner.scope.int.test.ts` → 404).
- [ ] Partner token se `/api/v1/admin/*` → 403; revenue/customer endpoints inaccessible.
- [ ] Batch logger: 50-jar batch < 30 seconds me log; batch code format + ledger movement correct.
- [ ] Hindi/English toggle saari screens par; koi untranslated string nahi (i18n lint).
- [ ] Mark Packed button checklist complete hone tak disabled.

---

## ✅ Definition of Done
Partner real phone par PWA install karke ek test order receive (push), pack checklist, label print/share aur Mark Packed kar sakta hai — bina kisi training ke. Scope/role tests green; responsive + i18n checks pass.
