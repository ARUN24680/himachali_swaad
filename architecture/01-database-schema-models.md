# 🗄️ 01. Database Schema v2 & Pure Raw SQL Architecture (PostgreSQL 17 + `pg`)

> **Schema v2** — purane v1 schema ke gaps fix kiye gaye: split-batch allocation, reservations, payments/refunds, webhooks idempotency, shipments + tracking, settlements, audit, money in paise, CHECK constraints, `updated_at` triggers.
> Related: `07-order-state-machine.md` (statuses + canonical transaction code), `08-decisions-log.md`.

---

## 🎯 Architectural Decision: Zero-ORM / Pure SQL

* **Driver:** Direct `pg` (Node-Postgres Connection Pool). ❌ Prisma, ❌ Sequelize, ❌ TypeORM (D-01).
* **Queries:** Handcrafted parameterized SQL (`$1, $2, ...`) only. String interpolation of user input **banned**.
* **Migrations:** `dbmate` — plain `.sql` files in `packages/database/migrations/`, har file me `-- migrate:up` aur `-- migrate:down`. Ek baar apply hui migration **kabhi edit nahi hogi** — naya migration likho.
* **Row typing:** Har query result `packages/shared` ke Zod schema se parse (D-07).

### 📏 SQL Rules (code review checklist)
1. Money hamesha `BIGINT` paise (D-26). `DECIMAL`/`float` money ke liye banned.
2. Timestamps hamesha `TIMESTAMPTZ`; DB UTC me, display IST (`Asia/Kolkata`) me.
3. Ek transaction me multiple rows lock karni hain → **deterministic order** (e.g. `product_id ASC`, `id ASC`) → deadlock nahi.
4. **External API call transaction ke andar banned** (D-30).
5. Worker jo queue-like tables scan karte hain → `FOR UPDATE SKIP LOCKED`.
6. Financial/audit rows (`orders`, `payments`, `refunds`, logs) par `ON DELETE CASCADE` **nahi** — `RESTRICT`. Log tables append-only (trigger se UPDATE/DELETE blocked).
7. Har table jisme `updated_at` hai, us par `set_updated_at` trigger.
8. Har naya query pattern jo hot path par hai (storefront listing, orders table) → `EXPLAIN ANALYZE` PR description me.

---

## 🛠️ Database Client (`apps/backend/src/config/db.ts`)

> **Implemented (Phase 1):** code me yeh client `createDb(config, logger)` **factory** hai (server, worker aur tests apna-apna pool banate hain) — behaviour neeche jaisa hi hai, plus ek fix: transaction ke dauran checked-out client par **`error` listener** lagta hai. Bina iske DB restart / failover / `pg_terminate_backend` par `pg` unhandled `'error'` emit karta hai aur **poora process crash** ho jata hai (integration test `db.transaction.test.ts › destroys a client whose ROLLBACK fails` ne pakda). Code hi source of truth hai; neeche wala sketch reference hai.

```typescript
import pg from 'pg';
import { env } from './env';      // Zod-validated environment
import { logger } from './logger'; // pino

const { Pool } = pg;

// Pool sizing: (pool max × number of API + worker processes) must stay well below
// PostgreSQL max_connections. Start with 10 per process; tune with metrics.
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,               // default 10
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 3_000,
  statement_timeout: 5_000,           // runaway query protection (ms)
  application_name: env.PROCESS_NAME, // 'pk-api' | 'pk-worker' → visible in pg_stat_activity
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : undefined,
});

pool.on('error', (err) => logger.error({ err }, 'Unexpected error on idle PostgreSQL client'));

type Isolation = 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

export const db = {
  /** Parameterized raw SQL query. Never interpolate user input into `text`. */
  query: async <T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]) => {
    const start = performance.now();
    const res = await pool.query<T>(text, params as any[]);
    const ms = Math.round(performance.now() - start);
    if (ms > env.SLOW_QUERY_MS) logger.warn({ sql: text, ms, rows: res.rowCount }, 'slow query'); // params never logged (PII)
    return res;
  },

  /** BEGIN/COMMIT/ROLLBACK wrapper. A client whose ROLLBACK fails is destroyed, not returned to the pool. */
  transaction: async <T>(fn: (client: pg.PoolClient) => Promise<T>, opts?: { isolation?: Isolation }): Promise<T> => {
    const client = await pool.connect();
    let broken: Error | undefined;
    // pg only listens for errors on IDLE clients — a checked-out client must have its own listener
    const onClientError = (err: Error) => { broken = err; logger.error({ err }, 'connection lost during transaction'); };
    client.on('error', onClientError);
    try {
      // `isolation` is a closed union type, never user input
      await client.query(opts?.isolation ? `BEGIN ISOLATION LEVEL ${opts.isolation}` : 'BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        broken = rollbackErr as Error;
      }
      throw err;
    } finally {
      client.off('error', onClientError);
      client.release(broken);
    }
  },
};
```

