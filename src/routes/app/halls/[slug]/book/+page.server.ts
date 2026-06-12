import { error, fail, redirect } from '@sveltejs/kit';
import sql from '$lib/db/index';
import type { HallRow } from '$lib/db/index';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) redirect(303, `/app/login?redirect=/app/halls/${params.slug}/book`);
	if (locals.user.account_type !== 'client') redirect(303, `/app/halls/${params.slug}`);

	const [hall] = await sql<HallRow[]>`
		SELECT * FROM halls
		WHERE is_public = true AND allow_reservations = true
		  AND (slug = ${params.slug} OR id::text = ${params.slug})
		LIMIT 1
	`;

	if (!hall) error(404, 'Hall not found or not accepting reservations');

	return { hall };
};

export const actions: Actions = {
	default: async ({ params, request, locals }) => {
		if (!locals.user) redirect(303, '/app/login');
		if (locals.user.account_type !== 'client') redirect(303, '/app/');

		const [hall] = await sql<HallRow[]>`
			SELECT * FROM halls
			WHERE is_public = true AND allow_reservations = true
			  AND (slug = ${params.slug} OR id::text = ${params.slug})
			LIMIT 1
		`;
		if (!hall) error(404, 'Hall not found');

		const data = await request.formData();
		const title = String(data.get('title') ?? '').trim();
		const eventDate = String(data.get('eventDate') ?? '').trim();
		const startTime = String(data.get('startTime') ?? '').trim() || null;
		const endTime = String(data.get('endTime') ?? '').trim() || null;
		const description = String(data.get('description') ?? '').trim() || null;

		if (!title) return fail(400, { error: 'Event name is required.' });
		if (!eventDate) return fail(400, { error: 'Event date is required.' });

		const today = new Date().toISOString().split('T')[0];
		if (eventDate < today) return fail(400, { error: 'Event date cannot be in the past.' });

		if (hall.min_days_advance > 0) {
			const minDate = new Date();
			minDate.setDate(minDate.getDate() + hall.min_days_advance);
			if (eventDate < minDate.toISOString().split('T')[0]) {
				return fail(400, { error: `Reservations must be made at least ${hall.min_days_advance} day(s) in advance.` });
			}
		}

		// Check for date conflicts (approved/planned reservations on same date)
		const [conflict] = await sql`
			SELECT id FROM reservations
			WHERE hall_id = ${hall.id}
			  AND event_date = ${eventDate}::date
			  AND status IN ('approved', 'planned', 'pending')
		`;
		if (conflict) {
			return fail(400, { error: 'This hall is already booked on that date. Please choose another date.' });
		}

		const inviteCode = Math.random().toString(36).slice(2, 10).toUpperCase();
		const status = hall.auto_approve ? 'approved' : 'pending';

		await sql`
			INSERT INTO reservations
				(org_id, hall_id, user_id, title, description, event_date, start_time, end_time, status, invite_code)
			VALUES
				(${hall.org_id}, ${hall.id}, ${locals.user.id}, ${title}, ${description},
				 ${eventDate}::date, ${startTime}, ${endTime}, ${status}, ${inviteCode})
		`;

		redirect(303, '/app/client/reservations?booked=1');
	}
};
