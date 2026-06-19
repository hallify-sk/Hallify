-- ─────────────────────────────────────────────────────────────────────────────
-- Hallify – seed data
-- Default organization and subscription only.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO organizations (id, name, slug)
  VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'default')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO subscriptions (id, org_id, plan, status)
  VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'free', 'active')
  ON CONFLICT (org_id) DO NOTHING;
