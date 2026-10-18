import { fail } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { OrgMemberRow } from '$lib/db/index';
import { orgMemberCount } from '$lib/orgLifecycle';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';
import { requireOrgStaff } from '$lib/guards';
import {
	PERMISSIONS,
	can,
	canManageMember,
	canManageRole,
	effectivePermissions,
	grantablePermissions,
	parsePermissions,
	type MemberAccess,
	type Permission
} from '$lib/permissions';
import {
	actorContext,
	buildAccess,
	loadOrgRoles,
	loadOverrides,
	loadRoleAssignments,
	targetMemberAccess
} from '$lib/server/people';

/**
 * The Members tab of the People area.
 *
 * ⚠️  Every action below re-checks authorisation itself. SvelteKit does not run
 * `load` before a form action, so the guard in /app/manage/+layout.server.ts stops
 * navigation and nothing else — see the warning at the top of $lib/guards. Each
 * action also scopes its SQL with `org_id = ?`: being staff of one org is not
 * permission to act on another org's rows by id.
 */

/** The shared preamble of every mutating action here. */
async function actorFor(locals: App.Locals) {
	const { orgId, access } = await actorContext(locals);
	return { orgId, access };
}

function denied(locals: App.Locals) {
	return fail(403, { error: st(locals.locale).peopleArea.errors.noPermission });
}

export const load: PageServerLoad = async ({ locals }) => {
	const org = locals.currentOrg!;
	const orgId = org.id;
	const meId = locals.user?.id ?? '';

	const members = await dbAll<OrgMemberRow>(
		locals.db,
		`SELECT m.*, u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name
		   FROM organization_members m
		   JOIN users u ON u.id = m.user_id
		  WHERE m.org_id = ?
		  ORDER BY m.role, u.first_name`,
		orgId
	);

	const roles = await loadOrgRoles(locals.db, orgId);
	const assignments = await loadRoleAssignments(locals.db, orgId);
	const overrides = await loadOverrides(locals.db, orgId);

	// The caller's own access, built from the same lists the rows below use, so the
	// page cannot show one answer while the actions enforce another.
	const actor: MemberAccess = buildAccess({
		isOwner: org.role === 'owner',
		roleIds: assignments.get(meId) ?? [],
		roles,
		override: overrides.get(meId)
	});
	const grantable = [...grantablePermissions(actor)];

	const people = members.map((m) => {
		const isOwner = m.role === 'owner';
		const access = buildAccess({
			isOwner,
			roleIds: assignments.get(m.user_id) ?? [],
			roles,
			override: overrides.get(m.user_id)
		});
		// What the member's ROLES alone grant — the "inherited" leg of the tri-state.
		const inherited = new Set<Permission>();
		for (const r of access.roles) for (const p of r.permissions) inherited.add(p);

		return {
			userId: m.user_id,
			email: m.user_email ?? '',
			firstName: m.user_first_name ?? '',
			lastName: m.user_last_name ?? '',
			legacyRole: m.role,
			joinedAt: m.joined_at,
			isOwner,
			isMe: m.user_id === meId,
			// Everything they hold (the default role included, since it is implicit)…
			roleIds: access.roles.map((r) => r.id),
			// …and the rows that actually exist, which is what the checkboxes edit.
			explicitRoleIds: assignments.get(m.user_id) ?? [],
			inherited: [...inherited],
			allow: access.allow ?? [],
			deny: access.deny ?? [],
			effective: [...effectivePermissions(access)],
			canManage: canManageMember(actor, access)
		};
	});

	return {
		people,
		roles: roles.map((r) => ({
			id: r.id,
			name: r.name,
			color: r.color,
			position: r.position,
			isDefault: r.isDefault,
			// Strictly below the caller's own rank — including the role that grants
			// them the power, so nobody escalates by editing their own.
			assignable: canManageRole(actor, r.position)
		})),
		// What the caller may put on somebody else. Anything outside this set is
		// rendered read-only and refused server side.
		actor: { isOwner: actor.isOwner, grantable },
		totalPermissions: PERMISSIONS.length,
		currentOrg: org
	};
};

