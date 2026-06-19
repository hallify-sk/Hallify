import { error, redirect, fail } from '@sveltejs/kit';
import { dbFirst, dbAll, dbRun, fromJson } from '$lib/db/index';
import type { ReservationRow, TableTypeRow } from '$lib/db/index';
import { buildSeatableLayout } from '$lib/reservationLayout';
import { parseEventTypes } from '$lib/eventTypes';
import { countSeats } from '$lib/floorplan-types';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) redirect(303, '/app/login');
	const orgId = locals.currentOrg?.id;
	if (!orgId) error(403, st(locals.locale).serverErrors.accessDenied);

	const reservation = await dbFirst<ReservationRow & { hall_floorplan_json: unknown }>(locals.db,
		`SELECT r.*, h.name AS hall_name, h.floorplan_json AS hall_floorplan_json
		FROM reservations r
		JOIN halls h ON h.id = r.hall_id
		WHERE r.id = ? AND r.org_id = ?`,
		params.id, orgId
	);

	if (!reservation) error(404, st(locals.locale).serverErrors.reservationNotFound);

	// The table layout is built on the hall's floor plan — without one there is
	// nothing to arrange tables on, so send them back to the detail page.
	if (!reservation.hall_floorplan_json) redirect(303, `/app/reservation/${params.id}`);

	const tableTypes = await dbAll<TableTypeRow>(locals.db,
		'SELECT * FROM table_types WHERE hall_id = ? ORDER BY name',
		reservation.hall_id
	);

	const templatesRaw = await dbAll<{ id: string; name: string; event_type: string | null; layout_json: string | null }>(locals.db,
		'SELECT id, name, event_type, layout_json FROM floorplan_templates WHERE hall_id = ? ORDER BY name',
		reservation.hall_id
	);
	const templates = templatesRaw.map(tm => ({
		id: tm.id, name: tm.name,
		eventTypes: parseEventTypes(tm.event_type),
		seats: countSeats(tm.layout_json),
	}));

	const { layout } = await buildSeatableLayout(locals.db, params.id, reservation.hall_floorplan_json, reservation.layout_json);

	return {
		reservation: {
			...reservation,
			hall_floorplan_json: fromJson(reservation.hall_floorplan_json as string | null),
			layout_json: fromJson(reservation.layout_json as string | null),
		},
		tableTypes,
		templates,
		initialLayout: layout,
	};
};

export const actions: Actions = {
	saveLayout: async ({ request, locals, params }) => {
		if (!locals.user) redirect(303, '/app/login');
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });
		const data = await request.formData();
		const layoutJson = String(data.get('layoutJson') ?? '');
		if (!layoutJson) return fail(400, { error: st(locals.locale).serverErrors.noLayoutData });

		const reservation = await dbFirst<ReservationRow & { hall_floorplan_json: unknown }>(locals.db,
			'SELECT r.user_id, h.floorplan_json AS hall_floorplan_json FROM reservations r JOIN halls h ON h.id = r.hall_id WHERE r.id = ? AND r.org_id = ?',
			params.id, orgId
		);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.notFound });
		if (!reservation.hall_floorplan_json) return fail(400, { error: st(locals.locale).serverErrors.hallHasNoFloorPlan });

		await dbRun(locals.db, 'UPDATE reservations SET layout_json = ? WHERE id = ? AND org_id = ?', layoutJson, params.id, orgId);
		return { success: true };
	},

	// Apply an org template to this reservation: persist it and hand the parsed layout
	// back so the editor can remount on it without a full reload.
	loadTemplate: async ({ request, locals, params }) => {
		if (!locals.user) redirect(303, '/app/login');
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });
		const data = await request.formData();
		const templateId = String(data.get('templateId') ?? '');
		if (!templateId) return fail(400, { error: st(locals.locale).serverErrors.noTemplateSelected });

		const reservation = await dbFirst<{ hall_id: string }>(locals.db,
			'SELECT hall_id FROM reservations WHERE id = ? AND org_id = ?', params.id, orgId);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.notFound });

		const tmpl = await dbFirst<{ layout_json: string | null }>(locals.db,
			'SELECT layout_json FROM floorplan_templates WHERE id = ? AND hall_id = ?',
			templateId, reservation.hall_id);
		if (!tmpl?.layout_json) return fail(404, { error: st(locals.locale).serverErrors.templateNotFound });

		await dbRun(locals.db, 'UPDATE reservations SET layout_json = ? WHERE id = ? AND org_id = ?',
			tmpl.layout_json, params.id, orgId);
		return { success: true, layout: fromJson(tmpl.layout_json) };
	}
};
