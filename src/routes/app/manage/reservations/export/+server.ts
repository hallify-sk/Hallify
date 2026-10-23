import type { RequestHandler } from './$types';
import { requireOrgArea } from '$lib/server/access';
import { st } from '$lib/i18n-server';
import { parseListFilters, exportRows, toCsv } from '$lib/server/reservation-list';
import { todayUtcISO } from '$lib/server/reservation-rules';
import { eventTypeLabel } from '$lib/eventTypes';

// CSV of the reservations list with the same filters as the screen (without paging).
export const GET: RequestHandler = async ({ locals, url }) => {
	// The same rows the list shows, so the same permission: viewing reservations.
	const orgId = (await requireOrgArea(locals, 'reservations')).org.id;
	const d = st(locals.locale);
	const filters = parseListFilters(url.searchParams);
	const rows = await exportRows(locals.db, orgId, filters, todayUtcISO());

	const status = d.status as Record<string, string>;
	const types = d.eventTypes as unknown as Record<string, string>;
	const csv = toCsv(
		[d.adminReservations.event, d.createEvent.eventType, d.resOps.date, d.resOps.startTime, d.resOps.endTime,
			d.adminReservations.hall, d.adminReservations.status, d.resOps.customer, d.resOps.csvContact,
			d.adminReservations.user, d.resOps.csvEmail, d.resOps.csvGuests, d.resOps.csvCreated],
		rows.map((r) => [
			r.title, eventTypeLabel(r.event_type, types), r.event_date, r.start_time ?? '', r.end_time ?? '',
			r.hall_name, status[r.status] ?? r.status, r.customer_name ?? '', r.customer_contact ?? '',
			`${r.user_first_name ?? ''} ${r.user_last_name ?? ''}`.trim(), r.user_email ?? '', r.num_guests ?? '', r.created_at,
		])
	);

	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="reservations-${todayUtcISO()}.csv"`,
			'cache-control': 'no-store',
		},
	});
};
