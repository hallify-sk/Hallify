import { error, redirect, fail } from '@sveltejs/kit';
import { dbFirst, dbAll, dbRun, fromJson } from '$lib/db/index';
import type { ReservationRow, TableTypeRow } from '$lib/db/index';
import { buildSeatableLayout } from '$lib/reservationLayout';
import { parseEventTypes } from '$lib/eventTypes';
import { countSeats, migrateToMultiFloor } from '$lib/floorplan-types';
import { applyTemplateKeepingGuests } from '$lib/floorplan-layout';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';
import { seatingDraft, markProposalApplied } from '$lib/server/ai/proposals';
import { tableInventoryError } from '$lib/server/table-inventory';

export const load: PageServerLoad = async ({ locals, params, url }) => {
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

	// ?draft=<proposal>: an AI assistant's seating plan, shown here unsaved.
	const draftId = url.searchParams.get('draft');
	const draft = draftId && locals.currentOrg ? await seatingDraft(locals, locals.currentOrg, draftId, params.id) : null;

	return {
		reservation: {
			...reservation,
			hall_floorplan_json: fromJson(reservation.hall_floorplan_json as string | null),
			layout_json: fromJson(reservation.layout_json as string | null),
		},
		tableTypes,
		templates,
		initialLayout: draft?.built ? draft.built.layout : layout,
		draft: draft ? { id: draft.proposalId, stale: draft.stale } : null,
		// The hall's own zones (the stage, the bar) stay where the hall plan has them.
		hallZoneIds: migrateToMultiFloor(reservation.hall_floorplan_json).floors.flatMap((f) => (f.zones ?? []).map((z) => z.id)),
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
			'SELECT r.user_id, r.status, r.hall_id, h.floorplan_json AS hall_floorplan_json FROM reservations r JOIN halls h ON h.id = r.hall_id WHERE r.id = ? AND r.org_id = ?',
			params.id, orgId
		);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.notFound });
		if (!reservation.hall_floorplan_json) return fail(400, { error: st(locals.locale).serverErrors.hallHasNoFloorPlan });

		const denied = layoutAccessError(locals, reservation);
		if (denied) return fail(403, { error: denied });

		const overStock = await tableInventoryError(locals.db, reservation.hall_id, layoutJson, locals.locale);
		if (overStock) return fail(400, { error: overStock });

		const proposalId = String(data.get('proposalId') ?? '');
		if (proposalId && locals.currentOrg) {
			// Saving an assistant's draft: only onto the seating it was planned on, and the
			// proposal is closed with it so it cannot be applied a second time.
			const draft = await seatingDraft(locals, locals.currentOrg, proposalId, params.id);
			if (!draft?.built) return fail(409, { error: st(locals.locale).ai.draftStale });
			const write = await dbRun(locals.db,
				'UPDATE reservations SET layout_json = ? WHERE id = ? AND org_id = ? AND layout_json IS ?',
				layoutJson, params.id, orgId, draft.built.baseJson);
			if (write.meta.changes !== 1) return fail(409, { error: st(locals.locale).ai.draftStale });
			await markProposalApplied(locals.db, proposalId, { seated: draft.built.seated, savedFromEditor: true });
			return { success: true, draftSaved: true };
		}

		await dbRun(locals.db, 'UPDATE reservations SET layout_json = ? WHERE id = ? AND org_id = ?', layoutJson, params.id, orgId);
		return { success: true };
	},

	// Apply an org template to this reservation: its tables, with the guest list kept
	// (guests whose chair the template also has stay on it). Persisted, and handed back
	// so the editor can remount on it without a full reload.
	loadTemplate: async ({ request, locals, params }) => {
		if (!locals.user) redirect(303, '/app/login');
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });
		const data = await request.formData();
		const templateId = String(data.get('templateId') ?? '');
		if (!templateId) return fail(400, { error: st(locals.locale).serverErrors.noTemplateSelected });

		const reservation = await dbFirst<{ hall_id: string; user_id: string; status: string; layout_json: string | null; hall_floorplan_json: string | null }>(locals.db,
			`SELECT r.hall_id, r.user_id, r.status, r.layout_json, h.floorplan_json AS hall_floorplan_json
			 FROM reservations r JOIN halls h ON h.id = r.hall_id WHERE r.id = ? AND r.org_id = ?`,
			params.id, orgId);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.notFound });
		// The same gate as saving: this overwrites the reservation's seating just as much.
		const denied = layoutAccessError(locals, reservation);
		if (denied) return fail(403, { error: denied });

		const tmpl = await dbFirst<{ layout_json: string | null }>(locals.db,
			'SELECT layout_json FROM floorplan_templates WHERE id = ? AND hall_id = ?',
			templateId, reservation.hall_id);
		if (!tmpl?.layout_json) return fail(404, { error: st(locals.locale).serverErrors.templateNotFound });

		// The editor's current layout (it may hold edits not yet saved), else the stored one.
		const current = parseLayout(String(data.get('currentJson') ?? ''))
			?? (await buildSeatableLayout(locals.db, params.id, reservation.hall_floorplan_json, reservation.layout_json)).layout;
		const applied = applyTemplateKeepingGuests(current, tmpl.layout_json);

		await dbRun(locals.db, 'UPDATE reservations SET layout_json = ? WHERE id = ? AND org_id = ?',
			JSON.stringify(applied.layout), params.id, orgId);
		return { success: true, layout: applied.layout, reseated: applied.reseated, unseated: applied.unseated };
	}
};

/** Same gate as the sibling actions on /app/reservation/[id]: staff may change any
 *  booking's seating in the org; everyone else only their own, and only once it is
 *  live. Returns the refusal, or null. */
function layoutAccessError(locals: App.Locals, reservation: { user_id: string; status: string }): string | null {
	const staff = locals.currentOrg?.role === 'owner' || locals.currentOrg?.role === 'admin';
	if (!staff && reservation.user_id !== locals.user?.id) return st(locals.locale).serverErrors.accessDenied;
	if (!staff && !['approved', 'planned'].includes(reservation.status)) {
		return st(locals.locale).serverErrors.reservationMustBeApprovedToEditLayout;
	}
	return null;
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
