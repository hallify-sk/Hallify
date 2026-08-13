import { fail } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { UserRow } from '$lib/db/index';
import { deleteUserAndCleanup } from '$lib/orgLifecycle';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';
import { requireOrgStaff } from '$lib/guards';

/** Every query here is scoped to the caller's organization. Previously this route was
 *  entirely unscoped — it listed every user on the platform and let any org owner/admin
 *  change the role of, or delete, users belonging to other tenants. */
export const load: PageServerLoad = async ({ locals }) => {
	const orgId = requireOrgStaff(locals).id;
	const users = await dbAll<UserRow & { reservation_count: string }>(locals.db,
		`SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.created_at,
		       CAST(COUNT(r.id) AS TEXT) AS reservation_count
		FROM users u
		JOIN organization_members m ON m.user_id = u.id AND m.org_id = ?
		LEFT JOIN reservations r ON r.user_id = u.id AND r.org_id = ?
		GROUP BY u.id
		ORDER BY u.created_at DESC`,
		orgId, orgId
	);
	const adminCountRow = await dbFirst<{ count: string }>(locals.db,
		`SELECT CAST(COUNT(*) AS TEXT) AS count
		 FROM users u JOIN organization_members m ON m.user_id = u.id AND m.org_id = ?
		 WHERE u.role = 'admin'`,
		orgId
	);
	return { users, adminCount: Number(adminCountRow?.count ?? 0) };
};

/** Is this user a member of the acting organization? Gate every mutation on it. */
async function isMemberOfOrg(db: App.Locals['db'], userId: string, orgId: string): Promise<boolean> {
	const row = await dbFirst<{ ok: number }>(db,
		'SELECT 1 AS ok FROM organization_members WHERE user_id = ? AND org_id = ? LIMIT 1',
		userId, orgId);
	return !!row;
}

export const actions: Actions = {
	setRole: async ({ request, locals }) => {
		const orgId = requireOrgStaff(locals).id;
		if (locals.currentOrg?.impersonated) return fail(403, { error: st(locals.locale).serverErrors.impersonationBlockAnOrg });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const role = String(data.get('role') ?? '');
		if (!['user', 'admin'].includes(role)) return fail(400, { error: st(locals.locale).serverErrors.invalidRole });

		// Target must belong to the acting org — otherwise any org admin could rewrite
		// another tenant's users.
		if (!(await isMemberOfOrg(locals.db, id, orgId))) return fail(404, { error: st(locals.locale).serverErrors.accessDenied });

		// Prevent demoting the last admin (counted within this org)
		if (role === 'user') {
			const countRow = await dbFirst<{ count: string }>(locals.db,
				`SELECT CAST(COUNT(*) AS TEXT) AS count
				 FROM users u JOIN organization_members m ON m.user_id = u.id AND m.org_id = ?
				 WHERE u.role = 'admin'`,
				orgId
			);
			if (Number(countRow?.count ?? 0) <= 1) {
				return fail(400, { error: st(locals.locale).serverErrors.cannotRemoveLastAdmin });
			}
		}

		await dbRun(locals.db, 'UPDATE users SET role = ? WHERE id = ?', role, id);
		return { success: true };
	},

	deleteUser: async ({ request, locals }) => {
		const orgId = requireOrgStaff(locals).id;
		if (locals.currentOrg?.impersonated) return fail(403, { error: st(locals.locale).serverErrors.impersonationBlockAnOrg });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (id === locals.user?.id) return fail(400, { error: st(locals.locale).serverErrors.cannotDeleteOwnAccount });

		if (!(await isMemberOfOrg(locals.db, id, orgId))) return fail(404, { error: st(locals.locale).serverErrors.accessDenied });

		// deleteUserAndCleanup destroys the account globally. Refuse when the user also
		// belongs to another organization — one org's admin must not be able to delete a
		// person out from under a different tenant.
		const elsewhere = await dbFirst<{ ok: number }>(locals.db,
			'SELECT 1 AS ok FROM organization_members WHERE user_id = ? AND org_id != ? LIMIT 1',
			id, orgId);
		if (elsewhere) return fail(400, { error: st(locals.locale).serverErrors.accessDenied });

		await deleteUserAndCleanup(locals.db, id);
		return { success: true };
	}
};