---

## 🗺️ Entity Overview

```text
users ─┬─< refresh_tokens
       ├─< addresses
       ├─< user_pickup_locations >── pickup_locations ─┬─< inventory_batches >── products
       └─< orders ──────────────────────────────────────┘          │
             ├─< order_items ─< order_item_allocations >───────────┘ (batch)
             ├─< order_status_logs              inventory_batches ─< inventory_movements
             ├─< payments ─< refunds
             ├── shipments ─< tracking_events
             ├─< notifications_log
             └── settlement_items >── settlements ─< expenses

settings · webhook_events · invoice_sequences · admin_audit_log · push_subscriptions
```

---

## 📂 Migration Files → Phase Mapping

| Migration | Contents | Created in Phase |
| :--- | :--- | :--- |
| `0001_foundation.sql` | extensions, helper triggers, `users`, `refresh_tokens`, `settings`, `pickup_locations`, `user_pickup_locations`, `admin_audit_log` | Phase 1 |
| `0002_catalog_inventory.sql` | `products`, `inventory_batches`, `inventory_movements` | Phase 3 |
| `0003_orders_payments.sql` | `addresses`, `orders`, `order_items`, `order_item_allocations`, `order_status_logs`, `payments`, `refunds`, `webhook_events`, `invoice_sequences` | Phase 5 |
| `0004_logistics.sql` | `shipments`, `tracking_events` | Phase 6 |
| `0005_notifications.sql` | `push_subscriptions`, `notifications_log` | Phase 7 |
| `0006_settlements.sql` | `expenses`, `settlements`, `settlement_items` | Phase 9 |
| *v2 backlog* | `coupons`, `reviews`, `carts` (abandoned cart), `ndr_actions`, COD fields | Post-launch |

---

## 🧱 `0001_foundation.sql` (Phase 1)

```sql
-- migrate:up
CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive emails
-- gen_random_uuid() is built into PostgreSQL 13+ (no uuid-ossp needed)

-- Helper: auto-maintain updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END $$;

-- Helper: make log tables append-only
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$;

CREATE TYPE user_role AS ENUM ('CUSTOMER', 'ADMIN', 'KITCHEN_PARTNER');  -- D-17

CREATE TABLE users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone            VARCHAR(15) UNIQUE,                 -- E.164: +91XXXXXXXXXX
  email            CITEXT UNIQUE,
  full_name        VARCHAR(120),
  role             user_role NOT NULL DEFAULT 'CUSTOMER',
  password_hash    TEXT,                               -- staff only (bcrypt, D-19)
  totp_secret_enc  TEXT,                               -- ADMIN 2FA (encrypted at app level)
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_phone_format  CHECK (phone IS NULL OR phone ~ '^\+91[6-9][0-9]{9}$'),
  CONSTRAINT users_has_identity  CHECK (phone IS NOT NULL OR email IS NOT NULL),
  CONSTRAINT users_staff_login   CHECK (role = 'CUSTOMER' OR (email IS NOT NULL AND password_hash IS NOT NULL))
);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Rotating refresh tokens with reuse detection (D-20)
CREATE TABLE refresh_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id       UUID NOT NULL,                       -- all rotations of one login share a family
  token_hash      CHAR(64) NOT NULL UNIQUE,            -- sha256 hex; raw token never stored
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  replaced_by_id  UUID REFERENCES refresh_tokens(id),
  user_agent      TEXT,
  ip              INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);

-- Runtime-tunable business settings (no redeploy needed)
CREATE TABLE settings (
  key          VARCHAR(80) PRIMARY KEY,
  value        JSONB NOT NULL,
  description  TEXT,
  updated_by   UUID REFERENCES users(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO settings (key, value, description) VALUES
  ('reservation_ttl_minutes',          '15',    'Checkout stock hold window (D-22)'),
  ('min_remaining_shelf_days',         '45',    'Min shelf life at delivery (D-24, verify with FSSAI)'),
  ('transit_buffer_days',              '7',     'Added to min shelf days when allocating batches'),
  ('low_stock_threshold',              '20',    'Storefront "Only X left" badge'),
  ('free_shipping_threshold_paise',    'null',  'Q-03: set before launch'),
  ('flat_shipping_fee_paise',          'null',  'Q-03: set before launch'),
  ('cod_enabled',                      'false', 'D-25: prepaid only at launch'),
  ('cod_fee_paise',                    '5000',  'Used only when cod_enabled'),
  ('packaging_cost_per_jar_paise',     '3200',  'Jar+cap+shrink+label+box+bubble estimate, settlements (D-41)'),
  ('pickup_cutoff_hour_ist',           '11',    'D-36'),
  ('max_qty_per_item',                 '10',    'Per-SKU cart limit'),
  ('min_courier_rating',               '4.0',   'Phase 6 courier filter (Shiprocket rating, 0-5 scale)'),
  ('max_courier_etd_days',             '7',     'Phase 6 courier filter'),
  ('shiprocket_wallet_min_paise',      '200000','Phase 6 low-wallet admin alert threshold')
ON CONFLICT (key) DO NOTHING;

-- Kitchens / warehouses (Shiprocket pickup addresses)
CREATE TABLE pickup_locations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                    VARCHAR(40) UNIQUE NOT NULL,     -- e.g. HP-KULLU-01
  name                    VARCHAR(120) NOT NULL,
  contact_name            VARCHAR(120) NOT NULL,
  contact_phone           VARCHAR(15) NOT NULL CHECK (contact_phone ~ '^\+91[6-9][0-9]{9}$'),
  address_line1           VARCHAR(200) NOT NULL,
  address_line2           VARCHAR(200),
  city                    VARCHAR(80) NOT NULL,
  state                   VARCHAR(80) NOT NULL,
  pincode                 CHAR(6) NOT NULL CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  shiprocket_pickup_name  VARCHAR(60) UNIQUE,              -- nickname registered in Shiprocket
  fssai_license_no        VARCHAR(20),
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_pickup_locations_updated_at BEFORE UPDATE ON pickup_locations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_pickup_locations (
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pickup_location_id  UUID NOT NULL REFERENCES pickup_locations(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, pickup_location_id)
);

-- Every admin/partner mutation (settings change, manual status change, refund, adjustment)
CREATE TABLE admin_audit_log (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id     UUID REFERENCES users(id),
  action       VARCHAR(80) NOT NULL,          -- e.g. ORDER_CANCEL, SETTING_UPDATE, STOCK_ADJUST
  entity_type  VARCHAR(40) NOT NULL,
  entity_id    TEXT NOT NULL,
  before       JSONB,
  after        JSONB,
  ip           INET,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_entity ON admin_audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON admin_audit_log(created_at DESC);
CREATE TRIGGER trg_audit_append_only BEFORE UPDATE OR DELETE ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- migrate:down
DROP TABLE IF EXISTS admin_audit_log, user_pickup_locations, pickup_locations, settings, refresh_tokens, users;
DROP TYPE IF EXISTS user_role;
DROP FUNCTION IF EXISTS forbid_mutation(), set_updated_at();
DROP EXTENSION IF EXISTS citext;
```

