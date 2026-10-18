import { error, fail, redirect } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { UserRow } from '$lib/db/index';
import { deleteUserAndCleanup } from '$lib/orgLifecycle';
import { st } from '$lib/i18n-server';
import type { PageServerLoad, Actions } from './$types';
import bcrypt from 'bcryptjs';
import { requireOrgPermission } from '$lib/server/access';

/**
 * One person, as seen by their organization.
 *
 * Every query here is scoped to the acting org. It previously was not: the load
 * and all four actions addressed `users` by `params.id` alone, so an owner or
 * admin of ANY organization could read, rename, re-role, reset the password of,
 * or delete a user belonging to a different tenant — resetPassword against a
 * platform admin's id was a complete account takeover. The sibling list route
 * already scoped its mutations this way; this page was missed.
 */

/** Is this user a member of the acting organization? Gate every query on it. */
async function isMemberOfOrg(db: App.Locals['db'], userId: string, orgId: string): Promise<boolean> {
	const row = await dbFirst<{ ok: number }>(db,
		'SELECT 1 AS ok FROM organization_members WHERE user_id = ? AND org_id = ? LIMIT 1',
		userId, orgId);
	return !!row;
}

/** Admins WITHIN this org. Counted platform-wide, the "last admin" guard either
 *  fires for an org that still has several, or fails to fire for one down to its
 *  last — in both cases it is answering a question nobody asked. */
async function orgAdminCount(db: App.Locals['db'], orgId: string): Promise<number> {
	const row = await dbFirst<{ count: string }>(db,
		`SELECT CAST(COUNT(*) AS TEXT) AS count
		   FROM users u JOIN organization_members m ON m.user_id = u.id AND m.org_id = ?
		  WHERE u.role = 'admin'`,
		orgId);
	return Number(row?.count ?? 0);
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = (await requireOrgPermission(locals, 'members.manage')).id;

	// The JOIN is the scope: a user outside this org is simply not found, which is
	// also the right answer to give — the existence of another tenant's account is
	// not this organization's business.
	const user = await dbFirst<UserRow & { reservation_count: string }>(locals.db,
		`SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.created_at,
		       CAST(COUNT(r.id) AS TEXT) AS reservation_count
		FROM users u
		JOIN organization_members m ON m.user_id = u.id AND m.org_id = ?
		LEFT JOIN reservations r ON r.user_id = u.id AND r.org_id = ?
		WHERE u.id = ?
		GROUP BY u.id`,
		orgId, orgId, params.id
	);
	if (!user) error(404, st(locals.locale).serverErrors.userNotFound);

	// Their bookings WITH THIS ORG. A person may hold reservations at several
	// venues; the others are not this organization's to display.
	const reservations = await dbAll<{ id: string; title: string; event_date: string; status: string; hall_name: string }>(locals.db,
		`SELECT r.id, r.title, r.event_date, r.status, h.name AS hall_name
		FROM reservations r
		JOIN halls h ON h.id = r.hall_id
		WHERE r.user_id = ? AND r.org_id = ?
		ORDER BY r.event_date DESC`,
		params.id, orgId
	);

	return { user, reservations };
};

