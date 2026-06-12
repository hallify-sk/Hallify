import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import sql from '$lib/db';
import type { UserRow } from '$lib/db';
import { randomUUID } from 'node:crypto';
import { sendPasswordResetEmail } from '$lib/email';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/app/');
	return {};
};

export const actions: Actions = {
	default: async ({ request, url }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '').toLowerCase().trim();
		if (!email) return fail(400, { error: 'Email is required.' });

		// Always show success to prevent email enumeration
		const successMsg = true;

		const [user] = await sql<Pick<UserRow, 'id'>[]>`
			SELECT id FROM users WHERE email = ${email}
		`;

		if (user) {
			const token = randomUUID();
			const expiresAt = new Date(Date.now() + 3600_000); // 1 hour

			await sql`
				INSERT INTO password_resets (user_id, token, expires_at)
				VALUES (${user.id}, ${token}, ${expiresAt})
			`;

			const resetUrl = `${url.origin}/reset-password/${token}`;
			await sendPasswordResetEmail(email, resetUrl);
		}

		return { sent: successMsg };
	},
};
