-- 0033: the notification centre (D12). The bell in the console's top bar lists
-- recent events of the organisation that the member may see: new booking requests,
-- changes and cancellations by clients, client messages, feedback, payment status,
-- new members, layout problems and announcements.
--
-- Additive only: three new tables and their indexes. Nothing existing is touched.

-- One row per event, addressed to the organisation, not to a person: who sees it is
-- decided when it is read, by `area` against the reader's permissions at that moment
-- (an `area` of NULL is for every member). The text is not stored, only `kind` and
-- `params`, so each member reads it in their own language.
CREATE TABLE IF NOT EXISTS org_notifications (
  id          TEXT PRIMARY KEY NOT NULL,
  org_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,             -- e.g. 'booking.requested', 'message.received'
  area        TEXT,                      -- 'reservations' | 'messages' | 'members' | 'halls' | NULL
  params      TEXT,                      -- JSON for the text (titles, names, dates, counts)
  link        TEXT,                      -- an app path ('/app/reservation/…'), never a full URL
  actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL,  -- who caused it: not notified
  dedupe_key  TEXT,                      -- a repeat within the hour updates the row instead
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_org_notifications_org_created ON org_notifications (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_notifications_dedupe ON org_notifications (org_id, dedupe_key);

-- Per-member reads of single notifications ("mark as read", or opening its link).
CREATE TABLE IF NOT EXISTS org_notification_reads (
  notification_id TEXT NOT NULL REFERENCES org_notifications(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at         TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (notification_id, user_id)
);

-- "Mark all as read": everything up to this moment is read for this member, without
-- writing one row per notification.
CREATE TABLE IF NOT EXISTS org_notification_marks (
  org_id     TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_until TEXT NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
