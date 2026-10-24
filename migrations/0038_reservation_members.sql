-- Migration 0038 — more than one person on an event (shared events).
--
-- A reservation has one client: reservations.user_id, and that stays the booking's
-- owner ("Re-assign to another client" keeps changing it). Next to it, people the
-- venue or the owner shared the event with: they see the booking on the venue's
-- site, message the venue about it and seat the guests, but only the owner cancels,
-- changes the booking or rates it.
--
-- A row is an invitation until accepted: user_id NULL, the address it was sent to,
-- and the SHA-256 of the link's token (never the token). Accepting binds the venue
-- client row (users, account_type 'client') and clears the token, so a link works
-- once. A row the venue's staff add for an existing client starts accepted.
--
-- Purely additive: a new table, nothing existing is rewritten.

CREATE TABLE IF NOT EXISTS reservation_members (
  id             TEXT PRIMARY KEY NOT NULL,
  reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  user_id        TEXT REFERENCES users(id) ON DELETE CASCADE,   -- NULL until accepted
  email          TEXT NOT NULL,                                 -- where the invitation went
  role           TEXT NOT NULL DEFAULT 'guest',                 -- 'guest' only, for now
  invited_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  invite_token   TEXT,                                          -- SHA-256 hex; NULL once accepted
  expires_at     TEXT,                                          -- ISO; the link's end
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at    TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS reservation_members_res_user
  ON reservation_members (reservation_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reservation_members_res_email
  ON reservation_members (reservation_id, lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS reservation_members_token
  ON reservation_members (invite_token) WHERE invite_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS reservation_members_user
  ON reservation_members (user_id) WHERE user_id IS NOT NULL;
