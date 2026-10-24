import { fail, redirect } from '@sveltejs/kit';
import { requirePlatformAdmin } from '$lib/guards';
import { st } from '$lib/i18n-server';
import { logPlatformAction } from '$lib/server/platform-audit';
import { createListingVenue, draftFromForm, parseListingVenueForm } from '$lib/server/listing-venues';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  requirePlatformAdmin(locals);
  return {};
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    requirePlatformAdmin(locals);
    const data = await request.formData();
    const parsed = parseListingVenueForm(data, st(locals.locale).listings.errors);
    if (!parsed.ok) return fail(400, { error: parsed.error, values: draftFromForm(data) });
    const { orgId } = await createListingVenue(locals.db, parsed.value);
    await logPlatformAction(locals, 'listing.create', { type: 'org', id: orgId, label: parsed.value.name });
    redirect(303, '/app/platform/listings?created=1');
  },
};
