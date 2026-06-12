-- Migration 002: Table inventory, RSVP config, nullable time, hall color

-- Table inventory system
CREATE TABLE IF NOT EXISTS table_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id     UUID NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  shape       TEXT NOT NULL DEFAULT 'rect' CHECK (shape IN ('rect', 'round')),
  width       NUMERIC NOT NULL DEFAULT 2,
  height      NUMERIC NOT NULL DEFAULT 1,
  radius      NUMERIC NOT NULL DEFAULT 1,
  max_chairs  INTEGER NOT NULL DEFAULT 8,
  color       TEXT NOT NULL DEFAULT '#92400e',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hall color
ALTER TABLE halls ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#3b82f6';

-- RSVP page customization
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS rsvp_config JSONB NOT NULL DEFAULT '{}';

-- Make time slots optional (one event per day)
ALTER TABLE reservations ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE reservations ALTER COLUMN end_time DROP NOT NULL;
