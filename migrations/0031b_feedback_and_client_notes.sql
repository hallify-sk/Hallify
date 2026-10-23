-- Migration 0031b — client feedback (D5) and the client list's staff notes (D10).
--
-- Additive only: two new tables and one nullable column. Safe on production data.
-- D1 wraps the file in its own transaction.

-- ── 1. Feedback ───────────────────────────────────────────────────────────────
-- One rating per reservation, from its client, after the event. Private to the
-- venue: shown on the staff reservation page, as an average on the hall page and
-- on the client's card in the client list; never on a public page.
CREATE TABLE IF NOT EXISTS reservation_feedback (
  reservation_id TEXT    PRIMARY KEY NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  org_id         TEXT    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  hall_id        TEXT    NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  user_id        TEXT    REFERENCES users(id) ON DELETE SET NULL,
  rating         INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reservation_feedback_hall ON reservation_feedback (hall_id);
CREATE INDEX IF NOT EXISTS idx_reservation_feedback_org_user ON reservation_feedback (org_id, user_id);

-- When the client was invited (by email) to rate the event; NULL = not yet. Claimed
-- before the email goes out, so each booking is invited once.
ALTER TABLE reservations ADD COLUMN feedback_requested_at TEXT;

-- Events that finished before this release are not invited after the fact: the
-- sender only looks at events of the last fortnight ($lib/server/feedback).

-- ── 2. Client list notes ──────────────────────────────────────────────────────
-- The team's private card about a client: a phone number and free notes. A client is
-- a client account ('u:<user id>') or a phone-booking customer without an account
-- ('g:<normalised contact>'); see $lib/clients.
CREATE TABLE IF NOT EXISTS client_notes (
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_key  TEXT NOT NULL,
  phone       TEXT,
  notes       TEXT,
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, client_key)
);
