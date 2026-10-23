import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { HallRow, ReservationRow, ReservationStatus } from '$lib/db/index';
import { notifyStatusChange, notifyNewMessage, notifyHallCancellation } from '$lib/email';
import { dispatchWebhooks } from '$lib/notifications';
import { assertCanBook } from '$lib/availability';
import { st } from '$lib/i18n-server';
import { logReservationActivity } from '$lib/server/reservation-activity';
import { findOrCreateReservationThread, MESSAGE_MAX } from '$lib/server/threads';
import { checkStatusTransition, normalizeTime, todayUtcISO } from '$lib/server/reservation-rules';

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

/** Longest reason a venue can give when declining. */
export const DECLINE_REASON_MAX = 1000;

type Actor = { id: string; first_name: string; last_name: string };

type StatusOptions = {
	/** The status the person saw when they chose the new one. When the booking has
	 *  moved on since (another tab, a colleague), nothing is changed. */
	expectedFrom?: string | null;
	/** Declining: the reason shown to the client and included in the e-mail. */
	reason?: string | null;
};

export async function changeReservationStatus(
	locals: App.Locals,
	orgId: string,
	reservationId: string,
	status: ReservationStatus,
	actor: Actor,
	opts: StatusOptions = {}
): Promise<OpResult<{ title: string; from: string }>> {
	const d = st(locals.locale);
	const e = d.serverErrors;
	if (!ALLOWED_STATUSES.includes(status)) return { ok: false, status: 400, error: e.invalidStatus };

	const reservation = await dbFirst<ReservationRow & { hall_name: string; owner_type: string | null }>(locals.db,
		`SELECT r.user_id, r.title, r.hall_id, r.status, r.event_date, h.name AS hall_name, u.account_type AS owner_type
		   FROM reservations r JOIN halls h ON h.id = r.hall_id LEFT JOIN users u ON u.id = r.user_id
		  WHERE r.id = ? AND r.org_id = ?`,
		reservationId, orgId);
	if (!reservation) return { ok: false, status: 404, error: e.notFound };

	const from = reservation.status;
	if (opts.expectedFrom && opts.expectedFrom !== from) {
		return { ok: false, status: 409, error: d.resOps.staleStatus };
	}
	// Choosing the status it already has changes nothing and must not e-mail anyone.
	if (status === from && !opts.reason) return { ok: true, title: reservation.title, from };

	const rule = checkStatusTransition(from, status, reservation.event_date, todayUtcISO());
	if (rule === 'completed_in_future') return { ok: false, status: 400, error: d.resOps.completedInFuture };
	if (rule === 'date_passed') return { ok: false, status: 400, error: d.resOps.datePassed };

	// Bringing a reservation out of 'cancelled' can collide with the unique index
	// (one active reservation per hall per day) if the date was re-booked meanwhile.
	if (from === 'cancelled' && status !== 'cancelled') {
		// A retired hall cannot take an event back; it would have to be restored first.
		const hall = await dbFirst<{ archived_at: string | null }>(locals.db, 'SELECT archived_at FROM halls WHERE id = ?', reservation.hall_id);
		if (hall?.archived_at) return { ok: false, status: 409, error: e.hallArchived };
		const clash = await dbFirst<{ id: string }>(locals.db,
			"SELECT id FROM reservations WHERE hall_id = ? AND event_date = ? AND status != 'cancelled' AND id != ? LIMIT 1",
			reservation.hall_id, reservation.event_date, reservationId);
		if (clash) return { ok: false, status: 409, error: e.hallAlreadyBooked };
	}

	const reason = status === 'cancelled' ? (opts.reason ?? '').trim().slice(0, DECLINE_REASON_MAX) || null : null;
	let changed = 0;
	try {
		// The old status is part of the WHERE: a stale tab cannot overwrite a change it never saw.
		const r = await dbRun(locals.db,
			`UPDATE reservations SET status = ?, status_reason = ?, cancelled_by = ?
			  WHERE id = ? AND org_id = ? AND status = ?`,
			status, reason, status === 'cancelled' ? 'venue' : null, reservationId, orgId, from);
		changed = r.meta?.changes ?? 1;
	} catch {
		return { ok: false, status: 409, error: e.hallAlreadyBooked };
	}
	if (changed === 0) return { ok: false, status: 409, error: d.resOps.staleStatus };

	const actorName = `${actor.first_name} ${actor.last_name}`.trim();
	await logReservationActivity(locals.db, {
		reservationId, orgId, actorId: actor.id, actorName,
		kind: reason ? 'declined' : 'status', status, note: reason,
	});

	const client = await dbFirst<{ email: string }>(locals.db, 'SELECT email FROM users WHERE id = ?', reservation.user_id);
	if (client?.email) {
		if (reason) {
			// One e-mail that carries the reason, rather than a status mail plus a message mail.
			notifyHallCancellation(locals.db, orgId, client.email, {
				title: reservation.title, hallName: reservation.hall_name, date: reservation.event_date, message: reason,
			}).catch(() => {});
		} else {
			notifyStatusChange(locals.db, orgId, client.email, reservation.title, status).catch(() => {});
		}
	}
	// The reason also goes into the booking's conversation, where the client reads it on
	// the venue site — the e-mail alone is easy to miss. Only for a real client account:
	// an internal event's owner is a colleague.
	if (reason && reservation.owner_type === 'client') {
		const thread = await findOrCreateReservationThread(locals.db, {
			orgId, reservationId, userId: reservation.user_id,
			subject: threadSubject(reservation.hall_name, reservation.event_date),
		});
		await dbRun(locals.db, `INSERT INTO messages (id, ticket_id, sender_id, body, message_type) VALUES (?, ?, ?, ?, 'text')`,
			crypto.randomUUID(), thread.id, actor.id, reason);
		await dbRun(locals.db, "UPDATE tickets SET status = 'open', updated_at = datetime('now') WHERE id = ?", thread.id);
	}
	dispatchWebhooks(locals.db, orgId, 'reservation.status_changed', {
		reservation_id: reservationId, title: reservation.title,
		event_date: reservation.event_date, status, changed_by: 'staff',
		...(reason ? { reason } : {}),
	}).catch(() => {});

	return { ok: true, title: reservation.title, from };
}

