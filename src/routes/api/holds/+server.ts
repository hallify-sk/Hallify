import { json } from '@sveltejs/kit';
import { dbFirst } from '$lib/db/index';
import { acquireOrRenewHold, releaseHold } from '$lib/availability';
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

	// Scope: org users may hold halls in their current org; clients may hold
	// public, bookable halls.
	const hall = await dbFirst<{ id: string; org_id: string | null; is_public: number; allow_reservations: number }>(
		locals.db,
		'SELECT id, org_id, is_public, allow_reservations FROM halls WHERE id = ?',
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

	const result = await acquireOrRenewHold(locals.db, {
		hallId, eventDate: date, userId: locals.user.id, orgId: hall.org_id,
	});
	return json(result, { status: result.ok ? 200 : 409 });
};
