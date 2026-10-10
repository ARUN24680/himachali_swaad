-- 0001_foundation (Phase 1) — copied verbatim from architecture/01-database-schema-models.md.
-- Applied migrations are never edited; write a new migration instead.

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
