# 🗺️ Pahadi Khatki — Project Phases Master Roadmap (Phase 0 → 10)

> [!IMPORTANT]
> **Yeh file sequencing ka SINGLE SOURCE OF TRUTH hai.** `architecture/06-step-by-step-build-roadmap.md` sirf ek short summary hai jo yahin point karti hai — conflict ho toh yeh file jeetegi.
> **Read first (har phase se pehle):** `Rules/00-project-rules.md` · `architecture/08-decisions-log.md` · `architecture/07-order-state-machine.md` · `architecture/01-database-schema-models.md`

---

## 🧭 How to Use These Files (Humans + AI Agents)

1. Kisi bhi phase ko start karne se pehle upar ke 4 docs padho. Phase file unke against likhi gayi hai — conflict mile toh **`08-decisions-log.md` jeetta hai**, aur phase file ko fix karo.
2. **Saare checklists unchecked (`- [ ]`) se start hote hain.** Koi item tabhi tick hoga jab uska **evidence** ho: passing test ka naam, CI run link, screenshot (375/768/1440), ya PR link. Bina evidence ke `[x]` = review reject.
3. Phase N tabhi start hoga jab uske **Depends on** phases ka **Definition of Done** poora ho. Phase 0 exception hai — woh non-code track hai aur **Day 1 se parallel** chalta hai.
4. Har phase me jo migration bani hai woh **`packages/database/migrations/`** me commit hoti hai aur dobara kabhi edit nahi hoti.
5. **UI wala har kaam** `Rules/00-project-rules.md` §1.5 (Design Reference Policy) ke hisaab se aur **`ui-developer` agent** (`.claude/agents/ui-developer.md`) se hoga — Stitch design reference hai, spec nahi; better ban sake toh better banao.
6. "🚫 Out of Scope" section batata hai kaunsa kaam kis phase me move hua — usse pehle mat banao.

---

## 🗂️ Phases Breakdown

| Phase File | Module | Scope & Deliverables | Depends On | Migration |
| :--- | :--- | :--- | :--- | :--- |
| **[phase-00-prerequisites-decisions.md](./phase-00-prerequisites-decisions.md)** | **Phase 0: Business Prerequisites, Compliance & Decisions** | FSSAI, GST, legal entity, Razorpay/Shiprocket KYC, WhatsApp/DLT approvals, shelf-life lab test, packaging trial, OPEN/PROPOSED decisions close karna. **Parallel non-code track.** | — | — |
| **[phase-01-monorepo-core-db.md](./phase-01-monorepo-core-db.md)** | **Phase 1: Monorepo, Infra, CI, Testing, DB Foundation & Design Tokens** | pnpm + Turborepo, 3 apps + 4 packages, Docker Compose (PG 17 + Redis), env validation, logging, Sentry, CI, Vitest + Testcontainers, `db.ts`, dbmate, Tailwind v4 tokens, response envelope. | — | `0001_foundation.sql` |
| **[phase-02-auth-rbac-sessions.md](./phase-02-auth-rbac-sessions.md)** | **Phase 2: Auth, RBAC & Sessions** | Customer OTP (optional login), staff email + password, rotating refresh tokens, `requireAuth` / `requireRole`, partner location scoping, audit log, seed staff. | 1 | — |
| **[phase-03-product-catalog-inventory.md](./phase-03-product-catalog-inventory.md)** | **Phase 3: Catalog, Batches, Inventory Ledger + Minimal Admin Catalog UI** | Products (250g/500g groups), batch entry with server batch codes, stock ledger, sellable shelf-life rule, image upload, minimal admin product/batch UI. | 1, 2 | `0002_catalog_inventory.sql` |
| **[phase-04-customer-storefront-cart.md](./phase-04-customer-storefront-cart.md)** | **Phase 4: Storefront, Cart, Legal Pages, SEO & Analytics** | Next.js 16 storefront, Zustand cart + server quote, product pages with compliance info, legal pages (Razorpay KYC), SEO, GA4 + Meta Pixel/CAPI, pincode check. | 3 | — |
| **[phase-05-checkout-payment-webhooks.md](./phase-05-checkout-payment-webhooks.md)** | **Phase 5: Checkout, Stock Reservation, Payments, Webhooks, Refunds & Invoices** | `createOrder` + reservation, `confirmPayment` (verify + webhook), sweepers, `transitionOrder`, refunds, GST invoices. | 2, 3, 4 | `0003_orders_payments.sql` |
| **[phase-06-logistics-shiprocket-automation.md](./phase-06-logistics-shiprocket-automation.md)** | **Phase 6: Shiprocket, AWB, Labels, Pickup, Tracking Webhooks & NDR basics** | Shiprocket client, auto booking, private label PDFs, pickup scheduling, tracking webhook + polling, status mapping, NDR/RTO basics. | 5 | `0004_logistics.sql` |
| **[phase-07-partner-mobile-packing-desk.md](./phase-07-partner-mobile-packing-desk.md)** | **Phase 7: Kitchen Partner Packing Desk PWA** | Mobile-first packing queue, label print/share, mark packed, mobile batch logger, push alerts, Hindi + English. | 3, 6 | `0005_notifications.sql` |
| **[phase-08-tracking-notifications.md](./phase-08-tracking-notifications.md)** | **Phase 8: Customer /track & Notifications** | `/track` (order code + phone), WhatsApp/SMS templates per transition, `notifications_log`, My Orders. | 6, 7 | — |
| **[phase-09-admin-operations-settlements.md](./phase-09-admin-operations-settlements.md)** | **Phase 9: Admin Operations, Reports & Settlements** | Full admin dashboard, orders table, cancel/refund UI, NDR/RTO queue, settings, reports/exports, expenses, settlements + partner statement view. | 5, 6, 8 | `0006_settlements.sql` |
| **[phase-10-hardening-launch.md](./phase-10-hardening-launch.md)** | **Phase 10: Hardening, E2E Simulation & Go-Live** | Security headers, admin 2FA, load/chaos tests, backups/restore drill, physical shipping trial, live keys, go-live runbook. | 0, 1–9 | — |

