# 📊 Phase 9: Admin Operations, Reports & Partner Settlements (React 19 + Vite)

> [!IMPORTANT]
> **Read first:** `Rules/00-project-rules.md` · `architecture/08-decisions-log.md` · `architecture/07-order-state-machine.md` · `architecture/01-database-schema-models.md` · `architecture/04-admin-operations-portal.md`
> **UI work:** `Rules/00-project-rules.md` §1.5 **Design Reference Policy** follow karo — Stitch design sirf reference hai, better bana sakte ho to banao. UI tasks **`ui-developer` agent** (`.claude/agents/ui-developer.md`) se.
> **Depends on:** Phase 2, Phase 3, Phase 5, Phase 6, Phase 7, Phase 8  ·  **Migration:** `0006_settlements.sql`

---

## 🎯 Objective
`ADMIN` ke liye ek complete operations console banana:
- orders, exceptions (ops_issue / NDR / RTO), refunds, inventory, settings aur expenses
- transparent, paisa-accurate partner settlements (D-40, D-41)

Har admin mutation audited hoga. Partner ko apne finalized settlements read-only dikhenge, aur woh unhe acknowledge kar sakega.

---

## 📋 Granular Tasks & Checklist

### 9.1 3-Tier Layout Standard (Nexus)
Har page strictly isi hierarchy me:
1. **Tier 1 — Page Header:** Title + subtitle + primary actions (e.g. `New Batch`, `Export CSV`).
2. **Tier 2 — KPI Stats Cards:** 4-column grid (mobile 2×2 / 1-col), pure summary cards.
3. **Tier 3 — Unified Main Table Card:** single container `rounded-xl border border-border bg-card shadow-sm p-5 space-y-4` → Controls Bar (segmented status pills left + search right) → TanStack Table v8 (server-side pagination/sort).
- [x] Shared components: `PageHeader`, `KpiGrid`, `TableCard`, `StatusBadge` (semantic tokens only: `--success`, `--warning`, `--info`, `--destructive`).
  > `apps/admin/src/components/common/{PageHeader,KpiCard (KpiGrid),TableCard,DataTable}.tsx` + `@pk/ui` StatusBadge (`FINALIZED` tone added); `apps/admin/tests/e2e/admin-pages.spec.ts` asserts the 3-tier structure.
- [x] Mobile: table → card list below `640px`; no horizontal overflow.
  > `DataTable` renders a card list < 640 px; `apps/admin/tests/e2e/admin-pages.spec.ts` no-overflow at 375/768/1440 on 17 views.

### 9.2 Dashboard (`/`)
- [x] KPIs: 📦 Orders awaiting packing · ⚠️ Needs attention (`ops_issue` + NDR) · 💰 Revenue today / this month (paise → ₹, GST-exclusive toggle) · 🏔️ Sellable stock & batches expiring in 30 days.
  > `apps/backend/tests/integration/admin-orders.test.ts` › dashboard; UI `Phases/evidence/phase-09/dashboard-*` (GST-exclusive toggle on the KPI cards — series are gross, noted on the chart).
- [x] Charts (light): orders/day (30 days), revenue by product.
  > Hand-rolled token bars (no chart lib): `Phases/evidence/phase-09/dashboard-*`.
- [x] `GET /api/v1/admin/dashboard` — single aggregated query set, cached 60s.
  > `admin.service.ts › dashboard` (one query set, Redis 60 s) — `apps/backend/tests/integration/admin-orders.test.ts` › "KPIs, 30-day series … cached 60 s".

### 9.3 Orders (`/orders`)
- [x] `GET /api/v1/admin/orders` — params: `status[]`, `tab` (`all | attention | awaiting_packing | in_transit | ndr | rto | delivered | cancelled`), `q` (order code / phone / AWB), `from`, `to`, `page`, `pageSize`, `sort`.
  > `apps/backend/tests/integration/admin-orders.test.ts` › "tabs, search by code / phone / AWB, date filter, server-side pagination + sort, counts per tab" (`status` as a comma list).
- [x] Columns: Order code · Date (IST) · Customer + city/state · Items snapshot (*1× Chicken 250g*) · Amount + payment status · Courier + AWB · Status badge · ops_issue icon.
  > `Phases/evidence/phase-09/orders-list-*`.
- [x] Status tab change TanStack Query refetch (no full reload), URL state sync.
  > `apps/admin/tests/e2e/admin-orders.spec.ts` (window marker survives tab/page/sort/search changes; params in the URL).

