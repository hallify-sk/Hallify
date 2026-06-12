import { error, fail } from '@sveltejs/kit';
import sql from '$lib/db/index';
import type { ReservationRow, RsvpConfig } from '$lib/db/index';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const [reservation] = await sql<(ReservationRow & { hall_address: string | null })[]>`
		SELECT r.id, r.title, r.event_date, r.start_time, r.end_time, r.status, r.rsvp_config,
		       h.name AS hall_name, h.address AS hall_address
		FROM reservations r
		JOIN halls h ON h.id = r.hall_id
		WHERE r.invite_code = ${params.code}
	`;

	if (!reservation) error(404, 'Invite link not found or expired');
	if (reservation.status === 'cancelled') return { reservation }; // Show cancelled message in UI

	return { reservation };
};

export const actions: Actions = {
	default: async ({ request, params }) => {
		const data = await request.formData();
		// Try 'name' field first (default or custom field named 'name')
		const name = String(data.get('name') ?? '').trim();
		const email = String(data.get('email') ?? '').trim();

		if (!name) return fail(400, { error: 'Name is required.' });

		const [reservation] = await sql<ReservationRow[]>`
			SELECT id, status, rsvp_config FROM reservations WHERE invite_code = ${params.code}
		`;
		if (!reservation) error(404, 'Invite not found');
		if (reservation.status === 'cancelled') return fail(400, { error: 'This event has been cancelled.' });
		if ((reservation.rsvp_config as RsvpConfig)?.enabled === false) return fail(400, { error: 'RSVP is closed.' });

		// Check if already registered (by email if provided)
		if (email) {
			const [existing] = await sql`
				SELECT id FROM rsvp_entries WHERE reservation_id = ${reservation.id} AND email = ${email}
			`;
			if (existing) return fail(400, { error: 'You have already RSVP\'d to this event.' });
		}

		await sql`
			INSERT INTO rsvp_entries (reservation_id, name, email)
			VALUES (${reservation.id}, ${name}, ${email || null})
		`;

		return { success: true, name };
	}
};
