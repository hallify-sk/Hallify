import type { PageServerLoad, Actions } from './$types';
import { dbFirst, dbRun, toJson, fromJson } from '$lib/db/index';
import { requireOrgStaff } from '$lib/guards';

export const load: PageServerLoad = async ({ locals }) => {
  const orgId = locals.currentOrg!.id;
  const row = await dbFirst<{ value: string | null }>(locals.db,
    "SELECT value FROM org_settings WHERE org_id = ? AND key = 'email_notifications'",
    orgId
  );
  const saved = (row ? fromJson<Record<string, boolean>>(row.value) : null) ?? {};
  // Default ON — matches getNotifyConfig() in $lib/email.
  const notifications = {
    newReservation: saved.newReservation ?? true,
    guestMessage:   saved.guestMessage   ?? true,
    guestCancel:    saved.guestCancel    ?? true,
    guestEdit:      saved.guestEdit      ?? true,
    statusChange:   saved.statusChange   ?? true,
    newMessage:     saved.newMessage     ?? true,
  };
  return { notifications };
};

export const actions: Actions = {
  saveNotifications: async ({ request, locals }) => {
    requireOrgStaff(locals);
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const config = {
      newReservation: data.get('newReservation') === 'on',
      guestMessage:   data.get('guestMessage')   === 'on',
      guestCancel:    data.get('guestCancel')    === 'on',
      guestEdit:      data.get('guestEdit')      === 'on',
      statusChange:   data.get('statusChange')   === 'on',
      newMessage:     data.get('newMessage')     === 'on',
    };
    await dbRun(locals.db,
      `INSERT OR REPLACE INTO org_settings (org_id, key, value, updated_at)
       VALUES (?, 'email_notifications', ?, datetime('now'))`,
      orgId, toJson(config)
    );
    return { success: true };
  },
};
