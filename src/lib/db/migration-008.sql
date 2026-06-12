-- Migration 008: custom domains (white-label per-org)

CREATE TABLE IF NOT EXISTS custom_domains (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain          TEXT        NOT NULL UNIQUE,
  cf_hostname_id  TEXT,                          -- Cloudflare custom hostname ID
  verified_at     TIMESTAMPTZ,                   -- NULL = pending verification
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS custom_domains_domain_idx ON custom_domains(domain);
CREATE INDEX IF NOT EXISTS custom_domains_org_idx    ON custom_domains(org_id);
