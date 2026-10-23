# Fix progress: billing (branch fix/billing)

Migrations: `0015_billing_state.sql` (subscriptions.stripe_plan / stripe_status /
stripe_event_at, halls.public_before_lock, backfill), `0015a_ai_ledger_turns.sql`
(ai_ledger.thread_id / turn_id). Both additive. Apply them before deploying this code:
the webhook writes the new subscription columns.

| id | status | note |
|----|--------|------|
| B1 | done | Every Stripe hand-off (upgrade, portal, pay, resume, cancel, AI packs) is an enhanced form, so the 303 to Stripe becomes a script navigation; `form-action` also allows exactly checkout.stripe.com and billing.stripe.com for no-JS. |
| B2 | done | `constructEventAsync` (SubtleCrypto on Workers); only `StripeSignatureVerificationError` gives 400, anything else 500. |
| B20 | done | `enforcePlanLimits` keeps the plan's number of halls (public first, then oldest) and locks only the rest, remembering `public_before_lock`; with room again (upgrade, renewal) it unlocks and restores visibility. Hall reactivate uses `unlockHall` too. Owners are emailed (I10). |
| B21 | done | Stripe calls in billing and AI actions are wrapped; failures return `fail(502)` with a localized message shown on the page (and inside the plan dialog). |
| B22 | done | Each subscription row stores the newest applied `event.created`; older events are ignored, an ended subscription never comes back, and a non-paying state of another subscription cannot take a paid plan away. |
| B23 | done | Explicit status map: unpaid / incomplete / paused / unknown → `paused` (no paid plan), incomplete_expired → `cancelled`. Raw Stripe status kept in `stripe_status`. |
| B42 | done | Plan features built from limits in sk/en (`$lib/plan-features`), localized status pill, dates via `formatDate`, money via `formatMoney`. |
| B83 | done | Success URL carries `{CHECKOUT_SESSION_ID}`; the page verifies the session with Stripe and the org, applies the subscription, celebrates and sends the GA4 purchase once per session (transaction id = session id). AI `?topup=` likewise verifies and credits a paid pack, says "processing" for unpaid. |
| B89 | done | `subscriptions.plan` is now the plan the org is entitled to: paused/unpaid/incomplete subscriptions drop to Free (halls, domains, webhooks follow everywhere), the subscription's plan is kept in `stripe_plan`. past_due keeps the plan during Stripe's retries by design, with a red banner on billing, a console-wide banner for the owner and an email. Migration moves existing `paused` rows to Free. |
| B90 | done | Unknown/deleted org → acknowledged (200, logged), no FK failure; no `items` → handled. |
| B92 | done | `checkout.session.async_payment_succeeded` credits the pack (idempotent per session). |
| B102 | done | Billing actions require `billing.manage` (owner always has it; matches the permission's description "change plan, payment details and invoices"). Others see the page read-only with a note; setup-request buttons only for settings.manage. |
| B160 | done | With no venues the mapping add-on says to add a venue first. |
| B161 | done | Unknown price without usable metadata (or `plan: gold`) leaves the plan unchanged and is logged; never drops to Free or 500s. |
| M16 | done | Usage meters on the billing page: active venues, members, bookings this month (busiest venue), gallery and extras (largest venue), AI credit balance vs allowance; plan cards list extras and AI credits. |
| M29 | done | Requester gets a confirmation email; pending card shows date, agreed price and note, with a cancel action (while requested/contacted). Shared by Billing and Help via `$lib/server/setup-requests`. |
| I4 | done | Charges record `thread_id` + `turn_id`; activity groups one row per question with call count and a link to the conversation (own threads only), shows the current period by default (grant stays visible) with a link to earlier periods. |
| I10 | done | Owners are emailed on payment failure, suspension and end of subscription (with the halls that were hidden); banner on the billing page and on every console page for the owner. |

# Fix progress: platform team (emails, notifications, request hooks, production files)

Branch: fix/platform

| id | status | note |
|----|--------|------|
| B166 | done | static/marketing/PHOTO-SOURCES.md moved to docs/marketing/ (content kept). |
| I13 | done | favicon.ico, apple-touch-icon.png, icon-192/512.png, site.webmanifest, /.well-known/security.txt (route, Expires always ~a year ahead), static/_headers with long cache for fonts and marketing images. |
| B12 | done | hooks: http to https (301 GET/HEAD, 308 otherwise) on every production host incl. venue subdomains and custom domains; scheme read from CF-Visitor, then X-Forwarded-Proto, then the URL; never on localhost, *.localhost, IPs, workers.dev, pages.dev (src/lib/server/edge.ts). Cloudflare 'Always Use HTTPS' and HSTS preload remain owner settings. |
| B124 | done | www.hallify.sk redirects to hallify.sk (same path and query), so the canonical is single. |
| I9 | partial | App-level Origin check on POST/PUT/PATCH/DELETE to /api/* and /app/manage/assistant/* (Stripe webhook and cron exempt); foreign or opaque Origin, or Sec-Fetch-Site cross-site, gets 403. TLS minimum, HSTS preload and dropping unsafe-inline are owner decisions. |
| B8 | done | src/lib/server/background.ts: hooks runs each request in an AsyncLocalStorage scope holding ctx.waitUntil; every exported sender in email.ts is wrapped with inBackground, so the existing fire-and-forget `notifyX().catch()` call sites are kept alive on Workers without changes. The hourly housekeeping writes in hooks are kept alive the same way. (dispatchWebhooks has the same fire-and-forget pattern in files of other teams; it can use keepAlive from $lib/server/background, not changed here.) |
| B9 | done | renderTemplate escapes every variable (and keeps line breaks); all email bodies go through it or escapeHtml. Tested with the report's payload. |
| B96 | done (email side) | An empty or whitespace-only stored template, or one equal to a shipped default (old English or new sk/en), falls back to the default in the recipient's language, so the frozen 9-template save no longer pins anything. Reset/preview UI on /app/platform/email is the settings team's page. |
| B10 | done | Migration 0016 adds users.locale; hooks copies a signed-in person's explicit choice (cookie or ?lang) onto the account once per change. Every email is rendered in the recipient's language (own choice, else the venue's default, else Slovak); staff emails per recipient. Status keys translated with statusLabel, plus a per-status explanation and the venue's note; org invite, announcement wrapper and password reset localized. |
| M5 | done | Notification emails link to the booking or thread (staff: console; client: the venue's own site), carry the venue's name as sender name ('<venue> cez Hallify') and in the header, and set Reply-To: client emails reply to the hall's contact address (else another hall's), staff emails reply to the client. Call sites pass reservationId/ticketId. |
| I6 | done | One inline-styled layout (src/lib/server/email-layout.ts) for every email: brand header, details table (event, hall, date, time, guests, client, status), quoted note, button with link fallback, footer. guestEdit lists what changed (old to new), newMessage and guestMessage include the message, line breaks kept. |
| B112 | done | 'Whole team' now means every member: emailOrgStaff and the recipient list in Settings > Advanced include role 'member'. |
| B113 | done | If none of the chosen recipients is still a member, the email goes to the whole team instead of nobody, and Settings shows 'Celý tím' instead of 'Nikto'. |
| B3 | partial | Code side done: getEmailHealth/emailServiceDown (key missing or Brevo 401/403 with nothing delivered since); /api/health reports email and returns 503 during an outage so an uptime monitor alerts; platform dashboard shows an outage alert with the last Brevo error; Workers log an explicit OUTAGE line; both forgot-password forms say email is unavailable instead of 'sent' during an outage (same answer for every address, no enumeration); the test email shows the Brevo error. Re-enabling the production Brevo key is the owner's. |
| B93 | done | Suspended venue: its subdomain or custom domain shows a page saying the site is temporarily unavailable (503, noindex, link to other venues) instead of bouncing to the apex; custom domains of suspended orgs no longer keep serving. Owner: moved to another active org if they have one, else /app and /app/manage show "your organisation is suspended", with the contact address and sign-out. Platform admins can "view as" a suspended org (org/switch and loadOrgContext no longer exclude it). No reason is shown: there is no reason field, and the suspend action is on the settings team's platform page. |

## Checks

- npx vitest run: 32 files, 293 tests pass.
- svelte-check (check.sh): 0 errors.

## Foreign files touched (smallest change)

- src/app.html: apple-touch-icon and manifest links (I13).
- Notify call sites now pass reservationId / ticketId / message / changes (M5, I6): src/lib/server/reservations.ts, src/lib/server/ops/reservation-ops.ts, src/lib/server/hall-archive.ts, src/routes/app/reservation/[id]/+page.server.ts, src/routes/app/manage/reservations/+page.server.ts, src/routes/app/manage/messages/[id]/+page.server.ts, src/routes/halls/[slug]/book/+page.server.ts, src/routes/halls/my-reservations/[id]/+page.server.ts.
- src/routes/app/manage/settings/advanced/+page.server.ts: members selectable, empty kept list shows the whole team (B112, B113).
- src/routes/app/forgot-password/+page.server.ts, src/routes/forgot-password/+page.server.ts, src/routes/api/health/+server.ts, src/routes/app/platform/+page.server.ts, src/routes/app/platform/+page.svelte: email outage made visible and never reported as sent (B3).
- src/routes/app/org/switch/+server.ts: admins may view a suspended org (B93).

## Notes for other teams

- /app/platform/email lists template variables; newMessage now also has {{message}}, guestEdit {{changes}}, statusChange {{statusInfo}}. getEmailTemplates(db, locale) takes a locale; isDefaultTemplate() is exported for a reset button.
- sendAnnouncementEmail now returns { sent, failed } so the announcements page can stop claiming "emailed" blindly.
- Migration 0016_user_locale.sql must be applied (local, dev, prod); email code falls back gracefully until it is.

# Fix progress: permissions team (fix/permissions)

| id | status | note |
|----|--------|------|
| B5 | done | Legacy /app/manage/users and /users/[id] removed; GET on the old paths redirects to /app/manage/members, old POST actions get 405. Nothing linked to it. |
| B32 | done | Inviting or switching someone to the Admin level now requires the actor to be able to grant every Administrator permission (`canGrantAdminAccess`); the Admin option is disabled in the UI otherwise. |
| B33 | done | Members `changeRole`/`remove`, Invites `invite`/`revoke` and every Roles action no longer call `requireOrgStaff`; they check members.manage / invites.manage / roles.manage plus rank. |
| B34 | done | The legacy-admin fallback lives in one place (`withLegacyAdmin`), applied by `loadMemberAccess`, `buildAccess`, `actorContext` and `targetMemberAccess`. Becoming an admin (invite, access-level select) attaches the Administrator role row so admins get its rank; migration 0017 attaches it to existing flag-only admins. |
| B86 | done | Invites count pending (unexpired, unaccepted) invites against the seat cap (`seatsSpokenFor` in $lib/server/invites), excluding the address being re-invited; also fixed the text comparison that kept expired invites alive until midnight. limits.ts untouched. |
| B114 | done (invite part) | A failed invite e-mail is reported in an error banner with the invite link and a Copy button, instead of a green success. Assign-client toast and announcements are other teams' scope. |
| M12 | done | Invites list: Copy link on each pending invite, Resend (new token, fresh 7 days, re-checks rank/roles/seats) on pending and expired ones; expired invites stay listed for 30 days marked "Platnosť vypršala". |
| B157 | done | Invalid e-mails refused (`enterValidEmail`); revoking an invite that no longer exists returns 404 "Táto pozvánka už neexistuje" (meta.changes); members ordered owner, admins, members. |
| B103 | done | Both invite pages render a used / expired / revoked invite as their own page state ("Táto pozvánka už neplatí" plus what to do next) instead of throwing into the generic error page; /invite/<token> only resolves on the invite's own venue site (or the apex). +error.svelte (discovery team) untouched. |
| B26 | done | Client holds: at most 3 active per client, a hold ends 30 min after it was taken however often it is renewed, at most 3 fresh holds of one hall+date per client per 3 h, impossible dates refused (`isRealDateISO`, also used by `assertCanBook`), and the API runs `assertCanBook` first so past, closed, blocked and capped dates cannot be held. Booking form shows the server's reason (small change in ClientBookingForm.svelte and holdClient.ts). Staff holds are not capped, and a client's hold still blocks staff for its (now bounded) life. |
| B151 | done | /api/upload/image checks the file's signature bytes (JPEG, PNG, GIF, WebP) and stores/serves the detected type; anything else is refused with "Tento súbor nie je obrázok." |
| I28 | done (role names only) | Creating or renaming a role to a name another role in the org already has (ignoring case and spaces) is refused, and the Roles tab warns while you type. Existing duplicates can still be saved unchanged. |
| M11 | done | Members tab, owner only (not when impersonating): "Odovzdať vlastníctvo" picks another member, requires the owner's password (attempts share the account's sign-in rate limit), swaps the roles in one batch (new owner loses role rows/overrides, old owner becomes admin with the Administrator role). Billing stays on the org. The leave-org error now points here. |

Checks at the end: `npx vitest run` 32 files / 287 tests pass; svelte-check 0 errors (131 warnings, unchanged). Migration: `migrations/0017_admin_role_rows.sql`.

# Fix progress: shell (console shell, sidebar, phone layout, themes and focus)

Branch: fix/shell

| id | status | note |
|----|--------|------|
| B131 | done | readableInkOn picks whichever of near-black and white contrasts more; #f05ca1 now gets dark text (6:1). |
| B133 | done | app.css drops the outline only for the text-like fields that get the box-shadow ring; checkboxes and radios get an offset focus outline again. |
| B167 | done | The stored/OS theme is applied only on console paths (/app/*, not the site-builder preview) in app.html and the root layout; leaving the console removes data-theme, so the venue site stays light. |
| B156 | done | Org switcher (and the sidebar user menu) close after every navigation (afterNavigate) and on Escape. Only the switcher part was in scope. |
| I28 | done | Org switcher shows each org's slug next to the role, and the slug in the button tooltip, so same-named orgs can be told apart. |
| B36 | done | Root layout loads the member's effective permissions (same resolution as requireOrgPermission, in $lib/server/nav-access); $lib/console-nav maps each sidebar link to the guard of its page, so custom roles see their pages and plain members see none. |
| B78 | done | Sidebar "Verejná stránka" goes to the venue's /halls on its own host and, from the apex, to its own domain (orgPublicBaseUrl + /halls, new tab); "Hľadať priestor" stays for the apex venue search. |
| B105 | done | Owners/admins get a "Tímový chat" link to /app/messages next to the client inbox (only the sidebar link is ours). |
| B108 | done | The root layout sends the presence heartbeat every 30 s (and on returning to the tab) from every console page for signed-in staff, not only from Messages. The Messages page still sends its own beat (reservations team file; harmless duplicate, can be removed there). The dashboard count refresh is not in this scope. |
| B7 | done | Below 900 px the console shows a top bar (menu button with unread ping, logo, org name); the sidebar leaves the row and opens as an off-canvas drawer (role=dialog with the shared dialog action: Escape, focus trap, focus return; closes on backdrop, navigation and widening). Content gets the full width; the editor rail mode is unchanged on desktop and never applies inside the drawer. Individual pages that are too wide at 390 px (e.g. the team chat panes) belong to their owners. |

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

# Venue site fixes (branch fix/venue)

| Id | State | Note |
|----|-------|------|
| B11 | done | /halls shows an empty state (and hides search/CTA) when the venue has no public hall yet. Slugs at creation are other teams'. |
| B14 | done | Hall and site Contact links only render http(s) websites (safeHref / displayWebsite). |
| B18 | done | Saved accent, display name and logo are applied to the venue site (accent written after the template tokens, ink tuned for contrast) and to its sign-in/recovery pages, under the paid-and-current plan rule. |
| B19 | done | Venue-site bookings dispatch the reservation.new webhook with the staff payload. |
| B39 | done | Statuses, dates, message times, prices, member roles and ticket subjects use the visitor's locale. |
| B48 | done | /forgot-password and /reset-password render a venue-branded card (no Hallify shell), 8-character hint and minlength; invalid-link points to the venue's own recovery page. One line added to AUTH_PATHS in src/routes/+layout.svelte (shell team's file). |
| B49 | done | Booking errors render next to the submit button (role=alert, scrolled into view); detail-page update/cancel/extras errors render next to their control. |
| B50 | done | Calendars get server-computed unavailable dates (blocks + closed weekdays). Refusing holds on closed days in /api/holds belongs to the permissions team (B26), which reuses assertCanBook. |
| B51 | partial | Full months are shown as unavailable with a note, the hold is released on refusal, the message names the month and no longer leaks the plan limit, and the error is visible. Whether pending requests should count toward the cap is a policy decision (approvals don't check the cap, so excluding them would let a month overfill). |
| B52 | done | Cancel is only offered within the notice period; the deadline is shown, and after it a note tells the client to message the venue. Page and action share one rule. |
| B53 | done | Sign-out link does a full page load. |
| B55 | done | Venue form shows the auto-approve note when the hall auto-approves; the success banner says "confirmed" for approved bookings. Client confirmation email is M4 (another team). |
| B56 | done | Own hold reads "Podržané pre vás" / "Held for you". |
| B71 | done | Public pages name custom amenities from org_amenities, falling back to a humanised key. |
| B74 | done | Public opening hours fill untouched days with the console default (09:00–22:00), only explicit open:false shows as closed. |
| B88 | done | Clients see and can order only the oldest extras up to the plan limit (an already ordered one stays). Console-side marking of over-limit extras is not in scope. |
| B127 | done | Website shown shortened, wraps; link keeps the full URL. |
| B135 | done | SiteShell and the cookie banner have print rules. |
| B136 | done | Phone nav becomes a full-width tab bar under the brand row; My reservations tabs wrap. |
| B143 | done | Login errors only show on the tab that produced them; negative guest counts get "Zadajte platný počet hostí" (booking and edit). |
| B144 | done | src/routes/halls/+error.svelte shows the server's 4xx message inside the venue site. |
| B173 | done | The cookie banner publishes its height as --consent-space; the venue site pads its content by it. |
| B174 | done | "Napíšte priestoru" extras hint hidden on cancelled, completed and started bookings. |
| M2 | done | Client registration links Terms and Privacy, requires the checkbox and records a legal_acceptances row (migration 0019_legal_acceptances, IF NOT EXISTS, same schema as production). |
| M26 | done | Read-only availability calendar on the public hall page (taken, unavailable, full months; no booker details). |
| I30 | done | MiniCalendar: one tab stop with arrow/Home/End/PageUp/PageDown navigation, unavailable days announced via aria-label/aria-disabled. |
| I32 | done | Finished bookings say "Táto udalosť sa už skončila" instead of "already started". |

# Discovery fixes (fix/discovery)

| id | status | note |
|----|--------|------|
| B4 | done | Venue cards and the venue page send "Rezervovať" to the booking page on the venue's own site (custom domain or org subdomain); old /app/halls/<id>/book redirects there. |
| B13 | done | Search matches every word of the query in name or address, diacritics-insensitive; a geocoded query widens results (text OR area) instead of filtering them; the area filter starts off. |
| B38 | done | On phones the explorer is a normal scrolling page: map on top at a fixed share of the screen, then search, filters and all results in flow (no inner scroll box, no fixed-height shell). |
| B45 | partial | All operator-page sign-up links preselect "Prevádzkujem priestor" (intent=operator) and name the chosen plan (plan=<id>). Carrying the plan on through registration and org creation needs the register/org pages (accounts team), which do not read it yet. |
| B71 | done | Apex venue page names built-in and custom amenities (org_amenities labels); unknown keys are dropped. |
| B73 | done | Directory lists a hall only when public, live, with a slug and an address or a map position (LISTED_HALL_SQL). |
| B75 | done | Booking CTA only for halls that take bookings; otherwise a "no online booking" note. |
| B76 | done | Apex pages and the sitemap use the listing rule (plan lock, archive, org suspension); venue site list/detail and its sitemap hide plan-locked halls. |
| B125 | partial | Code side done (same listing gate as B73). Removing the three test venues on production is the owner's call. |
| B126 | done | Venue links go to indexable /priestory/<org>/<hall>; "Detail" is a link; /app/halls/* redirect there. |
| B163 | done | Marketing theme choice is kept for the visit (module state) and in a cookie the page loads read, so it survives navigation and reloads without a flash; <html lang> follows chooseLocale and the marketing shell. |
| B164 | done | Cards on the landing page, the explorer and the preview fall back to the placeholder when a cover fails to load; no "Hallify" stand-in for a missing address; the card top line wraps (address ellipsised, partner label on its own) at 10px on phones. |
| M19 | done | Indexable venue page with canonical, hreflang, og:image, JSON-LD EventVenue; og:image on marketing pages; canonical/OG on venue sites (VenueSiteMeta in the halls layout); venue pages in the apex sitemap. |
| M20 | done | Directory: sort (recommended, nearest, capacity both ways, lowest price, name), a date filter backed by /api/venues/availability (notice period, monthly cap, closed days, blocks, bookings), list paging by 24 with the map showing all; the landing page shows 12 cards and links to the rest; server cap raised from 120 to 500. |
| I21 | partial | Done: demo venues and the empty map centre on Slovakia; overlapping pins cluster into a counted marker that zooms in; public 404/error pages on the Hallify site use the marketing shell (with a link to the directory). Not done (owner decisions): FAQ, VAT note, plan comparison copy. |
| I33 | done | One robots group, Allow /uploads/halls/, client pages disallowed on venue sites; lastmod from halls.updated_at (migration 0020, trigger-maintained). |

# Fix progress: settings team (fix/settings)

| id | status | note |
|----|--------|------|
| B6 | done | Close org, leave and webhook delete use `confirmFirst`; Cancel now cancels. |
| B24 | done | Closing cancels the Stripe subscription first (strict: closing aborts if Stripe fails); Stripe webhook ignores events for deleted orgs. |
| B25 | done | Clients with upcoming bookings are emailed (sk + en) before deletion; the danger zone and confirm dialog say how many. |
| B49 | done | Danger-zone errors render inside the danger zone with role=alert. |
| B80 | done | Webhook URL must be public https (isSafeWebhookUrl) on create/edit and again at send time; redirects not followed. |
| B87 | done | Webhooks stay listed after a downgrade as "paused by plan" and can be deleted. |
| B104 | done | Any member can leave (Settings > Advanced, or /app/org/leave for members without console access); roles and overrides are deleted. |
| B159 | done | Webhook form stays open with its input on a validation error. |
| I15 | done | Closing leads to /app/org-closed with a summary (billing, clients emailed). |
| I16 | done | Webhook test send, edit, delivery detail (payload, error), retry, translated statuses. |
| M10 | done | Owner can download all org data (JSON) or bookings (CSV) from Advanced. |
| B40 | done | Webhook delivery log (timeAgo + full time via parseDbTime) and announcement times (formatDateTime, viewer locale) read UTC correctly. |
| B16 | done | Preview posts a $state.snapshot (the proxy threw DataCloneError and froze the builder); posting is guarded. |
| B79 | done | On Free the section controls are disabled with a plan notice, saving keeps stored texts/sections, and the preview shows what visitors get. |
| B17 | done | Logo upload posts to /api/upload/image, shows an error when it fails; accept list and hint match the endpoint (no SVG). |
| B77 | done | Name and theme are controlled state (no longer overwritten on re-render); the org default theme applies to members without a personal choice (root layout); accent ink was already derived. |
| B37 | done | Platform settings forms no longer reset (update reset:false) and fields re-seed from saved data. |
| B94 | done | "Otvoriť priestor" posts to View as with return_to the hall. |
| B95 | partial | Slug limited to 63 chars (slugify), confirm dialog warns the old URL stops working, change audited. No redirect from the old slug (needs a slug-history table + hooks change). |
| B96 | done | Per-template restore-default, customised badge, sandboxed preview with sample data; only real overrides are stored (empty = default). |
| B114 | done | Announcement emails are counted (delivered/failed), stored and reported truthfully. |
| B158 | done | Server URL without GTM id refused; visitor default language no longer switches the console; unused slogan field removed (value kept); reset-to-defaults confirms; announcements signed "Tím Hallify". |
| B162 | done | Users list uses enhanced forms with confirms and shows errors; no revoke button on your own row. |
| M22 | done | platform_audit_log (migration 0021) records admin grants, plan/slug/partner/suspend, View as, credits, announcements, settings and email templates; /app/platform/audit and per-org log. |
| M23 | done | Org detail page: grant/remove AI credits with reason (ledger row + audit). |
| I7 | done | Users: search, account-type filter and column; orgs: plan/status filters; announcement picker: search + slug. |
| I18 | done | Announcements: edit, expiry date, live preview; "all" reaches only orgs that existed when published. |
| I19 | done | "Paid" counts Stripe-backed subscriptions only, manual plans shown apart, partners = is_hallify_partner. |
| B81 | partial | Strict hostname validation (rejects -bad-.sk, a..b.sk; pasted URLs tidied), clear pending-verification explanation, unverified claims expire after 7 days so a squatter cannot block the owner. Real ownership verification needs Cloudflare for SaaS (owner). |
| I17 | done | No CF_ZONE_ID jargon: plain notice when connection is manual, refresh step only when automatic, "čaká na pripojenie" label. |
| B82 | done | All help articles in Slovak and English; categories, page title and "More in" localized; both languages sent so the switch needs no reload. |
| M21 | done | Help search (diacritics-insensitive, ranked) and new SK+EN articles: public site, webhooks, AI assistant, messages, calendar (+ export and closing). |

Note: migration 0021_announcements_and_audit.sql must be applied (npm run migrate:local) before running this branch; the announcement queries in the root layout read the new expires_at column.

# Fix progress: halls (hall management in the console)

Branch `fix/halls`, migration `0022_hall_slugs_and_profile_cleanup.sql`.

| id | status | note |
|----|--------|------|
| B11 | done | Console/AI-created halls get a unique slug (`uniqueHallSlug`, Slovak transliteration); 0022 backfills every NULL slug. The wizard's own insert is the accounts team's. |
| B14 | done | Website validated with `normaliseWebsite` on save (profile form and assistant patch); 0022 removes stored non-http(s) links. Rendering with `safeHref` is the venue team's. |
| B29 | done | "Uložiť všetky zmeny" finds the first invalid field on any tab, opens that tab and reports it; website field is plain text; slug field no longer browser-required. |
| B62 | done | Pasted image URLs are copied into R2 by `/app/manage/halls/import-image` (importImage, SSRF-safe); the server refuses new non-own image URLs (existing ones are kept). |
| B70 | done | Table-type steppers no longer clamp per keystroke; values are clamped when the field is left. |
| B72 | done | Settings form posts booking rules only; `saveInfo` uses `updateBookingSettings`; errors are shown. |
| B73 | done | New console/AI halls are drafts (`is_public = 0`) with a slug; listing needs an address. Directory filter is discovery's. |
| B74 | done | All seven days stored with the console defaults (`completeOpeningHours`), also for assistant patches; 0022 completes partially-set hours. |
| B84 | done | Reactivation error is shown and localised; when the plan is full the banner offers swapping (pause another hall, activate this one). |
| B85 | done | Gallery limit blocks only growth; an over-limit gallery can be saved, reordered and trimmed. Localised message. |
| B98 | done | Block dialog lists/cancels only live upcoming bookings on the chosen weekdays; server re-derives them; clients get the status message, note and email; webhook fires. |
| B99 | done | The listed toggle follows the server after archive/plan lock; profile fields re-sync after a successful save. |
| B140 | partial | Slug not browser-required (derived from the name when empty), reserved words refused, clash suggests a free slug. Slugs stay unique across Hallify: the apex `/app/halls/<slug>` route resolves them globally (discovery owns it). |
| B150 | done | Deleting a custom amenity unticks it on every hall of the org; 0022 removes leftovers. |
| B152 | partial | Photos of deleted halls and photos removed from a hall are deleted from R2 when nothing else references them. Closed orgs: `orgHallImageUrls` + `deleteUnusedHallImages` are ready for the settings team's org closure (needs the R2 binding there). Production test cover is the owner's. |
| B153 | done | Restore at the limit gives restore-specific advice; Create is disabled at the limit with an upgrade link; create advice no longer says "reactivate". |
| B170 | done | Floor-plan request email escapes org, hall and user names. |
| M14 | done | Gallery photos can be moved earlier/later and set as cover. |
| M15 | done | Leaving the hall page with unsaved changes asks first (browser prompt on reload/close). |
| M25 | partial | Owner sees the request status, dates and note and can withdraw an open request (operator is emailed). Status-change emails and a delivery attachment belong to the platform queue (settings/platform teams). |
| I2 | done | Photos are downscaled in the browser before upload (longest side 2000 px, JPEG/WebP 0.85). srcset is not part of this scope. |
| I14 | done | Create disabled at the limit with upgrade link; default names numbered; skipped gallery photos are reported. |
| I15 | done | Toasts for archive/restore/reactivate, notice after delete; `hall.archived/restored/deleted` webhooks; cancellation payloads carry `hall_id` and `reason`. |

# Fix progress: editors (floor-plan editor, templates, event layouts, seating)

Branch: `fix/editors`

| Id | Status | Note |
|----|--------|------|
| B65 | done | `countSeats` counts round tables by `chairs` and adds standalone chairs, matching the editor. |
| B109 | done | `csvCell` defuses `= + - @ \t \r` values with a leading apostrophe before quoting. |
| B66 | done | Guest CSV import decodes strict UTF-8, else Windows-1250 (and UTF-16 with BOM), so names and the Poznámka column survive. |
| B27 | done | Applying a template asks first, keeps the guest list (re-seats guests whose table id + chair, or standalone chair, still exists; `floorplan-layout.ts`), reports what happened and offers Undo. |
| B31 | done | Staff `loadTemplate` uses the same owner/admin-or-own-and-live gate as `saveLayout`. |
| B69 | done | Template id and current layout go in the enhance `formData` (no stale hidden input); failures are shown. |
| B28 | done (editor side) | Hall and event editors rebuild when the draft in the URL changes on client-side navigation; MapEditor `autosave` prop stops step-change saves of drafts. "Applied" bookkeeping is the AI team's. |
| B63 | done | `LayoutSaver` + `guardUnsaved` (src/lib/editor/layout-saver.svelte.ts): in-app navigation waits for the save, tab close prompts and sends a keepalive save; used by hall, template, staff and client editors. A freshly opened plan is no longer marked unsaved. |
| B111 | done | Floor-plan autosave sends a content hash of the plan it started from; the server refuses (409) a save over a newer plan, the editor stops autosaving and offers "load newer" or "overwrite". No migration needed. |
| B54 | done | Client layout honours `custom_layouts` off / `force_layouts` on: guests-only "seating" mode, tables locked in the editor, and `saveLayout` refuses any furniture change (`arrangementKey`). Template switching stays allowed. |
| B61 | done | Client sees a client-appropriate message when the hall has no table types; client editor no longer overflows the window (takes back the site column padding, 100dvh). |
| B68 | done | MapEditor change effect reads `floors` tracked, so a rename is reported and saved. |
| B141 | done | Shift+1 matched by `e.code`; checkboxes/radios/buttons no longer count as typing; "(experiment)" dropped from the label. |
| B142 | done | Chair fields show the capped value; legend moved below the instruction bar; room notices clear on tool/step change; a room part wholly inside the room is refused (`rectCovered`). |
| I25 | done | Zones from the hall plan (`hallZoneIds`) are locked in template and event editors (no select/drag/reshape/erase/delete/context menu). UI-level; the server does not re-check zones. |
| I3 | done | Tables carry a stable `num` (assigned on load and on placement/duplication, `tableNumbers` in floorplan-layout.ts); canvas shows T3 + label, seat chips "T3 · miesto 2", manifest/CSV/print use the same numbers. |
| M13 | done | Printable hall floor plan (`/app/manage/halls/[id]/editor/print`) and template (`…/templates/[templateId]/print`) via `PlanPrintDoc`, linked from the editors' check step; manifest prints zone labels on the plan, table notes (list + roster rows). Root layout renders these print routes without the app shell (one-line change in src/routes/+layout.svelte). |
| B67 | done | Below 760 px the editor shows a read-only plan per floor with a "needs a bigger screen" note instead of a 0-px canvas; editor toolbars wrap. |
| I23 | done | Pillar size and square/round options (round = 24-gon wall); width/depth fields for a selected axis-aligned wall (thickness); live length of the side being drawn; measurement labels placed by priority without overlapping (`label-layout.ts`). |
| I24 | done | Re-import skips guests already on the list (name + group) and says who; export headers localised, `;` for Slovak. |

Foreign file: `src/routes/+layout.svelte` (shell team) — `isDocPage` also matches the two new print routes.
No migration was needed (B111 compares a content hash of `halls.floorplan_json`).

Checks at the end: `npx vitest run` 33 files / 293 tests pass; svelte-check 0 errors.
Not verified in a browser (per instructions): the narrow view, label placement, the print sheets and the client editor height.

# Fix progress — accounts (sign-up, sign-in, profile, first run, new organisations)

| id | status | note |
|----|--------|------|
| B43 | done | Brand panel on the auth pages reads from i18n (sk + en). |
| B46 | done | Reset tokens stored as SHA-256 (legacy 32-char links still honoured for their hour); a completed reset spends every outstanding link and deletes all sessions; links are scoped apex vs. venue; double redemption refused. Apex + venue reset routes (venue files touched minimally). Changing the password in the profile signs out other sessions. |
| B130 | done | Forgot-password link moved after the password input in the DOM (grid keeps it beside the label), so Tab goes email -> password. |
| B172 | done | A legacy apex client account (client, no org) is turned into a personal Hallify account at sign-in instead of getting a session that is then ignored. |
| I27 | done | Sign-in counts only failed attempts (new rateLimitStatus peek); registration is counted after the form validates. |
| B44 | done | Register name/email fields are bound $state, so switching the intent no longer resets them. |
| M2 | done | Apex sign-up links Terms and Privacy with a required checkbox (checked server-side) and records the acceptance in legal_acceptances (migration 0024 creates the table where missing; helper shared verbatim with the venue branch). |
| B47 | done | Changing the login email requires the current password (rate-limited like sign-in), the address is format-checked server-side (also at sign-up), and the old address gets a notice (bilingual, escaped). |
| B155 | done | Profile email uniqueness is checked within the account's own namespace (org_id IS NULL for Hallify accounts), so venue clients' addresses no longer leak. |
| B91 | done | Session check and cleanup (sessions, resets, org and reservation invites) compare datetime(expires_at) with datetime('now'), so ISO timestamps expire on time. The pending-invites list is fixed the same way on fix/permissions (left to them to avoid a conflict). |
| B154 | done | GET /app/logout shows a "Sign out?" page with a POST button (signed-out visitors go to sign-in); signing out on GET would be CSRF-able. |
| B15 | done | New organisation slugs use slugify (Kaštieľ Ťahanovce Žilina -> kastiel-tahanovce-zilina), via a new uniqueOrgSlug helper. |
| B97 | done | uniqueOrgSlug also refuses any slug in closed_organizations, so a closed venue subdomain is never handed to a new organisation. |
| I28 | done | Creating an organisation with the name of one you already belong to asks for confirmation first (warning + "Yes, create another"). |
| B11 | done | The wizard creates its hall with a unique slug (slugify, global check, venue-site paths reserved), so the venue site lists it at once. Venue-site empty state is the venue team's part. |
| B30 | done | Every wizard action requires settings.manage, and createVenue/saveDetails also halls.manage (requireOrgPermission); the page sends members without it home instead of a 403. |
| B119 | done | Plan step shows the current plan's limits (unlimited spelled out), custom domain on/off from the plan, only higher plans as offers, and "Pokračovať" instead of "stay on free" for paid orgs; the venue step says "add another venue" when the org already has halls. |
| B156 | done | Wizard errors carry the step that produced them and only show on that step; the register "Prihláste sa" link keeps ?redirect. (Org switcher part belongs to shell.) |
| B116 | done | /app is now a home for accounts with no organisation (invitations waiting for them, find a venue, create an organisation, profile) instead of redirecting to /priestory; /app/messages without an org goes there instead of the create-org form; /app/welcome redirects (sign-in or home) instead of a raw 401/403. |
| B117 | done | /app sends anyone with console access to /app/manage, so sign-in, the logo and Home all reach the real dashboard. |

## Notes for the merge

- Files outside this team's ownership, changed minimally: `src/routes/forgot-password/+page.server.ts` and `src/routes/reset-password/[token]/+page.server.ts` (B46, hashed tokens; hunks kept clear of the venue branch's edits), `src/lib/cleanup.ts` (B91), `src/routes/app/messages/+page.server.ts` (B116, one line in `load`).
- `src/lib/site/legal-acceptance.ts` and its test are byte-identical copies of the venue branch's files, so the add/add merges cleanly. `migrations/0024_legal_acceptances.sql` repeats 0019's IF NOT EXISTS definition.
- Wizard and console hall slugs: the wizard uses `uniqueHallSlug` (`src/lib/server/onboarding-hall.ts`); the console's creation is the halls team's.

## Checks

- `npx vitest run`: 34 files, 276 tests passed.
- svelte-check: 0 errors.

# AI assistant fixes (team ai, branch fix/ai)

| id | status | note |
|----|--------|------|
| B122 | done | renderReply renders headings, numbered lists, rules and pipe tables (escaped first); styles in page and widget |
| B123 | done | full page follows open_page (navigates, conversation continues in the open widget) |
| B139 | done | one formatter `creditAmount` (src/lib/assistant/credits.ts) for header, widget and settings/ai |
| B28 | done | recordSavedDraft() measures the saved JSON (seated guests, edited or not); a save carrying none of the proposal withdraws it as "not saved" instead of "applied". Callers in the two editor routes switched (one line each). The editor reload itself is the editors team's part |
| B149 | done | neutral "Ukladá sa…" on non-import cards; action rows wrap; launcher (and panel) sit above the step buttons on the three full-screen editors; hall card note no longer mentions photos, sources get ", "; composer gets the question back on refusal/failure; failure text no longer claims nothing was charged; propose_hall_update reports the cover-in-gallery drop and the real cover/gallery counts |
| I1 | done | instructions are now identical for every org, page and day (per language) and the org/date/page travel as a developer note in the conversation (only when changed), so the tools+instructions prefix is cached on the first call too; prompt_cache_key per language; hall-update tool description trimmed and duplicated guidance removed from the instructions; expected cost of an ordinary question shown on the assistant page and in the widget (typicalQuestionMc) |
| I5 | done | propose_seating takes a `circle` per group; planSeating (src/lib/server/ai/seating-plan.ts) tries circles-as-units and groups-alone, both spreading over free tables (new `spread` option in src/lib/seating.ts, foreign, default off), keeps the better plan and reports split groups AND scattered circles; tool reply carries guests per table |
| I26 | done | vykanie + "where to do it yourself" page map in the instructions (I1 commit); out-of-credits notice and error link to settings/ai (settings.manage) or "ask an admin"; .xlsx accepted (own ZIP+XML reader on DecompressionStream, no new dependency); conversation delete asks first and leaves no dead ?t=; enable gate shows the cost of a question and links /privacy and /dpa; page-specific widget hints; multi-change proposals can untick changes (skip[] to the apply endpoint, skipped ones reported). Not done: the audit row for on/off in the settings toggle (settings/ai and credits.ts belong to billing) |

# Fix progress: identity team (one account, email verification, account deletion)

Branch: fix/identity-r2 (continues fix/identity). Migration: `0030_identity.sql`
(users.account_id, users.email_verified_at, users.deleted_at, email_verifications;
existing accounts marked verified). Additive. Design: DESIGN-identity.md.

| id | status | note |
|----|--------|------|
| D4 | done | Venue sign-in uses the Hallify account (member → staff, otherwise a linked client row is created or used; an old row with the same password is linked; one with another password gets "send a link", whose verification claims it). Venue sign-up creates account + linked row (an address with an account is sent to sign in). Invites, staff assignment, venue password reset, profile name/email changes and password changes all follow the account. /app/client lists bookings across venues with links to each venue's site. |
| D11 | done | Verification links (hashed, 3 days, address-bound) sent on apex and venue sign-up, email change, resend; dev logs the link. `REQUIRE_EMAIL_VERIFICATION` gates the console behind /verify-email (resend, change address, sign out); off unless set. Clients: booking works, venue-site reminder, venue sees "email not verified" in the bookings list and detail. Existing accounts verified by the migration; platform admins can mark verified; reminder strip for unverified operators. |
| D7 | done | Profile → Delete account: shows what will happen, needs the password and a confirmation. Last platform admin refused. Owned orgs handed to the next admin/member (subscription set to end, halls private, new owner emailed) or closed via archiveAndDeleteOrg; other memberships removed. Upcoming bookings cancelled with the venue notified; kept rows anonymised; account deleted or anonymised; sessions and links removed; signed out with a notice. |

## Checks

- npx vitest run: all pass.
- svelte-check (check.sh): 0 errors.
