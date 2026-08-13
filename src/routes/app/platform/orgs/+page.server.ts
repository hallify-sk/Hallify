import { dbAll, dbRun } from '$lib/db/index';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { requirePlatformAdmin } from '$lib/guards';

export const load: PageServerLoad = async ({ locals }) => {
  const orgs = await dbAll<{
    id: string; name: string; slug: string; plan: string; status: string;
    member_count: string; created_at: string; suspended_at: string | null;
  }>(locals.db, `
    SELECT o.id, o.name, o.slug, o.suspended_at,
           s.plan, s.status,
           (SELECT COUNT(*) FROM organization_members m WHERE m.org_id = o.id) AS member_count,
           o.created_at
    FROM organizations o
    LEFT JOIN subscriptions s ON s.org_id = o.id
    ORDER BY o.created_at DESC
  `);
  return { orgs };
};

export const actions: Actions = {
  suspend: async ({ request, locals }) => {
    requirePlatformAdmin(locals);
    const data = await request.formData();
    const id = data.get('id') as string;
    await dbRun(locals.db, "UPDATE organizations SET suspended_at = datetime('now') WHERE id = ?", id);
    return { success: true };
  },
  unsuspend: async ({ request, locals }) => {
    requirePlatformAdmin(locals);
    const data = await request.formData();
    const id = data.get('id') as string;
    await dbRun(locals.db, 'UPDATE organizations SET suspended_at = NULL WHERE id = ?', id);
    return { success: true };
  }
};
