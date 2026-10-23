import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { ReservationRow, ReservationStatus } from '$lib/db/index';
import { notifyStatusChange, notifyNewMessage } from '$lib/email';
import { postSystemMessage } from '$lib/tickets';
import { dispatchWebhooks } from '$lib/notifications';
import { st } from '$lib/i18n-server';

/**
 * What staff can do to a booking, in one place: the reservation page's actions and
 * the AI assistant both call these, so a status change notifies the client, posts
 * to its activity log and fires its webhook the same way whoever pressed the button.
 *
 * Authorization is the caller's: the page checks staff, the assistant checks the
 * member's permission. These only check that the booking belongs to the org.
 */

export type OpResult<T = unknown> = ({ ok: true } & T) | { ok: false; status: number; error: string };

export const ALLOWED_STATUSES: ReservationStatus[] = ['pending', 'waiting_payment', 'approved', 'planned', 'completed', 'cancelled'];

type Actor = { id: string; first_name: string; last_name: string };

export async function changeReservationStatus(
	locals: App.Locals,
	orgId: string,
	reservationId: string,
	status: ReservationStatus,
	actor: Actor
): Promise<OpResult<{ title: string; from: string }>> {
	const e = st(locals.locale).serverErrors;
	if (!ALLOWED_STATUSES.includes(status)) return { ok: false, status: 400, error: e.invalidStatus };

	const reservation = await dbFirst<ReservationRow>(locals.db,
		'SELECT user_id, title, hall_id, status, event_date FROM reservations WHERE id = ? AND org_id = ?',
		reservationId, orgId);
	if (!reservation) return { ok: false, status: 404, error: e.notFound };

	// Bringing a reservation out of 'cancelled' can collide with the unique index
	// (one active reservation per hall per day) if the date was re-booked meanwhile.
	if (reservation.status === 'cancelled' && status !== 'cancelled') {
		// A retired hall cannot take an event back; it would have to be restored first.
		const hall = await dbFirst<{ archived_at: string | null }>(locals.db, 'SELECT archived_at FROM halls WHERE id = ?', reservation.hall_id);
		if (hall?.archived_at) return { ok: false, status: 409, error: e.hallArchived };
		const clash = await dbFirst<{ id: string }>(locals.db,
			"SELECT id FROM reservations WHERE hall_id = ? AND event_date = ? AND status != 'cancelled' AND id != ? LIMIT 1",
			reservation.hall_id, reservation.event_date, reservationId);
		if (clash) return { ok: false, status: 409, error: e.hallAlreadyBooked };
	}
	try {
		await dbRun(locals.db, 'UPDATE reservations SET status = ? WHERE id = ? AND org_id = ?', status, reservationId, orgId);
	} catch {
		return { ok: false, status: 409, error: e.hallAlreadyBooked };
	}

	await postSystemMessage(locals.db, reservation.user_id, reservation.title,
		`status_change:${status}:${actor.first_name} ${actor.last_name}`, actor.id);
	const client = await dbFirst<{ email: string }>(locals.db, 'SELECT email FROM users WHERE id = ?', reservation.user_id);
	if (client?.email) notifyStatusChange(locals.db, orgId, client.email, reservation.title, status, { reservationId }).catch(() => {});
	dispatchWebhooks(locals.db, orgId, 'reservation.status_changed', {
		reservation_id: reservationId, title: reservation.title,
		event_date: reservation.event_date, status, changed_by: 'staff'
	}).catch(() => {});

	return { ok: true, title: reservation.title, from: reservation.status };
}

/** A message from staff into the booking's own thread (created if it has none), emailed to the client. */
export async function messageReservationClient(
	locals: App.Locals,
	orgId: string,
	reservationId: string,
	body: string,
	actor: Actor
): Promise<OpResult<{ ticketId: string }>> {
	const e = st(locals.locale).serverErrors;
	const text = body.trim();
	if (!text) return { ok: false, status: 400, error: e.messageCannotBeEmpty };

	const res = await dbFirst<{ user_id: string; event_date: string; hall_name: string; user_email: string | null }>(locals.db,
		`SELECT r.user_id, r.event_date, h.name AS hall_name, u.email AS user_email
		   FROM reservations r JOIN halls h ON h.id = r.hall_id LEFT JOIN users u ON u.id = r.user_id
		  WHERE r.id = ? AND r.org_id = ?`,
		reservationId, orgId);
	if (!res) return { ok: false, status: 404, error: e.notFound };
	if (!res.user_id) return { ok: false, status: 400, error: e.reservationHasNoClientAccount };

	const existing = await dbFirst<{ id: string; subject: string }>(locals.db,
		'SELECT id, subject FROM tickets WHERE org_id = ? AND reservation_id = ? AND user_id = ? LIMIT 1',
		orgId, reservationId, res.user_id);
	const subject = existing?.subject ??
		`${res.hall_name} – ${new Date(res.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
	let ticketId = existing?.id;
	if (!ticketId) {
		ticketId = crypto.randomUUID();
		await dbRun(locals.db, `INSERT INTO tickets (id, org_id, user_id, reservation_id, subject, status) VALUES (?, ?, ?, ?, ?, 'open')`,
			ticketId, orgId, res.user_id, reservationId, subject);
	} else {
		await dbRun(locals.db, "UPDATE tickets SET status = 'open', updated_at = datetime('now') WHERE id = ?", ticketId);
	}
	await dbRun(locals.db, `INSERT INTO messages (id, ticket_id, sender_id, body, message_type) VALUES (?, ?, ?, ?, 'text')`,
		crypto.randomUUID(), ticketId, actor.id, text);

	if (res.user_email) {
		notifyNewMessage(locals.db, orgId, res.user_email, subject, `${actor.first_name} ${actor.last_name}`, { reservationId, ticketId, message: text }).catch(() => {});
	}
	dispatchWebhooks(locals.db, orgId, 'ticket.reply', { ticket_id: ticketId, reservation_id: reservationId }).catch(() => {});
	return { ok: true, ticketId };
}

/** The extras booked for an event: only ones its own hall offers are kept. */
export async function setReservationExtras(
	db: App.Locals['db'],
	orgId: string,
	reservationId: string,
	requested: string[]
): Promise<OpResult<{ kept: string[] }>> {
	const res = await dbFirst<{ hall_id: string }>(db, 'SELECT hall_id FROM reservations WHERE id = ? AND org_id = ?', reservationId, orgId);
	if (!res) return { ok: false, status: 404, error: 'not_found' };
	const valid = new Set((await dbAll<{ id: string }>(db, 'SELECT id FROM hall_extras WHERE hall_id = ?', res.hall_id)).map((x) => x.id));
	const kept = [...new Set(requested)].filter((id) => valid.has(id));
	await dbRun(db, 'UPDATE reservations SET extras_json = ? WHERE id = ? AND org_id = ?',
		kept.length ? JSON.stringify(kept) : null, reservationId, orgId);
	return { ok: true, kept };
}
