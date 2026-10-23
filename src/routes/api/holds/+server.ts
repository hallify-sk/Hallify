import { json } from '@sveltejs/kit';
import { dbFirst } from '$lib/db/index';
import {
	HOLD_FRESH_LIMIT,
	HOLD_MAX_ACTIVE,
	HOLD_MAX_LIFETIME_MIN,
	acquireOrRenewHold,
	assertCanBook,
	isRealDateISO,
	releaseHold,
	type BookableHall
} from '$lib/availability';
import { st } from '$lib/i18n-server';
import type { RequestHandler } from './$types';

// Soft-lock a hall+day while a user is mid-booking. POST acquires/renews;
// POST with { action: 'release' } drops the caller's hold (sendBeacon-friendly).
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ ok: false, reason: 'auth' }, { status: 401 });

	let body: { hallId?: string; date?: string; action?: string };
	try { body = await request.json(); } catch { return json({ ok: false, reason: 'bad-request' }, { status: 400 }); }

	const hallId = String(body.hallId ?? '');
	const date = String(body.date ?? '');
	if (!hallId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		return json({ ok: false, reason: 'bad-request' }, { status: 400 });
	}
	const e = st(locals.locale).serverErrors;
	// '2026-13-99' has the right shape and is still not a day.
	if (body.action !== 'release' && !isRealDateISO(date)) {
		return json({ ok: false, reason: 'invalid', message: e.chooseValidDate }, { status: 400 });
	}

	// Scope: org users may hold halls in their current org; clients may hold
	// public, bookable halls.
	const hall = await dbFirst<BookableHall & { is_public: number }>(
		locals.db,
		'SELECT id, org_id, is_public, allow_reservations, max_people, min_days_advance, plan_locked FROM halls WHERE id = ?',
		hallId
	);
	if (!hall) return json({ ok: false, reason: 'not-found' }, { status: 404 });

	// Staff may hold halls in their own org.
	const isOrgUser = !!locals.currentOrg && hall.org_id === locals.currentOrg.id;

	// Clients may hold a public bookable hall — but ONLY inside that hall's own bubble.
	// Without the domainOrg check this branch was global: any client of any venue could
	// hold dates on any other venue's halls (blocking that venue's real customers, and
	// writing reservation_holds rows stamped with the victim's org_id). Every other
	// client-facing query is scoped by locals.domainOrg; this one was the exception.
	const isPublicBookableOnOwnBubble =
		!!hall.is_public && !!hall.allow_reservations &&
		!!locals.domainOrg && hall.org_id === locals.domainOrg.id;

	if (!isOrgUser && !isPublicBookableOnOwnBubble) return json({ ok: false, reason: 'forbidden' }, { status: 403 });

	if (body.action === 'release') {
		await releaseHold(locals.db, hallId, date, locals.user.id);
		return json({ ok: true });
	}

	// A client may only hold a date they could actually book — not a past one, not a
	// blocked or closed day, not one past the month cap — and only a few at a time,
	// for a bounded time. The same check the booking submit runs, so a hold can
	// never promise a date the booking will then refuse. Staff in their own org keep
	// unlimited holds: the wizard is theirs, and so are the dates.
	const asClient = !isOrgUser;
	if (asClient) {
		const check = await assertCanBook(locals.db, hall, date, locals.user.id, null, locals.locale);
		if (!check.ok) return json({ ok: false, reason: 'unavailable', message: check.reason }, { status: 409 });
	}

	const result = await acquireOrRenewHold(locals.db, {
		hallId, eventDate: date, userId: locals.user.id, orgId: hall.org_id,
		...(asClient
			? { maxActive: HOLD_MAX_ACTIVE, maxLifetimeMinutes: HOLD_MAX_LIFETIME_MIN, freshLimit: HOLD_FRESH_LIMIT }
			: {}),
	});
	if (result.ok) return json(result);

	const message =
		result.reason === 'invalid' ? e.chooseValidDate
		: result.reason === 'limit' ? e.holdLimit(HOLD_MAX_ACTIVE)
		: result.reason === 'expired' ? e.holdLifetimeOver
		: result.reason === 'too-often' ? e.holdTooOften
		: result.reason === 'taken' ? e.hallAlreadyBooked
		: e.dateBeingBooked;
	return json({ ...result, message }, { status: result.reason === 'invalid' ? 400 : 409 });
};
