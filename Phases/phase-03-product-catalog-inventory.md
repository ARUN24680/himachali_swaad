# 🥩 Phase 3: Catalog, Batches, Inventory Ledger + Minimal Admin Catalog UI

> [!IMPORTANT]
> **Read first:** `Rules/00-project-rules.md` · `architecture/08-decisions-log.md` · `architecture/07-order-state-machine.md` · `architecture/01-database-schema-models.md`
> **UI work:** `Rules/00-project-rules.md` §1.5 **Design Reference Policy** follow karo — Stitch design sirf reference hai, better bana sakte ho to banao. UI tasks **`ui-developer` agent** (`.claude/agents/ui-developer.md`) se.
> **Depends on:** Phase 1, 2  ·  **Migration:** `0002_catalog_inventory.sql`

---

## 🎯 Objective
Traceable non-veg pickle catalog: products (250g/500g groups) with compliance data, kitchen batch registration with **server-generated batch codes** (D-42), append-only **inventory ledger**, aur **sellable shelf-life rule** (D-24) jo storefront count aur allocation dono me same ho. Saath me ek **minimal admin UI** taaki Phase 4 storefront ke paas real data ho (full admin Phase 9 me).

---

## 📋 Granular Tasks & Checklist

### 3.1 Migration `0002_catalog_inventory.sql`
- [x] Copy exactly from `architecture/01`: `meat_type`, `inventory_movement_type`, `products`, `inventory_batches` (generated `cost_per_unit_paise`, stock bounds CHECK, FIFO partial index), `inventory_movements` (append-only trigger). — `packages/database/migrations/0002_catalog_inventory.sql` (+ D-49: draft-nullable compliance cols + `products_publishable`, `ist_today()`); `migration-0002.test.ts`
- [x] Zod row schemas in `packages/shared`: `ProductRowSchema`, `BatchRowSchema`, `MovementRowSchema` (D-07). — `packages/shared/src/catalog/rows.ts`, parsed in every catalog/inventory repository

### 3.2 Product Master
- [x] Seed script (`pnpm db:seed:catalog`) — products **`is_active = false`** jab tak real data (lab shelf life Q-07, GST rate Q-01, packed weight D-34) confirm na ho: — `apps/backend/scripts/seed-catalog.ts` (6 drafts; `--demo` adds placeholder values + batches, refused in production); run locally 2026-10-11
  | product_group | SKUs |
  | :--- | :--- |
  | `himachali-chicken-pickle` | `CHK250`, `CHK500` |
  | `pahadi-mutton-pickle` | `MTN250`, `MTN500` |
  | `himalayan-trout-pickle` | `TRT250`, `TRT500` |
- [x] Public endpoints: — `stock-query.test.ts` (grouping, badges, cache headers, detail + FIFO batch + FSSAI). Storefront consumes it in Phase 4
  - `GET /api/v1/products` — active products grouped by `product_group`, each variant with `pricePaise`, `comparePricePaise`, `sellableStock`, `stockBadge` (`IN_STOCK` / `LOW_STOCK` with count / `SOLD_OUT`). Cache headers + Next.js cache tag `products`.
  - `GET /api/v1/products/:slug` — full detail: ingredients, allergens, nutrition, spice level, shelf life, storage, images, sibling variants (250g ↔ 500g), FSSAI license no. (from pickup location), current batch mfg date.
- [x] Admin endpoints (`requireRole(['ADMIN'])`): — `products.test.ts`
  - `GET /api/v1/admin/products`, `POST /api/v1/admin/products`, `PATCH /api/v1/admin/products/:id`, `POST /api/v1/admin/products/:id/publish` / `unpublish`.
  - Publish validation: `gst_rate_bp`, `shelf_life_days`, `ingredients`, `nutrition`, ≥ 1 image required.
