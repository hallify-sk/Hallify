import { error, fail, redirect } from '@sveltejs/kit';
import { loginUrl } from '$lib/login-redirect';
import { dbAll, dbFirst, dbRun, fromJsonArr } from '$lib/db/index';
import type { HallRow, HallBlockRow } from '$lib/db/index';
import type { PageServerLoad, Actions } from './$types';
import { assertCanBook, getTakenDates, getHeldDatesByOthers, getUnavailableDates, getFullMonths, releaseHold, earliestBookableISO, isoLocal, addDays, HOLD_MINUTES } from '$lib/availability';
import { notifyNewReservation, notifyBookingReceived } from '$lib/email';
import { notifyOrg } from '$lib/server/notification-centre';
import { dispatchWebhooks } from '$lib/notifications';
import { st } from '$lib/i18n-server';
import { loadBookableExtras } from '$lib/site/bookable-extras';
import { saveExtrasSnapshot } from '$lib/server/reservation-extras';
import { noteMonthUsage, recordTurnedAway } from '$lib/server/cap-notices';
import { keepAlive } from '$lib/server/background';

const RANGE_DAYS = 540;

export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.user) {
		redirect(303, loginUrl(url, '/login'));
	}
	const orgId = locals.domainOrg!.id;

	const hall = await dbFirst<HallRow>(locals.db,
		`SELECT * FROM halls WHERE slug = ? AND is_public = 1 AND org_id = ?`, params.slug, orgId);
	if (!hall) error(404, st(locals.locale).serverErrors.hallNotFound);
	if (!hall.allow_reservations) error(403, st(locals.locale).serverErrors.hallNotAcceptingBookings);

	const fromISO = isoLocal(new Date());
	const toISO = isoLocal(addDays(new Date(), RANGE_DAYS));
	const blocksRaw = await dbAll<HallBlockRow>(locals.db, 'SELECT * FROM hall_blocks WHERE hall_id = ?', hall.id);

	return {
		hall,
		// Only the extras the venue's current plan allows (B88).
		extras: await loadBookableExtras(locals.db, hall.id, orgId),
		blocks: blocksRaw.map(b => ({ ...b, days_of_week: fromJsonArr(b.days_of_week as string | null) })),
		// Blocks AND closed weekdays, worked out on the server with the same rule the
		// submit check uses, so a closed day cannot be picked and held.
		unavailableDates: await getUnavailableDates(locals.db, hall, fromISO, toISO),
		// Months already at the plan's monthly cap: shown as full, not refused on submit.
		fullMonths: await getFullMonths(locals.db, hall, fromISO, toISO),
		takenDates: await getTakenDates(locals.db, hall.id, fromISO, toISO),
		heldDates: await getHeldDatesByOthers(locals.db, hall.id, locals.user.id),
		earliestDate: earliestBookableISO(hall.min_days_advance),
		holdMinutes: HOLD_MINUTES,
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		if (!locals.user) return fail(401, { error: st(locals.locale).serverErrors.notAuthenticated });
		const orgId = locals.domainOrg!.id;

		const hall = await dbFirst<HallRow>(locals.db,
			`SELECT * FROM halls WHERE slug = ? AND is_public = 1 AND org_id = ?`, params.slug, orgId);
		if (!hall) return fail(404, { error: st(locals.locale).serverErrors.hallNotFoundDot });

		const data = await request.formData();
		const title = String(data.get('title') ?? '').trim();
		const eventDate = String(data.get('eventDate') ?? '').trim();
		const startTime = String(data.get('startTime') ?? '').trim() || null;
		const endTime = String(data.get('endTime') ?? '').trim() || null;
		const description = String(data.get('description') ?? '').trim() || null;
		const numGuests = parseInt(String(data.get('numGuests') ?? ''), 10) || null;
		// Guard the lower bound too — a negative count was accepted and stored.
		if (numGuests != null && numGuests < 1) return fail(400, { error: st(locals.locale).serverErrors.invalidGuestCount });

		if (!title) return fail(400, { error: st(locals.locale).serverErrors.eventNameRequired });
		if (!eventDate) return fail(400, { error: st(locals.locale).serverErrors.pleaseChooseDate });

		const check = await assertCanBook(locals.db, hall, eventDate, locals.user.id, numGuests, locals.locale);
		if (!check.ok) {
			// The date cannot be booked (full month, closed day, taken...), so the
			// client's hold on it is released instead of blocking it for 15 minutes,
			// and the form is told to drop the date.
			await releaseHold(locals.db, hall.id, eventDate, locals.user.id);
			// A client turned away by the plan's monthly cap: the owner hears about it.
			if (check.code === 'month_full') keepAlive(recordTurnedAway(locals.db, hall, eventDate));
			return fail(400, { error: check.reason, dateRejected: true });
		}

		// Only keep selected extras that belong to this hall and that the venue's
		// plan still allows.
		const requested = data.getAll('extras').map(String);
		const valid = requested.length
			? (await loadBookableExtras(locals.db, hall.id, orgId)).map(e => e.id)
			: [];
		const extrasIds = requested.filter(id => valid.includes(id));
		const extrasJson = extrasIds.length ? JSON.stringify(extrasIds) : null;

		const reservationId = crypto.randomUUID();
		const status = hall.auto_approve ? 'approved' : 'pending';
		const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();

		try {
			await dbRun(locals.db,
				`INSERT INTO reservations
					(id, hall_id, org_id, user_id, title, description, event_date, start_time, end_time, status, invite_code, num_guests, extras_json)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				reservationId, hall.id, orgId, locals.user.id, title, description, eventDate, startTime, endTime,
				// Honour the hall's auto-approve flag, exactly as the apex client path and
				// the staff paths do. This branch hardcoded 'pending', so a venue that had
				// switched auto-approve on still had to approve every bubble booking.
				status,
				inviteCode, numGuests, extrasJson
			);
		} catch {
			return fail(409, { error: st(locals.locale).serverErrors.hallJustBooked });
		}

		await releaseHold(locals.db, hall.id, eventDate, locals.user.id);
		// The prices the extras were booked at, so a later price edit leaves this total alone.
		if (extrasIds.length) await saveExtrasSnapshot(locals.db, reservationId, hall.id, extrasIds);
		// This booking may have filled the month under the plan's cap: tell the owner.
		keepAlive(noteMonthUsage(locals.db, hall, eventDate));

		// Let the venue's owners/admins know a guest has requested a booking.
		const guestName = `${locals.user.first_name} ${locals.user.last_name}`;
		notifyNewReservation(locals.db, orgId, title, guestName, hall.name, eventDate, { reservationId }).catch(() => {});
		await notifyOrg(locals.db, {
			orgId, kind: status === 'pending' ? 'booking.requested' : 'booking.created',
			params: { title, hall: hall.name, date: eventDate, client: guestName },
			link: `/app/reservation/${reservationId}`, actorId: locals.user.id,
		});
		// And give the client a receipt: "we have your request", or "confirmed" when
		// the hall approves bookings by itself.
		notifyBookingReceived(locals.db, orgId, reservationId).catch(() => {});

		// Same webhook as a staff-made booking (src/lib/server/reservations.ts):
		// bookings from the venue site fired none.
		dispatchWebhooks(locals.db, orgId, 'reservation.new', {
			reservation_id: reservationId, title, hall_id: hall.id, event_date: eventDate, event_type: null,
		}).catch(() => {});

		// The confirmation says what actually happened: an auto-approved booking is
		// confirmed, not "the venue will review it".
		redirect(303, `/halls/my-reservations?booked=${status === 'approved' ? 'approved' : '1'}`);
	}
};
