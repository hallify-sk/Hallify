-- Migration 0036 — a hall's public URL is unique within its organisation (B140).
--
-- Every address that carries a hall slug also names the venue: the venue site
-- (<org>.<domain>/halls/<slug>, or its custom domain) and the directory
-- (/priestory/<org>/<slug>). The old apex /app/halls/<slug> redirect resolves a slug
-- only when exactly one listed hall has it. A global unique index therefore only
-- made a common name ("velka-sala") unavailable to every venue but the first.
--
-- Safe on existing data: slugs are globally unique today, so they are unique per
-- organisation too and the new index cannot fail. The new index is created before
-- the old one is dropped, so there is no moment without a constraint.
-- IF [NOT] EXISTS throughout; D1 manages the transaction.

CREATE UNIQUE INDEX IF NOT EXISTS halls_org_slug_unique
  ON halls (org_id, slug) WHERE slug IS NOT NULL;

DROP INDEX IF EXISTS halls_slug_unique;
