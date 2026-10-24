import { fail } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { requireOrg } from '$lib/guards';
import { loadMemberAccess, requireOrgPermission } from '$lib/server/access';
import {
	PERMISSIONS,
	can,
	canManageRole,
	grantablePermissions,
	parsePermissions,
	rankOf,
	sameRoleName,
	sanitize,
	type MemberAccess,
	type Permission
} from '$lib/permissions';
import { st } from '$lib/i18n-server';
import { roleNamesClash } from '$lib/role-label';
import type { Actions, PageServerLoad } from './$types';

/**
 * The Roles tab.
 *
 * ⚠️  Read the warning at the top of $lib/guards before editing anything below.
 *     SvelteKit does not run `load` before a form action, so the tab strip's layout
 *     guard protects navigation and nothing else. Every action here therefore does
 *     its own three checks, in this order:
 *
 *       1. actorOf              — the caller's access in the ACTIVE org
 *       2. the role is re-read  — `WHERE id = ? AND org_id = ?`, so an id belonging
 *                                 to another organisation simply does not exist
 *       3. canManageRole(...)   — against the role's CURRENT STORED position, never
 *                                 a number that arrived in the form
 *
 *     Permissions submitted by the form are filtered through sanitize() (drop keys
 *     this build does not know) and grantablePermissions() (you cannot grant what
 *     you do not hold). Both run regardless of what the UI disabled.
 */

const NAME_MAX = 40;
const HEX = /^#[0-9a-fA-F]{6}$/;

interface RoleRow {
	id: string;
	name: string;
	color: string | null;
	position: number;
	permissions: string;
	is_default: number;
}

/**
 * A member of the active org, plus their evaluated access.
 *
 * Not `requireOrgStaff`: that admits owners and legacy admins only, so a custom role
 * holding roles.manage was shown this tab's controls and refused by every action.
 * What each action may do is decided by `can(..., 'roles.manage')` and
 * `canManageRole`, which requires roles.manage as well as rank.
 */
async function actorOf(locals: App.Locals): Promise<{ orgId: string; access: MemberAccess }> {
	const org = requireOrg(locals);
	const access = await loadMemberAccess(locals.db, org.id, locals.user!.id, {
		isOwner: org.role === 'owner',
		legacyRole: org.role
	});
	return { orgId: org.id, access };
}

/** Every role of ONE org, lowest rank first. Always scoped by org_id. */
function listRoles(db: App.Locals['db'], orgId: string): Promise<RoleRow[]> {
	return dbAll<RoleRow>(
		db,
		`SELECT id, name, color, position, permissions, is_default
		   FROM org_roles WHERE org_id = ?
		  ORDER BY position ASC, created_at ASC, id ASC`,
		orgId
	);
}

/**
 * Rewrite positions as 0..n-1 in the given order (lowest rank first).
 *
 * Positions have to stay distinct inside an org — `rankOf` takes the highest one a
 * member holds, and two roles sharing a number make "strictly below" ambiguous.
 * There is no unique index to lean on (a swap would trip it mid-update anyway), so
 * the list is renumbered wholesale and sent as one batch: never left half-written.
 *
 * Renumbering touches rows above the caller's own rank, which is deliberate and not
 * an escalation — it preserves the relative order exactly, and every authorisation
 * decision is made on relative order alone.
 */
async function writeOrder(db: App.Locals['db'], orgId: string, idsLowToHigh: string[]): Promise<void> {
	if (idsLowToHigh.length === 0) return;
	await db.batch(
		idsLowToHigh.map((id, i) =>
			db.prepare('UPDATE org_roles SET position = ? WHERE id = ? AND org_id = ?').bind(i, id, orgId)
		)
	);
}

/** '' clears the colour; anything else must be a 6-digit hex. `false` means invalid. */
function readColor(raw: FormDataEntryValue | null): string | null | false {
	const v = String(raw ?? '').trim();
	if (v === '') return null;
	return HEX.test(v) ? v.toLowerCase() : false;
}