- [x] Har product mutation → `admin_audit_log` + storefront cache revalidate (tag `products`). — `products.test.ts` (audit sequence + `revalidate(['products'])` spy); storefront `app/api/revalidate` verified live (200 with secret, 401 without)

### 3.3 Product Images (D-11)
- [x] `POST /api/v1/admin/uploads/product-image` → R2 **public bucket** presigned PUT URL (content-type allowlist `image/webp|jpeg|png`, max size), key `products/<productId>/<uuid>.<ext>`. — `products.test.ts` (presign → PUT → served; type/size/token/foreign-key rejections), `storage.test.ts` (R2 signs content-length;content-type;host, 300 s)
- [ ] Images CDN URL se serve; storefront `next/image` remote pattern sirf us CDN domain ke liye. — code done (`R2_PUBLIC_BASE_URL`, next.config `remotePatterns` from `NEXT_PUBLIC_ASSETS_BASE_URL`); **pending: real R2 bucket + CDN domain + bucket CORS** (no credentials yet)

### 3.4 Batch Registration (D-42)
- [x] `POST /api/v1/batches` (`ADMIN`, `KITCHEN_PARTNER` — own location): — `batches.test.ts`
  - Input: `{ productId, quantity, totalCostPaise, manufacturedAt? (default today IST), pickupLocationId?, notes? }`.
  - Server: batch code `PK-<YYMM>-<SKU>-<seq>` (e.g. `PK-2610-CHK250-01`; seq per product per month, unique-retry), `expiry_date = manufacturedAt + products.shelf_life_days`.
  - **Same transaction**: insert batch (`available_stock = initial_quantity`) + `inventory_movements` `PRODUCTION` (+quantity) + audit.
- [x] `GET /api/v1/batches?productId&locationId&status` — FIFO order (`expiry_date ASC, manufactured_at ASC`), with computed `shelfStatus` and `daysToExpiry`. — `stock-query.test.ts` › shelfStatus boundaries + FIFO order
- [x] Batch edit: sirf `notes`; galat quantity → `ADJUSTMENT` movement (koi direct update nahi). — `batches.test.ts` › edits only notes

### 3.5 Inventory Ledger & Adjustments
- [x] `POST /api/v1/batches/:id/adjustments` (`ADMIN`, `KITCHEN_PARTNER` own location) — `{ type: 'ADJUSTMENT' | 'WASTAGE', quantityDelta, reason }` (reason required). Transaction: `SELECT ... FOR UPDATE` batch → bounds check → update `available_stock` → movement row → audit. — `batches.test.ts`, `ledger.test.ts`
- [x] `GET /api/v1/batches/:id/movements` — ledger history. — `batches.test.ts` › running balance
- [x] **Invariant**: `available_stock = SUM(quantity_delta)` per batch — reusable SQL check function (Phase 5 `LEDGER_CHECK` job yahi use karega). — `inventory.repository.findLedgerMismatches()` via `inventoryService.findLedgerMismatches`; `ledger.test.ts`

### 3.6 Sellable Shelf-Life Rule (D-24)
- [x] `sellableBufferDays(client)` = `settings.min_remaining_shelf_days + settings.transit_buffer_days` (default 45 + 7). — `inventory.service.ts`; `stock-query.test.ts` › follows the buffer when settings change
- [x] Batch `shelfStatus` (computed, not stored): — `@pk/shared` `shelfStatusFor`; `catalog.test.ts` + `stock-query.test.ts`
  | Status | Rule |
  | :--- | :--- |
  | `FRESH` | `days_to_expiry >= sellable_buffer + 30` |
  | `AGING` | `sellable_buffer <= days_to_expiry < sellable_buffer + 30` (admin alert: promote/sell first) |
  | `NOT_SELLABLE` | `0 < days_to_expiry < sellable_buffer` (storefront se hidden; staff/sampling use) |
  | `EXPIRED` | `days_to_expiry <= 0` |
