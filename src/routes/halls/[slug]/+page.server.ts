import { error } from '@sveltejs/kit';
import { dbFirst } from '$lib/db/index';
import type { HallRow } from '$lib/db/index';
import { fromJsonArr, fromJson } from '$lib/db/index';
import { getPlan } from '$lib/plans';
import type { PlanId } from '$lib/plans';
import { st } from '$lib/i18n-server';
import { getTakenDates, getUnavailableDates, getFullMonths, earliestBookableISO, isoLocal, addDays } from '$lib/availability';
import type { PageServerLoad } from './$types';
import { PARTNER_SQL } from '$lib/server/discovery';
import { listingType, takesHallifyBookings, type ListingRef } from '$lib/listings';

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
  const sub = await dbFirst<{ plan: string | null; is_partner: number; listing_only: number }>(locals.db,
    `SELECT s.plan, ${PARTNER_SQL} AS is_partner, o.listing_only
       FROM organizations o LEFT JOIN subscriptions s ON s.org_id = o.id WHERE o.id = ?`, orgId);
  const galleryLimit = getPlan((sub?.plan ?? 'free') as PlanId).limits.maxGalleryImages;
  let gallery = fromJsonArr(hall.gallery_images as string | null);
  if (galleryLimit !== -1 && gallery.length > galleryLimit) gallery = gallery.slice(0, galleryLimit);

  // A read-only availability calendar for visitors, so a couple can see free dates
  // before registering. Only whether a day is free, never who booked it.
  let availability: { taken: string[]; unavailable: string[]; fullMonths: string[]; earliest: string } | null = null;
  if (takesHallifyBookings(hall) && !hall.plan_locked) {
    const fromISO = isoLocal(new Date());
    const toISO = isoLocal(addDays(new Date(), 365));
    const [taken, unavailable, fullMonths] = await Promise.all([
      getTakenDates(locals.db, hall.id, fromISO, toISO),
      getUnavailableDates(locals.db, hall, fromISO, toISO),
      getFullMonths(locals.db, hall, fromISO, toISO)
    ]);
    availability = { taken, unavailable, fullMonths, earliest: earliestBookableISO(hall.min_days_advance) };
  }

  return {
    availability,
    hall: {
      ...hall,
      gallery_images: gallery,
      amenities: fromJsonArr(hall.amenities as string | null),
      opening_hours: fromJson(hall.opening_hours as string | null),
    },
    booked: url.searchParams.get('booked') === '1',
    // Which listing the page's counters and GA4 events are about.
    listingRef: {
      hall_id: hall.id, slug: hall.slug, venue_id: orgId,
      listing_type: listingType({ listing_only: sub?.listing_only, is_partner: sub?.is_partner }),
    } satisfies ListingRef,
  };
};