export const load: PageServerLoad = async ({ locals }) => {
	await requireOrgPermission(locals, 'roles.manage');
	const { orgId, access } = await actorOf(locals);

	const rows = await listRoles(locals.db, orgId);

	// Explicit assignments. The default role is handled separately below: every
	// member holds it whether or not a row says so (see loadMemberAccess), so
	// counting only org_member_roles would under-report it.
	const counts = await dbAll<{ role_id: string; n: number }>(
		locals.db,
		`SELECT role_id, COUNT(DISTINCT user_id) AS n
		   FROM org_member_roles WHERE org_id = ? GROUP BY role_id`,
		orgId
	);
	const countBy = new Map(counts.map((c) => [c.role_id, Number(c.n)]));

	// The owner is not a role holder — they bypass the whole system.
	const everyone = await dbFirst<{ n: number }>(
		locals.db,
		`SELECT COUNT(*) AS n FROM organization_members WHERE org_id = ? AND role <> 'owner'`,
		orgId
	);

	return {
		// Highest rank first — the order the tab reads in.
		roles: rows
			.slice()
			.reverse()
			.map((r) => ({
				id: r.id,
				name: r.name,
				color: r.color,
				position: r.position,
				isDefault: r.is_default === 1,
				permissions: parsePermissions(r.permissions),
				memberCount: r.is_default === 1 ? Number(everyone?.n ?? 0) : (countBy.get(r.id) ?? 0),
				/** Decided here AND re-decided inside every action; this flag only draws the UI. */
				canManage: canManageRole(access, r.position)
			})),
		isOwner: access.isOwner,
		canCreate: access.isOwner || can(access, 'roles.manage'),
		grantable: [...grantablePermissions(access)]
	};
};

