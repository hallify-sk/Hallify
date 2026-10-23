import { fail, redirect } from '@sveltejs/kit';
import { dbFirst } from '$lib/db/index';
import { requireOrgPermission } from '$lib/server/access';
import { getAccount, setEnabled, allowanceCredits, ledgerActivity, spentThisPeriod, MC } from '$lib/server/ai/credits';
import { memberCan } from '$lib/server/ai/tools';
import { AI_CREDIT_PACKS, createAiTopupSession, getCheckoutSession } from '$lib/stripe';
import { applyCreditPurchase } from '$lib/server/stripe-sync';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const org = await requireOrgPermission(locals, 'settings.manage');

	// Back from Checkout: Stripe put the session id in the URL. Confirm it with Stripe
	// and credit a paid pack right away (once per session; the webhook may be later).
	// The page used to say "payment received" for any ?topup=1, paid or not.
	let topup: 'paid' | 'pending' | null = null;
	const topupId = url.searchParams.get('topup');
	if (topupId && topupId !== '1') {
		const session = await getCheckoutSession(topupId);
		if (session && session.metadata?.orgId === org.id && session.metadata?.kind === 'ai_credits') {
			await applyCreditPurchase(locals.db, session).catch((err) => console.error('[ai] top-up credit failed', err));
			topup = session.payment_status === 'paid' ? 'paid' : 'pending';
		}
	}

	const account = await getAccount(locals.db, org);
	const enabledBy = account.enabled_by
		? await dbFirst<{ name: string }>(locals.db,
			"SELECT TRIM(first_name || ' ' || last_name) AS name FROM users WHERE id = ?", account.enabled_by)
		: null;
	const history = url.searchParams.get('history') === '1';

	return {
		enabled: !!account.enabled,
		enabledBy: enabledBy?.name ?? null,
		enabledAt: account.enabled_at,
		balanceMc: account.balance_mc,
		purchasedMc: Math.min(account.purchased_mc, Math.max(0, account.balance_mc)),
		allowance: allowanceCredits(org, account.allowance_override),
		periodEnd: account.period_end,
		spentMc: await spentThisPeriod(locals.db, account),
		ledger: await ledgerActivity(locals.db, org.id, { since: history ? null : account.period_start }),
		history,
		userId: locals.user!.id,
		canBuy: await memberCan(locals, 'billing.manage'),
		packs: [...AI_CREDIT_PACKS],
		topup,
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
		let checkoutUrl: string;
		try {
			checkoutUrl = await createAiTopupSession({
				orgId: org.id,
				userId: locals.user!.id,
				credits,
				stripeCustomerId: org.subscription.stripeCustomerId,
				userEmail: locals.user!.email
			});
		} catch (err) {
			// Stripe down or refusing: say so here instead of the generic error page.
			console.error('[ai] top-up checkout failed', err);
			return fail(502, { error: 'stripe', message: st(locals.locale).accountPages.stripeError });
		}
		redirect(303, checkoutUrl);
	}
};
