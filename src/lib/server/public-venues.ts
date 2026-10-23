import { dbAll, fromJsonArr } from '$lib/db/index';
import { applyDiscoveryMigrations } from './discovery-migrations';
import { CUSTOM_DOMAIN_SQL, LISTED_HALL_SQL, LISTED_HALL_SQL_WITHOUT_COORDINATES, venueSiteOrigin } from './discovery';
import type { PublicVenue } from '$lib/marketing/types';

type VenueRow = Omit<PublicVenue, 'amenities' | 'is_partner' | 'site_url'> & {
  amenities: string; is_partner: number; custom_domain: string | null; plan: string | null;
};

/** How many venues one directory response carries. The page paginates the list
 *  itself; this only bounds the payload. */
export const DIRECTORY_LIMIT = 500;

// A partner is anyone on a paid plan, plus anyone the platform has flagged by hand.
// Deriving it from the subscription means partner status follows payment without an
// admin having to remember; keeping the flag means a partnership that is not a
// straightforward paid plan can still be granted. 'trialing' counts -- they are on a
// paid tier -- while past_due/cancelled/paused do not.
const PARTNER_SQL =
  `CASE WHEN o.is_hallify_partner = 1
        OR (s.plan IS NOT NULL AND s.plan != 'free' AND s.status IN ('active','trialing'))
   THEN 1 ELSE 0 END AS is_partner`;

/** Where the venue's own site is, so the directory can send a visitor there to book. */
export interface VenueSiteContext { url: URL; appDomain: string }

export async function publicVenues(db: App.Locals['db'], onReady?: (ready: boolean) => void, site?: VenueSiteContext): Promise<PublicVenue[]> {
  let ready = true;
  const query = `SELECT h.id, h.name, h.slug, h.description, h.address, h.max_people,
      h.latitude, h.longitude, h.cover_image_url, h.amenities, h.pricing_info, h.price_band, ${PARTNER_SQL},
      h.allow_reservations, CASE WHEN h.floorplan_json IS NOT NULL AND h.floorplan_json != '' THEN 1 ELSE 0 END AS has_floorplan,
      o.slug AS org_slug, s.plan AS plan, ${CUSTOM_DOMAIN_SQL} AS custom_domain
     FROM halls h JOIN organizations o ON o.id = h.org_id
     LEFT JOIN subscriptions s ON s.org_id = o.id
     WHERE ${LISTED_HALL_SQL}
     ORDER BY h.name LIMIT ${DIRECTORY_LIMIT}`;
  let rows: VenueRow[];
  try {
    rows = await dbAll<VenueRow>(db, query);
  } catch (error) {
    // Keep public discovery available while additive migrations roll out.
    // Do not hide unrelated database failures or fabricate map coordinates.
    const message = error instanceof Error ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ''}` : String(error);
    // price_band arrived with 0006, which applyDiscoveryMigrations deliberately does
    // not apply (0006 also creates org_amenities, reservations.event_type and
    // geocode_cache, and half-applying it would make the real runner skip the rest).
    // Recognising the column here is what lets the degraded query below take over
    // instead of the whole public directory failing on a database mid-rollout.
    if (!/no such column:\s*(?:h\.)?(?:latitude|longitude|price_band)\b|no such column:\s*(?:o\.)?is_hallify_partner\b/i.test(message)) throw error;
    try {
      await applyDiscoveryMigrations(db);
      rows = await dbAll<VenueRow>(db, query);
    } catch (migrationError) {
      // Keep existing venues usable if schema administration is temporarily unavailable.
      ready = false;
      console.error('Discovery migration failed:', migrationError instanceof Error ? migrationError.message : 'Unknown database error');
      rows = await dbAll<VenueRow>(db,
        `SELECT h.id, h.name, h.slug, h.description, h.address, h.max_people,
          NULL AS latitude, NULL AS longitude, h.cover_image_url, h.amenities, h.pricing_info, NULL AS price_band, 0 AS is_partner,
          h.allow_reservations, CASE WHEN h.floorplan_json IS NOT NULL AND h.floorplan_json != '' THEN 1 ELSE 0 END AS has_floorplan,
          o.slug AS org_slug, NULL AS plan, NULL AS custom_domain
         FROM halls h JOIN organizations o ON o.id = h.org_id
         WHERE ${LISTED_HALL_SQL_WITHOUT_COORDINATES}
         ORDER BY h.name LIMIT ${DIRECTORY_LIMIT}`);
    }
  }
  onReady?.(ready);
  return rows.map(({ custom_domain, plan, ...row }) => ({
    ...row,
    is_partner: row.is_partner === 1,
    amenities: fromJsonArr(row.amenities).filter((item): item is string => typeof item === 'string'),
    site_url: site ? venueSiteOrigin({ slug: row.org_slug ?? null, custom_domain, plan }, site.url, site.appDomain) : null,
  }));
}
