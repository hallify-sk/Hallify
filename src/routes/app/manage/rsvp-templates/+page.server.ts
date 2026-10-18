import { error, redirect, fail } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { RsvpTemplateRow } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';
import { RSVP_ENABLED } from '$lib/features';
import { requireOrgPermission } from '$lib/server/access';

export const load: PageServerLoad = async ({ locals }) => {
  if (!RSVP_ENABLED) error(404, 'Not found');
  const orgId = (await requireOrgPermission(locals, 'templates.manage')).id;
  const templates = await dbAll<RsvpTemplateRow>(locals.db, 'SELECT * FROM rsvp_templates WHERE org_id = ? ORDER BY created_at DESC', orgId);
  return { templates };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'templates.manage');
    if (!RSVP_ENABLED) error(404, 'Not found');
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const name = String(data.get('name') ?? '').trim();
    const eventType = String(data.get('event_type') ?? '').trim() || null;

    if (!name) return fail(400, { error: st(locals.locale).serverErrors.nameRequired });

    const id = crypto.randomUUID();
    await dbRun(locals.db, 'INSERT INTO rsvp_templates (id, org_id, name, event_type) VALUES (?, ?, ?, ?)', id, orgId, name, eventType);

    redirect(303, `/admin/rsvp-templates/${id}`);
  },

  delete: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'templates.manage');
    if (!RSVP_ENABLED) error(404, 'Not found');
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    await dbRun(locals.db, 'DELETE FROM rsvp_templates WHERE id = ? AND org_id = ?', id, orgId);
    return { success: true };
  }
};
