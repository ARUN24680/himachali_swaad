-- migrate:up
-- Phase 6: Shiprocket shipments + tracking (architecture/01 §0004, 07 §5).
-- Additions vs doc 01 (D-53): pickup_requested_at (48 h "pickup missed" alert), cancelled_at (AWB
-- cancel idempotency) and the declared volumetric weight.
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
  volumetric_weight_g     INT,
  length_cm               NUMERIC(5,1),
  breadth_cm              NUMERIC(5,1),
  height_cm               NUMERIC(5,1),
  charged_weight_g        INT,                   -- courier's billed weight (weight dispute tracking)
  freight_paise           BIGINT,                -- actual forward shipping charge (D-41)
  rto_freight_paise       BIGINT,
  pickup_scheduled_for    DATE,
  pickup_requested_at     TIMESTAMPTZ,
  pickup_token            VARCHAR(60),
  etd                     DATE,                  -- expected delivery date from courier
  last_status_text        VARCHAR(80),
  last_status_at          TIMESTAMPTZ,
  booking_attempts        INT NOT NULL DEFAULT 0,
  last_error              TEXT,
  cancelled_at            TIMESTAMPTZ,
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
