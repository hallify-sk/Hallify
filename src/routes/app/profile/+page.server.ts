import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { UserRow } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import bcrypt from 'bcryptjs';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/app/login');

	const user = await dbFirst<Pick<UserRow, 'id' | 'email' | 'first_name' | 'last_name' | 'role' | 'created_at'>>(
		locals.db,
		'SELECT id, email, first_name, last_name, role, created_at FROM users WHERE id = ?',
		locals.user.id
	);
	if (!user) redirect(303, '/app/login');

	return { profile: user };
};

export const actions: Actions = {
	updateProfile: async ({ request, locals }) => {
		if (!locals.user) return fail(401);

		const data = await request.formData();
		const firstName = String(data.get('firstName') ?? '').trim();
		const lastName = String(data.get('lastName') ?? '').trim();
		const email = String(data.get('email') ?? '').toLowerCase().trim();

		if (!firstName || !lastName || !email) {
			return fail(400, { error: st(locals.locale).serverErrors.allFieldsRequired });
		}

		// Check email uniqueness
		const existing = await dbFirst<{ id: string }>(
			locals.db,
			'SELECT id FROM users WHERE email = ? AND id != ?',
			email,
			locals.user.id
		);
		if (existing) {
			return fail(400, { error: st(locals.locale).serverErrors.emailAlreadyInUse });
		}

		await dbRun(
			locals.db,
			'UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE id = ?',
			firstName,
			lastName,
			email,
			locals.user.id
		);

		return { success: true, section: 'profile' };
	},

	changePassword: async ({ request, locals }) => {
		if (!locals.user) return fail(401);

		const data = await request.formData();
		const current = String(data.get('currentPassword') ?? '');
		const newPass = String(data.get('newPassword') ?? '');
		const confirm = String(data.get('confirmPassword') ?? '');

		if (!current || !newPass) {
			return fail(400, { error: st(locals.locale).serverErrors.allFieldsRequired, section: 'password' });
		}
		if (newPass.length < 6) {
			return fail(400, { error: st(locals.locale).serverErrors.passwordTooShort, section: 'password' });
		}
		if (newPass !== confirm) {
			return fail(400, { error: st(locals.locale).serverErrors.passwordsDoNotMatch, section: 'password' });
		}

		const user = await dbFirst<{ password_hash: string }>(
			locals.db,
			'SELECT password_hash FROM users WHERE id = ?',
			locals.user.id
		);
		if (!user || !(await bcrypt.compare(current, user.password_hash))) {
			return fail(400, { error: st(locals.locale).serverErrors.currentPasswordIncorrect, section: 'password' });
		}

		const hash = await bcrypt.hash(newPass, 10);
		await dbRun(locals.db, 'UPDATE users SET password_hash = ? WHERE id = ?', hash, locals.user.id);

		return { success: true, section: 'password' };
	},
};