### 9.4 Order Detail Drawer
- [x] `GET /api/v1/admin/orders/:orderCode` → full view:
  > `apps/backend/tests/integration/admin-orders.test.ts` › "detail has allocations, timeline, payments …"; drawer `Phases/evidence/phase-09/order-drawer-*` (deep link `/orders/:code`).
  - Customer + shipping address snapshot, phone (click-to-WhatsApp)
  - Items + **allocations** (batch code, mfg, expiry)
  - Timeline (`order_status_logs` + `tracking_events`)
  - Payments (attempts) + refunds
  - Shipment (courier, AWB, ETD, charged weight, freight) + label/invoice via signed URLs
  - `notifications_log` for this order
  - Internal notes
- [x] Admin actions (sab `admin_audit_log` me, before/after JSON):
  > `apps/backend/tests/integration/admin-orders.test.ts` › "every mutating admin route writes an admin_audit_log row" (before/after JSON).
  - [x] **Cancel** — sirf allowed map ke states me (`07` §1.2); reason required → `POST /api/v1/admin/orders/:orderCode/cancel`.
    > `apps/backend/tests/integration/admin-orders.test.ts` › cancel allowed / 409; UI shows Cancel only when `actions.canCancel` (`apps/admin/tests/e2e/admin-orders.spec.ts`).
  - [x] **Refund** full/partial, reason enum (`CUSTOMER_CANCEL`, `DAMAGED`, `RTO`, `LOST`, `GOODWILL`), amount ≤ refundable → `POST /api/v1/admin/orders/:orderCode/refunds` (`Idempotency-Key`).
    > `apps/backend/tests/integration/admin-orders.test.ts` › partial refund (> refundable 400, same key once); reason `GOODWILL` added (D-56 f).
  - [x] **Resend notification** (template select) → `POST /api/v1/admin/orders/:orderCode/notifications/resend`.
    > `NOTIFY_RESEND` job (bypasses dedup, D-56 g) — audit test above.
  - [x] **Retry shipment booking** (Phase 6 dead-letter) → `POST /api/v1/admin/orders/:orderCode/retry-shipment`.
    > Fresh job id `ship-<id>-retry-<ts>` (D-56 g) — audit test above.
  - [x] **Resolve ops issue** → `POST /api/v1/admin/orders/:orderCode/resolve-issue`.
    > Audit test above (ops_issue cleared, old text kept in audit `before`).
  - [x] **Add note** → `POST /api/v1/admin/orders/:orderCode/notes` (audit log entry `ORDER_NOTE`).
    > Audit `ORDER_NOTE`, shown in the drawer (audit test above).

### 9.5 Customers (`/customers`)
- [x] `GET /api/v1/admin/customers` — users + guest phones aggregated: orders count, lifetime value, last order, RTO count (risk flag).
  > `apps/backend/tests/integration/admin-orders.test.ts` › customers aggregate (phone, LTV, RTO risk); `Phases/evidence/phase-09/customers-*`.
- [x] Detail: orders list, addresses. PII export **admin-only**, audited.
  > Detail + `GET /admin/exports/customers` audited with `pii: true` (`apps/backend/tests/integration/settlements.test.ts` › exports).

### 9.6 Inventory (`/inventory`)
- [x] Products CRUD (Phase 3 se link) + batches table: batch code, product, kitchen, mfg, expiry, initial/available, cost/unit, status badge (FRESH / AGING / NOT_SELLABLE per D-24 / EXPIRED).
  > Phase 3 products CRUD + batches table, now in the 3-tier layout (`Phases/evidence/phase-09/inventory-batches-*`).
- [x] Batch ledger view (`inventory_movements`).
  > `/batches/:batchId/ledger` (`Phases/evidence/phase-09/inventory-ledger-*`).
- [x] **Stock adjustment** (`ADJUSTMENT` / `WASTAGE`, reason required) → `POST /api/v1/batches/:id/adjustments` — transaction + row lock + audit.
  > Phase 3 `POST /batches/:id/adjustments` (transaction + row lock + audit, `batches.test.ts`).
- [x] Expiry alerts: batches crossing sellable threshold in next 14 days.
  > `GET /admin/inventory/expiry-alerts` — `apps/backend/tests/integration/admin-orders.test.ts` › expiry alerts; `Phases/evidence/phase-09/inventory-expiry-alerts-*`.

