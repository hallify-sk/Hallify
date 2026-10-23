# Fix progress: ops (scheduled clean-up, custom domains, RSVP off the plans, VAT wording)

Branch: fix/ops

| id  | status   | note |
|-----|----------|------|
| D1  | done     | RSVP removed from every plan's features (plans.ts, billing list, landing copy); RSVP code stays off; the AI assistant no longer points at the RSVP page. |
| D13 | done     | Terms §4 (SK and EN) now say prices are final and no VAT is added, matching §1; a "final prices, Hallify is not a VAT payer" note sits under plan prices on billing, the operator landing pricing and the first-run wizard. |
| D8  | done     | Hourly Cron Trigger (prod and dev) and a worker.js entry that wraps SvelteKit's Worker: fetch unchanged, scheduled() calls POST /api/cron/cleanup with CRON_SECRET (must be set as a secret at deploy). Clean-up scope unchanged. |
| D9  | pending  | |
