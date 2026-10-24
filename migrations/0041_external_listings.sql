-- Migration 0041 — halls booked outside Hallify, directory-only venues, listing counters.
--
--   halls.booking_mode         'hallify' (the booking form, as before) or 'external':
--                              visitors are sent to the venue's own website, phone or
--                              e-mail (contact_website / contact_phone / contact_email,
--                              which already exist). Every existing hall is 'hallify'.
--   organizations.listing_only 1 for a venue that is NOT on Hallify: a platform admin
--                              added it to the directory. No members, no venue site,
--                              never a partner; its halls are always 'external'.
--   listing_stats              per hall and day: how often it was shown in the
--                              directory, opened, and how often its website, phone or
--                              e-mail was clicked. Counters only — no visitor data.
--
-- Purely additive. The triggers keep one rule in the database itself, so that no
-- path (the console, the assistant, MCP, a restore) can reopen Hallify bookings on a
-- hall that sends visitors elsewhere: an external hall never has allow_reservations.

ALTER TABLE halls ADD COLUMN booking_mode TEXT NOT NULL DEFAULT 'hallify'
  CHECK (booking_mode IN ('hallify', 'external'));

ALTER TABLE organizations ADD COLUMN listing_only INTEGER NOT NULL DEFAULT 0
  CHECK (listing_only IN (0, 1));

CREATE TABLE IF NOT EXISTS listing_stats (
  hall_id        TEXT    NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  day            TEXT    NOT NULL,              -- 'YYYY-MM-DD', UTC
  impressions    INTEGER NOT NULL DEFAULT 0,    -- directory card seen (>= 50 % for >= 1 s)
  detail_views   INTEGER NOT NULL DEFAULT 0,    -- directory or venue-site hall page opened
  website_clicks INTEGER NOT NULL DEFAULT 0,
  phone_clicks   INTEGER NOT NULL DEFAULT 0,
  email_clicks   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hall_id, day)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS listing_stats_day ON listing_stats(day);

CREATE TRIGGER IF NOT EXISTS halls_external_insert_no_bookings
AFTER INSERT ON halls
FOR EACH ROW
WHEN NEW.booking_mode = 'external' AND NEW.allow_reservations != 0
BEGIN
  UPDATE halls SET allow_reservations = 0 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS halls_external_update_no_bookings
AFTER UPDATE OF booking_mode, allow_reservations ON halls
FOR EACH ROW
WHEN NEW.booking_mode = 'external' AND NEW.allow_reservations != 0
BEGIN
  UPDATE halls SET allow_reservations = 0 WHERE id = NEW.id;
END;
