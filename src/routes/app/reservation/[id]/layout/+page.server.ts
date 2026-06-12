import { error, redirect, fail } from '@sveltejs/kit';
import sql from '$lib/db/index';
import type { ReservationRow, TableTypeRow } from '$lib/db/index';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) redirect(303, '/app/login');

	const [reservation] = await sql<(ReservationRow & { hall_floorplan_json: unknown })[]>`
		SELECT r.*, h.name AS hall_name, h.floorplan_json AS hall_floorplan_json
		FROM reservations r
		JOIN halls h ON h.id = r.hall_id
		WHERE r.id = ${params.id}
	`;

	if (!reservation) error(404, 'Reservation not found');
	if (reservation.user_id !== locals.user.id && locals.user.role !== 'admin') {
		error(403, 'Access denied');
	}

	const tableTypes = await sql<TableTypeRow[]>`
		SELECT * FROM table_types WHERE hall_id = ${reservation.hall_id} ORDER BY name
	`;

	return { reservation, tableTypes };
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		if (!locals.user) redirect(303, '/app/login');
		const data = await request.formData();
		const layoutJson = String(data.get('layoutJson') ?? '');
		if (!layoutJson) return fail(400, { error: 'No layout data.' });

		const [reservation] = await sql<ReservationRow[]>`SELECT user_id FROM reservations WHERE id = ${params.id}`;
		if (!reservation || (reservation.user_id !== locals.user.id && locals.user.role !== 'admin')) {
			error(403, 'Access denied');
		}

		await sql`UPDATE reservations SET layout_json = ${layoutJson}::jsonb WHERE id = ${params.id}`;
		return { success: true };
	}
};
