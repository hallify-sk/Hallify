import { error, redirect, fail } from '@sveltejs/kit';
import { createLinkedClient, findHallifyAccount } from '$lib/server/identity';
import { loginUrl } from '$lib/login-redirect';
import { dbAll, dbFirst, dbRun, fromJson, toJson } from '$lib/db/index';
import type { ReservationRow, RsvpRow, TableTypeRow, TemplateRow, ReservationStatus, RsvpConfig, HallExtraRow } from '$lib/db/index';
import { parseExtraIds, parseExtrasSnapshot, withBookedPrices } from '$lib/extras';
import type { Actions, PageServerLoad } from './$types';
import { notifyStatusChange, sendReservationInviteEmail, notifyEventAssigned, notifyVenueChange, notifyPaymentDetails } from '$lib/email';
import { postSystemMessage } from '$lib/tickets';
import {
	changeReservationStatus, editReservationDetails, messageReservationClient, setReservationExtras,
} from '$lib/server/ops/reservation-ops';
import { reservationAccess, assertCanOpenReservation, canActOnReservation as canActOn, type ReservationAccess } from '$lib/server/reservation-access';
import { listReservationActivity, logReservationActivity, reservationCreatorName } from '$lib/server/reservation-activity';
import { st } from '$lib/i18n-server';
import { orgPublicBaseUrl } from '$lib/orgUrl';
import { RSVP_ENABLED } from '$lib/features';
import { env } from '$env/dynamic/private';
import { parsePaymentForm, resolvePayment, type PaymentField } from '$lib/payment';
import { loadHallBasePrice, loadPaymentDefaults, loadPaymentRow, markPayment, savePaymentDetails } from '$lib/server/payments';
import { feedbackDeadline } from '$lib/feedback';
import { loadFeedback } from '$lib/server/feedback';
import { reservationClientKey } from '$lib/server/clients';
import { clientUrlId } from '$lib/clients';
import { prepareLayoutSave, refreshLayoutProblems } from '$lib/server/layout-sync';
import { notifyPayment } from '$lib/server/notification-centre';
import { followsHallPlan, parseProblems } from '$lib/floorplan-sync';

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

type Extra = { customer_name: string | null; customer_contact: string | null; internal_notes: string | null; status_reason: string | null; cancelled_by: string | null };

/** Members with `reservations.manage` may act on any booking in the org; everyone
 *  else only on their own. Org scoping alone is NOT enough — without this, any
 *  member could cancel, re-layout or reset a colleague's (or a client's) booking. */
function canActOnReservation(access: ReservationAccess, locals: App.Locals, reservationUserId: string): boolean {
	return canActOn(access, reservationUserId, locals.user?.id);
}

/** The booking's table layout was replaced wholesale (reset to the hall's plan, or a
 *  template loaded): record it, and tell a client who may have arranged it. */
async function layoutReplaced(locals: App.Locals, orgId: string, reservationId: string, templateName: string | null) {
	const user = locals.user!;
	await logReservationActivity(locals.db, {
		reservationId, orgId, actorId: user.id, actorName: `${user.first_name} ${user.last_name}`.trim(),
		kind: 'edited', note: 'layout',
	});
	// Only the venue's own changes: a client resetting their own layout needs no email.
	const owner = await dbFirst<{ user_id: string }>(locals.db, 'SELECT user_id FROM reservations WHERE id = ?', reservationId);
	if (owner && owner.user_id !== user.id) {
		notifyVenueChange(locals.db, orgId, reservationId, [{ field: 'layout', from: null, to: templateName }]).catch(() => {});
	}
}

