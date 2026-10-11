-- 0002_catalog_inventory (Phase 3) — from architecture/01-database-schema-models.md.
-- D-49: lab/CA-dependent fields (gst_rate_bp, shelf_life_days, ingredients, packed_weight_g) are
-- nullable for DRAFT products; products_publishable guarantees they exist before is_active = TRUE.
-- "Today" is the IST calendar day (ist_today()), not the DB server's CURRENT_DATE.
-- Applied migrations are never edited; write a new migration instead.

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
