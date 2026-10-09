# 🥩 Phase 3: Catalog, Batches, Inventory Ledger + Minimal Admin Catalog UI

> [!IMPORTANT]
> **Read first:** `Rules/00-project-rules.md` · `architecture/08-decisions-log.md` · `architecture/07-order-state-machine.md` · `architecture/01-database-schema-models.md`
> **Depends on:** Phase 1, 2  ·  **Migration:** `0002_catalog_inventory.sql`

---

## 🎯 Objective
Traceable non-veg pickle catalog: products (250g/500g groups) with compliance data, kitchen batch registration with **server-generated batch codes** (D-42), append-only **inventory ledger**, aur **sellable shelf-life rule** (D-24) jo storefront count aur allocation dono me same ho. Saath me ek **minimal admin UI** taaki Phase 4 storefront ke paas real data ho (full admin Phase 9 me).

---

## 📋 Granular Tasks & Checklist

### 3.1 Migration `0002_catalog_inventory.sql`
- [ ] Copy exactly from `architecture/01`: `meat_type`, `inventory_movement_type`, `products`, `inventory_batches` (generated `cost_per_unit_paise`, stock bounds CHECK, FIFO partial index), `inventory_movements` (append-only trigger).
- [ ] Zod row schemas in `packages/shared`: `ProductRowSchema`, `BatchRowSchema`, `MovementRowSchema` (D-07).

### 3.2 Product Master
- [ ] Seed script (`pnpm db:seed:catalog`) — products **`is_active = false`** jab tak real data (lab shelf life Q-07, GST rate Q-01, packed weight D-34) confirm na ho:
  | product_group | SKUs |
  | :--- | :--- |
  | `himachali-chicken-pickle` | `CHK250`, `CHK500` |
  | `pahadi-mutton-pickle` | `MTN250`, `MTN500` |
  | `himalayan-trout-pickle` | `TRT250`, `TRT500` |
- [ ] Public endpoints:
  - `GET /api/v1/products` — active products grouped by `product_group`, each variant with `pricePaise`, `comparePricePaise`, `sellableStock`, `stockBadge` (`IN_STOCK` / `LOW_STOCK` with count / `SOLD_OUT`). Cache headers + Next.js cache tag `products`.
  - `GET /api/v1/products/:slug` — full detail: ingredients, allergens, nutrition, spice level, shelf life, storage, images, sibling variants (250g ↔ 500g), FSSAI license no. (from pickup location), current batch mfg date.
- [ ] Admin endpoints (`requireRole(['ADMIN'])`):
  - `GET /api/v1/admin/products`, `POST /api/v1/admin/products`, `PATCH /api/v1/admin/products/:id`, `POST /api/v1/admin/products/:id/publish` / `unpublish`.
  - Publish validation: `gst_rate_bp`, `shelf_life_days`, `ingredients`, `nutrition`, ≥ 1 image required.
- [ ] Har product mutation → `admin_audit_log` + storefront cache revalidate (tag `products`).

### 3.3 Product Images (D-11)
- [ ] `POST /api/v1/admin/uploads/product-image` → R2 **public bucket** presigned PUT URL (content-type allowlist `image/webp|jpeg|png`, max size), key `products/<productId>/<uuid>.<ext>`.
- [ ] Images CDN URL se serve; storefront `next/image` remote pattern sirf us CDN domain ke liye.

### 3.4 Batch Registration (D-42)
- [ ] `POST /api/v1/batches` (`ADMIN`, `KITCHEN_PARTNER` — own location):
  - Input: `{ productId, quantity, totalCostPaise, manufacturedAt? (default today IST), pickupLocationId?, notes? }`.
  - Server: batch code `PK-<YYMM>-<SKU>-<seq>` (e.g. `PK-2610-CHK250-01`; seq per product per month, unique-retry), `expiry_date = manufacturedAt + products.shelf_life_days`.
  - **Same transaction**: insert batch (`available_stock = initial_quantity`) + `inventory_movements` `PRODUCTION` (+quantity) + audit.
- [ ] `GET /api/v1/batches?productId&locationId&status` — FIFO order (`expiry_date ASC, manufactured_at ASC`), with computed `shelfStatus` and `daysToExpiry`.
- [ ] Batch edit: sirf `notes`; galat quantity → `ADJUSTMENT` movement (koi direct update nahi).

