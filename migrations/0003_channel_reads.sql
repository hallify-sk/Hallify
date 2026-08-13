-- Migration 0003 — per-user channel read state.
--
-- The unread badge was computed as "messages posted after MY last message", so
-- opening and reading a channel never cleared it — the count only reset when the
-- user replied. There was no read state to key off; this adds it.
--
-- D1 manages the transaction for a --file run; no explicit BEGIN/COMMIT.

CREATE TABLE IF NOT EXISTS channel_reads (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id   TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, channel_id)
);

CREATE INDEX IF NOT EXISTS channel_reads_channel ON channel_reads (channel_id);
