import { error, fail, redirect } from '@sveltejs/kit';
import { loginUrl } from '$lib/login-redirect';
import { dbAll, dbFirst, dbRun, fromJsonArr } from '$lib/db/index';
import type { HallRow, HallBlockRow, ReservationRow } from '$lib/db/index';
import { parseExtraIds } from '$lib/extras';
import { dispatchWebhooks } from '$lib/notifications';
import { notifyGuestMessage, notifyGuestCancel, notifyGuestEdit, reservationChanges } from '$lib/email';
import {
	assertCanBook, getTakenDates, getHeldDatesByOthers, getUnavailableDates, getFullMonths,
	earliestBookableISO, isoLocal, addDays,
} from '$lib/availability';
import { loadBookableExtras } from '$lib/site/bookable-extras';
import { withinCancelNotice, cancelDeadline } from '$lib/site/cancellation';
import { st } from '$lib/i18n-server';
import { formatDate } from '$lib/format';
import { hasEventStarted, isEventPast } from '$lib/reservationStatus';
import type { Actions, PageServerLoad } from './$types';
import { markTicketRead } from '$lib/unread';
import { logReservationActivity } from '$lib/server/reservation-activity';
import { findOrCreateReservationThread, MESSAGE_MAX } from '$lib/server/threads';

const RANGE_DAYS = 540;
const EDITABLE = new Set(['pending']);
const CANCELLABLE = new Set(['pending', 'waiting_payment', 'approved', 'planned']);

/** Ticket subject: hall and date, the date in the client's language (it was en-GB). */
function subjectFor(hallName: string, eventDate: string, locale: App.Locals['locale']): string {
	return `${hallName} – ${formatDate(eventDate, locale)}`;
}

