// Creating a reservation, in one place.
//
// There are now two doors into the same room: the operator wizard at
// /app/reservation/new, and the manual entry on the manage-reservations screen
// for a customer who phoned up. They collect the same facts and must obey the
// same rules — a double booking made by hand is exactly what the availability
// checks exist to prevent — so the create path lives here rather than being
// copied. Callers only decide what to do with the result (fail() vs redirect).
import { dbFirst, dbRun } from '$lib/db/index';
import type { HallRow, ReservationStatus, TemplateRow } from '$lib/db/index';
import { assertCanBook, releaseHold } from '$lib/availability';
import { st } from '$lib/i18n-server';
import { notifyNewReservation } from '$lib/email';
import { postSystemMessage } from '$lib/tickets';
import { dispatchWebhooks } from '$lib/notifications';
import {
	CUSTOM_EVENT_TYPE_MAX,
	cleanCustomEventType,
	serializeReservationEventType,
} from '$lib/eventTypes';

export interface CreateReservationInput {
	orgId: string;
	hallId: string;
	title: string;
	description?: string | null;
	eventDate: string;
	templateId?: string | null;
	startTime?: string | null;
	endTime?: string | null;
	numGuests?: number | null;
	/** Raw value of the event-type select — folded to a canonical key, or dropped. */
	eventType?: string | null;
	/** Raw typed-in label, only meaningful when `eventType` is "other". */
	eventTypeOther?: string | null;
}

export type CreateReservationResult =
	| { ok: true; id: string; status: ReservationStatus; hallName: string }
	| { ok: false; status: number; error: string };

/** A clock time as the form sends it. Anything else is dropped rather than
 *  stored — the column is displayed verbatim, so junk in it is junk on screen. */
function normalizeTime(value: string | null | undefined): string | null {
	const v = (value ?? '').trim();
	if (!v) return null;
	const m = /^(\d{1,2}):(\d{2})$/.exec(v);
	if (!m) return null;
	const h = Number(m[1]);
	const min = Number(m[2]);
	if (h > 23 || min > 59) return null;
	return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/**
 * Validate and insert a reservation, then run the same notifications the wizard
 * has always run. Never throws for a user-caused problem: the caller gets a
 * reason and an HTTP status to hand to `fail()`.
 */
export async function createReservation(
	locals: App.Locals,
	input: CreateReservationInput
): Promise<CreateReservationResult> {
	const e = st(locals.locale).serverErrors;
	const user = locals.user;
	if (!user) return { ok: false, status: 401, error: e.accessDenied };

	const hallId = input.hallId.trim();
	const title = input.title.trim();
	const eventDate = input.eventDate.trim();
	const description = (input.description ?? '').trim();
	const templateId = (input.templateId ?? '').trim();

	if (!hallId || !title || !eventDate) {
		return { ok: false, status: 400, error: e.fillAllRequiredFields };
	}

	// The typed-in "Other" label is free text from the client: cap it before it
	// reaches the column, and say so rather than silently truncating a label the
	// operator will later read back.
	if (cleanCustomEventType(input.eventTypeOther).length > CUSTOM_EVENT_TYPE_MAX) {
		return { ok: false, status: 400, error: e.eventTypeOtherTooLong(CUSTOM_EVENT_TYPE_MAX) };
	}
	const eventType = serializeReservationEventType(input.eventType, input.eventTypeOther);

	const numGuests = input.numGuests != null && input.numGuests > 0 ? input.numGuests : null;
	const startTime = normalizeTime(input.startTime);
	const endTime = normalizeTime(input.endTime);

	const hall = await dbFirst<HallRow>(locals.db,
		'SELECT * FROM halls WHERE id = ? AND org_id = ?', hallId, input.orgId);
	if (!hall) return { ok: false, status: 400, error: e.hallNotFound };

	if (hall.force_layouts && !templateId) {
		return { ok: false, status: 400, error: e.layoutMustBeSelected };
	}

	// All availability rules in one place (past/min-advance/blocked/taken/held/capacity).
	const check = await assertCanBook(locals.db, hall, eventDate, user.id, numGuests, locals.locale);
	if (!check.ok) return { ok: false, status: 400, error: check.reason ?? e.dateUnavailable };

	let layoutJson: string | null = null;
	let templateResolved = false;
	if (templateId) {
		const tmpl = await dbFirst<TemplateRow>(locals.db,
			'SELECT layout_json FROM floorplan_templates WHERE id = ? AND hall_id = ?', templateId, hallId);
		if (tmpl) { layoutJson = tmpl.layout_json as string | null; templateResolved = true; }
	}
	// The check above only proved a template id was POSTED. A hall that forces
	// layouts must end up with one that actually belongs to it — otherwise any
	// junk id (or one copied from another hall) walks straight past the rule.
	if (hall.force_layouts && !templateResolved) {
		return { ok: false, status: 400, error: e.layoutMustBeSelected };
	}

	const initialStatus: ReservationStatus = hall.auto_approve ? 'approved' : 'pending';
	const newId = crypto.randomUUID();
	const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();

	try {
		await dbRun(locals.db,
			`INSERT INTO reservations (id, org_id, hall_id, user_id, title, description, event_date, start_time, end_time, layout_json, status, invite_code, num_guests, event_type)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			newId, input.orgId, hallId, user.id, title, description || null, eventDate,
			startTime, endTime, layoutJson, initialStatus, inviteCode, numGuests, eventType
		);
	} catch {
		// Lost the one-per-hall-day unique index race.
		return { ok: false, status: 409, error: e.dateJustTaken };
	}

	await releaseHold(locals.db, hallId, eventDate, user.id);

	const userName = `${user.first_name} ${user.last_name}`;
	await postSystemMessage(locals.db, user.id, title, `reservation_created:${initialStatus}:${userName}`, user.id);
	notifyNewReservation(locals.db, input.orgId, title, userName, hall.name, eventDate).catch(() => {});
	// `reservation.new` is declared in WebhookEvent and offered in the webhook
	// settings UI, but nothing ever dispatched it — subscribing was a no-op.
	dispatchWebhooks(locals.db, input.orgId, 'reservation.new', {
		reservation_id: newId, title, hall_id: hallId, event_date: eventDate, event_type: eventType,
	}).catch(() => {});

	return { ok: true, id: newId, status: initialStatus, hallName: hall.name };
}
