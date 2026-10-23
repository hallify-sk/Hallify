import { dbAll } from '$lib/db/index';
import { fromJsonArr } from '$lib/db/index';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // locals.domainOrg is guaranteed non-null by the halls layout server guard
  const orgId = locals.domainOrg!.id;

  const halls = await dbAll<{
    id: string;
    name: string;
    contact_phone?: string | null;
    contact_email?: string | null;
    contact_website?: string | null;
    gallery_images?: unknown;
    price_band?: number | null;
    description: string | null;
    max_people: number;
    color: string;
    slug: string;
    cover_image_url: string | null;
    amenities: unknown;
    address: string | null;
  }>(
    locals.db,
    // Contact details come from the venue profiles: the Contact section has no
    // store of its own, so an operator never has to type their phone number twice.
    // gallery_images feeds the featured panel when a hall has no cover photo.
    `SELECT id, name, description, max_people, color, slug, cover_image_url, amenities, address,
            contact_phone, contact_email, contact_website, gallery_images, price_band
    FROM halls
    WHERE is_public = 1 AND plan_locked = 0 AND slug IS NOT NULL AND org_id = ?
    ORDER BY name`,
    orgId
  );

  return { halls: halls.map(h => ({ ...h, amenities: fromJsonArr(h.amenities as string | null) })) };
};
