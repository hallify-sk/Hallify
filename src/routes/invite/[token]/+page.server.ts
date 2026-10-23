import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { dbFirst, dbRun } from '$lib/db/index';
import { createSession } from '$lib/auth';
import { st } from '$lib/i18n-server';
import { rateLimit, rateLimitKey, tooManyAttemptsMessage, RATE_LIMITS } from '$lib/rateLimit';
import type { Actions, PageServerLoad } from './$types';
import type { D1Database } from '@cloudflare/workers-types';

type InviteRow = {
	id: string; reservation_id: string; org_id: string; email: string;
	first_name: string; last_name: string; expires_at: string; accepted_at: string | null;
	res_title: string; event_date: string; hall_name: string; org_name: string; res_status: string;
};

function loadInvite(db: D1Database, token: string) {
	return dbFirst<InviteRow>(db,
		`SELECT i.id, i.reservation_id, i.org_id, i.email, i.first_name, i.last_name, i.expires_at, i.accepted_at,
		        r.title AS res_title, r.event_date, r.status AS res_status, h.name AS hall_name, o.name AS org_name
		 FROM reservation_invites i
		 JOIN reservations r ON r.id = i.reservation_id
		 JOIN halls h ON h.id = r.hall_id
		 JOIN organizations o ON o.id = i.org_id
		 WHERE i.token = ?`,
		token
	);
}

/**
 * The invite, but only on its own venue's site. On another venue's site it does not
 * exist: that site's branding around somebody else's event (and an account created
 * in the wrong org's bubble) is exactly what must not happen. On the apex it is
 * still served, because that is where the link points when the org has no public
 * address.
 */
async function loadInviteHere(locals: App.Locals, token: string) {
	const invite = await loadInvite(locals.db, token);
	if (invite && locals.domainOrg && locals.domainOrg.id !== invite.org_id) return null;
	return invite;
}

const stillValid = (inv: InviteRow | null): inv is InviteRow =>
	!!inv && !inv.accepted_at && new Date(inv.expires_at) >= new Date();

/** Why the link leads nowhere, shown by the page itself: the generic error page
 *  said "something went wrong on our side" for a link that was merely used up. */
type Unavailable = 'notFound' | 'used' | 'expired';

export const load: PageServerLoad = async ({ params, locals }) => {
	const invite = await loadInviteHere(locals, params.token);
	const dead = (reason: Unavailable) => ({
		unavailable: reason,
		invite: null,
		hasAccount: false,
		loggedInMatches: false,
		loggedInDifferent: false,
		currentEmail: null,
		token: params.token
	});
	if (!invite) return dead('notFound');
	if (invite.accepted_at) return dead('used');
	if (new Date(invite.expires_at) < new Date()) return dead('expired');
	// The event was cancelled after the invite was sent — the invite is dead.
	if (invite.res_status === 'cancelled') return dead('notFound');

	// Did this email already register as a client of the org (e.g. after the invite
	// was sent)? If so we steer them to log in and claim instead of re-registering.
	const existingUser = await dbFirst<{ id: string }>(locals.db,
		`SELECT id FROM users WHERE email = ? AND org_id = ?`, invite.email, invite.org_id);

	const loggedInMatches = !!locals.user
		&& locals.user.account_type === 'client'
		&& locals.user.org_id === invite.org_id
		&& locals.user.email.toLowerCase() === invite.email.toLowerCase();
	// Someone else is signed in (a different client, or an org account) — registering
	// would clobber their session, so the page asks them to log out first.
	const loggedInDifferent = !!locals.user && !loggedInMatches;

	return {
		unavailable: null as Unavailable | null,
		invite: {
			email: invite.email,
			firstName: invite.first_name,
			lastName: invite.last_name,
			eventTitle: invite.res_title,
			hallName: invite.hall_name,
			eventDate: invite.event_date,
			orgName: invite.org_name,
		},
		hasAccount: !!existingUser,
		loggedInMatches,
		loggedInDifferent,
		currentEmail: locals.user?.email ?? null,
		token: params.token,
	};
};

