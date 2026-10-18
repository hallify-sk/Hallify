/**
 * Shared loading for the People area (Members / Roles / Invites).
 *
 * `$lib/server/access` answers "what may THIS caller do". This module answers the
 * list-shaped question the People pages ask: every role in the org, who holds what,
 * and the per-member overrides — in a handful of queries rather than one round trip
 * per member.
 *
 * The permission maths is NOT reimplemented here. Everything below hands its result
 * to `effectivePermissions` / `canManageRole` / `canManageMember` in `$lib/permissions`.
 *
 * Every query is scoped with `org_id = ?`. Being an owner somewhere is not permission
 * to read or write another organisation's rows.
 */
import { dbAll, dbFirst } from '$lib/db/index';
import { requireOrg, requireUser } from '$lib/guards';
import { loadMemberAccess } from '$lib/server/access';
import {
	canManageRole,
	parsePermissions,
	type MemberAccess,
	type MemberRole,
	type Permission
} from '$lib/permissions';
import type { OrgContext } from '../../app.d';

type Db = App.Locals['db'];

export interface OrgRole {
	id: string;
	name: string;
	color: string | null;
	position: number;
	permissions: Permission[];
	isDefault: boolean;
}

export interface MemberOverride {
	allow: Permission[];
	deny: Permission[];
}

/**
 * Every role in one organisation, most senior first.
 *
 * The roles tables arrive with migration 0007. Before it is applied, this returns an
 * empty list rather than throwing — exactly as `loadMemberAccess` does — so the page
 * degrades to "no roles yet" instead of a 500.
 */
export async function loadOrgRoles(db: Db, orgId: string): Promise<OrgRole[]> {
	try {
		const rows = await dbAll<{
			id: string;
			name: string;
			color: string | null;
			position: number;
			permissions: string;
			is_default: number;
		}>(
			db,
			`SELECT id, name, color, position, permissions, is_default
			   FROM org_roles
			  WHERE org_id = ?
			  ORDER BY position DESC, name`,
			orgId
		);
		return rows.map((r) => ({
			id: r.id,
			name: r.name,
			color: r.color,
			position: r.position,
			permissions: parsePermissions(r.permissions),
			isDefault: r.is_default === 1
		}));
	} catch {
		return [];
	}
}

/** userId → the role ids explicitly granted to them (the default role is implicit). */
export async function loadRoleAssignments(db: Db, orgId: string): Promise<Map<string, string[]>> {
	const out = new Map<string, string[]>();
	try {
		const rows = await dbAll<{ user_id: string; role_id: string }>(
			db,
			'SELECT user_id, role_id FROM org_member_roles WHERE org_id = ?',
			orgId
		);
		for (const r of rows) {
			const list = out.get(r.user_id);
			if (list) list.push(r.role_id);
			else out.set(r.user_id, [r.role_id]);
		}
	} catch {
		/* pre-migration: nobody holds a role */
	}
	return out;
}

/** userId → their per-member allow/deny lists. */
export async function loadOverrides(db: Db, orgId: string): Promise<Map<string, MemberOverride>> {
	const out = new Map<string, MemberOverride>();
	try {
		const rows = await dbAll<{ user_id: string; allow: string; deny: string }>(
			db,
			'SELECT user_id, allow, deny FROM org_member_overrides WHERE org_id = ?',
			orgId
		);
		for (const r of rows) {
			out.set(r.user_id, { allow: parsePermissions(r.allow), deny: parsePermissions(r.deny) });
		}
	} catch {
		/* pre-migration: no overrides exist */
	}
	return out;
}

/**
 * Assemble one member's access from already-loaded lists.
 *
 * This MUST agree with `loadMemberAccess`, which is what the server enforces with —
 * including its rule that the default role applies to every member whether or not it
 * was explicitly assigned. A list that disagreed with the enforcer would show an
 * admin one answer and apply another.
 */
export function buildAccess(opts: {
	isOwner: boolean;
	roleIds: readonly string[];
	roles: readonly OrgRole[];
	override?: MemberOverride;
}): MemberAccess {
	if (opts.isOwner) return { isOwner: true, roles: [] };

	const held: MemberRole[] = [];
	for (const id of opts.roleIds) {
		const role = opts.roles.find((r) => r.id === id);
		if (role) held.push({ id: role.id, name: role.name, position: role.position, permissions: role.permissions });
	}

	const fallback = opts.roles.find((r) => r.isDefault);
	if (fallback && !held.some((r) => r.id === fallback.id)) {
		held.push({
			id: fallback.id,
			name: fallback.name,
			position: fallback.position,
			permissions: fallback.permissions
		});
	}

	return {
		isOwner: false,
		roles: held,
		allow: opts.override?.allow ?? [],
		deny: opts.override?.deny ?? []
	};
}

/** The role ids a member effectively holds, default role included. */
export function heldRoleIds(access: MemberAccess): string[] {
	return access.roles.map((r) => r.id);
}

/** Roles `actor` may assign, un-assign or edit: strictly below their own rank. */
export function assignableRoles(actor: MemberAccess, roles: readonly OrgRole[]): OrgRole[] {
	return roles.filter((r) => canManageRole(actor, r.position));
}

/**
 * The caller's own context inside an action: the org, their id, and their access.
 *
 * Use this at the top of EVERY mutating action in the People area. A guard in a
 * layout's `load` does not run before a form action — see the warning in $lib/guards.
 */
export async function actorContext(
	locals: App.Locals
): Promise<{ org: OrgContext; orgId: string; userId: string; access: MemberAccess }> {
	const user = requireUser(locals);
	const org = requireOrg(locals);
	const access = await loadMemberAccess(locals.db, org.id, user.id, { isOwner: org.role === 'owner' });
	return { org, orgId: org.id, userId: user.id, access };
}

/**
 * The target member's access, or null when they are not in the caller's org.
 *
 * Scoped by org_id: an id posted by hand must not reach another organisation's member.
 */
export async function targetMemberAccess(
	db: Db,
	orgId: string,
	userId: string
): Promise<{ legacyRole: string; access: MemberAccess } | null> {
	if (!userId) return null;
	const row = await dbFirst<{ role: string }>(
		db,
		'SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?',
		orgId,
		userId
	);
	if (!row) return null;
	const access = await loadMemberAccess(db, orgId, userId, { isOwner: row.role === 'owner' });
	return { legacyRole: row.role, access };
}
