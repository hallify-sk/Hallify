# Production launch runbook

Status as of **2026-09-25**. The fixes on `fix/first-sale-blockers` are deployed to dev and
production, and the live Stripe webhook is set up and verified with a real event.
Everything left needs a dashboard, DNS, credentials or a lawyer.

Work through the blockers in order. Nothing in 🔴 is optional for a paid launch.

---

## 🔴 Blockers — before the first sale

### 1. Fill in the legal entity + have the documents reviewed
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
- **Who the operator is.** The Stripe account is registered as an **individual**, while the
  placeholders assume an `s.r.o.`. The documents, Stripe and your invoices must all name
  the same legal entity.

### 2. Make hallify.sk receive email
There is **no MX record**, so `contact@`, `privacy@` (the GDPR contact in the legal
documents) and `sales@` (the Enterprise "Contact sales" button on the landing and billing
pages) all bounce. Cloudflare Email Routing, forwarding to a real inbox, is the quickest fix.
SPF and DKIM are already in place. Once mail lands reliably, tighten DMARC from `p=none` to
`p=quarantine`.

### 3. Decide VAT, then configure it
Checkout now collects the billing address and an optional tax ID, so invoices carry the
customer's company details. It still charges **no VAT**, and prices show without
"s DPH / bez DPH". With your accountant, settle whether you are VAT-registered. Then either
enable Stripe Tax (`automatic_tax`, tax registrations in the dashboard, `tax_behavior` on
prices) or state the exemption. Adjust the pricing copy to match, and set your business
details (name, address, IČO, DIČ / IČ DPH) under Stripe → Settings → Public details so the
invoices work as Slovak tax documents.

### 4. Stripe dashboard
Done 2026-09-25 (see ✅ below): the live webhook endpoint, its secret on the prod Worker,
and the live `STRIPE_SECRET_KEY`. Still open:
- **Address verification.** Stripe lists `individual.verification.additional_document` as
  past due, with the error `verification_failed_keyed_identity`: *"The address on the
  account could not be verified."* The ID document itself is verified. Correct the address
  on the account, or upload a proof of address (utility bill, bank statement) showing your
  name and that address. Card payments are active; there is no deadline set yet.
- **Customer Portal:** save the settings in live mode at
  `dashboard.stripe.com/settings/billing/portal`. No configuration exists, so "Manage
  billing" errors, and the default one can only be created by saving in the Dashboard.
  Leave plan switching off (the app handles it); cancel at period end; enable invoice
  history, payment method and customer info (incl. tax ID) updates; link `/terms` and
  `/privacy`.
- **Dev (test mode):** give dev its `sk_test_…` key
  (`npx wrangler secret put STRIPE_SECRET_KEY --env dev`), authorize the Stripe CLI for the
  test mode sandbox, and create a test-mode endpoint for
  `https://dev.hallify.sk/api/stripe/webhook` with its secret on dev. Then rehearse on dev:
  subscribe → upgrade → downgrade → cancel.
- Then make one real purchase on prod and refund it.

### 5. Audit prod for the old privilege escalation
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

## ✅ Verified done

**2026-09-25**
- `fix/first-sale-blockers` (`24bcfcf`) is **deployed** to dev and prod, after migration
  **0004** on both. Smoke checks pass on both: health, the signup consent checkbox and its
  server-side refusal, no RSVP in the pricing copy, the legal pages, and the webhook route.
- **Live webhook endpoint** `we_1UJWR3Kd9qFVOCW4IRMJwroR` →
  `https://hallify.sk/api/stripe/webhook`, the four events above, API version
  `2025-05-28.basil`. Its signing secret went straight from Stripe into the prod Worker's
  `STRIPE_WEBHOOK_SECRET` and was never displayed. **Verified end to end:** a real
  Stripe-signed live event was accepted by production (`pending_webhooks=0`), without any
  charge.
- The prod `STRIPE_SECRET_KEY` is the live key of the `hallify.sk` Stripe account
  (`acct_1IfpJKKd9qFVOCW4`), set 2026-09-25.

**2026-09-24**
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
`wrangler@^3` against the installed `wrangler@4`, so installs need legacy peer deps. That is
now set in `.npmrc`, which is what lets the plain `npm ci` of Cloudflare Workers Builds
succeed; upgrading the adapter to v7 fixes it properly.

**Cloudflare Workers Builds** is connected to this repo and builds both Workers on every
push (the "Workers Builds" checks on GitHub). It does **not** apply D1 migrations: run
`npm run migrate:dev` / `migrate:prod` before merging code that needs one. Make sure the
`hallify-dev` build's deploy command passes `--env dev`; without it Wrangler reads the
production config.

Image uploads trust the client-supplied MIME type without sniffing
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
