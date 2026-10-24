import { requireOrgArea } from '$lib/server/access';
import { hallStats, orgMonthlyStats, parsePeriod, recentMonths, totals, utcDay } from '$lib/server/listing-stats';
import type { PageServerLoad } from './$types';

/**
 * How the organisation's halls are seen: shown in the Hallify directory, opened (on
 * the directory or the venue's own site) and how often visitors clicked through to
 * the venue's website, phone or e-mail. Whoever can see the halls can see these:
 * they describe the halls, not the clients.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  const { org } = await requireOrgArea(locals, 'halls');
  const today = utcDay();
  const months = recentMonths(today);
  const period = parsePeriod(url.searchParams.get('period'), today);
  const rows = await hallStats(locals.db, period, { kind: 'org', orgId: org.id });
  return {
    period,
    months,
    rows: rows.map((r) => ({ ...r, href: `/app/manage/halls/${r.hall_id}` })),
    totals: totals(rows),
    monthly: await orgMonthlyStats(locals.db, org.id, months[months.length - 1]),
  };
};
