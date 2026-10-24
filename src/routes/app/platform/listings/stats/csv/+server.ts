import { requirePlatformAdmin } from '$lib/guards';
import { st } from '$lib/i18n-server';
import { hallStats, parsePeriod, parseScope, statsCsv, utcDay } from '$lib/server/listing-stats';
import type { RequestHandler } from './$types';

/** The listings report as a spreadsheet, for a sales offer: the same rows and filters
 *  as the page. Semicolons for a Slovak reader, whose Excel only splits on those. */
export const GET: RequestHandler = async ({ locals, url }) => {
  requirePlatformAdmin(locals);
  const period = parsePeriod(url.searchParams.get('period'), utcDay());
  const scope = parseScope(url.searchParams.get('scope'));
  const rows = await hallStats(locals.db, period, { kind: scope });
  const l = st(locals.locale).listings;
  const csv = statsCsv(rows, period, {
    venue: l.csvVenue, hall: l.colHall, type: l.colType, mode: l.csvMode,
    impressions: l.colImpressions, detailViews: l.colViews, websiteClicks: l.colWebsite, phoneClicks: l.colPhone,
    emailClicks: l.colEmail, clicks: l.colClicks, ctr: l.csvCtr, from: l.csvFrom, to: l.csvTo,
    listingTypes: { partner: l.typePartner, basic: l.typeBasic, external: l.typeExternal },
    modes: { hallify: l.modeHallify, external: l.modeExternal },
  }, locals.locale === 'en' ? ',' : ';');
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="hallify-listings-${scope}-${period.key}.csv"`,
      'cache-control': 'no-store',
    },
  });
};