export const actions: Actions = {
	// New visitor sets a password → a client account is created and the reservation
	// is handed to them. Name + email come from the invite, not the form.
	register: async ({ params, request, cookies, locals, getClientAddress }) => {
		const invite = await loadInviteHere(locals, params.token);
		if (!stillValid(invite) || invite.res_status === 'cancelled') return fail(410, { error: st(locals.locale).serverErrors.inviteNotFoundOrExpired });

		// Same account-creation bucket as every other sign-up surface: this one
		// creates a real account too, so it must not be the unmetered way in.
		const rl = await rateLimit(
			locals.db,
			// Null behind `wrangler dev`, where Cloudflare's cf-connecting-ip is absent.
			rateLimitKey('register', getClientAddress() ?? 'unknown'),
			RATE_LIMITS.register
		);
		if (!rl.ok) {
			return fail(429, {
				error: tooManyAttemptsMessage(st(locals.locale).serverErrors.tooManyAttempts, rl.retryAfterMinutes)
			});
		}

		// A different account is already signed in — refuse rather than silently
		// overwrite their session with a freshly created one.
		//
		// The same triple check as `claim`, not the address alone. An ORGANISATION
		// account signed in on its own bubble can hold the invited address too
		// (users_email_org_unique scopes client addresses per org, so both rows can
		// exist), and the address-only check let it through: it then created a
		// SECOND, client account for that person and replaced their session with
		// it. Whoever is already signed in must be the invited client of this org,
		// and that case is answered by the "already registered" branch below.
		if (
			locals.user
			&& (locals.user.account_type !== 'client'
				|| locals.user.org_id !== invite.org_id
				|| locals.user.email.toLowerCase() !== invite.email.toLowerCase())
		) {
			return fail(403, { error: st(locals.locale).serverErrors.inviteEmailMismatch });
		}

		const data = await request.formData();
		const password = String(data.get('password') ?? '');
		if (password.length < 8) return fail(400, { error: st(locals.locale).serverErrors.passwordMin8 });

		// Email registered in the meantime → can't create a duplicate; send to login.
		const existing = await dbFirst<{ id: string }>(locals.db,
			`SELECT id FROM users WHERE email = ? AND org_id = ?`, invite.email, invite.org_id);
		if (existing) return fail(409, { error: st(locals.locale).serverErrors.emailAlreadyRegisteredLogIn });

		const password_hash = await bcrypt.hash(password, 12);
		const newUserId = crypto.randomUUID();
		try {
			await dbRun(locals.db,
				`INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id)
				 VALUES (?, ?, ?, ?, ?, 'client', ?)`,
				newUserId, invite.email, password_hash, invite.first_name, invite.last_name, invite.org_id);
		} catch {
			// Lost a double-submit race against the (org_id,email) unique index.
			return fail(409, { error: st(locals.locale).serverErrors.emailAlreadyRegisteredLogIn });
		}

		await dbRun(locals.db, 'UPDATE reservations SET user_id = ? WHERE id = ? AND org_id = ?', newUserId, invite.reservation_id, invite.org_id);
		await dbRun(locals.db, "UPDATE reservation_invites SET accepted_at = datetime('now') WHERE id = ?", invite.id);

		await createSession(newUserId, cookies, locals.db);
		redirect(303, `/halls/my-reservations/${invite.reservation_id}`);
	},

	// Already signed in as the invited client → just take ownership of the event.
	claim: async ({ params, locals }) => {
		if (!locals.user) redirect(303, `/login?redirect=${encodeURIComponent(`/invite/${params.token}`)}`);
		const invite = await loadInviteHere(locals, params.token);
		if (!stillValid(invite) || invite.res_status === 'cancelled') return fail(410, { error: st(locals.locale).serverErrors.inviteNotFoundOrExpired });

		if (locals.user.account_type !== 'client'
			|| locals.user.org_id !== invite.org_id
			|| locals.user.email.toLowerCase() !== invite.email.toLowerCase()) {
			return fail(403, { error: st(locals.locale).serverErrors.inviteEmailMismatch });
		}

		await dbRun(locals.db, 'UPDATE reservations SET user_id = ? WHERE id = ? AND org_id = ?', locals.user.id, invite.reservation_id, invite.org_id);
		await dbRun(locals.db, "UPDATE reservation_invites SET accepted_at = datetime('now') WHERE id = ?", invite.id);
		redirect(303, `/halls/my-reservations/${invite.reservation_id}`);
	},
};
