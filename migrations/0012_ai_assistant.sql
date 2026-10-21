-- The AI assistant: credits, conversations, and changes waiting for approval.
--
-- Credits are counted in MILLI-credits (1 credit = 1000 mc; 100 credits = 1 EUR).
-- A single chat turn on a small model costs a fraction of a credit, and rounding
-- every turn up to a whole credit would overcharge the people using it most.

-- One row per organisation that has touched the assistant.
--
-- balance_mc is the one number that is spent, so a charge is a single conditional
-- UPDATE and two requests at once cannot overdraw it. Monthly and purchased credits
-- are not kept in separate buckets: monthly credits are spent first, so at a period
-- reset whatever is left of the balance, up to purchased_mc, is purchased credit and
-- survives; the rest was monthly and expires.
CREATE TABLE IF NOT EXISTS ai_accounts (
  org_id           TEXT    PRIMARY KEY NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  balance_mc       INTEGER NOT NULL DEFAULT 0,
  purchased_mc     INTEGER NOT NULL DEFAULT 0,
  -- The period the current monthly allowance belongs to, and what it granted.
  period_start     TEXT,
  period_end       TEXT,
  period_grant_mc  INTEGER NOT NULL DEFAULT 0,
  -- Enterprise allowances are agreed per contract. NULL = the plan's allowance.
  allowance_override INTEGER,
  -- Off until someone with settings.manage turns it on: data leaves for OpenAI, and
  -- that is the organisation's decision to make, recorded with who made it and when.
  enabled          INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  enabled_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
  enabled_at       TEXT,
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Every movement of credit, append-only. The balance is authoritative; this is the
-- record of how it got there, and what the org is shown as its usage.
CREATE TABLE IF NOT EXISTS ai_ledger (
  id             TEXT    PRIMARY KEY NOT NULL,
  org_id         TEXT    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind           TEXT    NOT NULL CHECK (kind IN ('grant', 'purchase', 'charge', 'adjust')),
  amount_mc      INTEGER NOT NULL,          -- signed: grants positive, charges negative
  user_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  feature        TEXT,                      -- 'chat', ...
  model          TEXT,
  input_tokens   INTEGER,
  cached_tokens  INTEGER,
  output_tokens  INTEGER,
  cost_usd_micro INTEGER,                   -- what OpenAI charged us, for margin checks
  -- External reference that must only ever be credited once (a Stripe Checkout
  -- session id). The unique index makes a replayed webhook a no-op.
  ref            TEXT,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_ledger_org ON ai_ledger(org_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_ledger_ref ON ai_ledger(ref) WHERE ref IS NOT NULL;

-- A conversation belongs to one member of one organisation.
CREATE TABLE IF NOT EXISTS ai_threads (
  id         TEXT PRIMARY KEY NOT NULL,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_threads_user ON ai_threads(org_id, user_id, updated_at);

-- The conversation as the model sees it: one row per Responses API input item,
-- replayed in `seq` order on every turn (nothing is stored at OpenAI). `display`
-- is what the page shows for the row, if anything.
CREATE TABLE IF NOT EXISTS ai_items (
  id          TEXT    PRIMARY KEY NOT NULL,
  thread_id   TEXT    NOT NULL REFERENCES ai_threads(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  item        TEXT    NOT NULL,             -- JSON input item
  role        TEXT,                         -- 'user' | 'assistant' for displayed rows
  display     TEXT,
  proposal_id TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_items_thread ON ai_items(thread_id, seq);

-- Files handed to the assistant. Only text formats for now, kept small and inline.
CREATE TABLE IF NOT EXISTS ai_attachments (
  id         TEXT PRIMARY KEY NOT NULL,
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id  TEXT REFERENCES ai_threads(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  content    TEXT NOT NULL,
  size       INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A change the assistant wants to make. Nothing it proposes is written until a
-- person presses Apply, and Apply executes exactly this payload, re-validated —
-- never something re-derived from the conversation.
CREATE TABLE IF NOT EXISTS ai_proposals (
  id          TEXT PRIMARY KEY NOT NULL,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  thread_id   TEXT REFERENCES ai_threads(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  payload     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'discarded')),
  result      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_proposals_thread ON ai_proposals(thread_id);

-- Roles that already run the organisation get the assistant with it. `ai.use`
-- spends the organisation's credits, so it follows settings.manage rather than
-- landing on every member through the default role.
UPDATE org_roles
   SET permissions = json_insert(permissions, '$[#]', 'ai.use')
 WHERE json_valid(permissions)
   AND EXISTS (SELECT 1 FROM json_each(org_roles.permissions) WHERE value = 'settings.manage')
   AND NOT EXISTS (SELECT 1 FROM json_each(org_roles.permissions) WHERE value = 'ai.use');
