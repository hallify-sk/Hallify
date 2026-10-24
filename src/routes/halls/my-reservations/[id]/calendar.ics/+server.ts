import { error, redirect } from '@sveltejs/kit';
import { dbFirst } from '$lib/db/index';
import { loginUrl } from '$lib/login-redirect';
import { st } from '$lib/i18n-server';
import { buildIcs } from '$lib/ics';
import { venueClientAccess } from '$lib/server/reservation-client-access';
import type { RequestHandler } from './$types';

// "Add to calendar" on the client's booking page: the event as an .ics file.
// The booking's client and the people it is shared with (0038), and only the
// columns a client may see (B60).
export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user) redirect(303, loginUrl(url, '/login'));
	if (!locals.domainOrg) error(404, st(locals.locale).serverErrors.reservationNotFound);

	const a = venueClientAccess(locals.user.id);
	const r = await dbFirst<{
		id: string; title: string; event_date: string; start_time: string | null; end_time: string | null;
		status: string; hall_name: string; hall_address: string | null;
	}>(locals.db,
		`SELECT r.id, r.title, r.event_date, r.start_time, r.end_time, r.status,
		        h.name AS hall_name, h.address AS hall_address
		   FROM reservations r JOIN halls h ON h.id = r.hall_id
		  WHERE r.id = ? AND ${a.where.sql} AND r.org_id = ?`,
		params.id, ...a.where.params, locals.domainOrg.id);
	if (!r || r.status === 'cancelled') error(404, st(locals.locale).serverErrors.reservationNotFound);

	const page = `${url.origin}/halls/my-reservations/${r.id}`;
	const body = buildIcs({
		uid: `${r.id}@hallify`,
		title: `${r.title} – ${locals.domainOrg.name}`,
		date: r.event_date,
		start: r.start_time,
		end: r.end_time,
		location: [r.hall_name, r.hall_address].filter(Boolean).join(', '),
		description: page,
		url: page,
	});
	return new Response(body, {
		headers: {
			'content-type': 'text/calendar; charset=utf-8',
			'content-disposition': `attachment; filename="reservation-${r.event_date}.ics"`,
			'cache-control': 'private, no-store',
		},
	});
};
