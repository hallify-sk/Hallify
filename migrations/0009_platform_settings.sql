-- Settings that belong to Hallify itself rather than to any one organisation.
--
-- Deliberately NOT a row in org_settings with a sentinel org_id: that table is
-- scoped by a foreign key to organizations, every query against it is filtered
-- by org, and a magic "platform" row would be invisible to all of them while
-- quietly breaking the scoping guarantee the rest of the code relies on.
--
-- Key/value for the same reason org_settings is: these arrive one at a time over
-- the life of the product, and a column per setting means a migration per
-- setting. Values are JSON so a setting can grow a second field without one.
CREATE TABLE IF NOT EXISTS platform_settings (
  key        TEXT PRIMARY KEY NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Who changed it. There is no organisation to attribute a platform change to,
  -- and "who turned analytics on across the whole platform" is a question worth
  -- being able to answer.
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
