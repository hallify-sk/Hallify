-- Migration 010: whole-day availability + reservation holds
--
-- Adds: reservation_holds table, reservations.num_guests, and the unique
-- indexes enforcing (a) one active reservation per hall per day and (b) one
-- hold per hall per day.
--
-- D1 manages the transaction for a --file run; no explicit BEGIN/COMMIT.
-- RUN ONCE PER DB, dev first. BEFORE running, verify there are no existing
-- same-hall/same-day non-cancelled duplicates, or the reservations index fails:
--   wrangler d1 execute <db> --remote --command \
--     "SELECT hall_id, event_date, COUNT(*) c FROM reservations WHERE status!='cancelled' GROUP BY hall_id, event_date HAVING c>1"

ALTER TABLE reservations ADD COLUMN num_guests INTEGER;

CREATE TABLE IF NOT EXISTS reservation_holds (
  id         TEXT PRIMARY KEY NOT NULL,
  hall_id    TEXT NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  event_date TEXT NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id     TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS reservations_hall_day_unique
  ON reservations (hall_id, event_date) WHERE status != 'cancelled';

CREATE UNIQUE INDEX IF NOT EXISTS reservation_holds_hall_date
  ON reservation_holds (hall_id, event_date);
