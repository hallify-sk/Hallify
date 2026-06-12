import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import sql from '$lib/db';
import type { PasswordResetRow } from '$lib/db';
import bcrypt from 'bcryptjs';

export const load: PageServerLoad = async ({ params }) => {
	const [reset] = await sql<Pick<PasswordResetRow, 'id' | 'expires_at' | 'used'>[]>`
		SELECT id, expires_at, used FROM password_resets WHERE token = ${params.token}
	`;

	if (!reset || reset.used || new Date(reset.expires_at) < new Date()) {
		return { valid: false };
	}

	return { valid: true };
};

export const actions: Actions = {
	default: async ({ request, params }) => {
		const data = await request.formData();
		const password = String(data.get('password') ?? '');
		const confirm = String(data.get('confirmPassword') ?? '');

		if (!password || password.length < 6) {
			return fail(400, { error: 'Password must be at least 6 characters.' });
		}
		if (password !== confirm) {
			return fail(400, { error: 'Passwords do not match.' });
		}

		const [reset] = await sql<Pick<PasswordResetRow, 'id' | 'user_id' | 'expires_at' | 'used'>[]>`
			SELECT id, user_id, expires_at, used FROM password_resets WHERE token = ${params.token}
		`;

		if (!reset || reset.used || new Date(reset.expires_at) < new Date()) {
			return fail(400, { error: 'Invalid or expired reset link.' });
		}

		const hash = await bcrypt.hash(password, 10);
		await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${reset.user_id}`;
		await sql`UPDATE password_resets SET used = true WHERE id = ${reset.id}`;

		redirect(303, '/login?reset=success');
	},
};
