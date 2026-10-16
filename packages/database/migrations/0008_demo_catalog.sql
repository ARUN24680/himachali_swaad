-- Ownership for the optional local demo seed. No demo data is inserted by migration.
-- Clearing archives fixtures; append-only stock/audit history and order references survive.
-- migrate:up
CREATE TABLE demo_catalog_products (
  fixture_key TEXT PRIMARY KEY,
  product_id UUID UNIQUE NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  cleared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- migrate:down
-- Refuse to lose ownership of installed fixtures (which could expose cleared products).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM demo_catalog_products) THEN
    RAISE EXCEPTION 'Demo fixtures exist; retain their ownership and inventory history';
  END IF;
END $$;
DROP TABLE demo_catalog_products;
