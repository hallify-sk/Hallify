import { error, redirect, fail } from '@sveltejs/kit';
import sql from '$lib/db/index';
import type { ReservationRow, RsvpRow, TableTypeRow, TemplateRow, HallRow, ReservationStatus } from '$lib/db/index';
import type { Actions, PageServerLoad } from './$types';
import { notifyStatusChange } from '$lib/email';
import { postSystemMessage } from '$lib/tickets';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) redirect(303, '/app/login');

	const [reservation] = await sql<(ReservationRow & {
		hall_max_people: number; hall_floorplan_json: unknown;
		hall_auto_approve: boolean; hall_min_cancel_days: number;
		hall_pre_reservation_text: string | null;
	})[]>`
		SELECT r.*, h.name AS hall_name, h.max_people AS hall_max_people,
			h.floorplan_json AS hall_floorplan_json, h.auto_approve AS hall_auto_approve,
			h.min_cancel_days AS hall_min_cancel_days, h.pre_reservation_text AS hall_pre_reservation_text
		FROM reservations r
		JOIN halls h ON h.id = r.hall_id
		WHERE r.id = ${params.id}
	`;

	if (!reservation) error(404, 'Reservation not found');
	if (reservation.user_id !== locals.user.id && locals.user.role !== 'admin') {
		error(403, 'Access denied');
	}

	const rsvps = await sql<RsvpRow[]>`
		SELECT * FROM rsvp_entries WHERE reservation_id = ${params.id} ORDER BY created_at
	`;

	const tableTypes = await sql<TableTypeRow[]>`
		SELECT * FROM table_types WHERE hall_id = ${reservation.hall_id} ORDER BY name
	`;

	const templates = await sql<TemplateRow[]>`
		SELECT * FROM floorplan_templates WHERE hall_id = ${reservation.hall_id} ORDER BY name
	`;

	const baseUrl = url.origin || 'http://localhost:5173';

	return {
		reservation,
		rsvps,
		tableTypes,
		templates,
		inviteUrl: `${baseUrl}/rsvp/${reservation.invite_code}`,
	};
};

const ALLOWED_STATUSES: ReservationStatus[] = ['pending', 'waiting_payment', 'approved', 'planned', 'completed', 'cancelled'];

