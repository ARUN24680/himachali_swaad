-- migrate:up
-- Phase 10 §10.2: indexes for the hot read paths found in the load test + query review (D-57).
-- Plain CREATE INDEX: it ships before go-live while the tables are tiny. dbmate sends a file as one
-- multi-statement query, which Postgres wraps in a transaction, so CONCURRENTLY can't be used here —
-- later indexes on a large live table go in single-statement `transaction:false` migrations.

-- Admin orders list, default sort (all tabs) + date range filters
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC);
-- Dashboard revenue, GST export, reconcile sweeper, settlements
CREATE INDEX IF NOT EXISTS idx_orders_confirmed ON orders (confirmed_at) WHERE confirmed_at IS NOT NULL;
-- Partner packing queue: own kitchen + status, oldest first
CREATE INDEX IF NOT EXISTS idx_orders_location_status ON orders (pickup_location_id, status, confirmed_at);
-- Admin "webhook failures" view
CREATE INDEX IF NOT EXISTS idx_webhook_errors ON webhook_events (received_at DESC) WHERE last_error IS NOT NULL;
-- Message dedup / resend check (template + recipient within a window)
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications_log (recipient, template, created_at);
-- Settlement generate: unsettled expenses in a period; settlement detail
CREATE INDEX IF NOT EXISTS idx_expenses_open ON expenses (incurred_on) WHERE settlement_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_settlement ON expenses (settlement_id) WHERE settlement_id IS NOT NULL;

-- migrate:down
DROP INDEX IF EXISTS idx_expenses_settlement;
DROP INDEX IF EXISTS idx_expenses_open;
DROP INDEX IF EXISTS idx_notifications_recipient;
DROP INDEX IF EXISTS idx_webhook_errors;
DROP INDEX IF EXISTS idx_orders_location_status;
DROP INDEX IF EXISTS idx_orders_confirmed;
DROP INDEX IF EXISTS idx_orders_created;
