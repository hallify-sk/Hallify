import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { dbFirst, dbRun } from '$lib/db/index';
import { createSession } from '$lib/auth';
import { st } from '$lib/i18n-server';
import { rateLimit, rateLimitKey, tooManyAttemptsMessage, RATE_LIMITS } from '$lib/rateLimit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/app/');
	return {};
};

// The main app only creates ORGANIZATION accounts. Client accounts are created
// inside an org's bubble (its subdomain or custom domain), not here.
export const actions: Actions = {
	default: async ({ request, cookies, locals, getClientAddress }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '').toLowerCase().trim();
		const password = String(data.get('password') ?? '');
		const firstName = String(data.get('firstName') ?? '').trim();
		const lastName = String(data.get('lastName') ?? '').trim();

		if (!email || !password || !firstName || !lastName) {
			return fail(400, { error: st(locals.locale).serverErrors.allFieldsRequired });
		}

		const rl = await rateLimit(locals.db, rateLimitKey('register', getClientAddress()), RATE_LIMITS.register);
		if (!rl.ok) {
			return fail(429, {
				error: tooManyAttemptsMessage(st(locals.locale).serverErrors.tooManyAttempts, rl.retryAfterMinutes),
			});
		}
		if (password.length < 6) {
			return fail(400, { error: st(locals.locale).serverErrors.passwordMin6 });
		}

		// org/platform users are globally unique by email (org_id IS NULL).
		const existing = await dbFirst<{ id: string }>(locals.db, 'SELECT id FROM users WHERE email = ? AND org_id IS NULL', email);
		if (existing) {
			return fail(400, { error: st(locals.locale).serverErrors.accountEmailExists });
		}

		const countRow = await dbFirst<{ count: number }>(locals.db, 'SELECT COUNT(*) AS count FROM users WHERE org_id IS NULL');
		const role = (countRow?.count ?? 0) === 0 ? 'admin' : 'user';

		const hash = await bcrypt.hash(password, 12);

		const userId = crypto.randomUUID();
		await dbRun(
			locals.db,
			"INSERT INTO users (id, email, password_hash, first_name, last_name, role, account_type) VALUES (?, ?, ?, ?, ?, ?, 'organization')",
			userId, email, hash, firstName, lastName, role
		);

		await createSession(userId, cookies, locals.db);
		redirect(303, '/app/org/new');
	}
};