---

## 🥩 `0002_catalog_inventory.sql` (Phase 3)

> **D-49 changes vs. the first draft:** lab/CA-dependent columns (`gst_rate_bp`, `shelf_life_days`, `ingredients`, `packed_weight_g`) are nullable so products can exist as drafts before Q-01/Q-07/D-34 are confirmed; `products_publishable` CHECK guarantees them (plus `nutrition` and ≥ 1 image) before `is_active = TRUE`. `ist_today()` replaces `CURRENT_DATE` everywhere a business day matters (DB servers run in UTC). Added `idx_batches_location`.

```sql
-- migrate:up
CREATE OR REPLACE FUNCTION ist_today() RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (NOW() AT TIME ZONE 'Asia/Kolkata')::date
$$;

CREATE TYPE meat_type AS ENUM ('CHICKEN', 'MUTTON', 'FISH', 'PRAWN');
CREATE TYPE inventory_movement_type AS ENUM ('PRODUCTION', 'RESERVE', 'RELEASE', 'ADJUSTMENT', 'WASTAGE');

CREATE TABLE products (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                  VARCHAR(40) UNIQUE NOT NULL,           -- e.g. CHK250
  slug                 VARCHAR(120) UNIQUE NOT NULL,          -- himachali-chicken-pickle-250g
  product_group        VARCHAR(80) NOT NULL,                  -- himachali-chicken-pickle (250g/500g toggle)
  title                VARCHAR(150) NOT NULL,
  short_description    VARCHAR(300),
  description          TEXT NOT NULL,
  meat_type            meat_type NOT NULL,
  net_weight_g         INT NOT NULL CHECK (net_weight_g > 0),
  packed_weight_g      INT,                                   -- D-33/D-34: jar + box + bubble (required to publish)
  package_length_cm    NUMERIC(5,1) NOT NULL DEFAULT 15,
  package_breadth_cm   NUMERIC(5,1) NOT NULL DEFAULT 10,
  package_height_cm    NUMERIC(5,1) NOT NULL DEFAULT 10,
  price_paise          BIGINT NOT NULL CHECK (price_paise > 0),   -- MRP, GST inclusive (D-26)
  compare_price_paise  BIGINT,
  hsn_code             VARCHAR(8) NOT NULL DEFAULT '2001',
  gst_rate_bp          INT CHECK (gst_rate_bp BETWEEN 0 AND 2800),  -- 500 = 5%. No default: Q-01
  ingredients          TEXT,
  allergens            TEXT,
  spice_level          SMALLINT CHECK (spice_level BETWEEN 1 AND 5),
  shelf_life_days      INT CHECK (shelf_life_days > 0),       -- from lab test (Q-07)
  storage_instructions TEXT,
  nutrition            JSONB,                                  -- per 100g: energy_kcal, protein_g, fat_g, carbs_g, sugar_g, sodium_mg
  images               TEXT[] NOT NULL DEFAULT '{}',           -- R2 public keys; [0] = primary
  is_active            BOOLEAN NOT NULL DEFAULT FALSE,         -- draft until admin publishes
  sort_order           INT NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT products_packed_weight CHECK (packed_weight_g >= net_weight_g),
  CONSTRAINT products_compare_price CHECK (compare_price_paise IS NULL OR compare_price_paise > price_paise),
  -- D-49: the API returns 422 with the missing fields first; this is the backstop
  CONSTRAINT products_publishable CHECK (
    NOT is_active OR (
      gst_rate_bp IS NOT NULL AND shelf_life_days IS NOT NULL AND ingredients IS NOT NULL
      AND packed_weight_g IS NOT NULL AND nutrition IS NOT NULL AND cardinality(images) >= 1
    )
  )
);
CREATE UNIQUE INDEX uq_products_group_weight ON products(product_group, net_weight_g);
CREATE INDEX idx_products_active ON products(is_active, sort_order);
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Batch code format: PK-<YYMM>-<SKU>-<2-digit seq>, e.g. PK-2610-CHK250-01 (server generated, D-42)
CREATE TABLE inventory_batches (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id           UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  pickup_location_id   UUID NOT NULL REFERENCES pickup_locations(id),
  batch_code           VARCHAR(40) UNIQUE NOT NULL,
  manufactured_at      DATE NOT NULL,
  expiry_date          DATE NOT NULL,
  initial_quantity     INT NOT NULL CHECK (initial_quantity > 0),
  available_stock      INT NOT NULL,
  total_cost_paise     BIGINT NOT NULL CHECK (total_cost_paise >= 0),   -- partner enters total (meat+oil+spices+jar)
  cost_per_unit_paise  BIGINT GENERATED ALWAYS AS (ROUND(total_cost_paise::numeric / initial_quantity)::bigint) STORED,
  created_by_id        UUID REFERENCES users(id),
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT batches_stock_bounds CHECK (available_stock >= 0 AND available_stock <= initial_quantity),
  CONSTRAINT batches_dates        CHECK (expiry_date > manufactured_at)
);
-- FIFO-by-expiry allocation index (D-23)
CREATE INDEX idx_batches_fifo ON inventory_batches(product_id, expiry_date, manufactured_at) WHERE available_stock > 0;
CREATE INDEX idx_batches_location ON inventory_batches(pickup_location_id);
CREATE TRIGGER trg_batches_updated_at BEFORE UPDATE ON inventory_batches FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Stock ledger. Invariant: available_stock = SUM(quantity_delta) per batch.
CREATE TABLE inventory_movements (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id        UUID NOT NULL REFERENCES inventory_batches(id),
  movement_type   inventory_movement_type NOT NULL,
  quantity_delta  INT NOT NULL CHECK (quantity_delta <> 0),
  order_id        UUID,                     -- FK added in 0003 (orders table doesn't exist yet)
  actor_id        UUID REFERENCES users(id),
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_movements_batch ON inventory_movements(batch_id, created_at);
CREATE INDEX idx_movements_order ON inventory_movements(order_id) WHERE order_id IS NOT NULL;
CREATE TRIGGER trg_movements_append_only BEFORE UPDATE OR DELETE ON inventory_movements FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- migrate:down
DROP TABLE IF EXISTS inventory_movements, inventory_batches, products;
DROP TYPE IF EXISTS inventory_movement_type, meat_type;
DROP FUNCTION IF EXISTS ist_today();
```

