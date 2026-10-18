import type { PageServerLoad, Actions } from './$types';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { HallRow, ReservationRow, ReservationStatus } from '$lib/db/index';
import { fail, redirect } from '@sveltejs/kit';
import { notifyStatusChange } from '$lib/email';
import { postSystemMessage } from '$lib/tickets';
import { st } from '$lib/i18n-server';
import { requireOrgPermission } from '$lib/server/access';
import { earliestBookableISO } from '$lib/availability';
import { createReservation } from '$lib/server/reservations';

/** Caps on the customer details an operator types in. They are folded into the
 *  reservation description, so they are free text on a column nothing else
 *  bounds — the UI's maxlength is a convenience, this is the rule. */
const CUSTOMER_NAME_MAX = 120;
const CUSTOMER_CONTACT_MAX = 160;
const NOTES_MAX = 2000;

export const load: PageServerLoad = async ({ locals }) => {
  const orgId = (await requireOrgPermission(locals, 'reservations.manage')).id;
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

  // Halls for the manual-entry form. Halls that are not accepting reservations
  // are still listed — offered but disabled — because silently hiding them looks
  // like missing data to the operator.
  const halls = await dbAll<Pick<HallRow, 'id' | 'name' | 'max_people' | 'allow_reservations' | 'min_days_advance' | 'force_layouts'>>(
    locals.db,
    `SELECT id, name, max_people, allow_reservations, min_days_advance, force_layouts
     FROM halls WHERE org_id = ? AND plan_locked = 0 ORDER BY name`,
    orgId
  );

  // Layouts, for the same form. A hall with force_layouts rejects a booking that
  // carries no template (createReservation enforces it), so without this list the
  // manual form would be a dead end for exactly those halls: every submit would
  // come back "a layout must be selected" with nothing on screen to select.
  const templates = await dbAll<{ id: string; hall_id: string; name: string }>(
    locals.db,
    `SELECT t.id, t.hall_id, t.name
     FROM floorplan_templates t
     JOIN halls h ON h.id = t.hall_id
     WHERE h.org_id = ?
     ORDER BY t.name`,
    orgId
  );

  return {
    reservations,
    templates,
    halls: halls.map(h => ({
      ...h,
      allow_reservations: !!h.allow_reservations,
      force_layouts: !!h.force_layouts,
      earliestDate: earliestBookableISO(h.min_days_advance),
    })),
  };
};

const ALLOWED_STATUSES: ReservationStatus[] = ['pending', 'waiting_payment', 'approved', 'planned', 'completed', 'cancelled'];

export const actions: Actions = {
  updateStatus: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'reservations.manage');
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
  },

  /** A booking taken over the phone. The customer has no account and must not be
   *  made to create one, so the row is owned by the operator entering it and the
   *  caller's name and contact are written into the description — the only place
   *  the current schema has for them. Everything else (availability, the
   *  one-per-hall-day rule, capacity, the monthly cap) goes through exactly the
   *  same createReservation path the self-service wizard uses. */
  createManual: async ({ request, locals }) => {
    await requireOrgPermission(locals, 'reservations.manage');
    const orgId = locals.currentOrg!.id;
    const d = st(locals.locale);
    const data = await request.formData();

    const customerName = String(data.get('customerName') ?? '').trim();
    const customerContact = String(data.get('customerContact') ?? '').trim();
    const notes = String(data.get('notes') ?? '').trim();

    if (!customerName) {
      return fail(400, { manualError: d.serverErrors.customerNameRequired });
    }
    if (customerName.length > CUSTOMER_NAME_MAX || customerContact.length > CUSTOMER_CONTACT_MAX || notes.length > NOTES_MAX) {
      return fail(400, { manualError: d.serverErrors.manualFieldTooLong });
    }

    // Provenance first, then whatever the operator jotted down, so the detail
    // page reads "who this is for" before "what they asked for".
    const lines = [`${d.manualReservation.descCustomer}: ${customerName}`];
    if (customerContact) lines.push(`${d.manualReservation.descContact}: ${customerContact}`);
    lines.push(`${d.manualReservation.descTakenBy}: ${locals.user!.first_name} ${locals.user!.last_name}`);
    if (notes) lines.push('', notes);

    const created = await createReservation(locals, {
      orgId,
      hallId: String(data.get('hallId') ?? ''),
      title: String(data.get('title') ?? ''),
      description: lines.join('\n'),
      eventDate: String(data.get('eventDate') ?? ''),
      templateId: String(data.get('templateId') ?? ''),
      numGuests: parseInt(String(data.get('numGuests') ?? ''), 10) || null,
      eventType: String(data.get('eventType') ?? ''),
      eventTypeOther: String(data.get('eventTypeOther') ?? ''),
    });

    if (!created.ok) return fail(created.status, { manualError: created.error });

    redirect(303, `/app/reservation/${created.id}`);
  }
};
