-- Migration 009: per-org isolated client accounts
--
-- Rebuilds `users` to (a) drop the column-level UNIQUE(email) implicit autoindex
-- and (b) add `org_id`. Then installs partial unique indexes so org/platform
-- users stay globally unique by email while client accounts are unique per org.
--
-- The column-level UNIQUE cannot be dropped via ALTER, hence a table rebuild.
-- D1 defaults foreign_keys OFF; `defer_foreign_keys` keeps any checks deferred to
-- COMMIT. Child rows (sessions, reservations, …) keep their user_id and rebind to
-- the renamed table by name.
--
-- RUN EXACTLY ONCE PER DATABASE. Dev first, then prod. Keep schema.sql in sync.
--   wrangler d1 execute hallify-dev --remote --file=src/lib/db/migration-009-client-org.sql
--   wrangler d1 execute hallify-dev --remote --command "PRAGMA foreign_key_check;"
--   wrangler d1 execute hallify     --remote --file=src/lib/db/migration-009-client-org.sql

-- D1 runs a --file's statements atomically and manages the transaction itself,
-- so no explicit BEGIN/COMMIT (D1 rejects them). D1 also defaults foreign_keys
-- OFF, so dropping `users` while child tables reference it is safe; child rows
-- keep their user_id and rebind to the renamed table.

CREATE TABLE users_new (
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

INSERT INTO users_new
  (id, email, password_hash, first_name, last_name, role,
   is_platform_admin, account_type, org_id, created_at)
SELECT
  id, email, password_hash, first_name, last_name, role,
  is_platform_admin, account_type, NULL, created_at
FROM users;

DROP TABLE users;

ALTER TABLE users_new RENAME TO users;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_global_unique
  ON users (email) WHERE org_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_org_unique
  ON users (org_id, email) WHERE org_id IS NOT NULL;
