import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import sql from '$lib/db';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/app/login');
  const org = locals.currentOrg!;
  if (org.role !== 'owner' && org.role !== 'admin') redirect(303, '/app/manage');

  const webhooks = await sql<{
    id: string; name: string; url: string; events: string[];
    secret: string | null; enabled: boolean; created_at: Date;
  }[]>`
    SELECT id, name, url, events, secret, enabled, created_at
    FROM org_webhooks WHERE org_id = ${org.id} ORDER BY created_at DESC
  `;

  const recentDeliveries = await sql<{
    id: string; webhook_id: string; event: string; status: string;
    response_code: number | null; error: string | null; delivered_at: Date;
    webhook_name: string;
  }[]>`
    SELECT d.id, d.webhook_id, d.event, d.status, d.response_code, d.error, d.delivered_at,
           w.name AS webhook_name
    FROM webhook_deliveries d
    JOIN org_webhooks w ON w.id = d.webhook_id
    WHERE w.org_id = ${org.id}
    ORDER BY d.delivered_at DESC LIMIT 50
  `;

  return { webhooks, recentDeliveries };
};

const ALL_EVENTS = [
  'channel_message.new',
  'ticket.new',
  'ticket.reply',
  'reservation.new',
  'reservation.status_changed',
] as const;

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const org = locals.currentOrg!;
    if (org.role !== 'owner' && org.role !== 'admin') return fail(403);

    const data = await request.formData();
    const name   = String(data.get('name') ?? '').trim();
    const url    = String(data.get('url') ?? '').trim();
    const secret = String(data.get('secret') ?? '').trim() || null;
    const events = ALL_EVENTS.filter(e => data.get(`event_${e}`) === 'on');

    if (!name || !url) return fail(400, { error: 'Name and URL are required' });
    try { new URL(url); } catch { return fail(400, { error: 'Invalid URL' }); }
    if (!events.length) return fail(400, { error: 'Select at least one event' });

    await sql`
      INSERT INTO org_webhooks (org_id, name, url, events, secret)
      VALUES (${org.id}, ${name}, ${url}, ${sql.array(events)}, ${secret})
    `;
  },

  toggle: async ({ request, locals }) => {
    const org = locals.currentOrg!;
    if (org.role !== 'owner' && org.role !== 'admin') return fail(403);
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    await sql`
      UPDATE org_webhooks SET enabled = NOT enabled
      WHERE id = ${id} AND org_id = ${org.id}
    `;
  },

  delete: async ({ request, locals }) => {
    const org = locals.currentOrg!;
    if (org.role !== 'owner' && org.role !== 'admin') return fail(403);
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    await sql`DELETE FROM org_webhooks WHERE id = ${id} AND org_id = ${org.id}`;
  },
};
