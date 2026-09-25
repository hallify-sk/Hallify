# Production launch runbook

Status as of **2026-09-24**, re-verified against the live site, DNS and the Cloudflare
account rather than carried over from earlier notes. The code side of a first sale is done
on branch `fix/first-sale-blockers`. Everything left needs a deploy, a dashboard, DNS,
credentials or a lawyer.

Work through the blockers in order. Nothing in 🔴 is optional for a paid launch.

---

## 🔴 Blockers — before the first sale

### 1. Deploy `fix/first-sale-blockers` — dev first, migration before code
Production cannot complete a sale today. The Stripe webhook verified signatures with the
synchronous `constructEvent`, which cannot work on Workers, so **every genuine event was
rejected with 400** and a paid checkout never upgraded the org. Reproduced in `workerd`:
a correctly signed event got 400 before the fix and 200 after it.

```bash
npm run migrate:dev      # applies 0004_legal_acceptances
npm run deploy:dev       # verify on dev.hallify.sk
npm run migrate:prod
npm run deploy:prod
```
Apply 0004 before the code goes out. The acceptance write is best-effort, so without the
table signup and checkout still work, but no evidence of acceptance is recorded.

### 2. Fill in the legal entity + have the documents reviewed
`OPERATOR` in `src/lib/legal.ts` still holds `[[ … ]]` placeholders (legal name, address,
IČO, DIČ, register entry, contact emails). They are **live** on `/terms`, `/privacy` and
`/dpa`, with the amber "Pracovná verzia" banner. A Slovak lawyer must review before you
charge anyone. Also ask them about:
- **Acceptance mechanics.** Signup has one required checkbox (Terms incl. the DPA, plus
  acknowledging the Privacy Policy). A first paid checkout has a second one, accepted on
  behalf of the organization. Each is stored in `legal_acceptances` with `LEGAL_UPDATED`
  as the version — bump that constant whenever the text changes.
- **Consumers.** The Terms say a consumer's 14-day withdrawal right lapses once the service
  starts *with their express consent*. That consent is not collected anywhere. Either
  confirm you sell only to businesses, or add a consent checkbox at checkout.

### 3. Make hallify.sk receive email
There is **no MX record**, so `contact@`, `privacy@` (the GDPR contact in the legal
documents) and `sales@` (the Enterprise "Contact sales" button on the landing and billing
pages) all bounce. Cloudflare Email Routing, forwarding to a real inbox, is the quickest fix.
SPF and DKIM are already in place. Once mail lands reliably, tighten DMARC from `p=none` to
`p=quarantine`.

### 4. Decide VAT, then configure it
Checkout now collects the billing address and an optional tax ID, so invoices carry the
customer's company details. It still charges **no VAT**, and prices show without
"s DPH / bez DPH". With your accountant, settle whether you are VAT-registered. Then either
enable Stripe Tax (`automatic_tax`, tax registrations in the dashboard, `tax_behavior` on
prices) or state the exemption. Adjust the pricing copy to match, and set your business
details (name, address, IČO, DIČ / IČ DPH) under Stripe → Settings → Public details so the
invoices work as Slovak tax documents.

### 5. Stripe dashboard (live mode)
- Account activated for live payments. Confirm the prod `STRIPE_SECRET_KEY` is `sk_live_…`.
- Webhook endpoint `https://hallify.sk/api/stripe/webhook` for exactly these events:
  `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`.
  `STRIPE_WEBHOOK_SECRET` must be *that endpoint's* signing secret. If the endpoint already
  exists, its deliveries have been failing — that was blocker 1.
- Customer Portal settings saved in live mode, or "Manage billing" errors.
- Give dev its Stripe **test** secrets (`wrangler secret put STRIPE_SECRET_KEY --env dev`,
  same for `STRIPE_WEBHOOK_SECRET`) plus a test-mode endpoint for
  `https://dev.hallify.sk/api/stripe/webhook`. Then rehearse on dev:
  subscribe → upgrade → downgrade → cancel.
- Then make one real purchase on prod and refund it.

### 6. Audit prod for the old privilege escalation
Until the 2026-08-13 fix, anyone could POST `/app/platform/users?/grantPlatformAdmin`
and become a platform admin.
```bash
npx wrangler d1 execute hallify --remote --command \
  "SELECT id, email, created_at FROM users WHERE is_platform_admin = 1"
```
Anyone unexpected → revoke, and review the Workers logs for POSTs to `/app/platform/*`.

