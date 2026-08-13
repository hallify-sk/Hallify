-- Migration 0002 — rate limiting counters.
--
-- Fixed-window counters keyed by "<bucket>:<identifier>", e.g. "login_ip:1.2.3.4"
-- or "login_email:someone@example.com". One row per key; the window resets in place
-- rather than accumulating history, so the table stays small.
--
-- D1 manages the transaction for a --file run; no explicit BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT    PRIMARY KEY NOT NULL,
  count        INTEGER NOT NULL DEFAULT 0,
  window_start TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Supports the opportunistic sweep of stale rows.
CREATE INDEX IF NOT EXISTS rate_limits_window_start
  ON rate_limits (window_start);
