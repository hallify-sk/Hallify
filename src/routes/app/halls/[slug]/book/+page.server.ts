import { error, fail, redirect } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun, fromJsonArr } from '$lib/db/index';
import type { HallRow, HallBlockRow, HallExtraRow } from '$lib/db/index';
import type { Actions, PageServerLoad } from './$types';
import { st } from '$lib/i18n-server';
import { assertCanBook, getTakenDates, getHeldDatesByOthers, releaseHold, earliestBookableISO, isoLocal, addDays, HOLD_MINUTES } from '$lib/availability';

const RANGE_DAYS = 540;

async function findHall(db: App.Locals['db'], slug: string) {
	return dbFirst<HallRow>(db,
		`SELECT * FROM halls WHERE is_public = 1 AND allow_reservations = 1 AND (slug = ? OR id = ?) LIMIT 1`,
		slug, slug);
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) redirect(303, `/app/login?redirect=/app/halls/${params.slug}/book`);
	if (locals.user.account_type !== 'client') redirect(303, `/app/halls/${params.slug}`);

	const hall = await findHall(locals.db, params.slug);
	if (!hall) error(404, st(locals.locale).serverErrors.hallNotFoundOrNotAccepting);

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
	default: async ({ params, request, locals }) => {
		if (!locals.user) redirect(303, '/app/login');
		if (locals.user.account_type !== 'client') redirect(303, '/app/');

		const hall = await findHall(locals.db, params.slug);
		if (!hall) error(404, st(locals.locale).serverErrors.hallNotFound);

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

		const requested = data.getAll('extras').map(String);
		const valid = requested.length
			? (await dbAll<{ id: string }>(locals.db, 'SELECT id FROM hall_extras WHERE hall_id = ?', hall.id)).map(e => e.id)
			: [];
		const extrasIds = requested.filter(id => valid.includes(id));
		const extrasJson = extrasIds.length ? JSON.stringify(extrasIds) : null;

		const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
		const status = hall.auto_approve ? 'approved' : 'pending';
		const reservationId = crypto.randomUUID();

		try {
			await dbRun(locals.db,
				`INSERT INTO reservations
					(id, org_id, hall_id, user_id, title, description, event_date, start_time, end_time, status, invite_code, num_guests, extras_json)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				reservationId, hall.org_id, hall.id, locals.user.id, title, description, eventDate, startTime, endTime, status, inviteCode, numGuests, extrasJson
			);
		} catch {
			return fail(409, { error: st(locals.locale).serverErrors.hallJustBooked });
		}

		await releaseHold(locals.db, hall.id, eventDate, locals.user.id);
		redirect(303, '/app/client/reservations?booked=1');
	}
};
