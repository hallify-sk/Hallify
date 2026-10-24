import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { loginUrl } from '$lib/login-redirect';
import { st } from '$lib/i18n-server';
import { publicMcpUrl } from '$lib/server/mcp/http';
import { listUserConnections, revokeUserConnection } from '$lib/server/mcp/connections';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, loginUrl(url));
	if (locals.user.account_type === 'client') redirect(303, '/app/profile');
	return {
		serverUrl: publicMcpUrl(url, env.HALLIFY_DOMAIN ?? 'hallify.app', env.APP_URL),
		connections: await listUserConnections(locals.db, locals.user.id)
	};
};

export const actions: Actions = {
	revoke: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const id = String((await request.formData()).get('id') ?? '');
		if (!(await revokeUserConnection(locals.db, locals.user.id, id))) {
			return fail(404, { error: st(locals.locale).mcp.notFound });
		}
		return { revoked: true };
	}
};
