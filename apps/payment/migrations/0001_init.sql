-- migrate:up
-- Direct UPI payment service (D-59). Lives in its OWN database (PAYMENT_DATABASE_URL, e.g. pk_payment)
-- so removing the service is: delete apps/payment, drop the database. Money = integer paise (D-26).

CREATE TYPE upi_order_status   AS ENUM ('created', 'paid', 'expired');
CREATE TYPE upi_refund_status  AS ENUM ('pending', 'processed', 'failed');
CREATE TYPE upi_alert_source   AS ENUM ('EMAIL', 'ANDROID', 'DEV', 'ADMIN');
CREATE TYPE upi_alert_status   AS ENUM ('MATCHED', 'LINKED', 'UNMATCHED', 'DUPLICATE', 'REJECTED', 'DISMISSED');

-- One row per store order (Razorpay "order" equivalent). The customer pays `payable_paise`
-- (= amount − 0..99 paise) so that every open order has a different amount on the bank alert.
CREATE TABLE upi_orders (
  id              VARCHAR(40) PRIMARY KEY,               -- order_<random>, unguessable (it is in the pay URL)
  receipt         VARCHAR(40) NOT NULL,                  -- store order code (PK-XXXXXX)
  amount_paise    BIGINT NOT NULL CHECK (amount_paise >= 100),
  payable_paise   BIGINT NOT NULL,
  notes           JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          upi_order_status NOT NULL DEFAULT 'created',
  expires_at      TIMESTAMPTZ NOT NULL,                  -- store's jar reservation end (shown to the customer)
  hold_until      TIMESTAMPTZ NOT NULL,                  -- amount stays reserved until here (late-payment grace)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at         TIMESTAMPTZ,
  CONSTRAINT chk_payable CHECK (payable_paise <= amount_paise AND payable_paise >= amount_paise - 99 AND payable_paise >= 100),
  CONSTRAINT chk_hold CHECK (hold_until >= expires_at)
);
-- The matching invariant: an amount belongs to at most ONE open order
CREATE UNIQUE INDEX uq_upi_orders_open_amount ON upi_orders (payable_paise) WHERE status = 'created';
CREATE INDEX idx_upi_orders_receipt ON upi_orders (receipt);
CREATE INDEX idx_upi_orders_hold ON upi_orders (hold_until) WHERE status = 'created';

-- Bank credit alerts (e-mail via SES, Android observer, admin entry). Every alert is kept for audit.
CREATE TABLE upi_credit_alerts (
  id              BIGSERIAL PRIMARY KEY,
  source          upi_alert_source NOT NULL,
  external_id     VARCHAR(200) NOT NULL UNIQUE,          -- SNS MessageId / device:nonce — redelivery is a no-op
  utr             VARCHAR(40),
  amount_paise    BIGINT,
  credited_at     TIMESTAMPTZ NOT NULL,
  sender          VARCHAR(200),
  status          upi_alert_status NOT NULL,
  reason          TEXT,
  order_id        VARCHAR(40) REFERENCES upi_orders(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  resolved_by     VARCHAR(100)
);
CREATE INDEX idx_upi_alerts_review ON upi_credit_alerts (created_at) WHERE status = 'UNMATCHED';
CREATE INDEX idx_upi_alerts_utr ON upi_credit_alerts (utr) WHERE utr IS NOT NULL;

CREATE TABLE upi_payments (
  id              VARCHAR(40) PRIMARY KEY,               -- pay_<random>
  order_id        VARCHAR(40) NOT NULL REFERENCES upi_orders(id),
  -- What the store sees: the order amount when the exact payable amount arrived, otherwise
  -- received + offset, so the store's AMOUNT_MISMATCH path (refund + ops_issue) fires.
  amount_paise    BIGINT NOT NULL CHECK (amount_paise > 0),
  received_paise  BIGINT NOT NULL CHECK (received_paise > 0),
  utr             VARCHAR(40) NOT NULL UNIQUE,           -- one bank transfer can pay one order, once
  alert_id        BIGINT NOT NULL REFERENCES upi_credit_alerts(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_upi_payments_order ON upi_payments (order_id);

-- Refunds have no API on plain UPI: the store asks, an admin pays back and records the UTR.
CREATE TABLE upi_refunds (
  id              VARCHAR(40) PRIMARY KEY,               -- rfnd_<random>
  payment_id      VARCHAR(40) NOT NULL REFERENCES upi_payments(id),
  amount_paise    BIGINT NOT NULL CHECK (amount_paise > 0),
  status          upi_refund_status NOT NULL DEFAULT 'pending',
  idempotency_key VARCHAR(100) NOT NULL UNIQUE,
  notes           JSONB NOT NULL DEFAULT '{}'::jsonb,
  refund_utr      VARCHAR(40) UNIQUE,
  failure_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at      TIMESTAMPTZ,
  settled_by      VARCHAR(100)
);
CREATE INDEX idx_upi_refunds_pending ON upi_refunds (created_at) WHERE status = 'pending';

-- Android observer phones. The HMAC secret is stored AES-256-GCM encrypted (DEVICE_KEK).
CREATE TABLE upi_observer_devices (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label              VARCHAR(100) NOT NULL,
  secret_ciphertext  TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at       TIMESTAMPTZ,
  revoked_at         TIMESTAMPTZ
);

-- Replay protection for signed observer requests (rows older than the clock-skew window are swept)
CREATE TABLE upi_observer_nonces (
  device_id  UUID NOT NULL REFERENCES upi_observer_devices(id),
  nonce      VARCHAR(64) NOT NULL,
  seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (device_id, nonce)
);

-- Transactional outbox: webhooks to the store are written in the same transaction as the state change
CREATE TABLE upi_webhook_outbox (
  id               BIGSERIAL PRIMARY KEY,
  event_id         VARCHAR(60) NOT NULL UNIQUE,
  event            VARCHAR(40) NOT NULL,
  body             TEXT NOT NULL,
  attempts         INT NOT NULL DEFAULT 0,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at     TIMESTAMPTZ,
  dead_at          TIMESTAMPTZ,
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_upi_outbox_due ON upi_webhook_outbox (next_attempt_at) WHERE delivered_at IS NULL AND dead_at IS NULL;

-- Every manual action (CLI) — who did what
CREATE TABLE upi_admin_audit (
  id          BIGSERIAL PRIMARY KEY,
  actor       VARCHAR(100) NOT NULL,
  action      VARCHAR(60) NOT NULL,
  entity_id   VARCHAR(60),
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- migrate:down
DROP TABLE IF EXISTS upi_admin_audit;
DROP TABLE IF EXISTS upi_webhook_outbox;
DROP TABLE IF EXISTS upi_observer_nonces;
DROP TABLE IF EXISTS upi_observer_devices;
DROP TABLE IF EXISTS upi_refunds;
DROP TABLE IF EXISTS upi_payments;
DROP TABLE IF EXISTS upi_credit_alerts;
DROP TABLE IF EXISTS upi_orders;
DROP TYPE IF EXISTS upi_alert_status;
DROP TYPE IF EXISTS upi_alert_source;
DROP TYPE IF EXISTS upi_refund_status;
DROP TYPE IF EXISTS upi_order_status;