/** The common preamble of a staff-only action. */
async function staffAction(locals: App.Locals, key: 'error' | 'assignError' | 'statusError' | 'detailsError' | 'paymentError') {
	const e = st(locals.locale).serverErrors;
	if (!locals.user) return { fail: fail(403, { [key]: e.unauthorized }) } as const;
	const orgId = locals.currentOrg?.id;
	if (!orgId) return { fail: fail(403, { [key]: e.accessDenied }) } as const;
	const access = await reservationAccess(locals);
	if (!access.canManage) return { fail: fail(403, { [key]: e.accessDenied }) } as const;
	return { orgId, user: locals.user, access } as const;
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) redirect(303, loginUrl(url));
	const orgId = locals.currentOrg?.id;
	if (!orgId) error(403, st(locals.locale).serverErrors.accessDenied);

	const reservation = await dbFirst<ReservationRow & Extra & {
		hall_max_people: number; hall_floorplan_json: unknown;
		hall_auto_approve: boolean; hall_min_cancel_days: number;
		hall_pre_reservation_text: string | null; hall_allow_feedback: number;
		user_first_name: string; user_last_name: string; user_email: string | null;
		user_account_type: string | null; user_email_unverified: number;
	}>(locals.db,
		`SELECT r.*, h.name AS hall_name, h.max_people AS hall_max_people,
			h.floorplan_json AS hall_floorplan_json, h.auto_approve AS hall_auto_approve,
			h.min_cancel_days AS hall_min_cancel_days, h.pre_reservation_text AS hall_pre_reservation_text,
			h.allow_feedback AS hall_allow_feedback,
			COALESCE(u.first_name, 'Former') AS user_first_name,
			COALESCE(u.last_name, 'member') AS user_last_name,
			u.email AS user_email, u.account_type AS user_account_type,
			CASE WHEN u.id IS NOT NULL AND u.email_verified_at IS NULL AND u.deleted_at IS NULL THEN 1 ELSE 0 END AS user_email_unverified
		FROM reservations r
		JOIN halls h ON h.id = r.hall_id
		LEFT JOIN users u ON u.id = r.user_id
		WHERE r.id = ? AND r.org_id = ?`,
		params.id, orgId
	);

	if (!reservation) error(404, st(locals.locale).serverErrors.reservationNotFound);

	// Denying `reservations.view` used to change nothing here: the load scoped by org only.
	const access = await reservationAccess(locals);
	assertCanOpenReservation(access, reservation.user_id, locals.user.id, st(locals.locale).serverErrors.reservationNotFound);

	const rsvps = RSVP_ENABLED
		? await dbAll<RsvpRow>(locals.db, 'SELECT * FROM rsvp_entries WHERE reservation_id = ? ORDER BY created_at', params.id)
		: [];

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
	const pendingInvite = access.canManage
		? await dbFirst<{ email: string; first_name: string; last_name: string; created_at: string }>(locals.db,
			`SELECT email, first_name, last_name, created_at FROM reservation_invites
			 WHERE reservation_id = ? AND accepted_at IS NULL ORDER BY created_at DESC LIMIT 1`,
			params.id)
		: null;

	return {
		canManage: access.canManage,
		// Cancel, layout and template controls: staff, or the booking's own holder. A
		// member with `reservations.view` alone sees a colleague's booking read-only (D3).
		canAct: canActOn(access, reservation.user_id, locals.user.id),
		// Opens the org's booking list, so the back link leads there.
		canViewAll: access.canViewAll,
		clientOwner,
		pendingInvite,
		// A phone booking handed to a client: its owner is now the client, so who on
		// the team entered it comes from the history.
		enteredBy: reservation.customer_name && clientOwner ? await reservationCreatorName(locals.db, params.id) : null,
		reservation: {
			...reservation,
			// Staff-only notes never leave the server for someone who cannot manage.
			internal_notes: access.canManage ? reservation.internal_notes : null,
			hall_floorplan_json: fromJson(reservation.hall_floorplan_json as string | null),
			hall_auto_approve: !!reservation.hall_auto_approve,
			rsvp_config: fromJson<RsvpConfig>(reservation.rsvp_config as string | null),
			layout_json: fromJson(reservation.layout_json as string | null),
		},
		rsvps,
		tableTypes,
		// Tables and chairs of an upcoming event that the hall's plan no longer fits (D2).
		layoutProblems: followsHallPlan(reservation) ? parseProblems((reservation as { layout_problems?: unknown }).layout_problems).length : 0,
		// `problems`: how much of the template no longer fits the hall's plan (D2).
		templates: templates.map(t => ({ ...t, layout_json: fromJson(t.layout_json as string | null), problems: parseProblems(t.layout_problems).length })),
		inviteUrl: `${baseUrl}/rsvp/${reservation.invite_code}`,
		hasFloorplan,
		// Priced as booked, with today's price alongside where it has changed since.
		extras: withBookedPrices(
			await dbAll<HallExtraRow>(locals.db, 'SELECT * FROM hall_extras WHERE hall_id = ? ORDER BY created_at', reservation.hall_id),
			parseExtrasSnapshot((reservation as { extras_snapshot_json?: string | null }).extras_snapshot_json)),
		selectedExtras: parseExtraIds(reservation.extras_json as string | null),
		activity: access.canManage ? await listReservationActivity(locals.db, params.id) : [],
		payment: await paymentForPage(locals.db, orgId, params.id, reservation.hall_id),
		// The client's rating of the finished event (D5): private to the team.
		feedback: access.canManage && clientOwner ? await feedbackForStaff(locals.db, reservation) : null,
		// The client's card in the client list (D10).
		clientUrl: access.canManage ? await clientCardUrl(locals.db, orgId, params.id) : null,
	};
};

