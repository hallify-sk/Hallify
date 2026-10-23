import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { dbFirst } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import { loginUrl } from '$lib/login-redirect';
import { rateLimit, rateLimitKey, rateLimitStatus, tooManyAttemptsMessage, RATE_LIMITS } from '$lib/rateLimit';
import { isValidEmail, normaliseEmail } from '$lib/server/account';
import { sendEmailChangedNotice } from '$lib/server/account-emails';
import { markEmailChanged, sendVerificationEmail, verificationRequired } from '$lib/server/email-verification';
import { verificationTarget } from '$lib/server/identity';
import { venueIdentity } from '$lib/site/brand.server';
import type { Actions, PageServerLoad } from './$types';

/** "Confirm your email" (D11): where an unverified operator is sent while the switch
 *  is on, and where a venue client's reminder banner leads. Works on hallify.sk and on
 *  every venue site; on a venue site it is branded as the venue. */

function safeNext(raw: unknown): string | null {
	const v = typeof raw === 'string' ? raw.trim() : '';
	if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return null;
	return v;
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, loginUrl(url, locals.domainOrg ? '/login' : '/app/login'));
	const target = await verificationTarget(locals.db, locals.user.id);
	if (!target) redirect(303, loginUrl(url, locals.domainOrg ? '/login' : '/app/login'));

	const home = locals.domainOrg ? '/halls' : '/app/';
	return {
		email: target.email,
		verified: !!target.email_verified_at,
		// Only a Hallify account's address can be changed here (a venue's old,
		// separate account has no profile to change it from either way).
		canChange: target.org_id === null,
		gated: !locals.domainOrg && locals.user.account_type !== 'client' && verificationRequired(),
		next: safeNext(url.searchParams.get('redirect')) ?? home,
		signOut: locals.domainOrg ? '/logout' : '/app/logout',
		domainOrg: locals.domainOrg ? await venueIdentity(locals.db, locals.domainOrg) : null
	};
};

export const actions: Actions = {
	resend: async ({ locals, url, getClientAddress }) => {
		if (!locals.user) return fail(401);
		const T = st(locals.locale);
		const target = await verificationTarget(locals.db, locals.user.id);
		if (!target) return fail(401);
		if (target.email_verified_at) return { already: true };

		for (const [bucket, id, rule] of [
			['forgot_ip', getClientAddress(), RATE_LIMITS.forgotIp],
			['forgot_email', `verify|${target.email}`, RATE_LIMITS.forgotEmail]
		] as const) {
			const rl = await rateLimit(locals.db, rateLimitKey(bucket, id), rule);
			if (!rl.ok) return fail(429, { error: tooManyAttemptsMessage(T.serverErrors.tooManyAttempts, rl.retryAfterMinutes) });
		}

		const ok = await sendVerificationEmail(locals.db, {
			userId: target.id,
			email: target.email,
			origin: url.origin,
			locale: locals.locale,
			venue: locals.domainOrg?.name ?? null
		});
		if (!ok) return fail(503, { error: T.identity.sendFailed });
		return { sent: true, email: target.email };
	},

	change: async ({ request, locals, url, getClientAddress }) => {
		if (!locals.user) return fail(401);
		const T = st(locals.locale);
		const target = await verificationTarget(locals.db, locals.user.id);
		if (!target || target.org_id !== null) return fail(403, { changeError: T.serverErrors.allFieldsRequired });

		const data = await request.formData();
		const email = normaliseEmail(data.get('email'));
		const password = String(data.get('password') ?? '');
		if (!email || !password) return fail(400, { changeError: T.serverErrors.allFieldsRequired });
		if (!isValidEmail(email)) return fail(400, { changeError: T.serverErrors.enterValidEmail });

		// The password guards the change, counted like a failed sign-in so a session
		// left open is no free password oracle.
		const key = rateLimitKey('login_email', target.email);
		const status = await rateLimitStatus(locals.db, key, RATE_LIMITS.loginEmail);
		if (!status.ok) return fail(429, { changeError: tooManyAttemptsMessage(T.serverErrors.tooManyAttempts, status.retryAfterMinutes) });
		const account = await dbFirst<{ password_hash: string; first_name: string; last_name: string }>(
			locals.db,
			'SELECT password_hash, first_name, last_name FROM users WHERE id = ?',
			target.id
		);
		if (!account || !(await bcrypt.compare(password, account.password_hash))) {
			await rateLimit(locals.db, key, RATE_LIMITS.loginEmail);
			return fail(400, { changeError: T.serverErrors.currentPasswordIncorrect });
		}

		if (email !== target.email) {
			const taken = await dbFirst<{ id: string }>(
				locals.db,
				'SELECT id FROM users WHERE email = ? AND org_id IS NULL AND id != ?',
				email,
				target.id
			);
			if (taken) return fail(400, { changeError: T.serverErrors.emailAlreadyInUse });

			await markEmailChanged(locals.db, target.id, { email, firstName: account.first_name, lastName: account.last_name });
			await sendEmailChangedNotice(locals.db, locals.locale, target.email, email);
		}

		const rl = await rateLimit(locals.db, rateLimitKey('forgot_ip', getClientAddress()), RATE_LIMITS.forgotIp);
		if (!rl.ok) return fail(429, { changeError: tooManyAttemptsMessage(T.serverErrors.tooManyAttempts, rl.retryAfterMinutes) });
		const ok = await sendVerificationEmail(locals.db, {
			userId: target.id,
			email,
			origin: url.origin,
			locale: locals.locale,
			venue: locals.domainOrg?.name ?? null
		});
		if (!ok) return fail(503, { changeError: T.identity.sendFailed });
		return { sent: true, email };
	}
};
