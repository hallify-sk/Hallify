import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import sql from '$lib/db/index';
import type { UserRow } from '$lib/db/index';
import { createSession } from '$lib/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/app/');
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '').toLowerCase().trim();
		const password = String(data.get('password') ?? '');

		if (!email || !password) {
			return fail(400, { error: 'Email and password are required.' });
		}

		const [user] = await sql<UserRow[]>`
			SELECT * FROM users WHERE email = ${email}
		`;

		if (!user || !(await bcrypt.compare(password, user.password_hash))) {
			return fail(400, { error: 'Invalid email or password.' });
		}

		await createSession(user.id, cookies);
		redirect(303, '/app/');
	}
};
