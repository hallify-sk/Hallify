import type { PageServerLoad, Actions } from './$types';
import { dbAll, dbRun } from '$lib/db/index';
import { fail } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  const orgId = locals.currentOrg!.id;

  const tickets = await dbAll<{
    id: string; subject: string; status: string; updated_at: string;
    user_id: string; user_first_name: string; user_last_name: string; user_email: string;
    reservation_id: string | null; hall_name: string | null; event_date: string | null;
    message_count: number; last_message: string | null;
  }>(locals.db,
    `SELECT t.id, t.subject, t.status, t.updated_at,
      t.user_id, u.first_name AS user_first_name, u.last_name AS user_last_name, u.email AS user_email,
      t.reservation_id, h.name AS hall_name, r.event_date,
      (SELECT COUNT(*) FROM messages m WHERE m.ticket_id = t.id) AS message_count,
      (SELECT m2.body FROM messages m2 WHERE m2.ticket_id = t.id
        AND m2.message_type = 'text' ORDER BY m2.created_at DESC LIMIT 1) AS last_message
    FROM tickets t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN reservations r ON r.id = t.reservation_id
    LEFT JOIN halls h ON h.id = r.hall_id
    WHERE t.org_id = ?
    ORDER BY t.updated_at DESC`,
    orgId
  );

  return { tickets };
};

export const actions: Actions = {
  close: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    if (!id) return fail(400);
    await dbRun(locals.db, `UPDATE tickets SET status = 'closed', updated_at = datetime('now') WHERE id = ? AND org_id = ?`, id, orgId);
  },
  reopen: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    if (!id) return fail(400);
    await dbRun(locals.db, `UPDATE tickets SET status = 'open', updated_at = datetime('now') WHERE id = ? AND org_id = ?`, id, orgId);
  },
};
