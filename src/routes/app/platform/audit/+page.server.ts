import { requirePlatformAdmin } from '$lib/guards';
import { listAudit } from '$lib/server/platform-audit';
import type { PageServerLoad } from './$types';

/** Everything platform admins did: grants, plan overrides, suspensions, View as,
 *  credit changes, announcements and settings. Optionally narrowed by action. */
export const load: PageServerLoad = async ({ locals, url }) => {
	requirePlatformAdmin(locals);
	const action = (url.searchParams.get('action') ?? '').trim().slice(0, 40);
	const rows = await listAudit(locals.db, { action: action || undefined, limit: 300 });
	return { rows, action };
};
