import sql from '$lib/db';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const users = await sql<{
    id: string; email: string; first_name: string; last_name: string;
    is_platform_admin: boolean; org_count: string; created_at: Date;
  }[]>`
    SELECT u.id, u.email, u.first_name, u.last_name, u.is_platform_admin,
           (SELECT COUNT(*)::text FROM organization_members m WHERE m.user_id = u.id) AS org_count,
           u.created_at
    FROM users u
    ORDER BY u.created_at DESC
  `;
  return { users };
};

export const actions: Actions = {
  grantPlatformAdmin: async ({ request }) => {
    const data = await request.formData();
    const id = data.get('id') as string;
    await sql`UPDATE users SET is_platform_admin = true WHERE id = ${id}`;
    return { success: true };
  },
  revokePlatformAdmin: async ({ request, locals }) => {
    const data = await request.formData();
    const id = data.get('id') as string;
    if (id === locals.user?.id) return fail(400, { error: 'Cannot revoke your own admin status.' });
    await sql`UPDATE users SET is_platform_admin = false WHERE id = ${id}`;
    return { success: true };
  }
};
