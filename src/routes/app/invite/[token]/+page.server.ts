import { redirect, fail } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import type { PageServerLoad, Actions } from './$types';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { createSession, deleteSession } from '$lib/auth';
import { st } from '$lib/i18n-server';
import { canAddMember } from '$lib/limits';
import { getPlan } from '$lib/plans';
import type { PlanId } from '$lib/plans';
import { rateLimit, rateLimitKey, tooManyAttemptsMessage, RATE_LIMITS } from '$lib/rateLimit';
import type { D1Database } from '@cloudflare/workers-types';
import { syncAdministratorRole } from '$lib/server/people';

/**
 * Accepting an invitation into an organisation.
 *
 * The link is self-sufficient: somebody with no Hallify account at all sets a
 * password here and is created, signed in and joined in one step. There are four
 * states, and the server decides every one of them for itself — the page only
 * renders what the server already resolved:
 *
 *   signed out, no account for the invited address  → set-a-password form
 *   signed out, the address already has an account  → sign in (redirect preserved)
 *   signed in as the invited address                → accept
 *   signed in as somebody else                      → refused, offer to sign out
 *
 * ⚠️  `load` does not run before a form action (see the warning at the top of
 * $lib/guards), so every action below re-derives the invite from its token and
 * re-checks the state itself. Nothing here trusts a hidden field: the email, the
 * organisation, the legacy member role and the role ids all come from the invite
 * row, never from the request body. The only values the visitor supplies are
 * their own name and password.
 */

type InviteRow = {
	id: string;
	org_id: string;
	org_name: string;
	email: string;
	role: string;
	role_ids: string | null;
	first_name: string | null;
	last_name: string | null;
	expires_at: string;
	accepted_at: string | null;
};

/** Load an invite by token.
 *
 *  `role_ids`, `first_name` and `last_name` arrive with migration 0007. The
 *  fallback keeps the page working on a database where it has not landed yet —
 *  the same reasoning as the try/catch in $lib/server/access, and the difference
 *  between "this invite carries no roles" and a 500 on the invite link. */
async function loadInvite(db: D1Database, token: string): Promise<InviteRow | null> {
	try {
		return await dbFirst<InviteRow>(
			db,
			`SELECT i.id, i.org_id, o.name AS org_name, i.email, i.role, i.role_ids,
			        i.first_name, i.last_name, i.expires_at, i.accepted_at
			   FROM organization_invites i
			   JOIN organizations o ON o.id = i.org_id
			  WHERE i.token = ?`,
			token
		);
	} catch {
		const legacy = await dbFirst<Omit<InviteRow, 'role_ids' | 'first_name' | 'last_name'>>(
			db,
			`SELECT i.id, i.org_id, o.name AS org_name, i.email, i.role, i.expires_at, i.accepted_at
			   FROM organization_invites i
			   JOIN organizations o ON o.id = i.org_id
			  WHERE i.token = ?`,
			token
		);
		return legacy ? { ...legacy, role_ids: '[]', first_name: null, last_name: null } : null;
	}
}

const stillValid = (inv: InviteRow | null): inv is InviteRow =>
	!!inv && !inv.accepted_at && new Date(inv.expires_at) >= new Date();

/** The invite's role ids, as stored. Tampering is handled by `resolveRoles`, which
 *  only ever returns rows that exist in the invite's OWN organisation; this just
 *  turns an arbitrary JSON blob into a bounded list of strings. */
function parseRoleIds(raw: string | null | undefined): string[] {
	if (!raw) return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		const out: string[] = [];
		for (const v of parsed) {
			if (typeof v === 'string' && v.length > 0 && v.length <= 64 && !out.includes(v)) out.push(v);
		}
		return out.slice(0, 25);
	} catch {
		return [];
	}
}

/** Resolve role ids to real roles of `orgId`.
 *
 *  Both halves matter. A role may have been deleted between the invite being sent
 *  and accepted, and `role_ids` is a JSON string in a row — so an id belonging to
 *  another organisation must never attach here, however it got into the column.
 *  The `IN (...)` list is built from the COUNT of ids; every value is bound. */
