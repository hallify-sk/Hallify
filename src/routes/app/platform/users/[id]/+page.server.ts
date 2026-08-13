import { error, fail } from '@sveltejs/kit';
import { dbFirst, dbAll, dbRun } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import type { PageServerLoad, Actions } from './$types';
import { requirePlatformAdmin } from '$lib/guards';

export const load: PageServerLoad = async ({ params, locals }) => {
  const user = await dbFirst<{
    id: string; email: string; first_name: string; last_name: string;
    account_type: string; is_platform_admin: number; org_id: string | null; created_at: string;
  }>(locals.db,
    'SELECT id, email, first_name, last_name, account_type, is_platform_admin, org_id, created_at FROM users WHERE id = ?',
    params.id);
  if (!user) error(404, st(locals.locale).serverErrors.userNotFound);

  // Organizations this user is a member of (business accounts).
  const memberships = await dbAll<{ org_id: string; name: string; slug: string; role: string; plan: string | null }>(locals.db, `
    SELECT m.org_id, o.name, o.slug, m.role, s.plan
    FROM organization_members m
    JOIN organizations o ON o.id = m.org_id
    LEFT JOIN subscriptions s ON s.org_id = m.org_id
    WHERE m.user_id = ?
    ORDER BY o.name`, params.id);

  // For client accounts, the org their account is scoped to.
  const clientOrg = user.org_id
    ? await dbFirst<{ id: string; name: string; slug: string }>(locals.db, 'SELECT id, name, slug FROM organizations WHERE id = ?', user.org_id)
    : null;

  const reservationCount = await dbFirst<{ n: number }>(locals.db,
    'SELECT COUNT(*) AS n FROM reservations WHERE user_id = ?', params.id);

  return { user, memberships, clientOrg, reservationCount: reservationCount?.n ?? 0 };
};

export const actions: Actions = {
  grantPlatformAdmin: async ({ params, locals }) => {
    requirePlatformAdmin(locals);
    await dbRun(locals.db, 'UPDATE users SET is_platform_admin = 1 WHERE id = ?', params.id);
    return { success: true };
  },
  revokePlatformAdmin: async ({ params, locals }) => {
    requirePlatformAdmin(locals);
    if (params.id === locals.user?.id) return fail(400, { error: st(locals.locale).serverErrors.cannotRevokeOwnAdmin });
    await dbRun(locals.db, 'UPDATE users SET is_platform_admin = 0 WHERE id = ?', params.id);
    return { success: true };
  },
};
