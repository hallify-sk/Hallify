import { json } from '@sveltejs/kit';
import { dbFirst } from '$lib/db/index';
import { requireOrgPermission } from '$lib/server/access';
import { requireAssistant } from '$lib/server/ai/availability';
import { getAccount, MIN_TURN_MC } from '$lib/server/ai/credits';
import { loadThreadMessages, questionCostMc } from '$lib/server/ai/agent';
import { memberCan } from '$lib/server/ai/tools';
import type { RequestHandler } from './$types';

/** A conversation for the floating widget, which has no page load of its own. */
export const GET: RequestHandler = async ({ url, locals }) => {
	const org = await requireOrgPermission(locals, 'ai.use');
	// Off on the platform or for the organisation: no assistant to talk to.
	await requireAssistant(locals);
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
		balanceMc: account.balance_mc,
		outOfCredits: account.balance_mc < MIN_TURN_MC,
		// Who can act on "out of credits": the AI settings page is theirs.
		canManageCredits: await memberCan(locals, 'settings.manage'),
		questionMc: await questionCostMc(locals)
	});
};
