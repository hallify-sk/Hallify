import { error, fail, redirect } from '@sveltejs/kit';
import sql from '$lib/db';
import type { ReservationRow, ReservationStatus } from '$lib/db';
import type { PageServerLoad, Actions } from './$types';
import { notifyStatusChange } from '$lib/email';
import { postSystemMessage } from '$lib/tickets';

export const load: PageServerLoad = async ({ params }) => {
	const [reservation] = await sql<(ReservationRow & {
		hall_name: string;
		hall_max_people: number;
		user_first_name: string;
		user_last_name: string;
		user_email: string;
	})[]>`
		SELECT r.*, h.name AS hall_name, h.max_people AS hall_max_people,
			u.first_name AS user_first_name, u.last_name AS user_last_name, u.email AS user_email
		FROM reservations r
		JOIN halls h ON h.id = r.hall_id
		JOIN users u ON u.id = r.user_id
		WHERE r.id = ${params.id}
	`;
	if (!reservation) error(404, 'Reservation not found');

	// Find existing ticket for this reservation
	const subject = `[Reservation] ${reservation.title}`;
	const [ticket] = await sql<{ id: string }[]>`
		SELECT id FROM tickets
		WHERE user_id = ${reservation.user_id} AND subject = ${subject}
		ORDER BY created_at DESC LIMIT 1
	`;

	return { reservation, ticketId: ticket?.id ?? null };
};

const ALLOWED_STATUSES: ReservationStatus[] = ['pending', 'waiting_payment', 'approved', 'planned', 'completed', 'cancelled'];

export const actions: Actions = {
	updateDetails: async ({ request, params, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') return fail(403, { error: 'Unauthorized' });
		const data = await request.formData();
		const title = String(data.get('title') ?? '').trim();
		const description = String(data.get('description') ?? '').trim() || null;
		const eventDate = String(data.get('event_date') ?? '').trim();
		const startTime = String(data.get('start_time') ?? '').trim() || null;
		const endTime = String(data.get('end_time') ?? '').trim() || null;

		if (!title) return fail(400, { error: 'Title is required' });
		if (!eventDate) return fail(400, { error: 'Date is required' });

		await sql`
			UPDATE reservations
			SET title = ${title}, description = ${description},
				event_date = ${eventDate}, start_time = ${startTime}, end_time = ${endTime}
			WHERE id = ${params.id}
		`;
		return { success: true };
	},

	updateStatus: async ({ request, params, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') return fail(403, { error: 'Unauthorized' });
		const data = await request.formData();
		const status = String(data.get('status') ?? '') as ReservationStatus;
		const message = String(data.get('message') ?? '').trim();
		if (!ALLOWED_STATUSES.includes(status)) return fail(400, { error: 'Invalid status' });

		const [res] = await sql<ReservationRow[]>`
			SELECT title, user_id, status AS old_status FROM reservations WHERE id = ${params.id}
		`;
		if (!res) return fail(404, { error: 'Not found' });

		await sql`UPDATE reservations SET status = ${status} WHERE id = ${params.id}`;

		// Post system message
		const adminName = `${locals.user.first_name} ${locals.user.last_name}`;
		await postSystemMessage(res.user_id, res.title, `status_change:${status}:${adminName}`, locals.user.id);

		// Send platform message if admin included a personal message
		if (message && res.user_id) {
			const subject = `[Reservation] ${res.title}`;
			let [ticket] = await sql<{ id: string }[]>`
				SELECT id FROM tickets WHERE user_id = ${res.user_id} AND subject = ${subject} ORDER BY created_at DESC LIMIT 1
			`;
			if (!ticket) {
				[ticket] = await sql<{ id: string }[]>`
					INSERT INTO tickets (user_id, subject) VALUES (${res.user_id}, ${subject}) RETURNING id
				`;
			}
			await sql`
				INSERT INTO messages (ticket_id, sender_id, body, message_type)
				VALUES (${ticket.id}, ${locals.user.id}, ${message}, 'text')
			`;
			await sql`UPDATE tickets SET updated_at = NOW(), status = 'open' WHERE id = ${ticket.id}`;
		}

		// Send email notification
		const [userInfo] = await sql<{ email: string }[]>`SELECT email FROM users WHERE id = ${res.user_id}`;
		if (userInfo?.email) {
			notifyStatusChange(userInfo.email, res.title, status).catch(() => {});
		}

		return { success: true };
	},

	openChat: async ({ params, locals }) => {
		if (!locals.user || locals.user.role !== 'admin') return fail(403, { error: 'Unauthorized' });

		const [res] = await sql<ReservationRow[]>`SELECT title, user_id FROM reservations WHERE id = ${params.id}`;
		if (!res) return fail(404, { error: 'Not found' });

		const subject = `[Reservation] ${res.title}`;
		let [ticket] = await sql<{ id: string }[]>`
			SELECT id FROM tickets WHERE user_id = ${res.user_id} AND subject = ${subject} ORDER BY created_at DESC LIMIT 1
		`;
		if (!ticket) {
			[ticket] = await sql<{ id: string }[]>`
				INSERT INTO tickets (user_id, subject) VALUES (${res.user_id}, ${subject}) RETURNING id
			`;
		}

		redirect(303, `/admin/messages/${ticket.id}`);
	}
};
