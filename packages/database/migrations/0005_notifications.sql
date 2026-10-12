-- migrate:up
-- Phase 7: partner PWA push subscriptions + the log of every message we send (architecture/01 §0005).
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
  recipient            VARCHAR(255) NOT NULL,         -- phone / email / push subscription id
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
