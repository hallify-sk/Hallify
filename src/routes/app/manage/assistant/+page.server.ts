import { fail } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { requireOrgPermission } from '$lib/server/access';
import { getAccount, setEnabled, allowanceCredits, MIN_TURN_MC } from '$lib/server/ai/credits';
import { loadAiPlatform } from '$lib/server/ai/pricing';
import { aiConfigured } from '$lib/server/ai/openai';
import { loadThreadMessages, questionCostMc } from '$lib/server/ai/agent';
import { memberCan } from '$lib/server/ai/tools';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const org = await requireOrgPermission(locals, 'ai.use');
	const userId = locals.user!.id;
	const account = await getAccount(locals.db, org);
	const platform = await loadAiPlatform(locals.db);

	const threads = await dbAll<{ id: string; title: string | null; updated_at: string }>(locals.db,
		`SELECT id, title, updated_at FROM ai_threads WHERE org_id = ? AND user_id = ?
		  ORDER BY updated_at DESC LIMIT 40`,
		org.id, userId);

	const requested = url.searchParams.get('t');
	const current = requested && threads.some((t) => t.id === requested) ? requested : null;

	return {
		enabled: !!account.enabled,
		available: platform.enabled && aiConfigured(),
		canEnable: await memberCan(locals, 'settings.manage'),
		balanceMc: account.balance_mc,
		// Too little left for the assistant to start an answer: said before anyone types.
		outOfCredits: account.balance_mc < MIN_TURN_MC,
		// What an ordinary question costs, said before anyone spends anything.
		questionMc: await questionCostMc(locals),
		allowance: allowanceCredits(org, account.allowance_override),
		periodEnd: account.period_end,
		threads,
		threadId: current,
		messages: current ? await loadThreadMessages(locals.db, current) : []
	};
};

export const actions: Actions = {
	/** Switching the assistant on is a decision about sending data to OpenAI, so it
	 *  belongs to whoever manages the organisation's settings, and is recorded. */
	enable: async ({ locals }) => {
		const org = await requireOrgPermission(locals, 'settings.manage');
		if (org.impersonated) return fail(403, { error: 'impersonated' });
		await setEnabled(locals.db, org.id, true, locals.user!.id);
		return { enabled: true };
	},

	deleteThread: async ({ request, locals }) => {
		const org = await requireOrgPermission(locals, 'ai.use');
		const id = String((await request.formData()).get('id') ?? '');
		const t = await dbFirst<{ id: string }>(locals.db,
			'SELECT id FROM ai_threads WHERE id = ? AND org_id = ? AND user_id = ?', id, org.id, locals.user!.id);
		if (!t) return fail(404, { error: 'not_found' });
		await dbRun(locals.db, 'DELETE FROM ai_threads WHERE id = ?', id);
		return { deleted: true };
	}
};
