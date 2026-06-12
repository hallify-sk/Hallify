import { redirect, fail } from '@sveltejs/kit';
import sql from '$lib/db/index';
import type { RsvpTemplateRow } from '$lib/db/index';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const orgId = locals.currentOrg!.id;
  const templates = await sql<RsvpTemplateRow[]>`
    SELECT * FROM rsvp_templates WHERE org_id = ${orgId} ORDER BY created_at DESC
  `;
  return { templates };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    const eventType = String(data.get('event_type') ?? '').trim() || null;

    if (!name) return fail(400, { error: 'Name is required.' });

    const [tmpl] = await sql<RsvpTemplateRow[]>`
      INSERT INTO rsvp_templates (org_id, name, event_type)
      VALUES (${orgId}, ${name}, ${eventType})
      RETURNING *
    `;

    redirect(303, `/admin/rsvp-templates/${tmpl.id}`);
  },

  delete: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    await sql`DELETE FROM rsvp_templates WHERE id = ${id} AND org_id = ${orgId}`;
    return { success: true };
  }
};
