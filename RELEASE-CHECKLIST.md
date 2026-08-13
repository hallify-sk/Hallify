# Hallify — Release Checklist

Compiled 2026-08-01 from a sweep of the codebase, `DESIGN.md`, the local D1, and the
live Cloudflare state. Each item says how it was established:
**[verified]** reproduced directly · **[doc]** claimed open in `DESIGN.md` · **[unverified]** still
needs a human or an external console.

The app itself is in good shape: every authenticated route (24 tested), the public apex, and
the org bubble all render 200 with zero SSR errors. What's left is mostly the last mile —
security flags, one broken flow, secret plumbing, and legal pages.

**Cleared 2026-08-01 after Cloudflare account access was fixed** (account
`46d0e242…`, all bindings resolve):
- *Owed dev/prod migrations* — **already applied.** Both remote DBs have
  `rsvp_entries.extra_guests`, `rsvp_entries.responses`, and the `reservation_invites` table.
  `DESIGN.md`'s "still owed" notes are stale; correct them.
- *Schema drift* — **none.** All 32 tables match across local / dev / prod; dev and prod are
  identical. The only difference from a fresh `schema.sql` build is column *ordering*
  (ALTER-appended vs inline), which is harmless here — no `INSERT` in the codebase omits its
  column list, and rows are read by name.
- *Prod is current* — last deploy 2026-06-19 15:25 UTC, ~30s before the final commit `36c4e88`.
- *Prod secrets* — all 9 present. **Dev is missing all 4 Stripe secrets** (see the build-time
  inlining blocker below, which changes what that means).

---

## Blockers — must fix before taking real customers

- [x] ~~**Session cookie is not `secure`.**~~ **Fixed 2026-08-01.** `src/lib/auth.ts` now sets
      `secure: !dev` (`dev` from `$app/environment`), so the cookie is HTTPS-only everywhere
      except local dev. Verified login still works on localhost.

- [x] ~~**Password reset is completely broken.**~~ **Fixed 2026-08-01.** The emailed link now
      points at `/app/reset-password/<token>`, matching the route on disk. Verified end to end:
      request reset → token resolves (200, real form) → set a new password → login with the new
      password succeeds, the old one fails, token marked `used`.
      Fixed in the same flow: the post-reset redirect went to `/login?reset=success`, which on
      the apex bounces to `/app/login` and **drops the query param** — so the success notice
      already built into `app/login/+page.svelte:22` never appeared. Now redirects to
      `/app/login?reset=success`.

- [x] ~~**Stripe secrets are baked into the build.**~~ **Fixed 2026-08-01.** `stripe.ts` now reads
      from `$env/dynamic/private` like every other module. The client and webhook secret are
      resolved lazily (`getStripe()` / `getWebhookSecret()`) because dynamic env is empty at
      module-init time, and both throw if unset so a misconfigured deploy fails loudly. The
      webhook route resolves them *outside* its `try` so a config error returns 500 rather than
      masquerading as an invalid signature. Verified: a rebuilt bundle contains **0** occurrences
      of the local placeholder key (was 2, incl. the sourcemap).
      **Follow-ups this unblocks:** the prod `STRIPE_*` Worker secrets are now live config —
      confirm they hold the intended live keys, and set the 4 missing Stripe secrets on dev.
      `build:dev`/`build:prod` no longer need to inject `APP_URL` on the command line.

<details>
<summary>Original finding, kept for context</summary>

`src/lib/stripe.ts:2` was the **only** file in the codebase importing from
`$env/static/private` — every other file (`email.ts`, `orgUrl.ts`, `cloudflare-saas.ts`,
`hooks.server.ts`, four route files) uses `$env/dynamic/private`. Static env is inlined at
**build time**: the local placeholder appeared literally in the output as
`const STRIPE_SECRET_KEY = "sk_test_placeholder";` inside `.svelte-kit/cloudflare/_worker.js`
*and* its sourcemap. Consequences were:

- The 5 `STRIPE_*` Worker secrets set on prod were **dead config** — `stripe.ts` never read
  them. The live key in prod was whatever sat in the deploying machine's `.env`.
- A deploy from a clean checkout would have shipped **`sk_test_placeholder` to production**
  and silently broken billing.
