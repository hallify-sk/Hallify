-- Migration 0019 — record acceptance of the legal documents.
--
-- Production already has this table (from the unmerged migration
-- 0004_legal_acceptances on fix/first-sale-blockers), but nothing wrote to it and local/dev databases never got
-- it. Client registration on a venue's site now records each acceptance here.
--
-- Same definition as the production table, and IF NOT EXISTS throughout, so this is a
-- no-op where the table is already present and safe to apply to production data.
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
