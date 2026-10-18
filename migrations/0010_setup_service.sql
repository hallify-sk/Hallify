-- "We set Hallify up for you" — a one-off, fixed-price service.
--
-- Separate from floorplan_requests because the two are not the same product and
-- do not behave the same way: the mapping add-on is quoted after a site visit
-- and has no price until we have been there, while this one costs a stated
-- amount and explicitly excludes the floorplan. Folding them into one table
-- would mean a price column that is meaningless for half the rows and a kind
-- column that every query has to remember to filter on.
--
-- Named for the service rather than for what it touches, so a second fixed-price
-- service can join it as another `kind` without the table name becoming a lie.
CREATE TABLE IF NOT EXISTS setup_requests (
  id           TEXT PRIMARY KEY NOT NULL,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES users(id),
  kind         TEXT NOT NULL DEFAULT 'full_setup'
               CHECK (kind IN ('full_setup')),
  -- What they want out of it: how many venues, any deadline, anything relevant.
  note         TEXT,
  -- The price AGREED AT THE TIME, in cents. Stored per row rather than read from
  -- a constant, so changing the list price later cannot silently rewrite what an
  -- existing request was promised.
  price_cents  INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'requested'
               CHECK (status IN ('requested', 'contacted', 'in_progress', 'delivered', 'cancelled')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_setup_requests_org ON setup_requests(org_id);
-- The platform queue: open requests first, oldest first.
CREATE INDEX IF NOT EXISTS idx_setup_requests_open ON setup_requests(status, created_at);