---

## 🧾 `0003_orders_payments.sql` (Phase 5)

```sql
-- migrate:up
CREATE TYPE order_status AS ENUM (
  'PENDING_PAYMENT', 'EXPIRED', 'CONFIRMED', 'AWAITING_PACKING', 'PACKED', 'PICKUP_SCHEDULED',
  'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED', 'DELIVERED',
  'RTO_IN_TRANSIT', 'RTO_DELIVERED', 'CANCELLED', 'LOST'
);
CREATE TYPE payment_status         AS ENUM ('UNPAID', 'PAID', 'REFUND_PENDING', 'PARTIALLY_REFUNDED', 'REFUNDED');
CREATE TYPE payment_attempt_status AS ENUM ('CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED');
CREATE TYPE allocation_status      AS ENUM ('RESERVED', 'COMMITTED', 'RELEASED');
CREATE TYPE refund_status          AS ENUM ('PENDING', 'PROCESSED', 'FAILED');
CREATE TYPE actor_type             AS ENUM ('SYSTEM', 'CUSTOMER', 'ADMIN', 'KITCHEN_PARTNER', 'RAZORPAY', 'SHIPROCKET');

CREATE TABLE addresses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       VARCHAR(30),                         -- Home / Office
  full_name   VARCHAR(120) NOT NULL,
  phone       VARCHAR(15) NOT NULL CHECK (phone ~ '^\+91[6-9][0-9]{9}$'),
  line1       VARCHAR(200) NOT NULL,
  line2       VARCHAR(200),
  landmark    VARCHAR(120),
  city        VARCHAR(80) NOT NULL,
  state       VARCHAR(80) NOT NULL,
  pincode     CHAR(6) NOT NULL CHECK (pincode ~ '^[1-9][0-9]{5}$'),
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_addresses_one_default ON addresses(user_id) WHERE is_default;
CREATE TRIGGER trg_addresses_updated_at BEFORE UPDATE ON addresses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE orders (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code              VARCHAR(12) UNIQUE NOT NULL CHECK (order_code ~ '^PK-[0-9A-HJKMNP-TV-Z]{6}$'), -- D-27
  idempotency_key         VARCHAR(64) UNIQUE NOT NULL,          -- client-generated per checkout attempt
  user_id                 UUID REFERENCES users(id),            -- NULL = guest checkout (D-18)
  customer_name           VARCHAR(120) NOT NULL,
  customer_phone          VARCHAR(15) NOT NULL CHECK (customer_phone ~ '^\+91[6-9][0-9]{9}$'),
  customer_email          CITEXT,
  shipping_address        JSONB NOT NULL,                       -- immutable snapshot (AddressSchema)
  whatsapp_opt_in         BOOLEAN NOT NULL DEFAULT FALSE,       -- checkout consent (Phase 8, DPDP); false → SMS for critical only
  whatsapp_opt_in_at      TIMESTAMPTZ,
  pickup_location_id      UUID NOT NULL REFERENCES pickup_locations(id),
  status                  order_status NOT NULL DEFAULT 'PENDING_PAYMENT',
  payment_status          payment_status NOT NULL DEFAULT 'UNPAID',
  payment_method          VARCHAR(10) NOT NULL DEFAULT 'PREPAID' CHECK (payment_method IN ('PREPAID', 'COD')),
  subtotal_paise          BIGINT NOT NULL CHECK (subtotal_paise >= 0),
  shipping_fee_paise      BIGINT NOT NULL DEFAULT 0 CHECK (shipping_fee_paise >= 0),
  cod_fee_paise           BIGINT NOT NULL DEFAULT 0 CHECK (cod_fee_paise >= 0),
  discount_paise          BIGINT NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  total_paise             BIGINT NOT NULL CHECK (total_paise > 0),
  tax_paise               BIGINT NOT NULL DEFAULT 0 CHECK (tax_paise >= 0),  -- GST portion included in total
  coupon_code             VARCHAR(40),                           -- FK to coupons in v2
  gateway_order_id        VARCHAR(40) UNIQUE,                    -- Razorpay order_xxx
  reservation_expires_at  TIMESTAMPTZ NOT NULL,
  invoice_number          VARCHAR(30) UNIQUE,                    -- PK/2026-27/000123 (D-32)
  invoice_key             TEXT,                                  -- private R2 key
  ops_issue               TEXT,                                  -- NOT NULL = needs admin attention
  cancel_reason           TEXT,
  confirmed_at            TIMESTAMPTZ,
  packed_at               TIMESTAMPTZ,
  shipped_at              TIMESTAMPTZ,
  delivered_at            TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orders_total_math CHECK (total_paise = subtotal_paise + shipping_fee_paise + cod_fee_paise - discount_paise)
);
CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);
CREATE INDEX idx_orders_user           ON orders(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_orders_phone          ON orders(customer_phone);
CREATE INDEX idx_orders_pending_expiry ON orders(reservation_expires_at) WHERE status = 'PENDING_PAYMENT';
CREATE INDEX idx_orders_ops_issue      ON orders(created_at) WHERE ops_issue IS NOT NULL;
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE inventory_movements
  ADD CONSTRAINT fk_movements_order FOREIGN KEY (order_id) REFERENCES orders(id);

CREATE TABLE order_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id         UUID NOT NULL REFERENCES products(id),
  sku                VARCHAR(40) NOT NULL,          -- snapshot fields: product edits never change history
  title              VARCHAR(150) NOT NULL,
  net_weight_g       INT NOT NULL,
  quantity           INT NOT NULL CHECK (quantity > 0),
  unit_price_paise   BIGINT NOT NULL CHECK (unit_price_paise > 0),
  total_price_paise  BIGINT NOT NULL,
  hsn_code           VARCHAR(8) NOT NULL,
  gst_rate_bp        INT NOT NULL,
  CONSTRAINT order_items_math CHECK (total_price_paise = unit_price_paise * quantity),
  CONSTRAINT order_items_unique_product UNIQUE (order_id, product_id)
);

-- One order item can be fulfilled from multiple batches (D-23)
CREATE TABLE order_item_allocations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id  UUID NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  batch_id       UUID NOT NULL REFERENCES inventory_batches(id),
  quantity       INT NOT NULL CHECK (quantity > 0),
  status         allocation_status NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_allocations_item  ON order_item_allocations(order_item_id);
CREATE INDEX idx_allocations_batch ON order_item_allocations(batch_id) WHERE status <> 'RELEASED';
CREATE TRIGGER trg_allocations_updated_at BEFORE UPDATE ON order_item_allocations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE order_status_logs (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  from_status  order_status,
  to_status    order_status NOT NULL,
  actor_type   actor_type NOT NULL,
  actor_id     UUID REFERENCES users(id),
  reason       TEXT,
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_status_logs_order ON order_status_logs(order_id, created_at);
CREATE TRIGGER trg_status_logs_append_only BEFORE UPDATE OR DELETE ON order_status_logs FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Every gateway payment attempt (an order may have several: failed UPI → retry → success)
CREATE TABLE payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  gateway             VARCHAR(20) NOT NULL DEFAULT 'RAZORPAY',
  gateway_order_id    VARCHAR(40) NOT NULL,
  gateway_payment_id  VARCHAR(40) NOT NULL UNIQUE,
  amount_paise        BIGINT NOT NULL CHECK (amount_paise > 0),
  fee_paise           BIGINT,                 -- from Razorpay settlement data (D-41)
  fee_tax_paise       BIGINT,                 -- GST on gateway fee
  method              VARCHAR(20),            -- upi / card / netbanking / wallet
  status              payment_attempt_status NOT NULL,
  error_code          VARCHAR(60),
  error_description   TEXT,
  raw                 JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE refunds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  payment_id          UUID NOT NULL REFERENCES payments(id),
  idempotency_key     VARCHAR(100) UNIQUE NOT NULL,    -- refund:<paymentId>:<reason> (D-52)
  gateway_refund_id   VARCHAR(40) UNIQUE,
  amount_paise        BIGINT NOT NULL CHECK (amount_paise > 0),
  reason              VARCHAR(60) NOT NULL,            -- CUSTOMER_CANCEL | LATE_PAYMENT_STOCKOUT | AMOUNT_MISMATCH | RTO | DAMAGED | LOST
  notes               TEXT,
  status              refund_status NOT NULL DEFAULT 'PENDING',
  initiated_by_type   actor_type NOT NULL,
  initiated_by_id     UUID REFERENCES users(id),
  processed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_refunds_order ON refunds(order_id);
CREATE TRIGGER trg_refunds_updated_at BEFORE UPDATE ON refunds FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Webhook idempotency store (Razorpay + Shiprocket)
CREATE TABLE webhook_events (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider      VARCHAR(20) NOT NULL CHECK (provider IN ('RAZORPAY', 'SHIPROCKET')),
  event_id      VARCHAR(100) NOT NULL,          -- Razorpay: X-Razorpay-Event-Id; Shiprocket: sha256(awb+status+time)
  event_type    VARCHAR(60) NOT NULL,
  payload       JSONB NOT NULL,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ,
  attempts      INT NOT NULL DEFAULT 0,
  last_error    TEXT,
  CONSTRAINT uq_webhook_event UNIQUE (provider, event_id)
);
CREATE INDEX idx_webhook_unprocessed ON webhook_events(received_at) WHERE processed_at IS NULL;

-- GST invoice numbering per financial year, allocated with SELECT ... FOR UPDATE
CREATE TABLE invoice_sequences (
  financial_year  VARCHAR(7) PRIMARY KEY,       -- '2026-27'
  last_number     INT NOT NULL DEFAULT 0
);

-- Seller details for tax invoices (Q-02 open → null; D-52)
INSERT INTO settings (key, value, description) VALUES
  ('seller_details', 'null', 'Q-02: { legalName, gstin, addressLine, city, state, stateCode, pincode } for tax invoices')
ON CONFLICT (key) DO NOTHING;

-- migrate:down
DROP TABLE IF EXISTS invoice_sequences, webhook_events, refunds, payments, order_status_logs,
  order_item_allocations, order_items;
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS fk_movements_order;
DROP TABLE IF EXISTS orders, addresses;
DROP TYPE IF EXISTS actor_type, refund_status, allocation_status, payment_attempt_status, payment_status, order_status;
```