export const actions: Actions = {
	/**
	 * Assign / un-assign roles for one member.
	 *
	 * Refuses a role at or above the caller's own rank, a role belonging to another
	 * organisation, and any action on the owner. Roles the caller may NOT manage are
	 * carried over untouched rather than dropped — a save must not quietly strip a
	 * role the caller cannot even see the controls for.
	 */
	setRoles: async ({ request, locals }) => {
		const T = st(locals.locale);
		if (locals.currentOrg?.impersonated) return fail(403, { error: T.serverErrors.impersonationBlockThisOrg });

		const { orgId, access: actor } = await actorFor(locals);
		if (!actor.isOwner && !can(actor, 'members.manage')) return denied(locals);

		const data = await request.formData();
		const userId = String(data.get('user_id') ?? '');

		const target = await targetMemberAccess(locals.db, orgId, userId);
		if (!target) return fail(404, { error: T.peopleArea.errors.notMember });
		if (!canManageMember(actor, target.access)) return fail(403, { error: T.peopleArea.errors.cannotManageMember });

		const roles = await loadOrgRoles(locals.db, orgId);
		const byId = new Map(roles.map((r) => [r.id, r]));
		const existing = (
			await dbAll<{ role_id: string }>(
				locals.db,
				'SELECT role_id FROM org_member_roles WHERE org_id = ? AND user_id = ?',
				orgId,
				userId
			)
		).map((r) => r.role_id);

		const grantable = grantablePermissions(actor);
		const submitted = data.getAll('role_ids').map((v) => String(v));
		for (const id of submitted) {
			const role = byId.get(id);
			if (!role) return fail(400, { error: T.peopleArea.errors.unknownRole });
			// An unmanageable role may be re-submitted only if it is already held
			// (i.e. nothing changes); granting one is an escalation.
			if (!canManageRole(actor, role.position) && !existing.includes(id)) {
				return fail(403, { error: T.peopleArea.errors.roleOutranksYou });
			}
			// Rank alone is not enough. A role BELOW the actor can still carry a
			// permission ABOVE them, and assigning it hands that permission to an
			// account of their choosing — their own sock puppet, invited a moment
			// earlier. Without this, holding members.manage is a two-step route to
			// every permission in the organisation, which is exactly what
			// grantablePermissions exists to prevent on the role editor.
			if (!existing.includes(id)) {
				const beyond = role.permissions.filter((p) => !grantable.has(p));
				if (beyond.length > 0) {
					return fail(403, { error: T.peopleArea.errors.roleGrantsBeyondYou });
				}
			}
		}

		// Carried over, never diffed away: roles the caller may not manage, roles from
		// another org that somehow sit on the row, and the default role — it applies
		// to every member implicitly, so its row is not the form's to delete.
		const desired = new Set(existing.filter((id) => {
			const role = byId.get(id);
			return !role || role.isDefault || !canManageRole(actor, role.position);
		}));
		for (const id of submitted) desired.add(id);

		for (const id of [...desired].filter((id) => !existing.includes(id))) {
			await dbRun(
				locals.db,
				`INSERT INTO org_member_roles (id, org_id, user_id, role_id)
				 VALUES (?, ?, ?, ?)
				 ON CONFLICT (org_id, user_id, role_id) DO NOTHING`,
				crypto.randomUUID(),
				orgId,
				userId,
				id
			);
		}
		for (const id of existing.filter((id) => !desired.has(id))) {
			await dbRun(
				locals.db,
				'DELETE FROM org_member_roles WHERE org_id = ? AND user_id = ? AND role_id = ?',
				orgId,
				userId,
				id
			);
		}

		return { success: true, message: T.peopleArea.errors.rolesSaved };
	},

	/**
	 * Set one member's per-member allow / deny lists.
	 *
	 * A permission the caller does not hold is neither grantable nor revocable here:
	 * its current state is carried over verbatim. Clearing someone else's deny on a
	 * permission you lack would hand them access you cannot grant.
	 */
	setOverrides: async ({ request, locals }) => {
		const T = st(locals.locale);
		if (locals.currentOrg?.impersonated) return fail(403, { error: T.serverErrors.impersonationBlockThisOrg });

		const { orgId, access: actor } = await actorFor(locals);
		if (!actor.isOwner && !can(actor, 'members.manage')) return denied(locals);

		const data = await request.formData();
		const userId = String(data.get('user_id') ?? '');

		const target = await targetMemberAccess(locals.db, orgId, userId);
		if (!target) return fail(404, { error: T.peopleArea.errors.notMember });
		if (!canManageMember(actor, target.access)) return fail(403, { error: T.peopleArea.errors.cannotManageMember });

		const grantable = grantablePermissions(actor);
		const current = await dbFirst<{ allow: string; deny: string }>(
			locals.db,
			'SELECT allow, deny FROM org_member_overrides WHERE org_id = ? AND user_id = ?',
			orgId,
			userId
		);
		const currentAllow = parsePermissions(current?.allow);
		const currentDeny = parsePermissions(current?.deny);

		const allow: Permission[] = [];
		const deny: Permission[] = [];
		for (const permission of PERMISSIONS) {
			let state: string;
			if (grantable.has(permission)) {
				const raw = data.get(`p:${permission}`);
				state = typeof raw === 'string' ? raw : 'inherit';
				if (state !== 'inherit' && state !== 'allow' && state !== 'deny') {
					return fail(400, { error: T.peopleArea.errors.invalidState });
				}
			} else {
				state = currentAllow.includes(permission)
					? 'allow'
					: currentDeny.includes(permission)
						? 'deny'
						: 'inherit';
			}
			if (state === 'allow') allow.push(permission);
			else if (state === 'deny') deny.push(permission);
		}

		await dbRun(
			locals.db,
			`INSERT INTO org_member_overrides (org_id, user_id, allow, deny, updated_at)
			 VALUES (?, ?, ?, ?, datetime('now'))
			 ON CONFLICT (org_id, user_id) DO UPDATE
			   SET allow = excluded.allow, deny = excluded.deny, updated_at = datetime('now')`,
			orgId,
			userId,
			JSON.stringify(allow),
			JSON.stringify(deny)
		);

		return { success: true, message: T.peopleArea.errors.overridesSaved };
	},

	/**
	 * The legacy `organization_members.role` — admin or member.
	 *
	 * It is NOT the role system: it is the flag every existing guard still reads to
	 * decide who reaches /app/manage at all, so it stays, and it stays editable.
	 * Ownership is not transferable from here — the owner is not a role, and
	 * `canManageMember` refuses to act on them in any case.
	 */
	changeRole: async ({ request, locals }) => {
		const T = st(locals.locale);
		// Staff-only, as before: handing out the legacy admin flag is handing out the
		// whole manage area, so only someone who already has it may do so.
		requireOrgStaff(locals);
		if (locals.currentOrg?.impersonated) return fail(403, { error: T.serverErrors.impersonationBlockThisOrg });

		const { orgId, access: actor } = await actorFor(locals);
		if (!actor.isOwner && !can(actor, 'members.manage')) return denied(locals);

		const data = await request.formData();
		const userId = String(data.get('user_id') ?? '');
		const role = String(data.get('role') ?? '');
		if (role !== 'admin' && role !== 'member') return fail(400, { error: T.serverErrors.invalidRole });

		const target = await targetMemberAccess(locals.db, orgId, userId);
		if (!target) return fail(404, { error: T.peopleArea.errors.notMember });
		if (!canManageMember(actor, target.access)) return fail(403, { error: T.peopleArea.errors.cannotManageMember });

		await dbRun(
			locals.db,
			'UPDATE organization_members SET role = ? WHERE org_id = ? AND user_id = ?',
			role,
			orgId,
			userId
		);
		return { success: true, message: T.peopleArea.errors.accessSaved };
	},

	/** Remove a member. Validation unchanged from the old Members page, plus the
	 *  rank check: you may only remove somebody ranked below you. */
	remove: async ({ request, locals }) => {
		requireOrgStaff(locals);
		const T = st(locals.locale);
		if (locals.currentOrg?.impersonated) return fail(403, { error: T.serverErrors.impersonationBlockThisOrg });
		// Defense-in-depth: this action mutates membership, so re-check the caller's
		// role explicitly rather than relying solely on the manage-layout guard.
		if (locals.currentOrg?.role !== 'owner' && locals.currentOrg?.role !== 'admin') {
			return fail(403, { error: T.serverErrors.noPermissionRemoveMembers });
		}
		const orgId = locals.currentOrg!.id;
		const data = await request.formData();
		const userId = String(data.get('user_id') ?? '');

		const { access: actor } = await actorFor(locals);
		if (!actor.isOwner && !can(actor, 'members.manage')) return denied(locals);
		const target = await targetMemberAccess(locals.db, orgId, userId);
		if (!target) return fail(404, { error: T.peopleArea.errors.notMember });
		if (!canManageMember(actor, target.access)) return fail(403, { error: T.peopleArea.errors.cannotManageMember });

		// An org must never be left empty — the last member must close it instead.
		if ((await orgMemberCount(locals.db, orgId)) <= 1) {
			return fail(400, { error: T.serverErrors.lastMemberCloseOrg });
		}

		// Cannot remove the only owner (org must always keep an owner).
		const ownerCountRow = await dbFirst<{ count: number }>(
			locals.db,
			`SELECT COUNT(*) AS count FROM organization_members WHERE org_id = ? AND role = 'owner'`,
			orgId
		);
		if (target.legacyRole === 'owner' && Number(ownerCountRow?.count ?? 0) <= 1) {
			return fail(400, { error: T.serverErrors.cannotRemoveOnlyOwner });
		}

		await dbRun(locals.db, 'DELETE FROM organization_members WHERE org_id = ? AND user_id = ?', orgId, userId);
		// Their roles and overrides belong to the membership, not to the person.
		try {
			await dbRun(locals.db, 'DELETE FROM org_member_roles WHERE org_id = ? AND user_id = ?', orgId, userId);
			await dbRun(locals.db, 'DELETE FROM org_member_overrides WHERE org_id = ? AND user_id = ?', orgId, userId);
		} catch {
			/* pre-migration: nothing to clean up */
		}
		return { success: true, message: T.peopleArea.errors.memberRemoved };
	}
};
