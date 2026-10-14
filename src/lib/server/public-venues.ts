import { dbAll, fromJsonArr } from '$lib/db/index';
import type { PublicVenue } from '$lib/marketing/types';

type VenueRow = Omit<PublicVenue, 'amenities' | 'is_partner'> & { amenities: string; is_partner: number };

export async function publicVenues(db: App.Locals['db']): Promise<PublicVenue[]> {
  let rows: VenueRow[];
  try {
    rows = await dbAll<VenueRow>(db,
    `SELECT h.id, h.name, h.slug, h.description, h.address, h.max_people,
      h.latitude, h.longitude, h.cover_image_url, h.amenities, h.pricing_info, o.is_hallify_partner AS is_partner,
      h.allow_reservations, CASE WHEN h.floorplan_json IS NOT NULL AND h.floorplan_json != '' THEN 1 ELSE 0 END AS has_floorplan
     FROM halls h JOIN organizations o ON o.id = h.org_id
     WHERE h.is_public = 1 AND h.plan_locked = 0 AND o.suspended_at IS NULL
     ORDER BY h.name LIMIT 120`);
  } catch (error) {
    // Keep public discovery available while additive migrations roll out.
    // Do not hide unrelated database failures or fabricate map coordinates.
    const message = error instanceof Error ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ''}` : String(error);
    if (!/no such column:\s*(?:h\.)?(?:latitude|longitude)\b|no such column:\s*(?:o\.)?is_hallify_partner\b/i.test(message)) throw error;
    console.warn('Public venue directory is waiting for coordinate/partner migrations.');
    rows = await dbAll<VenueRow>(db,
      `SELECT h.id, h.name, h.slug, h.description, h.address, h.max_people,
        NULL AS latitude, NULL AS longitude, h.cover_image_url, h.amenities, h.pricing_info, 0 AS is_partner,
        h.allow_reservations, CASE WHEN h.floorplan_json IS NOT NULL AND h.floorplan_json != '' THEN 1 ELSE 0 END AS has_floorplan
       FROM halls h JOIN organizations o ON o.id = h.org_id
       WHERE h.is_public = 1 AND h.plan_locked = 0 AND o.suspended_at IS NULL
       ORDER BY h.name LIMIT 120`);
  }
  return rows.map(row => ({ ...row, is_partner: row.is_partner === 1, amenities: fromJsonArr(row.amenities).filter((item): item is string => typeof item === 'string') }));
}
