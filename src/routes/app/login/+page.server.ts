import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { dbFirst, dbRun } from '$lib/db/index';
import type { UserRow } from '$lib/db/index';
import { createSession } from '$lib/auth';
import { st } from '$lib/i18n-server';
import { rateLimit, rateLimitKey, rateLimitStatus, tooManyAttemptsMessage, RATE_LIMITS } from '$lib/rateLimit';
import type { Actions, PageServerLoad } from './$types';

/** Only same-origin absolute paths may be followed after sign-in. A value starting
 *  `//` or `/\` is a protocol-relative URL the browser would treat as another host,
 *  so those are rejected along with anything not rooted at `/`. Same rule as
 *  /app/register — an open redirect on a login form is a phishing primitive. */
function safeNext(raw: unknown): string | null {
	const v = typeof raw === 'string' ? raw.trim() : '';
	if (!v.startsWith('/')) return null;
	if (v.startsWith('//') || v.startsWith('/\\')) return null;
	return v;
}

export const load: PageServerLoad = ({ locals, url }) => {
	// Already signed in: honour the ?redirect= too, so following an invite link
	// while signed in on another tab still lands on the invitation.
	if (locals.user) redirect(303, safeNext(url.searchParams.get('redirect')) ?? '/app/');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, locals, getClientAddress }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '').toLowerCase().trim();
		const password = String(data.get('password') ?? '');
		const next = safeNext(data.get('redirect'));

		if (!email || !password) {
			return fail(400, { error: st(locals.locale).serverErrors.emailAndPasswordRequired });
		}

		// Two buckets: per-IP stops a burst from one source, per-email stops slow
		// credential stuffing spread across many IPs against one account. Only FAILED
		// attempts are counted: a correct sign-in never uses up anyone's allowance (an
		// office behind one IP signing in every morning used to lock itself out), while
		// guessing still stops after the limit.
		const buckets = [
			[rateLimitKey('login_ip', getClientAddress()), RATE_LIMITS.loginIp],
			[rateLimitKey('login_email', email), RATE_LIMITS.loginEmail],
		] as const;
		for (const [key, rule] of buckets) {
			const rl = await rateLimitStatus(locals.db, key, rule);
			if (!rl.ok) {
				return fail(429, {
					error: tooManyAttemptsMessage(st(locals.locale).serverErrors.tooManyAttempts, rl.retryAfterMinutes),
				});
			}
		}

		// Main app is for org/platform users only; clients sign in on their org's bubble.
		const user = await dbFirst<UserRow>(locals.db, 'SELECT * FROM users WHERE email = ? AND org_id IS NULL', email);

		if (!user || !(await bcrypt.compare(password, user.password_hash))) {
			for (const [key, rule] of buckets) await rateLimit(locals.db, key, rule);
			return fail(400, { error: st(locals.locale).serverErrors.invalidEmailOrPassword });
		}

		// A legacy apex client account (from before clients belonged to one venue) is
		// account_type 'client' with no org. getSessionUser only honours a client inside
		// its own venue's site, so the session created below was ignored and the person
		// landed back here with no message. Such an account is, today, exactly a personal
		// Hallify account — which is what apex registration creates — so it becomes one.
		// Its bookings stay linked to it by user id.
		if (user.account_type === 'client') {
			await dbRun(
				locals.db,
				"UPDATE users SET account_type = 'organization' WHERE id = ? AND org_id IS NULL AND account_type = 'client'",
				user.id
			);
		}

		await createSession(user.id, cookies, locals.db);
		// Back to whatever sent them here (an invitation link, a venue page), or
		// home when nothing did — /app sends console users on to /app/manage.
		redirect(303, next ?? '/app/');
	}
};