---

## 🔀 Phase Flow

```text
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │ PHASE 0 — Business prerequisites & decisions  (parallel, Day 1 se, non-code) │
 │ FSSAI · GST · Entity · Razorpay KYC · Shiprocket KYC · WhatsApp/DLT · Lab    │
 └───────┬───────────────────────┬──────────────────────┬───────────────────────┘
         │ (decisions)           │ (Razorpay KYC needs  │ (live keys, approvals)
         ▼                       │  legal pages → P4)   │
 ┌──────────────┐   ┌──────────┐ │ ┌─────────────────┐  │
 │ P1 Foundation├──▶│ P2 Auth  ├─┼▶│ P3 Catalog +    │  │
 │ (0001)       │   │ & RBAC   │ │ │ Inventory (0002)│  │
 └──────────────┘   └──────────┘ │ └────────┬────────┘  │
                                 ▼          ▼           │
                       ┌───────────────────────────┐    │
                       │ P4 Storefront + Cart +    │    │
                       │ Legal + SEO               │    │
                       └─────────────┬─────────────┘    │
                                     ▼                  │
                       ┌───────────────────────────┐    │
                       │ P5 Checkout + Payments +  │    │
                       │ Refunds + Invoices (0003) │    │
                       └─────────────┬─────────────┘    │
                                     ▼                  │
                       ┌───────────────────────────┐    │
                       │ P6 Shiprocket + Tracking  │    │
                       │ (0004)                    │    │
                       └──────┬─────────────┬──────┘    │
                              ▼             ▼           │
               ┌──────────────────┐  ┌────────────────┐ │
               │ P7 Partner Desk  │─▶│ P8 /track +    │ │
               │ PWA (0005)       │  │ Notifications  │ │
               └──────────────────┘  └───────┬────────┘ │
                                             ▼          │
                       ┌───────────────────────────┐    │
                       │ P9 Admin Ops + Settlements│    │
                       │ (0006)                    │    │
                       └─────────────┬─────────────┘    │
                                     ▼                  ▼
                       ┌──────────────────────────────────────┐
                       │ P10 Hardening, E2E, Physical trial,  │
                       │ Go-Live                              │
                       └──────────────────────────────────────┘
```

> **Kyun yeh order?** Partner Packing Desk (P7) full Admin (P9) se pehle hai kyunki bina packing desk ke ek bhi order ship nahi hoga — jabki admin reports/settlements launch ke pehle hafte spreadsheet se bhi chal sakte hain. Minimal admin catalog UI P3 me hi hai taaki storefront ke paas real data ho.

---

## 🚀 MVP Launch Cut vs v2 Backlog

### ✅ MVP (pehle ~50 customers ke liye zaroori)
- Phase 0 ke saare **blocking** approvals (FSSAI, GST, Razorpay live, Shiprocket live, WhatsApp templates ya SMS DLT).
- Phase 1–8 poore.
- Phase 9 ka **minimum**: orders table, order detail, cancel + refund, NDR/RTO queue, settings. Settlements launch ke baad pehle cycle tak ready ho jaane chahiye (tab tak spreadsheet allowed).
- Phase 10 poora (2FA, backups, physical trial, go-live runbook) — **skip nahi hoga**.

### 🕒 v2 Backlog (launch ke baad)
| Feature | Notes |
| :--- | :--- |
| Coupons / discount codes | `coupons` table + `orders.coupon_code` FK |
| Product reviews & UGC | `reviews` table, delivered-only verified reviews |
| Cash on Delivery | D-25 — `settings.cod_enabled`, COD statuses, RTO risk analysis |
| Abandoned cart recovery | Server-side `carts` + WhatsApp reminder (consent required) |
| Multi-kitchen fulfilment | Multiple `pickup_locations`, nearest-kitchen routing |
| Reship (lost/damaged) | `shipments.order_id` UNIQUE hatana, multiple shipments per order |
| NDR actions automation | `ndr_actions` table, customer self-serve reattempt / address fix |
| Subscriptions / combos / gift boxes | Bundle SKUs, recurring orders |
