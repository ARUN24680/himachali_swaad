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
- [ ] Shared components: `PageHeader`, `KpiGrid`, `TableCard`, `StatusBadge` (semantic tokens only: `--success`, `--warning`, `--info`, `--destructive`).
- [ ] Mobile: table → card list below `640px`; no horizontal overflow.

### 9.2 Dashboard (`/`)
- [ ] KPIs: 📦 Orders awaiting packing · ⚠️ Needs attention (`ops_issue` + NDR) · 💰 Revenue today / this month (paise → ₹, GST-exclusive toggle) · 🏔️ Sellable stock & batches expiring in 30 days.
- [ ] Charts (light): orders/day (30 days), revenue by product.
- [ ] `GET /api/v1/admin/dashboard` — single aggregated query set, cached 60s.

### 9.3 Orders (`/orders`)
- [ ] `GET /api/v1/admin/orders` — params: `status[]`, `tab` (`all | attention | awaiting_packing | in_transit | ndr | rto | delivered | cancelled`), `q` (order code / phone / AWB), `from`, `to`, `page`, `pageSize`, `sort`.
- [ ] Columns: Order code · Date (IST) · Customer + city/state · Items snapshot (*1× Chicken 250g*) · Amount + payment status · Courier + AWB · Status badge · ops_issue icon.
- [ ] Status tab change TanStack Query refetch (no full reload), URL state sync.

### 9.4 Order Detail Drawer
- [ ] `GET /api/v1/admin/orders/:orderCode` → full view:
  - Customer + shipping address snapshot, phone (click-to-WhatsApp)
  - Items + **allocations** (batch code, mfg, expiry)
  - Timeline (`order_status_logs` + `tracking_events`)
  - Payments (attempts) + refunds
  - Shipment (courier, AWB, ETD, charged weight, freight) + label/invoice via signed URLs
  - `notifications_log` for this order
  - Internal notes
- [ ] Admin actions (sab `admin_audit_log` me, before/after JSON):
  - [ ] **Cancel** — sirf allowed map ke states me (`07` §1.2); reason required → `POST /api/v1/admin/orders/:orderCode/cancel`.
  - [ ] **Refund** full/partial, reason enum (`CUSTOMER_CANCEL`, `DAMAGED`, `RTO`, `LOST`, `GOODWILL`), amount ≤ refundable → `POST /api/v1/admin/orders/:orderCode/refunds` (`Idempotency-Key`).
  - [ ] **Resend notification** (template select) → `POST /api/v1/admin/orders/:orderCode/notifications/resend`.
  - [ ] **Retry shipment booking** (Phase 6 dead-letter) → `POST /api/v1/admin/orders/:orderCode/retry-shipment`.
  - [ ] **Resolve ops issue** → `POST /api/v1/admin/orders/:orderCode/resolve-issue`.
  - [ ] **Add note** → `POST /api/v1/admin/orders/:orderCode/notes` (audit log entry `ORDER_NOTE`).

### 9.5 Customers (`/customers`)
- [ ] `GET /api/v1/admin/customers` — users + guest phones aggregated: orders count, lifetime value, last order, RTO count (risk flag).
- [ ] Detail: orders list, addresses. PII export **admin-only**, audited.

### 9.6 Inventory (`/inventory`)
- [ ] Products CRUD (Phase 3 se link) + batches table: batch code, product, kitchen, mfg, expiry, initial/available, cost/unit, status badge (FRESH / AGING / NOT_SELLABLE per D-24 / EXPIRED).
- [ ] Batch ledger view (`inventory_movements`).
- [ ] **Stock adjustment** (`ADJUSTMENT` / `WASTAGE`, reason required) → `POST /api/v1/batches/:id/adjustments` — transaction + row lock + audit.
- [ ] Expiry alerts: batches crossing sellable threshold in next 14 days.

