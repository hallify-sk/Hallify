import type { PageServerLoad, Actions } from './$types';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { ReservationRow, ReservationStatus } from '$lib/db/index';
import { fail } from '@sveltejs/kit';
import { notifyStatusChange } from '$lib/email';
import { postSystemMessage } from '$lib/tickets';
import { st } from '$lib/i18n-server';

export const load: PageServerLoad = async ({ locals }) => {
  const orgId = locals.currentOrg!.id;
  const reservations = await dbAll<ReservationRow>(locals.db,
    `SELECT r.*, h.name AS hall_name, u.first_name AS user_first_name,
      u.last_name AS user_last_name, u.email AS user_email
    FROM reservations r
    JOIN halls h ON h.id = r.hall_id
    JOIN users u ON u.id = r.user_id
    WHERE r.org_id = ?
    ORDER BY r.created_at DESC`,
    orgId
  );
  return { reservations };
};

const ALLOWED_STATUSES: ReservationStatus[] = ['pending', 'waiting_payment', 'approved', 'planned', 'completed', 'cancelled'];

export const actions: Actions = {
  updateStatus: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const id = String(data.get('id') ?? '');
    const status = String(data.get('status') ?? '') as ReservationStatus;
    const message = String(data.get('message') ?? '').trim();
    if (!id || !ALLOWED_STATUSES.includes(status)) return fail(400, { error: st(locals.locale).serverErrors.invalidStatus });

    const res = await dbFirst<ReservationRow & { user_email: string }>(locals.db,
      `SELECT r.title, r.user_id, r.status AS old_status, u.email AS user_email
      FROM reservations r JOIN users u ON u.id = r.user_id
      WHERE r.id = ? AND r.org_id = ?`,
      id, orgId
    );
    if (!res) return fail(404, { error: st(locals.locale).serverErrors.notFound });

    await dbRun(locals.db,
      `UPDATE reservations SET status = ? WHERE id = ? AND org_id = ?`,
      status, id, orgId
    );

    if (locals.user && res.user_id) {
      const adminName = `${locals.user.first_name} ${locals.user.last_name}`;
      await postSystemMessage(locals.db, res.user_id, res.title, `status_change:${status}:${adminName}`, locals.user.id);
    }

    if (message && res.user_id && locals.user) {
      const subject = `[Reservation] ${res.title}`;
      let ticket = await dbFirst<{ id: string }>(locals.db,
        `SELECT id FROM tickets WHERE user_id = ? AND subject = ? AND org_id = ? ORDER BY created_at DESC LIMIT 1`,
        res.user_id, subject, orgId
      );
      if (!ticket) {
        const newTicketId = crypto.randomUUID();
        await dbRun(locals.db, `INSERT INTO tickets (id, user_id, subject, org_id) VALUES (?, ?, ?, ?)`, newTicketId, res.user_id, subject, orgId);
        ticket = { id: newTicketId };
      }
      await dbRun(locals.db,
        `INSERT INTO messages (id, ticket_id, sender_id, body, message_type) VALUES (?, ?, ?, ?, 'text')`,
        crypto.randomUUID(), ticket!.id, locals.user.id, message
      );
      await dbRun(locals.db,
        `UPDATE tickets SET updated_at = datetime('now'), status = 'open' WHERE id = ?`,
        ticket!.id
      );
    }

    if (res.user_email) {
      notifyStatusChange(locals.db, orgId, res.user_email, res.title, status).catch(() => {});
    }

    return { success: true };
  }
};
