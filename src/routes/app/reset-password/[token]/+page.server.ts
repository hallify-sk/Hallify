import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { dbFirst, dbRun } from '$lib/db/index';
import type { PasswordResetRow } from '$lib/db/index';
import bcrypt from 'bcryptjs';
import { st } from '$lib/i18n-server';
import { rateLimit, rateLimitKey, tooManyAttemptsMessage, RATE_LIMITS } from '$lib/rateLimit';

export const load: PageServerLoad = async ({ params, locals }) => {
	const reset = await dbFirst<Pick<PasswordResetRow, 'id' | 'expires_at' | 'used'>>(
		locals.db,
		'SELECT id, expires_at, used FROM password_resets WHERE token = ?',
		params.token
	);

	if (!reset || !!reset.used || new Date(reset.expires_at) < new Date()) {
		return { valid: false };
	}

	return { valid: true };
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

		const reset = await dbFirst<Pick<PasswordResetRow, 'id' | 'user_id' | 'expires_at' | 'used'>>(
			locals.db,
			'SELECT id, user_id, expires_at, used FROM password_resets WHERE token = ?',
			params.token
		);

		if (!reset || !!reset.used || new Date(reset.expires_at) < new Date()) {
			return fail(400, { error: st(locals.locale).serverErrors.invalidOrExpiredResetLink });
		}

		const hash = await bcrypt.hash(password, 10);
		await dbRun(locals.db, 'UPDATE users SET password_hash = ? WHERE id = ?', hash, reset.user_id);
		await dbRun(locals.db, 'UPDATE password_resets SET used = 1 WHERE id = ?', reset.id);

		// /login is the bubble-only route; on the apex it bounces to /app/login and the
		// ?reset=success flag is lost, so the user never sees the confirmation.
		redirect(303, '/app/login?reset=success');
	},
};
