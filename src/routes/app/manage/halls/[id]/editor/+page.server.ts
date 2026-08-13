import { error, fail } from '@sveltejs/kit';
import { dbFirst, dbAll, dbRun } from '$lib/db/index';
import type { HallRow, TableTypeRow } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';
import { requireOrgStaff } from '$lib/guards';

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = locals.currentOrg!.id;
	const hall = await dbFirst<HallRow>(locals.db, 'SELECT * FROM halls WHERE id = ? AND org_id = ?', params.id, orgId);
	if (!hall) error(404, st(locals.locale).serverErrors.hallNotFound);

	const tableTypes = await dbAll<TableTypeRow>(
		locals.db,
		'SELECT * FROM table_types WHERE hall_id = ? ORDER BY name',
		params.id
	);

	return { hall, tableTypes };
};

export const actions: Actions = {
	saveFloorplan: async ({ request, params, locals }) => {
	  requireOrgStaff(locals);
		const orgId = locals.currentOrg!.id;
		const data = await request.formData();
		const floorplanJson = String(data.get('floorplanJson') ?? '');
		if (!floorplanJson) return fail(400, { error: st(locals.locale).serverErrors.noData });
		await dbRun(locals.db, 'UPDATE halls SET floorplan_json=? WHERE id=? AND org_id=?', floorplanJson, params.id, orgId);
		return { success: true };
	}
};