- Rotating a Stripe key needed a rebuild + redeploy, not `wrangler secret put`.
- Live keys landed in a build artifact and its sourcemap.

</details>

- [x] ~~**No migration tracking.**~~ **Fixed 2026-08-01.** Schema now lives in `migrations/`,
      applied and tracked by Wrangler's native D1 migrations (`d1_migrations` table per
      database). `migrations_dir` is set on both the prod and `env.dev` bindings.
      `src/lib/db/schema.sql` → `migrations/0001_baseline.sql`; the superseded
      `migration-009/010/011.sql` and the `migrate.ts` comment stub are gone; instructions are in
      `migrations/README.md`. `migrate:{local,dev,prod}` now apply *pending* migrations, plus new
      `migrate:status:*`, `migrate:new` and `seed:local` scripts.
      Verified locally: baseline applied with **all data preserved** (4 users / 3 orgs), recorded
      in `d1_migrations`, re-run reports "No migrations to apply!"; a scratch `ALTER TABLE`
      migration applied and tracked correctly, then was rolled back.
      - [ ] **Baseline dev and prod** — needs a write to those databases, so it's left for you:
            `npm run migrate:dev` then `npm run migrate:prod`. Both are no-ops that only record
            the baseline (every statement is `IF NOT EXISTS`), but confirm before running.

- [ ] **Fill in the operator details in `src/lib/legal.ts`.** The `OPERATOR` constant at the top
      holds `[[ … ]]` placeholders for legal entity name, registered address, IČO, DIČ, commercial
      register entry, and contact/privacy emails. They appear verbatim in both documents in both
      languages, and an amber "draft" banner shows on the pages until they're filled
      (`LEGAL_IS_DRAFT` keys off the placeholder). **[verified]**

- [ ] **Have a Slovak lawyer review the Terms and Privacy Policy.** They're drafted from what the
      code actually does, not boilerplate — but they are not legal advice and must be reviewed
      before launch. Pay particular attention to the Article 9 point below. **[unverified]**

- [x] ~~**No Terms of Service or Privacy Policy.**~~ **Drafted 2026-08-01.** `/terms` and
      `/privacy` now exist, bilingual SK/EN via the existing locale resolution, rendered
      chromeless like the landing page, with canonical + hreflang tags and a new "Legal" footer
      column on the landing page. Content lives as structured data in `src/lib/legal.ts` and is
      rendered by `LegalDocument.svelte`, so both locales stay structurally identical.
      Written from what the code actually does — the real plan prices, the real
      upgrade/downgrade/cancel behaviour from `stripe.ts`, the real retention windows (30-day
      sessions, 1-hour reset links, 14-day invites, the `closed_organizations` accounting
      archive), the two cookies, and the three actual sub-processors.
      **Two substantive points surfaced while writing them; both are now handled:**
      - ~~RSVP allergy fields are Article 9 health data.~~ **Moot for v1** — RSVP is not shipping.
        All RSVP and special-category wording has been removed from the live documents, which now
        describe only what v1 actually processes. What remains is the inverse: an explicit clause
        telling controllers **not** to put health data into the free-text per-guest note without
        their own lawful basis. `legal.ts` carries a header note: if RSVP ships, the allergies
        field becomes Article 9 data and needs explicit consent captured at the form plus matching
        wording in the Privacy Policy and the DPA's data categories.
      - ~~You owe each paying venue a Data Processing Agreement.~~ **Drafted 2026-08-01** at
        `/dpa`, bilingual, linked from the footer and from the other two documents. Covers the
        Article 28 requirements: roles, subject matter, data categories, controller instructions,
        confidentiality, the Article 32 security measures actually implemented (including the new
        rate limiting), the three sub-processors with a change-notice and objection right,
        assistance with data-subject requests, breach notification, deletion/return, audit, and
        international transfers.

---

## High — before charging real money

