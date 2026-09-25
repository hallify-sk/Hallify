-- Migration 0004 — record acceptance of the legal documents.
--
-- Nothing recorded that anyone had accepted the Terms of Service, so there was no
-- evidence of a contract with a paying venue — nor of the Data Processing Agreement,
-- which is an annex of the Terms and which GDPR Art. 28 requires to be concluded.
-- One row per acceptance: at signup (`register`) and when an owner starts a first
-- paid subscription for their organization (`checkout`).
--
-- `version` is LEGAL_UPDATED from src/lib/legal.ts at the moment of acceptance.
--
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
