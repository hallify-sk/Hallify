import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { loginUrl } from '$lib/login-redirect';
import { dbAll, dbFirst, dbRun, toJson, fromJson, fromJsonArr } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import { PLANS } from '$lib/plans';
import { requireOrgPermission } from '$lib/server/access';
import { canManageSettings, leaveRefusalMessage } from '$lib/server/settings-access';
import { requireOrg } from '$lib/guards';
import { archiveAndDeleteOrg, leaveOrganization, upcomingClientBookings, BillingCancelError } from '$lib/orgLifecycle';
import { deliverWebhook, type WebhookPayload } from '$lib/notifications';
import { isSafeWebhookUrl } from '$lib/safe-url';
import { CLOSED_COOKIE } from '$lib/org-closure-email';
import type { TeamNotifyEvent } from '$lib/email';

// Webhooks are a paid feature (Starter and up).
function planHasWebhooks(plan: string): boolean {
  return PLANS[plan as keyof typeof PLANS]?.limits.webhooks ?? false;
}

/** Emails addressed to the venue's own staff — each one can be aimed at a
 *  subset of the team. `satisfies` ties this list to the keys $lib/email reads
 *  back when it sends, so the two can never drift apart silently. */
const TEAM_EVENTS = ['newReservation', 'guestMessage', 'guestCancel', 'guestEdit'] as const satisfies readonly TeamNotifyEvent[];
/** Emails addressed to the guest. These stay a plain on/off switch. */
const GUEST_EVENTS = ['statusChange', 'newMessage'] as const;

type TeamEvent = (typeof TEAM_EVENTS)[number];

interface StoredNotifications {
  newReservation?: boolean; guestMessage?: boolean; guestCancel?: boolean; guestEdit?: boolean;
  statusChange?: boolean; newMessage?: boolean;
  /** Per-event staff recipients. `null`/absent means "every member of the team". */
  recipients?: Partial<Record<TeamEvent, string[] | null>>;
}

interface StaffRow { id: string; first_name: string; last_name: string; email: string; role: string }

/** Everyone who can be chosen as a recipient: the whole team, members included
 *  ("Celý tím – Každý člen" used to mean owners and admins only). */
async function loadStaff(db: App.Locals['db'], orgId: string): Promise<StaffRow[]> {
  return dbAll<StaffRow>(db,
    `SELECT u.id, u.first_name, u.last_name, u.email, m.role
     FROM organization_members m JOIN users u ON u.id = m.user_id
     WHERE m.org_id = ?
     ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, u.first_name`,
    orgId
  );
}

const ALL_EVENTS = [
  'channel_message.new',
  'ticket.new',
  'ticket.reply',
  'reservation.new',
  'reservation.status_changed',
  'hall.archived',
  'hall.restored',
  'hall.deleted',
] as const;

/** The fields of the create and edit forms, validated. `values` is echoed back on an
 *  error so the form keeps what was typed (the secret never is). */
