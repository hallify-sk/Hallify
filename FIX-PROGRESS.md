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
