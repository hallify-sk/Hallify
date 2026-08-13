# Hallify — what changed

Snapshot of the `main` working tree, 2026-08-03. **74 files changed, ~3,600 insertions.**
Everything below is verified against a running dev server: build clean, 28/28 tests,
0 TypeScript errors, every route 200, no SSR errors.

> ⚠️ **These changes are NOT committed and NOT deployed.** This zip is the working tree.
> Production (hallify.sk) still runs the old code and is still affected by the security
> issues in section 1 until this is deployed.

---

## 1. Security — critical

### Unauthenticated privilege escalation (was live in production)

Anyone on the internet could make themselves a platform admin:

```
POST /app/platform/users?/grantPlatformAdmin   (no session, no cookie)
-> HTTP 200, is_platform_admin = 1
```

**Root cause, and it was systemic:** SvelteKit does **not** run `load` before a form
action. A POST goes straight to the action; `load` only runs afterwards to re-render.
Guards were placed in `+layout.server.ts`'s `load`, which protects browsing to a page and
nothing else. Every action underneath was reachable by POSTing directly to `?/actionName`.

The same shape appeared across `/app/manage/**`, where any org **member** could promote
themselves to owner, cancel the subscription, or modify another tenant's data.

**Fix:** new `src/lib/guards.ts` (`requireUser` / `requirePlatformAdmin` / `requireOrg` /
`requireOrgStaff` / `requireOrgOwner`). **67 form actions** now re-check authorization
themselves — 14 platform, 53 manage — plus billing (owner-only).
Verified: anonymous → 401, non-admin → 403, real admin → 200.

### Cross-tenant data access

Authorization is not scoping — an authorized user of org A could still act on org B's rows
by id. Fixed:

- **`/app/manage/halls/[id]`** — 15 actions keyed on the URL id with no org check. Any org
  owner/admin could rename, block, publish, unpublish or wipe **any hall on the platform**,
  and cancel its reservations. Added an ownership assertion per action plus `org_id` in the
  SQL. Verified: another org's hall → 404; own hall → 200.
- **`/app/manage/users`** — completely unscoped. Any org owner/admin could list, re-role and
  **delete every user on the platform**. Now scoped to the caller's own org members, and
  global deletes are refused for users who also belong to another org.
- **Ticket threads** (`/app/manage/messages/[id]`) — readable and mutable across tenants.
- **Channel messages** — an admin of any org could soft-delete any other org's message.
- **`/api/holds`** — one throwaway client account could place unlimited 15-minute holds on
  **any other venue's** halls, blocking that venue's real customers (and its own staff, who
  had no override). Now restricted to the hall's own bubble.

### Booking ownership

Five actions on the reservation page selected `user_id` but never compared it — so any org
member could cancel or re-layout a colleague's or a client's booking. Added a shared
`canActOnReservation` check, plus the same gate on the sibling layout route.

### Other

- **Session cookie** was `secure: false` (hardcoded, with a "set true in production"
  comment). Now `secure: !dev`.
- **Stored `javascript:` URI** in ticket attachments, rendered into an `href` — restricted
  to same-origin `/uploads/` paths.
- **Security headers** — the app sent none. Added CSP (via SvelteKit's `kit.csp`, so
  SvelteKit's own inline bootstrap is hashed and hydration still works), X-Frame-Options,
  X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and HSTS over HTTPS.
- **Rate limiting** — there was none anywhere. D1-backed fixed-window limiter
  (`src/lib/rateLimit.ts`) on login, register, forgot-password, reset-token and upload.
  Login 20/15min per IP **and** 8/15min per account; register 5/h; forgot-password 8/h per
  IP and 4/h per address; upload 60/h per user. Fails open, so it can't take the site down.

---

## 2. Broken user journeys

- **Password reset was completely broken.** The email linked to `/reset-password/<token>`
  while the route is `/app/reset-password/<token>` — every recipient hit a 404. Also the
  post-reset redirect dropped its `?reset=success` flag, so the confirmation notice (which
  already existed) never appeared.
- **Clients had no password recovery at all.** The reset flow matches `org_id IS NULL`
  (org/platform users) and the bubble redirects all `/app/*` away from clients — a
  locked-out customer had nowhere to go. Added bubble-scoped `/forgot-password` and
  `/reset-password/[token]`, linked from the bubble login. Tokens are scoped to that
  venue's org, since one address can be a client at several venues.
- **`auto_approve` was ignored on bubble bookings** — client bookings always landed
  `pending` while staff paths honoured the flag.
- **Date-range blocks ignored their day picker.** "Block weekends in June" closed *all* of
  June. The form was already submitting the days; the server ignored them.
- **`min_cancel_days` was unenforced on the client cancel path** — the only cancel route a
  customer can reach, so the venue's notice period had no effect on the people it exists for.
- **Opening hours were never enforced.** A hall open Fri–Sun accepted a Monday booking. Now
  the per-day open/closed flag is enforced (times are not — see note below).
- **Opening hours never displayed either.** The hall editor writes keys `'mon'…'sun'`; the
  public hall page read them by numeric index. They never matched, so published opening
  hours rendered as nothing. Fixed on both sides.
- **Org-invite emails dead-ended** logged-out invitees — the CTA used the wrong route *and*
  the wrong identifier (invite row id instead of token).
- **Reactivating a re-booked reservation** returned a 500 from the unique index; now a clean
  409.
- **Unread channel badges never cleared** — computed as "messages after my own last
  message", so only replying reset them. Added real read state (`channel_reads`,
  migration 0003).
