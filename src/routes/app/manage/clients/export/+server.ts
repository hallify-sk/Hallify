import type { RequestHandler } from './$types';
import { requireOrgPermission } from '$lib/server/access';
import { st } from '$lib/i18n-server';
import { loadClientList } from '$lib/server/clients';
import { matchesClient, parseClientFilters, sortClients } from '$lib/clients';
import { toCsv } from '$lib/server/reservation-list';
import { todayUtcISO } from '$lib/server/reservation-rules';
import { formatRating } from '$lib/feedback';
import { parseDbTime } from '$lib/format';

// CSV of the client list with the screen's search and order (without paging).
export const GET: RequestHandler = async ({ locals, url }) => {
	const org = await requireOrgPermission(locals, 'reservations.manage');
	const c = st(locals.locale).clients;
	const filters = parseClientFilters(url.searchParams);
	const all = await loadClientList(locals.db, org.id, todayUtcISO());
	const rows = sortClients(all.filter((x) => matchesClient(x, filters.q)), filters.sort);
	const day = (v: string | null) => (v ? (parseDbTime(v)?.toISOString().slice(0, 10) ?? v.slice(0, 10)) : '');

	const csv = toCsv(
		[c.csvName, c.csvType, c.email, c.phone, c.csvBookings, c.csvNext, c.csvLast, c.csvRating, c.csvRatings, c.csvRegistered],
		rows.map((r) => [
			r.name, r.kind === 'account' ? c.csvTypeAccount : c.csvTypeGuest, r.email ?? '', r.phone ?? '',
			r.bookings, r.nextEvent ?? '', r.lastEvent ?? '',
			r.ratingAverage == null ? '' : formatRating(r.ratingAverage, locals.locale), r.ratingCount || '',
			r.kind === 'account' ? day(r.since) : '',
		])
	);

	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="clients-${todayUtcISO()}.csv"`,
			'cache-control': 'no-store',
		},
	});
};
