-- Migration 011: permanent archive of closed organizations (legal/accounting).
-- D1 manages the transaction for a --file run; no explicit BEGIN/COMMIT.
-- Run once per DB (local → dev → prod).

CREATE TABLE IF NOT EXISTS closed_organizations (
  id                     TEXT PRIMARY KEY NOT NULL,
  org_id                 TEXT NOT NULL,
  name                   TEXT NOT NULL,
  slug                   TEXT,
  plan                   TEXT,
  status                 TEXT,
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  member_count           INTEGER NOT NULL DEFAULT 0,
  reservation_count      INTEGER NOT NULL DEFAULT 0,
  org_created_at         TEXT,
  closed_at              TEXT NOT NULL DEFAULT (datetime('now')),
  closed_by              TEXT,
  closed_by_email        TEXT,
  closed_reason          TEXT,
  snapshot               TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS closed_organizations_closed_at
  ON closed_organizations (closed_at DESC);
