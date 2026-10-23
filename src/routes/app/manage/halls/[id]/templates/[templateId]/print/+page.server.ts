import { error } from '@sveltejs/kit';
import { dbFirst } from '$lib/db/index';
import { migrateToMultiFloor } from '$lib/floorplan-types';
import { st } from '$lib/i18n-server';
import { requireOrgPermission } from '$lib/server/access';
import type { PageServerLoad } from './$types';

// A template's layout as a printable sheet, for whoever may open the template editor.
export const load: PageServerLoad = async ({ params, locals }) => {
	await requireOrgPermission(locals, 'templates.manage');
	const template = await dbFirst<{ id: string; name: string; layout_json: string | null; hall_name: string }>(locals.db,
		`SELECT ft.id, ft.name, ft.layout_json, h.name AS hall_name
		 FROM floorplan_templates ft JOIN halls h ON h.id = ft.hall_id
		 WHERE ft.id = ? AND ft.hall_id = ? AND h.org_id = ?`,
		params.templateId, params.id, locals.currentOrg!.id);
	if (!template) error(404, st(locals.locale).serverErrors.templateNotFound);
	return {
		hallId: params.id,
		template: { id: template.id, name: template.name, hallName: template.hall_name },
		layout: migrateToMultiFloor(template.layout_json)
	};
};
