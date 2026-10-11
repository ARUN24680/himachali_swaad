-- 0003_orders_payments (Phase 5) — from architecture/01-database-schema-models.md.
-- D-52 deviations from doc 01: refunds.idempotency_key is VARCHAR(100) (`refund:<uuid>:LATE_PAYMENT_STOCKOUT`
-- is 65 chars), and the seller/invoice settings rows (Q-02 still open → null until the business fills them).
-- Order status changes only through transitionOrder() (D-29). Applied migrations are never edited.

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
  idempotency_key     VARCHAR(100) UNIQUE NOT NULL,    -- refund:<orderId>:<reason> (D-52: 64 was too short)
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

-- Seller details printed on the tax invoice (D-32). Q-02 (legal entity) is open → null; the invoice
-- worker refuses to issue a final invoice in production until seller_details is set (D-52).
INSERT INTO settings (key, value, description) VALUES
  ('seller_details', 'null', 'Q-02: { legalName, gstin, addressLine, city, state, stateCode, pincode } for tax invoices')
ON CONFLICT (key) DO NOTHING;

-- migrate:down
DELETE FROM settings WHERE key = 'seller_details';
DROP TABLE IF EXISTS invoice_sequences, webhook_events, refunds, payments, order_status_logs,
  order_item_allocations, order_items;
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS fk_movements_order;
DROP TABLE IF EXISTS orders, addresses;
DROP TYPE IF EXISTS actor_type, refund_status, allocation_status, payment_attempt_status, payment_status, order_status;
