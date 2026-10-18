import { error } from '@sveltejs/kit';
import { dbAll, dbFirst } from '$lib/db/index';
import {
	parsePermissions,
	type MemberAccess,
	type MemberRole,
	type Permission
} from '$lib/permissions';

/**
 * Loading and enforcing a member's effective permissions.
 *
 * This layer is ADDITIVE. `requireOrgStaff` and `requireOrgOwner` still exist and
 * still work — 114 call sites depend on them — and `organization_members.role` is
 * still what identifies the owner. Routes move onto `requirePermission` one at a
 * time; until one does, it behaves exactly as it did before.
 */

/** Everything needed to evaluate a permission, for one member of one org. */
export async function loadMemberAccess(
	db: App.Locals['db'],
	orgId: string,
	userId: string,
	opts: { isOwner: boolean }
): Promise<MemberAccess> {
	if (opts.isOwner) return { isOwner: true, roles: [] };

	let roles: MemberRole[] = [];
	let allow: Permission[] = [];
	let deny: Permission[] = [];

	try {
		const rows = await dbAll<{ id: string; name: string; position: number; permissions: string }>(
			db,
			// `r.org_id = mr.org_id` is not redundant. Scoping the ASSIGNMENT row by
			// org is not the same as scoping the ROLE it points at: a single
			// org_member_roles row naming a role of another organisation would
			// otherwise be loaded here with that foreign role's position and
			// permissions — i.e. a rank and an access level minted outside this org.
			// Nothing writes such a row today; this is the join that must not rely
			// on that staying true.
			`SELECT r.id, r.name, r.position, r.permissions
			   FROM org_member_roles mr
			   JOIN org_roles r ON r.id = mr.role_id AND r.org_id = mr.org_id
			  WHERE mr.org_id = ? AND mr.user_id = ?`,
			orgId,
			userId
		);
		roles = rows.map((r) => ({
			id: r.id,
			name: r.name,
			position: r.position,
			permissions: parsePermissions(r.permissions)
		}));

		// The default role applies to every member whether or not it was assigned,
		// so a new member is never left with nothing at all.
		const fallback = await dbFirst<{ id: string; name: string; position: number; permissions: string }>(
			db,
			`SELECT id, name, position, permissions FROM org_roles
			  WHERE org_id = ? AND is_default = 1 LIMIT 1`,
			orgId
		);
		if (fallback && !roles.some((r) => r.id === fallback.id)) {
			roles.push({
				id: fallback.id,
				name: fallback.name,
				position: fallback.position,
				permissions: parsePermissions(fallback.permissions)
			});
		}

		const override = await dbFirst<{ allow: string; deny: string }>(
			db,
			'SELECT allow, deny FROM org_member_overrides WHERE org_id = ? AND user_id = ?',
			orgId,
			userId
		);
		allow = parsePermissions(override?.allow);
		deny = parsePermissions(override?.deny);
	} catch {
		// Tables arrive with migration 0007. Before it lands, a member simply has no
		// roles — and because every existing guard still reads
		// organization_members.role, nobody is locked out of anything mid-rollout.
		return { isOwner: false, roles: [] };
	}

	return { isOwner: false, roles, allow, deny };
}

/**
 * Guard a mutating action on a permission.
 *
 * Read the warning at the top of $lib/guards before using this: SvelteKit does not
 * run `load` before a form action, so a check in a layout protects navigation and
 * nothing else. Every action must call this itself.
 */
export function requirePermission(access: MemberAccess, permission: Permission): void {
	if (access.isOwner) return;
	const held = new Set<Permission>();
	for (const role of access.roles) for (const p of role.permissions) held.add(p);
	for (const p of access.allow ?? []) held.add(p);
	for (const p of access.deny ?? []) held.delete(p);
	if (!held.has(permission)) error(403, 'Forbidden');
}
