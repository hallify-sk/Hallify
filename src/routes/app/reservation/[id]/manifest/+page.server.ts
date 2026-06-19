import { error, redirect } from '@sveltejs/kit';
import { dbFirst, dbAll } from '$lib/db/index';
import type { ReservationRow, TableTypeRow } from '$lib/db/index';
import { buildSeatableLayout } from '$lib/reservationLayout';
import { rsvpDetailMap } from '$lib/reservationLayout';
import { st } from '$lib/i18n-server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) redirect(303, '/app/login');
	const orgId = locals.currentOrg?.id;
	if (!orgId) error(403, st(locals.locale).serverErrors.accessDenied);

	const reservation = await dbFirst<ReservationRow & { hall_floorplan_json: unknown; hall_name: string }>(locals.db,
		`SELECT r.*, h.name AS hall_name, h.floorplan_json AS hall_floorplan_json
		 FROM reservations r JOIN halls h ON h.id = r.hall_id
		 WHERE r.id = ? AND r.org_id = ?`,
		params.id, orgId
	);
	if (!reservation) error(404, st(locals.locale).serverErrors.reservationNotFound);

	const { layout, rsvps } = await buildSeatableLayout(locals.db, params.id, reservation.hall_floorplan_json, reservation.layout_json);
	const rsvpDetail = rsvpDetailMap(rsvps);

	const tableTypes = await dbAll<TableTypeRow>(locals.db,
		'SELECT * FROM table_types WHERE hall_id = ? ORDER BY name', reservation.hall_id);

	return {
		reservation: {
			id: reservation.id,
			title: reservation.title,
			event_date: reservation.event_date,
			start_time: reservation.start_time,
			end_time: reservation.end_time,
			hall_name: reservation.hall_name,
		},
		layout,
		rsvpDetail,
		tableTypes,
	};
};
