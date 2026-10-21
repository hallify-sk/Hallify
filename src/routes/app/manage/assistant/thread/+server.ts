import { json } from '@sveltejs/kit';
import { dbFirst } from '$lib/db/index';
import { requireOrgPermission } from '$lib/server/access';
import { getAccount } from '$lib/server/ai/credits';
import { loadThreadMessages } from '$lib/server/ai/agent';
import type { RequestHandler } from './$types';

/** A conversation for the floating widget, which has no page load of its own. */
export const GET: RequestHandler = async ({ url, locals }) => {
	const org = await requireOrgPermission(locals, 'ai.use');
	const account = await getAccount(locals.db, org);
	const id = url.searchParams.get('t');
	const thread = id
		? await dbFirst<{ id: string }>(locals.db,
			'SELECT id FROM ai_threads WHERE id = ? AND org_id = ? AND user_id = ?', id, org.id, locals.user!.id)
		: null;
	return json({
		ok: true,
		threadId: thread?.id ?? null,
		messages: thread ? await loadThreadMessages(locals.db, thread.id) : [],
		balanceMc: account.balance_mc
	});
};
