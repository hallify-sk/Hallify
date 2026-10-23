import { redirect } from '@sveltejs/kit';
import { loginUrl } from '$lib/login-redirect';
import { listAnnouncementsForOrg, markAnnouncementsRead } from '$lib/announcements';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, loginUrl(url));
	const orgId = locals.currentOrg?.id;
	const isStaff = locals.currentOrg?.role === 'owner' || locals.currentOrg?.role === 'admin';
	if (!orgId || !isStaff) redirect(303, '/app');

	const announcements = await listAnnouncementsForOrg(locals.db, locals.user.id, orgId);
	// Opening the page clears the ping.
	await markAnnouncementsRead(locals.db, locals.user.id, orgId);

	return { announcements };
};
