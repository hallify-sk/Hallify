import sql from '$lib/db/index';
import type { ReservationRow } from '$lib/db/index';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user!.id;

	const reservations = await sql<(ReservationRow & { hall_name: string; org_name: string })[]>`
		SELECT r.*, h.name AS hall_name, o.name AS org_name
		FROM reservations r
		JOIN halls h ON h.id = r.hall_id
		JOIN organizations o ON o.id = r.org_id
		WHERE r.user_id = ${userId}
		ORDER BY r.event_date DESC
		LIMIT 20
	`;

	const today = new Date().toISOString().split('T')[0];
	const upcoming = reservations.filter(
		r => r.status !== 'cancelled' && new Date(r.event_date) >= new Date(today)
	);

	return { reservations, upcomingCount: upcoming.length };
};
