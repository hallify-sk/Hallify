import { error, redirect, fail } from '@sveltejs/kit';
import sql from '$lib/db/index';
import type { RsvpTemplateRow } from '$lib/db/index';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) redirect(303, '/app/login');

	const [template] = await sql<RsvpTemplateRow[]>`
		SELECT * FROM rsvp_templates WHERE id = ${params.id}
	`;

	if (!template) error(404, 'Template not found');

	return { template };
};

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		if (!locals.user || locals.user.role !== 'admin') return fail(403, { error: 'Unauthorized' });
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const eventType = String(data.get('event_type') ?? '').trim() || null;
		const configStr = String(data.get('config') ?? '{}');

		if (!name) return fail(400, { error: 'Name is required.' });

		let configObj;
		try {
			configObj = JSON.parse(configStr);
		} catch {
			return fail(400, { error: 'Invalid config JSON' });
		}

		await sql`
			UPDATE rsvp_templates
			SET name = ${name}, event_type = ${eventType}, config = ${sql.json(configObj)}
			WHERE id = ${params.id}
		`;

		return { success: true };
	}
};
