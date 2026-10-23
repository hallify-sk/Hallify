-- Migration 0027 — extras price snapshots, event reminders, monthly-cap notices.
--
-- Additive only: two nullable columns on reservations and one new table. Safe on
-- production data. D1 wraps the file in its own transaction.

-- ── 1. Extras price snapshot (I8) ─────────────────────────────────────────────
-- reservations.extras_json holds only hall_extras ids, so every view priced a
-- booking with today's price list: a price edit changed agreed totals after the
-- fact. The snapshot keeps, per booked extra, the name and price it was booked at:
--   [{"id":"…","name":"…","description":null,"pricing":"fixed","price_cents":12000}]
ALTER TABLE reservations ADD COLUMN extras_snapshot_json TEXT;

-- Existing bookings are frozen at the prices in effect today, the closest record of
-- what was agreed there is. From here on, a price edit no longer reaches them.
UPDATE reservations
   SET extras_snapshot_json = (
         SELECT json_group_array(json_object(
                  'id', e.id, 'name', e.name, 'description', e.description,
                  'pricing', e.pricing, 'price_cents', e.price_cents))
           FROM json_each(reservations.extras_json) AS j
           JOIN hall_extras e ON e.id = j.value
       )
 WHERE extras_json IS NOT NULL
   AND json_valid(extras_json)
   AND json_type(extras_json) = 'array'
   AND json_array_length(extras_json) > 0
   AND extras_snapshot_json IS NULL;

-- ── 2. Event reminders (M4) ───────────────────────────────────────────────────
-- When the client was reminded of an upcoming event; NULL = not yet. Set before the
-- email goes out, so two overlapping runs never send it twice.
ALTER TABLE reservations ADD COLUMN reminder_sent_at TEXT;

-- ── 3. Monthly reservation cap notices (M17) ─────────────────────────────────
-- One row per hall and month that reached the plan's monthly reservation cap: when
-- it filled, how many clients were refused since, and when the owner was told.
CREATE TABLE IF NOT EXISTS hall_month_caps (
  hall_id             TEXT NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  month               TEXT NOT NULL,                     -- 'YYYY-MM' of the event date
  org_id              TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  cap                 INTEGER NOT NULL,                  -- the plan's limit when it filled
  full_at             TEXT NOT NULL DEFAULT (datetime('now')),
  turned_away         INTEGER NOT NULL DEFAULT 0,        -- client bookings refused by the cap
  last_turned_away_at TEXT,
  notified_at         TEXT,                              -- owner emailed
  PRIMARY KEY (hall_id, month)
);

CREATE INDEX IF NOT EXISTS hall_month_caps_org ON hall_month_caps (org_id, month);
