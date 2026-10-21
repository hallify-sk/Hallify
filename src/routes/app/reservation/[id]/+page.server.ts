import { error, redirect, fail } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun, fromJson, fromJsonArr, toJson } from '$lib/db/index';
import type { ReservationRow, RsvpRow, TableTypeRow, TemplateRow, HallRow, ReservationStatus, RsvpConfig, HallExtraRow } from '$lib/db/index';
import { parseExtraIds } from '$lib/extras';
import type { Actions, PageServerLoad } from './$types';
import { notifyStatusChange, sendReservationInviteEmail, notifyEventAssigned } from '$lib/email';
import { postSystemMessage } from '$lib/tickets';
import { changeReservationStatus, messageReservationClient, setReservationExtras } from '$lib/server/ops/reservation-ops';
import { st } from '$lib/i18n-server';
import { orgPublicBaseUrl } from '$lib/orgUrl';
import { env } from '$env/dynamic/private';

// The organization's preferred default language — used to localize emails to the
// invited/assigned client (who interacts with the org in that language).
async function orgEmailLocale(db: App.Locals['db'], orgId: string): Promise<'sk' | 'en'> {
	try {
		const row = await dbFirst<{ value: string }>(db, "SELECT value FROM org_settings WHERE org_id = ? AND key = 'locale'", orgId);
		const d = row?.value ? (JSON.parse(row.value as string) as { default?: unknown }).default : null;
		if (d === 'en' || d === 'sk') return d;
	} catch { /* ignore */ }
	return 'sk';
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// This is an org-staff management view. Reservations are always scoped to the
// acting user's current org, so cross-org access is impossible.
function isOrgStaff(locals: App.Locals): boolean {
	return locals.currentOrg?.role === 'owner' || locals.currentOrg?.role === 'admin';
}

/** Staff may act on any reservation in their org; everyone else only on their own.
 *  Org scoping alone is NOT enough here — without this, any `member`-role account
 *  could cancel, re-layout or reset a colleague's (or a client's) booking. */
function canActOnReservation(locals: App.Locals, reservationUserId: string): boolean {
	return isOrgStaff(locals) || reservationUserId === locals.user?.id;
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) redirect(303, '/app/login');
	const orgId = locals.currentOrg?.id;
	if (!orgId) error(403, st(locals.locale).serverErrors.accessDenied);

	const reservation = await dbFirst<ReservationRow & {
		hall_max_people: number; hall_floorplan_json: unknown;
		hall_auto_approve: boolean; hall_min_cancel_days: number;
		hall_pre_reservation_text: string | null;
		user_first_name: string; user_last_name: string; user_email: string | null;
		user_account_type: string | null;
	}>(locals.db,
		`SELECT r.*, h.name AS hall_name, h.max_people AS hall_max_people,
			h.floorplan_json AS hall_floorplan_json, h.auto_approve AS hall_auto_approve,
			h.min_cancel_days AS hall_min_cancel_days, h.pre_reservation_text AS hall_pre_reservation_text,
			COALESCE(u.first_name, 'Former') AS user_first_name,
			COALESCE(u.last_name, 'member') AS user_last_name,
			u.email AS user_email, u.account_type AS user_account_type
		FROM reservations r
		JOIN halls h ON h.id = r.hall_id
		LEFT JOIN users u ON u.id = r.user_id
		WHERE r.id = ? AND r.org_id = ?`,
		params.id, orgId
	);

	if (!reservation) error(404, st(locals.locale).serverErrors.reservationNotFound);

	const rsvps = await dbAll<RsvpRow>(locals.db,
		'SELECT * FROM rsvp_entries WHERE reservation_id = ? ORDER BY created_at',
		params.id
	);

	const tableTypes = await dbAll<TableTypeRow>(locals.db,
		'SELECT * FROM table_types WHERE hall_id = ? ORDER BY name',
		reservation.hall_id
	);

	const templates = await dbAll<TemplateRow>(locals.db,
		'SELECT * FROM floorplan_templates WHERE hall_id = ? ORDER BY name',
		reservation.hall_id
	);

	const baseUrl = url.origin || 'http://localhost:5173';

	// Compute from the RAW value: fromJson(null) returns {} (truthy), so the
	// parsed field can't be used to tell "no floor plan" apart from "empty".
	const hasFloorplan = !!reservation.hall_floorplan_json;

	// Is the current owner a real client account (vs the staff member who created
	// an internal event)? Drives the "assign to a client" UI and client messaging.
	const clientOwner = reservation.user_account_type === 'client';

	// A pending (un-accepted) event invite awaiting the client's registration.
	const pendingInvite = await dbFirst<{ email: string; first_name: string; last_name: string; created_at: string }>(locals.db,
		`SELECT email, first_name, last_name, created_at FROM reservation_invites
		 WHERE reservation_id = ? AND accepted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
		params.id
	);

	return {
		clientOwner,
		pendingInvite,
		reservation: {
			...reservation,
			hall_floorplan_json: fromJson(reservation.hall_floorplan_json as string | null),
			hall_auto_approve: !!reservation.hall_auto_approve,
			rsvp_config: fromJson<RsvpConfig>(reservation.rsvp_config as string | null),
			layout_json: fromJson(reservation.layout_json as string | null),
		},
		rsvps,
		tableTypes,
		templates: templates.map(t => ({ ...t, layout_json: fromJson(t.layout_json as string | null) })),
		inviteUrl: `${baseUrl}/rsvp/${reservation.invite_code}`,
		hasFloorplan,
		extras: await dbAll<HallExtraRow>(locals.db, 'SELECT * FROM hall_extras WHERE hall_id = ? ORDER BY created_at', reservation.hall_id),
		selectedExtras: parseExtraIds(reservation.extras_json as string | null),
	};
};


export const actions: Actions = {
	// Staff message the booking's client directly from the reservation page. Reuses
	// the reservation's ticket thread (creates one if none exists) so the
	// conversation shows up in Messages for both sides, and emails the client.
	messageClient: async ({ request, locals, params }) => {
		if (!locals.user) return fail(403, { error: st(locals.locale).serverErrors.unauthorized });
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });
		if (!isOrgStaff(locals)) return fail(403, { error: st(locals.locale).serverErrors.onlyStaffCanMessageClient });
		const body = String((await request.formData()).get('body') ?? '');
		const res = await messageReservationClient(locals, orgId, params.id, body, locals.user);
		if (!res.ok) return fail(res.status, { error: res.error });
		return { messageSent: true, ticketId: res.ticketId };
	},

	// Staff assign the event to a client. If the email already belongs to a client
	// of this org, the reservation is handed over immediately and the client is
	// notified. Otherwise a one-time invite is emailed so they can register and
	// become the owner. Assignment NEVER changes the reservation's status.
	assignClient: async ({ request, locals, params, url }) => {
		if (!locals.user) return fail(403, { assignError: st(locals.locale).serverErrors.unauthorized });
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { assignError: st(locals.locale).serverErrors.accessDenied });
		if (!isOrgStaff(locals)) return fail(403, { assignError: st(locals.locale).serverErrors.onlyStaffCanAssignClient });

		const data = await request.formData();
		const firstName = String(data.get('firstName') ?? '').trim();
		const lastName = String(data.get('lastName') ?? '').trim();
		const email = String(data.get('email') ?? '').toLowerCase().trim();
		if (!firstName || !lastName || !email) return fail(400, { assignError: st(locals.locale).serverErrors.clientNameAndEmailRequired });
		if (!EMAIL_RE.test(email)) return fail(400, { assignError: st(locals.locale).serverErrors.enterValidEmail });

		const res = await dbFirst<{ title: string; event_date: string; hall_name: string }>(locals.db,
			`SELECT r.title, r.event_date, h.name AS hall_name
			 FROM reservations r JOIN halls h ON h.id = r.hall_id
			 WHERE r.id = ? AND r.org_id = ?`, params.id, orgId);
		if (!res) return fail(404, { assignError: st(locals.locale).serverErrors.notFound });

		const locale = await orgEmailLocale(locals.db, orgId);
		const dateFmt = new Date(res.event_date).toLocaleDateString(locale === 'en' ? 'en-GB' : 'sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
		const base = (await orgPublicBaseUrl(locals.db, orgId, url)) ?? (env.APP_URL || url.origin).replace(/\/$/, '');
		const orgName = locals.currentOrg?.name ?? 'Hallify';
		const inviterName = `${locals.user.first_name} ${locals.user.last_name}`;

		// Already a client of this org → hand the event over right away.
		const existing = await dbFirst<{ id: string; first_name: string; last_name: string }>(locals.db,
			`SELECT id, first_name, last_name FROM users WHERE email = ? AND org_id = ? AND account_type = 'client'`,
			email, orgId);

		if (existing) {
			await dbRun(locals.db, 'UPDATE reservations SET user_id = ? WHERE id = ? AND org_id = ?', existing.id, params.id, orgId);
			await dbRun(locals.db, 'DELETE FROM reservation_invites WHERE reservation_id = ? AND accepted_at IS NULL', params.id);
			notifyEventAssigned(locals.db, email, { orgName, eventTitle: res.title, hallName: res.hall_name, date: dateFmt, eventUrl: `${base}/halls/my-reservations/${params.id}` }, locale).catch(() => {});
			return { assigned: true, assignedName: `${existing.first_name} ${existing.last_name}` };
		}

		// New person → (re)create a single pending invite and email the registration link.
		const token = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
		const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
		await dbRun(locals.db, 'DELETE FROM reservation_invites WHERE reservation_id = ? AND accepted_at IS NULL', params.id);
		await dbRun(locals.db,
			`INSERT INTO reservation_invites (id, reservation_id, org_id, email, first_name, last_name, token, invited_by, expires_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			crypto.randomUUID(), params.id, orgId, email, firstName, lastName, token, locals.user.id, expiresAt);

		const sent = await sendReservationInviteEmail(locals.db, email,
			{ firstName, orgName, inviterName, eventTitle: res.title, hallName: res.hall_name, date: dateFmt, inviteUrl: `${base}/invite/${token}` }, locale);
		return { invited: true, invitedEmail: email, emailSent: sent };
	},

	// Re-send the pending invite email (same token) without re-entering details.
	resendInvite: async ({ locals, params, url }) => {
		if (!locals.user) return fail(403, { assignError: st(locals.locale).serverErrors.unauthorized });
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { assignError: st(locals.locale).serverErrors.accessDenied });
		if (!isOrgStaff(locals)) return fail(403, { assignError: st(locals.locale).serverErrors.onlyStaffCanAssignClient });

		const invite = await dbFirst<{ email: string; first_name: string; token: string; title: string; event_date: string; hall_name: string }>(locals.db,
			`SELECT i.email, i.first_name, i.token, r.title, r.event_date, h.name AS hall_name
			 FROM reservation_invites i JOIN reservations r ON r.id = i.reservation_id JOIN halls h ON h.id = r.hall_id
			 WHERE i.reservation_id = ? AND i.org_id = ? AND i.accepted_at IS NULL
			 ORDER BY i.created_at DESC LIMIT 1`, params.id, orgId);
		if (!invite) return fail(404, { assignError: st(locals.locale).serverErrors.inviteNotFoundOrExpired });

		const locale = await orgEmailLocale(locals.db, orgId);
		const dateFmt = new Date(invite.event_date).toLocaleDateString(locale === 'en' ? 'en-GB' : 'sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
		const base = (await orgPublicBaseUrl(locals.db, orgId, url)) ?? (env.APP_URL || url.origin).replace(/\/$/, '');
		const sent = await sendReservationInviteEmail(locals.db, invite.email,
			{ firstName: invite.first_name, orgName: locals.currentOrg?.name ?? 'Hallify', inviterName: `${locals.user.first_name} ${locals.user.last_name}`, eventTitle: invite.title, hallName: invite.hall_name, date: dateFmt, inviteUrl: `${base}/invite/${invite.token}` }, locale);
		return { inviteResent: true, emailSent: sent };
	},

	// Revoke the pending invite (the typed-in person can no longer register via it).
	cancelInvite: async ({ locals, params }) => {
		if (!locals.user) return fail(403, { assignError: st(locals.locale).serverErrors.unauthorized });
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { assignError: st(locals.locale).serverErrors.accessDenied });
		if (!isOrgStaff(locals)) return fail(403, { assignError: st(locals.locale).serverErrors.onlyStaffCanAssignClient });
		await dbRun(locals.db, 'DELETE FROM reservation_invites WHERE reservation_id = ? AND org_id = ? AND accepted_at IS NULL', params.id, orgId);
		return { inviteCancelled: true };
	},

	// Staff adjust the reservation's extras (e.g. after agreeing in messages).
	editExtras: async ({ request, locals, params }) => {
		if (!locals.user) return fail(403, { error: st(locals.locale).serverErrors.unauthorized });
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });
		if (!isOrgStaff(locals)) return fail(403, { error: st(locals.locale).serverErrors.onlyStaffCanChangeExtras });
		const requested = (await request.formData()).getAll('extras').map(String);
		const res = await setReservationExtras(locals.db, orgId, params.id, requested);
		if (!res.ok) return fail(404, { error: st(locals.locale).serverErrors.notFound });
		return { extrasSaved: true };
	},

	saveLayout: async ({ request, locals, params }) => {
		if (!locals.user) redirect(303, '/app/login');
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });
		const data = await request.formData();
		const layoutJson = String(data.get('layoutJson') ?? '');
		if (!layoutJson) return fail(400, { error: st(locals.locale).serverErrors.noLayoutData });

		const reservation = await dbFirst<ReservationRow>(locals.db,
			'SELECT user_id, status FROM reservations WHERE id = ? AND org_id = ?',
			params.id, orgId
		);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.notFound });
		if (!canActOnReservation(locals, reservation.user_id)) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });
		if (!isOrgStaff(locals) && !['approved', 'planned'].includes(reservation.status)) {
			return fail(403, { error: st(locals.locale).serverErrors.reservationMustBeApprovedToEditLayout });
		}

		await dbRun(locals.db, 'UPDATE reservations SET layout_json = ? WHERE id = ? AND org_id = ?', layoutJson, params.id, orgId);
		return { success: true };
	},

	// Only staff (owner/admin) may change the reservation status — this includes
	// bringing an event back from the cancelled state. Booking owners cannot.
	updateStatus: async ({ request, locals, params }) => {
		if (!locals.user) return fail(403, { error: st(locals.locale).serverErrors.unauthorized });
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });
		if (!isOrgStaff(locals)) return fail(403, { error: st(locals.locale).serverErrors.onlyStaffCanChangeStatus });
		const status = String((await request.formData()).get('status') ?? '') as ReservationStatus;
		const res = await changeReservationStatus(locals, orgId, params.id, status, locals.user);
		if (!res.ok) return fail(res.status, { error: res.error });
		return { success: true };
	},

	cancel: async ({ locals, params }) => {
		if (!locals.user) return fail(403, { error: st(locals.locale).serverErrors.unauthorized });
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });

		const reservation = await dbFirst<ReservationRow & { hall_min_cancel_days: number }>(locals.db,
			`SELECT r.*, h.min_cancel_days AS hall_min_cancel_days
			FROM reservations r JOIN halls h ON h.id = r.hall_id
			WHERE r.id = ? AND r.org_id = ?`,
			params.id, orgId
		);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.notFound });
		if (!canActOnReservation(locals, reservation.user_id)) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });

		const isAdmin = isOrgStaff(locals);

		// Enforce minimum cancel-notice for non-staff.
		if (!isAdmin && reservation.hall_min_cancel_days > 0) {
			const eventDate = new Date(reservation.event_date);
			const now = new Date();
			const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
			if (daysUntil < reservation.hall_min_cancel_days) {
				return fail(400, { error: st(locals.locale).serverErrors.cannotCancelBeforeEvent.replace('{days}', String(reservation.hall_min_cancel_days)) });
			}
		}

		await dbRun(locals.db, "UPDATE reservations SET status = 'cancelled' WHERE id = ? AND org_id = ?", params.id, orgId);

		const actorName = `${locals.user.first_name} ${locals.user.last_name}`;
		await postSystemMessage(
			locals.db,
			reservation.user_id,
			reservation.title,
			`status_change:cancelled:${actorName}`,
			locals.user.id
		);

		const userInfo = await dbFirst<{ email: string }>(locals.db,
			'SELECT email FROM users WHERE id = ?',
			reservation.user_id
		);
		if (userInfo?.email) {
			notifyStatusChange(locals.db, orgId, userInfo.email, reservation.title, 'cancelled').catch(() => {});
		}

		return { success: true };
	},

	resetLayout: async ({ locals, params }) => {
		if (!locals.user) return fail(403, { error: st(locals.locale).serverErrors.unauthorized });
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });
		const reservation = await dbFirst<ReservationRow>(locals.db,
			'SELECT user_id, hall_id FROM reservations WHERE id = ? AND org_id = ?',
			params.id, orgId
		);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.notFound });
		if (!canActOnReservation(locals, reservation.user_id)) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });
		await dbRun(locals.db,
			'UPDATE reservations SET layout_json = (SELECT floorplan_json FROM halls WHERE id = ?) WHERE id = ? AND org_id = ?',
			reservation.hall_id, params.id, orgId
		);
		return { success: true };
	},

	loadTemplate: async ({ request, locals, params }) => {
		if (!locals.user) return fail(403, { error: st(locals.locale).serverErrors.unauthorized });
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });
		const data = await request.formData();
		const templateId = String(data.get('templateId') ?? '');
		if (!templateId) return fail(400, { error: st(locals.locale).serverErrors.noTemplateSelected });

		const reservation = await dbFirst<ReservationRow>(locals.db,
			'SELECT user_id, hall_id FROM reservations WHERE id = ? AND org_id = ?',
			params.id, orgId
		);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.notFound });
		if (!canActOnReservation(locals, reservation.user_id)) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });

		// Template must belong to the same hall (and therefore the same org).
		const tmpl = await dbFirst<TemplateRow>(locals.db,
			'SELECT layout_json FROM floorplan_templates WHERE id = ? AND hall_id = ?',
			templateId, reservation.hall_id
		);
		if (!tmpl) return fail(404, { error: st(locals.locale).serverErrors.templateNotFound });

		await dbRun(locals.db,
			'UPDATE reservations SET layout_json = ? WHERE id = ? AND org_id = ?',
			toJson(fromJson(tmpl.layout_json as string | null)), params.id, orgId
		);
		return { success: true };
	},

	toggleRsvp: async ({ request, locals, params }) => {
		if (!locals.user) return fail(403, { error: st(locals.locale).serverErrors.unauthorized });
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });
		const data = await request.formData();
		const enabled = String(data.get('enabled')) === 'true';

		const reservation = await dbFirst<ReservationRow>(locals.db,
			'SELECT user_id, rsvp_config FROM reservations WHERE id = ? AND org_id = ?',
			params.id, orgId
		);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.notFound });
		if (!canActOnReservation(locals, reservation.user_id)) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });

		const existing = fromJson<Record<string, boolean | string | unknown[]>>(reservation.rsvp_config as string | null) ?? {};
		const config = { ...existing, enabled };

		await dbRun(locals.db,
			'UPDATE reservations SET rsvp_config = ? WHERE id = ? AND org_id = ?',
			toJson(config), params.id, orgId
		);
		return { success: true };
	}
};
