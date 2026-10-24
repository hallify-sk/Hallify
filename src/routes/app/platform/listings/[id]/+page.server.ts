import { error, fail, redirect } from '@sveltejs/kit';
import { requirePlatformAdmin } from '$lib/guards';
import { st } from '$lib/i18n-server';
import { logPlatformAction } from '$lib/server/platform-audit';
import { deleteListingVenue, draftFromForm, loadListingVenue, parseListingVenueForm, updateListingVenue } from '$lib/server/listing-venues';
import { hallStats, parsePeriod } from '$lib/server/listing-stats';
import type { Actions, PageServerLoad } from './$types';

/** One venue that is not on Hallify, by its hall's id. */
export const load: PageServerLoad = async ({ locals, params }) => {
  requirePlatformAdmin(locals);
  const venue = await loadListingVenue(locals.db, params.id);
  if (!venue) error(404, st(locals.locale).listings.errors.notFound);
  const [last30] = (await hallStats(locals.db, parsePeriod('30d'), { kind: 'listing' })).filter((r) => r.hall_id === venue.hall_id);
  return { venue, last30: last30 ?? null, saved: false };
};

export const actions: Actions = {
  save: async ({ request, locals, params, platform }) => {
    requirePlatformAdmin(locals);
    const current = await loadListingVenue(locals.db, params.id);
    if (!current) error(404, st(locals.locale).listings.errors.notFound);
    const data = await request.formData();
    const parsed = parseListingVenueForm(data, st(locals.locale).listings.errors, current.cover_image_url);
    if (!parsed.ok) return fail(400, { error: parsed.error, values: draftFromForm(data) });
    await updateListingVenue(locals.db, platform?.env?.R2, current, parsed.value);
    await logPlatformAction(locals, 'listing.update', { type: 'org', id: current.org_id, label: parsed.value.name });
    return { saved: true };
  },

  delete: async ({ locals, params, platform }) => {
    requirePlatformAdmin(locals);
    const current = await loadListingVenue(locals.db, params.id);
    if (!current) error(404, st(locals.locale).listings.errors.notFound);
    await deleteListingVenue(locals.db, platform?.env?.R2, current);
    await logPlatformAction(locals, 'listing.delete', { type: 'org', id: current.org_id, label: current.name });
    redirect(303, '/app/platform/listings?deleted=1');
  },
};