async function resolveRoles(
	db: D1Database,
	orgId: string,
	roleIds: string[]
): Promise<{ id: string; name: string }[]> {
	if (roleIds.length === 0) return [];
	try {
		const placeholders = roleIds.map(() => '?').join(',');
		return await dbAll<{ id: string; name: string }>(
			db,
			`SELECT id, name FROM org_roles
			  WHERE org_id = ? AND id IN (${placeholders})
			  ORDER BY position DESC, name`,
			orgId,
			...roleIds
		);
	} catch {
		// Pre-0007 database: no roles to assign, and the legacy
		// organization_members.role below still grants exactly what it always did.
		return [];
	}
}

/** The plan's member cap, re-checked at acceptance.
 *
 *  It was only checked when the invite was created, so an owner could issue
 *  several invites while under the cap and every one of them would still be
 *  accepted. Returns the cap when there is no seat left, otherwise null.
 *  `userId` is null for someone who does not have an account yet — they cannot
 *  already be a member, so there is nothing to exempt. */
async function seatLimitHit(
	db: D1Database,
	orgId: string,
	userId: string | null
): Promise<number | null> {
	if (userId) {
		const already = await dbFirst<{ ok: number }>(
			db,
			'SELECT 1 AS ok FROM organization_members WHERE org_id = ? AND user_id = ? LIMIT 1',
			orgId,
			userId
		);
		if (already) return null;
	}
	const sub = await dbFirst<{ plan: string | null }>(
		db,
		'SELECT plan FROM subscriptions WHERE org_id = ?',
		orgId
	);
	const plan = (sub?.plan ?? 'free') as PlanId;
	if (await canAddMember(db, orgId, plan)) return null;
	return getPlan(plan).limits.maxMembers;
}

/** Join `userId` to the invite's organisation and burn the invite.
 *
 *  `organization_members.role` is still written: it is what identifies the owner
 *  and what every existing guard reads. It is clamped to admin/member — an
 *  invitation must never be able to mint a second owner, whatever sits in the row.
 *
 *  The upsert's `WHERE role <> 'owner'` is the other half of that: an invitation
 *  must not DEMOTE one either. A stale invite addressed to somebody who has since
 *  become the owner would otherwise overwrite their row with 'member' and leave the
 *  organisation with nobody who can close it or pay for it. */
async function joinOrg(db: D1Database, invite: InviteRow, userId: string): Promise<void> {
	const memberRole = invite.role === 'admin' ? 'admin' : 'member';

	await dbRun(
		db,
		`INSERT INTO organization_members (id, org_id, user_id, role)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT (org_id, user_id) DO UPDATE SET role = excluded.role
		   WHERE organization_members.role <> 'owner'`,
		crypto.randomUUID(),
		invite.org_id,
		userId,
		memberRole
	);

	// An admin also gets the Administrator role row, and with it an Administrator's
	// rank: the flag alone grants the permissions, and an admin invited with no role
	// ticked could then act on nobody in the People area. Skipped for an owner, whom
	// the upsert above left untouched.
	if (memberRole === 'admin') {
		const now = await dbFirst<{ role: string }>(
			db,
			'SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?',
			invite.org_id,
			userId
		);
		if (now?.role === 'admin') await syncAdministratorRole(db, invite.org_id, userId, true);
	}

	for (const role of await resolveRoles(db, invite.org_id, parseRoleIds(invite.role_ids))) {
		try {
			await dbRun(
				db,
				`INSERT INTO org_member_roles (id, org_id, user_id, role_id)
				 VALUES (?, ?, ?, ?)
				 ON CONFLICT (org_id, user_id, role_id) DO NOTHING`,
				crypto.randomUUID(),
				invite.org_id,
				userId,
				role.id
			);
		} catch {
			// Pre-0007 database — the legacy role above still applies.
		}
	}

	// `accepted_at IS NULL` makes this the single point where the invite is spent,
	// so two tabs submitting at once cannot both consume it.
	await dbRun(
		db,
		`UPDATE organization_invites SET accepted_at = datetime('now')
		  WHERE id = ? AND accepted_at IS NULL`,
		invite.id
	);
}

/**
 * Why an invite link no longer leads anywhere. Rendered by the page itself rather
 * than thrown: the generic error page showed "something went wrong on our side"
 * for a link that was simply used up, which sends people to support instead of
 * back to whoever invited them.
 */