---

## 🟡 Cleanup — not blocking

- **Delete unused Worker secrets.** On prod: `STRIPE_PRICE_STARTER`,
  `STRIPE_PRICE_PROFESSIONAL`, and the six `R2_*` secrets (uploads use the R2 binding).
  Also revoke the R2 API token behind the `R2_*` ones under Cloudflare → R2 → Manage API
  tokens. `STRIPE_PUBLISHABLE_KEY` isn't read either, but it's public, so it's harmless.
  On dev: `SESSION_SECRET`.
- **Check prod for test data.** The `default` and `hallify` orgs may be leftovers.
- **Point an uptime monitor at `/api/health`.** It returns 200 `{status:"ok",db:true}`, or
  503 when D1 is unreachable.
- **Confirm D1 point-in-time recovery** covers `hallify`, and rehearse a restore once.
- **Verify the Cloudflare for SaaS fallback origin** so customer custom domains resolve.
- **Dependabot PR #12** has been open since June.

---

## ✅ Verified done (2026-09-24)

- PR #13 (security + launch hardening) is **deployed** to prod and dev. The security
  headers, `/api/health` and the legal pages are all live.
- Migrations **0001–0003 are applied** on prod and dev. The tables are present.
- **SPF exists:** `v=spf1 include:spf.brevo.com ~all`. DKIM `brevo1`/`brevo2` resolve.
  DMARC is `p=none`.
- `SESSION_SECRET` is deleted from prod. `account_id` is set in `wrangler.toml`.

## What `fix/first-sale-blockers` changes

- **Webhook:** verifies with `constructEventAsync`. New tests run against Stripe's
  *worker* build and fail if the sync call ever comes back.
- **Webhook:** subscriptions that aren't paid (`incomplete_expired`, `unpaid`, `paused`)
  now drop the org to Free. They used to fall through to `active` and keep the paid plan.
- **Webhook:** reads the renewal date from the subscription item. API basil moved it there,
  so it was being stored as null.
- **Upgrade preview:** uses `invoices.createPreview`. Basil removed `retrieveUpcoming` and
  moved the proration flag onto the line's `parent`, so every preview showed €0.00 before
  a real charge.
- **Terms/DPA acceptance:** a required checkbox at signup and at a first paid checkout,
  recorded in `legal_acceptances` (migration 0004). The billing page now also displays
  action errors, which it previously dropped.
- **Checkout:** collects the billing address and an optional tax ID.
- **RSVP:** removed from what's sold — plan features (also the Stripe product description),
  pricing, hero and "how it works" copy. RSVP is off for v1.
- Tests: 28 → 52.

---

## Still open, non-blocking

Accessibility is unmeasured — `svelte.config.js` suppresses all `a11y_*` warnings; turn
them back on once to see the real number. `@sveltejs/adapter-cloudflare@4` declares peer
`wrangler@^3` against the installed `wrangler@4`, so installs need `--legacy-peer-deps`
(adapter v7 fixes it). Image uploads trust the client-supplied MIME type without sniffing
magic bytes. Help tab phase 2 and the standalone chair tool were scoped but never built.

Under local `wrangler dev` the register/login rate limiter throws, because requests carry
no `CF-Connecting-IP` header (Cloudflare's edge always sets it). When testing those forms
locally, send the header yourself.

Two reported issues could not be reproduced from code and need a human at a browser:
the **broken image preview**, and **Table Types drag cancelling** when the mouse is
released outside the popup. The printable manifest's SVG map and print pagination also
still want a visual check.

### The font bug (fixed 2026-08)
Reported as "works on the Mac, not on Windows". The CSS was correct — all four usages are
italic 900, matching the one face being loaded. The cause was that the face came from
`fonts.googleapis.com`, which privacy/adblock extensions block by default (very common on
Windows), while the Mac had Poppins installed locally and so never noticed. Poppins is now
self-hosted from `/static/fonts` (latin + latin-ext, 14 KB total — latin-ext carries the
Slovak diacritics), so there is no external request to block. It also removes a GDPR
inconsistency: Google Fonts sends every visitor's IP to Google, which contradicts the
privacy policy's "no third-party tracking", and the CSP would have blocked it anyway.
