import { error } from '@sveltejs/kit';
import { dbFirst } from '$lib/db/index';
import type { HallRow } from '$lib/db/index';
import { fromJsonArr, fromJson } from '$lib/db/index';
import { getPlan } from '$lib/plans';
import type { PlanId } from '$lib/plans';
import { st } from '$lib/i18n-server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
  const orgId = locals.domainOrg!.id;

  const hall = await dbFirst<HallRow>(
    locals.db,
    `SELECT * FROM halls
    WHERE slug = ? AND is_public = 1 AND plan_locked = 0 AND org_id = ?`,
    params.slug,
    orgId
  );
  if (!hall) error(404, st(locals.locale).serverErrors.hallNotFound);

  // Clamp the publicly shown gallery to the org's plan limit (a downgrade hides
  // the excess images without deleting them — they return on re-upgrade).
  const sub = await dbFirst<{ plan: string | null }>(locals.db, 'SELECT plan FROM subscriptions WHERE org_id = ?', orgId);
  const galleryLimit = getPlan((sub?.plan ?? 'free') as PlanId).limits.maxGalleryImages;
  let gallery = fromJsonArr(hall.gallery_images as string | null);
  if (galleryLimit !== -1 && gallery.length > galleryLimit) gallery = gallery.slice(0, galleryLimit);

  return {
    hall: {
      ...hall,
      gallery_images: gallery,
      amenities: fromJsonArr(hall.amenities as string | null),
      opening_hours: fromJson(hall.opening_hours as string | null),
    },
    booked: url.searchParams.get('booked') === '1',
  };
};