### 3.5 Inventory Ledger & Adjustments
- [ ] `POST /api/v1/batches/:id/adjustments` (`ADMIN`, `KITCHEN_PARTNER` own location) — `{ type: 'ADJUSTMENT' | 'WASTAGE', quantityDelta, reason }` (reason required). Transaction: `SELECT ... FOR UPDATE` batch → bounds check → update `available_stock` → movement row → audit.
- [ ] `GET /api/v1/batches/:id/movements` — ledger history.
- [ ] **Invariant**: `available_stock = SUM(quantity_delta)` per batch — reusable SQL check function (Phase 5 `LEDGER_CHECK` job yahi use karega).

### 3.6 Sellable Shelf-Life Rule (D-24)
- [ ] `sellableBufferDays(client)` = `settings.min_remaining_shelf_days + settings.transit_buffer_days` (default 45 + 7).
- [ ] Batch `shelfStatus` (computed, not stored):
  | Status | Rule |
  | :--- | :--- |
  | `FRESH` | `days_to_expiry >= sellable_buffer + 30` |
  | `AGING` | `sellable_buffer <= days_to_expiry < sellable_buffer + 30` (admin alert: promote/sell first) |
  | `NOT_SELLABLE` | `0 < days_to_expiry < sellable_buffer` (storefront se hidden; staff/sampling use) |
  | `EXPIRED` | `days_to_expiry <= 0` |
- [ ] Storefront stock query **exactly** `architecture/01` "Storefront Stock (sellable only)" — same `$1` buffer jo Phase 5 allocation use karega.
- [ ] Stock badge: `sellable_stock = 0` → `SOLD_OUT` ("Batch sold out — next batch bottling in progress"); `< settings.low_stock_threshold` → `LOW_STOCK` ("Only X jars left").

### 3.7 Minimal Admin Catalog UI (`apps/admin-portal`)
- [ ] Admin shell: sidebar/bottom-nav, role-aware routes, 3-tier page layout (Header → KPI cards → Table card) as per `Rules`.
- [ ] **Products**: list (status, price, sellable stock), create/edit form (all compliance fields, paise input as ₹ with conversion), image upload, publish/unpublish.
- [ ] **Batches**: list with `shelfStatus` badges (`success` / `warning` / `muted` / `destructive` tokens), create batch form (3 fields: product, quantity, total cost ₹), adjust stock dialog, movements drawer.
- [ ] TanStack Query for server state; no server data in Zustand.

---

## 🚫 Out of Scope
- Stock reservation / allocation for orders → **Phase 5**.
- Mobile-optimised partner batch logger → **Phase 7** (same API).
- Expiry/low-stock WhatsApp alerts → **Phase 8**.
- Full admin dashboard, reports → **Phase 9**.

---

## 🔍 Verification Checklist
- [ ] Migration `0002` up/down/up CI green.
- [ ] Batch create → `PRODUCTION` movement, generated batch code format valid, `expiry_date = mfg + shelf_life_days` (integration test `batches.test.ts`).
- [ ] Ledger invariant holds after create + 50 random adjustments (property test `ledger.test.ts`).
- [ ] Adjustment jo stock < 0 kare → `409`, kuch persist nahi.
- [ ] `NOT_SELLABLE` / `EXPIRED` batches storefront `sellableStock` me count nahi hote; 0 batches wala product `0` return karta hai (no null) (test `stock-query.test.ts`).
- [ ] `KITCHEN_PARTNER` doosri location ka batch create/adjust nahi kar sakta (`403`).
- [ ] Publish bina `gst_rate_bp`/`shelf_life_days`/image ke → `422 VALIDATION_FAILED`.
- [ ] Product update ke baad storefront cache revalidate (integration test with tag spy).
- [ ] Partner 50-jar batch entry < 30 sec (manual timed run, recorded).
- [ ] Admin catalog screens 375/768/1440 par Playwright pass, no horizontal overflow.

---

## ✅ Definition of Done
Admin real products publish kar sakta hai, partner/admin batches register aur adjust kar sakte hain, har stock change ledger me hai, aur storefront ko sirf sellable (FSSAI-safe) stock dikhta hai — same rule jo Phase 5 allocation use karega.