- [x] Storefront stock query **exactly** `architecture/01` "Storefront Stock (sellable only)" — same `$1` buffer jo Phase 5 allocation use karega. — `catalog.repository.storefrontStock()` (CURRENT_DATE → `ist_today()`, D-49); 07 `reserveForItem` updated to match
- [x] Stock badge: `sellable_stock = 0` → `SOLD_OUT` ("Batch sold out — next batch bottling in progress"); `< settings.low_stock_threshold` → `LOW_STOCK` ("Only X jars left"). — `stock-query.test.ts` › SOLD_OUT / LOW_STOCK

### 3.7 Minimal Admin Catalog UI (`apps/admin`)
- [x] Admin shell: sidebar/bottom-nav, role-aware routes, 3-tier page layout (Header → KPI cards → Table card) as per `Rules`. — `AdminLayout` + Sidebar/BottomNav, role-aware; evidence `Phases/evidence/phase-03/`
- [x] **Products**: list (status, price, sellable stock), create/edit form (all compliance fields, paise input as ₹ with conversion), image upload, publish/unpublish. — `apps/admin/tests/e2e/products.spec.ts` (mocked API), screenshots `admin-products-*`, `admin-product-editor-*`
- [x] **Batches**: list with `shelfStatus` badges (`success` / `warning` / `muted` / `destructive` tokens), create batch form (3 fields: product, quantity, total cost ₹), adjust stock dialog, movements drawer. — `batches.spec.ts` (mocked API) + live run against local backend (partner logged `PK-2610-MTN500-02`); screenshots `admin-batch*`
- [x] TanStack Query for server state; no server data in Zustand. — query keys `services/api/query-keys.ts`; Zustand only for toasts

---

## 🚫 Out of Scope
- Stock reservation / allocation for orders → **Phase 5**.
- Mobile-optimised partner batch logger → **Phase 7** (same API).
- Expiry/low-stock WhatsApp alerts → **Phase 8**.
- Full admin dashboard, reports → **Phase 9**.

---

## 🔍 Verification Checklist
- [x] Migration `0002` up/down/up CI green. — local up → down → up OK; CI run 38129606314 (PR #3) all 5 jobs green
- [x] Batch create → `PRODUCTION` movement, generated batch code format valid, `expiry_date = mfg + shelf_life_days` (integration test `batches.test.ts`).
- [x] Ledger invariant holds after create + 50 random adjustments (property test `ledger.test.ts`).
- [x] Adjustment jo stock < 0 kare → `409`, kuch persist nahi. — `batches.test.ts` › returns 409 and persists nothing
- [x] `NOT_SELLABLE` / `EXPIRED` batches storefront `sellableStock` me count nahi hote; 0 batches wala product `0` return karta hai (no null) (test `stock-query.test.ts`).
- [x] `KITCHEN_PARTNER` doosri location ka batch create/adjust nahi kar sakta (`403`). — `batches.test.ts` (create + adjust/notes/movements/list)
- [x] Publish bina `gst_rate_bp`/`shelf_life_days`/image ke → `422 VALIDATION_FAILED`. — `products.test.ts` › refuses to publish …
- [x] Product update ke baad storefront cache revalidate (integration test with tag spy). — `products.test.ts` (spy) + live route check
- [ ] Partner 50-jar batch entry < 30 sec (manual timed run, recorded). — automated runs 320–339 ms (`batches.spec.ts`, annotation `batch-entry-ms`); **manual timed run by the partner still pending**
- [x] Admin catalog screens 375/768/1440 par Playwright pass, no horizontal overflow. — admin Playwright 78/78 (mocked API), overflow asserted on every main screen

---

## ✅ Definition of Done
Admin real products publish kar sakta hai, partner/admin batches register aur adjust kar sakte hain, har stock change ledger me hai, aur storefront ko sirf sellable (FSSAI-safe) stock dikhta hai — same rule jo Phase 5 allocation use karega.
