import { fail } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { getPlan } from '$lib/plans';
import { sendOrgInviteEmail } from '$lib/email';
import { st } from '$lib/i18n-server';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';
import {
	can,
	canGrantAdminAccess,
	canManageRole,
	grantablePermissions,
	type MemberAccess
} from '$lib/permissions';
import {
	actorContext,
	buildAccess,
	loadOrgRoles,
	loadOverrides,
	loadRoleAssignments,
	type OrgRole
} from '$lib/server/people';
import { requireOrgPermission } from '$lib/server/access';
import {
	freshInviteToken,
	hasSeatForInvite,
	inviteLink,
	isValidInviteEmail,
	seatsSpokenFor
} from '$lib/server/invites';

/**
 * The Invites tab of the People area.
 *
 * An invite carries the roles its recipient will receive, so what somebody can do is
 * decided before they accept rather than remembered afterwards.
 *
 * ⚠️  Every action re-checks authorisation themselves and scope every statement with
 * `org_id = ?`. A layout's `load` does not run before a form action — see the warning
 * at the top of $lib/guards.
 */

interface InviteRow {
	id: string;
	email: string;
	token: string;
	expired: number;
	role: string;
	role_ids: string | null;
	first_name: string | null;
	last_name: string | null;
	expires_at: string;
	created_at: string;
	inviter_first: string | null;
	inviter_last: string | null;
	inviter_email: string | null;
}

const MAX_NAME = 80;

/** Where invite links point: the apex app, never a venue site. */
function linkBase(url: URL): string {
	return (env.APP_URL || url.origin).replace(/\/$/, '');
}

function parseIds(raw: string | null | undefined): string[] {
	try {
		const parsed = JSON.parse(raw ?? '[]');
		return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
	} catch {
		return [];
	}
}

export const load: PageServerLoad = async ({ locals, url }) => {
	await requireOrgPermission(locals, 'invites.manage');
	const org = locals.currentOrg!;
	const orgId = org.id;
	const meId = locals.user?.id ?? '';

	const roles = await loadOrgRoles(locals.db, orgId);
	const assignments = await loadRoleAssignments(locals.db, orgId);
	const overrides = await loadOverrides(locals.db, orgId);
	const actor = buildAccess({
		isOwner: org.role === 'owner',
		roleIds: assignments.get(meId) ?? [],
		roles,
		override: overrides.get(meId),
		legacyRole: org.role
	});

	const SELECT = (withRoleIds: boolean) => `
		SELECT i.id, i.email, i.token, i.role, i.expires_at, i.created_at,
		       CASE WHEN datetime(i.expires_at) > datetime('now') THEN 0 ELSE 1 END AS expired,
		       ${withRoleIds ? 'i.role_ids, i.first_name, i.last_name,' : "'[]' AS role_ids, NULL AS first_name, NULL AS last_name,"}
		       u.first_name AS inviter_first, u.last_name AS inviter_last, u.email AS inviter_email
		  FROM organization_invites i
		  LEFT JOIN users u ON u.id = i.invited_by
		 WHERE i.org_id = ? AND i.accepted_at IS NULL
		   AND datetime(i.expires_at) > datetime('now', '-30 days')
		 ORDER BY expired, i.created_at DESC`;

	let rows: InviteRow[];
	try {
		rows = await dbAll<InviteRow>(locals.db, SELECT(true), orgId);
	} catch {
		// Pre-migration 0007 the invite columns are not there yet; the list still works.
		rows = await dbAll<InviteRow>(locals.db, SELECT(false), orgId);
	}

	const invites = rows.map((r) => ({
		id: r.id,
		email: r.email,
		legacyRole: r.role,
		firstName: r.first_name ?? '',
		lastName: r.last_name ?? '',
		// Only roles that still exist in this org are shown: a deleted role grants
		// nothing on acceptance, so promising it in the list would be a lie.
		roleIds: parseIds(r.role_ids).filter((id) => roles.some((role) => role.id === id)),
		invitedBy: `${r.inviter_first ?? ''} ${r.inviter_last ?? ''}`.trim() || r.inviter_email || '',
		expiresAt: r.expires_at,
		createdAt: r.created_at,
		// Expired invites stay listed for 30 days so they can be resent rather than
		// silently vanishing. Their link no longer works, so it is not offered.
		expired: Number(r.expired) === 1,
		// The page is invites.manage-only, and anyone here can mint a link anyway, so
		// handing it out lets the inviter send it another way when e-mail fails.
		link: inviteLink(linkBase(url), r.token)
	}));

	return {
		invites,
		roles: roles.map((r) => ({
			id: r.id,
			name: r.name,
			color: r.color,
			isDefault: r.isDefault,
			// You may only pre-assign a role you could assign to an existing member.
			assignable: canManageRole(actor, r.position)
		})),
		canInvite: actor.isOwner || can(actor, 'invites.manage'),
		// The legacy Admin level carries every Administrator permission; offered only
		// to somebody who could grant each of them.
		canGrantAdmin: canGrantAdminAccess(actor),
		currentOrg: org
	};
};