---

## 🚚 `0004_logistics.sql` (Phase 6)

```sql
-- migrate:up
CREATE TABLE shipments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT, -- 1:1 for now; reship support in v2
  shiprocket_order_id     VARCHAR(30) UNIQUE,
  shiprocket_shipment_id  VARCHAR(30) UNIQUE,
  courier_company_id      INT,
  courier_name            VARCHAR(80),
  awb_code                VARCHAR(40) UNIQUE,
  label_key               TEXT,                  -- PRIVATE R2 key (D-11)
  manifest_key            TEXT,
  dead_weight_g           INT,
  volumetric_weight_g     INT,                   -- D-53 l: L×B×H/5 g, logged with the dead weight
  length_cm               NUMERIC(5,1),
  breadth_cm              NUMERIC(5,1),
  height_cm               NUMERIC(5,1),
  charged_weight_g        INT,                   -- courier's billed weight (weight dispute tracking)
  freight_paise           BIGINT,                -- actual forward shipping charge (D-41)
  rto_freight_paise       BIGINT,
  pickup_scheduled_for    DATE,
  pickup_requested_at     TIMESTAMPTZ,           -- D-53 l: 48 h "pickup missed" alert
  pickup_token            VARCHAR(60),
  etd                     DATE,                  -- expected delivery date from courier
  last_status_text        VARCHAR(80),
  last_status_at          TIMESTAMPTZ,
  booking_attempts        INT NOT NULL DEFAULT 0,
  last_error              TEXT,
  cancelled_at            TIMESTAMPTZ,           -- D-53 l: AWB / Shiprocket order cancelled (idempotency)
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_shipments_pickup_date ON shipments(pickup_scheduled_for);
CREATE TRIGGER trg_shipments_updated_at BEFORE UPDATE ON shipments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE tracking_events (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shipment_id  UUID NOT NULL REFERENCES shipments(id) ON DELETE RESTRICT,
  status_code  VARCHAR(20),
  status_text  VARCHAR(80) NOT NULL,
  location     VARCHAR(120),
  event_time   TIMESTAMPTZ NOT NULL,
  source       VARCHAR(10) NOT NULL CHECK (source IN ('WEBHOOK', 'POLL')),
  raw          JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_tracking_event UNIQUE (shipment_id, status_text, event_time)
);
CREATE INDEX idx_tracking_shipment ON tracking_events(shipment_id, event_time DESC);

-- migrate:down
DROP TABLE IF EXISTS tracking_events, shipments;
```

