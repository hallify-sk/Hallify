import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { st } from '$lib/i18n-server';
import { rateLimit, rateLimitKey, tooManyAttemptsMessage, RATE_LIMITS } from '$lib/rateLimit';
import { completePasswordReset, findPasswordReset } from '$lib/server/account';
import { sendPasswordChangedNotice } from '$lib/server/account-emails';
import { mailboxProven, venuesJoinedByReset } from '$lib/server/email-verification';
import { dbFirst } from '$lib/db/index';

// Hallify accounts only (no org): a venue client's link is redeemed on the venue's own
// site, in src/routes/reset-password.
const SCOPE = { kind: 'apex' } as const;

export const load: PageServerLoad = async ({ params, locals }) => {
	const reset = await findPasswordReset(locals.db, params.token, SCOPE);
	// A finished reset also joins the address's old venue accounts: said up front.
	return { valid: !!reset, joinVenues: reset ? await venuesJoinedByReset(locals.db, reset.user_id) : [] };
};

export const actions: Actions = {
	default: async ({ request, params, locals, getClientAddress }) => {
		const data = await request.formData();
		const password = String(data.get('password') ?? '');
		const confirm = String(data.get('confirmPassword') ?? '');

		// Caps how fast reset tokens can be guessed from one source.
		const rl = await rateLimit(locals.db, rateLimitKey('reset_token', getClientAddress()), RATE_LIMITS.resetToken);
		if (!rl.ok) {
			return fail(429, {
				error: tooManyAttemptsMessage(st(locals.locale).serverErrors.tooManyAttempts, rl.retryAfterMinutes),
			});
		}

		if (!password || password.length < 6) {
			return fail(400, { error: st(locals.locale).serverErrors.passwordMin6 });
		}
		if (password !== confirm) {
			return fail(400, { error: st(locals.locale).serverErrors.passwordsDoNotMatch });
		}

		const reset = await findPasswordReset(locals.db, params.token, SCOPE);
		if (!reset) {
			return fail(400, { error: st(locals.locale).serverErrors.invalidOrExpiredResetLink });
		}

		// Spends every other link for the account and signs it out everywhere: whoever
		// else was signed in with the old password is not any more.
		const hash = await bcrypt.hash(password, 10);
		if (!(await completePasswordReset(locals.db, reset, hash))) {
			return fail(400, { error: st(locals.locale).serverErrors.invalidOrExpiredResetLink });
		}
		// The link reached the address, so it is confirmed (D11), and old venue accounts
		// with the same address join the Hallify account (D4): whoever opened it has just set
		// the password, so nobody else holds the account. (A verification link alone never joins.)
		await mailboxProven(locals.db, reset.user_id);
		const account = await dbFirst<{ email: string }>(locals.db, 'SELECT email FROM users WHERE id = ?', reset.user_id);
		if (account) sendPasswordChangedNotice(locals.db, locals.locale, account.email).catch(() => {});

		// /login is the bubble-only route; on the apex it bounces to /app/login and the
		// ?reset=success flag is lost, so the user never sees the confirmation.
		redirect(303, '/app/login?reset=success');
	},
};