- [x] ~~**No rate limiting anywhere in the app.**~~ **Fixed 2026-08-01.** D1-backed fixed-window
      limiter in `src/lib/rateLimit.ts` (table added by `migrations/0002_rate_limits.sql`), applied
      to apex login, bubble login, both register actions, forgot-password, reset-token submission
      and image upload. Chosen over a Cloudflare WAF rule or the Workers rate-limit binding because
      it behaves identically on local/dev/prod, needs no dashboard config, and is testable — it
      fails open if the counter errors, so it can't take the site down.
      Limits: login 20/15min per IP **and** 8/15min per account; register 5/h per IP;
      forgot-password 8/h per IP and 4/h per address; reset-token 15/15min per IP; upload 60/h
      per user. The bubble login's per-account bucket is scoped by org, since one address can be
      a client in several bubbles and they must not lock each other out.
      Verified live: the 9th wrong-password attempt on one account is blocked while a different
      account signs in normally, and the 5th password-reset request for one address is blocked.

- [x] ~~**Test suite is red: 6 of 27 failing.**~~ **Fixed 2026-08-01.** Assertions updated to the
      current behaviour (inline `price_data` priced from `plans.ts`, `/app/billing/success?plan=`,
      `/app/billing` portal return, `Plan "x" is not a paid plan`), plus two new cases for the free
      plan and for the plan carried into the success URL. **28 passed, 0 failed.**

- [x] ~~**73 TypeScript errors.**~~ **Fixed 2026-08-01 — now 0.** Most were structural rather than
      cosmetic, and two were real bugs:
      - `hall_blocks.days_of_week` is a JSON *string*, but the hall page called `.map()` on it —
        a `TypeError` on any hall with a weekly block. Now parsed with the file's existing
        `parseArr`. Verified with a real weekly block: renders "Po, St, Pi".
      - `event_date instanceof Date` in three places was dead Postgres-era code (D1 returns TEXT).
      - 38 "used before declaration" errors in `manage/halls/[id]` came from a dirty-tracking
        `$derived` block sitting above the state it reads — lazy at runtime, so it worked, but it
        hid the file's real errors. Moved below its dependencies.
      - SQLite INTEGER booleans bound to `checked={...}`; nullable message bodies; `dbFirst`
        aggregates typed nullable (now defaulted at the load so dashboards render zeros);
        inconsistent `fail()` shapes collapsing `ActionData` so `form.email` was unreachable.
      145 warnings remain (mostly suppressed a11y hints — see the a11y item below).

- [ ] **Verify Stripe production wiring** — *after* the build-time-inlining blocker is fixed,
      since that determines which key prod is actually using. Then: webhook endpoint registered at
      `https://hallify.sk/api/stripe/webhook` subscribed to the events
      `src/routes/api/stripe/webhook/+server.ts` handles, and one real end-to-end
      subscribe → upgrade → downgrade → cancel against live mode. `STRIPE_PRICE_STARTER` /
      `STRIPE_PRICE_PROFESSIONAL` are **no longer used at all** (pricing is inline from
      `plans.ts`) yet are set as prod secrets *and* listed in `.env.example` and `wrangler.toml`'s
      header — delete all three copies. **[unverified]**

- [ ] **Give dev its Stripe secrets** once `stripe.ts` reads them at runtime — dev currently has
      only `SESSION_SECRET`, `BREVO_API_KEY`, `CF_API_TOKEN`, `CF_ZONE_ID`, so billing can't be
      exercised on `dev.hallify.sk` without them. **[verified]**

- [ ] **Verify email deliverability.** SPF/DKIM/DMARC for `hallify.sk` and a verified
      `noreply@hallify.sk` sender in Brevo. If `BREVO_API_KEY` is unset the app silently skips
      sends and logs them `failed` — so a misconfiguration looks like nothing happening. **[unverified]**

---

## Medium — polish and ops

- [ ] **No custom error page.** No `src/routes/+error.svelte`, so every 404 and 500 shows
      SvelteKit's bare default. **[verified]**

- [ ] **SEO gaps.** No `robots.txt`, no `sitemap.xml`, no `favicon.ico` (only `Hallify.svg`).
      The landing page already emits canonical + hreflang tags, so this is half-finished. **[verified]**

- [ ] **Stale pre-D1 artifacts mislead new developers.** `docker-compose.yml` (Postgres 16) and
      `.env.example` (`DATABASE_URL=postgres://…`) are leftovers from before the D1 migration, and
      `DESIGN.md`'s Stack table still lists "PostgreSQL 16 (Docker)" and `adapter-auto`. Delete the
      first two, correct the table. **[verified]**

