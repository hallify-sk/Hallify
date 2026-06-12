import sql from '$lib/db';
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async () => {
  const orgs = await sql<{
    id: string; name: string; slug: string; plan: string; status: string;
    member_count: string; created_at: Date; suspended_at: Date | null;
  }[]>`
    SELECT o.id, o.name, o.slug, o.suspended_at,
           s.plan, s.status,
           (SELECT COUNT(*)::text FROM organization_members m WHERE m.org_id = o.id) AS member_count,
           o.created_at
    FROM organizations o
    LEFT JOIN subscriptions s ON s.org_id = o.id
    ORDER BY o.created_at DESC
  `;
  return { orgs };
};

export const actions: Actions = {
  suspend: async ({ request }) => {
    const data = await request.formData();
    const id = data.get('id') as string;
    await sql`UPDATE organizations SET suspended_at = NOW() WHERE id = ${id}`;
    return { success: true };
  },
  unsuspend: async ({ request }) => {
    const data = await request.formData();
    const id = data.get('id') as string;
    await sql`UPDATE organizations SET suspended_at = NULL WHERE id = ${id}`;
    return { success: true };
  }
};
