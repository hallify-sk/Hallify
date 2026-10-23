import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { requirePlatformAdmin } from '$lib/guards';
import { logPlatformAction } from '$lib/server/platform-audit';

const TYPES = ['all', 'organization', 'client', 'admin'] as const;
type TypeFilter = (typeof TYPES)[number];

/** Users, searchable by name or email and filterable by account type. With 145+
 *  accounts and no search, finding one person meant scrolling. */
export const load: PageServerLoad = async ({ locals, url }) => {
  requirePlatformAdmin(locals);
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
  const typeRaw = url.searchParams.get('type') ?? 'all';
  const type: TypeFilter = (TYPES as readonly string[]).includes(typeRaw) ? (typeRaw as TypeFilter) : 'all';

  const where: string[] = [];
  const params: unknown[] = [];
  if (q) {
    where.push(`(LOWER(u.email) LIKE ? OR LOWER(u.first_name || ' ' || u.last_name) LIKE ?)`);
    const like = `%${q.toLowerCase().replace(/[%_]/g, '')}%`;
    params.push(like, like);
  }
  if (type === 'admin') where.push('u.is_platform_admin = 1');
  else if (type === 'client') where.push(`u.account_type = 'client'`);
  else if (type === 'organization') where.push(`u.account_type != 'client'`);

  const users = await dbAll<{
    id: string; email: string; first_name: string; last_name: string; account_type: string;
    is_platform_admin: number; org_count: number; created_at: string; client_of: string | null;
  }>(locals.db, `
    SELECT u.id, u.email, u.first_name, u.last_name, u.account_type, u.is_platform_admin,
           (SELECT COUNT(*) FROM organization_members m WHERE m.user_id = u.id) AS org_count,
           u.created_at,
           (SELECT o.name FROM organizations o WHERE o.id = u.org_id) AS client_of
    FROM users u
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY u.created_at DESC
    LIMIT 500
  `, ...params);

  const total = await dbFirst<{ n: number }>(locals.db, 'SELECT COUNT(*) AS n FROM users');

  return { users, q, type, total: Number(total?.n ?? users.length), currentUserId: locals.user?.id ?? null };
};

export const actions: Actions = {
  grantPlatformAdmin: async ({ request, locals }) => {
    requirePlatformAdmin(locals);
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    const target = await dbFirst<{ email: string; account_type: string }>(locals.db, 'SELECT email, account_type FROM users WHERE id = ?', id);
    if (!target) return fail(404, { error: st(locals.locale).serverErrors.userNotFound, id });
    await dbRun(locals.db, 'UPDATE users SET is_platform_admin = 1 WHERE id = ?', id);
    await logPlatformAction(locals, 'user.admin_grant', { type: 'user', id, label: target.email });
    return { success: true, id };
  },
  revokePlatformAdmin: async ({ request, locals }) => {
    requirePlatformAdmin(locals);
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    if (id === locals.user?.id) return fail(400, { error: st(locals.locale).serverErrors.cannotRevokeOwnAdmin, id });
    const target = await dbFirst<{ email: string }>(locals.db, 'SELECT email FROM users WHERE id = ?', id);
    if (!target) return fail(404, { error: st(locals.locale).serverErrors.userNotFound, id });
    await dbRun(locals.db, 'UPDATE users SET is_platform_admin = 0 WHERE id = ?', id);
    await logPlatformAction(locals, 'user.admin_revoke', { type: 'user', id, label: target.email });
    return { success: true, id };
  }
};
