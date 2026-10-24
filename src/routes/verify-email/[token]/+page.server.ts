import { fail } from '@sveltejs/kit';
import { st } from '$lib/i18n-server';
import { rateLimit, rateLimitKey, rateLimitStatus, tooManyAttemptsMessage, RATE_LIMITS } from '$lib/rateLimit';
import { findJoinLink, joinOldAccounts, verifyEmailToken } from '$lib/server/email-verification';
import { verificationTarget } from '$lib/server/identity';
import { venueIdentity } from '$lib/site/brand.server';
import type { Actions, PageServerLoad } from './$types';

/** The Hallify account the signed-in visitor stands for, if any (a linked venue row
 *  answers for its account). */
async function signedInAccount(locals: App.Locals): Promise<string | null> {
	if (!locals.user) return null;
	return (await verificationTarget(locals.db, locals.user.id))?.id ?? null;
}

/** The link from the verification email. Opening it is the proof that the person
 *  reads that mailbox, so it verifies on arrival. Opening it twice is harmless.
 *
 *  It does not join the address's old venue accounts by itself: the account may have
 *  been created with this address by someone else, who chose its password. When there
 *  are old accounts, the page names their venues and joins them only once the visitor
 *  also shows they hold the Hallify account (signed in as it, or its password). */
export const load: PageServerLoad = async ({ params, locals }) => {
	const result = await verifyEmailToken(locals.db, params.token);
	const onVenue = !!locals.domainOrg;

	let join: { venues: string[]; signedIn: boolean } | null = null;
	if (result.status === 'verified') {
		const link = await findJoinLink(locals.db, params.token);
		if (link.status === 'ok' && link.venues.length > 0) {
			join = { venues: link.venues, signedIn: (await signedInAccount(locals)) === link.account.id };
		}
	}

	return {
		result,
		join,
		next: locals.user ? (onVenue ? '/halls' : '/app/') : onVenue ? '/login' : '/app/login',
		forgotUrl: onVenue ? '/forgot-password' : '/app/forgot-password',
		resendUrl: locals.user ? '/verify-email' : onVenue ? '/login?redirect=%2Fverify-email' : '/app/login?redirect=%2Fverify-email',
		domainOrg: locals.domainOrg ? await venueIdentity(locals.db, locals.domainOrg) : null
	};
};

export const actions: Actions = {
	/** Join the old venue accounts: the link (the mailbox) and the Hallify password
	 *  (or a session of the account) together. */
	join: async ({ request, params, locals, getClientAddress }) => {
		const T = st(locals.locale);
		const link = await findJoinLink(locals.db, params.token);
		if (link.status !== 'ok') {
			return fail(410, { joinError: link.status === 'stale' ? T.identity.linkStale : T.identity.linkInvalid });
		}
		const signedInAs = await signedInAccount(locals);
		const password = String((await request.formData()).get('password') ?? '');

		// A password guess here is a sign-in attempt: same buckets, counted on failure.
		const buckets = [
			[rateLimitKey('login_ip', getClientAddress()), RATE_LIMITS.loginIp],
			[rateLimitKey('login_email', link.account.email), RATE_LIMITS.loginEmail]
		] as const;
		if (signedInAs !== link.account.id) {
			for (const [key, rule] of buckets) {
				const rl = await rateLimitStatus(locals.db, key, rule);
				if (!rl.ok) return fail(429, { joinError: tooManyAttemptsMessage(T.serverErrors.tooManyAttempts, rl.retryAfterMinutes) });
			}
		}

		const res = await joinOldAccounts(locals.db, link.account, { signedInAs, password });
		if (!res.ok) {
			for (const [key, rule] of buckets) await rateLimit(locals.db, key, rule);
			return fail(400, { joinError: T.identity.joinWrongPassword });
		}
		return { joined: res.joined };
	}
};
