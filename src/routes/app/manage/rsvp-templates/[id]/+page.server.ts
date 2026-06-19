import { error, redirect, fail } from '@sveltejs/kit';
import { dbFirst, dbRun, toJson } from '$lib/db/index';
import type { RsvpTemplateRow } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) redirect(303, '/app/login');

	const template = await dbFirst<RsvpTemplateRow>(locals.db, 'SELECT * FROM rsvp_templates WHERE id = ?', params.id);

	if (!template) error(404, st(locals.locale).serverErrors.templateNotFound);

	return { template };
};

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		if (!locals.user || (locals.currentOrg?.role !== 'owner' && locals.currentOrg?.role !== 'admin')) return fail(403, { error: st(locals.locale).serverErrors.unauthorized });
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const eventType = String(data.get('event_type') ?? '').trim() || null;
		const configStr = String(data.get('config') ?? '{}');

		if (!name) return fail(400, { error: st(locals.locale).serverErrors.nameRequired });

		let configObj;
		try {
			configObj = JSON.parse(configStr);
		} catch {
			return fail(400, { error: st(locals.locale).serverErrors.invalidConfigJson });
		}

		await dbRun(locals.db,
			'UPDATE rsvp_templates SET name = ?, event_type = ?, config = ? WHERE id = ?',
			name, eventType, toJson(configObj), params.id
		);

		return { success: true };
	}
};
