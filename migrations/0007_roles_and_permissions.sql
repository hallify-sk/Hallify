-- Roles, per-member overrides, and invites that carry their permissions.
--
-- Additive only. `organization_members.role` is deliberately LEFT IN PLACE and
-- still written: it is what identifies the owner, every existing guard reads it,
-- and keeping it means this migration cannot log anybody out of their own
-- organisation mid-rollout. Roles layer on top of it rather than replacing it.

-- ─── Roles ───────────────────────────────────────────────────────────────────
-- `position` is seniority: higher outranks lower, and you may only act on roles
-- and members ranked strictly below your own. The owner is NOT a role — exactly
-- one person owns an organisation, they bypass every check, and modelling that as
-- an editable role invites an org with nobody able to pay the bill.
--
-- `permissions` is a JSON array of permission keys rather than a bitfield:
-- JavaScript's bitwise operators are 32-bit, so a bitfield breaks silently at the
-- 32nd permission, and keys stay readable in a SQL client when auditing access.
CREATE TABLE IF NOT EXISTS org_roles (
  id          TEXT    PRIMARY KEY NOT NULL,
  org_id      TEXT    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  color       TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  permissions TEXT    NOT NULL DEFAULT '[]',
  -- The role every member of the org holds implicitly. One per org, and it cannot
  -- be deleted; it is the floor of what a member can do.
  is_default  INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_org_roles_org ON org_roles(org_id, position);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_roles_one_default
  ON org_roles(org_id) WHERE is_default = 1;

-- ─── Role assignment ─────────────────────────────────────────────────────────
-- Scoped by org_id as well as user_id: being a member of org A must never let a
-- role from org B attach, even if an id is guessed or reused.
CREATE TABLE IF NOT EXISTS org_member_roles (
  id        TEXT NOT NULL PRIMARY KEY,
  org_id    TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id   TEXT NOT NULL REFERENCES org_roles(id) ON DELETE CASCADE,
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (org_id, user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_member_roles_lookup ON org_member_roles(org_id, user_id);

-- ─── Per-member overrides ────────────────────────────────────────────────────
-- Additions and removals applied on top of a member's roles. Deny is evaluated
-- last so it beats both roles and allow: it is the only way to carve an exception
-- out of a role somebody must keep for other reasons, so adding a role must not
-- silently restore what an admin explicitly removed.
CREATE TABLE IF NOT EXISTS org_member_overrides (
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  allow      TEXT NOT NULL DEFAULT '[]',
  deny       TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, user_id)
);

-- ─── Invites carry their roles ───────────────────────────────────────────────
-- So an admin can decide what someone will be able to do before they accept,
-- rather than inviting them and then remembering to come back.
ALTER TABLE organization_invites ADD COLUMN role_ids TEXT NOT NULL DEFAULT '[]';

-- An invite may now be for somebody with no Hallify account at all: they set a
-- password from the link. Recording the names up front means the invite can show
-- who is being added, and the created account is not nameless.
ALTER TABLE organization_invites ADD COLUMN first_name TEXT;
ALTER TABLE organization_invites ADD COLUMN last_name TEXT;

-- ─── Seed the built-in roles for existing organisations ──────────────────────
-- Every current member keeps exactly what they have today:
--   owner  -> stays the owner, bypasses everything, gets no role row
--   admin  -> "Administrator", every permission except the owner-only ones
--   member -> the default "Member" role, read-only plus messaging
-- Nobody gains access from this migration, and nobody loses any.

INSERT INTO org_roles (id, org_id, name, color, position, permissions, is_default)
SELECT
  lower(hex(randomblob(16))), o.id, 'Administrator', '#a6225e', 10,
  json('["reservations.view","reservations.manage","halls.view","halls.manage","floorplans.manage","templates.manage","calendar.view","messages.view","messages.send","announcements.manage","members.view","members.manage","roles.manage","invites.manage","settings.manage"]'),
  0
FROM organizations o
WHERE NOT EXISTS (SELECT 1 FROM org_roles r WHERE r.org_id = o.id AND r.name = 'Administrator');

INSERT INTO org_roles (id, org_id, name, color, position, permissions, is_default)
SELECT
  lower(hex(randomblob(16))), o.id, 'Member', NULL, 0,
  json('["reservations.view","halls.view","calendar.view","messages.view","messages.send","members.view"]'),
  1
FROM organizations o
WHERE NOT EXISTS (SELECT 1 FROM org_roles r WHERE r.org_id = o.id AND r.is_default = 1);

-- Attach the matching role to every existing non-owner member.
INSERT INTO org_member_roles (id, org_id, user_id, role_id)
SELECT lower(hex(randomblob(16))), m.org_id, m.user_id, r.id
FROM organization_members m
JOIN org_roles r ON r.org_id = m.org_id AND r.name = 'Administrator'
WHERE m.role = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM org_member_roles x
    WHERE x.org_id = m.org_id AND x.user_id = m.user_id AND x.role_id = r.id
  );

INSERT INTO org_member_roles (id, org_id, user_id, role_id)
SELECT lower(hex(randomblob(16))), m.org_id, m.user_id, r.id
FROM organization_members m
JOIN org_roles r ON r.org_id = m.org_id AND r.is_default = 1
WHERE m.role = 'member'
  AND NOT EXISTS (
    SELECT 1 FROM org_member_roles x
    WHERE x.org_id = m.org_id AND x.user_id = m.user_id AND x.role_id = r.id
  );
