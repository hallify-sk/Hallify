-- One Hallify account on every venue site, email verification, account deletion.
-- Design: DESIGN-identity.md. Additive only: nothing is deleted or rewritten except
-- filling the new verification column for rows that already exist.

-- A venue client row (account_type 'client', org_id = the venue) may be LINKED to the
-- person's Hallify account (org_id IS NULL). A linked row is signed in with the Hallify
-- account's password; it keeps scoping that person's bookings to the venue.
ALTER TABLE users ADD COLUMN account_id TEXT REFERENCES users(id) ON DELETE SET NULL;

-- When the account's current email address was confirmed. NULL = not confirmed.
ALTER TABLE users ADD COLUMN email_verified_at TEXT;

-- Set when a person deleted their account but records (past bookings kept for the
-- venue) still point at the row; the row is anonymised at the same time.
ALTER TABLE users ADD COLUMN deleted_at TEXT;

-- Every account that exists before this migration counts as verified.
UPDATE users SET email_verified_at = COALESCE(created_at, datetime('now')) WHERE email_verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_account ON users (account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- One row per mailed verification link. Only the SHA-256 of the token is stored.
CREATE TABLE IF NOT EXISTS email_verifications (
  id         TEXT PRIMARY KEY NOT NULL,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user ON email_verifications (user_id);
