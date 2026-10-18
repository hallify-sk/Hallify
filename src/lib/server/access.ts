import { error } from '@sveltejs/kit';
import { requireOrg } from '$lib/guards';
import type { OrgContext } from '../../app.d';
import { dbAll, dbFirst } from '$lib/db/index';
import {
	ADMINISTRATOR_PERMISSIONS,
	CONSOLE_PERMISSIONS,
	effectivePermissions,
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

/**
 * The guard the /app/manage/** routes use: resolve the caller's access, then
 * require one permission. Returns the org context so callers keep the shape
 * `requireOrgStaff` gave them.
 *
 * Replaces `requireOrgStaff` one route at a time. The two are NOT equivalent, and
 * the difference is deliberate:
 *
 *   owner   bypasses both.
 *   admin   gets every permission except billing.manage — from the seeded
 *           Administrator role, or, for an admin minted without that role row, from
 *           the legacy-flag fallback below. Either way an admin keeps everything they
 *           had. Billing is already requireOrgOwner, so nothing regresses there.
 *   member  holds only the default role's VIEW permissions. Every call site here
 *           names a MANAGE permission, so a member stays shut out exactly as
 *           requireOrgStaff shut them out.
 *
 * That last point is the whole reason these gates name manage permissions and
 * never view ones: gating a console page on `reservations.view` would silently
 * hand every existing member access they have never had, which is a privacy
 * change no organisation asked us to make on their behalf. Custom roles holding
 * the manage permission are the only parties whose access actually changes.
 */
export async function requireOrgPermission(
	locals: App.Locals,
	permission: Permission
): Promise<OrgContext> {
	const org = requireOrg(locals);
	const user = locals.user!;

	if (org.role === 'owner') return org;

	const access = await loadMemberAccess(locals.db, org.id, user.id, { isOwner: false });

	// `organization_members.role = 'admin'` must keep meaning what it meant before any
	// route moved onto permissions, otherwise this conversion NARROWS access instead of
	// widening it. Migration 0007 attached the Administrator role to every admin that
	// existed when it ran, but that is not the only way to become one:
	//
	//   * the People area's `changeRole` writes `organization_members.role` on its own
	//     and grants no role row;
	//   * an invite carries `role` and `role_ids` as independent fields, so `role=admin`
	//     with no role picked produces an admin holding only the default role;
	//   * on a database where 0007 has not been applied yet, `loadMemberAccess` returns
	//     no roles at all by design.
	//
	// Each of those admins passes `requireOrgStaff` today and would be refused here. So
	// the legacy flag is read as the permission set it has always implied: everything
	// except `billing.manage`, which stays owner-only and is guarded by
	// `requireOrgOwner` regardless. Nothing widens — an admin already reached every
	// /app/manage route through `requireOrgStaff`.
	//
	// It is added as a ROLE rather than returning early, so a per-member DENY override
	// is still applied last and still wins, exactly as it does for an admin who holds
	// the seeded Administrator role.
	if (org.role === 'admin') {
		access.roles = [
			...access.roles,
			// position -1 is the "below every real role" floor from `rankOf`: this grants
			// permissions, it must not silently hand anyone seniority over a real role.
			{ id: 'legacy-admin', name: 'Administrator', position: -1, permissions: ADMINISTRATOR_PERMISSIONS }
		];
	}

	requirePermission(access, permission);
	return org;
}

/**
 * May this caller reach the management console at all?
 *
 * The /app/manage layout used to answer this with `organization_members.role` —
 * owner or admin, nobody else. That single line made the entire permission system
 * inert for navigation: a custom role granting `halls.manage` passed every gate on
 * the halls route and was still bounced to /app/ before the page could load.
 *
 * So the layout no longer decides who may see what; it only decides who may be
 * here at all, and each page's own load names the permission it needs. Anyone
 * holding no console permission is redirected rather than shown a 403, because
 * for them the console is not a page that failed — it is not their page.
 */
export async function requireOrgConsole(locals: App.Locals): Promise<OrgContext> {
	const org = requireOrg(locals);
	if (!(await hasConsoleAccess(locals))) error(403, 'Forbidden');
	return org;
}

/**
 * The same question as a boolean, for the layout, which redirects rather than
 * throws. Kept separate so the layout never has to catch a thrown redirect in
 * order to issue one.
 */
export async function hasConsoleAccess(locals: App.Locals): Promise<boolean> {
	const org = locals.currentOrg;
	if (!org || !locals.user) return false;
	if (org.role === 'owner' || org.role === 'admin') return true;

	const access = await loadMemberAccess(locals.db, org.id, locals.user.id, { isOwner: false });
	const held = effectivePermissions(access);
	return CONSOLE_PERMISSIONS.some((p) => held.has(p));
}
