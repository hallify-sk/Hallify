import { requirePlatformAdmin } from '$lib/guards';
import { listListingVenues } from '$lib/server/listing-venues';
import { hallStats, parsePeriod } from '$lib/server/listing-stats';
import type { PageServerLoad } from './$types';

/** Venues that are not on Hallify: what a platform admin added to the directory. */
export const load: PageServerLoad = async ({ locals, url }) => {
  requirePlatformAdmin(locals);
  const venues = await listListingVenues(locals.db);
  // The last 30 days beside each, so the list already says which ones are worth a call.
  const stats = await hallStats(locals.db, parsePeriod('30d'), { kind: 'listing' });
  const byHall = new Map(stats.map((s) => [s.hall_id, s]));
  return {
    venues: venues.map((v) => ({ ...v, stats: byHall.get(v.hall_id) ?? null })),
    created: url.searchParams.get('created') === '1',
    deleted: url.searchParams.get('deleted') === '1',
  };
};
