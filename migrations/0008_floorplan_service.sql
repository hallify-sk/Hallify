-- "We map your venue for you" — a paid add-on quoted after a consultation.
--
-- A separate table rather than a column on halls, because this is a conversation
-- with Hallify rather than a property of the room: it has its own lifecycle, its
-- own timestamps, and a platform admin needs a queue to work through. A venue may
-- also legitimately request it more than once (a refit, a second floor).
--
-- Deliberately NOT tied to the tickets table: a ticket is scoped to an
-- organisation and surfaces in that organisation's own inbox, whereas this
-- request has to reach Hallify.

CREATE TABLE IF NOT EXISTS floorplan_requests (
  id           TEXT PRIMARY KEY NOT NULL,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hall_id      TEXT NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  requested_by TEXT NOT NULL REFERENCES users(id),
  -- What the operator told us: access, dimensions, deadline, anything relevant.
  note         TEXT,
  -- Quote-only: there is no price until we have spoken to them, so no amount is
  -- stored here and nothing is charged by this flow.
  status       TEXT NOT NULL DEFAULT 'requested'
               CHECK (status IN ('requested', 'contacted', 'scheduled', 'delivered', 'cancelled')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_floorplan_requests_hall ON floorplan_requests(hall_id);
-- The platform queue: open requests first, oldest first.
CREATE INDEX IF NOT EXISTS idx_floorplan_requests_open ON floorplan_requests(status, created_at);
