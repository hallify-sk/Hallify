import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { dbFirst } from '$lib/db/index';
import type { UserRow } from '$lib/db/index';
import { createSession } from '$lib/auth';
import { st } from '$lib/i18n-server';
import { rateLimit, rateLimitKey, tooManyAttemptsMessage, RATE_LIMITS } from '$lib/rateLimit';
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
		// credential stuffing spread across many IPs against one account.
		for (const [bucket, id, rule] of [
			['login_ip', getClientAddress(), RATE_LIMITS.loginIp],
			['login_email', email, RATE_LIMITS.loginEmail],
		] as const) {
			const rl = await rateLimit(locals.db, rateLimitKey(bucket, id), rule);
			if (!rl.ok) {
				return fail(429, {
					error: tooManyAttemptsMessage(st(locals.locale).serverErrors.tooManyAttempts, rl.retryAfterMinutes),
				});
			}
		}

		// Main app is for org/platform users only; clients sign in on their org's bubble.
		const user = await dbFirst<UserRow>(locals.db, 'SELECT * FROM users WHERE email = ? AND org_id IS NULL', email);

		if (!user || !(await bcrypt.compare(password, user.password_hash))) {
			return fail(400, { error: st(locals.locale).serverErrors.invalidEmailOrPassword });
		}

		await createSession(user.id, cookies, locals.db);
		// Back to whatever sent them here (an invitation link, a venue page), or
		// the dashboard when nothing did.
		redirect(303, next ?? '/app/');
	}
};
