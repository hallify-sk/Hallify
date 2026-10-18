import { error, fail } from '@sveltejs/kit';
import { dbFirst, dbAll, dbRun, fromJson } from '$lib/db/index';
import type { TemplateRow, TableTypeRow } from '$lib/db/index';
import { serializeEventTypes } from '$lib/eventTypes';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';
import { requireOrgPermission } from '$lib/server/access';

export const load: PageServerLoad = async ({ locals, params }) => {
	await requireOrgPermission(locals, 'templates.manage');
	const orgId = locals.currentOrg!.id;

	// Template scoped by hall + org (templates belong to halls; halls belong to orgs).
	const template = await dbFirst<TemplateRow & { hall_name: string }>(locals.db,
		`SELECT ft.*, h.name AS hall_name
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

	return {
		hallId: params.id,
		template: { ...template, layout_json: fromJson(template.layout_json as string | null) },
		tableTypes,
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

		if (!(await assertOwned(locals.db, params.templateId, params.id, orgId))) {
			return fail(404, { error: st(locals.locale).serverErrors.templateNotFound });
		}

		await dbRun(locals.db,
			'UPDATE floorplan_templates SET layout_json = ? WHERE id = ? AND hall_id = ?',
			layoutJson, params.templateId, params.id
		);
		return { success: true };
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
