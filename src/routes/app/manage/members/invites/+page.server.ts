import { fail } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { getPlan } from '$lib/plans';
import { canAddMember } from '$lib/limits';
import { sendOrgInviteEmail } from '$lib/email';
import { st } from '$lib/i18n-server';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';
import { requireOrgStaff } from '$lib/guards';
import { can, canManageRole } from '$lib/permissions';
import { actorContext, buildAccess, loadOrgRoles, loadOverrides, loadRoleAssignments } from '$lib/server/people';

/**
 * The Invites tab of the People area.
 *
 * An invite carries the roles its recipient will receive, so what somebody can do is
 * decided before they accept rather than remembered afterwards.
 *
 * ⚠️  Both actions re-check authorisation themselves and scope every statement with
 * `org_id = ?`. A layout's `load` does not run before a form action — see the warning
 * at the top of $lib/guards.
 */

interface InviteRow {
	id: string;
	email: string;
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

export const load: PageServerLoad = async ({ locals }) => {
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
		override: overrides.get(meId)
	});

	const SELECT = (withRoleIds: boolean) => `
		SELECT i.id, i.email, i.role, i.expires_at, i.created_at,
		       ${withRoleIds ? 'i.role_ids, i.first_name, i.last_name,' : "'[]' AS role_ids, NULL AS first_name, NULL AS last_name,"}
		       u.first_name AS inviter_first, u.last_name AS inviter_last, u.email AS inviter_email
		  FROM organization_invites i
		  LEFT JOIN users u ON u.id = i.invited_by
		 WHERE i.org_id = ? AND i.accepted_at IS NULL AND i.expires_at > datetime('now')
		 ORDER BY i.created_at DESC`;

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
		roleIds: (() => {
			let ids: string[] = [];
			try {
				const parsed = JSON.parse(r.role_ids ?? '[]');
				if (Array.isArray(parsed)) ids = parsed.filter((v): v is string => typeof v === 'string');
			} catch {
				ids = [];
			}
			return ids.filter((id) => roles.some((role) => role.id === id));
		})(),
		invitedBy: `${r.inviter_first ?? ''} ${r.inviter_last ?? ''}`.trim() || r.inviter_email || '',
		expiresAt: r.expires_at,
		createdAt: r.created_at
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
		currentOrg: org
	};
};

export const actions: Actions = {
	/** Create (or re-issue) an invite. The plan's seat cap and the existing email /
	 *  already-a-member validation are unchanged; the roles are new. */
	invite: async ({ request, locals, url }) => {
		requireOrgStaff(locals);
		const T = st(locals.locale);
		if (locals.currentOrg?.impersonated) return fail(403, { error: T.serverErrors.impersonationBlockThisOrg });

		const { orgId, access: actor } = await actorContext(locals);
		if (!actor.isOwner && !can(actor, 'invites.manage')) {
			return fail(403, { error: T.peopleArea.errors.noPermission });
		}

		const data = await request.formData();
		const email = (data.get('email') as string)?.trim().toLowerCase();
		const role = (data.get('role') as string) ?? 'member';
		const firstName = ((data.get('first_name') as string) ?? '').trim();
		const lastName = ((data.get('last_name') as string) ?? '').trim();

		if (!email) return fail(400, { error: T.serverErrors.emailRequired });
		if (!['admin', 'member'].includes(role)) return fail(400, { error: T.serverErrors.invalidRole });
		if (firstName.length > MAX_NAME || lastName.length > MAX_NAME) {
			return fail(400, { error: T.peopleArea.errors.nameTooLong });
		}

		// Roles to grant on acceptance: they must belong to THIS org and sit strictly
		// below the inviter's own rank — otherwise an invite would be a way to mint
		// somebody more senior than yourself.
		const orgRoles = await loadOrgRoles(locals.db, orgId);
		const roleIds: string[] = [];
		for (const raw of data.getAll('role_ids')) {
			const id = String(raw);
			const found = orgRoles.find((r) => r.id === id);
			if (!found) return fail(400, { error: T.peopleArea.errors.unknownRole });
			if (!canManageRole(actor, found.position)) {
				return fail(403, { error: T.peopleArea.errors.roleOutranksYou });
			}
			if (!roleIds.includes(id)) roleIds.push(id);
		}

		// Enforce the plan's member (seat) limit.
		if (!(await canAddMember(locals.db, orgId, locals.currentOrg!.subscription.plan))) {
			const limit = getPlan(locals.currentOrg!.subscription.plan).limits.maxMembers;
			return fail(403, { error: T.serverErrors.memberSeatLimit(limit) });
		}

		// Check if already a member. Scoped to `org_id IS NULL`, the accounts that can
		// BE members: the same address may also exist as a client account inside an
		// org's bubble (users_email_org_unique), and an unscoped lookup can return
		// that one instead — which would clear this guard and let an invite be
		// issued for somebody who is already in the organisation.
		const existingUser = await dbFirst<{ id: string }>(
			locals.db,
			'SELECT id FROM users WHERE email = ? AND org_id IS NULL',
			email
		);
		if (existingUser) {
			const existing = await dbFirst<{ id: string }>(
				locals.db,
				'SELECT id FROM organization_members WHERE org_id = ? AND user_id = ?',
				orgId,
				existingUser.id
			);
			if (existing) return fail(400, { error: T.serverErrors.userAlreadyMember });
		}

		// Upsert invite (reset token + expiry if re-inviting same email)
		const token = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
		const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
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

		// Email the invite link (apex app — invites are accepted off-bubble).
		const base = (env.APP_URL || url.origin).replace(/\/$/, '');
		const inviterName = `${locals.user!.first_name ?? ''} ${locals.user!.last_name ?? ''}`.trim() || 'A teammate';
		const roleNames = roleIds
			.map((id) => orgRoles.find((r) => r.id === id)?.name)
			.filter((n): n is string => !!n);
		const sent = await sendOrgInviteEmail(locals.db, email, {
			orgName: locals.currentOrg!.name,
			inviterName,
			role: roleNames.length > 0 ? roleNames.join(', ') : role,
			inviteUrl: `${base}/app/invite/${token}`
		});

		return {
			success: true,
			message: sent
				? T.serverErrors.inviteSent(email)
				: T.serverErrors.inviteCreatedEmailFailed(email)
		};
	},

	revoke: async ({ request, locals }) => {
		requireOrgStaff(locals);
		const T = st(locals.locale);
		if (locals.currentOrg?.impersonated) return fail(403, { error: T.serverErrors.impersonationBlockThisOrg });

		const { orgId, access: actor } = await actorContext(locals);
		if (!actor.isOwner && !can(actor, 'invites.manage')) {
			return fail(403, { error: T.peopleArea.errors.noPermission });
		}

		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		await dbRun(locals.db, 'DELETE FROM organization_invites WHERE id = ? AND org_id = ?', id, orgId);
		return { success: true, message: T.peopleArea.errors.inviteRevoked };
	}
};