type Unavailable = 'notFound' | 'used' | 'expired';

function unavailable(reason: Unavailable, token: string) {
	return {
		unavailable: reason,
		invite: null,
		token,
		signedInMatches: false,
		signedInDifferent: false,
		currentEmail: null,
		hasAccount: false
	};
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const invite = await loadInvite(locals.db, params.token);

	if (!invite) return unavailable('notFound', params.token);
	if (invite.accepted_at) return unavailable('used', params.token);
	if (new Date(invite.expires_at) < new Date()) return unavailable('expired', params.token);

	const email = invite.email.toLowerCase();
	const roles = await resolveRoles(locals.db, invite.org_id, parseRoleIds(invite.role_ids));

	// Org/platform accounts are globally unique by email (org_id IS NULL); client
	// accounts live in an org bubble and are a different kind of account entirely,
	// so they are deliberately not counted here.
	const existing = locals.user
		? null
		: await dbFirst<{ id: string }>(
				locals.db,
				'SELECT id FROM users WHERE email = ? AND org_id IS NULL',
				email
			);

	const signedInMatches =
		!!locals.user
		&& locals.user.account_type !== 'client'
		&& locals.user.email.toLowerCase() === email;

	return {
		unavailable: null as Unavailable | null,
		invite: {
			orgName: invite.org_name,
			email: invite.email,
			role: invite.role === 'admin' ? 'admin' : 'member',
			firstName: invite.first_name ?? '',
			lastName: invite.last_name ?? '',
			roleNames: roles.map((r) => r.name)
		},
		token: params.token,
		signedInMatches,
		// Someone else is signed in. Accepting would join the wrong account, so the
		// page offers to sign out rather than doing it quietly.
		signedInDifferent: !!locals.user && !signedInMatches,
		currentEmail: locals.user?.email ?? null,
		hasAccount: !!existing
	};
};

/** Every fail() spreads this so ActionData keeps ONE shape — otherwise the
 *  union's narrowest member drops the fields the form reads back. */
const formShape = { firstName: '', lastName: '' };

