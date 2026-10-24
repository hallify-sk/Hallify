-- Migration 0035 — record acceptance of the Data Processing Agreement.
--
-- The DPA (/dpa) is the Article 28 GDPR contract between an organisation (the
-- controller of its guests' and clients' data) and Hallify (the processor). An
-- account becomes a controller when it creates an organisation, so /app/org/new now
-- asks for the DPA to be accepted and records it here: one row per organisation per
-- accepted version, with the person who accepted it on the organisation's behalf.
--
-- A table of its own rather than a row in legal_acceptances: that table's `context`
-- CHECK (register, checkout) is fixed in production and SQLite cannot widen a CHECK
-- without rebuilding the table. This one is purely additive.
--
-- Both references are SET NULL, not CASCADE: the contract is the organisation's, so
-- the evidence must outlive the person who ticked the box leaving or deleting their
-- account, and outlive a deleted organisation.
-- `version` is LEGAL_UPDATED from src/lib/legal.ts at the moment of acceptance.
-- IF NOT EXISTS throughout; D1 manages the transaction, no explicit BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS dpa_acceptances (
  id          TEXT PRIMARY KEY NOT NULL,
  org_id      TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  version     TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS dpa_acceptances_org  ON dpa_acceptances (org_id);
CREATE INDEX IF NOT EXISTS dpa_acceptances_user ON dpa_acceptances (user_id);
