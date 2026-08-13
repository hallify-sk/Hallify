import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { dbFirst, dbRun } from '$lib/db/index';
import type { UserRow } from '$lib/db/index';
import { sendPasswordResetEmail } from '$lib/email';
import { st } from '$lib/i18n-server';
import { rateLimit, rateLimitKey, tooManyAttemptsMessage, RATE_LIMITS } from '$lib/rateLimit';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/app/');
	return {};
};

export const actions: Actions = {
	default: async ({ request, url, locals, getClientAddress }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '').toLowerCase().trim();
		if (!email) return fail(400, { error: st(locals.locale).serverErrors.emailRequired });

		// Unthrottled, this endpoint mails anyone on demand — both a spam vector aimed at
		// the victim and a way to burn our sending reputation. Limited per IP and per
		// address. Note this DOES leak that a limit exists, but not whether the account
		// does: the cap applies to every address, real or not.
		for (const [bucket, id, rule] of [
			['forgot_ip', getClientAddress(), RATE_LIMITS.forgotIp],
			['forgot_email', email, RATE_LIMITS.forgotEmail],
		] as const) {
			const rl = await rateLimit(locals.db, rateLimitKey(bucket, id), rule);
			if (!rl.ok) {
				return fail(429, {
					error: tooManyAttemptsMessage(st(locals.locale).serverErrors.tooManyAttempts, rl.retryAfterMinutes),
				});
			}
		}

		// Always show success to prevent email enumeration
		const successMsg = true;

		// Main-app reset is for org/platform users only (clients reset on their bubble).
		const user = await dbFirst<Pick<UserRow, 'id'>>(locals.db, 'SELECT id FROM users WHERE email = ? AND org_id IS NULL', email);

		if (user) {
			const token = crypto.randomUUID().replace(/-/g, '').slice(0, 32);
			const expiresAt = new Date(Date.now() + 3600_000).toISOString(); // 1 hour

			await dbRun(
				locals.db,
				'INSERT INTO password_resets (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
				crypto.randomUUID(), user.id, token, expiresAt
			);

			// Must match the route on disk: src/routes/app/reset-password/[token].
			// This lived at /reset-password/<token> and 404'd for every recipient.
			const resetUrl = `${url.origin}/app/reset-password/${token}`;
			await sendPasswordResetEmail(locals.db, email, resetUrl);
		}

		return { sent: successMsg };
	},
};
