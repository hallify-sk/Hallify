import { error, redirect, fail } from '@sveltejs/kit';
import sql from '$lib/db/index';
import type { ReservationRow, RsvpTemplateRow } from '$lib/db/index';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) redirect(303, '/app/login');

	const [reservation] = await sql<ReservationRow[]>`
		SELECT r.*, h.name AS hall_name
		FROM reservations r
		JOIN halls h ON h.id = r.hall_id
		WHERE r.id = ${params.id}
	`;

	if (!reservation) error(404, 'Reservation not found');
	if (reservation.user_id !== locals.user.id && locals.user.role !== 'admin') {
		error(403, 'Access denied');
	}

	const templates = await sql<RsvpTemplateRow[]>`
		SELECT * FROM rsvp_templates ORDER BY name
	`;

	return { reservation, templates };
};

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		if (!locals.user) redirect(303, '/app/login');
		const data = await request.formData();
		const configStr = String(data.get('config') ?? '{}');

		let configObj;
		try {
			configObj = JSON.parse(configStr);
		} catch {
			return fail(400, { error: 'Invalid config JSON' });
		}

		const [reservation] = await sql<ReservationRow[]>`SELECT user_id FROM reservations WHERE id = ${params.id}`;
		if (!reservation || (reservation.user_id !== locals.user.id && locals.user.role !== 'admin')) {
			error(403, 'Access denied');
		}

		await sql`UPDATE reservations SET rsvp_config = ${sql.json(configObj)} WHERE id = ${params.id}`;
		return { success: true };
	}
};
