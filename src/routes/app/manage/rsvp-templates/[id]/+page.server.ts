import { error, redirect, fail } from '@sveltejs/kit';
import { dbFirst, dbRun, toJson } from '$lib/db/index';
import type { RsvpTemplateRow } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';
import { RSVP_ENABLED } from '$lib/features';
import { requireOrgPermission } from '$lib/server/access';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!RSVP_ENABLED) error(404, 'Not found');
	if (!locals.user) redirect(303, '/app/login');
	const orgId = (await requireOrgPermission(locals, 'templates.manage')).id;

	// `AND org_id = ?` is not optional: scoping is not authorization, but without it
	// authorization is not scoping either — holding templates.manage in org A would
	// otherwise read org B's template by id.
	const template = await dbFirst<RsvpTemplateRow>(locals.db, 'SELECT * FROM rsvp_templates WHERE id = ? AND org_id = ?', params.id, orgId);

	if (!template) error(404, st(locals.locale).serverErrors.templateNotFound);

	return { template };
};

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
	  const org = await requireOrgPermission(locals, 'templates.manage');
		if (!RSVP_ENABLED) error(404, 'Not found');
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
			'UPDATE rsvp_templates SET name = ?, event_type = ?, config = ? WHERE id = ? AND org_id = ?',
			name, eventType, toJson(configObj), params.id, org.id
		);

		return { success: true };
	}
};
