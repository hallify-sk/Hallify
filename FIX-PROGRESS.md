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