/** Everything `invite` and `resend` both check before an invite is (re)issued. */
async function checkIssuable(
	locals: App.Locals,
	orgId: string,
	actor: MemberAccess,
	orgRoles: OrgRole[],
	invite: { email: string; role: string; roleIds: string[] }
): Promise<string | null> {
	const T = st(locals.locale);
	if (!['admin', 'member'].includes(invite.role)) return T.serverErrors.invalidRole;
	// Inviting someone as an admin hands them every Administrator permission (the
	// legacy flag implies them all), so it is granting each of those.
	if (invite.role === 'admin' && !canGrantAdminAccess(actor)) return T.peopleArea.errors.adminBeyondYou;

	// Roles to grant on acceptance: they must belong to THIS org and sit strictly
	// below the inviter's own rank — otherwise an invite would be a way to mint
	// somebody more senior than yourself.
	const grantable = grantablePermissions(actor);
	for (const id of invite.roleIds) {
		const found = orgRoles.find((r) => r.id === id);
		if (!found) return T.peopleArea.errors.unknownRole;
		if (!canManageRole(actor, found.position)) return T.peopleArea.errors.roleOutranksYou;
		// Rank alone is not enough: a role ranked below the actor can still carry
		// a permission above them. Pre-assigning it on an invitation is the
		// cleanest version of the escalation — invite an address you control,
		// and the account arrives holding something you could never grant
		// yourself.
		if (found.permissions.some((perm) => !grantable.has(perm))) return T.peopleArea.errors.roleGrantsBeyondYou;
	}

	// The plan's seat cap counts invites still waiting for an answer, not only
	// members: otherwise the second of two invites sent with one seat left is a
	// dead end for whoever receives it.
	const plan = locals.currentOrg!.subscription.plan;
	const limit = getPlan(plan).limits.maxMembers;
	if (!hasSeatForInvite(limit, await seatsSpokenFor(locals.db, orgId, invite.email))) {
		return T.serverErrors.memberSeatLimit(limit);
	}

	// Check if already a member. Scoped to `org_id IS NULL`, the accounts that can
	// BE members: the same address may also exist as a client account inside an
	// org's bubble (users_email_org_unique), and an unscoped lookup can return
	// that one instead — which would clear this guard and let an invite be
	// issued for somebody who is already in the organisation.
	const existingUser = await dbFirst<{ id: string }>(
		locals.db,
		'SELECT id FROM users WHERE email = ? AND org_id IS NULL',
		invite.email
	);
	if (existingUser) {
		const existing = await dbFirst<{ id: string }>(
			locals.db,
			'SELECT id FROM organization_members WHERE org_id = ? AND user_id = ?',
			orgId,
			existingUser.id
		);
		if (existing) return T.serverErrors.userAlreadyMember;
	}
	return null;
}

/** E-mail the link and say honestly whether it went. When it did not, the result
 *  carries the link so the inviter can send it another way. */
async function sendInvite(
	locals: App.Locals,
	url: URL,
	orgRoles: OrgRole[],
	invite: { email: string; role: string; roleIds: string[]; token: string },
	sentMessage: string
) {
	const T = st(locals.locale);
	const link = inviteLink(linkBase(url), invite.token);
	const inviterName = `${locals.user!.first_name ?? ''} ${locals.user!.last_name ?? ''}`.trim() || 'A teammate';
	const roleNames = invite.roleIds
		.map((id) => orgRoles.find((r) => r.id === id)?.name)
		.filter((n): n is string => !!n);
	const sent = await sendOrgInviteEmail(locals.db, invite.email, {
		orgName: locals.currentOrg!.name,
		inviterName,
		role: roleNames.length > 0 ? roleNames.join(', ') : invite.role,
		inviteUrl: link
	});
	// The invite exists either way, so this is not a fail(): the form must still
	// close and the row appear. But a failed send is reported as one, with the link.
	return sent
		? { success: true, message: sentMessage, emailFailed: false, inviteLink: null as string | null }
		: {
				success: true,
				message: T.peopleArea.errors.inviteEmailFailed(invite.email),
				emailFailed: true,
				inviteLink: link as string | null
			};
}

