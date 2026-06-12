CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS halls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  max_people      INTEGER NOT NULL DEFAULT 100,
  floorplan_json  JSONB,
  color           TEXT NOT NULL DEFAULT '#3b82f6',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS table_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id     UUID NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  shape       TEXT NOT NULL DEFAULT 'rect' CHECK (shape IN ('rect', 'round')),
  width       NUMERIC NOT NULL DEFAULT 2,
  height      NUMERIC NOT NULL DEFAULT 1,
  radius      NUMERIC NOT NULL DEFAULT 1,
  max_chairs  INTEGER NOT NULL DEFAULT 8,
  amount      INTEGER NOT NULL DEFAULT 0,
  color       TEXT NOT NULL DEFAULT '#92400e',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS floorplan_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id     UUID NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  event_type  TEXT,
  layout_json JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hall_blocks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id      UUID NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  block_type   TEXT NOT NULL CHECK (block_type IN ('date_range', 'weekly')),
  date_from    DATE,
  date_to      DATE,
  days_of_week INTEGER[],
  reason       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hall_id      UUID NOT NULL REFERENCES halls(id),
  user_id      UUID NOT NULL REFERENCES users(id),
  title        TEXT NOT NULL,
  description  TEXT,
  event_date   DATE NOT NULL,
  start_time   TIME,
  end_time     TIME,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  invite_code  TEXT UNIQUE NOT NULL DEFAULT substring(gen_random_uuid()::text, 1, 8),
  layout_json  JSONB,
  rsvp_config  JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rsvp_entries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  email          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rsvp_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  event_type  TEXT,
  config      JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Tickets / Messaging ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── System Settings (KV store) ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Column migrations (safe to re-run) ──────────────────────────────────────
ALTER TABLE halls ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#3b82f6';
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS rsvp_config JSONB NOT NULL DEFAULT '{}';
ALTER TABLE reservations ALTER COLUMN start_time DROP NOT NULL;
ALTER TABLE reservations ALTER COLUMN end_time DROP NOT NULL;
ALTER TABLE halls ADD COLUMN IF NOT EXISTS allow_reservations BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE halls ADD COLUMN IF NOT EXISTS custom_layouts BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE halls ADD COLUMN IF NOT EXISTS force_layouts BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE halls ADD COLUMN IF NOT EXISTS allow_feedback BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE halls ADD COLUMN IF NOT EXISTS min_days_advance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE halls ADD COLUMN IF NOT EXISTS address TEXT;

-- ─── Password Resets ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS password_resets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Email Log ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient   TEXT NOT NULL,
  subject     TEXT NOT NULL,
  template    TEXT,
  status      TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Hall: pre-reservation text, auto-approve, min cancellation days ────────
ALTER TABLE halls ADD COLUMN IF NOT EXISTS pre_reservation_text TEXT;
ALTER TABLE halls ADD COLUMN IF NOT EXISTS auto_approve BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE halls ADD COLUMN IF NOT EXISTS min_cancel_days INTEGER NOT NULL DEFAULT 0;

-- ─── Reservation status expansion (safe to re-run) ──────────────────────────
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_status_check;
ALTER TABLE reservations ADD CONSTRAINT reservations_status_check
  CHECK (status IN ('pending', 'waiting_payment', 'approved', 'planned', 'completed', 'cancelled'));

-- ─── Messages: attachment support ───────────────────────────────────────────
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type TEXT;

-- ─── Messages: system message type (text = normal, system = activity log) ──
ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE messages ALTER COLUMN body DROP NOT NULL;

-- ─── Messages: edit/delete support ──────────────────────────────────────────
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
