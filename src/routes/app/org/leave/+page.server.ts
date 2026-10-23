import { redirect, fail } from '@sveltejs/kit';
import { st } from '$lib/i18n-server';
import { leaveOrganization } from '$lib/orgLifecycle';
import { leaveRefusalMessage } from '$lib/server/settings-access';
import type { PageServerLoad, Actions } from './$types';

/**
 * Leave the current organisation, for any member.
 *
 * Settings → Advanced has the same button, but a plain member holding no console
 * permission never reaches /app/manage, so leaving needs a page of its own.
 */
export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/app/login');
	const org = locals.currentOrg;
	if (!org) redirect(303, '/app/');
	return { orgName: org.name, isOwner: org.role === 'owner', impersonated: !!org.impersonated };
};

export const actions: Actions = {
	default: async ({ locals }) => {
		if (!locals.user) redirect(303, '/app/login');
		const org = locals.currentOrg;
		if (!org) redirect(303, '/app/');
		if (org.impersonated) return fail(403, { error: st(locals.locale).serverErrors.impersonationBlockThisOrg });
		const refused = await leaveOrganization(locals.db, org.id, locals.user.id);
		if (refused) return fail(400, { error: leaveRefusalMessage(refused, locals.locale) });
		redirect(303, '/app/');
	},
};