export const actions: Actions = {
	/** Create (or re-issue) an invite. */
	invite: async ({ request, locals, url }) => {
		const T = st(locals.locale);
		if (locals.currentOrg?.impersonated) return fail(403, { error: T.serverErrors.impersonationBlockThisOrg });

		const { orgId, access: actor } = await actorContext(locals);
		if (!actor.isOwner && !can(actor, 'invites.manage')) {
			return fail(403, { error: T.peopleArea.errors.noPermission });
		}

		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const role = String(data.get('role') ?? 'member');
		const firstName = String(data.get('first_name') ?? '').trim();
		const lastName = String(data.get('last_name') ?? '').trim();
		const roleIds = [...new Set(data.getAll('role_ids').map((v) => String(v)))];

		if (!email) return fail(400, { error: T.serverErrors.emailRequired });
		if (!isValidInviteEmail(email)) return fail(400, { error: T.serverErrors.enterValidEmail });
		if (firstName.length > MAX_NAME || lastName.length > MAX_NAME) {
			return fail(400, { error: T.peopleArea.errors.nameTooLong });
		}

		const orgRoles = await loadOrgRoles(locals.db, orgId);
		const refused = await checkIssuable(locals, orgId, actor, orgRoles, { email, role, roleIds });
		if (refused) return fail(403, { error: refused });

		// Upsert invite (reset token + expiry if re-inviting same email)
		const { token, expiresAt } = freshInviteToken();
		await dbRun(
			locals.db,
			`INSERT INTO organization_invites
			   (id, org_id, email, role, token, expires_at, invited_by, role_ids, first_name, last_name)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT (org_id, email) DO UPDATE
			   SET role = excluded.role,
			       token = excluded.token,
			       expires_at = excluded.expires_at,
			       accepted_at = NULL,
			       invited_by = excluded.invited_by,
			       role_ids = excluded.role_ids,
			       first_name = excluded.first_name,
			       last_name = excluded.last_name`,
			crypto.randomUUID(),
			orgId,
			email,
			role,
			token,
			expiresAt,
			locals.user!.id,
			JSON.stringify(roleIds),
			firstName || null,
			lastName || null
		);

		return sendInvite(locals, url, orgRoles, { email, role, roleIds, token }, T.serverErrors.inviteSent(email));
	},

	/**
	 * Send an existing invite again, with a new link and a fresh seven days. The old
	 * link stops working. Re-checked as if it were new: the inviter's rank, the seat
	 * cap and the roles may all have changed since it was first sent.
	 */
	resend: async ({ request, locals, url }) => {
		const T = st(locals.locale);
		if (locals.currentOrg?.impersonated) return fail(403, { error: T.serverErrors.impersonationBlockThisOrg });

		const { orgId, access: actor } = await actorContext(locals);
		if (!actor.isOwner && !can(actor, 'invites.manage')) {
			return fail(403, { error: T.peopleArea.errors.noPermission });
		}

		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		type Row = { email: string; role: string; role_ids: string | null };
		let row: Row | null;
		try {
			row = await dbFirst<Row>(
				locals.db,
				'SELECT email, role, role_ids FROM organization_invites WHERE id = ? AND org_id = ? AND accepted_at IS NULL',
				id,
				orgId
			);
		} catch {
			// Pre-migration 0007: no role_ids column.
			row = await dbFirst<Row>(
				locals.db,
				"SELECT email, role, '[]' AS role_ids FROM organization_invites WHERE id = ? AND org_id = ? AND accepted_at IS NULL",
				id,
				orgId
			);
		}
		if (!row) return fail(404, { error: T.peopleArea.errors.inviteGone });

		const orgRoles = await loadOrgRoles(locals.db, orgId);
		// A role deleted since the invite was sent simply drops off, as it would on
		// acceptance; it is not a reason to refuse the resend.
		const roleIds = parseIds(row.role_ids).filter((rid) => orgRoles.some((r) => r.id === rid));
		const invite = { email: row.email, role: row.role, roleIds };
		const refused = await checkIssuable(locals, orgId, actor, orgRoles, invite);
		if (refused) return fail(403, { error: refused });

		const { token, expiresAt } = freshInviteToken();
		try {
			await dbRun(
				locals.db,
				`UPDATE organization_invites
				    SET token = ?, expires_at = ?, invited_by = ?, role_ids = ?
				  WHERE id = ? AND org_id = ? AND accepted_at IS NULL`,
				token,
				expiresAt,
				locals.user!.id,
				JSON.stringify(roleIds),
				id,
				orgId
			);
		} catch {
			await dbRun(
				locals.db,
				`UPDATE organization_invites SET token = ?, expires_at = ?, invited_by = ?
				  WHERE id = ? AND org_id = ? AND accepted_at IS NULL`,
				token,
				expiresAt,
				locals.user!.id,
				id,
				orgId
			);
		}

		return sendInvite(locals, url, orgRoles, { ...invite, token }, T.peopleArea.errors.inviteResent(row.email));
	},

	revoke: async ({ request, locals }) => {
		const T = st(locals.locale);
		if (locals.currentOrg?.impersonated) return fail(403, { error: T.serverErrors.impersonationBlockThisOrg });

		const { orgId, access: actor } = await actorContext(locals);
		if (!actor.isOwner && !can(actor, 'invites.manage')) {
			return fail(403, { error: T.peopleArea.errors.noPermission });
		}

		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const res = await dbRun(locals.db, 'DELETE FROM organization_invites WHERE id = ? AND org_id = ?', id, orgId);
		// Nothing deleted means there was nothing to revoke (already accepted, revoked
		// in another tab, or an id from elsewhere): say so instead of "revoked".
		if (!res.meta?.changes) return fail(404, { error: T.peopleArea.errors.inviteGone });
		return { success: true, message: T.peopleArea.errors.inviteRevoked };
	}
};
