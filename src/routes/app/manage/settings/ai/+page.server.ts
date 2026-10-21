import { fail, redirect } from '@sveltejs/kit';
import { dbFirst } from '$lib/db/index';
import { requireOrgPermission } from '$lib/server/access';
import { getAccount, setEnabled, allowanceCredits, recentLedger, spentThisPeriod, MC } from '$lib/server/ai/credits';
import { memberCan } from '$lib/server/ai/tools';
import { AI_CREDIT_PACKS, createAiTopupSession } from '$lib/stripe';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const org = await requireOrgPermission(locals, 'settings.manage');
	const account = await getAccount(locals.db, org);
	const enabledBy = account.enabled_by
		? await dbFirst<{ name: string }>(locals.db,
			"SELECT TRIM(first_name || ' ' || last_name) AS name FROM users WHERE id = ?", account.enabled_by)
		: null;

	return {
		enabled: !!account.enabled,
		enabledBy: enabledBy?.name ?? null,
		enabledAt: account.enabled_at,
		balanceMc: account.balance_mc,
		purchasedMc: Math.min(account.purchased_mc, Math.max(0, account.balance_mc)),
		allowance: allowanceCredits(org, account.allowance_override),
		periodEnd: account.period_end,
		spentMc: await spentThisPeriod(locals.db, account),
		ledger: await recentLedger(locals.db, org.id),
		canBuy: await memberCan(locals, 'billing.manage'),
		packs: [...AI_CREDIT_PACKS],
		topupDone: url.searchParams.get('topup') === '1',
		mc: MC
	};
};

export const actions: Actions = {
	toggle: async ({ request, locals }) => {
		const org = await requireOrgPermission(locals, 'settings.manage');
		if (org.impersonated) return fail(403, { error: 'impersonated' });
		const on = (await request.formData()).get('enabled') === 'on';
		await setEnabled(locals.db, org.id, on, locals.user!.id);
		return { saved: true };
	},

	buy: async ({ request, locals }) => {
		const org = await requireOrgPermission(locals, 'billing.manage');
		if (org.impersonated) return fail(403, { error: 'impersonated' });
		const credits = Number((await request.formData()).get('credits'));
		if (!(AI_CREDIT_PACKS as readonly number[]).includes(credits)) return fail(400, { error: 'bad_pack' });
		const checkoutUrl = await createAiTopupSession({
			orgId: org.id,
			userId: locals.user!.id,
			credits,
			stripeCustomerId: org.subscription.stripeCustomerId,
			userEmail: locals.user!.email
		});
		redirect(303, checkoutUrl);
	}
};