export const actions: Actions = {
	updateDetails: async ({ request, params, locals }) => {
		const orgId = (await requireOrgPermission(locals, 'members.manage')).id;
		// Impersonation is a separate protection from permissions: a platform admin
		// viewing an org must not act as it. The legacy `role !== owner/admin` clause
		// that used to sit here was dropped deliberately — it made the permission gate
		// above inert, refusing the custom roles the gate exists to admit.
		if (locals.currentOrg?.impersonated) return fail(403, { error: st(locals.locale).serverErrors.impersonationBlockAnOrg });
		if (!(await isMemberOfOrg(locals.db, params.id, orgId))) return fail(404, { error: st(locals.locale).serverErrors.accessDenied });

		const data = await request.formData();
		const firstName = String(data.get('first_name') ?? '').trim();
		const lastName = String(data.get('last_name') ?? '').trim();
		const email = String(data.get('email') ?? '').trim();

		if (!firstName || !lastName) return fail(400, { error: st(locals.locale).serverErrors.nameRequired });
		if (!email) return fail(400, { error: st(locals.locale).serverErrors.emailRequired });

		// Uniqueness is platform-wide because the login is: the check must not be
		// scoped to the org, or two tenants could claim the same address.
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
		const orgId = (await requireOrgPermission(locals, 'members.manage')).id;
		if (locals.currentOrg?.impersonated) return fail(403, { error: st(locals.locale).serverErrors.impersonationBlockAnOrg });
		if (!(await isMemberOfOrg(locals.db, params.id, orgId))) return fail(404, { error: st(locals.locale).serverErrors.accessDenied });

		const data = await request.formData();
		const role = String(data.get('role') ?? '');
		if (!['user', 'admin'].includes(role)) return fail(400, { error: st(locals.locale).serverErrors.invalidRole });

		if (role === 'user' && (await orgAdminCount(locals.db, orgId)) <= 1) {
			return fail(400, { error: st(locals.locale).serverErrors.cannotRemoveLastAdmin });
		}

		await dbRun(locals.db, 'UPDATE users SET role = ? WHERE id = ?', role, params.id);
		return { success: true };
	},

	resetPassword: async ({ request, params, locals }) => {
		const orgId = (await requireOrgPermission(locals, 'members.manage')).id;
		if (locals.currentOrg?.impersonated) return fail(403, { error: st(locals.locale).serverErrors.impersonationBlockAnOrg });
		if (!(await isMemberOfOrg(locals.db, params.id, orgId))) return fail(404, { error: st(locals.locale).serverErrors.accessDenied });

		const data = await request.formData();
		const password = String(data.get('password') ?? '');
		if (password.length < 6) return fail(400, { error: st(locals.locale).serverErrors.passwordMinLength });

		const hash = await bcrypt.hash(password, 10);
		await dbRun(locals.db, 'UPDATE users SET password_hash = ? WHERE id = ?', hash, params.id);
		return { success: true, passwordReset: true };
	},

	deleteUser: async ({ params, locals }) => {
		const orgId = (await requireOrgPermission(locals, 'members.manage')).id;
		if (locals.currentOrg?.impersonated) return fail(403, { error: st(locals.locale).serverErrors.impersonationBlockAnOrg });
		if (!locals.user) return fail(403, { error: st(locals.locale).serverErrors.unauthorized });
		if (params.id === locals.user.id) return fail(400, { error: st(locals.locale).serverErrors.cannotDeleteOwnAccount });
		if (!(await isMemberOfOrg(locals.db, params.id, orgId))) return fail(404, { error: st(locals.locale).serverErrors.accessDenied });

		const user = await dbFirst<{ role: string }>(locals.db,
			'SELECT role FROM users WHERE id = ?',
			params.id
		);
		if (!user) return fail(404, { error: st(locals.locale).serverErrors.userNotFound });

		if (user.role === 'admin' && (await orgAdminCount(locals.db, orgId)) <= 1) {
			return fail(400, { error: st(locals.locale).serverErrors.cannotDeleteLastAdmin });
		}

		// deleteUserAndCleanup destroys the account globally. Refuse when the user also
		// belongs to another organization — one org's admin must not be able to delete a
		// person out from under a different tenant. Same refusal as the list route.
		const elsewhere = await dbFirst<{ ok: number }>(locals.db,
			'SELECT 1 AS ok FROM organization_members WHERE user_id = ? AND org_id != ? LIMIT 1',
			params.id, orgId);
		if (elsewhere) return fail(400, { error: st(locals.locale).serverErrors.accessDenied });

		await deleteUserAndCleanup(locals.db, params.id);
		redirect(303, '/app/manage/users');
	}
};
