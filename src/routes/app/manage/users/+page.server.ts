import { fail } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { UserRow } from '$lib/db/index';
import { deleteUserAndCleanup } from '$lib/orgLifecycle';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const users = await dbAll<UserRow & { reservation_count: string }>(locals.db,
		`SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.created_at,
		       CAST(COUNT(r.id) AS TEXT) AS reservation_count
		FROM users u
		LEFT JOIN reservations r ON r.user_id = u.id
		GROUP BY u.id
		ORDER BY u.created_at DESC`
	);
	const adminCountRow = await dbFirst<{ count: string }>(locals.db,
		`SELECT CAST(COUNT(*) AS TEXT) AS count FROM users WHERE role = 'admin'`
	);
	return { users, adminCount: Number(adminCountRow?.count ?? 0) };
};

export const actions: Actions = {
	setRole: async ({ request, locals }) => {
		if (locals.currentOrg?.impersonated) return fail(403, { error: st(locals.locale).serverErrors.impersonationBlockAnOrg });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const role = String(data.get('role') ?? '');
		if (!['user', 'admin'].includes(role)) return fail(400, { error: st(locals.locale).serverErrors.invalidRole });

		// Prevent demoting the last admin
		if (role === 'user') {
			const countRow = await dbFirst<{ count: string }>(locals.db,
				`SELECT CAST(COUNT(*) AS TEXT) AS count FROM users WHERE role = 'admin'`
			);
			if (Number(countRow?.count ?? 0) <= 1) {
				return fail(400, { error: st(locals.locale).serverErrors.cannotRemoveLastAdmin });
			}
		}

		await dbRun(locals.db, 'UPDATE users SET role = ? WHERE id = ?', role, id);
		return { success: true };
	},

	deleteUser: async ({ request, locals }) => {
		if (locals.currentOrg?.impersonated) return fail(403, { error: st(locals.locale).serverErrors.impersonationBlockAnOrg });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (id === locals.user?.id) return fail(400, { error: st(locals.locale).serverErrors.cannotDeleteOwnAccount });
		await deleteUserAndCleanup(locals.db, id);
		return { success: true };
	}
};
