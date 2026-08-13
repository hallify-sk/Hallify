import { error, fail, redirect } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { UserRow } from '$lib/db/index';
import { deleteUserAndCleanup } from '$lib/orgLifecycle';
import { st } from '$lib/i18n-server';
import type { PageServerLoad, Actions } from './$types';
import bcrypt from 'bcryptjs';
import { requireOrgStaff } from '$lib/guards';

export const load: PageServerLoad = async ({ params, locals }) => {
	const user = await dbFirst<UserRow & { reservation_count: string }>(locals.db,
		`SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.created_at,
		       CAST(COUNT(r.id) AS TEXT) AS reservation_count
		FROM users u
		LEFT JOIN reservations r ON r.user_id = u.id
		WHERE u.id = ?
		GROUP BY u.id`,
		params.id
	);
	if (!user) error(404, st(locals.locale).serverErrors.userNotFound);

	const reservations = await dbAll<{ id: string; title: string; event_date: string; status: string; hall_name: string }>(locals.db,
		`SELECT r.id, r.title, r.event_date, r.status, h.name AS hall_name
		FROM reservations r
		JOIN halls h ON h.id = r.hall_id
		WHERE r.user_id = ?
		ORDER BY r.event_date DESC`,
		params.id
	);

	return { user, reservations };
};

export const actions: Actions = {
	updateDetails: async ({ request, params, locals }) => {
	  requireOrgStaff(locals);
		if (!locals.user || locals.currentOrg?.impersonated || (locals.currentOrg?.role !== 'owner' && locals.currentOrg?.role !== 'admin')) return fail(403, { error: st(locals.locale).serverErrors.unauthorized });
		const data = await request.formData();
		const firstName = String(data.get('first_name') ?? '').trim();
		const lastName = String(data.get('last_name') ?? '').trim();
		const email = String(data.get('email') ?? '').trim();

		if (!firstName || !lastName) return fail(400, { error: st(locals.locale).serverErrors.nameRequired });
		if (!email) return fail(400, { error: st(locals.locale).serverErrors.emailRequired });

		// Check email uniqueness
		const existing = await dbFirst<{ id: string }>(locals.db,
			'SELECT id FROM users WHERE email = ? AND id != ?',
			email, params.id
		);
		if (existing) return fail(400, { error: st(locals.locale).serverErrors.emailAlreadyInUse });

		await dbRun(locals.db,
			'UPDATE users SET first_name = ?, last_name = ?, email = ? WHERE id = ?',
			firstName, lastName, email, params.id
		);
		return { success: true };
	},

	setRole: async ({ request, params, locals }) => {
	  requireOrgStaff(locals);
		if (!locals.user || locals.currentOrg?.impersonated || (locals.currentOrg?.role !== 'owner' && locals.currentOrg?.role !== 'admin')) return fail(403, { error: st(locals.locale).serverErrors.unauthorized });
		const data = await request.formData();
		const role = String(data.get('role') ?? '');
		if (!['user', 'admin'].includes(role)) return fail(400, { error: st(locals.locale).serverErrors.invalidRole });

		if (role === 'user') {
			const countRow = await dbFirst<{ count: string }>(locals.db,
				`SELECT CAST(COUNT(*) AS TEXT) AS count FROM users WHERE role = 'admin'`
			);
			if (Number(countRow?.count ?? 0) <= 1) return fail(400, { error: st(locals.locale).serverErrors.cannotRemoveLastAdmin });
		}

		await dbRun(locals.db, 'UPDATE users SET role = ? WHERE id = ?', role, params.id);
		return { success: true };
	},

	resetPassword: async ({ request, params, locals }) => {
	  requireOrgStaff(locals);
		if (!locals.user || locals.currentOrg?.impersonated || (locals.currentOrg?.role !== 'owner' && locals.currentOrg?.role !== 'admin')) return fail(403, { error: st(locals.locale).serverErrors.unauthorized });
		const data = await request.formData();
		const password = String(data.get('password') ?? '');
		if (password.length < 6) return fail(400, { error: st(locals.locale).serverErrors.passwordMinLength });

		const hash = await bcrypt.hash(password, 10);
		await dbRun(locals.db, 'UPDATE users SET password_hash = ? WHERE id = ?', hash, params.id);
		return { success: true, passwordReset: true };
	},

	deleteUser: async ({ params, locals }) => {
	  requireOrgStaff(locals);
		if (!locals.user || locals.currentOrg?.impersonated || (locals.currentOrg?.role !== 'owner' && locals.currentOrg?.role !== 'admin')) return fail(403, { error: st(locals.locale).serverErrors.unauthorized });
		if (params.id === locals.user.id) return fail(400, { error: st(locals.locale).serverErrors.cannotDeleteOwnAccount });

		const user = await dbFirst<{ role: string }>(locals.db,
			'SELECT role FROM users WHERE id = ?',
			params.id
		);
		if (!user) return fail(404, { error: st(locals.locale).serverErrors.userNotFound });

		if (user.role === 'admin') {
			const countRow = await dbFirst<{ count: string }>(locals.db,
				`SELECT CAST(COUNT(*) AS TEXT) AS count FROM users WHERE role = 'admin'`
			);
			if (Number(countRow?.count ?? 0) <= 1) return fail(400, { error: st(locals.locale).serverErrors.cannotDeleteLastAdmin });
		}

		await deleteUserAndCleanup(locals.db, params.id);
		redirect(303, '/app/manage/users');
	}
};
