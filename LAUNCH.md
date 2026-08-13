# Production launch runbook

Everything the code can do is done. What remains needs credentials, DNS, a lawyer, or a
deploy — none of which can be done from the repo.

Work through the blockers in order. Nothing below is optional for a paid public launch.

---

## 🔴 Blockers

### 1. Commit and push
89 files are uncommitted on `main`, including every security fix. Nothing is in git and
nothing is backed up. Push to `hallify-sk/Hallify`.

### 2. Deploy
Production is still serving code from **2026-06-19** and is still affected by the
unauthenticated privilege escalation (anyone could POST
`/app/platform/users?/grantPlatformAdmin` and become a platform admin).

```bash
npm run deploy:dev      # verify on dev.hallify.sk first
npm run deploy:prod
```

### 3. Run migrations — dev first, then prod
```bash
npm run migrate:dev
npm run migrate:prod
```
`0002_rate_limits` and `0003_channel_reads` are pending on both. The app degrades
gracefully without them (rate limiting fails open) but is not doing its job.

### 4. Audit prod for exploitation
The escalation was reachable by anyone for as long as prod has been live.
```bash
npx wrangler d1 execute hallify --remote --command \
  "SELECT id, email, created_at FROM users WHERE is_platform_admin = 1"
```
Anyone unexpected → revoke, and review Workers logs for POSTs to `/app/platform/*`.

### 5. Fill in the legal entity + get the documents reviewed
`OPERATOR` in `src/lib/legal.ts` still holds `[[ … ]]` placeholders for legal name,
address, IČO, DIČ, register entry and contact emails. They appear verbatim in all three
documents, and an amber "draft" banner shows on `/terms`, `/privacy` and `/dpa` until
they're filled. A Slovak lawyer must review before you charge anyone.

### 6. Confirm the Stripe live keys
The `STRIPE_*` Worker secrets were **dead config** until this change — `stripe.ts` read
them from the build, not from secrets. Whatever prod has been charging against came from
the `.env` of whichever machine last ran `build:prod`. Verify the secrets now hold the
intended live keys **before** deploying, or billing changes behaviour silently.

Also: register the webhook endpoint at `https://hallify.sk/api/stripe/webhook` for the
events `api/stripe/webhook/+server.ts` handles, and run one real
subscribe → upgrade → downgrade → cancel in live mode.

### 7. Add an SPF record
`hallify.sk` has DKIM (`brevo1`/`brevo2._domainkey`) and DMARC (`p=none`) but **no SPF
record at all**. Without it, Brevo mail is far more likely to be filtered — and this app
is entirely email-driven (invites, password resets, status changes).

```
hallify.sk.  TXT  "v=spf1 include:spf.brevo.com ~all"
```
Once mail is landing reliably, tighten DMARC from `p=none` to `p=quarantine`.

---

## 🟡 Should do before taking real customers

- **Set `account_id` in `wrangler.toml`.** Uncomment and fill it — otherwise any login with
  access to more than one Cloudflare account fails every non-interactive command.
  (Wrangler auth expired again during this session; you may need `wrangler login`.)
- **Delete the `SESSION_SECRET` secret.** It is not used anywhere — session ids are random
  UUIDs stored in D1 and never signed. Leaving it set implies protection that does not
  exist: `wrangler secret delete SESSION_SECRET`.
- **Set `CRON_SECRET`** if you want to run housekeeping externally. Without it
  `POST /api/cron/cleanup` returns 404 (disabled, not open). Cleanup also runs
  opportunistically off request traffic, so this is optional.
- **Give dev its Stripe secrets** — dev currently has only `SESSION_SECRET`,
  `BREVO_API_KEY`, `CF_ZONE_ID`, `CF_API_TOKEN`, so billing cannot be exercised there.
- **Point an uptime monitor at `/api/health`** — returns 200 `{status:"ok",db:true}`, or
  503 if the Worker cannot reach D1. Deliberately leaks nothing.
- **Confirm D1 point-in-time recovery** covers `hallify`, and rehearse a restore once.
- **Check prod for test data** — `default` and `hallify` orgs may be leftovers.
- **Verify the Cloudflare for SaaS fallback origin** so customer custom domains resolve.

---

## 🟢 Fixed this session, no action needed

Custom error page (was the raw SvelteKit screen) · `robots.txt` + per-surface
`sitemap.xml` (bubble sitemaps list only that venue's public halls) · favicon (the
referenced `favicon.png` never existed and 404'd on every page) · self-hosted Poppins ·
`/api/health` · housekeeping for expired sessions, tokens, invites and rate-limit rows
(nothing reaped them before) · Workers observability enabled (production had **no** logs
retained) · `.env.example` and the DESIGN.md stack table rewritten for D1 · Postgres-era
`docker-compose.yml` removed.

### The font bug, specifically
Reported as "works on the Mac, not on Windows". The CSS was correct — all four usages are
italic 900, matching the one face being loaded. The cause was that the face came from
`fonts.googleapis.com`, which privacy/adblock extensions block by default (very common on
Windows), while the Mac had Poppins installed locally and so never noticed. Poppins is now
self-hosted from `/static/fonts` (latin + latin-ext, 14 KB total — latin-ext carries the
Slovak diacritics), so there is no external request to block. It also removes a GDPR
inconsistency: Google Fonts sends every visitor's IP to Google, which contradicts the
privacy policy's "no third-party tracking", and my new CSP would have blocked it anyway.

---

## Still open, non-blocking

Accessibility is unmeasured — `svelte.config.js` suppresses all `a11y_*` warnings; turn
them back on once to see the real number. `@sveltejs/adapter-cloudflare@4` declares peer
`wrangler@^3` against the installed `wrangler@4`, so installs need `--legacy-peer-deps`
(adapter v7 fixes it). Image uploads trust the client-supplied MIME type without sniffing
magic bytes. Help tab phase 2 and the standalone chair tool were scoped but never built.

Two reported issues could not be reproduced from code and need a human at a browser:
the **broken image preview**, and **Table Types drag cancelling** when the mouse is
released outside the popup. The printable manifest's SVG map and print pagination also
still want a visual check.
