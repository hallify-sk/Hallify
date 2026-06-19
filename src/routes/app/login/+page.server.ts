import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { dbFirst } from '$lib/db/index';
import type { UserRow } from '$lib/db/index';
import { createSession } from '$lib/auth';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/app/');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, locals }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '').toLowerCase().trim();
		const password = String(data.get('password') ?? '');

		if (!email || !password) {
			return fail(400, { error: st(locals.locale).serverErrors.emailAndPasswordRequired });
		}

		// Main app is for org/platform users only; clients sign in on their org's bubble.
		const user = await dbFirst<UserRow>(locals.db, 'SELECT * FROM users WHERE email = ? AND org_id IS NULL', email);

		if (!user || !(await bcrypt.compare(password, user.password_hash))) {
			return fail(400, { error: st(locals.locale).serverErrors.invalidEmailOrPassword });
		}

		await createSession(user.id, cookies, locals.db);
		redirect(303, '/app/');
	}
};
