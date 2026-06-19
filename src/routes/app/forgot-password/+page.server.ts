import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { dbFirst, dbRun } from '$lib/db/index';
import type { UserRow } from '$lib/db/index';
import { sendPasswordResetEmail } from '$lib/email';
import { st } from '$lib/i18n-server';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/app/');
	return {};
};

export const actions: Actions = {
	default: async ({ request, url, locals }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '').toLowerCase().trim();
		if (!email) return fail(400, { error: st(locals.locale).serverErrors.emailRequired });

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

			const resetUrl = `${url.origin}/reset-password/${token}`;
			await sendPasswordResetEmail(locals.db, email, resetUrl);
		}

		return { sent: successMsg };
	},
};
