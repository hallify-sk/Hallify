import { error, fail, redirect } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun, fromJsonArr } from '$lib/db/index';
import type { HallRow, HallBlockRow, ReservationRow, HallExtraRow } from '$lib/db/index';
import { parseExtraIds } from '$lib/extras';
import { dispatchWebhooks } from '$lib/notifications';
import { notifyGuestMessage, notifyGuestCancel, notifyGuestEdit } from '$lib/email';
import {
	assertCanBook, getTakenDates, getHeldDatesByOthers,
	earliestBookableISO, isoLocal, addDays,
} from '$lib/availability';
import { st } from '$lib/i18n-server';
import { formatDate } from '$lib/format';
import { hasEventStarted, isEventPast } from '$lib/reservationStatus';
import type { Actions, PageServerLoad } from './$types';

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

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) redirect(303, `/login?redirect=/halls/my-reservations/${params.id}`);
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
				created_at: string; sender_first_name: string; sender_last_name: string; sender_role: string | null;
			}>(locals.db,
				`SELECT m.id, m.sender_id, m.body, m.message_type, m.created_at,
				        COALESCE(u.first_name, 'Former') AS sender_first_name,
				        COALESCE(u.last_name, 'member') AS sender_last_name, om.role AS sender_role
				FROM messages m
				LEFT JOIN users u ON u.id = m.sender_id
				LEFT JOIN organization_members om ON om.user_id = m.sender_id AND om.org_id = ?
				WHERE m.ticket_id = ?
				ORDER BY m.created_at`,
				orgId, ticket.id)
		: [];

	// Once the event has STARTED the client can no longer change anything about it.
	const started = hasEventStarted(reservation.event_date, reservation.start_time);
	const past = isEventPast(reservation.event_date, reservation.end_time);

	return {
		reservation,
		hasStarted: started,
		isPast: past,
		editable: EDITABLE.has(reservation.status) && !started,
		cancellable: CANCELLABLE.has(reservation.status) && !started,
		// Once approved, the client can self-serve the seating tools (until the event starts).
		canManageEvent: new Set(['approved', 'planned']).has(reservation.status) && !started,
		// The read-only seating sheet stays available even after the event starts / once completed.
		canViewSeating: !!hall?.floorplan_json && new Set(['approved', 'planned', 'completed']).has(reservation.status),
		hasFloorplan: !!hall?.floorplan_json,
		// Extras: clients can change their selection until the booking is approved (and before it starts).
		extras: await dbAll<HallExtraRow>(locals.db, 'SELECT * FROM hall_extras WHERE hall_id = ? ORDER BY created_at', reservation.hall_id),
		selectedExtras: parseExtraIds(reservation.extras_json),
		extrasEditable: new Set(['pending', 'waiting_payment']).has(reservation.status) && !started,
		hall: hall ? { id: hall.id, max_people: hall.max_people, min_days_advance: hall.min_days_advance, allow_reservations: hall.allow_reservations } : null,
		blocks: blocksRaw.map(b => ({ ...b, days_of_week: fromJsonArr(b.days_of_week as string | null) })),
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
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.reservationNotFoundDot });
		if (hasEventStarted(reservation.event_date, reservation.start_time)) return fail(400, { error: st(locals.locale).serverErrors.eventNoLongerEditable });
		if (!new Set(['pending', 'waiting_payment']).has(reservation.status)) {
			return fail(400, { error: st(locals.locale).serverErrors.extrasNoLongerChangeable });
		}
		const data = await request.formData();
		const requested = data.getAll('extras').map(String);
		const valid = (await dbAll<{ id: string }>(locals.db, 'SELECT id FROM hall_extras WHERE hall_id = ?', reservation.hall_id)).map(e => e.id);
		const ids = requested.filter(id => valid.includes(id));
		await dbRun(locals.db, 'UPDATE reservations SET extras_json = ? WHERE id = ? AND user_id = ? AND org_id = ?',
			ids.length ? JSON.stringify(ids) : null, params.id, locals.user.id, orgId);
		return { extrasSaved: true };
	},

	update: async ({ params, request, locals }) => {
		if (!locals.user) return fail(401, { error: st(locals.locale).serverErrors.notSignedIn });
		if (!locals.domainOrg) return fail(400, { error: st(locals.locale).serverErrors.noOrganisationContext });
		const orgId = locals.domainOrg.id;
		const userId = locals.user.id;
		const reservation = await loadReservation(locals.db, params.id, userId, orgId);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.reservationNotFoundDot });
		if (hasEventStarted(reservation.event_date, reservation.start_time)) return fail(400, { error: st(locals.locale).serverErrors.eventNoLongerEditable });
		if (!EDITABLE.has(reservation.status)) return fail(400, { error: st(locals.locale).serverErrors.reservationNoLongerEditable });

		const hall = await dbFirst<HallRow>(locals.db, 'SELECT * FROM halls WHERE id = ?', reservation.hall_id);
		if (!hall) return fail(404, { error: st(locals.locale).serverErrors.hallNotFoundDot });

		const data = await request.formData();
		const title = String(data.get('title') ?? '').trim();
		const eventDate = String(data.get('eventDate') ?? '').trim();
		const startTime = String(data.get('startTime') ?? '').trim() || null;
		const endTime = String(data.get('endTime') ?? '').trim() || null;
		const description = String(data.get('description') ?? '').trim() || null;
		const numGuests = parseInt(String(data.get('numGuests') ?? ''), 10) || null;

		if (!title) return fail(400, { error: st(locals.locale).serverErrors.eventNameRequired });
		if (!eventDate) return fail(400, { error: st(locals.locale).serverErrors.pleaseChooseDate });
		if (numGuests != null && hall.max_people && hall.max_people > 0 && numGuests > hall.max_people) {
			return fail(400, { error: `${st(locals.locale).serverErrors.hallMaxCapacityPrefix} ${hall.max_people} ${st(locals.locale).serverErrors.hallMaxCapacitySuffix}` });
		}

		if (eventDate !== reservation.event_date) {
			const check = await assertCanBook(locals.db, hall, eventDate, userId, numGuests, locals.locale, params.id);
			if (!check.ok) return fail(400, { error: check.reason });
		}

		try {
			await dbRun(locals.db,
				`UPDATE reservations SET title = ?, description = ?, event_date = ?, start_time = ?, end_time = ?, num_guests = ?
				 WHERE id = ? AND user_id = ? AND org_id = ? AND status = 'pending'`,
				title, description, eventDate, startTime, endTime, numGuests, params.id, userId, orgId
			);
		} catch {
			return fail(409, { error: st(locals.locale).serverErrors.dateJustTaken });
		}

		const guestName = `${locals.user.first_name} ${locals.user.last_name}`;
		notifyGuestEdit(locals.db, orgId, guestName, title, hall.name, eventDate).catch(() => {});

		return { updated: true };
	},

	cancel: async ({ params, locals }) => {
		if (!locals.user) return fail(401, { error: st(locals.locale).serverErrors.notSignedIn });
		if (!locals.domainOrg) return fail(400, { error: st(locals.locale).serverErrors.noOrganisationContext });
		const orgId = locals.domainOrg.id;
		const userId = locals.user.id;
		const reservation = await loadReservation(locals.db, params.id, userId, orgId);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.reservationNotFoundDot });
		if (hasEventStarted(reservation.event_date, reservation.start_time)) return fail(400, { error: st(locals.locale).serverErrors.reservationNoLongerCancellable });
		if (!CANCELLABLE.has(reservation.status)) return fail(400, { error: st(locals.locale).serverErrors.reservationNoLongerCancellable });

		// The venue's minimum cancellation notice. This is the ONLY cancel path a client
		// can reach, so without this the setting had no effect on the people it exists
		// for — staff already enforced it on their own path.
		if (reservation.hall_min_cancel_days > 0) {
			const daysUntil = Math.ceil(
				(new Date(reservation.event_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
			);
			if (daysUntil < reservation.hall_min_cancel_days) {
				return fail(400, {
					error: st(locals.locale).serverErrors.cannotCancelBeforeEvent.replace('{days}', String(reservation.hall_min_cancel_days)),
				});
			}
		}

		await dbRun(locals.db,
			`UPDATE reservations SET status = 'cancelled' WHERE id = ? AND user_id = ? AND org_id = ?`,
			params.id, userId, orgId);

		dispatchWebhooks(locals.db, orgId, 'reservation.status_changed', {
			reservation_id: reservation.id, title: reservation.title,
			hall_name: reservation.hall_name, event_date: reservation.event_date,
			status: 'cancelled', changed_by: 'client',
		}).catch(() => {});

		const guestName = `${locals.user.first_name} ${locals.user.last_name}`;
		notifyGuestCancel(locals.db, orgId, guestName, reservation.title, reservation.hall_name, reservation.event_date).catch(() => {});

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

		let ticket = await dbFirst<{ id: string }>(locals.db,
			`SELECT id FROM tickets WHERE user_id = ? AND org_id = ? AND reservation_id = ? ORDER BY created_at DESC LIMIT 1`,
			user.id, orgId, reservation.id);

		const isNew = !ticket;
		if (!ticket) {
			const ticketId = crypto.randomUUID();
			await dbRun(locals.db,
				`INSERT INTO tickets (id, org_id, user_id, reservation_id, subject, status) VALUES (?, ?, ?, ?, ?, 'open')`,
				ticketId, orgId, user.id, reservation.id, subjectFor(reservation.hall_name, reservation.event_date, locals.locale));
			ticket = { id: ticketId };
		}

		await dbRun(locals.db,
			`INSERT INTO messages (id, ticket_id, sender_id, body, message_type) VALUES (?, ?, ?, ?, 'text')`,
			crypto.randomUUID(), ticket.id, user.id, body);
		await dbRun(locals.db, `UPDATE tickets SET updated_at = datetime('now'), status = 'open' WHERE id = ?`, ticket.id);

		dispatchWebhooks(locals.db, orgId, isNew ? 'ticket.new' : 'ticket.reply', {
			ticket_id: ticket.id, ticket_subject: subjectFor(reservation.hall_name, reservation.event_date, locals.locale),
			sender_name: `${user.first_name} ${user.last_name}`.trim(), message: body,
		}).catch(() => {});

		notifyGuestMessage(locals.db, orgId, `${user.first_name} ${user.last_name}`,
			subjectFor(reservation.hall_name, reservation.event_date, locals.locale), body).catch(() => {});

		return { msgSent: true };
	},
};