- [ ] **Dependency conflict.** `@sveltejs/adapter-cloudflare@4.9.0` declares peer `wrangler@^3`
      against the installed `wrangler@4.100.0`; the project only installs with
      `--legacy-peer-deps`. Adapter v7 declares `wrangler@^4` — upgrade and drop the flag. **[verified]**

- [ ] **Expired rows are never reaped.** Holds are cleaned inline
      (`availability.ts:87`), but `sessions`, `password_resets`, `organization_invites` and
      `reservation_invites` accumulate forever. No `[triggers]`/cron in `wrangler.toml`. **[verified]**

- [ ] **Accessibility debt is unmeasured.** `svelte.config.js:12` suppresses *all* `a11y_*`
      warnings at build time. Turn them back on once to see the real number. **[verified]**

- [ ] **Uploads trust the client-supplied MIME type.** `api/upload/image/+server.ts` validates
      `file.type` and size but never sniffs magic bytes, and stores that same claimed type on the
      R2 object. Low severity (a mislabelled file is served as an image and won't execute), worth
      tightening. **[verified]**

---

## Unfinished features (`DESIGN.md` says so explicitly)

- [ ] **Help tab phase 2** — guided floorplan wizard (bounds → walls → zones → done) and global
      completion toasts. Phase 1 shipped. **[doc]**

- [ ] **Standalone chair tool** in the editor — needs a `seats[]` entity on `FloorData`, a toolbar
      tool, render/eraser/assignment support in both `MapEditor` and `FloorplanViewer`, plus
      migration handling. Scoped, not built. **[doc]**

- [x] ~~**Decide RSVP's fate.**~~ **Decided 2026-08-01: not shipping in v1**, may return later —
      and now actually switched off, not just hidden. Single flag `RSVP_ENABLED` in
      `src/lib/features.ts` gates every surface at the **route** level:
      `/rsvp/[code]`, `/app/reservation/[id]/rsvp-editor`, and
      `/app/manage/rsvp-templates` (+ `/[id]`) all `error(404)`. The two previously hardcoded
      `SHOW_RSVP = false` constants (`FloorplanViewer.svelte`, the staff reservation page) now
      read from the same flag, so there is one switch rather than four places to remember.
      Guards are on the **actions as well as the loads** — a 404'd `load` does not stop a POST to
      `?/action`, so form submissions would otherwise still have executed. Verified: all four
      routes return 404 on GET, and all four form actions return 404 on POST.
      Code is left in the tree, so flipping the flag to `true` restores everything. Before doing
      that, see the Article 9 note in `features.ts` and `legal.ts` — the allergies field is health
      data and needs consent plus matching legal wording.

<details>
<summary>Original finding, kept for context</summary>

`SHOW_RSVP = false` is hardcoded in `src/routes/app/reservation/[id]/+page.svelte:21` and
`src/lib/FloorplanViewer.svelte:29`, hiding the feature — yet the plus-ones and RSVP→seating work
was built afterwards, the `/rsvp/[code]` public route is live, and the staff `rsvp-editor` route
still exists unlinked. Either finish and unhide it or strip it; shipping it half-hidden is the
worst of both.

</details>

- [ ] **Visual QA of the printable manifest** — `DESIGN.md` notes the SVG map render and print
      pagination "still needs the user's eyes". Only a human can sign this off. **[doc]**

---

## Pre-launch verification pass

- [ ] Full manual run-through on dev with a real venue: create org → hall → floor plan → publish →
      client books via the bubble → approve → seating editor → manifest → print.
- [ ] Subscribe/upgrade/downgrade/cancel against Stripe live mode, including the webhook path.
- [ ] Custom domain end-to-end: add domain → Cloudflare for SaaS hostname provisions → bubble
      serves → downgrade stops serving → re-upgrade resumes.
- [ ] Mobile pass over landing, booking form, and the seating editor.
- [ ] Confirm SK is correct and complete in both locales (the app is Slovak-first; EN parity is
      claimed but unverified).
- [ ] Backups: confirm D1 point-in-time recovery covers `hallify`, and that a restore has been
      rehearsed at least once.