### 9.7 Settings (`/settings`)
- [x] `GET /api/v1/admin/settings`, `PATCH /api/v1/admin/settings` (`{ key, value }`) — `settings` table keys (shipping fee, free-shipping threshold, reservation TTL, shelf-life days, cutoff hour, courier rules, wallet min …) — per-key Zod schema, audited (`SETTING_UPDATE`).
  > Per-key Zod (`packages/shared/src/settings/schemas.ts`), audited `SETTING_UPDATE` — `apps/backend/tests/integration/settlements.test.ts` › settings PATCH; `Phases/evidence/phase-09/settings-*`.
- [x] Staff management: `GET/POST/PATCH /api/v1/admin/staff` (create KITCHEN_PARTNER, assign pickup location, deactivate, force logout = revoke refresh token family).
  > `apps/backend/tests/integration/settlements.test.ts` › staff (create partner + kitchen, duplicate 409, deactivate → login 401 + sessions revoked, self-deactivate blocked); `Phases/evidence/phase-09/staff-*`.

### 9.8 Expenses (`/expenses`)
- [x] CRUD `GET/POST/PATCH/DELETE /api/v1/admin/expenses` — category, amount (paise), date, description, paid by (partner), receipt upload (private R2 presigned).
  > `apps/backend/tests/integration/settlements.test.ts` › expenses + receipts (presigned private PUT, signed GET); `Phases/evidence/phase-09/expenses-*`.
- [x] Settlement me include ho chuka expense locked (edit/delete blocked).
  > Locked in any settlement (D-56 d) — `apps/backend/tests/integration/settlements.test.ts` › finalized immutability (PATCH/DELETE → 409).

### 9.9 Settlements (D-40, D-41)
- [x] **Generate DRAFT** `POST /api/v1/admin/settlements` `{ periodStart, periodEnd }`:
  > `apps/backend/tests/integration/settlements.test.ts` › "fixture → DRAFT totals match the hand calculation to the paisa"; formula note D-56 a/b.
  - Eligible orders: `delivered_at`/terminal-state date period me, status ∈ (`DELIVERED`, `RTO_DELIVERED`, `CANCELLED` with paid+refund, `LOST`), **not already in `settlement_items`**.
  - Per order line (integer paise):
    `revenue_ex_gst = total − tax − refunds_paise`
    `raw_cost = Σ allocation.qty × batch.cost_per_unit_paise`
    `packaging = jars × packaging_cost_per_jar_paise`
    `freight` (actual), `gateway_fee = fee + fee_tax`, `rto_freight`
    `net = revenue_ex_gst − raw_cost − packaging − freight − gateway_fee − rto_freight`
  - Cycle: `shared_expenses` = unsettled expenses in period; `net_profit = Σ net − shared_expenses`.
  - **Rounding rule:** `partner_share = floor(net_profit × partner_split_bp / 10000)`, `admin_share = net_profit − partner_share` (DB CHECK enforces sum).
  - `partner_payout = raw_cost reimbursement + partner_share` (+ partner-paid expenses reimbursement).
  - Negative net profit → shares negative, clearly shown (no hidden carry-forward).
- [x] Missing data guard: koi eligible order jiska `freight_paise` / gateway `fee_paise` null hai → DRAFT generate hoga lekin warning list + finalize blocked jab tak resolve na ho.
  > `apps/backend/tests/integration/settlements.test.ts` › "missing freight → DRAFT with a warning, finalize blocked"; gateway fee backfilled from Razorpay first.
- [x] **Finalize** `POST /api/v1/admin/settlements/:id/finalize` → statement PDF (private R2 `statement_key`), expenses locked, partner notified.
  > `apps/backend/tests/integration/settlements.test.ts` › finalize → statement PDF (private, signed link) + `settlement_ready` to partners.
- [x] **Mark paid** `POST /api/v1/admin/settlements/:id/mark-paid` `{ bankReference, paidAt }`.
  > `apps/backend/tests/integration/settlements.test.ts` › mark paid (FINALIZED only, second → 409).
- [x] DRAFT delete allowed (re-generate); FINALIZED/PAID immutable.
  > `apps/backend/tests/integration/settlements.test.ts` › delete draft frees orders; finalize/delete/expense edit on FINALIZED → 409; DB CHECKs on the money maths.
- [x] **Partner view** (Phase 7 nav slot): `GET /api/v1/partner/settlements`, `GET /api/v1/partner/settlements/:id` (finalized/paid only, line items + expenses), `POST /api/v1/partner/settlements/:id/acknowledge`.
  > `apps/backend/tests/integration/settlements.test.ts` › partner list / detail / statement / acknowledge once; UI Hisaab tab `Phases/evidence/phase-09/partner-hisaab-*` (Hindi + English).

