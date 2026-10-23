-- Migration 0024 — legal_acceptances for the Hallify (apex) sign-up.
--
-- Apex registration now records acceptance of the Terms and the Privacy Policy here.
-- The same table is created by 0019_legal_acceptances (venue-site client sign-up) and
-- already exists in production; this file carries the identical definition so the
-- apex sign-up works on its own. IF NOT EXISTS throughout: a no-op wherever the table
-- is already present, and safe on production data.
--
-- `version` is LEGAL_UPDATED from src/lib/legal.ts at the moment of acceptance.
-- D1 manages the transaction for a --file run; no explicit BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id          TEXT PRIMARY KEY NOT NULL,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id      TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  context     TEXT NOT NULL CHECK (context IN ('register', 'checkout')),
  version     TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS legal_acceptances_user ON legal_acceptances (user_id);
CREATE INDEX IF NOT EXISTS legal_acceptances_org  ON legal_acceptances (org_id);
