import { fail } from '@sveltejs/kit';
import sql from '$lib/db/index';
import type { UserRow } from '$lib/db/index';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const users = await sql<Array<UserRow & { reservation_count: string }>>`
		SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.created_at,
		       COUNT(r.id)::text AS reservation_count
		FROM users u
		LEFT JOIN reservations r ON r.user_id = u.id
		GROUP BY u.id
		ORDER BY u.created_at DESC
	`;
	const [{ count: adminCount }] = await sql<[{ count: string }]>`SELECT COUNT(*)::text AS count FROM users WHERE role = 'admin'`;
	return { users, adminCount: Number(adminCount) };
};

export const actions: Actions = {
	setRole: async ({ request }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const role = String(data.get('role') ?? '');
		if (!['user', 'admin'].includes(role)) return fail(400, { error: 'Invalid role.' });

		// Prevent demoting the last admin
		if (role === 'user') {
			const [{ count }] = await sql<[{ count: string }]>`SELECT COUNT(*)::text AS count FROM users WHERE role = 'admin'`;
			if (Number(count) <= 1) {
				return fail(400, { error: 'Nemôžete odobrať posledného administrátora.' });
			}
		}

		await sql`UPDATE users SET role=${role} WHERE id=${id}`;
		return { success: true };
	},

	deleteUser: async ({ request, locals }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (id === locals.user?.id) return fail(400, { error: 'Cannot delete your own account.' });
		await sql`DELETE FROM users WHERE id=${id}`;
		return { success: true };
	}
};