function readWebhookForm(data: FormData, locale: App.Locals['locale']) {
  const t = st(locale);
  const name   = String(data.get('name') ?? '').trim().slice(0, 100);
  const url    = String(data.get('url') ?? '').trim();
  const secret = String(data.get('secret') ?? '').trim().slice(0, 64) || null;
  const events: string[] = ALL_EVENTS.filter(e => data.get(`event_${e}`) === 'on');
  const values = { name, url, events };

  if (!name || !url) return { error: t.serverErrors.nameAndUrlRequired, values };
  // https only, and never a private or internal address: the server POSTs client
  // data to this URL, so plain http leaks it and an internal host is SSRF.
  if (!isSafeWebhookUrl(url)) return { error: t.settingsPages.webhookUrlRules, values };
  if (!events.length) return { error: t.serverErrors.selectAtLeastOneEvent, values };
  return { name, url, secret, events, values };
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, loginUrl(url));
  // Any member may open this tab to leave the organisation; everything else on it
  // needs settings.manage, so a member without it sees only the danger zone.
  const org = requireOrg(locals);
  if (!(await canManageSettings(locals))) {
    return {
      canManage: false,
      notifications: null, recipients: null, staff: [] as StaffRow[],
      locked: true, plan: org.subscription.plan, webhooks: [], recentDeliveries: [],
      orgName: org.name,
      isOwner: false,
      impersonated: !!org.impersonated,
      upcomingClients: 0,
      hasSubscription: false,
    };
  }

  // ── Email notifications ──────────────────────────────────────────────
  const notifyRow = await dbFirst<{ value: string | null }>(locals.db,
    "SELECT value FROM org_settings WHERE org_id = ? AND key = 'email_notifications'",
    org.id
  );
  const saved = (notifyRow ? fromJson<StoredNotifications>(notifyRow.value) : null) ?? {};
  // Default ON — matches getNotifyConfig() in $lib/email.
  const notifications = {
    newReservation: saved.newReservation ?? true,
    guestMessage:   saved.guestMessage   ?? true,
    guestCancel:    saved.guestCancel    ?? true,
    guestEdit:      saved.guestEdit      ?? true,
    statusChange:   saved.statusChange   ?? true,
    newMessage:     saved.newMessage     ?? true,
  };

  const staff = await loadStaff(locals.db, org.id);
  const staffIds = new Set(staff.map((s) => s.id));
  // `null` = everyone on the team (the default, and what a new member inherits).
  // `[]`   = nobody, i.e. this email is switched off.
  const recipients = {} as Record<TeamEvent, string[] | null>;
  for (const key of TEAM_EVENTS) {
    const stored = saved.recipients?.[key];
    if (!notifications[key]) recipients[key] = [];
    else if (!Array.isArray(stored)) recipients[key] = null;
    else {
      // Everyone picked has left the team: the email still goes to the whole team
      // ($lib/email staffRecipients), so show that rather than "Nobody".
      const kept = stored.filter((id) => staffIds.has(id));
      recipients[key] = kept.length ? kept : null;
    }
  }

  // ── Webhooks (paid) ──────────────────────────────────────────────────
  // After a downgrade the webhooks stay stored but stop firing. They used to vanish
  // from this page as well, so nobody could tell they had stopped; now they stay
  // listed as paused by the plan, and can still be deleted.
  const locked = !planHasWebhooks(org.subscription.plan);

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
    webhook_name: string; payload: string;
  }>(locals.db,
    `SELECT d.id, d.webhook_id, d.event, d.status, d.response_code, d.error, d.delivered_at,
           w.name AS webhook_name, d.payload
    FROM webhook_deliveries d
    JOIN org_webhooks w ON w.id = d.webhook_id
    WHERE w.org_id = ?
    ORDER BY d.delivered_at DESC LIMIT 50`,
    org.id
  );

  // What closing would do, so the owner reads it before confirming.
  const isOwner = org.role === 'owner';
  let upcomingClients = 0;
  let hasSubscription = false;
  if (isOwner) {
    const rows = await upcomingClientBookings(locals.db, org.id);
    upcomingClients = new Set(rows.map((r) => (r.email ?? '').toLowerCase()).filter(Boolean)).size;
    const sub = await dbFirst<{ stripe_subscription_id: string | null; status: string | null }>(locals.db,
      'SELECT stripe_subscription_id, status FROM subscriptions WHERE org_id = ?', org.id);
    hasSubscription = !!sub?.stripe_subscription_id && sub.status !== 'cancelled';
  }

  return {
    canManage: true,
    notifications, recipients, staff,
    locked, plan: org.subscription.plan, webhooks, recentDeliveries,
    orgName: org.name,
    isOwner,
    impersonated: !!org.impersonated,
    upcomingClients,
    hasSubscription,
  };
};

