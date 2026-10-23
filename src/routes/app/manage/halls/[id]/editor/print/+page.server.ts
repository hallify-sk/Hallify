import { error } from '@sveltejs/kit';
import { dbFirst } from '$lib/db/index';
import { migrateToMultiFloor } from '$lib/floorplan-types';
import { st } from '$lib/i18n-server';
import { requireOrgPermission } from '$lib/server/access';
import type { PageServerLoad } from './$types';

// The hall's floor plan as a printable sheet, for whoever may open the editor.
export const load: PageServerLoad = async ({ params, locals }) => {
	await requireOrgPermission(locals, 'floorplans.manage');
	const hall = await dbFirst<{ id: string; name: string; floorplan_json: string | null }>(locals.db,
		'SELECT id, name, floorplan_json FROM halls WHERE id = ? AND org_id = ?', params.id, locals.currentOrg!.id);
	if (!hall) error(404, st(locals.locale).serverErrors.hallNotFound);
	return { hall: { id: hall.id, name: hall.name }, layout: migrateToMultiFloor(hall.floorplan_json) };
};
