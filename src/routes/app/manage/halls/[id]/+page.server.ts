import { parseAmount } from '$lib/payment';
import { saveHallBasePrice } from '$lib/server/payments';
import { hallFeedback } from '$lib/server/feedback';
import { error, fail, redirect } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun, toJson, fromJson, fromJsonArr } from '$lib/db/index';
import type { HallRow, HallBlockRow, TemplateRow, TableTypeRow, ReservationRow, HallExtraRow } from '$lib/db/index';
import { getPlan } from '$lib/plans';
import { canAddHall, canAddExtra, unlockHall } from '$lib/limits';
import { serializeEventTypes } from '$lib/eventTypes';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';
import { sendEmail } from '$lib/email';
import { OPERATOR } from '$lib/legal';
import { requireOrgAnyPermission, requireOrgArea, requireOrgPermission } from '$lib/server/access';
import type { Permission } from '$lib/permissions';

/** The table inventory the templates are laid out from: templates.manage edits it
 *  too, as its description promises (see `areaAccess`). */
const TABLE_TYPE_EDITORS: Permission[] = ['halls.manage', 'templates.manage'];
import { canManageSettings } from '$lib/server/settings-access';
import { parseCoordinates } from '$lib/venue-location';
import { geocodeAddress } from '$lib/server/geocode';
import { blockingReservations, cancelHallReservations, cancelReservations, hallIsUnused, reservationsInRange } from '$lib/server/hall-archive';
import { BUILT_IN_AMENITIES, hallWebsite } from '$lib/server/hall-profile';
import { hallSlug, hallSlugTaken, isReservedHallSlug, uniqueHallSlug } from '$lib/server/hall-naming';
import { deleteUnusedHallImages, hallImageUrls, isOwnHallImage } from '$lib/server/hall-images';
import { completeOpeningHours, invalidOpeningDay } from '$lib/opening-hours';
import { dispatchWebhooks } from '$lib/notifications';
import {
	addHallBlock, removeHallBlock, addTableType, updateTableType, removeTableType,
	addHallExtra, updateHallExtra, removeHallExtra, updateBookingSettings, type TableTypeInput, type ExtraInput
} from '$lib/server/ops/hall-ops';
import { syncHallLayouts } from '$lib/server/layout-sync';
import { followsHallPlan, parseProblems, UPCOMING_STATUSES } from '$lib/floorplan-sync';

/** The note sent to every client when a hall's bookings are cancelled together. */
const MAX_CANCEL_NOTE = 2000;

/** Text that goes into an HTML email. */
const esc = (s: unknown) =>
	String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Mapping requests the operator can still withdraw (we have not delivered yet). */
const OPEN_MAPPING = `('requested', 'contacted', 'scheduled')`;

const clamp = (n: number, lo: number, hi: number, dflt: number) =>
	Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;

/** An organisation's own amenity. Built-ins are translated keys; these carry their
 *  own per-locale label, and `slug` is what lands in halls.amenities. */
interface OrgAmenityRow {
	id: string;
	slug: string;
	label_sk: string | null;
	label_en: string | null;
}


/** One organisation cannot be allowed to grow this table without bound. */
const MAX_CUSTOM_AMENITIES = 40;

function slugifyAmenity(label: string): string {
	return label
		.toLowerCase()
		.normalize('NFD').replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
}

/** 1 / 2 / 3 or NULL — the schema's CHECK constraint, enforced before it gets there
 *  so a bad value is a 400 rather than a database error. Anything unrecognised that
 *  is not an explicit clear is rejected rather than quietly stored as "not stated". */
function parsePriceBand(raw: FormDataEntryValue | null): 1 | 2 | 3 | null | 'invalid' {
	const text = String(raw ?? '').trim();
	if (!text) return null;
	const n = Number(text);
	return n === 1 || n === 2 || n === 3 ? n : 'invalid';
}

/**
 * Fill in coordinates from the address when the operator left the pin unset.
 *
 * Two rules: it never overwrites a position somebody placed by hand, and it never
 * fails the save. A geocode is a convenience on top of someone's edit — losing their
 * work because a free third-party lookup was slow would be far worse than a venue
 * with no pin, which they can always drop themselves.
 */
async function coordinatesForSave(
	db: App.Locals['db'],
	address: string | null,
	chosen: { latitude: number | null; longitude: number | null }
): Promise<{ latitude: number | null; longitude: number | null }> {
	if (!address || chosen.latitude !== null || chosen.longitude !== null) return chosen;
	try {
		const hit = await geocodeAddress(db, address);
		if (hit) return { latitude: hit.latitude, longitude: hit.longitude };
	} catch {
		/* lookup unavailable — save the venue without a pin */
	}
	return chosen;
}

/** The table-type dialog's fields; bounds are applied by normalizeTableType. */
function tableTypeFromForm(data: FormData): Partial<TableTypeInput> {
	return {
		name: String(data.get('name') ?? ''),
		shape: String(data.get('shape') ?? 'rect') === 'round' ? 'round' : 'rect',
		width: Number(data.get('width') ?? 2),
		height: Number(data.get('height') ?? 1),
		radius: Number(data.get('radius') ?? 1),
		maxChairs: Number(data.get('maxChairs') ?? 8),
		amount: Number(data.get('amount') ?? 0),
		color: String(data.get('color') ?? '#92400e')
	};
}

