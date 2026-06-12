import { error, fail } from '@sveltejs/kit';
import sql from '$lib/db/index';
import type { HallRow, TableTypeRow } from '$lib/db/index';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const [hall] = await sql<HallRow[]>`SELECT * FROM halls WHERE id = ${params.id}`;
	if (!hall) error(404, 'Hall not found');

	const tableTypes = await sql<TableTypeRow[]>`
		SELECT * FROM table_types WHERE hall_id = ${params.id} ORDER BY name
	`;

	return { hall, tableTypes };
};

export const actions: Actions = {
	saveFloorplan: async ({ request, params }) => {
		const data = await request.formData();
		const floorplanJson = String(data.get('floorplanJson') ?? '');
		if (!floorplanJson) return fail(400, { error: 'No data.' });
		await sql`UPDATE halls SET floorplan_json=${floorplanJson}::jsonb WHERE id=${params.id}`;
		return { success: true };
	},

	saveTemplate: async ({ request, params }) => {
		const data = await request.formData();
		const name = String(data.get('templateName') ?? '').trim();
		const eventType = String(data.get('eventType') ?? '').trim();
		const layoutJson = String(data.get('layoutJson') ?? '');
		if (!name || !layoutJson) return fail(400, { templateError: 'Name and layout are required.' });
		await sql`
			INSERT INTO floorplan_templates (hall_id, name, event_type, layout_json)
			VALUES (${params.id}, ${name}, ${eventType||null}, ${layoutJson}::jsonb)
		`;
		return { templateSuccess: true };
	}
};
