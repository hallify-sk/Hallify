import type { PageServerLoad, Actions } from './$types';
import { redirect, fail } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun, toJson, fromJson, fromJsonArr } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import { PLANS } from '$lib/plans';
import { requireOrgPermission } from '$lib/server/access';
import { archiveAndDeleteOrg, orgMemberCount } from '$lib/orgLifecycle';
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
] as const;

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(303, '/app/login');
  const org = await requireOrgPermission(locals, 'settings.manage');

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
  const locked = !planHasWebhooks(org.subscription.plan);

  const rawWebhooks = locked ? [] : await dbAll<{
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

  const recentDeliveries = locked ? [] : await dbAll<{
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

  return {
    notifications, recipients, staff,
    locked, plan: org.subscription.plan, webhooks, recentDeliveries,
    orgName: org.name,
    isOwner: org.role === 'owner',
    impersonated: !!org.impersonated,
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

  delete: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'settings.manage');
    const org = locals.currentOrg!;
    if (!planHasWebhooks(org.subscription.plan)) return fail(403, { error: st(locals.locale).serverErrors.webhooksPaidPlan });
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    await dbRun(locals.db, 'DELETE FROM org_webhooks WHERE id = ? AND org_id = ?', id, org.id);
  },

  // ── Danger zone (moved here from the Members page) ────────────────────
  // Current user leaves the org. The last member (usually the owner) cannot
  // leave — they must explicitly close the organization.
  leave: async ({ locals, cookies }) => {
    await requireOrgPermission(locals, 'settings.manage');
    if (locals.currentOrg?.impersonated) return fail(403, { error: st(locals.locale).serverErrors.impersonationBlockThisOrg });
    const orgId = locals.currentOrg!.id;
    const userId = locals.user!.id;

    const me = await dbFirst<{ role: string }>(locals.db,
      'SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?', orgId, userId);
    if (!me) return fail(400, { error: st(locals.locale).serverErrors.notMemberOfOrg });

    if (await orgMemberCount(locals.db, orgId) <= 1) {
      return fail(400, { error: st(locals.locale).serverErrors.lastMemberCloseOrgInstead });
    }
    if (me.role === 'owner') {
      const owners = await dbFirst<{ count: number }>(locals.db,
        `SELECT COUNT(*) AS count FROM organization_members WHERE org_id = ? AND role = 'owner'`, orgId);
      if (Number(owners?.count ?? 0) <= 1) {
        return fail(400, { error: st(locals.locale).serverErrors.onlyOwnerPromoteOrClose });
      }
    }

    await dbRun(locals.db, 'DELETE FROM organization_members WHERE org_id = ? AND user_id = ?', orgId, userId);
    const sessionId = cookies.get('session_id');
    if (sessionId) await dbRun(locals.db, 'UPDATE sessions SET current_org_id = NULL WHERE id = ?', sessionId);
    redirect(303, '/app/');
  },

  // Owner-only: permanently close the organization. Archives a legal/accounting
  // record (kept indefinitely) then deletes all live data. Requires typing the
  // org name to confirm.
  closeOrg: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'settings.manage');
    const org = locals.currentOrg!;
    if (org.impersonated) return fail(403, { error: st(locals.locale).serverErrors.impersonationBlockThisOrg });
    if (org.role !== 'owner') return fail(403, { error: st(locals.locale).serverErrors.onlyOwnerCanCloseOrg });

    const data = await request.formData();
    const confirmName = String(data.get('confirm_name') ?? '').trim();
    if (confirmName !== org.name) {
      return fail(400, { error: st(locals.locale).serverErrors.typeOrgNameToConfirm(org.name) });
    }

    await archiveAndDeleteOrg(locals.db, org.id, {
      closedBy: locals.user!.id,
      closedByEmail: locals.user!.email,
      reason: 'owner_closed',
    });

    redirect(303, '/app/');
  },
};
