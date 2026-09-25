# Database migrations

Cloudflare D1 migrations, applied and tracked by Wrangler. Every applied file is
recorded in the `d1_migrations` table in each database, so **local, dev and prod each
know exactly which migrations they have run**. Before this existed, schema changes were
hand-applied per environment with no record of what had landed where.

## Applying

```bash
npm run migrate:local          # local D1 (the one `npm run dev` uses)
npm run migrate:dev            # dev-remote  (hallify-dev)
npm run migrate:prod           # production  (hallify)
```

Always in that order: local → dev → prod.

## Checking what's pending

```bash
npm run migrate:status:local
npm run migrate:status:dev
npm run migrate:status:prod
```

Applying is safe to re-run — an environment that is already up to date prints
`No migrations to apply!` and does nothing.

## Adding a migration

```bash
npm run migrate:new -- "add whatever column"     # creates migrations/000N_add_whatever_column.sql
```

Then write the SQL and apply it local → dev → prod.

### Rules

- **Never edit a migration that has been applied anywhere.** Wrangler tracks files by
  name; editing one already recorded in `d1_migrations` means the change silently never
  runs. Add a new file instead.
- **`CREATE TABLE IF NOT EXISTS` does NOT add a column to an existing table.** Adding a
  column to a table that already exists always needs its own `ALTER TABLE`. This exact
  trap is why `rsvp_entries.extra_guests` and `rsvp_entries.responses` had to be applied
  by hand outside the schema file.
- Prefer idempotent statements (`IF NOT EXISTS`) where SQLite allows it.
- D1 wraps a migration file in its own transaction — no explicit `BEGIN` / `COMMIT`.

## Files

- `0001_baseline.sql` — the full schema as it stood on 2026-08-01, moved here from
  `src/lib/db/schema.sql`. Entirely `IF NOT EXISTS`, so applying it to the
  already-populated dev and prod databases is a no-op that just records the baseline.
  It supersedes the old `migration-009/010/011` files, which were folded into it.
- `0002_rate_limits.sql` — fixed-window counters for `src/lib/rateLimit.ts`.
- `0003_channel_reads.sql` — per-user channel read state (unread badges).
- `0004_legal_acceptances.sql` — who accepted the Terms (incl. the DPA) and when: at
  signup and at a first paid checkout. Apply it before deploying the code that writes
  it. The write is best-effort, so a missing table only loses the evidence row; it
  does not block signup or checkout.

Seed data is **not** a migration — it stays at `src/lib/db/seed.sql`:

```bash
npm run seed:local
```