function threadSubject(hallName: string, eventDate: string): string {
	return `${hallName} – ${new Date(eventDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
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
	if (text.length > MESSAGE_MAX) return { ok: false, status: 400, error: st(locals.locale).resOps.messageTooLong(MESSAGE_MAX) };

	const res = await dbFirst<{ user_id: string; event_date: string; hall_name: string; user_email: string | null }>(locals.db,
		`SELECT r.user_id, r.event_date, h.name AS hall_name, u.email AS user_email
		   FROM reservations r JOIN halls h ON h.id = r.hall_id LEFT JOIN users u ON u.id = r.user_id
		  WHERE r.id = ? AND r.org_id = ?`,
		reservationId, orgId);
	if (!res) return { ok: false, status: 404, error: e.notFound };
	if (!res.user_id) return { ok: false, status: 400, error: e.reservationHasNoClientAccount };

	const thread = await findOrCreateReservationThread(locals.db, {
		orgId, reservationId, userId: res.user_id, subject: threadSubject(res.hall_name, res.event_date),
	});
	if (!thread.created) {
		await dbRun(locals.db, "UPDATE tickets SET status = 'open', updated_at = datetime('now') WHERE id = ?", thread.id);
	}
	await dbRun(locals.db, `INSERT INTO messages (id, ticket_id, sender_id, body, message_type) VALUES (?, ?, ?, ?, 'text')`,
		crypto.randomUUID(), thread.id, actor.id, text);

	if (res.user_email) {
		notifyNewMessage(locals.db, orgId, res.user_email, thread.subject, `${actor.first_name} ${actor.last_name}`).catch(() => {});
	}
	dispatchWebhooks(locals.db, orgId, 'ticket.reply', { ticket_id: thread.id, reservation_id: reservationId }).catch(() => {});
	return { ok: true, ticketId: thread.id };
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

export interface DetailsInput {
	eventDate: string;
	startTime: string;
	endTime: string;
	numGuests: string;
	description: string;
	internalNotes: string;
}

export const NOTES_MAX = 2000;

/**
 * Staff edit the date, times, guest count and notes of a booking. A new date goes
 * through the same availability rules as a booking (taken, held, blocked, closed day,
 * monthly cap), except the minimum-notice rule, which binds clients and not the venue.
 */
export async function editReservationDetails(
	locals: App.Locals,
	orgId: string,
	reservationId: string,
	input: DetailsInput,
	actor: Actor
): Promise<OpResult<{ changed: string[] }>> {
	const d = st(locals.locale);
	const e = d.serverErrors;
	const res = await dbFirst<ReservationRow>(locals.db,
		'SELECT * FROM reservations WHERE id = ? AND org_id = ?', reservationId, orgId);
	if (!res) return { ok: false, status: 404, error: e.notFound };
	const hall = await dbFirst<HallRow>(locals.db, 'SELECT * FROM halls WHERE id = ? AND org_id = ?', res.hall_id, orgId);
	if (!hall) return { ok: false, status: 404, error: e.hallNotFound };

	const eventDate = input.eventDate.trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return { ok: false, status: 400, error: e.chooseValidDate };
	const rawStart = input.startTime.trim();
	const rawEnd = input.endTime.trim();
	const startTime = normalizeTime(rawStart);
	const endTime = normalizeTime(rawEnd);
	if ((rawStart && !startTime) || (rawEnd && !endTime)) return { ok: false, status: 400, error: d.resOps.invalidTime };
	const guestsRaw = input.numGuests.trim();
	const numGuests = guestsRaw ? parseInt(guestsRaw, 10) : null;
	if (guestsRaw && (!Number.isFinite(numGuests) || (numGuests as number) < 1)) {
		return { ok: false, status: 400, error: d.resOps.invalidGuests };
	}
	const description = input.description.trim();
	const internalNotes = input.internalNotes.trim();
	if (description.length > NOTES_MAX || internalNotes.length > NOTES_MAX) {
		return { ok: false, status: 400, error: e.manualFieldTooLong };
	}

	const changed: string[] = [];
	if (eventDate !== res.event_date) changed.push('date');
	if ((startTime ?? null) !== (res.start_time ?? null) || (endTime ?? null) !== (res.end_time ?? null)) changed.push('time');
	if ((numGuests ?? null) !== (res.num_guests ?? null)) changed.push('guests');
	if ((description || null) !== (res.description || null)) changed.push('notes');
	const prevInternal = (res as ReservationRow & { internal_notes?: string | null }).internal_notes ?? null;
	if ((internalNotes || null) !== (prevInternal || null)) changed.push('internal');
	if (changed.length === 0) return { ok: true, changed };

	const active = res.status !== 'cancelled';
	if (changed.includes('date') && active) {
		// Staff are not bound by the client-facing notice period or the "accepting
		// bookings" switch; everything else (a taken, held, blocked or closed day, the
		// plan's monthly cap, the past) still applies.
		const check = await assertCanBook(locals.db,
			{ ...hall, allow_reservations: 1, min_days_advance: 0 },
			eventDate, actor.id, numGuests, locals.locale, reservationId);
		if (!check.ok) return { ok: false, status: 409, error: check.reason ?? e.dateUnavailable };
	} else if (changed.includes('guests') && numGuests != null && hall.max_people && hall.max_people > 0 && numGuests > hall.max_people) {
		return { ok: false, status: 400, error: e.hallMaxCapacityGuests(hall.max_people) };
	}

	try {
		await dbRun(locals.db,
			`UPDATE reservations SET event_date = ?, start_time = ?, end_time = ?, num_guests = ?, description = ?, internal_notes = ?
			  WHERE id = ? AND org_id = ?`,
			eventDate, startTime, endTime, numGuests, description || null, internalNotes || null, reservationId, orgId);
	} catch {
		// Lost the one-per-hall-day unique index race.
		return { ok: false, status: 409, error: e.dateJustTaken };
	}

	await logReservationActivity(locals.db, {
		reservationId, orgId, actorId: actor.id, actorName: `${actor.first_name} ${actor.last_name}`.trim(),
		kind: 'edited', note: changed.join(','),
	});
	return { ok: true, changed };
}