function extraFromForm(data: FormData): ExtraInput {
	return {
		name: String(data.get('name') ?? ''),
		description: String(data.get('description') ?? '') || null,
		priceEur: Number(data.get('price')) || 0,
		pricing: String(data.get('pricing') ?? 'fixed') === 'per_guest' ? 'per_guest' : 'fixed'
	};
}

export const load: PageServerLoad = async ({ params, locals }) => {
	// halls.view opens the hall read-only, and so do floorplans.manage and
	// templates.manage: the plan and the templates live on this page, and their
	// editors lead back here. Every action below still asks for its own permission.
	const { access } = await requireOrgArea(locals, 'halls');
	const orgId = locals.currentOrg!.id;
	// price_band arrived with 0006 and is not on HallRow yet; widen it here rather
	// than wait for the shared type.
	const hall = await dbFirst<HallRow & { price_band: number | null; base_price_cents?: number | null }>(
		locals.db, 'SELECT * FROM halls WHERE id = ? AND org_id = ?', params.id, orgId
	);
	if (!hall) error(404, st(locals.locale).serverErrors.hallNotFound);

	const templates = await dbAll<TemplateRow>(
		locals.db,
		'SELECT * FROM floorplan_templates WHERE hall_id = ? ORDER BY name',
		params.id
	);
	const blocks = await dbAll<HallBlockRow>(
		locals.db,
		'SELECT * FROM hall_blocks WHERE hall_id = ? ORDER BY created_at',
		params.id
	);
	const tableTypes = await dbAll<TableTypeRow>(
		locals.db,
		'SELECT * FROM table_types WHERE hall_id = ? ORDER BY name',
		params.id
	);
	// The hall's bookings are shown to those who may see bookings.
	const reservations = access.reservations.view
		? await dbAll<Pick<ReservationRow, 'id' | 'title' | 'event_date' | 'status'>>(
			locals.db,
			"SELECT id, title, event_date, status FROM reservations WHERE hall_id = ? AND status != 'cancelled' ORDER BY event_date",
			params.id
		)
		: [];

	const extras = await dbAll<HallExtraRow>(locals.db,
		'SELECT * FROM hall_extras WHERE hall_id = ? ORDER BY created_at', params.id);

	// The organisation's own amenities. Wrapped because 0006 may still be rolling
	// out on a deployed database; a missing table means "no custom amenities yet",
	// not a 500 on the whole hall editor.
	let orgAmenities: OrgAmenityRow[] = [];
	try {
		orgAmenities = await dbAll<OrgAmenityRow>(
			locals.db,
			'SELECT id, slug, label_sk, label_en FROM org_amenities WHERE org_id = ? ORDER BY created_at',
			orgId
		);
	} catch {
		orgAmenities = [];
	}

	const plan = getPlan(locals.currentOrg!.subscription.plan);
	// The mapping add-on. Only the latest request matters to the page: an open one is
	// shown with its status (and can be withdrawn), a delivered one says so, and with
	// none the option is offered.
	let floorplanRequest: { id: string; status: string; note: string | null; created_at: string; updated_at: string } | null = null;
	try {
		floorplanRequest = await dbFirst<{ id: string; status: string; note: string | null; created_at: string; updated_at: string }>(
			locals.db,
			`SELECT id, status, note, created_at, updated_at FROM floorplan_requests
			  WHERE hall_id = ? AND status != 'cancelled'
			  ORDER BY created_at DESC LIMIT 1`,
			hall.id);
	} catch {
		// Table arrives with migration 0008; absent is simply "never requested".
	}

	// What stands between this hall and being retired (see $lib/server/hall-archive).
	const blocking = hall.archived_at || !access.halls.manage ? [] : await blockingReservations(locals.db, hall.id);
	const unused = await hallIsUnused(locals.db, hall.id);

	// A hall suspended by a downgrade, with the plan full: the halls that could be
	// paused in its place, so the owner can swap which one is active (B84).
	const planFull = !(await canAddHall(locals.db, orgId, locals.currentOrg!.subscription.plan));
	const swapCandidates = hall.plan_locked && !hall.archived_at && planFull
		? await dbAll<{ id: string; name: string }>(locals.db,
			'SELECT id, name FROM halls WHERE org_id = ? AND id != ? AND plan_locked = 0 AND archived_at IS NULL ORDER BY name',
			orgId, hall.id)
		: [];

	// Upcoming events whose layout no longer fits the hall's plan (see floorplan-sync).
	// Wrapped like the other late columns: before migration 0032 there are none.
	let problemEvents: { id: string; title: string; event_date: string; problems: number }[] = [];
	try {
		problemEvents = (await dbAll<{ id: string; title: string; status: string; event_date: string; start_time: string | null; layout_problems: string | null }>(locals.db,
			`SELECT id, title, status, event_date, start_time, layout_problems FROM reservations
			  WHERE hall_id = ? AND layout_problems IS NOT NULL AND status IN (${UPCOMING_STATUSES.map(() => '?').join(', ')})
			    AND event_date >= date('now', '-1 day') ORDER BY event_date, start_time`,
			hall.id, ...UPCOMING_STATUSES))
			.filter((e) => followsHallPlan(e))
			.map((e) => ({ id: e.id, title: e.title, event_date: e.event_date, problems: parseProblems(e.layout_problems).length }))
			.filter((e) => e.problems > 0);
	} catch {
		problemEvents = [];
	}

	// Ordering (or withdrawing) the paid mapping add-on needs settings.manage (I29).
	const canOrderAddons = await canManageSettings(locals);
	// Clients' ratings of events in this hall (D5): private to the team.
	const feedback = await hallFeedback(locals.db, orgId, hall.id);
	const hallAccess = { manage: access.halls.manage, floorplans: access.halls.floorplans, templates: access.halls.templates, tableTypes: access.halls.tableTypes };
	return { hall, templates: templates.map((tm) => ({ ...tm, problems: parseProblems((tm as { layout_problems?: unknown }).layout_problems).length })), problemEvents, blocks, tableTypes, reservations, extras, plan, orgAmenities, floorplanRequest, blocking, unused, planFull, swapCandidates, canOrderAddons, feedback, hallAccess };
};

