-- Migration 0018 — reservations and messaging (staff side).
--
-- Everything here is additive: new columns, new tables, one new index. The only rows
-- that change are duplicate reservation threads, which are merged (messages moved to
-- the oldest thread) so the new unique index can be created.
--
-- D1 wraps the file in its own transaction; no explicit BEGIN/COMMIT.

-- ── 1. Phone bookings keep the customer apart from the client-visible notes ──────
-- A manual booking used to fold "Customer / Contact / Taken by / internal note" into
-- reservations.description, which the client sees and can edit once the booking is
-- assigned to them. These columns hold that staff-only information instead.
ALTER TABLE reservations ADD COLUMN customer_name TEXT;
ALTER TABLE reservations ADD COLUMN customer_contact TEXT;
ALTER TABLE reservations ADD COLUMN internal_notes TEXT;

-- ── 2. Why a booking was declined or cancelled ────────────────────────────────────
-- status_reason: the text the venue gave when declining (shown to the client).
-- cancelled_by:  'venue' (declined or cancelled by staff), 'client', or 'expired'
--                (a request whose date passed while it was still pending).
ALTER TABLE reservations ADD COLUMN status_reason TEXT;
ALTER TABLE reservations ADD COLUMN cancelled_by TEXT;

-- ── 3. Activity history per reservation ───────────────────────────────────────────
-- Status changes and edits used to be written as "system" messages into tickets
-- without an organisation, which nobody could open and which inflated unread badges.
CREATE TABLE IF NOT EXISTS reservation_activity (
  id             TEXT PRIMARY KEY NOT NULL,
  reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  org_id         TEXT,
  actor_id       TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_name     TEXT,
  kind           TEXT NOT NULL,   -- created | status | edited | declined | expired | assigned
  status         TEXT,            -- the status the booking moved to, when relevant
  note           TEXT,            -- reason, or a short summary of what changed
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS reservation_activity_res ON reservation_activity (reservation_id, created_at);

-- Carry the old system messages over, so the history starts with what is already known.
-- Their body is 'status_change:<status>:<actor name>' or 'reservation_created:<status>:<actor name>'.
INSERT INTO reservation_activity (id, reservation_id, org_id, actor_id, actor_name, kind, status, created_at)
SELECT lower(hex(randomblob(16))),
       r.id,
       r.org_id,
       m.sender_id,
       substr(substr(m.body, instr(m.body, ':') + 1), instr(substr(m.body, instr(m.body, ':') + 1), ':') + 1),
       CASE WHEN m.body LIKE 'reservation_created:%' THEN 'created' ELSE 'status' END,
       substr(substr(m.body, instr(m.body, ':') + 1), 1, instr(substr(m.body, instr(m.body, ':') + 1), ':') - 1),
       m.created_at
  FROM messages m
  JOIN tickets t ON t.id = m.ticket_id
  JOIN reservations r ON r.id = (
         SELECT r2.id FROM reservations r2
          WHERE r2.user_id = t.user_id AND '[Reservation] ' || r2.title = t.subject
          ORDER BY r2.created_at DESC LIMIT 1)
 WHERE m.message_type = 'system'
   AND t.org_id IS NULL
   AND t.subject LIKE '[Reservation] %'
   AND instr(substr(m.body, instr(m.body, ':') + 1), ':') > 0;

-- ── 4. Read state for message threads ─────────────────────────────────────────────
-- "Unread" used to mean "newer than my own last message", so reading a reply never
-- cleared the badge. Same shape as channel_reads (migration 0003).
CREATE TABLE IF NOT EXISTS ticket_reads (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_id    TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  last_read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, ticket_id)
);
CREATE INDEX IF NOT EXISTS ticket_reads_ticket ON ticket_reads (ticket_id);

-- ── 5. One thread per booking and client ──────────────────────────────────────────
-- Parallel first messages each created their own ticket (select-then-insert with no
-- constraint). Merge any duplicates into the oldest thread, then forbid new ones.
UPDATE messages
   SET ticket_id = (
         SELECT k.id FROM tickets k, tickets t
          WHERE t.id = messages.ticket_id
            AND k.org_id = t.org_id AND k.reservation_id = t.reservation_id AND k.user_id = t.user_id
          ORDER BY k.created_at, k.id LIMIT 1)
 WHERE ticket_id IN (
         SELECT t.id FROM tickets t
          WHERE t.reservation_id IS NOT NULL AND t.org_id IS NOT NULL
            AND EXISTS (
                  SELECT 1 FROM tickets k
                   WHERE k.org_id = t.org_id AND k.reservation_id = t.reservation_id AND k.user_id = t.user_id
                     AND (k.created_at < t.created_at OR (k.created_at = t.created_at AND k.id < t.id))));

DELETE FROM tickets
 WHERE reservation_id IS NOT NULL AND org_id IS NOT NULL
   AND EXISTS (
         SELECT 1 FROM tickets k
          WHERE k.org_id = tickets.org_id AND k.reservation_id = tickets.reservation_id AND k.user_id = tickets.user_id
            AND (k.created_at < tickets.created_at OR (k.created_at = tickets.created_at AND k.id < tickets.id)));

CREATE UNIQUE INDEX IF NOT EXISTS tickets_reservation_thread
  ON tickets (org_id, reservation_id, user_id) WHERE reservation_id IS NOT NULL;
