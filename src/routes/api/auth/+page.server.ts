import {
	createSession,
	generateSessionToken,
	setSessionTokenCookie,
	validatePassword
} from '$lib/server/auth.js';
import { users } from '$lib/server/schema.js';
import { TokenBucket } from '$lib/server/ratelimit';
import { isValidEmail } from '$lib/util.js';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { eq } from 'drizzle-orm';

const authBucket = new TokenBucket<string>(2, 1);

export const actions = {
	default: async function ({ locals, getClientAddress, cookies, request }) {
		if (request.method != 'POST') {
			return fail(405, { message: 'Metóda nie je povolená.' });
		}
		if (!authBucket.consume(getClientAddress(), 3)) {
			fail(429, { message: 'Príliš veľa požiadaviek.' });
		}
		if (locals.session) {
			return { success: true, message: 'Už ste prihlásený.' };
		}
		const formData = await request.formData();
		let email = formData.get('email');
		if (!email || typeof email !== 'string' || !isValidEmail(email)) {
			return fail(400, { message: 'E-Mail je neplatný.', validate: ['email'] });
		}
		email = email.toLowerCase();
		const user = (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
		if (!user) {
			return fail(404, { message: 'Účet s týmto e-mailom neexistuje.', validate: ['email'] });
		}
		const password = formData.get('password');
		if (!password || typeof password !== 'string') {
			return fail(400, { message: 'Neplatné heslo.', validate: ['password'] });
		}

		if (!(await validatePassword(password, user.password_hash))) {
			return fail(404, {
				message: 'Kombinácia užívateľa a hesla nebola nájdená.',
				validate: ['password']
			});
		}

		const token = generateSessionToken();
		const session = await createSession(token, user.id);
		setSessionTokenCookie(cookies, token, session.expires_at);

		return {};
	}
};
