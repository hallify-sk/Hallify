import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { ReservationStatus } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';
import { postSystemMessage } from '$lib/tickets';
import { notifyHallCancellation, notifyStatusChange } from '$lib/email';
import { dispatchWebhooks } from '$lib/notifications';

/**
 * Retiring a hall, and cancelling bookings a hall can no longer host.
 *
 * A hall is archived, never deleted, once anyone has booked it: its reservations
 * reference it (and D1 enforces that), and they are somebody's event history. What
 * stands in the way of archiving is only the bookings the venue is still committed
 * to — live ones that have not happened yet. Past and cancelled bookings stay with
 * the archived hall.
 */

/** A booking in one of these states still commits the venue to hosting it. */
const LIVE = `('pending', 'waiting_payment', 'approved', 'planned')`;

export interface BlockingReservation {
	id: string;
	title: string;
	event_date: string;
	status: ReservationStatus;
	user_id: string;
	client_name: string | null;
	client_email: string | null;
}

/** Live bookings dated today or later. A hall cannot be archived while any remain. */
export async function blockingReservations(db: D1Database, hallId: string): Promise<BlockingReservation[]> {
	return dbAll<BlockingReservation>(db,
		`SELECT r.id, r.title, r.event_date, r.status, r.user_id,
		        NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS client_name,
		        u.email AS client_email
		   FROM reservations r LEFT JOIN users u ON u.id = r.user_id
		  WHERE r.hall_id = ? AND r.status IN ${LIVE}
		    AND substr(r.event_date, 1, 10) >= date('now')
		  ORDER BY r.event_date`,
		hallId);
}

/** Whether a hall has never been booked at all — the only case a hard delete is
 *  safe, because nothing else in the system remembers it. A request for the
 *  mapping service counts too: deleting the hall would silently cascade it away. */
export async function hallIsUnused(db: D1Database, hallId: string): Promise<boolean> {
	const booked = await dbFirst<{ ok: number }>(db, 'SELECT 1 AS ok FROM reservations WHERE hall_id = ? LIMIT 1', hallId);
	if (booked) return false;
	try {
		const mapping = await dbFirst<{ ok: number }>(db, 'SELECT 1 AS ok FROM floorplan_requests WHERE hall_id = ? LIMIT 1', hallId);
		if (mapping) return false;
	} catch {
		/* table arrives with 0008; absent means no requests */
	}
	return true;
}

const fmtDate = (d: string) =>
	new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' });

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Live bookings of a hall inside a blocked period: between two dates (inclusive)
 * and, when `days` is given, only on those weekdays (0 = Sunday … 6 = Saturday, as
 * the block dialog and hall_blocks store them). Past dates are never included — a
 * block cannot undo an event that already happened.
 */