/** The hall in the URL must belong to the acting organization. Every action below
 *  keys off `params.id`; without this an owner/admin of org A could rewrite, block,
 *  publish or wipe org B's hall by guessing its id. `load` was already scoped — the
 *  actions were not. Children (templates/blocks/table types/extras) are additionally
 *  constrained by `hall_id` at their own statements. */
async function assertHallInOrg(db: App.Locals['db'], hallId: string, orgId: string): Promise<void> {
	const row = await dbFirst<{ ok: number }>(db, 'SELECT 1 AS ok FROM halls WHERE id = ? AND org_id = ?', hallId, orgId);
	if (!row) error(404, 'Not found');
}

export const actions: Actions = {
	saveInfo: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		await assertHallInOrg(locals.db, params.id, org.id);
		const data = await request.formData();
		// Booking rules only. This form used to post the profile's name, address and
		// pin too and wrote them unvalidated, so saving a setting could clear a listed
		// hall's address (B72). The profile has its own action.
		const res = await updateBookingSettings(locals.db, org.id, params.id, {
			allow_reservations: data.get('allowReservations') === 'on',
			custom_layouts: data.get('customLayouts') === 'on',
			force_layouts: data.get('forceLayouts') === 'on',
			allow_feedback: data.get('allowFeedback') === 'on',
			auto_approve: data.get('autoApprove') === 'on',
			min_days_advance: Number(data.get('minDaysAdvance') ?? 0),
			min_cancel_days: Number(data.get('minCancelDays') ?? 0),
			pre_reservation_text: String(data.get('preReservationText') ?? ''),
		}, locals.locale);
		if (!res.ok) return fail(res.status, { infoError: res.error });
		return { infoSuccess: true };
	},

	// The hall's informational base price (D6): with the booked extras it is offered as
	// a reservation's price. Never charged, never shown to clients on its own.
	saveBasePrice: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		await assertHallInOrg(locals.db, params.id, org.id);
		const data = await request.formData();
		const cents = parseAmount(String(data.get('basePrice') ?? ''));
		if (cents === undefined) return fail(400, { basePriceError: st(locals.locale).payment.errBasePrice });
		if (!(await saveHallBasePrice(locals.db, org.id, params.id, cents))) {
			return fail(503, { basePriceError: st(locals.locale).payment.unavailable });
		}
		return { basePriceSaved: true };
	},

	saveFloorplan: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'floorplans.manage');
		await assertHallInOrg(locals.db, params.id, org.id);
		const data = await request.formData();
		const floorplanJson = String(data.get('floorplanJson') ?? '');
		if (!floorplanJson) return fail(400, { floorplanError: st(locals.locale).serverErrors.noData });
		const previous = await dbFirst<{ floorplan_json: string | null }>(locals.db,
			'SELECT floorplan_json FROM halls WHERE id = ? AND org_id = ?', params.id, org.id);
		await dbRun(locals.db, 'UPDATE halls SET floorplan_json=? WHERE id=? AND org_id=?', floorplanJson, params.id, org.id);
		// The new room goes under the hall's templates and upcoming events.
		const sync = await syncHallLayouts(locals.db, params.id, previous?.floorplan_json ?? null, floorplanJson, { orgId: org.id, actorId: locals.user?.id ?? null });
		return { floorplanSuccess: true, sync };
	},

	// Create a template from the hall's CURRENT live floorplan (walls/zones/bounds),
	// then open the restricted template editor so the admin can lay out tables/chairs.
	createTemplate: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'templates.manage');
		await assertHallInOrg(locals.db, params.id, org.id);
		const orgId = locals.currentOrg!.id;
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const eventTypes = serializeEventTypes(data.getAll('eventTypes').map(String));
		if (!name) return fail(400, { templateError: st(locals.locale).serverErrors.nameRequired });

		const hall = await dbFirst<{ floorplan_json: string | null }>(
			locals.db,
			'SELECT floorplan_json FROM halls WHERE id = ? AND org_id = ?',
			params.id, orgId
		);
		if (!hall) return fail(404, { templateError: st(locals.locale).serverErrors.hallNotFound });
		if (!hall.floorplan_json) {
			return fail(400, { templateError: st(locals.locale).serverErrors.designLayoutFirst });
		}

		const id = crypto.randomUUID();
		await dbRun(
			locals.db,
			'INSERT INTO floorplan_templates (id, hall_id, name, event_type, layout_json) VALUES (?, ?, ?, ?, ?)',
			id, params.id, name, eventTypes, hall.floorplan_json
		);
		redirect(303, `/app/manage/halls/${params.id}/templates/${id}`);
	},

	deleteTemplate: async ({ request, locals }) => {
		const org = await requireOrgPermission(locals, 'templates.manage');
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		await dbRun(locals.db,
			'DELETE FROM floorplan_templates WHERE id = ? AND hall_id IN (SELECT id FROM halls WHERE org_id = ?)',
			id, org.id);
		return { success: true };
	},

	addBlock: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		const data = await request.formData();
		const daysRaw = data.getAll('days').map(Number);
		const res = await addHallBlock(locals.db, org.id, params.id, {
			type: String(data.get('blockType') ?? '') === 'weekly' ? 'weekly' : 'date_range',
			dateFrom: String(data.get('dateFrom') ?? '') || null,
			dateTo: String(data.get('dateTo') ?? '') || null,
			days: daysRaw.length ? daysRaw : null,
			reason: String(data.get('reason') ?? '').trim() || null
		}, locals.locale);
		if (!res.ok) return fail(res.status, { blockError: res.error });
		return { blockSuccess: true };
	},

	deleteBlock: async ({ request, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		await removeHallBlock(locals.db, org.id, String((await request.formData()).get('id') ?? ''));
		return { success: true };
	},

	/** Cancel the bookings that fall inside a period being blocked (the block dialog).
	 *  Only live, upcoming bookings of THIS hall on the chosen dates and weekdays can
	 *  be named; each client is told the way the archive flow tells them (B98). */
	cancelEvents: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		const hall = await dbFirst<{ id: string; name: string }>(locals.db,
			'SELECT id, name FROM halls WHERE id = ? AND org_id = ?', params.id, org.id);
		if (!hall) error(404, 'Not found');
		const data = await request.formData();
		const from = String(data.get('dateFrom') ?? '');
		const to = String(data.get('dateTo') ?? '');
		const days = data.getAll('days').map(Number);
		const ids = new Set(String(data.get('ids') ?? '').split(',').filter(Boolean));
		const message = String(data.get('message') ?? '').trim().slice(0, MAX_CANCEL_NOTE);
		const inRange = await reservationsInRange(locals.db, hall.id, { from, to, days });
		const chosen = inRange.filter((r) => ids.has(r.id));
		const { cancelled } = await cancelReservations(locals.db, chosen, {
			orgId: org.id,
			hallId: hall.id,
			hallName: hall.name,
			actor: { id: locals.user!.id, name: `${locals.user!.first_name} ${locals.user!.last_name}` },
			message,
			reason: 'hall_blocked',
		});
		return { rangeCancelled: cancelled };
	},

	addTableType: async ({ request, params, locals }) => {
		const { org } = await requireOrgAnyPermission(locals, TABLE_TYPE_EDITORS);
		const res = await addTableType(locals.db, org.id, params.id, tableTypeFromForm(await request.formData()), locals.locale);
		if (!res.ok) return fail(res.status, { tableTypeError: res.error });
		return { tableTypeSuccess: true };
	},

	updateTableType: async ({ request, params, locals }) => {
		const { org } = await requireOrgAnyPermission(locals, TABLE_TYPE_EDITORS);
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { tableTypeError: st(locals.locale).serverErrors.missingTableType });
		const res = await updateTableType(locals.db, org.id, params.id, id, tableTypeFromForm(data), locals.locale);
		if (!res.ok && res.status === 400) return fail(400, { tableTypeError: res.error });
		return { tableTypeSuccess: true };
	},

	deleteTableType: async ({ request, params, locals }) => {
		const { org } = await requireOrgAnyPermission(locals, TABLE_TYPE_EDITORS);
		await removeTableType(locals.db, org.id, params.id, String((await request.formData()).get('id') ?? ''));
		return { success: true };
	},

	// ─── Extras (bookable add-ons) ──────────────────────────────────────────

	// ─── Extras (bookable add-ons) ──────────────────────────────────────────
	addExtra: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		const res = await addHallExtra(locals.db, org.id, org.subscription.plan, params.id, extraFromForm(await request.formData()), locals.locale);
		if (!res.ok) return fail(res.status, { extraError: res.error });
		return { extraSuccess: true };
	},

	updateExtra: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { extraError: st(locals.locale).serverErrors.nameRequired });
		const res = await updateHallExtra(locals.db, org.id, id, extraFromForm(data), locals.locale);
		if (!res.ok && res.status === 400) return fail(400, { extraError: res.error });
		return { extraSuccess: true };
	},

	deleteExtra: async ({ request, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		await removeHallExtra(locals.db, org.id, String((await request.formData()).get('id') ?? ''));
		return { extraSuccess: true };
	},

	// ─── Custom amenities (organisation-wide) ───────────────────────────────
	// Built-in amenities are translated keys. One an operator invents has no key to
	// translate, so it carries its own label per locale — and only one of the two is
	// required: writing "Vírivka" should not oblige anybody to also write "Hot tub".

	// ─── Custom amenities (organisation-wide) ───────────────────────────────
	// Built-in amenities are translated keys. One an operator invents has no key to
	// translate, so it carries its own label per locale — and only one of the two is
	// required: writing "Vírivka" should not oblige anybody to also write "Hot tub".
	addAmenity: async ({ request, locals }) => {
		const orgId = (await requireOrgPermission(locals, 'halls.manage')).id;
		const data = await request.formData();
		const labelSk = String(data.get('labelSk') ?? '').trim().slice(0, 60);
		const labelEn = String(data.get('labelEn') ?? '').trim().slice(0, 60);
		if (!labelSk && !labelEn) {
			return fail(400, { amenityError: st(locals.locale).serverErrors.amenityLabelRequired });
		}

		const existing = await dbAll<{ slug: string }>(
			locals.db, 'SELECT slug FROM org_amenities WHERE org_id = ?', orgId
		);
		if (existing.length >= MAX_CUSTOM_AMENITIES) {
			return fail(403, { amenityError: st(locals.locale).serverErrors.amenityLimitReached });
		}

		// A slug is derived from whichever label exists; a label with no ASCII left
		// (all punctuation, say) still needs a stable id, hence the fallback.
		const base = slugifyAmenity(labelSk || labelEn) || 'amenity';
		const taken = new Set(existing.map((row) => row.slug));
		let slug = `custom-${base}`;
		for (let n = 2; taken.has(slug); n++) slug = `custom-${base}-${n}`;

		await dbRun(
			locals.db,
			'INSERT INTO org_amenities (id, org_id, slug, label_sk, label_en) VALUES (?, ?, ?, ?, ?)',
			crypto.randomUUID(), orgId, slug, labelSk || null, labelEn || null
		);
		return { amenityAdded: slug };
	},

	deleteAmenity: async ({ request, locals }) => {
		const orgId = (await requireOrgPermission(locals, 'halls.manage')).id;
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { amenityError: st(locals.locale).serverErrors.missingId });
		const row = await dbFirst<{ slug: string }>(
			locals.db, 'SELECT slug FROM org_amenities WHERE id = ? AND org_id = ?', id, orgId
		);
		if (!row) return fail(404, { amenityError: st(locals.locale).serverErrors.missingId });
		await dbRun(locals.db, 'DELETE FROM org_amenities WHERE id = ? AND org_id = ?', id, orgId);
		// Untick it on every hall of the organisation; otherwise the venue pages kept
		// showing its raw "custom-…" key (B150).
		await dbRun(locals.db,
			`UPDATE halls
			    SET amenities = (SELECT json_group_array(j.value) FROM json_each(halls.amenities) AS j WHERE j.value != ?)
			  WHERE org_id = ? AND json_valid(amenities) AND json_type(amenities) = 'array'
			    AND EXISTS (SELECT 1 FROM json_each(halls.amenities) AS j WHERE j.value = ?)`,
			row.slug, orgId, row.slug);
		return { amenityRemoved: row.slug };
	},

	saveProfile: async ({ request, params, locals, platform }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		const e = st(locals.locale).serverErrors;
		const current = await dbFirst<{
			slug: string | null; cover_image_url: string | null; gallery_images: string | null;
			plan_locked: number; archived_at: string | null;
		}>(locals.db,
			'SELECT slug, cover_image_url, gallery_images, plan_locked, archived_at FROM halls WHERE id = ? AND org_id = ?',
			params.id, org.id);
		if (!current) error(404, 'Not found');
		const data = await request.formData();

		const name        = String(data.get('name') ?? '').trim();
		const maxPeople   = Number(data.get('maxPeople') ?? 100);
		const color       = String(data.get('color') ?? '#f05ca1').trim();
		const description = String(data.get('description') ?? '').trim() || null;
		const address     = String(data.get('address') ?? '').trim() || null;
		const chosen      = parseCoordinates(data.get('latitude'), data.get('longitude'));
		if (!chosen) return fail(400, { profileError: locals.locale === 'en' ? 'Choose a valid location on the map.' : 'Vyberte platnú polohu na mape.' });

		if (!name) return fail(400, { profileError: e.hallNameRequired });
		if (!Number.isFinite(maxPeople) || maxPeople < 1) return fail(400, { profileError: e.capacityAtLeastOne });

		const isPublic = data.get('isPublic') === 'on';

		// The public URL. Every hall has one from the day it is created; the field is
		// shown while the hall is listed. Left empty, it is derived from the name;
		// not posted at all (field hidden), the hall keeps the one it has. A typed slug
		// is never silently changed — a clash or a reserved word is reported (B140).
		const slugPosted = data.has('slug');
		const typedSlug = hallSlug(data.get('slug'));
		const fallback = locals.locale === 'en' ? 'hall' : 'sala';
		let slug: string;
		if (typedSlug) {
			if (isReservedHallSlug(typedSlug)) return fail(400, { profileError: e.slugReserved });
			if (await hallSlugTaken(locals.db, typedSlug, params.id)) {
				const free = await uniqueHallSlug(locals.db, typedSlug, params.id, fallback);
				return fail(400, { profileError: e.slugTakenTry(free), slugSuggestion: free });
			}
			slug = typedSlug;
		} else if (!slugPosted && current.slug) {
			slug = current.slug;
		} else {
			slug = await uniqueHallSlug(locals.db, name, params.id, fallback);
		}

		// A listed hall needs an address to place it; its URL always exists now. A
		// cover image is strongly recommended and the editor says so loudly, but it
		// does not block the save — a venue with no photo listed beats one not listed.
		if (isPublic && !address) return fail(400, { profileError: e.addressRequiredForPublic });

		const priceBand = parsePriceBand(data.get('priceBand'));
		if (priceBand === 'invalid') return fail(400, { profileError: e.invalidPriceBand });

		// A client can post any amenity string; only the built-in keys and this
		// organisation's own slugs are allowed to reach the column.
		let ownSlugs: string[] = [];
		try {
			ownSlugs = (await dbAll<{ slug: string }>(
				locals.db, 'SELECT slug FROM org_amenities WHERE org_id = ?', org.id
			)).map((row) => row.slug);
		} catch {
			ownSlugs = [];
		}
		const allowedAmenities = new Set<string>([...BUILT_IN_AMENITIES, ...ownSlugs]);
		const amenities = [...new Set(data.getAll('amenities').map(String))].filter((a) => allowedAmenities.has(a));

		// Photos. New ones must be in our own storage: the CSP serves images from this
		// origin only, so a pasted link to another site showed as a broken image (B62).
		// One already on the hall is kept as it is, so an old external cover does not
		// block every other save.
		const storedGallery = fromJsonArr(current.gallery_images).map(String);
		const kept = new Set([current.cover_image_url ?? '', ...storedGallery].filter(Boolean));
		const usable = (u: string) => isOwnHallImage(u) || kept.has(u);
		const coverImageUrl = String(data.get('coverImageUrl') ?? '').trim() || null;
		const galleryImages = [...new Set(data.getAll('galleryImages').map(String).map((u) => u.trim()).filter(Boolean))];
		if ((coverImageUrl && !usable(coverImageUrl)) || galleryImages.some((u) => !usable(u))) {
			return fail(400, { profileError: e.imageNotUploaded, profileTab: 'media' as const });
		}
		// The plan's gallery limit stops a gallery from growing past it. A gallery
		// already over it (after a downgrade) can still be saved, reordered or trimmed;
		// it just cannot take new photos until it is under the limit (B85).
		const planLimit = getPlan(locals.currentOrg!.subscription.plan).limits.maxGalleryImages;
		if (planLimit !== -1 && galleryImages.length > planLimit) {
			const adds = galleryImages.some((u) => !storedGallery.includes(u));
			if (adds || galleryImages.length > storedGallery.length) {
				return fail(400, { profileError: e.galleryLimit(planLimit), profileTab: 'media' as const });
			}
		}

		const pricingInfo = String(data.get('pricingInfo') ?? '').trim() || null;
		const contactPhone = String(data.get('contactPhone') ?? '').trim() || null;
		const contactEmail = String(data.get('contactEmail') ?? '').trim() || null;
		// Only an http(s) address may become a link on the venue site (B14).
		const websiteRaw = String(data.get('contactWebsite') ?? '').trim();
		const contactWebsite = websiteRaw ? hallWebsite(websiteRaw) : null;
		if (websiteRaw && !contactWebsite) return fail(400, { profileError: e.invalidWebsite });

		// All seven days are stored, with the defaults the editor shows for a day
		// nobody touched, so the public pages show what the console shows (B74).
		const openingHoursRaw = String(data.get('openingHours') ?? '{}');
		if (invalidOpeningDay(openingHoursRaw)) return fail(400, { profileError: e.openingHoursInvalid });
		const openingHours = completeOpeningHours(openingHoursRaw);

		// A hall suspended by a plan downgrade cannot be made public until the owner
		// reactivates it (which re-checks the active-hall limit).
		if (current.plan_locked && isPublic) {
			return fail(403, { profileError: e.hallSuspendedByPlan });
		}
		if (current.archived_at && isPublic) {
			return fail(403, { profileError: e.hallArchived });
		}

		// Geocode only an address that has no pin, and only after every cheap check
		// above has passed — a rejected save should not cost a network lookup.
		const coordinates = await coordinatesForSave(locals.db, address, chosen);

		await dbRun(
			locals.db,
			`UPDATE halls SET
				name = ?,
				max_people = ?,
				color = ?,
				description = ?,
				address = ?,
				latitude = ?,
				longitude = ?,
				is_public = ?,
				slug = ?,
				cover_image_url = ?,
				gallery_images = ?,
				amenities = ?,
				pricing_info = ?,
				price_band = ?,
				contact_phone = ?,
				contact_email = ?,
				contact_website = ?,
				opening_hours = ?
			WHERE id = ? AND org_id = ?`,
			name,
			maxPeople,
			color,
			description,
			address,
			coordinates.latitude,
			coordinates.longitude,
			isPublic ? 1 : 0,
			slug,
			coverImageUrl,
			toJson(galleryImages),
			toJson(amenities),
			pricingInfo,
			priceBand,
			contactPhone,
			contactEmail,
			contactWebsite,
			toJson(openingHours),
			params.id, org.id
		);

		// Photos taken off the hall stop being served once nothing else shows them (B152).
		const now = new Set([coverImageUrl ?? '', ...galleryImages]);
		const removed = hallImageUrls(current).filter((u) => !now.has(u));
		if (removed.length) await deleteUnusedHallImages(locals.db, platform?.env?.R2, removed);

		return { profileSuccess: true };
	},

	// Re-enable a hall that was suspended by a plan downgrade, if there's room
	// under the current plan's active-hall limit.
	reactivate: async ({ params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		await assertHallInOrg(locals.db, params.id, org.id);
		if (!(await canAddHall(locals.db, org.id, org.subscription.plan))) {
			const limit = getPlan(org.subscription.plan).limits.maxHalls;
			return fail(403, { lockError: st(locals.locale).serverErrors.hallReactivateLimitReached.replace('{limit}', String(limit)) });
		}
		// Restores the hall's visibility from before the lock (it used to stay a draft).
		await unlockHall(locals.db, org.id, params.id);
		return { reactivated: true };
	},

	/** The plan is full: suspend another active hall and reactivate this one in its
	 *  place, so an owner on a smaller plan chooses which hall stays open (B84). The
	 *  paused hall goes unlisted, as a downgrade leaves it, and can be swapped back. */
	swapActive: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		await assertHallInOrg(locals.db, params.id, org.id);
		const pauseId = String((await request.formData()).get('pauseHallId') ?? '');
		const other = await dbFirst<{ id: string }>(locals.db,
			'SELECT id FROM halls WHERE id = ? AND org_id = ? AND id != ? AND plan_locked = 0 AND archived_at IS NULL',
			pauseId, org.id, params.id);
		if (!other) return fail(400, { lockError: st(locals.locale).serverErrors.hallToPauseInvalid });
		await dbRun(locals.db, 'UPDATE halls SET plan_locked = 1, is_public = 0 WHERE id = ? AND org_id = ?', other.id, org.id);
		if (!(await canAddHall(locals.db, org.id, org.subscription.plan))) {
			// Still no room (the plan allows none, or it changed meanwhile): undo.
			await dbRun(locals.db, 'UPDATE halls SET plan_locked = 0 WHERE id = ? AND org_id = ?', other.id, org.id);
			const limit = getPlan(org.subscription.plan).limits.maxHalls;
			return fail(403, { lockError: st(locals.locale).serverErrors.hallReactivateLimitReached.replace('{limit}', String(limit)) });
		}
		await dbRun(locals.db, 'UPDATE halls SET plan_locked = 0 WHERE id = ? AND org_id = ?', params.id, org.id);
		return { reactivated: true, swapped: true };
	},

	// ─── Retiring a hall (see $lib/server/hall-archive) ───────────────────────

	/** Cancel every live upcoming booking at once, with one note to all the clients. */
	cancelAllReservations: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		const hall = await dbFirst<{ id: string; name: string }>(locals.db,
			'SELECT id, name FROM halls WHERE id = ? AND org_id = ?', params.id, org.id);
		if (!hall) error(404, 'Not found');
		const data = await request.formData();
		const message = String(data.get('message') ?? '').trim().slice(0, MAX_CANCEL_NOTE);
		const { cancelled } = await cancelHallReservations(locals.db, {
			orgId: org.id,
			hallId: hall.id,
			hallName: hall.name,
			actor: { id: locals.user!.id, name: `${locals.user!.first_name} ${locals.user!.last_name}` },
			message,
		});
		return { bulkCancelled: cancelled };
	},

	/** Archive: unlisted, closed to bookings, off the plan's hall count, history kept.
	 *  Refused while any live upcoming booking remains — those are cancelled first. */
	archive: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		const hall = await dbFirst<{ id: string; name: string; archived_at: string | null }>(locals.db,
			'SELECT id, name, archived_at FROM halls WHERE id = ? AND org_id = ?', params.id, org.id);
		if (!hall) error(404, 'Not found');
		if (hall.archived_at) return { archived: true };
		const data = await request.formData();
		if (String(data.get('confirmName') ?? '').trim() !== hall.name.trim()) {
			return fail(400, { archiveError: st(locals.locale).serverErrors.hallNameMismatch });
		}
		// Checked again here, not only on the page: a booking can land between the
		// operator loading it and pressing the button.
		const blocking = await blockingReservations(locals.db, hall.id);
		if (blocking.length > 0) {
			return fail(409, { archiveError: st(locals.locale).serverErrors.hallHasUpcomingReservations(blocking.length) });
		}
		await dbRun(locals.db,
			`UPDATE halls SET archived_at = datetime('now'), is_public = 0, allow_reservations = 0
			  WHERE id = ? AND org_id = ?`,
			hall.id, org.id);
		await dispatchWebhooks(locals.db, org.id, 'hall.archived', { hall_id: hall.id, name: hall.name });
		return { archived: true };
	},

	/** Bring an archived hall back. It returns unlisted and closed, the state a new
	 *  hall starts in, so nothing goes public until the operator says so. A hall that
	 *  would count toward the plan needs room under its limit. */
	restore: async ({ params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		const hall = await dbFirst<{ name: string; plan_locked: number; archived_at: string | null }>(locals.db,
			'SELECT name, plan_locked, archived_at FROM halls WHERE id = ? AND org_id = ?', params.id, org.id);
		if (!hall) error(404, 'Not found');
		if (!hall.archived_at) return { restored: true };
		if (!hall.plan_locked && !(await canAddHall(locals.db, org.id, org.subscription.plan))) {
			const limit = getPlan(org.subscription.plan).limits.maxHalls;
			return fail(403, { archiveError: st(locals.locale).serverErrors.hallRestoreLimitReached.replace('{limit}', String(limit)) });
		}
		await dbRun(locals.db, 'UPDATE halls SET archived_at = NULL WHERE id = ? AND org_id = ?', params.id, org.id);
		await dispatchWebhooks(locals.db, org.id, 'hall.restored', { hall_id: params.id, name: hall.name });
		return { restored: true };
	},

	/** Permanent deletion, only for a hall nobody has ever booked (one created by
	 *  mistake). Anything with history is archived instead. */
	deleteHall: async ({ request, params, locals, platform }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		const hall = await dbFirst<{ id: string; name: string; cover_image_url: string | null; gallery_images: string | null }>(locals.db,
			'SELECT id, name, cover_image_url, gallery_images FROM halls WHERE id = ? AND org_id = ?', params.id, org.id);
		if (!hall) error(404, 'Not found');
		const data = await request.formData();
		if (String(data.get('confirmName') ?? '').trim() !== hall.name.trim()) {
			return fail(400, { archiveError: st(locals.locale).serverErrors.hallNameMismatch });
		}
		if (!(await hallIsUnused(locals.db, hall.id))) {
			return fail(409, { archiveError: st(locals.locale).serverErrors.hallHasHistory });
		}
		// Its own rows (table types, templates, blocks, extras, holds) go with it by
		// ON DELETE CASCADE, which D1 enforces.
		await dbRun(locals.db, 'DELETE FROM halls WHERE id = ? AND org_id = ?', hall.id, org.id);
		// Its photos stop being served too, unless something else still shows them (B152).
		await deleteUnusedHallImages(locals.db, platform?.env?.R2, hallImageUrls(hall));
		await dispatchWebhooks(locals.db, org.id, 'hall.deleted', { hall_id: hall.id, name: hall.name });
		// The list says it happened (I15).
		redirect(303, '/app/manage/halls?deleted=1');
	},

	/** Ask Hallify to survey the venue and draw the plan.
	 *
	 *  Quote-only by design: the price depends on size, access and travel, so this
	 *  records an enquiry and notifies us. It charges nothing and promises no
	 *  figure — a number shown here would be one we cannot stand behind. */
	requestFloorplanService: async ({ request, locals }) => {
		// A paid add-on is ordered by someone who manages the organisation's settings.
		await requireOrgPermission(locals, 'settings.manage');
		const org = await requireOrgPermission(locals, 'halls.manage');
		const user = locals.user!;
		const data = await request.formData();
		const hallId = String(data.get('hallId') ?? '');
		const note = String(data.get('note') ?? '').trim().slice(0, 1000);

		// Scope to the caller's org: an id alone must not reach another org's hall.
		const hall = await dbFirst<{ id: string; name: string }>(locals.db,
			'SELECT id, name FROM halls WHERE id = ? AND org_id = ?', hallId, org.id);
		if (!hall) return fail(404, { fpError: st(locals.locale).serverErrors.hallNotFound });

		// One open request per hall; asking twice should not make a second queue entry.
		const existing = await dbFirst<{ id: string }>(locals.db,
			`SELECT id FROM floorplan_requests
			  WHERE hall_id = ? AND status IN ${OPEN_MAPPING} LIMIT 1`, hall.id);
		if (existing) return { floorplanRequested: true };

		await dbRun(locals.db,
			`INSERT INTO floorplan_requests (id, org_id, hall_id, requested_by, note)
			 VALUES (?, ?, ?, ?, ?)`,
			crypto.randomUUID(), org.id, hall.id, user.id, note || null);

		// Reaches us, not the organisation's own inbox. A failure here must not lose
		// the request — it is already recorded and visible in the platform queue.
		// Every name in it was typed by a customer, so all of it is escaped (B170).
		try {
			await sendEmail(
				locals.db,
				OPERATOR.contactEmail,
				`Floor plan mapping request — ${org.name}`,
				`<p><strong>${esc(org.name)}</strong> asked us to map a venue.</p>
				 <p>Venue: ${esc(hall.name)}<br>Requested by: ${esc(user.first_name)} ${esc(user.last_name)} (${esc(user.email)})</p>
				 <p>${note ? esc(note) : 'No additional notes.'}</p>`,
				'floorplan-request'
			);
		} catch {
			/* recorded regardless */
		}

		return { floorplanRequested: true };
	},

	/** Withdraw a mapping request we have not delivered yet (M25). We are told, so
	 *  nobody turns up for a visit that is no longer wanted. */
	cancelFloorplanRequest: async ({ request, params, locals }) => {
		await requireOrgPermission(locals, 'settings.manage');
		const org = await requireOrgPermission(locals, 'halls.manage');
		const user = locals.user!;
		const hall = await dbFirst<{ id: string; name: string }>(locals.db,
			'SELECT id, name FROM halls WHERE id = ? AND org_id = ?', params.id, org.id);
		if (!hall) error(404, 'Not found');
		const id = String((await request.formData()).get('id') ?? '');
		const res = await dbRun(locals.db,
			`UPDATE floorplan_requests SET status = 'cancelled', updated_at = datetime('now')
			  WHERE id = ? AND org_id = ? AND hall_id = ? AND status IN ${OPEN_MAPPING}`,
			id, org.id, hall.id);
		if (!res.meta?.changes) return fail(409, { fpError: st(locals.locale).serverErrors.floorplanRequestClosed });
		try {
			await sendEmail(
				locals.db,
				OPERATOR.contactEmail,
				`Floor plan mapping request withdrawn — ${org.name}`,
				`<p><strong>${esc(org.name)}</strong> withdrew their request to map a venue.</p>
				 <p>Venue: ${esc(hall.name)}<br>Withdrawn by: ${esc(user.first_name)} ${esc(user.last_name)} (${esc(user.email)})</p>`,
				'floorplan-request'
			);
		} catch {
			/* the queue shows it as cancelled regardless */
		}
		return { floorplanCancelled: true };
	},
};
