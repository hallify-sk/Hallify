import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun, toJson, fromJsonArr } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import { PLANS } from '$lib/plans';
import { requireOrgStaff } from '$lib/guards';

// Webhooks are a paid feature (Starter and up).
function planHasWebhooks(plan: string): boolean {
  return PLANS[plan as keyof typeof PLANS]?.limits.webhooks ?? false;
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/app/login');
  const org = locals.currentOrg!;
  if (org.role !== 'owner' && org.role !== 'admin') redirect(303, '/app/manage');

  if (!planHasWebhooks(org.subscription.plan)) {
    return { locked: true, plan: org.subscription.plan, webhooks: [], recentDeliveries: [] };
  }

  const rawWebhooks = await dbAll<{
    id: string; name: string; url: string; events: string | null;
    secret: string | null; enabled: number; created_at: string;
  }>(locals.db,
    `SELECT id, name, url, events, secret, enabled, created_at
    FROM org_webhooks WHERE org_id = ? ORDER BY created_at DESC`,
    org.id
  );

  const webhooks = rawWebhooks.map(w => ({
    ...w,
    events: fromJsonArr(w.events) as string[],
    enabled: !!w.enabled,
  }));

  const recentDeliveries = await dbAll<{
    id: string; webhook_id: string; event: string; status: string;
    response_code: number | null; error: string | null; delivered_at: string;
    webhook_name: string;
  }>(locals.db,
    `SELECT d.id, d.webhook_id, d.event, d.status, d.response_code, d.error, d.delivered_at,
           w.name AS webhook_name
    FROM webhook_deliveries d
    JOIN org_webhooks w ON w.id = d.webhook_id
    WHERE w.org_id = ?
    ORDER BY d.delivered_at DESC LIMIT 50`,
    org.id
  );

  return { locked: false, plan: org.subscription.plan, webhooks, recentDeliveries };
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
    requireOrgStaff(locals);
    const org = locals.currentOrg!;
    if (org.role !== 'owner' && org.role !== 'admin') return fail(403);
    if (!planHasWebhooks(org.subscription.plan)) return fail(403, { error: st(locals.locale).serverErrors.webhooksPaidPlan });

    const data = await request.formData();
    const name   = String(data.get('name') ?? '').trim();
    const url    = String(data.get('url') ?? '').trim();
    const secret = String(data.get('secret') ?? '').trim() || null;
    const events = ALL_EVENTS.filter(e => data.get(`event_${e}`) === 'on');

    if (!name || !url) return fail(400, { error: st(locals.locale).serverErrors.nameAndUrlRequired });
    try { new URL(url); } catch { return fail(400, { error: st(locals.locale).serverErrors.invalidUrl }); }
    if (!events.length) return fail(400, { error: st(locals.locale).serverErrors.selectAtLeastOneEvent });

    await dbRun(locals.db,
      'INSERT INTO org_webhooks (id, org_id, name, url, events, secret) VALUES (?, ?, ?, ?, ?, ?)',
      crypto.randomUUID(), org.id, name, url, toJson(events), secret
    );
  },

  toggle: async ({ request, locals }) => {
    requireOrgStaff(locals);
    const org = locals.currentOrg!;
    if (org.role !== 'owner' && org.role !== 'admin') return fail(403);
    if (!planHasWebhooks(org.subscription.plan)) return fail(403, { error: st(locals.locale).serverErrors.webhooksPaidPlan });
    const data = await request.formData();
    const id = String(data.get('id') ?? '');

    const current = await dbFirst<{ enabled: number }>(locals.db,
      'SELECT enabled FROM org_webhooks WHERE id = ? AND org_id = ?',
      id, org.id
    );
    if (!current) return fail(404);

    await dbRun(locals.db,
      'UPDATE org_webhooks SET enabled = ? WHERE id = ? AND org_id = ?',
      current.enabled ? 0 : 1, id, org.id
    );
  },

  delete: async ({ request, locals }) => {
    requireOrgStaff(locals);
    const org = locals.currentOrg!;
    if (org.role !== 'owner' && org.role !== 'admin') return fail(403);
    if (!planHasWebhooks(org.subscription.plan)) return fail(403, { error: st(locals.locale).serverErrors.webhooksPaidPlan });
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    await dbRun(locals.db, 'DELETE FROM org_webhooks WHERE id = ? AND org_id = ?', id, org.id);
  },
};