export const actions: Actions = {
	saveLayout: async ({ request, locals, params }) => {
		if (!locals.user) redirect(303, '/app/login');
		const data = await request.formData();
		const layoutJson = String(data.get('layoutJson') ?? '');
		if (!layoutJson) return fail(400, { error: 'No layout data.' });

		const [reservation] = await sql<ReservationRow[]>`SELECT user_id, status FROM reservations WHERE id = ${params.id}`;
		if (!reservation || (reservation.user_id !== locals.user.id && locals.user.role !== 'admin')) {
			error(403, 'Access denied');
		}
		if (reservation.user_id === locals.user.id && locals.user.role !== 'admin' && !['approved', 'planned'].includes(reservation.status)) {
			return fail(403, { error: 'Reservation must be approved to edit layout.' });
		}

		await sql`UPDATE reservations SET layout_json = ${layoutJson}::jsonb WHERE id = ${params.id}`;
		return { success: true };
	},

	updateStatus: async ({ request, locals, params }) => {
		if (!locals.user) return fail(403, { error: 'Unauthorized' });
		const data = await request.formData();
		const status = String(data.get('status') ?? '') as ReservationStatus;
		if (!ALLOWED_STATUSES.includes(status)) {
			return fail(400, { error: 'Invalid status.' });
		}

		const [reservation] = await sql<ReservationRow[]>`SELECT user_id, title, hall_id FROM reservations WHERE id = ${params.id}`;
		if (!reservation) return fail(404, { error: 'Not found' });

		const isOwner = reservation.user_id === locals.user.id;
		const isAdmin = locals.user.role === 'admin';

		// Users can only set 'planned' or 'cancelled'
		if (isOwner && !isAdmin && !['planned', 'cancelled'].includes(status)) {
			return fail(403, { error: 'Not allowed' });
		}

		await sql`UPDATE reservations SET status = ${status} WHERE id = ${params.id}`;

		// Post system message
		const actorName = `${locals.user.first_name} ${locals.user.last_name}`;
		await postSystemMessage(
			reservation.user_id,
			reservation.title,
			`status_change:${status}:${actorName}`,
			locals.user.id
		);

		// Send email notification
		const [userInfo] = await sql<{ email: string }[]>`SELECT email FROM users WHERE id = ${reservation.user_id}`;
		if (userInfo?.email && isAdmin) {
			notifyStatusChange(userInfo.email, reservation.title, status).catch(() => {});
		}

		return { success: true };
	},

	cancel: async ({ locals, params }) => {
		if (!locals.user) return fail(403, { error: 'Unauthorized' });

		const [reservation] = await sql<(ReservationRow & { hall_min_cancel_days: number })[]>`
			SELECT r.*, h.min_cancel_days AS hall_min_cancel_days
			FROM reservations r JOIN halls h ON h.id = r.hall_id
			WHERE r.id = ${params.id}
		`;
		if (!reservation) return fail(404, { error: 'Not found' });

		const isOwner = reservation.user_id === locals.user.id;
		const isAdmin = locals.user.role === 'admin';

		if (!isOwner && !isAdmin) return fail(403, { error: 'Access denied' });

		// Check min cancel days for non-admins
		if (isOwner && !isAdmin && reservation.hall_min_cancel_days > 0) {
			const eventDate = new Date(reservation.event_date);
			const now = new Date();
			const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
			if (daysUntil < reservation.hall_min_cancel_days) {
				return fail(400, { error: `Cannot cancel less than ${reservation.hall_min_cancel_days} days before the event.` });
			}
		}

		await sql`UPDATE reservations SET status = 'cancelled' WHERE id = ${params.id}`;

		// Post system message
		const actorName = `${locals.user.first_name} ${locals.user.last_name}`;
		await postSystemMessage(
			reservation.user_id,
			reservation.title,
			`status_change:cancelled:${actorName}`,
			locals.user.id
		);

		// Send cancellation email
		const [userInfo] = await sql<{ email: string }[]>`SELECT email FROM users WHERE id = ${reservation.user_id}`;
		if (userInfo?.email) {
			notifyStatusChange(userInfo.email, reservation.title, 'cancelled').catch(() => {});
		}

		return { success: true };
	},

	resetLayout: async ({ locals, params }) => {
		if (!locals.user) return fail(403, { error: 'Unauthorized' });
		const [reservation] = await sql<ReservationRow[]>`SELECT user_id, hall_id FROM reservations WHERE id = ${params.id}`;
		if (!reservation || (reservation.user_id !== locals.user.id && locals.user.role !== 'admin')) {
			return fail(403, { error: 'Access denied' });
		}
		await sql`UPDATE reservations SET layout_json = (SELECT floorplan_json FROM halls WHERE id = ${reservation.hall_id}) WHERE id = ${params.id}`;
		return { success: true };
	},

	loadTemplate: async ({ request, locals, params }) => {
		if (!locals.user) return fail(403, { error: 'Unauthorized' });
		const data = await request.formData();
		const templateId = String(data.get('templateId') ?? '');
		if (!templateId) return fail(400, { error: 'No template selected.' });

		const [reservation] = await sql<ReservationRow[]>`SELECT user_id FROM reservations WHERE id = ${params.id}`;
		if (!reservation || (reservation.user_id !== locals.user.id && locals.user.role !== 'admin')) {
			return fail(403, { error: 'Access denied' });
		}

		const [tmpl] = await sql<TemplateRow[]>`SELECT layout_json FROM floorplan_templates WHERE id = ${templateId}`;
		if (!tmpl) return fail(404, { error: 'Template not found.' });

		await sql`UPDATE reservations SET layout_json = ${JSON.stringify(tmpl.layout_json)}::jsonb WHERE id = ${params.id}`;
		return { success: true };
	},

	toggleRsvp: async ({ request, locals, params }) => {
		if (!locals.user) return fail(403, { error: 'Unauthorized' });
		const data = await request.formData();
		const enabled = String(data.get('enabled')) === 'true';

		const [reservation] = await sql<ReservationRow[]>`SELECT user_id, rsvp_config FROM reservations WHERE id = ${params.id}`;
		if (!reservation || (reservation.user_id !== locals.user.id && locals.user.role !== 'admin')) {
			return fail(403, { error: 'Access denied' });
		}

		const config = { ...((reservation.rsvp_config ?? {}) as Record<string, boolean | string | unknown[]>), enabled };

		await sql`UPDATE reservations SET rsvp_config = ${sql.json(config)} WHERE id = ${params.id}`;
		return { success: true };
	},

	markPlanned: async ({ locals, params }) => {
		if (!locals.user) return fail(403, { error: 'Unauthorized' });
		const [reservation] = await sql<ReservationRow[]>`SELECT user_id, status FROM reservations WHERE id = ${params.id}`;
		if (!reservation) return fail(404, { error: 'Not found' });
		if (reservation.user_id !== locals.user.id && locals.user.role !== 'admin') {
			return fail(403, { error: 'Access denied' });
		}
		if (reservation.status !== 'approved') {
			return fail(400, { error: 'Only approved reservations can be marked as planned.' });
		}
		await sql`UPDATE reservations SET status = 'planned' WHERE id = ${params.id}`;

		// Post system message
		const actorName = `${locals.user.first_name} ${locals.user.last_name}`;
		await postSystemMessage(
			reservation.user_id,
			reservation.title,
			`status_change:planned:${actorName}`,
			locals.user.id
		);

		return { success: true };
	}
};