---

## 🔔 `0005_notifications.sql` (Phase 7)

```sql
-- migrate:up
CREATE TYPE notification_channel AS ENUM ('WHATSAPP', 'SMS', 'EMAIL', 'PUSH');
CREATE TYPE notification_status  AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- Web Push subscriptions for the Partner PWA (D-16)
CREATE TABLE push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_push_user ON push_subscriptions(user_id);

CREATE TABLE notifications_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID REFERENCES orders(id),
  user_id              UUID REFERENCES users(id),
  channel              notification_channel NOT NULL,
  recipient            VARCHAR(255) NOT NULL,         -- phone / email / push endpoint id
  template             VARCHAR(60) NOT NULL,          -- order_confirmed, new_order_alert, ...
  variables            JSONB NOT NULL DEFAULT '{}',
  provider             VARCHAR(30),
  provider_message_id  VARCHAR(120) UNIQUE,
  status               notification_status NOT NULL DEFAULT 'QUEUED',
  error                TEXT,
  sent_at              TIMESTAMPTZ,
  delivered_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_order  ON notifications_log(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_notifications_status ON notifications_log(status, created_at);
CREATE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON notifications_log FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- migrate:down
DROP TABLE IF EXISTS notifications_log, push_subscriptions;
DROP TYPE IF EXISTS notification_status, notification_channel;
```

