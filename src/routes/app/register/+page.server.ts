import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { dbFirst, dbRun } from '$lib/db/index';
import { createSession } from '$lib/auth';
import { st } from '$lib/i18n-server';
import { rateLimit, rateLimitKey, tooManyAttemptsMessage, RATE_LIMITS } from '$lib/rateLimit';
import { isValidEmail, normaliseEmail } from '$lib/server/account';
import { acceptedTerms, recordLegalAcceptance } from '$lib/site/legal-acceptance';
import { sendVerificationEmail } from '$lib/server/email-verification';
import type { Actions, PageServerLoad } from './$types';

/** Where a venue-seeker lands once the account exists — Hallify is a discovery
 *  product first, so the default destination is the venue directory, never the
 *  organisation form. */
const DISCOVERY_HOME = '/priestory';

/** Where someone who told us they run a venue goes next. Creating the org is a
 *  separate, explicit step on the same account — not part of registration. */
const OPERATOR_NEXT = '/app/org/new';

export type RegisterIntent = 'guest' | 'operator';

/** The intent is a routing hint only: it decides which page we show next and
 *  nothing else. It grants no role, no org and no privilege, so an unexpected
 *  value simply falls back to the venue-seeker path rather than failing. */
function readIntent(raw: unknown): RegisterIntent {
	return raw === 'operator' || raw === 'business' ? 'operator' : 'guest';
}

/** Only same-origin absolute paths may be followed after sign-up. A value that
 *  starts with `//` or `/\` is a protocol-relative URL the browser would treat
 *  as another host, so those are rejected along with anything not rooted at `/`. */
function safeNext(raw: unknown): string | null {
	const v = typeof raw === 'string' ? raw.trim() : '';
	if (!v.startsWith('/')) return null;
	if (v.startsWith('//') || v.startsWith('/\\')) return null;
	return v;
}

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, '/app/');
	return {
		intent: readIntent(url.searchParams.get('intent') ?? url.searchParams.get('type')),
		next: safeNext(url.searchParams.get('redirect')) ?? '',
	};
};

/** Every fail() spreads this so ActionData keeps one shape — otherwise the
 *  union's narrowest member drops the fields the form reads back. */
const formShape = { firstName: '', lastName: '', email: '', intent: 'guest' as RegisterIntent };

// Registration on the apex creates ONE kind of account: a personal Hallify
// account (account_type 'organization', org_id NULL). Whether the person books
// venues or runs one is decided later by joining or creating an organisation —
// nobody needs a second account for that. Per-org CLIENT accounts are a
// different thing entirely: they are created inside an org's bubble (its
// subdomain or custom domain) in src/routes/login, scoped by org_id.
export const actions: Actions = {
	default: async ({ request, cookies, url, locals, getClientAddress }) => {
		const data = await request.formData();
		const email = normaliseEmail(data.get('email'));
		const password = String(data.get('password') ?? '');
		const firstName = String(data.get('firstName') ?? '').trim();
		const lastName = String(data.get('lastName') ?? '').trim();
		const intent = readIntent(data.get('intent'));
		const next = safeNext(data.get('redirect'));
		const entered = { ...formShape, firstName, lastName, email, intent };
		const errors = st(locals.locale).serverErrors;

		if (!email || !password || !firstName || !lastName) {
			return fail(400, { ...entered, error: errors.allFieldsRequired });
		}
		// The browser's type="email" is a convenience; a posted form need not have it.
		if (!isValidEmail(email)) {
			return fail(400, { ...entered, error: errors.enterValidEmail });
		}
		if (password.length < 6) {
			return fail(400, { ...entered, error: errors.passwordMin6 });
		}
		// The Terms and the Privacy Policy are linked on the form; agreeing is required.
		if (!acceptedTerms(data)) {
			return fail(400, { ...entered, error: st(locals.locale).authPages.registerTermsRequired });
		}

		// Counted once the form is valid: a typo in the form is not an attempt to create
		// an account, and used to eat into the hourly allowance. Still before the
		// existence check below, so the limit also caps probing which addresses exist.
		const rl = await rateLimit(locals.db, rateLimitKey('register', getClientAddress()), RATE_LIMITS.register);
		if (!rl.ok) {
			return fail(429, {
				...entered,
				error: tooManyAttemptsMessage(errors.tooManyAttempts, rl.retryAfterMinutes),
			});
		}

		// org/platform users are globally unique by email (org_id IS NULL).
		const existing = await dbFirst<{ id: string }>(locals.db, 'SELECT id FROM users WHERE email = ? AND org_id IS NULL AND deleted_at IS NULL', email);
		if (existing) {
			return fail(400, { ...entered, error: errors.accountEmailExists });
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
		await recordLegalAcceptance(locals.db, { userId, context: 'register' });
		// Confirming the address (D11) unlocks the console when REQUIRE_EMAIL_VERIFICATION
		// is on, and joins old venue accounts with the same address (D4).
		await sendVerificationEmail(locals.db, { userId, email, origin: url.origin, locale: locals.locale });

		await createSession(userId, cookies, locals.db);
		// An operator asked to set their venue up now, so we hand them the org
		// form; everyone else goes to the directory (or back to whatever page
		// sent them here to sign up).
		redirect(303, intent === 'operator' ? OPERATOR_NEXT : (next ?? DISCOVERY_HOME));
	}
};
