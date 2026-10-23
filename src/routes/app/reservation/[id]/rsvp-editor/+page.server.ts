import { error, redirect, fail } from '@sveltejs/kit';
import { loginUrl } from '$lib/login-redirect';
import { dbFirst, dbAll, dbRun, fromJson, toJson } from '$lib/db/index';
import type { ReservationRow, RsvpTemplateRow } from '$lib/db/index';
import { getPlan } from '$lib/plans';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';
import { RSVP_ENABLED } from '$lib/features';
import { reservationAccess, assertCanOpenReservation } from '$lib/server/reservation-access';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!RSVP_ENABLED) error(404, 'Not found');
	if (!locals.user) redirect(303, loginUrl(url));
	const orgId = locals.currentOrg?.id;
	if (!orgId) error(403, st(locals.locale).serverErrors.accessDenied);

	const reservation = await dbFirst<ReservationRow>(locals.db,
		`SELECT r.*, h.name AS hall_name
		FROM reservations r
		JOIN halls h ON h.id = r.hall_id
		WHERE r.id = ? AND r.org_id = ?`,
		params.id, orgId
	);

	if (!reservation) error(404, st(locals.locale).serverErrors.reservationNotFound);
	assertCanOpenReservation(await reservationAccess(locals), reservation.user_id, locals.user.id, st(locals.locale).serverErrors.reservationNotFound);

	const templates = await dbAll<RsvpTemplateRow>(locals.db,
		'SELECT * FROM rsvp_templates WHERE org_id = ? ORDER BY name',
		orgId
	);

	return {
		reservation: {
			...reservation,
			rsvp_config: fromJson(reservation.rsvp_config as string | null),
		},
		templates,
		advancedRsvp: getPlan(locals.currentOrg!.subscription.plan).limits.advancedRsvp,
	};
};

export const actions: Actions = {
	save: async ({ request, locals, params, url }) => {
		if (!RSVP_ENABLED) error(404, 'Not found');
		if (!locals.user) redirect(303, loginUrl(url));
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });
		if (!getPlan(locals.currentOrg!.subscription.plan).limits.advancedRsvp) {
			return fail(403, { error: st(locals.locale).serverErrors.advancedRsvpPaidPlans });
		}
		const data = await request.formData();
		const configStr = String(data.get('config') ?? '{}');

		let configObj;
		try {
			configObj = JSON.parse(configStr);
		} catch {
			return fail(400, { error: st(locals.locale).serverErrors.invalidConfigJson });
		}

		const reservation = await dbFirst<ReservationRow>(locals.db,
			'SELECT user_id FROM reservations WHERE id = ? AND org_id = ?',
			params.id, orgId
		);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.notFound });
		// Staff with reservations.manage, or the booking's own owner — not any member of the org.
		const access = await reservationAccess(locals);
		if (!access.canManage && reservation.user_id !== locals.user.id) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });

		await dbRun(locals.db,
			'UPDATE reservations SET rsvp_config = ? WHERE id = ? AND org_id = ?',
			toJson(configObj), params.id, orgId
		);
		return { success: true };
	}
};
