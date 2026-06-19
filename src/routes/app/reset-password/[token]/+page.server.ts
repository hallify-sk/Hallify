import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { dbFirst, dbRun } from '$lib/db/index';
import type { PasswordResetRow } from '$lib/db/index';
import bcrypt from 'bcryptjs';
import { st } from '$lib/i18n-server';

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
	default: async ({ request, params, locals }) => {
		const data = await request.formData();
		const password = String(data.get('password') ?? '');
		const confirm = String(data.get('confirmPassword') ?? '');

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

		redirect(303, '/login?reset=success');
	},
};
