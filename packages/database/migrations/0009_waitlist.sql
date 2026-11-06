-- Pre-launch waitlist (audit 2026-11-03, R-5): the public /coming-soon teaser collects a phone number
-- and/or e-mail with explicit consent (DPDP) so launch traffic is not wasted. No login (D-18).
-- Duplicate phone / e-mail is a no-op for the visitor (INSERT ... ON CONFLICT DO NOTHING).
-- migrate:up
CREATE TABLE waitlist_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       VARCHAR(16),                             -- E.164: +91XXXXXXXXXX
  email       VARCHAR(254),                            -- lower-cased by the API
  name        VARCHAR(80),
  source      VARCHAR(20) NOT NULL CHECK (source IN ('coming-soon', 'storefront')),
  consent_at  TIMESTAMPTZ NOT NULL,                    -- "notify me when the store opens"
  ip_hash     CHAR(64),                                -- HMAC-SHA256 of the client IP, never the IP
  user_agent  VARCHAR(300),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT waitlist_contact_required CHECK (phone IS NOT NULL OR email IS NOT NULL)
);
CREATE UNIQUE INDEX uq_waitlist_phone ON waitlist_entries(phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX uq_waitlist_email ON waitlist_entries(email) WHERE email IS NOT NULL;
CREATE INDEX idx_waitlist_created ON waitlist_entries(created_at DESC);
CREATE TRIGGER trg_waitlist_updated_at BEFORE UPDATE ON waitlist_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- migrate:down
DROP TABLE IF EXISTS waitlist_entries;
