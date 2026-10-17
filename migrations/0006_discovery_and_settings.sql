-- Discovery, pricing, custom amenities and geocoding.
--
-- Additive only: every column is nullable or carries a default, so this applies
-- cleanly to a live database mid-rollout and old code keeps working against the
-- new schema (see 0004/0005 for the same pattern).
--
-- Deliberately NOT changed here:
--   * halls.is_public and halls.allow_reservations keep their stored defaults.
--     SQLite cannot alter a column default in place, and back-filling would
--     publish venues an operator chose to keep private, or re-open bookings
--     somebody deliberately closed. New halls get the new defaults from the
--     application insert instead; existing rows are left exactly as the operator
--     set them.

-- ─── Price band ──────────────────────────────────────────────────────────────
-- A coarse band rather than an exact figure: it is what a venue can realistically
-- commit to in public, and it is what the map filter needs. pricing_info stays as
-- the free-text nuance ("weekday rates", "catering extra").
-- 1 = €, 2 = €€, 3 = €€€. NULL = not stated, which must remain filterable-out
-- rather than silently sorting as cheap.
ALTER TABLE halls ADD COLUMN price_band INTEGER
  CHECK (price_band IS NULL OR price_band IN (1, 2, 3));

-- Public discovery filters on band, and only ever for listed venues.
CREATE INDEX IF NOT EXISTS idx_halls_public_price
  ON halls(is_public, plan_locked, price_band);

-- ─── Custom amenities ────────────────────────────────────────────────────────
-- Built-in amenities are translated keys in the app. An operator's own amenity has
-- no key to translate, so it carries its own label per locale. Both are optional:
-- whichever one is filled is shown, falling back to the other, so an operator is
-- never forced to write Slovak to add an English amenity or vice versa.
CREATE TABLE IF NOT EXISTS org_amenities (
  id         TEXT PRIMARY KEY NOT NULL,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,            -- stable id stored in halls.amenities
  label_sk   TEXT,
  label_en   TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_org_amenities_org ON org_amenities(org_id);

-- ─── Reservation event type ──────────────────────────────────────────────────
-- Until now the event type on the new-reservation form only filtered floor-plan
-- templates and was thrown away. Storing it lets "Other" carry a typed-in value
-- and lets the type show on the reservation afterwards.
ALTER TABLE reservations ADD COLUMN event_type TEXT;

-- ─── Geocoding cache ─────────────────────────────────────────────────────────
-- Nominatim's usage policy caps callers at roughly one request a second and asks
-- that results be cached rather than re-fetched. Keyed by the normalised query so
-- the same address typed twice costs one lookup. A row with NULL coordinates
-- records a miss, so a bad address is not retried on every save.
CREATE TABLE IF NOT EXISTS geocode_cache (
  query      TEXT PRIMARY KEY NOT NULL,   -- normalised: trimmed, collapsed, lowercased
  latitude   REAL CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude  REAL CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  label      TEXT,                        -- the provider's display name, for reverse lookups
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
