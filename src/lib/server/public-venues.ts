import { dbAll, fromJsonArr } from '$lib/db/index';
import { applyDiscoveryMigrations } from './discovery-migrations';
import type { PublicVenue } from '$lib/marketing/types';

type VenueRow = Omit<PublicVenue, 'amenities' | 'is_partner'> & { amenities: string; is_partner: number };

// A partner is anyone on a paid plan, plus anyone the platform has flagged by hand.
// Deriving it from the subscription means partner status follows payment without an
// admin having to remember; keeping the flag means a partnership that is not a
// straightforward paid plan can still be granted. 'trialing' counts -- they are on a
// paid tier -- while past_due/cancelled/paused do not.
const PARTNER_SQL =
  `CASE WHEN o.is_hallify_partner = 1
        OR (s.plan IS NOT NULL AND s.plan != 'free' AND s.status IN ('active','trialing'))
   THEN 1 ELSE 0 END AS is_partner`;

export async function publicVenues(db: App.Locals['db'], onReady?: (ready: boolean) => void): Promise<PublicVenue[]> {
  let ready = true;
  const query = `SELECT h.id, h.name, h.slug, h.description, h.address, h.max_people,
      h.latitude, h.longitude, h.cover_image_url, h.amenities, h.pricing_info, h.price_band, ${PARTNER_SQL},
      h.allow_reservations, CASE WHEN h.floorplan_json IS NOT NULL AND h.floorplan_json != '' THEN 1 ELSE 0 END AS has_floorplan
     FROM halls h JOIN organizations o ON o.id = h.org_id
     LEFT JOIN subscriptions s ON s.org_id = o.id
     WHERE h.is_public = 1 AND h.plan_locked = 0 AND o.suspended_at IS NULL
     ORDER BY h.name LIMIT 120`;
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
          h.allow_reservations, CASE WHEN h.floorplan_json IS NOT NULL AND h.floorplan_json != '' THEN 1 ELSE 0 END AS has_floorplan
         FROM halls h JOIN organizations o ON o.id = h.org_id
         WHERE h.is_public = 1 AND h.plan_locked = 0 AND o.suspended_at IS NULL
         ORDER BY h.name LIMIT 120`);
    }
  }
  onReady?.(ready);
  return rows.map(row => ({ ...row, is_partner: row.is_partner === 1, amenities: fromJsonArr(row.amenities).filter((item): item is string => typeof item === 'string') }));
}