export const actions: Actions = {
	/**
	 * A new role lands directly ABOVE the default role, so the floor stays the floor.
	 *
	 * That slot must still be strictly below the caller's own rank, or they would mint
	 * a role they cannot then edit, delete or assign. Holding the default role and
	 * nothing else is exactly that case, so it is refused rather than quietly placing
	 * the role somewhere else.
	 */
	createRole: async ({ request, locals }) => {
		const { orgId, access } = await actorOf(locals);
		const e = st(locals.locale).serverErrors;
		if (locals.currentOrg?.impersonated) return fail(403, { error: e.impersonationBlockThisOrg });
		if (!access.isOwner && !can(access, 'roles.manage')) {
			return fail(403, { error: e.noPermissionManageRoles });
		}

		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		if (!name) return fail(400, { error: e.roleNameRequired });
		if (name.length > NAME_MAX) return fail(400, { error: e.roleNameMax });
		const color = readColor(data.get('color'));
		if (color === false) return fail(400, { error: e.invalidRoleColor });

		const existing = await listRoles(locals.db, orgId); // lowest rank first
		if (existing.some((r) => roleNamesClash(r.name, name))) return fail(400, { error: e.roleNameTaken });
		const defaultAt = existing.findIndex((r) => r.is_default === 1);
		const slot = defaultAt >= 0 ? defaultAt + 1 : 0;

		// `slot` becomes the new role's position once the list is renumbered. Every
		// role the caller holds sits at an index <= this count - 1, so that index is
		// the highest slot still strictly below them after the insert shifts them up.
		if (!access.isOwner) {
			const highestOwnIdx = existing.filter((r) => r.position <= rankOf(access)).length - 1;
			if (slot > highestOwnIdx) return fail(403, { error: e.cannotCreateRoleAboveYou });
		}

		const id = crypto.randomUUID();

		// Inserted below everything first, so the row is never briefly senior to the
		// caller; writeOrder immediately gives it its real place.
		await dbRun(
			locals.db,
			`INSERT INTO org_roles (id, org_id, name, color, position, permissions, is_default)
			 VALUES (?, ?, ?, ?, -1, '[]', 0)`,
			id,
			orgId,
			name,
			color
		);

		const order = existing.map((r) => r.id);
		order.splice(slot, 0, id);
		await writeOrder(locals.db, orgId, order);

		return { success: true, openId: id };
	},

	/** Rename, recolour and set permissions — the one form the editor submits. */
	updateRole: async ({ request, locals }) => {
		const { orgId, access } = await actorOf(locals);
		const e = st(locals.locale).serverErrors;
		if (locals.currentOrg?.impersonated) return fail(403, { error: e.impersonationBlockThisOrg });

		const data = await request.formData();
		const id = String(data.get('id') ?? '');

		// Scoped read: an id from another organisation does not resolve, so being
		// staff somewhere is not permission to act on an arbitrary role.
		const role = await dbFirst<RoleRow>(
			locals.db,
			`SELECT id, name, color, position, permissions, is_default
			   FROM org_roles WHERE id = ? AND org_id = ?`,
			id,
			orgId
		);
		if (!role) return fail(404, { error: e.roleNotFound });

		// Against the STORED position. A position taken from the form would be the
		// caller's to choose, which is the whole escalation.
		if (!canManageRole(access, role.position)) return fail(403, { error: e.roleOutranksYou });

		const name = String(data.get('name') ?? '').trim();
		if (!name) return fail(400, { error: e.roleNameRequired });
		if (name.length > NAME_MAX) return fail(400, { error: e.roleNameMax });
		const color = readColor(data.get('color'));
		if (color === false) return fail(400, { error: e.invalidRoleColor });
		// Only a rename is checked: an org that already has two roles of one name must
		// still be able to save their permissions.
		if (!sameRoleName(name, role.name)) {
			const others = await listRoles(locals.db, orgId);
			if (others.some((r) => r.id !== role.id && roleNamesClash(r.name, name))) {
				return fail(400, { error: e.roleNameTaken });
			}
		}

		const submitted = new Set(sanitize(data.getAll('perm').map((v) => String(v))));
		const grantable = grantablePermissions(access);
		const stored = new Set(parsePermissions(role.permissions));

		// For a permission the caller holds, the form decides. For one they do not,
		// the stored value is kept verbatim: they may neither grant it (escalation)
		// nor strip it — a disabled checkbox posts nothing, and a save must not
		// silently revoke what the UI showed as read-only.
		const next: Permission[] = PERMISSIONS.filter((p) =>
			grantable.has(p) ? submitted.has(p) : stored.has(p)
		);

		await dbRun(
			locals.db,
			'UPDATE org_roles SET name = ?, color = ?, permissions = ? WHERE id = ? AND org_id = ?',
			name,
			color,
			JSON.stringify(next),
			id,
			orgId
		);

		return { success: true, openId: id };
	},

	/** The default role is the floor of what any member can do, so it never goes. */
	deleteRole: async ({ request, locals }) => {
		const { orgId, access } = await actorOf(locals);
		const e = st(locals.locale).serverErrors;
		if (locals.currentOrg?.impersonated) return fail(403, { error: e.impersonationBlockThisOrg });

		const data = await request.formData();
		const id = String(data.get('id') ?? '');

		const role = await dbFirst<RoleRow>(
			locals.db,
			`SELECT id, name, color, position, permissions, is_default
			   FROM org_roles WHERE id = ? AND org_id = ?`,
			id,
			orgId
		);
		if (!role) return fail(404, { error: e.roleNotFound });
		if (!canManageRole(access, role.position)) return fail(403, { error: e.roleOutranksYou });
		if (role.is_default === 1) return fail(400, { error: e.cannotDeleteDefaultRole });

		// Explicit and org-scoped: the FK cascade would do it, but a role's
		// assignments disappearing should not depend on how the database was opened.
		await dbRun(locals.db, 'DELETE FROM org_member_roles WHERE org_id = ? AND role_id = ?', orgId, id);
		await dbRun(locals.db, 'DELETE FROM org_roles WHERE id = ? AND org_id = ?', id, orgId);

		const remaining = await listRoles(locals.db, orgId);
		await writeOrder(
			locals.db,
			orgId,
			remaining.map((r) => r.id)
		);

		return { success: true };
	},

	/**
	 * Swap a role with its neighbour. BOTH ends must be strictly below the caller's
	 * rank — otherwise "move up" is a one-click promotion past your own ceiling.
	 */
	moveRole: async ({ request, locals }) => {
		const { orgId, access } = await actorOf(locals);
		const e = st(locals.locale).serverErrors;
		if (locals.currentOrg?.impersonated) return fail(403, { error: e.impersonationBlockThisOrg });

		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const dir = String(data.get('dir') ?? '');
		if (dir !== 'up' && dir !== 'down') return fail(400, { error: e.cannotMoveRoleFurther });

		const roles = await listRoles(locals.db, orgId); // lowest rank first
		const idx = roles.findIndex((r) => r.id === id);
		if (idx < 0) return fail(404, { error: e.roleNotFound });

		const partnerIdx = dir === 'up' ? idx + 1 : idx - 1;
		if (partnerIdx < 0 || partnerIdx >= roles.length) {
			return fail(400, { error: e.cannotMoveRoleFurther });
		}

		const role = roles[idx];
		const partner = roles[partnerIdx];
		if (!canManageRole(access, role.position) || !canManageRole(access, partner.position)) {
			return fail(403, { error: e.roleOutranksYou });
		}
		if (role.is_default === 1 || partner.is_default === 1) {
			return fail(400, { error: e.defaultRoleStaysLowest });
		}

		const order = roles.map((r) => r.id);
		order[idx] = partner.id;
		order[partnerIdx] = role.id;
		await writeOrder(locals.db, orgId, order);

		return { success: true, openId: id };
	}
};
