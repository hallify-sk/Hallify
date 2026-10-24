-- Migration 0038 — MCP server and its OAuth 2.1 authorization server.
--
-- People connect their own AI agent (Claude, ChatGPT, Cursor…) to Hallify at /mcp.
-- Each agent registers itself (RFC 7591), a signed-in member approves it on a consent
-- page, and the agent then holds an access token (1 hour) and a refresh token
-- (30 days, rotated on every use). Tokens and codes are stored as SHA-256 hashes only.
--
-- A GRANT is one approval: one person, one client, one scope. Its tokens live and die
-- with it; revoking the grant (the person, an org owner for their org, account
-- deletion) ends every token at once.
--
-- Additive only. Timestamps are SQLite datetime() text ('YYYY-MM-DD HH:MM:SS', UTC).

CREATE TABLE IF NOT EXISTS mcp_clients (
  id            TEXT PRIMARY KEY NOT NULL,          -- client_id
  name          TEXT NOT NULL,                      -- client_name as registered (shown on consent)
  redirect_uris TEXT NOT NULL,                      -- JSON array, exact-match
  auth_method   TEXT NOT NULL DEFAULT 'none'
                CHECK (auth_method IN ('none', 'client_secret_post', 'client_secret_basic')),
  secret_hash   TEXT,                               -- confidential clients only
  client_uri    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mcp_auth_codes (
  code_hash      TEXT PRIMARY KEY NOT NULL,
  client_id      TEXT NOT NULL REFERENCES mcp_clients(id) ON DELETE CASCADE,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,                     -- PKCE, S256 only
  scope          TEXT NOT NULL,
  resource       TEXT NOT NULL,                     -- RFC 8707
  grant_id       TEXT,                              -- set on exchange; a replay revokes it
  expires_at     TEXT NOT NULL,
  used_at        TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mcp_grants (
  id             TEXT PRIMARY KEY NOT NULL,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id      TEXT NOT NULL REFERENCES mcp_clients(id) ON DELETE CASCADE,
  scope          TEXT NOT NULL,                     -- 'mcp:read' or 'mcp:read mcp:write'
  resource       TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at   TEXT,
  revoked_at     TEXT,
  revoked_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_mcp_grants_user ON mcp_grants (user_id);

CREATE TABLE IF NOT EXISTS mcp_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL,
  grant_id   TEXT NOT NULL REFERENCES mcp_grants(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('access', 'refresh')),
  expires_at TEXT NOT NULL,
  used_at    TEXT,                                   -- refresh tokens: when rotated
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_grant ON mcp_tokens (grant_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_expires ON mcp_tokens (expires_at);

-- An organisation owner cut one member's connection off from THEIR organisation.
-- The grant keeps working for the member's other organisations.
CREATE TABLE IF NOT EXISTS mcp_org_revocations (
  grant_id   TEXT NOT NULL REFERENCES mcp_grants(id) ON DELETE CASCADE,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  revoked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (grant_id, org_id)
);

-- Changes an agent made in an organisation, "via MCP (<client>)".
CREATE TABLE IF NOT EXISTS mcp_activity (
  id          TEXT PRIMARY KEY NOT NULL,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_name  TEXT,
  grant_id    TEXT REFERENCES mcp_grants(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  tool        TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  summary     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mcp_activity_org ON mcp_activity (org_id, created_at DESC);
