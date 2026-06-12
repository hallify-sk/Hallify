import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import sql from '$lib/db/index';
import { createSession } from '$lib/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) {
		redirect(303, locals.user.account_type === 'client' ? '/app/client' : '/app/');
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const data = await request.formData();
		const accountType = String(data.get('accountType') ?? '');
		const email = String(data.get('email') ?? '').toLowerCase().trim();
		const password = String(data.get('password') ?? '');
		const firstName = String(data.get('firstName') ?? '').trim();
		const lastName = String(data.get('lastName') ?? '').trim();

		if (accountType !== 'client' && accountType !== 'organization') {
			return fail(400, { error: 'Please choose an account type.' });
		}
		if (!email || !password || !firstName || !lastName) {
			return fail(400, { error: 'All fields are required.', accountType });
		}
		if (password.length < 6) {
			return fail(400, { error: 'Password must be at least 6 characters.', accountType });
		}

		const [existing] = await sql`SELECT id FROM users WHERE email = ${email}`;
		if (existing) {
			return fail(400, { error: 'An account with this email already exists.', accountType });
		}

		const [{ count }] = await sql<[{ count: string }]>`SELECT COUNT(*)::text AS count FROM users`;
		const role = Number(count) === 0 ? 'admin' : 'user';

		const hash = await bcrypt.hash(password, 12);

		const [{ id }] = await sql<[{ id: string }]>`
			INSERT INTO users (email, password_hash, first_name, last_name, role, account_type)
			VALUES (${email}, ${hash}, ${firstName}, ${lastName}, ${role}, ${accountType})
			RETURNING id
		`;

		await createSession(id, cookies);

		if (accountType === 'client') {
			redirect(303, '/app/client');
		} else {
			redirect(303, '/app/org/new');
		}
	}
};
