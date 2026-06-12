-- ─── migration-004: team channels, presence, webhooks ──────────────────────

-- Internal team chat channels (scoped to org)
CREATE TABLE IF NOT EXISTS channels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        VARCHAR(80) NOT NULL,
  description TEXT,
  type        TEXT NOT NULL DEFAULT 'general' CHECK (type IN ('general', 'announcement')),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, name)
);

-- Messages within a channel
CREATE TABLE IF NOT EXISTS channel_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL,
  sender_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  edited_at   TIMESTAMPTZ,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_channel_messages_channel ON channel_messages(channel_id, created_at);

-- Lightweight online presence (upserted on heartbeat)
CREATE TABLE IF NOT EXISTS user_presence (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, org_id)
);

-- Per-org outbound webhook integrations (Slack, Telegram, custom)
CREATE TABLE IF NOT EXISTS org_webhooks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  url        TEXT NOT NULL,
  events     TEXT[] NOT NULL DEFAULT '{}',
  secret     VARCHAR(64),
  enabled    BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Webhook delivery audit log
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id    UUID NOT NULL REFERENCES org_webhooks(id) ON DELETE CASCADE,
  event         TEXT NOT NULL,
  payload       JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('delivered', 'failed', 'pending')),
  response_code INT,
  error         TEXT,
  delivered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_wh ON webhook_deliveries(webhook_id, delivered_at DESC);

-- Seed a #general channel for all existing orgs that don't have one yet
INSERT INTO channels (org_id, name, type, description)
SELECT id, 'general', 'general', 'General team discussion'
FROM organizations
ON CONFLICT (org_id, name) DO NOTHING;

-- Announcements channel
INSERT INTO channels (org_id, name, type, description)
SELECT id, 'announcements', 'announcement', 'Important updates for the team'
FROM organizations
ON CONFLICT (org_id, name) DO NOTHING;
