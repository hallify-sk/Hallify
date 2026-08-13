import { error, fail } from '@sveltejs/kit';
import { dbFirst, dbRun, fromJson } from '$lib/db/index';
import type { ReservationRow, RsvpConfig } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';
import { RSVP_ENABLED } from '$lib/features';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!RSVP_ENABLED) error(404, 'Not found');
	const reservation = await dbFirst<ReservationRow & { hall_name: string; hall_address: string | null }>(
		locals.db,
		`SELECT r.id, r.title, r.event_date, r.start_time, r.end_time, r.status, r.rsvp_config,
		        h.name AS hall_name, h.address AS hall_address
		 FROM reservations r
		 JOIN halls h ON h.id = r.hall_id
		 WHERE r.invite_code = ?`,
		params.code
	);

	if (!reservation) error(404, st(locals.locale).serverErrors.inviteLinkNotFoundOrExpired);

	const config = fromJson<RsvpConfig>(reservation.rsvp_config as string | null);
	const maxExtraGuests = Math.max(0, Math.min(20, Number(config?.maxExtraGuests) || 0));

	if (reservation.status === 'cancelled') return { reservation, maxExtraGuests };

	return { reservation, maxExtraGuests };
};

export const actions: Actions = {
	default: async ({ request, params, locals }) => {
		if (!RSVP_ENABLED) error(404, 'Not found');
		const data = await request.formData();

		const reservation = await dbFirst<ReservationRow>(
			locals.db,
			'SELECT id, status, rsvp_config FROM reservations WHERE invite_code = ?',
			params.code
		);
		if (!reservation) error(404, st(locals.locale).serverErrors.inviteNotFound);
		if (reservation.status === 'cancelled') return fail(400, { error: st(locals.locale).serverErrors.eventCancelled });

		const rsvpConfig = fromJson<RsvpConfig>(reservation.rsvp_config as string | null);
		if (rsvpConfig?.enabled === false) return fail(400, { error: st(locals.locale).serverErrors.rsvpClosed });

		const fields = rsvpConfig?.fields ?? [];

		// Collect every configured field's answer into a self-describing list so the
		// editor / printable manifest can render it without re-reading the config.
		const responses: { name: string; label: string; type: string; value: string | string[] | boolean }[] = [];
		for (const f of fields) {
			let value: string | string[] | boolean;
			if (f.type === 'checkbox') {
				value = data.get(f.name) != null;
			} else if (f.type === 'allergies') {
				const picked = data.getAll(f.name).map((v) => String(v).trim()).filter(Boolean);
				if (data.get(`${f.name}_other_check`) != null) {
					const other = String(data.get(`${f.name}_other`) ?? '').trim();
					if (other) picked.push(other);
				}
				value = picked;
			} else {
				value = String(data.get(f.name) ?? '').trim();
			}
			responses.push({ name: f.name, label: f.label || f.name, type: f.type, value });
		}

		// Resolve the attendee's display name: an explicit `name` input, else the
		// first text-type custom field, else the email local-part.
		let name = String(data.get('name') ?? '').trim();
		let email = String(data.get('email') ?? '').trim();
		if (!name) {
			const textField = fields.find((f) => f.type === 'text');
			if (textField) name = String(data.get(textField.name) ?? '').trim();
		}
		if (!email) {
			const emailField = fields.find((f) => f.type === 'email');
			if (emailField) email = String(data.get(emailField.name) ?? '').trim();
		}
		if (!name) name = email ? email.split('@')[0] : 'Guest';

		// Extra guests the invitee brings, clamped to the event's configured cap.
		const maxExtra = Math.max(0, Math.min(20, Number(rsvpConfig?.maxExtraGuests) || 0));
		const extraGuests = Math.max(0, Math.min(maxExtra, parseInt(String(data.get('extra_guests') ?? '0'), 10) || 0));

		// Check if already registered (by email if provided)
		if (email) {
			const existing = await dbFirst<{ id: string }>(
				locals.db,
				'SELECT id FROM rsvp_entries WHERE reservation_id = ? AND email = ?',
				reservation.id,
				email
			);
			if (existing) return fail(400, { error: st(locals.locale).serverErrors.alreadyRsvpd });
		}

		const id = crypto.randomUUID();
		await dbRun(
			locals.db,
			'INSERT INTO rsvp_entries (id, reservation_id, name, email, extra_guests, responses) VALUES (?, ?, ?, ?, ?, ?)',
			id,
			reservation.id,
			name,
			email || null,
			extraGuests,
			responses.length ? JSON.stringify(responses) : null
		);

		return { success: true, name };
	}
};
