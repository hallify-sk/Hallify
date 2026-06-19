-- ─────────────────────────────────────────────────────────────────────────────
-- Hallify – SQLite / Cloudflare D1 schema
-- All UUIDs are generated in application code.
-- Booleans are stored as INTEGER (1 = true, 0 = false).
-- JSONB / arrays are stored as TEXT (JSON string).
-- Timestamps are stored as TEXT using ISO-8601 / datetime('now').
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Users ───────────────────────────────────────────────────────────────────

-- NOTE: email is NOT globally unique. Org/platform users (org_id IS NULL) are
-- globally unique by email; client accounts (org_id set) are unique per org, so
-- the same email can be a client in many org bubbles and/or an org user.
-- Uniqueness is enforced by the two partial indexes at the bottom of this file.
CREATE TABLE IF NOT EXISTS users (
  id                TEXT    PRIMARY KEY NOT NULL,
  email             TEXT    NOT NULL,
  password_hash     TEXT    NOT NULL,
  first_name        TEXT    NOT NULL,
  last_name         TEXT    NOT NULL,
  role              TEXT    NOT NULL DEFAULT 'user'
                            CHECK (role IN ('user', 'admin')),
  is_platform_admin INTEGER NOT NULL DEFAULT 0,
  account_type      TEXT    NOT NULL DEFAULT 'organization',
  org_id            TEXT    REFERENCES organizations(id) ON DELETE CASCADE,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Organizations ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id           TEXT PRIMARY KEY NOT NULL,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  logo_url     TEXT,
  suspended_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Sessions ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  id              TEXT PRIMARY KEY NOT NULL,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_org_id  TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  expires_at      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Organization Members ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organization_members (
  id        TEXT PRIMARY KEY NOT NULL,
  org_id    TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member'
            CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (org_id, user_id)
);

-- ─── Organization Invites ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organization_invites (
  id          TEXT PRIMARY KEY NOT NULL,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member'
              CHECK (role IN ('admin', 'member')),
  token       TEXT NOT NULL UNIQUE,
  invited_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  accepted_at TEXT
);

-- ─── Subscriptions ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscriptions (
  id                    TEXT PRIMARY KEY NOT NULL,
  org_id                TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan                  TEXT NOT NULL DEFAULT 'free'
                        CHECK (plan IN ('free', 'starter', 'professional', 'enterprise')),
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled', 'paused')),
  stripe_customer_id    TEXT,
  stripe_subscription_id TEXT,
  current_period_end    TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Organization Settings (KV store per org) ────────────────────────────────

CREATE TABLE IF NOT EXISTS org_settings (
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, key)
);

-- ─── Halls ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS halls (
  id                   TEXT    PRIMARY KEY NOT NULL,
  org_id               TEXT    REFERENCES organizations(id) ON DELETE CASCADE,
  name                 TEXT    NOT NULL,
  description          TEXT,
  max_people           INTEGER NOT NULL DEFAULT 100,
  floorplan_json       TEXT,
  color                TEXT    NOT NULL DEFAULT '#3b82f6',
  allow_reservations   INTEGER NOT NULL DEFAULT 1,
  custom_layouts       INTEGER NOT NULL DEFAULT 1,
  force_layouts        INTEGER NOT NULL DEFAULT 0,
  allow_feedback       INTEGER NOT NULL DEFAULT 1,
  min_days_advance     INTEGER NOT NULL DEFAULT 0,
  address              TEXT,
  pre_reservation_text TEXT,
  auto_approve         INTEGER NOT NULL DEFAULT 0,
  min_cancel_days      INTEGER NOT NULL DEFAULT 0,
  is_public            INTEGER NOT NULL DEFAULT 0,
  slug                 TEXT,
  cover_image_url      TEXT,
  gallery_images       TEXT    NOT NULL DEFAULT '[]',
  amenities            TEXT    NOT NULL DEFAULT '[]',
  pricing_info         TEXT,
  contact_phone        TEXT,
  contact_email        TEXT,
  contact_website      TEXT,
  opening_hours        TEXT    NOT NULL DEFAULT '{}',
  plan_locked          INTEGER NOT NULL DEFAULT 0,  -- 1 = suspended by a plan downgrade (private until reactivated)
  created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Table Types ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS table_types (
  id         TEXT    PRIMARY KEY NOT NULL,
  hall_id    TEXT    NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  shape      TEXT    NOT NULL DEFAULT 'rect'
             CHECK (shape IN ('rect', 'round')),
  width      REAL    NOT NULL DEFAULT 2,
  height     REAL    NOT NULL DEFAULT 1,
  radius     REAL    NOT NULL DEFAULT 1,
  max_chairs INTEGER NOT NULL DEFAULT 8,
  amount     INTEGER NOT NULL DEFAULT 0,
  color      TEXT    NOT NULL DEFAULT '#92400e',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Floorplan Templates ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS floorplan_templates (
  id          TEXT PRIMARY KEY NOT NULL,
  hall_id     TEXT NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  event_type  TEXT,
  layout_json TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Hall Blocks ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hall_blocks (
  id           TEXT PRIMARY KEY NOT NULL,
  hall_id      TEXT NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  block_type   TEXT NOT NULL CHECK (block_type IN ('date_range', 'weekly')),
  date_from    TEXT,
  date_to      TEXT,
  days_of_week TEXT,   -- stored as JSON array, e.g. [0,6]
  reason       TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Reservations ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reservations (
  id          TEXT PRIMARY KEY NOT NULL,
  org_id      TEXT REFERENCES organizations(id),
  hall_id     TEXT NOT NULL REFERENCES halls(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  title       TEXT NOT NULL,
  description TEXT,
  event_date  TEXT NOT NULL,
  start_time  TEXT,
  end_time    TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'waiting_payment', 'approved', 'planned', 'completed', 'cancelled')),
  invite_code TEXT UNIQUE NOT NULL,   -- generated in app
  layout_json TEXT,
  rsvp_config TEXT NOT NULL DEFAULT '{}',
  num_guests  INTEGER,                 -- expected guests (validated against hall.max_people)
  extras_json TEXT,                    -- selected hall_extras ids (JSON array)
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Reservation Invites ─────────────────────────────────────────────────────
-- An org-created event handed to a client who has no account yet. Holds the
-- invited person's name + email + a one-time token. On acceptance a client
-- account is created (or an existing one is matched) and the reservation's owner
-- (user_id) is set to them. At most one pending (un-accepted) invite per
-- reservation — re-inviting deletes the previous pending row.
CREATE TABLE IF NOT EXISTS reservation_invites (
  id             TEXT PRIMARY KEY NOT NULL,
  reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  token          TEXT NOT NULL UNIQUE,
  invited_by     TEXT REFERENCES users(id),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at     TEXT NOT NULL,
  accepted_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_reservation_invites_reservation
  ON reservation_invites (reservation_id);

-- ─── Hall Extras (add-on features/services bookable with a reservation) ───────

CREATE TABLE IF NOT EXISTS hall_extras (
  id          TEXT PRIMARY KEY NOT NULL,
  hall_id     TEXT NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  pricing     TEXT NOT NULL DEFAULT 'fixed' CHECK (pricing IN ('fixed', 'per_guest')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Reservation Holds ───────────────────────────────────────────────────────
-- Soft lock on a hall+day while a user is mid-booking. Renewed by a client
-- heartbeat; expired holds are ignored by reads and swept periodically.

CREATE TABLE IF NOT EXISTS reservation_holds (
  id         TEXT PRIMARY KEY NOT NULL,
  hall_id    TEXT NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  event_date TEXT NOT NULL,            -- YYYY-MM-DD
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id     TEXT,
  expires_at TEXT NOT NULL,            -- ISO 8601
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── RSVP Entries ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rsvp_entries (
  id             TEXT PRIMARY KEY NOT NULL,
  reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  email          TEXT,
  extra_guests   INTEGER NOT NULL DEFAULT 0,
  responses      TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── RSVP Templates ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rsvp_templates (
  id         TEXT PRIMARY KEY NOT NULL,
  org_id     TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  event_type TEXT,
  config     TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Tickets ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tickets (
  id             TEXT PRIMARY KEY NOT NULL,
  org_id         TEXT REFERENCES organizations(id),
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reservation_id TEXT REFERENCES reservations(id) ON DELETE SET NULL,
  subject        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'closed')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Messages ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY NOT NULL,
  ticket_id       TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT,
  message_type    TEXT NOT NULL DEFAULT 'text',
  attachment_url  TEXT,
  attachment_name TEXT,
  attachment_type TEXT,
  edited_at       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── System Settings (global KV store) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY NOT NULL,
  value      TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Password Resets ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS password_resets (
  id         TEXT    PRIMARY KEY NOT NULL,
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT    UNIQUE NOT NULL,
  expires_at TEXT    NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Email Log ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_log (
  id         TEXT PRIMARY KEY NOT NULL,
  recipient  TEXT NOT NULL,
  subject    TEXT NOT NULL,
  template   TEXT,
  status     TEXT NOT NULL DEFAULT 'sent'
             CHECK (status IN ('sent', 'failed')),
  error      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Channels ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS channels (
  id          TEXT PRIMARY KEY NOT NULL,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        VARCHAR(80) NOT NULL,
  description TEXT,
  type        TEXT NOT NULL DEFAULT 'general'
              CHECK (type IN ('general', 'announcement')),
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  archived_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (org_id, name)
);

-- ─── Channel Messages ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS channel_messages (
  id         TEXT PRIMARY KEY NOT NULL,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  org_id     TEXT NOT NULL,
  sender_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  edited_at  TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── User Presence ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_presence (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, org_id)
);

-- ─── Org Webhooks ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org_webhooks (
  id         TEXT    PRIMARY KEY NOT NULL,
  org_id     TEXT    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  url        TEXT    NOT NULL,
  events     TEXT    NOT NULL DEFAULT '[]',
  secret     VARCHAR(64),
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Webhook Deliveries ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id            TEXT PRIMARY KEY NOT NULL,
  webhook_id    TEXT NOT NULL REFERENCES org_webhooks(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,
  payload       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('delivered', 'failed', 'pending')),
  response_code INTEGER,
  error         TEXT,
  delivered_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Custom Domains ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS custom_domains (
  id             TEXT PRIMARY KEY NOT NULL,
  org_id         TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  domain         TEXT NOT NULL UNIQUE,
  cf_hostname_id TEXT,
  verified_at    TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── Closed Organizations (permanent archive) ───────────────────────────────
-- Retained indefinitely for legal/accounting purposes after an org is closed.
-- `snapshot` holds a JSON record of members, reservations, and subscription at
-- close time; the live org and all its operational data are deleted.

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
  closed_reason          TEXT,                       -- owner_closed | auto_empty | user_deleted
  snapshot               TEXT NOT NULL DEFAULT '{}'  -- JSON: { subscription, members[], reservations[] }
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_channel_messages_channel
  ON channel_messages (channel_id, created_at);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_wh
  ON webhook_deliveries (webhook_id, delivered_at DESC);

CREATE INDEX IF NOT EXISTS custom_domains_domain_idx
  ON custom_domains (domain);

CREATE INDEX IF NOT EXISTS custom_domains_org_idx
  ON custom_domains (org_id);

-- Partial index: only index halls that have a slug set
CREATE UNIQUE INDEX IF NOT EXISTS halls_slug_unique
  ON halls (slug) WHERE slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_invites_org_email
  ON organization_invites (org_id, email);

-- Org/platform users: email globally unique among non-client accounts.
CREATE UNIQUE INDEX IF NOT EXISTS users_email_global_unique
  ON users (email) WHERE org_id IS NULL;

-- Client users: email unique per org (same email may exist in many bubbles).
CREATE UNIQUE INDEX IF NOT EXISTS users_email_org_unique
  ON users (org_id, email) WHERE org_id IS NOT NULL;

-- One active (non-cancelled) reservation per hall per day — whole-day model.
CREATE UNIQUE INDEX IF NOT EXISTS reservations_hall_day_unique
  ON reservations (hall_id, event_date) WHERE status != 'cancelled';

-- At most one active hold per hall+day.
CREATE UNIQUE INDEX IF NOT EXISTS reservation_holds_hall_date
  ON reservation_holds (hall_id, event_date);

CREATE INDEX IF NOT EXISTS closed_organizations_closed_at
  ON closed_organizations (closed_at DESC);

-- ─── Announcements (platform → organizations) ────────────────────────────────

CREATE TABLE IF NOT EXISTS announcements (
  id          TEXT PRIMARY KEY NOT NULL,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  level       TEXT NOT NULL DEFAULT 'info'
              CHECK (level IN ('info', 'success', 'warning', 'error')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  audience    TEXT NOT NULL DEFAULT 'all'
              CHECK (audience IN ('all', 'specific')),
  email_sent  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Targeted orgs (only used when audience = 'specific').
CREATE TABLE IF NOT EXISTS announcement_targets (
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  PRIMARY KEY (announcement_id, org_id)
);

-- Per-user read state (announcements are shown to org owners/admins).
CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at         TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS announcements_created_at ON announcements (created_at DESC);
