# Fix progress: reservations, calendar, dashboard, messages, team chat (staff side)

Branch `fix/reservations`. Migrations: `0018_reservations_messaging.sql`, `0018b_channel_attachments.sql`.

| Id | Status | Note |
|---|---|---|
| B17 | done | Staff inbox uploads go to `/api/upload/image` (images only; name/type from the file); errors inline. Client booking page now selects and shows attachments. |
| B35 | done | `/app/reservation/[id]`, RSVP editor, layout and seating sheet check `reservations.view` (others' bookings) via `$lib/server/reservation-access`; 404 otherwise. |
| B40 | done | `$lib/format` (parseDbTime/timeAgo/formatDate/formatDateTime) on dashboard, staff inbox and thread, team chat, history, reservation list, wizard, calendar popover, RSVP templates. Dashboard "upcoming" SQL compared a date with `datetime('now')`; now `date('now')`. |
| B49 | done | Status errors render under the status control with `role="alert"` (`statusError`), not in the message composer. |
| B57 | done | `ticket_reads` read state; unread = newer than my last read and my last message; system messages and org-less threads never count; `postSystemMessage` writes to the activity history instead of org-less tickets. Read marked on staff thread, member thread and client booking page. |
| B58 | done | `send` loads the ticket with the org check (and refuses closed threads) before inserting. |
| B59 | done | Confirm before any status change; `from` status in the form and `WHERE status = old` so a stale tab gets "changed in the meantime". |
| B60 | done | Phone booking customer/contact/note go to staff-only columns (`customer_name`, `customer_contact`, `internal_notes`), never the description. Existing rows are not rewritten. |
| B101 | done | Detail page actions and UI follow `reservations.manage` instead of owner/admin. |
| B105 | done (shell part excluded) | Link to team chat from the staff inbox; empty "Tím" explains who creates channels; a member's createChannel returns a 403 with a message. Sidebar link is the shell team's. |
| B106 | done | `$lib/channels` (slugify with transliteration, empty/length checks, duplicate error keeps the form and typed name). |
| B107 | done | `unread.ts` counts channels with unread colleague messages (same rule as the chat page). |
| B110 | done | Send buttons disabled while sending (staff thread, reservation composer, team chat, client booking page); unique index `tickets(org_id, reservation_id, user_id)` after merging duplicates; `findOrCreateReservationThread` uses INSERT OR IGNORE. |
| B114 | done | Assign/invite toast is a warning when the e-mail failed (the assign path now awaits `notifyEventAssigned`). |
| B121 | done | Request-time sweep expires pending/awaiting-payment requests whose date passed (cancelled_by='expired', history entry); approving a passed request is refused. |
| B134 | done | Start time shown alone ("od 18:00"); date in the viewer's language. |
| B145 | done | Unused `updateStatus` on the list removed. |
| B146 | done | Notes keep line breaks (`pre-line`); customer shown on the detail page, list, calendar and dashboard. |
| B147 | done | Weekend/out/today used the `background` shorthand that wiped the hatching; now `background-color`. Block reasons shown in the day cell and tooltip. |
| B148 | done | `toggleRsvp` refuses while RSVP is off; "Completed" refused for future events. |
| B169 | done | Staff-entered bookings do not e-mail staff (`byStaff` option in createReservation); history still records them. |
| B171 | done | Announcement channels read-only for members; closed threads refuse messages; 5 000-character cap; home calendar day opens the member's own event or the new-event form (was bouncing off the console); member threads e-mail the venue's staff. |
| M1 | done | Approve / Decline buttons for requests; decline with an optional reason stored in `status_reason`, e-mailed (hall-cancellation template) and posted into the booking's thread; staff edit date, times, guests, client notes and internal note with availability/capacity checks (notice period excluded). |
| M7 | done | Server-side search, status/hall/date filters, upcoming/past/all, sort, pages of 50, CSV export with the same filters. |
| M24 | done | Rename, archive/restore, delete channels; @mentions highlighted (no mention notifications); multi-line messages (Shift+Enter); image attachments in channels. |
| M27 | done | `reservation_activity` table (old system messages migrated in); history on the staff page: created, status, declined, expired, edited (staff and client), assigned, client cancel. |
| I11 | done | Phone booking chooses its initial status (default Approved) and may be today/last-minute; start/end time fields added. |
| I31 | done | Chat polls a read-only marker every 4 s (paused when hidden) and reloads only on change; read markers write only when something new arrived; admins can delete any channel message; member threads tagged "Člen tímu" in the inbox. |
| I32 | done (staff side) | Upcoming/past split on the list; finished events say "už prebehla"/"je dokončená", running ones "práve prebieha". |

Files outside the team's ownership touched (smallest changes): `src/hooks.server.ts` (call the expiry sweep), `src/routes/app/reservation/[id]/layout/+page.server.ts` and `manifest/+page.server.ts` (view/manage checks), `src/routes/halls/my-reservations/[id]/+page.server.ts` and `+page.svelte` (attachments, read marker, one thread, send disabled, history, cancelled_by), `src/routes/halls/messages/+page.server.ts` (unread rule), `src/routes/app/+page.svelte` (home calendar click), unowned shared modules `src/lib/tickets.ts`, `src/lib/server/reservations.ts`, `src/lib/server/ops/reservation-ops.ts`.