export const actions: Actions = {
	// Already signed in as the invited address → join.
	accept: async ({ params, locals, cookies }) => {
		// Encoded because this runs BEFORE the token has been looked up, so it is
		// still arbitrary path input rather than a known 24-hex invite token: raw,
		// a token carrying `&`, `#` or a decoded newline would be pasted straight
		// into a query value and a response header.
		if (!locals.user) {
			redirect(303, `/app/login?redirect=${encodeURIComponent(`/app/invite/${params.token}`)}`);
		}

		const invite = await loadInvite(locals.db, params.token);
		if (!stillValid(invite)) {
			return fail(410, { ...formShape, error: st(locals.locale).serverErrors.inviteNoLongerValid });
		}

		// An organisation invite is for a main Hallify account. A client account
		// belongs to one org's bubble and must never become a member this way.
		if (locals.user.account_type === 'client') {
			return fail(403, { ...formShape, error: st(locals.locale).serverErrors.inviteOrgAccountRequired });
		}

		// The invite is address-specific: never silently join the wrong account.
		if (invite.email.toLowerCase() !== locals.user.email.toLowerCase()) {
			return fail(403, { ...formShape, error: st(locals.locale).serverErrors.inviteDifferentEmail });
		}

		const capped = await seatLimitHit(locals.db, invite.org_id, locals.user.id);
		if (capped !== null) {
			return fail(403, { ...formShape, error: st(locals.locale).serverErrors.memberSeatLimit(capped) });
		}

		await joinOrg(locals.db, invite, locals.user.id);

		// Switch the session to the organisation they just joined.
		const sessionId = cookies.get('session_id');
		if (sessionId) {
			await dbRun(locals.db, 'UPDATE sessions SET current_org_id = ? WHERE id = ?', invite.org_id, sessionId);
		}

		redirect(303, '/app/');
	},

	// Signed out and no account for the invited address → set a password, and be
	// created, signed in and joined in one step. The password rules, the bcrypt
	// cost and the session all come from /app/register; this is not a second way
	// to make an account.
	register: async ({ params, request, cookies, locals, getClientAddress }) => {
		const invite = await loadInvite(locals.db, params.token);
		if (!stillValid(invite)) {
			return fail(410, { ...formShape, error: st(locals.locale).serverErrors.inviteNoLongerValid });
		}

		// Signed in already (another tab, say). Never create a second account, and
		// never act on an account the invite was not addressed to.
		if (locals.user) {
			if (
				locals.user.account_type === 'client'
				|| locals.user.email.toLowerCase() !== invite.email.toLowerCase()
			) {
				return fail(403, { ...formShape, error: st(locals.locale).serverErrors.inviteDifferentEmail });
			}
			// Right person, wrong form — reload into the accept state.
			redirect(303, `/app/invite/${params.token}`);
		}

		const data = await request.formData();
		const firstName = String(data.get('firstName') ?? '').trim();
		const lastName = String(data.get('lastName') ?? '').trim();
		const password = String(data.get('password') ?? '');
		// The address is the invite's, never the form's.
		const email = invite.email.toLowerCase();
		const entered = { firstName, lastName };

		if (!firstName || !lastName || !password) {
			return fail(400, { ...entered, error: st(locals.locale).serverErrors.allFieldsRequired });
		}

		// adapter-cloudflare reads the address from `cf-connecting-ip`, which only
		// Cloudflare sets — behind `wrangler dev` it is absent and getClientAddress()
		// hands back null, which rateLimitKey would then lowercase and throw on. The
		// fallback shares one bucket in that case, which limits harder, never less.
		const rl = await rateLimit(
			locals.db,
			rateLimitKey('register', getClientAddress() ?? 'unknown'),
			RATE_LIMITS.register
		);
		if (!rl.ok) {
			return fail(429, {
				...entered,
				error: tooManyAttemptsMessage(st(locals.locale).serverErrors.tooManyAttempts, rl.retryAfterMinutes)
			});
		}

		if (password.length < 6) {
			return fail(400, { ...entered, error: st(locals.locale).serverErrors.passwordMin6 });
		}

		const existing = await dbFirst<{ id: string }>(
			locals.db,
			'SELECT id FROM users WHERE email = ? AND org_id IS NULL',
			email
		);
		if (existing) {
			return fail(409, { ...entered, error: st(locals.locale).serverErrors.emailAlreadyRegisteredLogIn });
		}

		// Check the seat before the account exists, so a full organisation does not
		// leave a stranded Hallify account behind.
		const capped = await seatLimitHit(locals.db, invite.org_id, null);
		if (capped !== null) {
			return fail(403, { ...entered, error: st(locals.locale).serverErrors.memberSeatLimit(capped) });
		}

		// Same legacy `role` rule as /app/register: the very first org/platform
		// account on the instance is the platform admin, everybody else is a user.
		const countRow = await dbFirst<{ count: number }>(
			locals.db,
			'SELECT COUNT(*) AS count FROM users WHERE org_id IS NULL'
		);
		const legacyRole = (countRow?.count ?? 0) === 0 ? 'admin' : 'user';

		const hash = await bcrypt.hash(password, 12);
		const userId = crypto.randomUUID();
		try {
			await dbRun(
				locals.db,
				"INSERT INTO users (id, email, password_hash, first_name, last_name, role, account_type) VALUES (?, ?, ?, ?, ?, ?, 'organization')",
				userId,
				email,
				hash,
				firstName,
				lastName,
				legacyRole
			);
		} catch {
			// Lost a double-submit race against users_email_global_unique.
			return fail(409, { ...entered, error: st(locals.locale).serverErrors.emailAlreadyRegisteredLogIn });
		}

		// Join before the session is created: createSession points the new session
		// at the user's first organisation, which is the one they just joined.
		await joinOrg(locals.db, invite, userId);
		await createSession(userId, cookies, locals.db);

		redirect(303, '/app/');
	},

	// Signed in as the wrong account. Dropping the session here (rather than
	// linking to /app/logout, which lands on the login page) keeps them on the
	// invitation they were trying to accept.
	signOut: async ({ params, cookies, locals }) => {
		await deleteSession(cookies, locals.db);
		redirect(303, `/app/invite/${params.token}`);
	}
};