### 9.10 Reports & Exports
- [x] CSV export: orders, settlement statement, GST summary (taxable value + GST by rate/HSN per month — CA ke liye), inventory ledger → `GET /api/v1/admin/exports/:type?from&to` (streamed, audited).
  > `GET /admin/exports/:type` (orders, gst, inventory-ledger, customers, settlement) — `apps/backend/tests/integration/settlements.test.ts` › exports; `Phases/evidence/phase-09/exports-*`. Built in memory (D-56 k).

### 9.11 Ops Tooling
- [x] **bull-board** mounted at `/api/v1/admin/queues` — `requireRole(['ADMIN'])`, CSP-safe.
  > Phase 5 (`plugins/queue-dashboard.ts`); `jobs.test.ts` › "bull-board is ADMIN only". Embedded on `/ops` with an "Open job queues" link fallback.
- [x] Webhook failures view: `webhook_events` where `last_error IS NOT NULL` + replay button (`POST /api/v1/admin/webhooks/:id/replay`).
  > `apps/backend/tests/integration/admin-orders.test.ts` (failures list + replay audited); `Phases/evidence/phase-09/webhooks-*`.

---

## 🚫 Out of Scope
- Coupons/discount management, reviews moderation, ad-platform integrations → v2.
- Automated bank payouts → manual transfer + reference only.

---

## 🔍 Verification Checklist
- [x] Layout snapshot tests: har page 3-tier hierarchy, no nested wrapper padding; 375 / 768 / 1440 no overflow.
  > `apps/admin/tests/e2e/admin-pages.spec.ts` (17 views × 375/768/1440 × light/dark: one header → one KPI grid → one TableCard, no nested padding, no overflow).
- [x] Orders filter/search/pagination server-side; tab change no full reload (Playwright).
  > `apps/admin/tests/e2e/admin-orders.spec.ts` + `apps/backend/tests/integration/admin-orders.test.ts`.
- [x] Cancel button sirf allowed states me visible + API illegal transition par 409 (`admin.cancel.int.test.ts`).
  > `apps/backend/tests/integration/admin-orders.test.ts` › cancel (named `admin-orders.test.ts`) + UI visibility in `apps/admin/tests/e2e/admin-orders.spec.ts`.
- [x] Partial refund > refundable amount → 400; duplicate refund request (same key) → one Razorpay refund.
  > `apps/backend/tests/integration/admin-orders.test.ts` › partial refund (one gateway refund for the repeated key).
- [x] Har admin mutation ke liye `admin_audit_log` row (test iterates all mutating routes).
  > `apps/backend/tests/integration/admin-orders.test.ts` › "every mutating admin route writes an admin_audit_log row" (+ settlements / expenses / staff / settings audits in `settlements.test.ts`).
- [x] Settlement fixture (known orders + expenses) → totals **exact paisa match** with hand-calculated expected (`settlement.calc.test.ts`), incl. odd-paisa rounding case.
  > `apps/backend/tests/unit/settlement-calc.test.ts` (worked example, odd-paisa split, loss) + DB fixture in `settlements.test.ts`.
- [x] Same order do settlements me nahi aa sakta (UNIQUE) — test.
  > `apps/backend/tests/integration/settlements.test.ts` › UNIQUE (`23505`) + same period 409.
- [x] Finalized settlement edit attempt → 409.
  > `apps/backend/tests/integration/settlements.test.ts` › FINALIZED immutable (409).
- [x] KITCHEN_PARTNER: `/api/v1/admin/*` → 403; partner settlements endpoint DRAFT nahi dikhata; acknowledge works once.
  > `apps/backend/tests/integration/admin-orders.test.ts` › partner 403 on every /admin family; `apps/backend/tests/integration/settlements.test.ts` › partner never sees DRAFT, acknowledge once.
- [x] bull-board bina ADMIN session 401/403.
  > `apps/backend/tests/integration/jobs.test.ts` › "bull-board is ADMIN only".
- [x] GST CSV totals = orders table totals for same period.
  > `apps/backend/tests/integration/settlements.test.ts` › "GST summary totals = orders table totals".

---

## ✅ Definition of Done
Admin bina DB access ke poora business chala sakta hai (orders, exceptions, refunds, stock, settings, expenses); ek real settlement cycle generate → finalize → pay → partner acknowledge staging me complete; saare role + calculation tests green.