- **`reservation.new` webhook was never dispatched** despite being offered in the settings
  UI, and `status_changed` never fired for staff-side changes.
- **500s**: `/app/messages` for a user with no org (exactly the state every member is in
  after an org closes); the billing page whenever Stripe was unreachable; deleting a user
  who still owned reservations.
- Member seat cap is now checked on invite **accept**, not just creation.
- Input validation: negative guest counts, `maxPeople` of 0, unvalidated times.
- Hall slugs are now unique **per org** rather than globally (one org could squat another's
  bubble namespace).
- The onboarding checklist was hardcoded English and now uses the SK/EN dictionary.

---

## 3. Editor fixes (from the venue feedback doc)

- **Chair spacing did nothing on round tables.** The control rendered but the round branch
  placed chairs purely by angle and never used the gap. Spacing now pushes the ring outward
  until the arc between neighbours matches.
- **Grid snap had no "off".** The dropdown offered only `0.25 / 0.5 / 1 / 2 m`. Added Off.
- **The summary panel only counted the active floor.** Now shows whole-plan totals
  alongside, when there is more than one floor.
- Round vs rectangle seat counts differ because round uses a single `chairs` value while
  rectangles sum four per-side counts — that is the mechanism behind the "round gives max,
  rectangle gives fewer" report. Left as-is (design, not a bug).

---

## 4. Infrastructure

- **Migrations are now tracked.** Schema moved to `migrations/`, applied by Wrangler's
  native D1 migrations and recorded per-database in `d1_migrations`. Previously changes were
  hand-applied per environment with no record, and the "owed migration" notes in DESIGN.md
  had gone stale. `0001_baseline` (the old `schema.sql`, fully idempotent), `0002_rate_limits`,
  `0003_channel_reads`. See `migrations/README.md`.
- **Stripe secrets were baked into the build.** `stripe.ts` was the only file importing
  `$env/static/private`, which inlines values at build time — the deployed key was whatever
  sat in the builder's `.env`, and the `STRIPE_*` Worker secrets were dead config. A deploy
  from a clean checkout would have shipped a placeholder key. Now reads
  `$env/dynamic/private` at runtime like every other module.
- **Legal pages** — `/terms`, `/privacy`, `/dpa`, bilingual SK/EN, linked from the footer.
  Drafted from what the code actually does. **Drafts, not legal advice** — the `OPERATOR`
  placeholders in `src/lib/legal.ts` need the real entity details and a Slovak lawyer
  should review them.
- **RSVP disabled for v1** behind `RSVP_ENABLED` in `src/lib/features.ts`, at the route
  level (loads *and* actions — a 404'd load does not stop a POST). One flag turns it back on.
- Test suite green (28/28, was 21/27 with stale assertions) and **73 → 0** TypeScript errors.
  Two of those were real bugs: `hall_blocks.days_of_week` is a JSON string but the hall page
  called `.map()` on it (a crash on any hall with a weekly block), and dead Postgres-era
  `instanceof Date` checks.

---

## Notes for whoever picks this up

1. **Nothing here is committed or deployed.** Review, commit, then deploy — production is
   still exposed until then.
2. **Run the migrations** after deploying: `npm run migrate:dev`, then `migrate:prod`.
   0002 and 0003 are pending on both.
3. **Check `is_platform_admin` on prod** for accounts you don't recognise, given the
   escalation was reachable by anyone.
4. **Confirm the prod `STRIPE_*` Worker secrets hold the intended live keys** — they only
   became load-bearing with this change.
5. **Opening hours**: only the per-day open/closed flag is enforced, not the from/to times,
   because the field was also described as "úradné hodiny" (when you can be reached) rather
   than when the hall is open. If it should mean opening times, that's a one-block change in
   `src/lib/availability.ts`.
6. Two reported issues could not be reproduced from code and need a human: the broken image
   preview, and Table Types drag cancelling when the mouse is released outside the popup.
7. `RELEASE-CHECKLIST.md` in the repo root tracks everything, including what is still open.
