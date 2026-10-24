-- Migration 0040 — webhooks for Hallify's own platform admins.
--
-- Organisations have had webhooks for their own events (org_webhooks). Platform
-- admins had nothing: a sign-up, a new organisation, a failed payment or a mapping
-- request reached them only by e-mail, if at all. These tables are the platform
-- equivalent, kept apart from the org ones so an organisation's data and Hallify's
-- operator feed can never mix (and an org's ON DELETE CASCADE never touches them).
--
--   platform_webhooks            one endpoint (URL, signing secret, events)
--   platform_webhook_deliveries  one event sent to one endpoint; `id` is the payload's
--                                id and stays the same on every retry (idempotency)
--   platform_webhook_attempts    every HTTP attempt of a delivery, with what came back
--
-- Purely additive: new tables only.

CREATE TABLE IF NOT EXISTS platform_webhooks (
  id                   TEXT PRIMARY KEY NOT NULL,
  url                  TEXT NOT NULL,
  secret               TEXT NOT NULL,                -- HMAC-SHA256 key; shown once, never listed
  events               TEXT,                         -- JSON array of event names; NULL = every event
  enabled              INTEGER NOT NULL DEFAULT 1,
  description          TEXT,
  created_by           TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  -- Failed attempts in a row (reset by any success). At the limit the endpoint is
  -- switched off and disabled_reason says why, so the page can show it.
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  disabled_reason      TEXT,                         -- 'failures' when switched off automatically
  disabled_at          TEXT,
  last_success_at      TEXT,
  last_failure_at      TEXT
);

CREATE TABLE IF NOT EXISTS platform_webhook_deliveries (
  id              TEXT PRIMARY KEY NOT NULL,         -- = payload.id
  webhook_id      TEXT NOT NULL REFERENCES platform_webhooks(id) ON DELETE CASCADE,
  event           TEXT NOT NULL,
  payload         TEXT NOT NULL,                     -- the exact JSON body that is signed and sent
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,                              -- ISO time of the next retry while pending
  last_attempt_at TEXT,
  response_code   INTEGER,                           -- of the latest attempt
  error           TEXT,                              -- of the latest attempt
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_platform_wh_deliveries_webhook
  ON platform_webhook_deliveries (webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_wh_deliveries_due
  ON platform_webhook_deliveries (status, next_attempt_at);

CREATE TABLE IF NOT EXISTS platform_webhook_attempts (
  id            TEXT PRIMARY KEY NOT NULL,
  delivery_id   TEXT NOT NULL REFERENCES platform_webhook_deliveries(id) ON DELETE CASCADE,
  attempt       INTEGER NOT NULL,                    -- 1 = the first send
  trigger       TEXT NOT NULL DEFAULT 'dispatch',    -- 'dispatch' | 'retry' | 'manual' | 'test'
  status_code   INTEGER,
  duration_ms   INTEGER,
  error         TEXT,
  response_body TEXT,                                -- first 1 000 characters
  attempted_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_platform_wh_attempts_delivery
  ON platform_webhook_attempts (delivery_id, attempt);