---

## 💰 `0006_settlements.sql` (Phase 9)

```sql
-- migrate:up
CREATE TYPE expense_category  AS ENUM ('ADS', 'PACKAGING', 'RAW_MATERIAL', 'LOGISTICS', 'SOFTWARE', 'COMPLIANCE', 'OTHER');
CREATE TYPE settlement_status AS ENUM ('DRAFT', 'FINALIZED', 'PAID');

CREATE TABLE settlements (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start                  DATE NOT NULL,
  period_end                    DATE NOT NULL,
  status                        settlement_status NOT NULL DEFAULT 'DRAFT',
  partner_split_bp              INT NOT NULL DEFAULT 5000 CHECK (partner_split_bp BETWEEN 0 AND 10000),
  orders_count                  INT NOT NULL DEFAULT 0,
  jars_count                    INT NOT NULL DEFAULT 0,
  revenue_ex_gst_paise          BIGINT NOT NULL DEFAULT 0,
  raw_cost_paise                BIGINT NOT NULL DEFAULT 0,
  packaging_cost_paise          BIGINT NOT NULL DEFAULT 0,
  freight_paise                 BIGINT NOT NULL DEFAULT 0,
  gateway_fee_paise             BIGINT NOT NULL DEFAULT 0,
  refunds_paise                 BIGINT NOT NULL DEFAULT 0,
  rto_freight_paise             BIGINT NOT NULL DEFAULT 0,
  shared_expenses_paise         BIGINT NOT NULL DEFAULT 0,
  net_profit_paise              BIGINT NOT NULL DEFAULT 0,
  partner_share_paise           BIGINT NOT NULL DEFAULT 0,
  admin_share_paise             BIGINT NOT NULL DEFAULT 0,
  expense_reimbursement_paise   BIGINT NOT NULL DEFAULT 0,   -- D-56: partner-paid expenses paid back
  partner_payout_paise          BIGINT NOT NULL DEFAULT 0,   -- raw cost + partner share + reimbursement (CHECK)
  warnings                      JSONB NOT NULL DEFAULT '[]', -- D-56: missing freight / gateway fee → finalize blocked
  bank_reference                VARCHAR(80),
  statement_key                 TEXT,                         -- private R2 PDF
  finalized_by                  UUID REFERENCES users(id),
  finalized_at                  TIMESTAMPTZ,
  paid_at                       TIMESTAMPTZ,
  partner_acknowledged_by       UUID REFERENCES users(id),    -- D-40
  partner_acknowledged_at       TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT settlements_period CHECK (period_end >= period_start),
  CONSTRAINT uq_settlement_period UNIQUE (period_start, period_end),
  CONSTRAINT settlements_split_math CHECK (partner_share_paise + admin_share_paise = net_profit_paise)
);
CREATE TRIGGER trg_settlements_updated_at BEFORE UPDATE ON settlements FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE settlement_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id         UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,  -- only DRAFTs are ever deleted
  order_id              UUID NOT NULL UNIQUE REFERENCES orders(id),                  -- an order is settled exactly once
  closed_at             TIMESTAMPTZ NOT NULL,                                        -- D-56
  jars                  INT NOT NULL,                                                -- D-56
  revenue_ex_gst_paise  BIGINT NOT NULL,
  raw_cost_paise        BIGINT NOT NULL,
  packaging_cost_paise  BIGINT NOT NULL,
  freight_paise         BIGINT NOT NULL,
  gateway_fee_paise     BIGINT NOT NULL,
  refunds_paise         BIGINT NOT NULL,
  rto_freight_paise     BIGINT NOT NULL,
  net_paise             BIGINT NOT NULL
);
CREATE INDEX idx_settlement_items_settlement ON settlement_items(settlement_id);

CREATE TABLE expenses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category       expense_category NOT NULL,
  amount_paise   BIGINT NOT NULL CHECK (amount_paise > 0),
  incurred_on    DATE NOT NULL,
  description    TEXT NOT NULL,
  paid_by_id     UUID REFERENCES users(id),     -- which partner paid out of pocket
  receipt_key    TEXT,                          -- private R2
  settlement_id  UUID REFERENCES settlements(id),
  created_by_id  UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_expenses_incurred ON expenses(incurred_on);
CREATE TRIGGER trg_expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- migrate:down
DROP TABLE IF EXISTS expenses, settlement_items, settlements;
DROP TYPE IF EXISTS settlement_status, expense_category;
```

