-- Real custom-domain verification (D9).
--
-- A custom domain is served only once Cloudflare for SaaS reports its hostname and
-- certificate active (verified_at). Until then the settings page shows the DNS records
-- Cloudflare asks for and the last status it reported, refreshed by the page itself and
-- by the hourly Cron Trigger. Purely additive: existing rows keep their verified_at,
-- and the new columns start empty until the first check fills them.

ALTER TABLE custom_domains ADD COLUMN cf_status TEXT;      -- Cloudflare hostname status ('pending', 'active', ...)
ALTER TABLE custom_domains ADD COLUMN ssl_status TEXT;     -- certificate status ('pending_validation', 'active', ...)
ALTER TABLE custom_domains ADD COLUMN dns_records TEXT;    -- JSON: [{ type, name, value, purpose }] to create at the DNS provider
ALTER TABLE custom_domains ADD COLUMN check_error TEXT;    -- what Cloudflare reported as wrong, if anything
ALTER TABLE custom_domains ADD COLUMN checked_at TEXT;     -- last status check (UTC, datetime('now'))

-- The hourly sweep looks for unverified claims by age.
CREATE INDEX IF NOT EXISTS custom_domains_unverified_idx
  ON custom_domains (created_at) WHERE verified_at IS NULL;