async function loadReservation(db: App.Locals['db'], id: string, userId: string, orgId: string) {
	return dbFirst<ReservationRow & { hall_name: string; hall_slug: string | null; hall_min_cancel_days: number }>(
		db,
		`SELECT r.*, h.name AS hall_name, h.slug AS hall_slug, h.min_cancel_days AS hall_min_cancel_days
		FROM reservations r
		JOIN halls h ON h.id = r.hall_id
		WHERE r.id = ? AND r.user_id = ? AND r.org_id = ?`,
		id, userId, orgId
	);
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.user) redirect(303, loginUrl(url, '/login'));
	const orgId = locals.domainOrg!.id;
	const userId = locals.user.id;

	const reservation = await loadReservation(locals.db, params.id, userId, orgId);
	if (!reservation) error(404, st(locals.locale).serverErrors.reservationNotFound);

	const hall = await dbFirst<HallRow>(locals.db, 'SELECT * FROM halls WHERE id = ?', reservation.hall_id);

	const fromISO = isoLocal(new Date());
	const toISO = isoLocal(addDays(new Date(), RANGE_DAYS));
	const blocksRaw = hall ? await dbAll<HallBlockRow>(locals.db, 'SELECT * FROM hall_blocks WHERE hall_id = ?', hall.id) : [];

	const ticket = await dbFirst<{ id: string; status: string }>(
		locals.db,
		`SELECT id, status FROM tickets WHERE user_id = ? AND org_id = ? AND reservation_id = ? ORDER BY created_at DESC LIMIT 1`,
		userId, orgId, reservation.id
	);
	const messages = ticket
		? await dbAll<{
				id: string; sender_id: string; body: string | null; message_type: string;
				attachment_url: string | null; attachment_name: string | null; attachment_type: string | null;
				created_at: string; sender_first_name: string; sender_last_name: string; sender_role: string | null;
			}>(locals.db,
				`SELECT m.id, m.sender_id, m.body, m.message_type, m.created_at,
				        m.attachment_url, m.attachment_name, m.attachment_type,
				        COALESCE(u.first_name, 'Former') AS sender_first_name,
				        COALESCE(u.last_name, 'member') AS sender_last_name, om.role AS sender_role
				FROM messages m
				LEFT JOIN users u ON u.id = m.sender_id
				LEFT JOIN organization_members om ON om.user_id = m.sender_id AND om.org_id = ?
				WHERE m.ticket_id = ?
				ORDER BY m.created_at`,
				orgId, ticket.id)
		: [];
	// Opening the booking shows its conversation: that is reading it (clears the badge).
	if (ticket) await markTicketRead(locals.db, userId, ticket.id);

	// Once the event has STARTED the client can no longer change anything about it.
	const started = hasEventStarted(reservation.event_date, reservation.start_time);
	const past = isEventPast(reservation.event_date, reservation.end_time);
	const selectedExtras = parseExtraIds(reservation.extras_json);
	// The venue's notice period decides whether Cancel is offered at all; offering it
	// and then refusing on confirm was the old behaviour.
	const noticeOk = withinCancelNotice(reservation.event_date, reservation.hall_min_cancel_days);

	return {
		reservation,
		hasStarted: started,
		isPast: past,
		editable: EDITABLE.has(reservation.status) && !started,
		cancellable: CANCELLABLE.has(reservation.status) && !started && noticeOk,
		// Past the notice period but otherwise cancellable: say until when it was possible.
		cancelWindowClosed: CANCELLABLE.has(reservation.status) && !started && !noticeOk,
		cancelDeadline: cancelDeadline(reservation.event_date, reservation.hall_min_cancel_days),
		// Once approved, the client can self-serve the seating tools (until the event starts).
		canManageEvent: new Set(['approved', 'planned']).has(reservation.status) && !started,
		// The read-only seating sheet stays available even after the event starts / once completed.
		canViewSeating: !!hall?.floorplan_json && new Set(['approved', 'planned', 'completed']).has(reservation.status),
		hasFloorplan: !!hall?.floorplan_json,
		// Extras: clients can change their selection until the booking is approved (and before it starts).
		// Within the plan's extras limit, plus whatever this client already ordered.
		extras: await loadBookableExtras(locals.db, reservation.hall_id, orgId, selectedExtras),
		selectedExtras,
		extrasEditable: new Set(['pending', 'waiting_payment']).has(reservation.status) && !started,
		hall: hall ? { id: hall.id, max_people: hall.max_people, min_days_advance: hall.min_days_advance, allow_reservations: hall.allow_reservations } : null,
		blocks: blocksRaw.map(b => ({ ...b, days_of_week: fromJsonArr(b.days_of_week as string | null) })),
		// Closed weekdays and blocks (server-side, the rule the update check uses), and
		// months at the plan's cap not counting this booking itself.
		unavailableDates: hall ? await getUnavailableDates(locals.db, hall, fromISO, toISO) : [],
		fullMonths: hall ? await getFullMonths(locals.db, hall, fromISO, toISO, reservation.id) : [],
		takenDates: hall ? (await getTakenDates(locals.db, hall.id, fromISO, toISO)).filter(d => d !== reservation.event_date) : [],
		heldDates: hall ? await getHeldDatesByOthers(locals.db, hall.id, userId) : [],
		earliestDate: earliestBookableISO(hall?.min_days_advance ?? 0),
		thread: { ticketId: ticket?.id ?? null, messages },
	};
};