---

## 🔒 Canonical Transaction Patterns

Stock reservation, payment confirmation, late payment, expiry sweeper aur `transitionOrder()` ka reference code **`07-order-state-machine.md` §4** me hai. Purana `processPaidOrder()` example (single batch, no expiry filter, no split) **deprecated** hai — use mat karna.

### Common Read Query: Storefront Stock (sellable only)

```sql
SELECT p.id, p.slug, p.title, p.price_paise, p.compare_price_paise,
       COALESCE(SUM(b.available_stock), 0)::int AS sellable_stock
  FROM products p
  LEFT JOIN inventory_batches b
         ON b.product_id = p.id
        AND b.available_stock > 0
        AND b.expiry_date >= ist_today() + $1::int   -- min_remaining_shelf_days + transit_buffer_days (D-24); IST day (D-49)
 WHERE p.is_active = TRUE
 GROUP BY p.id
 ORDER BY p.sort_order, p.title;
```

> Yahi `$1` filter allocation query (`reserveForItem`) me bhi use hota hai — **storefront count aur actual allocation kabhi mismatch nahi honge**.

### Invoice Number Allocation

```sql
INSERT INTO invoice_sequences (financial_year, last_number) VALUES ($1, 0)
ON CONFLICT (financial_year) DO NOTHING;

UPDATE invoice_sequences SET last_number = last_number + 1
 WHERE financial_year = $1
RETURNING last_number;   -- row lock held till COMMIT → gap-free, no duplicates
```
