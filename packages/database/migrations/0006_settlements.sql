-- migrate:up
-- Phase 9: partner settlements + business expenses (architecture/01 §0006, D-40, D-41).
-- Additions vs doc 01 (D-56): per-item jars + closed_at, expense reimbursement + warnings on the
-- settlement, created_by, and the partner split default as a setting.
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
  expense_reimbursement_paise   BIGINT NOT NULL DEFAULT 0,    -- partner-paid expenses paid back
  partner_payout_paise          BIGINT NOT NULL DEFAULT 0,    -- raw cost + partner share + reimbursement
  warnings                      JSONB NOT NULL DEFAULT '[]',  -- [{ orderCode, issue }] — finalize blocked while non-empty
  bank_reference                VARCHAR(80),
  statement_key                 TEXT,                         -- private R2 PDF
  created_by                    UUID REFERENCES users(id),
  finalized_by                  UUID REFERENCES users(id),
  finalized_at                  TIMESTAMPTZ,
  paid_at                       TIMESTAMPTZ,
  partner_acknowledged_by       UUID REFERENCES users(id),    -- D-40
  partner_acknowledged_at       TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT settlements_period CHECK (period_end >= period_start),
  CONSTRAINT uq_settlement_period UNIQUE (period_start, period_end),
  CONSTRAINT settlements_split_math CHECK (partner_share_paise + admin_share_paise = net_profit_paise),
  CONSTRAINT settlements_payout_math CHECK (partner_payout_paise = raw_cost_paise + partner_share_paise + expense_reimbursement_paise)
);
CREATE TRIGGER trg_settlements_updated_at BEFORE UPDATE ON settlements FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE settlement_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id         UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,  -- only DRAFTs are ever deleted
  order_id              UUID NOT NULL UNIQUE REFERENCES orders(id),                  -- an order is settled exactly once
  closed_at             TIMESTAMPTZ NOT NULL,
  jars                  INT NOT NULL,
  revenue_ex_gst_paise  BIGINT NOT NULL,
  raw_cost_paise        BIGINT NOT NULL,
  packaging_cost_paise  BIGINT NOT NULL,
  freight_paise         BIGINT NOT NULL,
  gateway_fee_paise     BIGINT NOT NULL,
  refunds_paise         BIGINT NOT NULL,
  rto_freight_paise     BIGINT NOT NULL,
  net_paise             BIGINT NOT NULL,
  CONSTRAINT settlement_items_net_math CHECK (
    net_paise = revenue_ex_gst_paise - raw_cost_paise - packaging_cost_paise - freight_paise
                - gateway_fee_paise - rto_freight_paise)
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
  settlement_id  UUID REFERENCES settlements(id) ON DELETE SET NULL,
  created_by_id  UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_expenses_incurred ON expenses(incurred_on);
CREATE TRIGGER trg_expenses_updated_at BEFORE UPDATE ON expenses FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO settings (key, value, description) VALUES
  ('partner_split_bp', '5000', 'D-41: partner share of the cycle net profit in basis points (5000 = 50 %)')
ON CONFLICT (key) DO NOTHING;

-- migrate:down
DELETE FROM settings WHERE key = 'partner_split_bp';
DROP TABLE IF EXISTS expenses, settlement_items, settlements;
DROP TYPE IF EXISTS settlement_status, expense_category;
