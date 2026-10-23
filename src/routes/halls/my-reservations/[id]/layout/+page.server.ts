import { error, redirect, fail } from '@sveltejs/kit';
import { loginUrl } from '$lib/login-redirect';
import { dbFirst, dbAll, dbRun } from '$lib/db/index';
import type { ReservationRow, TableTypeRow } from '$lib/db/index';
import { buildSeatableLayout } from '$lib/reservationLayout';
import { parseEventTypes } from '$lib/eventTypes';
import { countSeats, migrateToMultiFloor } from '$lib/floorplan-types';
import { applyTemplateKeepingGuests, arrangementKey } from '$lib/floorplan-layout';
import { st } from '$lib/i18n-server';
import { hasEventStarted } from '$lib/reservationStatus';
import { tableInventoryError } from '$lib/server/table-inventory';
import type { Actions, PageServerLoad } from './$types';

// The booking client may edit the seating layout once the event is approved — but only
// until the event starts.
const CLIENT_EDITABLE = new Set(['approved', 'planned']);

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) redirect(303, loginUrl(url, '/login'));
	const orgId = locals.domainOrg!.id;

	const reservation = await dbFirst<ReservationRow & { hall_floorplan_json: unknown; hall_name: string; hall_custom_layouts: number; hall_force_layouts: number }>(locals.db,
		`SELECT r.*, h.name AS hall_name, h.floorplan_json AS hall_floorplan_json,
		        h.custom_layouts AS hall_custom_layouts, h.force_layouts AS hall_force_layouts
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
		// The hall's own zones (the stage, the bar) stay where the venue drew them.
		hallZoneIds: hallZoneIds(reservation.hall_floorplan_json),
		tablesLocked: tablesLocked(reservation),
	};
};

/**
 * Whether the client may only seat guests, not arrange the tables. The hall's
 * "Vlastné rozloženia" (clients may arrange their own tables) off, or "Vynútiť
 * rozloženia" (a preset layout without modifications) on. Picking another of the
 * venue's templates is still allowed: that is choosing a preset, not changing one.
 */
function tablesLocked(hall: { hall_custom_layouts: number | null; hall_force_layouts: number | null }): boolean {
	return !hall.hall_custom_layouts || !!hall.hall_force_layouts;
}

export const actions: Actions = {
	saveLayout: async ({ request, locals, params }) => {
		if (!locals.user) return fail(403, { error: st(locals.locale).serverErrors.unauthorized });
		const orgId = locals.domainOrg!.id;
		const data = await request.formData();
		const layoutJson = String(data.get('layoutJson') ?? '');
		if (!layoutJson) return fail(400, { error: st(locals.locale).serverErrors.noLayoutData });

		const reservation = await dbFirst<ClientLayoutRow>(locals.db,
			`SELECT r.status, r.hall_id, r.event_date, r.start_time, r.layout_json, h.floorplan_json AS hall_floorplan_json,
			        h.custom_layouts AS hall_custom_layouts, h.force_layouts AS hall_force_layouts
			 FROM reservations r JOIN halls h ON h.id = r.hall_id WHERE r.id = ? AND r.user_id = ? AND r.org_id = ?`,
			params.id, locals.user.id, orgId
		);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.notFound });
		if (!CLIENT_EDITABLE.has(reservation.status) || hasEventStarted(reservation.event_date, reservation.start_time)) return fail(403, { error: st(locals.locale).serverErrors.eventNoLongerEditable });
		if (!reservation.hall_floorplan_json) return fail(400, { error: st(locals.locale).serverErrors.hallNoFloorPlan });

		// A hall that does not let clients arrange tables: only the seating may change.
		if (tablesLocked(reservation)) {
			const { layout: base } = await buildSeatableLayout(locals.db, params.id, reservation.hall_floorplan_json, reservation.layout_json);
			let posted: unknown;
			try { posted = JSON.parse(layoutJson); } catch { return fail(400, { error: st(locals.locale).serverErrors.noLayoutData }); }
			if (arrangementKey(posted) !== arrangementKey(base)) return fail(403, { error: st(locals.locale).serverErrors.layoutLockedByVenue });
		}

		const overStock = await tableInventoryError(locals.db, reservation.hall_id, layoutJson, locals.locale);
		if (overStock) return fail(400, { error: overStock });

		await dbRun(locals.db, 'UPDATE reservations SET layout_json = ? WHERE id = ? AND user_id = ? AND org_id = ?',
			layoutJson, params.id, locals.user.id, orgId);
		return { success: true };
	},

	// Apply an org template to this reservation: its tables, with the guest list kept
	// (guests whose chair the template also has stay on it). Persisted, and handed back
	// so the editor can remount on it without a full reload.
	loadTemplate: async ({ request, locals, params }) => {
		if (!locals.user) return fail(403, { error: st(locals.locale).serverErrors.unauthorized });
		const orgId = locals.domainOrg!.id;
		const data = await request.formData();
		const templateId = String(data.get('templateId') ?? '');
		if (!templateId) return fail(400, { error: st(locals.locale).serverErrors.noTemplateSelected });

		const reservation = await dbFirst<ClientLayoutRow>(locals.db,
			`SELECT r.status, r.hall_id, r.event_date, r.start_time, r.layout_json, h.floorplan_json AS hall_floorplan_json,
			        h.custom_layouts AS hall_custom_layouts, h.force_layouts AS hall_force_layouts
			 FROM reservations r JOIN halls h ON h.id = r.hall_id WHERE r.id = ? AND r.user_id = ? AND r.org_id = ?`,
			params.id, locals.user.id, orgId);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.notFound });
		if (!CLIENT_EDITABLE.has(reservation.status) || hasEventStarted(reservation.event_date, reservation.start_time)) return fail(403, { error: st(locals.locale).serverErrors.eventNoLongerEditable });

		// Template must belong to the same hall.
		const tmpl = await dbFirst<{ layout_json: string | null }>(locals.db,
			'SELECT layout_json FROM floorplan_templates WHERE id = ? AND hall_id = ?',
			templateId, reservation.hall_id);
		if (!tmpl?.layout_json) return fail(404, { error: st(locals.locale).serverErrors.templateNotFound });

		// The editor's current layout (it may hold edits not yet saved), else the stored
		// one. With the tables locked, only its guests and seating are taken from it.
		const posted = parseLayout(String(data.get('currentJson') ?? ''));
		const current = posted && !tablesLocked(reservation)
			? posted
			: await withPostedSeating(reservation, params.id, posted, locals.db);
		const applied = applyTemplateKeepingGuests(current, tmpl.layout_json);

		await dbRun(locals.db, 'UPDATE reservations SET layout_json = ? WHERE id = ? AND user_id = ? AND org_id = ?',
			JSON.stringify(applied.layout), params.id, locals.user.id, orgId);
		return { success: true, layout: applied.layout, reseated: applied.reseated, unseated: applied.unseated };
	}
};

interface ClientLayoutRow {
	status: string; hall_id: string; event_date: string; start_time: string | null; layout_json: string | null;
	hall_floorplan_json: string | null; hall_custom_layouts: number | null; hall_force_layouts: number | null;
}

/** The stored layout, with the guest list and seating the editor posted when it
 *  describes the same furniture (it may hold seating not yet saved). */
async function withPostedSeating(reservation: ClientLayoutRow, id: string, posted: unknown, db: App.Locals['db']): Promise<unknown> {
	const { layout } = await buildSeatableLayout(db, id, reservation.hall_floorplan_json, reservation.layout_json);
	return posted && arrangementKey(posted) === arrangementKey(layout) ? posted : layout;
}

/** A layout posted by the editor, or null when it is not one. */
function parseLayout(raw: string): unknown {
	if (!raw) return null;
	try {
		const v = JSON.parse(raw);
		return v && typeof v === 'object' && Array.isArray(v.floors) ? v : null;
	} catch {
		return null;
	}
}

/** The ids of the zones on the hall's own floor plan. */
function hallZoneIds(raw: unknown): string[] {
	return migrateToMultiFloor(raw).floors.flatMap((f) => (f.zones ?? []).map((z) => z.id));
}