export async function reservationsInRange(
	db: D1Database,
	hallId: string,
	range: { from: string; to: string; days?: number[] | null }
): Promise<BlockingReservation[]> {
	if (!ISO_DATE.test(range.from) || !ISO_DATE.test(range.to) || range.to < range.from) return [];
	const days = [...new Set((range.days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
	const rows = await dbAll<BlockingReservation & { weekday: string }>(db,
		`SELECT r.id, r.title, r.event_date, r.status, r.user_id,
		        NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS client_name,
		        u.email AS client_email,
		        strftime('%w', substr(r.event_date, 1, 10)) AS weekday
		   FROM reservations r LEFT JOIN users u ON u.id = r.user_id
		  WHERE r.hall_id = ? AND r.status IN ${LIVE}
		    AND substr(r.event_date, 1, 10) >= date('now')
		    AND substr(r.event_date, 1, 10) BETWEEN ? AND ?
		  ORDER BY r.event_date`,
		hallId, range.from, range.to);
	return rows
		.filter((r) => !days.length || days.includes(Number(r.weekday)))
		.map(({ weekday: _weekday, ...r }) => r);
}

export interface CancelOpts {
	orgId: string;
	hallId: string;
	hallName: string;
	actor: { id: string; name: string };
	message: string;
	/** Why, for webhook consumers: the hall is being retired, or a period was blocked. */
	reason: 'hall_archived' | 'hall_blocked';
}

/**
 * Cancel the given bookings and tell each client why.
 *
 * Each client gets the usual "cancelled" entry in their activity log, the note in
 * their reservation's own message thread (where they can answer it), and a single
 * email carrying the note. Bookings the acting staff member owns themselves (an
 * event they entered for a client who never signed up) are cancelled without
 * messaging anyone — there is nobody on the other end.
 *
 * The rows must come from blockingReservations or reservationsInRange, never from
 * ids a form posted: those re-read the hall's own live, upcoming bookings.
 */
export async function cancelReservations(
	db: D1Database,
	rows: BlockingReservation[],
	opts: CancelOpts
): Promise<{ cancelled: number }> {
	const pending: Promise<unknown>[] = [];
	let cancelled = 0;

	for (const r of rows) {
		const res = await dbRun(db,
			`UPDATE reservations SET status = 'cancelled' WHERE id = ? AND org_id = ? AND hall_id = ? AND status IN ${LIVE}`,
			r.id, opts.orgId, opts.hallId);
		// Changed by somebody else meanwhile: nothing to announce.
		if (res.meta && res.meta.changes === 0) continue;
		cancelled++;

		pending.push(dispatchWebhooks(db, opts.orgId, 'reservation.status_changed', {
			reservation_id: r.id, title: r.title, event_date: r.event_date,
			status: 'cancelled', changed_by: 'staff',
			hall_id: opts.hallId, reason: opts.reason,
		}));

		if (r.user_id === opts.actor.id) continue;

		await postSystemMessage(db, r.user_id, r.title, `status_change:cancelled:${opts.actor.name}`, opts.actor.id);

		if (opts.message) {
			// The reservation's own thread — the one the client sees on their booking.
			const existing = await dbFirst<{ id: string }>(db,
				'SELECT id FROM tickets WHERE org_id = ? AND reservation_id = ? AND user_id = ? LIMIT 1',
				opts.orgId, r.id, r.user_id);
			let ticketId = existing?.id;
			if (!ticketId) {
				ticketId = crypto.randomUUID();
				await dbRun(db,
					`INSERT INTO tickets (id, org_id, user_id, reservation_id, subject, status) VALUES (?, ?, ?, ?, ?, 'open')`,
					ticketId, opts.orgId, r.user_id, r.id, `${opts.hallName} – ${fmtDate(r.event_date)}`);
			} else {
				await dbRun(db, "UPDATE tickets SET status = 'open', updated_at = datetime('now') WHERE id = ?", ticketId);
			}
			await dbRun(db,
				`INSERT INTO messages (id, ticket_id, sender_id, body, message_type) VALUES (?, ?, ?, ?, 'text')`,
				crypto.randomUUID(), ticketId, opts.actor.id, opts.message);
		}

		if (r.client_email) {
			pending.push(opts.message
				? notifyHallCancellation(db, opts.orgId, r.client_email, {
					title: r.title, hallName: opts.hallName, date: fmtDate(r.event_date), message: opts.message,
				}, { reservationId: r.id })
				: notifyStatusChange(db, opts.orgId, r.client_email, r.title, 'cancelled', { reservationId: r.id }));
		}
	}

	// Awaited, not fired and forgotten: on Workers, work still pending when the
	// response is sent can be dropped, and these are the clients' only notice.
	await Promise.allSettled(pending);
	return { cancelled };
}

/**
 * Cancel every blocking booking of a hall at once (before archiving it). Re-reads
 * the list rather than trusting ids from the form, so a booking made after the page
 * loaded is included and nothing from another hall can be named.
 */
export async function cancelHallReservations(
	db: D1Database,
	opts: Omit<CancelOpts, 'reason'>
): Promise<{ cancelled: number }> {
	return cancelReservations(db, await blockingReservations(db, opts.hallId), { ...opts, reason: 'hall_archived' });
}