async function feedbackForStaff(db: App.Locals['db'], reservation: { id: string; status: string; event_date: string; hall_allow_feedback: number; feedback_requested_at?: string | null }) {
	const row = await loadFeedback(db, reservation.id);
	const requestedAt = reservation.feedback_requested_at ?? null;
	// Before the event is over there is nothing to show, unless a rating exists anyway.
	if (reservation.status !== 'completed' && !row) return null;
	return {
		row,
		requestedAt,
		asked: !!reservation.hall_allow_feedback,
		deadline: feedbackDeadline(reservation.event_date, requestedAt),
	};
}

async function clientCardUrl(db: App.Locals['db'], orgId: string, reservationId: string): Promise<string | null> {
	try {
		const key = await reservationClientKey(db, orgId, reservationId);
		return key ? `/app/manage/clients/${clientUrlId(key)}` : null;
	} catch {
		return null;
	}
}

/** The booking's price and payment details with the venue's defaults (D6); null
 *  before migration 0031. */
async function paymentForPage(db: App.Locals['db'], orgId: string, reservationId: string, hallId: string) {
	const row = await loadPaymentRow(db, reservationId);
	if (!row) return null;
	const defaults = await loadPaymentDefaults(db, orgId);
	// The hall's base price, which with the booked extras is offered as the price.
	const hallBasePriceCents = await loadHallBasePrice(db, hallId);
	return { row, defaults, view: resolvePayment(row, defaults), hallBasePriceCents };
}

/** The message for a payment field the staff form got wrong. */
function paymentFieldError(locale: App.Locals['locale'], field: PaymentField): string {
	const p = st(locale).payment;
	const byField: Record<PaymentField, string> = {
		price: p.errPrice, deposit: p.errDeposit, depositOverPrice: p.errDepositOverPrice, depositDue: p.errDepositDue,
		iban: p.errIban, variableSymbol: p.errVariableSymbol, note: p.errNote,
	};
	return byField[field];
}


