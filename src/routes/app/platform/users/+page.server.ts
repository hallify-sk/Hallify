import { dbAll, dbRun } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  const users = await dbAll<{
    id: string; email: string; first_name: string; last_name: string;
    is_platform_admin: number; org_count: string; created_at: string;
  }>(locals.db, `
    SELECT u.id, u.email, u.first_name, u.last_name, u.is_platform_admin,
           (SELECT COUNT(*) FROM organization_members m WHERE m.user_id = u.id) AS org_count,
           u.created_at
    FROM users u
    ORDER BY u.created_at DESC
  `);
  return { users };
};

export const actions: Actions = {
  grantPlatformAdmin: async ({ request, locals }) => {
    const data = await request.formData();
    const id = data.get('id') as string;
    await dbRun(locals.db, 'UPDATE users SET is_platform_admin = 1 WHERE id = ?', id);
    return { success: true };
  },
  revokePlatformAdmin: async ({ request, locals }) => {
    const data = await request.formData();
    const id = data.get('id') as string;
    if (id === locals.user?.id) return fail(400, { error: st(locals.locale).serverErrors.cannotRevokeOwnAdmin });
    await dbRun(locals.db, 'UPDATE users SET is_platform_admin = 0 WHERE id = ?', id);
    return { success: true };
  }
};
