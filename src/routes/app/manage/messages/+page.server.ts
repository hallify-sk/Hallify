import type { PageServerLoad, Actions } from './$types';
import { dbAll, dbRun } from '$lib/db/index';
import { error, fail } from '@sveltejs/kit';
// The client inbox follows the two message permissions, as the role editor
// describes them (D3): messages.view reads the client threads, messages.send
// answers, closes and reopens them. Both sit in the default Member role, so an
// organisation that wants its members out of the client threads takes them off
// that role.
import { requireOrgArea } from '$lib/server/access';

/** Answering, closing or reopening a client thread. */
async function requireSend(locals: App.Locals) {
  const { org, access } = await requireOrgArea(locals, 'messages');
  if (!access.messages.send) error(403, 'Forbidden');
  return org;
}

export const load: PageServerLoad = async ({ locals }) => {
  const { org, access } = await requireOrgArea(locals, 'messages');
  const orgId = org.id;

  const tickets = await dbAll<{
    id: string; subject: string; status: string; updated_at: string;
    user_id: string; user_first_name: string; user_last_name: string; user_email: string;
    reservation_id: string | null; hall_name: string | null; event_date: string | null;
    message_count: number; last_message: string | null;
    user_is_member: number; unread: number;
  }>(locals.db,
    `SELECT t.id, t.subject, t.status, t.updated_at,
      t.user_id, u.first_name AS user_first_name, u.last_name AS user_last_name, u.email AS user_email,
      t.reservation_id, h.name AS hall_name, r.event_date,
      (SELECT COUNT(*) FROM messages m WHERE m.ticket_id = t.id) AS message_count,
      (SELECT m2.body FROM messages m2 WHERE m2.ticket_id = t.id
        AND m2.message_type = 'text' ORDER BY m2.created_at DESC LIMIT 1) AS last_message,
      -- A colleague writing about their own booking, not a client.
      EXISTS (SELECT 1 FROM organization_members om WHERE om.org_id = t.org_id AND om.user_id = t.user_id) AS user_is_member,
      -- The client wrote after the last staff reply and after I last opened the thread.
      EXISTS (SELECT 1 FROM messages mu WHERE mu.ticket_id = t.id AND mu.sender_id = t.user_id AND mu.message_type != 'system'
        AND mu.created_at > COALESCE((SELECT MAX(m3.created_at) FROM messages m3 WHERE m3.ticket_id = t.id AND m3.sender_id != t.user_id), '')
        AND mu.created_at > COALESCE((SELECT tr.last_read_at FROM ticket_reads tr WHERE tr.ticket_id = t.id AND tr.user_id = ?), '')) AS unread
    FROM tickets t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN reservations r ON r.id = t.reservation_id
    LEFT JOIN halls h ON h.id = r.hall_id
    WHERE t.org_id = ?
    ORDER BY t.updated_at DESC`,
    locals.user!.id, orgId
  );

  return { tickets, canSend: access.messages.send };
};

export const actions: Actions = {
  close: async ({ request, locals }) => {
    const orgId = (await requireSend(locals)).id;
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    if (!id) return fail(400);
    await dbRun(locals.db, `UPDATE tickets SET status = 'closed', updated_at = datetime('now') WHERE id = ? AND org_id = ?`, id, orgId);
  },
  reopen: async ({ request, locals }) => {
    const orgId = (await requireSend(locals)).id;
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    if (!id) return fail(400);
    await dbRun(locals.db, `UPDATE tickets SET status = 'open', updated_at = datetime('now') WHERE id = ? AND org_id = ?`, id, orgId);
  },
};