export const actions: Actions = {
  /** Which emails go out, and to which members of the team. The submitted ids are
   *  never trusted: anything that is not a current member of THIS org is
   *  dropped before the preference is stored. */
  saveNotifications: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'settings.manage');
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();

    const staffIds = new Set((await loadStaff(locals.db, orgId)).map((s) => s.id));

    const recipients: Partial<Record<TeamEvent, string[] | null>> = {};
    const flags: Record<string, boolean> = {};

    for (const key of TEAM_EVENTS) {
      if (String(data.get(`mode_${key}`) ?? 'all') === 'all') {
        recipients[key] = null;
        flags[key] = true;
        continue;
      }
      const picked = [...new Set(
        data.getAll(`recipients_${key}`).map((v) => String(v)).filter((id) => staffIds.has(id))
      )];
      recipients[key] = picked;
      flags[key] = picked.length > 0;
    }

    for (const key of GUEST_EVENTS) {
      flags[key] = data.get(key) === 'on';
    }

    const config: StoredNotifications = {
      newReservation: flags.newReservation,
      guestMessage:   flags.guestMessage,
      guestCancel:    flags.guestCancel,
      guestEdit:      flags.guestEdit,
      statusChange:   flags.statusChange,
      newMessage:     flags.newMessage,
      recipients,
    };

    await dbRun(locals.db,
      `INSERT OR REPLACE INTO org_settings (org_id, key, value, updated_at)
       VALUES (?, 'email_notifications', ?, datetime('now'))`,
      orgId, toJson(config)
    );
    return { success: true };
  },

  create: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'settings.manage');
    const org = locals.currentOrg!;
    if (!planHasWebhooks(org.subscription.plan)) return fail(403, { error: st(locals.locale).serverErrors.webhooksPaidPlan });

    const data = await request.formData();
    const parsed = readWebhookForm(data, locals.locale);
    if ('error' in parsed) return fail(400, { webhookError: parsed.error, webhookForm: 'create', values: parsed.values });

    await dbRun(locals.db,
      'INSERT INTO org_webhooks (id, org_id, name, url, events, secret) VALUES (?, ?, ?, ?, ?, ?)',
      crypto.randomUUID(), org.id, parsed.name, parsed.url, toJson(parsed.events), parsed.secret
    );
    return { webhookSaved: true };
  },

  /** Edit a webhook. An empty secret field keeps the stored secret; "remove secret"
   *  clears it. */
  update: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'settings.manage');
    const org = locals.currentOrg!;
    if (!planHasWebhooks(org.subscription.plan)) return fail(403, { error: st(locals.locale).serverErrors.webhooksPaidPlan });
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    const current = await dbFirst<{ secret: string | null }>(locals.db,
      'SELECT secret FROM org_webhooks WHERE id = ? AND org_id = ?', id, org.id);
    if (!current) return fail(404, { error: st(locals.locale).settingsPages.webhookNotFound });

    const parsed = readWebhookForm(data, locals.locale);
    if ('error' in parsed) return fail(400, { webhookError: parsed.error, webhookForm: id, values: parsed.values });
    const secret = data.get('clear_secret') === 'on' ? null : (parsed.secret ?? current.secret);

    await dbRun(locals.db,
      'UPDATE org_webhooks SET name = ?, url = ?, events = ?, secret = ? WHERE id = ? AND org_id = ?',
      parsed.name, parsed.url, toJson(parsed.events), secret, id, org.id
    );
    return { webhookSaved: true };
  },

  /** Send a test payload now and report what the endpoint answered. */
  test: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'settings.manage');
    const org = locals.currentOrg!;
    if (!planHasWebhooks(org.subscription.plan)) return fail(403, { error: st(locals.locale).serverErrors.webhooksPaidPlan });
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    const wh = await dbFirst<{ id: string; url: string; secret: string | null }>(locals.db,
      'SELECT id, url, secret FROM org_webhooks WHERE id = ? AND org_id = ?', id, org.id);
    if (!wh) return fail(404, { error: st(locals.locale).settingsPages.webhookNotFound });

    const payload: WebhookPayload = {
      event: 'webhook.test',
      org_id: org.id,
      timestamp: new Date().toISOString(),
      data: { message: 'Test from Hallify', organization: org.name },
    };
    const result = await deliverWebhook(locals.db, wh.id, wh.url, wh.secret, payload);
    return { webhookResult: { id: wh.id, ...result } };
  },

  /** Send a logged delivery again, with the payload it carried the first time. */
  retry: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'settings.manage');
    const org = locals.currentOrg!;
    if (!planHasWebhooks(org.subscription.plan)) return fail(403, { error: st(locals.locale).serverErrors.webhooksPaidPlan });
    const data = await request.formData();
    const deliveryId = String(data.get('delivery_id') ?? '');
    const row = await dbFirst<{ payload: string; webhook_id: string; url: string; secret: string | null }>(locals.db,
      `SELECT d.payload, d.webhook_id, w.url, w.secret
       FROM webhook_deliveries d JOIN org_webhooks w ON w.id = d.webhook_id
       WHERE d.id = ? AND w.org_id = ?`, deliveryId, org.id);
    if (!row) return fail(404, { error: st(locals.locale).settingsPages.webhookNotFound });
    let payload: WebhookPayload;
    try { payload = JSON.parse(row.payload) as WebhookPayload; }
    catch { return fail(400, { error: st(locals.locale).settingsPages.webhookNotFound }); }
    const result = await deliverWebhook(locals.db, row.webhook_id, row.url, row.secret, payload);
    return { webhookResult: { id: row.webhook_id, ...result } };
  },

  toggle: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'settings.manage');
    const org = locals.currentOrg!;
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

  // Deleting stays possible on any plan, so an organisation that downgraded can tidy up.
  delete: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'settings.manage');
    const org = locals.currentOrg!;
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    await dbRun(locals.db, 'DELETE FROM org_webhooks WHERE id = ? AND org_id = ?', id, org.id);
  },

  // ── Danger zone (moved here from the Members page) ────────────────────
  // Current user leaves the org. The last member (usually the owner) cannot
  // leave — they must explicitly close the organization. Leaving is about your own
  // membership, not about managing the organisation, so any member may do it.
  leave: async ({ locals, url }) => {
    if (!locals.user) redirect(303, loginUrl(url));
    requireOrg(locals);
    if (locals.currentOrg?.impersonated) return fail(403, { dangerError: st(locals.locale).serverErrors.impersonationBlockThisOrg });
    const refused = await leaveOrganization(locals.db, locals.currentOrg!.id, locals.user.id);
    if (refused) return fail(400, { dangerError: leaveRefusalMessage(refused, locals.locale) });
    redirect(303, '/app/');
  },

  // Owner-only: permanently close the organization. Cancels the Stripe subscription,
  // emails clients with upcoming bookings, archives a legal/accounting record (kept
  // indefinitely) then deletes all live data. Requires typing the org name.
  closeOrg: async ({ request, locals, cookies }) => {
    await requireOrgPermission(locals, 'settings.manage');
    const org = locals.currentOrg!;
    if (org.impersonated) return fail(403, { dangerError: st(locals.locale).serverErrors.impersonationBlockThisOrg });
    if (org.role !== 'owner') return fail(403, { dangerError: st(locals.locale).serverErrors.onlyOwnerCanCloseOrg });

    const data = await request.formData();
    const confirmName = String(data.get('confirm_name') ?? '').trim();
    if (confirmName !== org.name) {
      return fail(400, { dangerError: st(locals.locale).serverErrors.typeOrgNameToConfirm(org.name) });
    }

    let result;
    try {
      result = await archiveAndDeleteOrg(locals.db, org.id, {
        closedBy: locals.user!.id,
        closedByEmail: locals.user!.email,
        reason: 'owner_closed',
        // Never delete an organisation that Stripe would go on charging.
        strictBilling: true,
      });
    } catch (e) {
      if (e instanceof BillingCancelError) return fail(502, { dangerError: st(locals.locale).settingsPages.closeBillingFailed });
      throw e;
    }

    // The confirmation page reads this once and deletes it.
    cookies.set(CLOSED_COOKIE, JSON.stringify({ name: org.name, ...result }), {
      path: '/app/org-closed', httpOnly: true, sameSite: 'lax', maxAge: 600,
    });
    redirect(303, '/app/org-closed');
  },
};
