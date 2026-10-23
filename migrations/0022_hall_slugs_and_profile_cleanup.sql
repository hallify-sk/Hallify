-- 0022 · Hall slugs, safe website links, orphaned amenities, complete opening hours.
--
-- Data fixes only, no schema change; every statement is safe to run on production
-- and idempotent (a second run finds nothing to do).

-- ─── Every hall gets a public URL (B11) ──────────────────────────────────────
-- The console and the wizard created halls with slug NULL, and the venue site lists
-- only halls with a slug, so a new venue's site stayed blank. New halls now get one
-- when they are created; this gives one to every hall that still has none.
--
-- The slug is the name transliterated (Slovak and Czech letters, as $lib/slug does),
-- with anything else turned into hyphens. A name that leaves other characters, or
-- nothing, becomes "sala". The first hall of a given slug keeps it when it is free;
-- any other gets the start of its id appended, so the global unique index
-- (halls_slug_unique) can never fail this update.
WITH base AS (
  SELECT id, trim(substr(trim(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(lower(trim(name)), 'á', 'a'), 'Á', 'a'), 'ä', 'a'), 'Ä', 'a'), 'č', 'c'), 'Č', 'c'), 'ď', 'd'), 'Ď', 'd'), 'é', 'e'), 'É', 'e'), 'ě', 'e'), 'Ě', 'e'), 'í', 'i'), 'Í', 'i'), 'ĺ', 'l'), 'Ĺ', 'l'), 'ľ', 'l'), 'Ľ', 'l'), 'ň', 'n'), 'Ň', 'n'), 'ó', 'o'), 'Ó', 'o'), 'ô', 'o'), 'Ô', 'o'), 'ö', 'o'), 'Ö', 'o'), 'ő', 'o'), 'Ő', 'o'), 'ŕ', 'r'), 'Ŕ', 'r'), 'ř', 'r'), 'Ř', 'r'), 'š', 's'), 'Š', 's'), 'ť', 't'), 'Ť', 't'), 'ú', 'u'), 'Ú', 'u'), 'ů', 'u'), 'Ů', 'u'), 'ü', 'u'), 'Ü', 'u'), 'ű', 'u'), 'Ű', 'u'), 'ý', 'y'), 'Ý', 'y'), 'ž', 'z'), 'Ž', 'z'), 'ß', 'ss'), ' ', '-'), '_', '-'), '.', '-'), ',', '-'), '/', '-'), '\', '-'), '&', '-'), '+', '-'), ':', '-'), ';', '-'), '(', '-'), ')', '-'), '''', '-'), '"', '-'), '–', '-'), '—', '-'), '!', '-'), '?', '-'), '#', '-'), '@', '-'), '*', '-'), '|', '-'), '„', '-'), '“', '-'), '”', '-'), '’', '-'), '--', '-'), '--', '-'), '--', '-'), '--', '-'), '-'), 1, 48), '-') AS b
    FROM halls WHERE slug IS NULL
),
clean AS (
  SELECT id,
         CASE WHEN b = '' OR b GLOB '*[^a-z0-9-]*'
                   OR b IN ('messages', 'my-reservations', 'book', 'new', 'edit', 'search', 'map')
              THEN 'sala' ELSE b END AS b
    FROM base
),
numbered AS (
  SELECT id, b, row_number() OVER (PARTITION BY b ORDER BY id) AS n FROM clean
)
UPDATE halls
   SET slug = (
     SELECT CASE
              WHEN numbered.n = 1 AND NOT EXISTS (SELECT 1 FROM halls h2 WHERE h2.slug = numbered.b)
              THEN numbered.b
              ELSE numbered.b || '-' || lower(substr(replace(halls.id, '-', ''), 1, 8))
            END
       FROM numbered WHERE numbered.id = halls.id)
 WHERE slug IS NULL;

-- ─── Website links are http(s) only (B14) ────────────────────────────────────
-- The profile stored whatever was typed, javascript: included, and the venue site
-- rendered it as a link. Anything with a scheme other than http(s) is removed; a
-- bare address ("www.reduta.sk") gets https:// as the form now does on save.
UPDATE halls SET contact_website = NULL
 WHERE contact_website IS NOT NULL AND trim(contact_website) = '';
UPDATE halls SET contact_website = NULL
 WHERE contact_website IS NOT NULL
   AND lower(trim(contact_website)) NOT LIKE 'http://%'
   AND lower(trim(contact_website)) NOT LIKE 'https://%'
   AND instr(contact_website, ':') > 0;
UPDATE halls SET contact_website = 'https://' || trim(contact_website)
 WHERE contact_website IS NOT NULL
   AND lower(trim(contact_website)) NOT LIKE 'http://%'
   AND lower(trim(contact_website)) NOT LIKE 'https://%';

-- ─── Deleted custom amenities leave the halls too (B150) ─────────────────────
-- Deleting an organisation's own amenity removed only its definition, so venue
-- pages kept showing the raw "custom-…" key. Drop such leftovers.
UPDATE halls
   SET amenities = (
     SELECT json_group_array(j.value) FROM json_each(halls.amenities) AS j
      WHERE j.value NOT LIKE 'custom-%'
         OR EXISTS (SELECT 1 FROM org_amenities oa WHERE oa.org_id = halls.org_id AND oa.slug = j.value))
 WHERE json_valid(amenities)
   AND json_type(amenities) = 'array'
   AND EXISTS (
     SELECT 1 FROM json_each(halls.amenities) AS j
      WHERE j.value LIKE 'custom-%'
        AND NOT EXISTS (SELECT 1 FROM org_amenities oa WHERE oa.org_id = halls.org_id AND oa.slug = j.value));

-- ─── Opening hours name all seven days (B74) ─────────────────────────────────
-- Only edited days were stored; the console showed the rest as 09:00–22:00 and the
-- public pages as closed. Halls that have hours fill the missing days with the
-- console's default. Halls that never set hours ('{}') are left alone.
UPDATE halls SET opening_hours = json_set(opening_hours, '$.mon', json('{"open":true,"from":"09:00","to":"22:00"}'))
 WHERE json_valid(opening_hours) AND json_type(opening_hours) = 'object'
   AND opening_hours NOT IN ('{}', '') AND json_type(opening_hours, '$.mon') IS NULL;
UPDATE halls SET opening_hours = json_set(opening_hours, '$.tue', json('{"open":true,"from":"09:00","to":"22:00"}'))
 WHERE json_valid(opening_hours) AND json_type(opening_hours) = 'object'
   AND opening_hours NOT IN ('{}', '') AND json_type(opening_hours, '$.tue') IS NULL;
UPDATE halls SET opening_hours = json_set(opening_hours, '$.wed', json('{"open":true,"from":"09:00","to":"22:00"}'))
 WHERE json_valid(opening_hours) AND json_type(opening_hours) = 'object'
   AND opening_hours NOT IN ('{}', '') AND json_type(opening_hours, '$.wed') IS NULL;
UPDATE halls SET opening_hours = json_set(opening_hours, '$.thu', json('{"open":true,"from":"09:00","to":"22:00"}'))
 WHERE json_valid(opening_hours) AND json_type(opening_hours) = 'object'
   AND opening_hours NOT IN ('{}', '') AND json_type(opening_hours, '$.thu') IS NULL;
UPDATE halls SET opening_hours = json_set(opening_hours, '$.fri', json('{"open":true,"from":"09:00","to":"22:00"}'))
 WHERE json_valid(opening_hours) AND json_type(opening_hours) = 'object'
   AND opening_hours NOT IN ('{}', '') AND json_type(opening_hours, '$.fri') IS NULL;
UPDATE halls SET opening_hours = json_set(opening_hours, '$.sat', json('{"open":true,"from":"09:00","to":"22:00"}'))
 WHERE json_valid(opening_hours) AND json_type(opening_hours) = 'object'
   AND opening_hours NOT IN ('{}', '') AND json_type(opening_hours, '$.sat') IS NULL;
UPDATE halls SET opening_hours = json_set(opening_hours, '$.sun', json('{"open":true,"from":"09:00","to":"22:00"}'))
 WHERE json_valid(opening_hours) AND json_type(opening_hours) = 'object'
   AND opening_hours NOT IN ('{}', '') AND json_type(opening_hours, '$.sun') IS NULL;