export const actions: Actions = {
	// Client changes their extras selection (only before the booking is approved).
	editExtras: async ({ params, request, locals }) => {
		if (!locals.user || !locals.domainOrg) return fail(401, { error: st(locals.locale).serverErrors.notSignedIn });
		const orgId = locals.domainOrg.id;
		const reservation = await loadReservation(locals.db, params.id, locals.user.id, orgId);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.reservationNotFoundDot, scope: 'extras' });
		if (hasEventStarted(reservation.event_date, reservation.start_time)) return fail(400, { error: st(locals.locale).serverErrors.eventNoLongerEditable, scope: 'extras' });
		if (!new Set(['pending', 'waiting_payment']).has(reservation.status)) {
			return fail(400, { error: st(locals.locale).serverErrors.extrasNoLongerChangeable, scope: 'extras' });
		}
		const data = await request.formData();
		const requested = data.getAll('extras').map(String);
		// Extras above the plan's limit can be kept (if already chosen) but not added.
		const valid = (await loadBookableExtras(locals.db, reservation.hall_id, orgId, parseExtraIds(reservation.extras_json))).map(e => e.id);
		const ids = requested.filter(id => valid.includes(id));
		await dbRun(locals.db, 'UPDATE reservations SET extras_json = ? WHERE id = ? AND user_id = ? AND org_id = ?',
			ids.length ? JSON.stringify(ids) : null, params.id, locals.user.id, orgId);
		return { extrasSaved: true };
	},

	update: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { scope: 'update', error: st(locals.locale).serverErrors.notSignedIn });
		if (!locals.domainOrg) return fail(400, { scope: 'update', error: st(locals.locale).serverErrors.noOrganisationContext });
		const orgId = locals.domainOrg.id;
		const userId = locals.user.id;
		const reservation = await loadReservation(locals.db, params.id, userId, orgId);
		if (!reservation) return fail(404, { scope: 'update', error: st(locals.locale).serverErrors.reservationNotFoundDot });
		if (hasEventStarted(reservation.event_date, reservation.start_time)) return fail(400, { scope: 'update', error: st(locals.locale).serverErrors.eventNoLongerEditable });
		if (!EDITABLE.has(reservation.status)) return fail(400, { scope: 'update', error: st(locals.locale).serverErrors.reservationNoLongerEditable });

		const hall = await dbFirst<HallRow>(locals.db, 'SELECT * FROM halls WHERE id = ?', reservation.hall_id);
		if (!hall) return fail(404, { scope: 'update', error: st(locals.locale).serverErrors.hallNotFoundDot });

		const data = await request.formData();
		const title = String(data.get('title') ?? '').trim();
		const eventDate = String(data.get('eventDate') ?? '').trim();
		const startTime = String(data.get('startTime') ?? '').trim() || null;
		const endTime = String(data.get('endTime') ?? '').trim() || null;
		const description = String(data.get('description') ?? '').trim() || null;
		const numGuests = parseInt(String(data.get('numGuests') ?? ''), 10) || null;
		// A negative count was accepted and stored.
		if (numGuests != null && numGuests < 1) return fail(400, { scope: 'update', error: st(locals.locale).serverErrors.invalidGuestCount });

		if (!title) return fail(400, { scope: 'update', error: st(locals.locale).serverErrors.eventNameRequired });
		if (!eventDate) return fail(400, { scope: 'update', error: st(locals.locale).serverErrors.pleaseChooseDate });
		if (numGuests != null && hall.max_people && hall.max_people > 0 && numGuests > hall.max_people) {
			return fail(400, { scope: 'update', error: `${st(locals.locale).serverErrors.hallMaxCapacityPrefix} ${hall.max_people} ${st(locals.locale).serverErrors.hallMaxCapacitySuffix}` });
		}

		if (eventDate !== reservation.event_date) {
			const check = await assertCanBook(locals.db, hall, eventDate, userId, numGuests, locals.locale, params.id);
			if (!check.ok) return fail(400, { scope: 'update', error: check.reason });
		}

		try {
			await dbRun(locals.db,
				`UPDATE reservations SET title = ?, description = ?, event_date = ?, start_time = ?, end_time = ?, num_guests = ?
				 WHERE id = ? AND user_id = ? AND org_id = ? AND status = 'pending'`,
				title, description, eventDate, startTime, endTime, numGuests, params.id, userId, orgId
			);
		} catch {
			return fail(409, { scope: 'update', error: st(locals.locale).serverErrors.dateJustTaken });
		}

		const guestName = `${locals.user.first_name} ${locals.user.last_name}`;
		// Shown in the booking's history on the staff page.
		await logReservationActivity(locals.db, { reservationId: params.id, orgId, actorId: userId, actorName: guestName, kind: 'edited', note: 'client' });
		notifyGuestEdit(locals.db, orgId, guestName, title, hall.name, eventDate, {
			reservationId: params.id,
			changes: reservationChanges(reservation, { title, description, event_date: eventDate, start_time: startTime, end_time: endTime, num_guests: numGuests }),
		}).catch(() => {});

		return { updated: true };
	},

	cancel: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { scope: 'cancel', error: st(locals.locale).serverErrors.notSignedIn });
		if (!locals.domainOrg) return fail(400, { scope: 'cancel', error: st(locals.locale).serverErrors.noOrganisationContext });
		const orgId = locals.domainOrg.id;
		const userId = locals.user.id;
		const reservation = await loadReservation(locals.db, params.id, userId, orgId);
		if (!reservation) return fail(404, { scope: 'cancel', error: st(locals.locale).serverErrors.reservationNotFoundDot });
		if (hasEventStarted(reservation.event_date, reservation.start_time)) return fail(400, { scope: 'cancel', error: st(locals.locale).serverErrors.reservationNoLongerCancellable });
		if (!CANCELLABLE.has(reservation.status)) return fail(400, { scope: 'cancel', error: st(locals.locale).serverErrors.reservationNoLongerCancellable });

		// The venue's minimum cancellation notice. This is the ONLY cancel path a client
		// can reach, so without this the setting had no effect on the people it exists
		// for — staff already enforced it on their own path.
		// Same rule the page uses to decide whether to offer Cancel at all.
		if (reservation.hall_min_cancel_days > 0) {
			if (!withinCancelNotice(reservation.event_date, reservation.hall_min_cancel_days)) {
				return fail(400, {
					scope: 'cancel',
					error: st(locals.locale).serverErrors.cannotCancelBeforeEvent.replace('{days}', String(reservation.hall_min_cancel_days)),
				});
			}
		}

		await dbRun(locals.db,
			`UPDATE reservations SET status = 'cancelled', cancelled_by = 'client' WHERE id = ? AND user_id = ? AND org_id = ?`,
			params.id, userId, orgId);
		await logReservationActivity(locals.db, {
			reservationId: params.id, orgId, actorId: userId,
			actorName: `${locals.user.first_name} ${locals.user.last_name}`, kind: 'status', status: 'cancelled',
		});

		dispatchWebhooks(locals.db, orgId, 'reservation.status_changed', {
			reservation_id: reservation.id, title: reservation.title,
			hall_name: reservation.hall_name, event_date: reservation.event_date,
			status: 'cancelled', changed_by: 'client',
		}).catch(() => {});

		const guestName = `${locals.user.first_name} ${locals.user.last_name}`;
		notifyGuestCancel(locals.db, orgId, guestName, reservation.title, reservation.hall_name, reservation.event_date, { reservationId: reservation.id }).catch(() => {});

		return { cancelled: true };
	},

	sendMessage: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { error: st(locals.locale).serverErrors.notSignedIn });
		if (!locals.domainOrg) return fail(400, { error: st(locals.locale).serverErrors.noOrganisationContext });
		const orgId = locals.domainOrg.id;
		const user = locals.user;
		const reservation = await loadReservation(locals.db, params.id, user.id, orgId);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.reservationNotFoundDot });

		const data = await request.formData();
		const body = String(data.get('body') ?? '').trim();
		if (!body) return fail(400, { msgError: st(locals.locale).serverErrors.writeMessageFirst });
		if (body.length > MESSAGE_MAX) return fail(400, { msgError: st(locals.locale).resOps.messageTooLong(MESSAGE_MAX) });

		// One thread per booking: parallel first sends join the same thread (unique index, migration 0018).
		const thread = await findOrCreateReservationThread(locals.db, {
			orgId, reservationId: reservation.id, userId: user.id,
			subject: subjectFor(reservation.hall_name, reservation.event_date, locals.locale),
		});
		const ticket = { id: thread.id };
		const isNew = thread.created;

		await dbRun(locals.db,
			`INSERT INTO messages (id, ticket_id, sender_id, body, message_type) VALUES (?, ?, ?, ?, 'text')`,
			crypto.randomUUID(), ticket.id, user.id, body);
		await dbRun(locals.db, `UPDATE tickets SET updated_at = datetime('now'), status = 'open' WHERE id = ?`, ticket.id);

		dispatchWebhooks(locals.db, orgId, isNew ? 'ticket.new' : 'ticket.reply', {
			ticket_id: ticket.id, ticket_subject: subjectFor(reservation.hall_name, reservation.event_date, locals.locale),
			sender_name: `${user.first_name} ${user.last_name}`.trim(), message: body,
		}).catch(() => {});

		notifyGuestMessage(locals.db, orgId, `${user.first_name} ${user.last_name}`,
			subjectFor(reservation.hall_name, reservation.event_date, locals.locale), body, { reservationId: reservation.id, ticketId: ticket.id }).catch(() => {});

		return { msgSent: true };
	},
};
