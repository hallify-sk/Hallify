import type { PageServerLoad, Actions } from './$types';
import sql from '$lib/db';
import type { ReservationRow, ReservationStatus } from '$lib/db';
import { fail } from '@sveltejs/kit';
import { notifyStatusChange } from '$lib/email';
import { postSystemMessage } from '$lib/tickets';

export const load: PageServerLoad = async ({ locals }) => {
  const orgId = locals.currentOrg!.id;
  const reservations = await sql<ReservationRow[]>`
    SELECT r.*, h.name AS hall_name, u.first_name AS user_first_name,
      u.last_name AS user_last_name, u.email AS user_email
    FROM reservations r
    JOIN halls h ON h.id = r.hall_id
    JOIN users u ON u.id = r.user_id
    WHERE r.org_id = ${orgId}
    ORDER BY r.created_at DESC
  `;
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
    if (!id || !ALLOWED_STATUSES.includes(status)) return fail(400, { error: 'Invalid status' });

    const [res] = await sql<ReservationRow[]>`
      SELECT r.title, r.user_id, r.status AS old_status, u.email AS user_email
      FROM reservations r JOIN users u ON u.id = r.user_id
      WHERE r.id = ${id} AND r.org_id = ${orgId}
    `;
    if (!res) return fail(404, { error: 'Not found' });

    await sql`UPDATE reservations SET status = ${status} WHERE id = ${id} AND org_id = ${orgId}`;

    if (locals.user && res.user_id) {
      const adminName = `${locals.user.first_name} ${locals.user.last_name}`;
      await postSystemMessage(res.user_id, res.title, `status_change:${status}:${adminName}`, locals.user.id);
    }

    if (message && res.user_id && locals.user) {
      const subject = `[Reservation] ${res.title}`;
      let [ticket] = await sql<{ id: string }[]>`
        SELECT id FROM tickets WHERE user_id = ${res.user_id} AND subject = ${subject} AND org_id = ${orgId} ORDER BY created_at DESC LIMIT 1
      `;
      if (!ticket) {
        [ticket] = await sql<{ id: string }[]>`
          INSERT INTO tickets (user_id, subject, org_id) VALUES (${res.user_id}, ${subject}, ${orgId}) RETURNING id
        `;
      }
      await sql`
        INSERT INTO messages (ticket_id, sender_id, body, message_type)
        VALUES (${ticket.id}, ${locals.user.id}, ${message}, 'text')
      `;
      await sql`UPDATE tickets SET updated_at = NOW(), status = 'open' WHERE id = ${ticket.id}`;
    }

    if (res.user_email) {
      notifyStatusChange(res.user_email, res.title, status).catch(() => {});
    }

    return { success: true };
  }
};
