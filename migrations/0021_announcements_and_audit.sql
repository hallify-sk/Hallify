-- 0021: platform announcements can be edited and can expire, email sends are counted,
-- and platform admin actions leave an audit trail.
--
-- Additive only: new nullable columns and a new table. Existing announcements keep
-- showing exactly as before (no expiry; email counts unknown = NULL).

-- ─── Announcements ───────────────────────────────────────────────────────────
-- Shown until this moment (UTC, 'YYYY-MM-DD HH:MM:SS'); NULL = no end.
ALTER TABLE announcements ADD COLUMN expires_at TEXT;
-- Last edit, so the list can say an announcement was changed after publishing.
ALTER TABLE announcements ADD COLUMN updated_at TEXT;
-- How many email copies actually went out and how many failed. email_sent alone
-- only recorded that a copy was requested, so a failed send was reported as sent.
ALTER TABLE announcements ADD COLUMN emails_delivered INTEGER;
ALTER TABLE announcements ADD COLUMN emails_failed INTEGER;

-- ─── Platform audit log ──────────────────────────────────────────────────────
-- Admin grants, plan overrides, suspensions, slug changes, credit grants and
-- View-as sessions used to leave no trace. One row per action; never updated.
CREATE TABLE IF NOT EXISTS platform_audit_log (
  id          TEXT PRIMARY KEY NOT NULL,
  actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT,                 -- denormalised: the row outlives the account
  action      TEXT NOT NULL,        -- e.g. 'org.plan', 'user.admin_grant', 'org.view_as'
  target_type TEXT,                 -- 'org' | 'user' | 'announcement' | 'settings' | ...
  target_id   TEXT,
  target_label TEXT,                -- org name / user email at the time
  details     TEXT,                 -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_target ON platform_audit_log (target_type, target_id);
