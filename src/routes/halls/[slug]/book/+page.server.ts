import { error, fail, redirect } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun, fromJsonArr } from '$lib/db/index';
import type { HallRow, HallBlockRow, HallExtraRow } from '$lib/db/index';
import type { PageServerLoad, Actions } from './$types';
import { assertCanBook, getTakenDates, getHeldDatesByOthers, releaseHold, earliestBookableISO, isoLocal, addDays, HOLD_MINUTES } from '$lib/availability';
import { notifyNewReservation } from '$lib/email';
import { st } from '$lib/i18n-server';

const RANGE_DAYS = 540;

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) {
		redirect(303, `/login?redirect=${encodeURIComponent(`/halls/${params.slug}/book`)}`);
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
		extras: await dbAll<HallExtraRow>(locals.db, 'SELECT * FROM hall_extras WHERE hall_id = ? ORDER BY created_at', hall.id),
		blocks: blocksRaw.map(b => ({ ...b, days_of_week: fromJsonArr(b.days_of_week as string | null) })),
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
		if (numGuests != null && numGuests < 1) return fail(400, { error: st(locals.locale).serverErrors.chooseValidDate });

		if (!title) return fail(400, { error: st(locals.locale).serverErrors.eventNameRequired });
		if (!eventDate) return fail(400, { error: st(locals.locale).serverErrors.pleaseChooseDate });

		const check = await assertCanBook(locals.db, hall, eventDate, locals.user.id, numGuests, locals.locale);
		if (!check.ok) return fail(400, { error: check.reason });

		// Only keep selected extras that actually belong to this hall.
		const requested = data.getAll('extras').map(String);
		const valid = requested.length
			? (await dbAll<{ id: string }>(locals.db, 'SELECT id FROM hall_extras WHERE hall_id = ?', hall.id)).map(e => e.id)
			: [];
		const extrasIds = requested.filter(id => valid.includes(id));
		const extrasJson = extrasIds.length ? JSON.stringify(extrasIds) : null;

		const reservationId = crypto.randomUUID();
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
				hall.auto_approve ? 'approved' : 'pending',
				inviteCode, numGuests, extrasJson
			);
		} catch {
			return fail(409, { error: st(locals.locale).serverErrors.hallJustBooked });
		}

		await releaseHold(locals.db, hall.id, eventDate, locals.user.id);

		// Let the venue's owners/admins know a guest has requested a booking.
		const guestName = `${locals.user.first_name} ${locals.user.last_name}`;
		notifyNewReservation(locals.db, orgId, title, guestName, hall.name, eventDate).catch(() => {});

		redirect(303, '/halls/my-reservations?booked=1');
	}
};