export const actions: Actions = {
	// Staff message the booking's client directly from the reservation page. Reuses
	// the reservation's ticket thread (creates one if none exists) so the
	// conversation shows up in Messages for both sides, and emails the client.
	messageClient: async ({ request, locals, params }) => {
		const ctx = await staffAction(locals, 'error');
		if ('fail' in ctx) return ctx.fail;
		const body = String((await request.formData()).get('body') ?? '');
		const res = await messageReservationClient(locals, ctx.orgId, params.id, body, ctx.user);
		if (!res.ok) return fail(res.status, { error: res.error });
		return { messageSent: true, ticketId: res.ticketId };
	},

	// Staff assign the event to a client. If the email already belongs to a client
	// of this org, the reservation is handed over immediately and the client is
	// notified. Otherwise a one-time invite is emailed so they can register and
	// become the owner. Assignment NEVER changes the reservation's status.
	assignClient: async ({ request, locals, params, url }) => {
		const ctx = await staffAction(locals, 'assignError');
		if ('fail' in ctx) return ctx.fail;
		const { orgId, user } = ctx;

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
		const dateFmt = new Date(res.event_date + 'T00:00:00').toLocaleDateString(locale === 'en' ? 'en-GB' : 'sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
		const base = (await orgPublicBaseUrl(locals.db, orgId, url)) ?? (env.APP_URL || url.origin).replace(/\/$/, '');
		const orgName = locals.currentOrg?.name ?? 'Hallify';
		const inviterName = `${user.first_name} ${user.last_name}`;

		// Already a client of this org → hand the event over right away.
		let existing = await dbFirst<{ id: string; first_name: string; last_name: string }>(locals.db,
			`SELECT id, first_name, last_name FROM users WHERE email = ? AND org_id = ? AND account_type = 'client'`,
			email, orgId);
		// Has a Hallify account → is this venue's client already (D4): the client row is
		// created, linked, and the event handed over the same way.
		if (!existing) {
			const account = await findHallifyAccount(locals.db, email);
			if (account) {
				existing = { id: await createLinkedClient(locals.db, orgId, account), first_name: account.first_name, last_name: account.last_name };
			}
		}

		if (existing) {
			await dbRun(locals.db, 'UPDATE reservations SET user_id = ? WHERE id = ? AND org_id = ?', existing.id, params.id, orgId);
			await dbRun(locals.db, 'DELETE FROM reservation_invites WHERE reservation_id = ? AND accepted_at IS NULL', params.id);
			await logReservationActivity(locals.db, {
				reservationId: params.id, orgId, actorId: user.id, actorName: inviterName,
				kind: 'assigned', note: `${existing.first_name} ${existing.last_name}`,
			});
			const sent = await notifyEventAssigned(locals.db, email, { orgName, eventTitle: res.title, hallName: res.hall_name, date: dateFmt, eventUrl: `${base}/halls/my-reservations/${params.id}` }, locale).catch(() => false);
			return { assigned: true, assignedName: `${existing.first_name} ${existing.last_name}`, emailSent: sent };
		}

		// New person → (re)create a single pending invite and email the registration link.
		const token = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
		const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
		await dbRun(locals.db, 'DELETE FROM reservation_invites WHERE reservation_id = ? AND accepted_at IS NULL', params.id);
		await dbRun(locals.db,
			`INSERT INTO reservation_invites (id, reservation_id, org_id, email, first_name, last_name, token, invited_by, expires_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			crypto.randomUUID(), params.id, orgId, email, firstName, lastName, token, user.id, expiresAt);

		const sent = await sendReservationInviteEmail(locals.db, email,
			{ firstName, orgName, inviterName, eventTitle: res.title, hallName: res.hall_name, date: dateFmt, inviteUrl: `${base}/invite/${token}` }, locale);
		return { invited: true, invitedEmail: email, emailSent: sent };
	},

	// Re-send the pending invite email (same token) without re-entering details.
	resendInvite: async ({ locals, params, url }) => {
		const ctx = await staffAction(locals, 'assignError');
		if ('fail' in ctx) return ctx.fail;
		const { orgId, user } = ctx;

		const invite = await dbFirst<{ email: string; first_name: string; token: string; title: string; event_date: string; hall_name: string }>(locals.db,
			`SELECT i.email, i.first_name, i.token, r.title, r.event_date, h.name AS hall_name
			 FROM reservation_invites i JOIN reservations r ON r.id = i.reservation_id JOIN halls h ON h.id = r.hall_id
			 WHERE i.reservation_id = ? AND i.org_id = ? AND i.accepted_at IS NULL
			 ORDER BY i.created_at DESC LIMIT 1`, params.id, orgId);
		if (!invite) return fail(404, { assignError: st(locals.locale).serverErrors.inviteNotFoundOrExpired });

		const locale = await orgEmailLocale(locals.db, orgId);
		const dateFmt = new Date(invite.event_date + 'T00:00:00').toLocaleDateString(locale === 'en' ? 'en-GB' : 'sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
		const base = (await orgPublicBaseUrl(locals.db, orgId, url)) ?? (env.APP_URL || url.origin).replace(/\/$/, '');
		const sent = await sendReservationInviteEmail(locals.db, invite.email,
			{ firstName: invite.first_name, orgName: locals.currentOrg?.name ?? 'Hallify', inviterName: `${user.first_name} ${user.last_name}`, eventTitle: invite.title, hallName: invite.hall_name, date: dateFmt, inviteUrl: `${base}/invite/${invite.token}` }, locale);
		return { inviteResent: true, emailSent: sent };
	},

	// Revoke the pending invite (the typed-in person can no longer register via it).
	cancelInvite: async ({ locals, params }) => {
		const ctx = await staffAction(locals, 'assignError');
		if ('fail' in ctx) return ctx.fail;
		await dbRun(locals.db, 'DELETE FROM reservation_invites WHERE reservation_id = ? AND org_id = ? AND accepted_at IS NULL', params.id, ctx.orgId);
		return { inviteCancelled: true };
	},

	// Staff adjust the reservation's extras (e.g. after agreeing in messages).
	editExtras: async ({ request, locals, params }) => {
		const ctx = await staffAction(locals, 'error');
		if ('fail' in ctx) return ctx.fail;
		const requested = (await request.formData()).getAll('extras').map(String);
		// With the actor: the change is logged and the client is told (old and new total).
		const res = await setReservationExtras(locals.db, ctx.orgId, params.id, requested, ctx.user);
		if (!res.ok) return fail(404, { error: st(locals.locale).serverErrors.notFound });
		return { extrasSaved: true };
	},

	// Staff edit date, times, guests and notes. A new date goes through the
	// availability rules (taken, held, blocked, closed day, monthly cap).
	editDetails: async ({ request, locals, params }) => {
		const ctx = await staffAction(locals, 'detailsError');
		if ('fail' in ctx) return ctx.fail;
		const data = await request.formData();
		const res = await editReservationDetails(locals, ctx.orgId, params.id, {
			eventDate: String(data.get('eventDate') ?? ''),
			startTime: String(data.get('startTime') ?? ''),
			endTime: String(data.get('endTime') ?? ''),
			numGuests: String(data.get('numGuests') ?? ''),
			description: String(data.get('description') ?? ''),
			internalNotes: String(data.get('internalNotes') ?? ''),
		}, ctx.user);
		if (!res.ok) return fail(res.status, { detailsError: res.error });
		return { detailsSaved: true };
	},

	// Informational price, deposit and payment instructions (D6). Hallify takes no
	// payment: this is what the client is shown and emailed.
	savePayment: async ({ request, locals, params }) => {
		const ctx = await staffAction(locals, 'paymentError');
		if ('fail' in ctx) return ctx.fail;
		const data = await request.formData();
		const parsed = parsePaymentForm({
			price: String(data.get('price') ?? ''),
			deposit: String(data.get('deposit') ?? ''),
			depositDue: String(data.get('depositDue') ?? ''),
			iban: String(data.get('iban') ?? ''),
			variableSymbol: String(data.get('variableSymbol') ?? ''),
			note: String(data.get('note') ?? ''),
		});
		if (!parsed.ok) return fail(400, { paymentError: paymentFieldError(locals.locale, parsed.field) });
		let saved: boolean;
		try {
			saved = await savePaymentDetails(locals.db, ctx.orgId, params.id, parsed.values);
		} catch {
			return fail(503, { paymentError: st(locals.locale).payment.unavailable });
		}
		if (!saved) return fail(404, { paymentError: st(locals.locale).serverErrors.notFound });
		await logReservationActivity(locals.db, {
			reservationId: params.id, orgId: ctx.orgId, actorId: ctx.user.id,
			actorName: `${ctx.user.first_name} ${ctx.user.last_name}`.trim(), kind: 'edited', note: 'payment',
		});
		const emailSent = data.get('notifyClient') === 'on'
			? await notifyPaymentDetails(locals.db, ctx.orgId, params.id).catch(() => false)
			: null;
		return { paymentSaved: true, paymentEmailSent: emailSent };
	},

	// Mark the deposit or the whole amount as received, or take the mark back.
	markPayment: async ({ request, locals, params }) => {
		const ctx = await staffAction(locals, 'paymentError');
		if ('fail' in ctx) return ctx.fail;
		const data = await request.formData();
		const which = String(data.get('which') ?? '') === 'full' ? 'full' : 'deposit';
		const received = String(data.get('received') ?? '') === 'true';
		let ok: boolean;
		try {
			ok = await markPayment(locals.db, ctx.orgId, params.id, which, received);
		} catch {
			return fail(503, { paymentError: st(locals.locale).payment.unavailable });
		}
		if (!ok) return fail(404, { paymentError: st(locals.locale).serverErrors.notFound });
		await logReservationActivity(locals.db, {
			reservationId: params.id, orgId: ctx.orgId, actorId: ctx.user.id,
			actorName: `${ctx.user.first_name} ${ctx.user.last_name}`.trim(), kind: 'edited', note: 'payment',
		});
		// The rest of the team sees money coming in (D12); taking a mark back is not news.
		if (received) {
			const r = await dbFirst<{ title: string; event_date: string; hall_name: string | null; client: string | null }>(locals.db,
				`SELECT r.title, r.event_date, h.name AS hall_name,
				        -- The client: the booking's account when it is a client's, else the name staff typed.
				        COALESCE(CASE WHEN u.account_type = 'client' THEN NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') END,
				                 NULLIF(TRIM(r.customer_name), '')) AS client
				   FROM reservations r JOIN halls h ON h.id = r.hall_id LEFT JOIN users u ON u.id = r.user_id
				  WHERE r.id = ? AND r.org_id = ?`, params.id, ctx.orgId).catch(() => null);
			if (r) {
				await notifyPayment(locals.db, {
					orgId: ctx.orgId, reservationId: params.id, title: r.title, hall: r.hall_name ?? undefined,
					date: r.event_date, client: r.client ?? undefined,
					status: which === 'full' ? 'paid' : 'deposit_received', actorId: ctx.user.id,
				});
			}
		}
		return { paymentMarked: true };
	},

	saveLayout: async ({ request, locals, params, url }) => {
		if (!locals.user) redirect(303, loginUrl(url));
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });
		const data = await request.formData();
		const layoutJson = String(data.get('layoutJson') ?? '');
		if (!layoutJson) return fail(400, { error: st(locals.locale).serverErrors.noLayoutData });

		const reservation = await dbFirst<ReservationRow & { hall_floorplan_json: string | null }>(locals.db,
			`SELECT r.user_id, r.status, r.event_date, r.start_time, h.floorplan_json AS hall_floorplan_json
			 FROM reservations r JOIN halls h ON h.id = r.hall_id WHERE r.id = ? AND r.org_id = ?`,
			params.id, orgId
		);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.notFound });
		const access = await reservationAccess(locals);
		if (!canActOnReservation(access, locals, reservation.user_id)) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });
		if (!access.canManage && !['approved', 'planned'].includes(reservation.status)) {
			return fail(403, { error: st(locals.locale).serverErrors.reservationMustBeApprovedToEditLayout });
		}

		// On the hall's current room, with what is still wrong stored alongside (D2).
		const save = prepareLayoutSave(layoutJson, reservation.hall_floorplan_json, followsHallPlan(reservation));
		await dbRun(locals.db, 'UPDATE reservations SET layout_json = ?, layout_problems = ? WHERE id = ? AND org_id = ?',
			save.json, save.column, params.id, orgId);
		return { success: true, problems: save.problems.length };
	},

	// Staff with `reservations.manage` change the status — including bringing an
	// event back from the cancelled state. Booking owners cannot. `from` is the
	// status the person saw: a stale tab cannot overwrite a change it never saw.
	updateStatus: async ({ request, locals, params }) => {
		const ctx = await staffAction(locals, 'statusError');
		if ('fail' in ctx) return ctx.fail;
		const data = await request.formData();
		const status = String(data.get('status') ?? '') as ReservationStatus;
		const from = String(data.get('from') ?? '') || null;
		const res = await changeReservationStatus(locals, ctx.orgId, params.id, status, ctx.user, { expectedFrom: from });
		if (!res.ok) return fail(res.status, { statusError: res.error });
		return { statusChanged: true };
	},

	// Decline a request with a reason the client sees (in the booking's messages and
	// in the e-mail). Declining is cancelling by the venue.
	decline: async ({ request, locals, params }) => {
		const ctx = await staffAction(locals, 'statusError');
		if ('fail' in ctx) return ctx.fail;
		const data = await request.formData();
		const reason = String(data.get('reason') ?? '').trim();
		const from = String(data.get('from') ?? '') || null;
		const res = await changeReservationStatus(locals, ctx.orgId, params.id, 'cancelled', ctx.user, { expectedFrom: from, reason });
		if (!res.ok) return fail(res.status, { statusError: res.error });
		return { declined: true };
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
		const access = await reservationAccess(locals);
		if (!canActOnReservation(access, locals, reservation.user_id)) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });
		if (['cancelled', 'completed'].includes(reservation.status)) return { success: true };

		// Enforce minimum cancel-notice for non-staff.
		if (!access.canManage && reservation.hall_min_cancel_days > 0) {
			const eventDate = new Date(reservation.event_date);
			const now = new Date();
			const daysUntil = Math.ceil((eventDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
			if (daysUntil < reservation.hall_min_cancel_days) {
				return fail(400, { error: st(locals.locale).serverErrors.cannotCancelBeforeEvent.replace('{days}', String(reservation.hall_min_cancel_days)) });
			}
		}

		const ownBooking = reservation.user_id === locals.user.id;
		await dbRun(locals.db, "UPDATE reservations SET status = 'cancelled', cancelled_by = ? WHERE id = ? AND org_id = ?",
			ownBooking ? 'client' : 'venue', params.id, orgId);

		const actorName = `${locals.user.first_name} ${locals.user.last_name}`;
		await postSystemMessage(locals.db, reservation.user_id, reservation.title,
			`status_change:cancelled:${actorName}`, locals.user.id, params.id);

		if (!ownBooking) {
			const userInfo = await dbFirst<{ email: string }>(locals.db, 'SELECT email FROM users WHERE id = ?', reservation.user_id);
			if (userInfo?.email) notifyStatusChange(locals.db, orgId, userInfo.email, reservation.title, 'cancelled', { reservationId: params.id }).catch(() => {});
		}

		return { success: true };
	},

	resetLayout: async ({ locals, params }) => {
		if (!locals.user) return fail(403, { error: st(locals.locale).serverErrors.unauthorized });
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });
		const reservation = await dbFirst<ReservationRow & { hall_floorplan: string | null }>(locals.db,
			`SELECT r.user_id, r.hall_id, r.layout_json, h.floorplan_json AS hall_floorplan
			   FROM reservations r JOIN halls h ON h.id = r.hall_id WHERE r.id = ? AND r.org_id = ?`,
			params.id, orgId
		);
		if (!reservation) return fail(404, { error: st(locals.locale).serverErrors.notFound });
		if (!canActOnReservation(await reservationAccess(locals), locals, reservation.user_id)) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });
		await dbRun(locals.db,
			'UPDATE reservations SET layout_json = (SELECT floorplan_json FROM halls WHERE id = ?) WHERE id = ? AND org_id = ?',
			reservation.hall_id, params.id, orgId
		);
		await refreshLayoutProblems(locals.db, 'event', params.id);
		// The client may have placed tables and seated guests: say so in the history and
		// tell them (it used to vanish silently). Nothing to say if nothing changed.
		if ((reservation.layout_json ?? null) !== (reservation.hall_floorplan ?? null)) {
			await layoutReplaced(locals, orgId, params.id, null);
		}
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
		if (!canActOnReservation(await reservationAccess(locals), locals, reservation.user_id)) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });

		// Template must belong to the same hall (and therefore the same org).
		const tmpl = await dbFirst<TemplateRow>(locals.db,
			'SELECT name, layout_json FROM floorplan_templates WHERE id = ? AND hall_id = ?',
			templateId, reservation.hall_id
		);
		if (!tmpl) return fail(404, { error: st(locals.locale).serverErrors.templateNotFound });

		await dbRun(locals.db,
			'UPDATE reservations SET layout_json = ? WHERE id = ? AND org_id = ?',
			toJson(fromJson(tmpl.layout_json as string | null)), params.id, orgId
		);
		await refreshLayoutProblems(locals.db, 'event', params.id);
		await layoutReplaced(locals, orgId, params.id, tmpl.name || null);
		return { success: true };
	},

	toggleRsvp: async ({ request, locals, params }) => {
		// RSVP is switched off product-wide; its settings must not be writable either.
		if (!RSVP_ENABLED) return fail(404, { error: st(locals.locale).serverErrors.notFound });
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
		if (!canActOnReservation(await reservationAccess(locals), locals, reservation.user_id)) return fail(403, { error: st(locals.locale).serverErrors.accessDenied });

		const existing = fromJson<Record<string, boolean | string | unknown[]>>(reservation.rsvp_config as string | null) ?? {};
		const config = { ...existing, enabled };

		await dbRun(locals.db,
			'UPDATE reservations SET rsvp_config = ? WHERE id = ? AND org_id = ?',
			toJson(config), params.id, orgId
		);
		return { success: true };
	}
};
