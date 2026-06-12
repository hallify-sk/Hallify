-- Migration 003: Multi-tenant SaaS architecture
-- Organizations, members, invites, subscriptions, per-org settings

-- ─── New tables ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS organizations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  logo_url     TEXT,
  suspended_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User ↔ org membership with role
CREATE TABLE IF NOT EXISTS organization_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id)
);

-- Email-based invites
CREATE TABLE IF NOT EXISTS organization_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  token       TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ
);

-- One subscription per org
CREATE TABLE IF NOT EXISTS subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan                   TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'professional', 'enterprise')),
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'cancelled', 'paused')),
  stripe_customer_id     TEXT,
  stripe_subscription_id TEXT,
  current_period_end     TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-org key/value settings (branding, SMTP, email templates, notifications)
CREATE TABLE IF NOT EXISTS org_settings (
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, key)
);

-- ─── Extend existing tables ───────────────────────────────────────────────────

-- Users: replace global role with a platform-admin flag
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;
UPDATE users SET is_platform_admin = true WHERE role = 'admin' AND NOT is_platform_admin;

-- Sessions: track which org is currently active
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS current_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- Halls: belong to an org
ALTER TABLE halls ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Reservations: denormalised org_id for efficient filtering
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- RSVP templates: scoped to an org
ALTER TABLE rsvp_templates ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Tickets: scoped to an org
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- ─── Seed default org for pre-existing data ───────────────────────────────────

INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'default')
ON CONFLICT (id) DO NOTHING;

INSERT INTO subscriptions (org_id, plan, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'free', 'active')
ON CONFLICT (org_id) DO NOTHING;

UPDATE halls        SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE reservations SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE rsvp_templates SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE tickets      SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

-- Make platform admins owners of the default org
INSERT INTO organization_members (org_id, user_id, role)
SELECT '00000000-0000-0000-0000-000000000001', id, 'owner'
FROM users WHERE is_platform_admin = true
ON CONFLICT (org_id, user_id) DO NOTHING;

-- All other users become members of the default org
INSERT INTO organization_members (org_id, user_id, role)
SELECT '00000000-0000-0000-0000-000000000001', id, 'member'
FROM users WHERE is_platform_admin = false
ON CONFLICT (org_id, user_id) DO NOTHING;

-- Point existing sessions to the default org
UPDATE sessions SET current_org_id = '00000000-0000-0000-0000-000000000001' WHERE current_org_id IS NULL;
