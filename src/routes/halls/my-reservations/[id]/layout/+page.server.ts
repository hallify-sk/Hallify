import { error, redirect, fail } from '@sveltejs/kit';
import { dbFirst, dbAll, dbRun, fromJson } from '$lib/db/index';
import type { ReservationRow, TableTypeRow } from '$lib/db/index';
import { buildSeatableLayout } from '$lib/reservationLayout';
import { parseEventTypes } from '$lib/eventTypes';
import { countSeats } from '$lib/floorplan-types';
import { st } from '$lib/i18n-server';
import { hasEventStarted } from '$lib/reservationStatus';
import { tableInventoryError } from '$lib/server/table-inventory';
import type { Actions, PageServerLoad } from './$types';

// The booking client may edit the seating layout once the event is approved — but only
// until the event starts.
const CLIENT_EDITABLE = new Set(['approved', 'planned']);

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) redirect(303, `/login?redirect=/halls/my-reservations/${params.id}/layout`);
	const orgId = locals.domainOrg!.id;

	const reservation = await dbFirst<ReservationRow & { hall_floorplan_json: unknown; hall_name: string }>(locals.db,
		`SELECT r.*, h.name AS hall_name, h.floorplan_json AS hall_floorplan_json
		 FROM reservations r JOIN halls h ON h.id = r.hall_id
		 WHERE r.id = ? AND r.user_id = ? AND r.org_id = ?`,
		params.id, locals.user.id, orgId
	);
	if (!reservation) error(404, st(locals.locale).serverErrors.reservationNotFound);
	if (!CLIENT_EDITABLE.has(reservation.status)) redirect(303, `/halls/my-reservations/${params.id}`);
	if (hasEventStarted(reservation.event_date, reservation.start_time)) redirect(303, `/halls/my-reservations/${params.id}`);
	if (!reservation.hall_floorplan_json) redirect(303, `/halls/my-reservations/${params.id}`);

	const tableTypes = await dbAll<TableTypeRow>(locals.db,
		'SELECT * FROM table_types WHERE hall_id = ? ORDER BY name', reservation.hall_id);

	// Org-defined templates the client can start from. Seat count (for the guest-count
	// recommendation) is computed server-side so the full layout JSON stays off the wire.
	const templatesRaw = await dbAll<{ id: string; name: string; event_type: string | null; layout_json: string | null }>(locals.db,
		'SELECT id, name, event_type, layout_json FROM floorplan_templates WHERE hall_id = ? ORDER BY name', reservation.hall_id);
	const templates = templatesRaw.map(tm => ({
		id: tm.id, name: tm.name,
		eventTypes: parseEventTypes(tm.event_type),
		seats: countSeats(tm.layout_json),
	}));

	const { layout } = await buildSeatableLayout(locals.db, params.id, reservation.hall_floorplan_json, reservation.layout_json);

	return {
		reservation: { id: reservation.id, title: reservation.title, numGuests: reservation.num_guests ?? null },
		tableTypes,
		templates,
		initialLayout: layout,
	};
};

export const actions: Actions = {
	saveLayout: async ({ request, locals, params }) => {
		if (!locals.user) return fail(403, { error: st(locals.locale).serverErrors.unauthorized });
		const orgId = locals.domainOrg!.id;
		const data = await request.formData();
		const layoutJson = String(data.get('layoutJson') ?? '');
		if (!layoutJson) return fail(400, { error: st(locals.locale).serverErrors.noLayoutData });

		const reservation = await dbFirst<{ status: string; hall_id: string; event_date: string; start_time: string | null; hall_floorplan_json: unknown }>(locals.db,
			'SELECT r.status, r.hall_id, r.event_date, r.start_time, h.floorplan_json AS hall_floorplan_json FROM reservations r JOIN halls h ON h.id = r.hall_id WHERE r.id = ? AND r.user_id = ? AND r.org_id = ?',
			params.id, locals.user.id, orgId
		);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.notFound });
		if (!CLIENT_EDITABLE.has(reservation.status) || hasEventStarted(reservation.event_date, reservation.start_time)) return fail(403, { error: st(locals.locale).serverErrors.eventNoLongerEditable });
		if (!reservation.hall_floorplan_json) return fail(400, { error: st(locals.locale).serverErrors.hallNoFloorPlan });
		const overStock = await tableInventoryError(locals.db, reservation.hall_id, layoutJson, locals.locale);
		if (overStock) return fail(400, { error: overStock });

		await dbRun(locals.db, 'UPDATE reservations SET layout_json = ? WHERE id = ? AND user_id = ? AND org_id = ?',
			layoutJson, params.id, locals.user.id, orgId);
		return { success: true };
	},

	// Apply an org template to this reservation: persist it and hand the parsed layout
	// back so the editor can remount on it without a full reload.
	loadTemplate: async ({ request, locals, params }) => {
		if (!locals.user) return fail(403, { error: st(locals.locale).serverErrors.unauthorized });
		const orgId = locals.domainOrg!.id;
		const data = await request.formData();
		const templateId = String(data.get('templateId') ?? '');
		if (!templateId) return fail(400, { error: st(locals.locale).serverErrors.noTemplateSelected });

		const reservation = await dbFirst<{ status: string; hall_id: string; event_date: string; start_time: string | null }>(locals.db,
			'SELECT status, hall_id, event_date, start_time FROM reservations WHERE id = ? AND user_id = ? AND org_id = ?',
			params.id, locals.user.id, orgId);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.notFound });
		if (!CLIENT_EDITABLE.has(reservation.status) || hasEventStarted(reservation.event_date, reservation.start_time)) return fail(403, { error: st(locals.locale).serverErrors.eventNoLongerEditable });

		// Template must belong to the same hall.
		const tmpl = await dbFirst<{ layout_json: string | null }>(locals.db,
			'SELECT layout_json FROM floorplan_templates WHERE id = ? AND hall_id = ?',
			templateId, reservation.hall_id);
		if (!tmpl?.layout_json) return fail(404, { error: st(locals.locale).serverErrors.templateNotFound });

		await dbRun(locals.db, 'UPDATE reservations SET layout_json = ? WHERE id = ? AND user_id = ? AND org_id = ?',
			tmpl.layout_json, params.id, locals.user.id, orgId);
		return { success: true, layout: fromJson(tmpl.layout_json) };
	}
};
