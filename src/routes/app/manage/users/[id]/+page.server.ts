import { error, fail, redirect } from '@sveltejs/kit';
import sql from '$lib/db';
import type { UserRow } from '$lib/db';
import type { PageServerLoad, Actions } from './$types';
import bcrypt from 'bcryptjs';

export const load: PageServerLoad = async ({ params }) => {
	const [user] = await sql<(UserRow & { reservation_count: string })[]>`
		SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.created_at,
		       COUNT(r.id)::text AS reservation_count
		FROM users u
		LEFT JOIN reservations r ON r.user_id = u.id
		WHERE u.id = ${params.id}
		GROUP BY u.id
	`;
	if (!user) error(404, 'User not found');

	const reservations = await sql<{ id: string; title: string; event_date: Date; status: string; hall_name: string }[]>`
		SELECT r.id, r.title, r.event_date, r.status, h.name AS hall_name
		FROM reservations r
		JOIN halls h ON h.id = r.hall_id
		WHERE r.user_id = ${params.id}
		ORDER BY r.event_date DESC
	`;

	return { user, reservations };
};

export const actions: Actions = {
	updateDetails: async ({ request, params, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') return fail(403, { error: 'Unauthorized' });
		const data = await request.formData();
		const firstName = String(data.get('first_name') ?? '').trim();
		const lastName = String(data.get('last_name') ?? '').trim();
		const email = String(data.get('email') ?? '').trim();

		if (!firstName || !lastName) return fail(400, { error: 'Name is required' });
		if (!email) return fail(400, { error: 'Email is required' });

		// Check email uniqueness
		const [existing] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${email} AND id != ${params.id}`;
		if (existing) return fail(400, { error: 'Email is already in use' });

		await sql`
			UPDATE users SET first_name = ${firstName}, last_name = ${lastName}, email = ${email}
			WHERE id = ${params.id}
		`;
		return { success: true };
	},

	setRole: async ({ request, params, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') return fail(403, { error: 'Unauthorized' });
		const data = await request.formData();
		const role = String(data.get('role') ?? '');
		if (!['user', 'admin'].includes(role)) return fail(400, { error: 'Invalid role' });

		if (role === 'user') {
			const [{ count }] = await sql<[{ count: string }]>`SELECT COUNT(*)::text AS count FROM users WHERE role = 'admin'`;
			if (Number(count) <= 1) return fail(400, { error: 'Cannot remove the last admin' });
		}

		await sql`UPDATE users SET role = ${role} WHERE id = ${params.id}`;
		return { success: true };
	},

	resetPassword: async ({ request, params, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') return fail(403, { error: 'Unauthorized' });
		const data = await request.formData();
		const password = String(data.get('password') ?? '');
		if (password.length < 6) return fail(400, { error: 'Password must be at least 6 characters' });

		const hash = await bcrypt.hash(password, 10);
		await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${params.id}`;
		return { success: true, passwordReset: true };
	},

	deleteUser: async ({ params, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') return fail(403, { error: 'Unauthorized' });
		if (params.id === locals.user.id) return fail(400, { error: 'Cannot delete your own account' });

		const [user] = await sql<{ role: string }[]>`SELECT role FROM users WHERE id = ${params.id}`;
		if (!user) return fail(404, { error: 'User not found' });

		if (user.role === 'admin') {
			const [{ count }] = await sql<[{ count: string }]>`SELECT COUNT(*)::text AS count FROM users WHERE role = 'admin'`;
			if (Number(count) <= 1) return fail(400, { error: 'Cannot delete the last admin' });
		}

		await sql`DELETE FROM users WHERE id = ${params.id}`;
		redirect(303, '/admin/users');
	}
};
