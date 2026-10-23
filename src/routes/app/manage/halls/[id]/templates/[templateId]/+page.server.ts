import { error, fail } from '@sveltejs/kit';
import { dbFirst, dbAll, dbRun, fromJson } from '$lib/db/index';
import type { TemplateRow, TableTypeRow } from '$lib/db/index';
import { serializeEventTypes } from '$lib/eventTypes';
import { migrateToMultiFloor } from '$lib/floorplan-types';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';
import { requireOrgPermission } from '$lib/server/access';
import { tableInventoryError } from '$lib/server/table-inventory';
import { prepareLayoutSave } from '$lib/server/layout-sync';
import { applyHallGeometry, hasLayout, layoutProblems, problemsColumn } from '$lib/floorplan-sync';

export const load: PageServerLoad = async ({ locals, params }) => {
	await requireOrgPermission(locals, 'templates.manage');
	const orgId = locals.currentOrg!.id;

	// Template scoped by hall + org (templates belong to halls; halls belong to orgs).
	const template = await dbFirst<TemplateRow & { hall_name: string; hall_floorplan_json: string | null }>(locals.db,
		`SELECT ft.*, h.name AS hall_name, h.floorplan_json AS hall_floorplan_json
		 FROM floorplan_templates ft
		 JOIN halls h ON h.id = ft.hall_id
		 WHERE ft.id = ? AND ft.hall_id = ? AND h.org_id = ?`,
		params.templateId, params.id, orgId
	);
	if (!template) error(404, st(locals.locale).serverErrors.templateNotFound);

	const tableTypes = await dbAll<TableTypeRow>(locals.db,
		'SELECT * FROM table_types WHERE hall_id = ? ORDER BY name',
		params.id
	);

	const { hall_floorplan_json, ...row } = template;
	// A template stands on the hall's current room, whatever room it was saved on.
	let layout: unknown = fromJson(row.layout_json as string | null);
	if (hall_floorplan_json && hasLayout(row.layout_json)) {
		layout = applyHallGeometry(row.layout_json, hall_floorplan_json);
		// The stored flag follows what is there now (a template saved before its
		// hall's plan was last checked, or fixed since).
		const column = problemsColumn(layoutProblems(layout, hall_floorplan_json));
		if (column !== ((row as { layout_problems?: string | null }).layout_problems ?? null)) {
			try {
				await dbRun(locals.db, 'UPDATE floorplan_templates SET layout_problems = ? WHERE id = ?', column, row.id);
			} catch { /* before migration 0032 */ }
		}
	}
	return {
		hallId: params.id,
		template: { ...row, layout_json: layout },
		tableTypes,
		// The hall's plan, to measure the template against while it is edited.
		hallPlan: fromJson(hall_floorplan_json),
		// The hall's own zones (the stage, the bar) stay where the hall plan has them.
		hallZoneIds: migrateToMultiFloor(hall_floorplan_json).floors.flatMap((f) => (f.zones ?? []).map((z) => z.id)),
	};
};

// Confirm the template belongs to a hall in the caller's org before any write.
async function assertOwned(db: App.Locals['db'], templateId: string, hallId: string, orgId: string) {
	return dbFirst<{ id: string }>(db,
		`SELECT ft.id FROM floorplan_templates ft
		 JOIN halls h ON h.id = ft.hall_id
		 WHERE ft.id = ? AND ft.hall_id = ? AND h.org_id = ?`,
		templateId, hallId, orgId
	);
}

export const actions: Actions = {
	saveLayout: async ({ request, locals, params }) => {
		await requireOrgPermission(locals, 'templates.manage');
		const orgId = locals.currentOrg!.id;
		const data = await request.formData();
		const layoutJson = String(data.get('layoutJson') ?? '');
		if (!layoutJson) return fail(400, { error: st(locals.locale).serverErrors.noLayoutData });

		const owned = await dbFirst<{ id: string; hall_json: string | null }>(locals.db,
			`SELECT ft.id, h.floorplan_json AS hall_json FROM floorplan_templates ft
			 JOIN halls h ON h.id = ft.hall_id
			 WHERE ft.id = ? AND ft.hall_id = ? AND h.org_id = ?`,
			params.templateId, params.id, orgId);
		if (!owned) return fail(404, { error: st(locals.locale).serverErrors.templateNotFound });
		const overStock = await tableInventoryError(locals.db, params.id, layoutJson, locals.locale);
		if (overStock) return fail(400, { error: overStock });

		// On the hall's current room (an editor opened before the hall's plan changed
		// would put the old walls back), with what is still wrong stored alongside:
		// saving a fixed template clears its flag.
		const save = prepareLayoutSave(layoutJson, owned.hall_json);
		await dbRun(locals.db,
			'UPDATE floorplan_templates SET layout_json = ?, layout_problems = ? WHERE id = ? AND hall_id = ?',
			save.json, save.column, params.templateId, params.id
		);
		return { success: true, problems: save.problems.length, ...(save.roomChanged ? { layout: JSON.parse(save.json) } : {}) };
	},

	// Edit the template's name + event types (the layout is saved separately).
	updateMeta: async ({ request, locals, params }) => {
		await requireOrgPermission(locals, 'templates.manage');
		const orgId = locals.currentOrg!.id;
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const eventTypes = serializeEventTypes(data.getAll('eventTypes').map(String));
		if (!name) return fail(400, { metaError: st(locals.locale).serverErrors.nameRequired });

		if (!(await assertOwned(locals.db, params.templateId, params.id, orgId))) {
			return fail(404, { metaError: st(locals.locale).serverErrors.templateNotFound });
		}

		await dbRun(locals.db,
			'UPDATE floorplan_templates SET name = ?, event_type = ? WHERE id = ? AND hall_id = ?',
			name, eventTypes, params.templateId, params.id
		);
		return { metaSaved: true };
	}
};
