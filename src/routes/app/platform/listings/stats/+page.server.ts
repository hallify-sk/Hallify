import { requirePlatformAdmin } from '$lib/guards';
import { venuePagePath } from '$lib/marketing/types';
import { hallStats, parsePeriod, parseScope, recentMonths, totals, utcDay } from '$lib/server/listing-stats';
import type { PageServerLoad } from './$types';

/** Every listed hall's directory figures, for the platform and for sales offers. */
export const load: PageServerLoad = async ({ locals, url }) => {
  requirePlatformAdmin(locals);
  const today = utcDay();
  const period = parsePeriod(url.searchParams.get('period'), today);
  const scope = parseScope(url.searchParams.get('scope'));
  const rows = await hallStats(locals.db, period, { kind: scope });
  return {
    period,
    scope,
    months: recentMonths(today),
    rows: rows.map((r) => ({ ...r, href: r.hall_slug ? venuePagePath(r.org_slug, r.hall_slug) : null })),
    totals: totals(rows),
  };
};
