import { fail } from '@sveltejs/kit';
import sql from '$lib/db/index';
import type { HallRow } from '$lib/db/index';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const orgId = locals.currentOrg!.id;
  const halls = await sql<Array<HallRow & { reservation_count: string }>>`
    SELECT h.*, COUNT(r.id)::text AS reservation_count
    FROM halls h
    LEFT JOIN reservations r ON r.hall_id = h.id
    WHERE h.org_id = ${orgId}
    GROUP BY h.id
    ORDER BY h.name
  `;
  return { halls };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const maxPeople = Number(data.get('maxPeople') ?? 100);
    const color = String(data.get('color') ?? '#3b82f6').trim();

    if (!name) return fail(400, { error: 'Hall name is required.' });

    await sql`
      INSERT INTO halls (org_id, name, description, max_people, color)
      VALUES (${orgId}, ${name}, ${description || null}, ${maxPeople}, ${color})
    `;
    return { success: true };
  },

  delete: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    if (!id) return fail(400, { error: 'Missing id' });
    // Scoped delete — only delete halls owned by this org
    await sql`DELETE FROM halls WHERE id = ${id} AND org_id = ${orgId}`;
    return { success: true };
  }
};
