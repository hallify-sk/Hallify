# Fix progress: ops (scheduled clean-up, custom domains, RSVP off the plans, VAT wording)

Branch: fix/ops-r2 (continues fix/ops)

| id  | status   | note |
|-----|----------|------|
| D1  | done     | RSVP removed from every plan's features (plans.ts, billing list, landing copy); RSVP code stays off; the AI assistant no longer points at the RSVP page. |
| D13 | done     | Terms §4 (SK and EN) now say prices are final and no VAT is added, matching §1; a "final prices, Hallify is not a VAT payer" note sits under plan prices on billing, the operator landing pricing and the first-run wizard. |
| D8  | done     | Hourly Cron Trigger (prod and dev) and a worker.js entry that wraps SvelteKit's Worker: fetch unchanged, scheduled() calls POST /api/cron/cleanup with CRON_SECRET (must be set as a secret at deploy). Clean-up scope unchanged. |
| D9  | done     | Cloudflare for SaaS custom hostname created on add (or adopted / re-created); CNAME + TXT records Cloudflare asks for shown per domain with copy buttons; "Check status" plus automatic re-check while the page is open (30 s) and from the hourly cron; verified only when hostname and certificate are active, un-verified when the DNS moves away; venue site, links and listings use a custom domain only once verified; unverified claims released after 7 days (only right after a successful check); clear "not connected" state when the server has no Cloudflare credentials. Migration 0034 (additive). |