### 9.7 Settings (`/settings`)
- [ ] `GET /api/v1/admin/settings`, `PATCH /api/v1/admin/settings` (`{ key, value }`) — `settings` table keys (shipping fee, free-shipping threshold, reservation TTL, shelf-life days, cutoff hour, courier rules, wallet min …) — per-key Zod schema, audited (`SETTING_UPDATE`).
- [ ] Staff management: `GET/POST/PATCH /api/v1/admin/staff` (create KITCHEN_PARTNER, assign pickup location, deactivate, force logout = revoke refresh token family).

### 9.8 Expenses (`/expenses`)
- [ ] CRUD `GET/POST/PATCH/DELETE /api/v1/admin/expenses` — category, amount (paise), date, description, paid by (partner), receipt upload (private R2 presigned).
- [ ] Settlement me include ho chuka expense locked (edit/delete blocked).

### 9.9 Settlements (D-40, D-41)
- [ ] **Generate DRAFT** `POST /api/v1/admin/settlements` `{ periodStart, periodEnd }`:
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
- [ ] Missing data guard: koi eligible order jiska `freight_paise` / gateway `fee_paise` null hai → DRAFT generate hoga lekin warning list + finalize blocked jab tak resolve na ho.
- [ ] **Finalize** `POST /api/v1/admin/settlements/:id/finalize` → statement PDF (private R2 `statement_key`), expenses locked, partner notified.
- [ ] **Mark paid** `POST /api/v1/admin/settlements/:id/mark-paid` `{ bankReference, paidAt }`.
- [ ] DRAFT delete allowed (re-generate); FINALIZED/PAID immutable.
- [ ] **Partner view** (Phase 7 nav slot): `GET /api/v1/partner/settlements`, `GET /api/v1/partner/settlements/:id` (finalized/paid only, line items + expenses), `POST /api/v1/partner/settlements/:id/acknowledge`.

### 9.10 Reports & Exports
- [ ] CSV export: orders, settlement statement, GST summary (taxable value + GST by rate/HSN per month — CA ke liye), inventory ledger → `GET /api/v1/admin/exports/:type?from&to` (streamed, audited).

### 9.11 Ops Tooling
- [ ] **bull-board** mounted at `/api/v1/admin/queues` — `requireRole(['ADMIN'])`, CSP-safe.
- [ ] Webhook failures view: `webhook_events` where `last_error IS NOT NULL` + replay button (`POST /api/v1/admin/webhooks/:id/replay`).

---

## 🚫 Out of Scope
- Coupons/discount management, reviews moderation, ad-platform integrations → v2.
- Automated bank payouts → manual transfer + reference only.

---

## 🔍 Verification Checklist
- [ ] Layout snapshot tests: har page 3-tier hierarchy, no nested wrapper padding; 375 / 768 / 1440 no overflow.
- [ ] Orders filter/search/pagination server-side; tab change no full reload (Playwright).
- [ ] Cancel button sirf allowed states me visible + API illegal transition par 409 (`admin.cancel.int.test.ts`).
- [ ] Partial refund > refundable amount → 400; duplicate refund request (same key) → one Razorpay refund.
- [ ] Har admin mutation ke liye `admin_audit_log` row (test iterates all mutating routes).
- [ ] Settlement fixture (known orders + expenses) → totals **exact paisa match** with hand-calculated expected (`settlement.calc.test.ts`), incl. odd-paisa rounding case.
- [ ] Same order do settlements me nahi aa sakta (UNIQUE) — test.
- [ ] Finalized settlement edit attempt → 409.
- [ ] KITCHEN_PARTNER: `/api/v1/admin/*` → 403; partner settlements endpoint DRAFT nahi dikhata; acknowledge works once.
- [ ] bull-board bina ADMIN session 401/403.
- [ ] GST CSV totals = orders table totals for same period.

---

## ✅ Definition of Done
Admin bina DB access ke poora business chala sakta hai (orders, exceptions, refunds, stock, settings, expenses); ek real settlement cycle generate → finalize → pay → partner acknowledge staging me complete; saare role + calculation tests green.
