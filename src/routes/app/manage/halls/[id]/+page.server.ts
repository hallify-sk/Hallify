import { error, fail, redirect } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun, toJson, fromJson, fromJsonArr } from '$lib/db/index';
import type { HallRow, HallBlockRow, TemplateRow, TableTypeRow, ReservationRow, HallExtraRow } from '$lib/db/index';
import { getPlan } from '$lib/plans';
import { canAddHall, canAddExtra } from '$lib/limits';
import { serializeEventTypes } from '$lib/eventTypes';
import { st } from '$lib/i18n-server';
import type { Actions, PageServerLoad } from './$types';
import { sendEmail } from '$lib/email';
import { OPERATOR } from '$lib/legal';
import { requireOrgPermission } from '$lib/server/access';
import { parseCoordinates } from '$lib/venue-location';
import { geocodeAddress } from '$lib/server/geocode';

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

/** The ten amenities the app translates itself. Anything else a hall claims must be
 *  one of the organisation's own rows — a client can post any string it likes. */
const BUILT_IN_AMENITIES = [
	'parking', 'catering', 'av', 'wifi', 'ac',
	'accessible', 'outdoor', 'stage', 'dancefloor', 'bar'
] as const;

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

type ParsedTableType = {
	name: string; shape: 'rect' | 'round';
	width: number; height: number; radius: number;
	maxChairs: number; amount: number; color: string;
};

// Parse + validate + clamp a table-type form payload (shared by add & update).
function parseTableType(data: FormData, locale: 'sk' | 'en'): ParsedTableType | { error: string } {
	const name = String(data.get('name') ?? '').trim();
	if (!name) return { error: st(locale).serverErrors.nameRequired };
	const shape = String(data.get('shape') ?? 'rect') === 'round' ? 'round' : 'rect';
	const width = clamp(Number(data.get('width') ?? 2), 0.5, 10, 2);
	const height = clamp(Number(data.get('height') ?? 1), 0.5, 10, 1);
	const radius = clamp(Number(data.get('radius') ?? 1), 0.3, 5, 1);
	const maxChairs = Math.round(clamp(Number(data.get('maxChairs') ?? 8), 1, 40, 8));
	const amount = Math.round(clamp(Number(data.get('amount') ?? 0), 0, 200, 0));
	let color = String(data.get('color') ?? '#92400e').trim();
	if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = '#92400e';
	return { name, shape, width, height, radius, maxChairs, amount, color };
}

export const load: PageServerLoad = async ({ params, locals }) => {
	await requireOrgPermission(locals, 'halls.manage');
	const orgId = locals.currentOrg!.id;
	// price_band arrived with 0006 and is not on HallRow yet; widen it here rather
	// than wait for the shared type.
	const hall = await dbFirst<HallRow & { price_band: number | null }>(
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
	const reservations = await dbAll<Pick<ReservationRow, 'id' | 'title' | 'event_date'>>(
		locals.db,
		"SELECT id, title, event_date FROM reservations WHERE hall_id = ? AND status != 'cancelled' ORDER BY event_date",
		params.id
	);

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
	// The mapping add-on. Only the latest request matters to the page: it decides
	// whether to offer the option or report that we are already on it.
	let floorplanRequest: { id: string; status: string; created_at: string } | null = null;
	try {
		floorplanRequest = await dbFirst<{ id: string; status: string; created_at: string }>(
			locals.db,
			`SELECT id, status, created_at FROM floorplan_requests
			  WHERE hall_id = ? AND status NOT IN ('delivered', 'cancelled')
			  ORDER BY created_at DESC LIMIT 1`,
			hall.id);
	} catch {
		// Table arrives with migration 0008; absent is simply "never requested".
	}

	return { hall, templates, blocks, tableTypes, reservations, extras, plan, orgAmenities, floorplanRequest };
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
		const name = String(data.get('name') ?? '').trim();
		const description = String(data.get('description') ?? '').trim();
		const maxPeople = Number(data.get('maxPeople') ?? 100);
		// saveProfile validates this; this action did not, and a hall with max_people<=0
		// silently loses server-side capacity enforcement.
		if (!Number.isFinite(maxPeople) || maxPeople < 1) {
			return fail(400, { error: st(locals.locale).serverErrors.chooseValidDate });
		}
		const color = String(data.get('color') ?? '#f05ca1').trim();
		const allowReservations = data.get('allowReservations') === 'on';
		const customLayouts = data.get('customLayouts') === 'on';
		const forceLayouts = data.get('forceLayouts') === 'on';
		const allowFeedback = data.get('allowFeedback') === 'on';
		const minDaysAdvance = Number(data.get('minDaysAdvance') ?? 0);
		const address = String(data.get('address') ?? '').trim();
		const chosen = parseCoordinates(data.get('latitude'), data.get('longitude'));
		if (!chosen) return fail(400, { infoError: locals.locale === 'en' ? 'Choose a valid location on the map.' : 'Vyberte platnú polohu na mape.' });
		const coordinates = await coordinatesForSave(locals.db, address || null, chosen);
		const preReservationText = String(data.get('preReservationText') ?? '').trim();
		const autoApprove = data.get('autoApprove') === 'on';
		const minCancelDays = Number(data.get('minCancelDays') ?? 0);
		if (!name) return fail(400, { infoError: st(locals.locale).serverErrors.nameRequired });
		await dbRun(
			locals.db,
			`UPDATE halls SET
				name=?, description=?, max_people=?, color=?,
				allow_reservations=?, custom_layouts=?,
				force_layouts=?, allow_feedback=?,
				min_days_advance=?, address=?, latitude=?, longitude=?,
				pre_reservation_text=?, auto_approve=?,
				min_cancel_days=?
			WHERE id=? AND org_id=?`,
			name, description || null, maxPeople, color,
			allowReservations ? 1 : 0, customLayouts ? 1 : 0,
			forceLayouts ? 1 : 0, allowFeedback ? 1 : 0,
			minDaysAdvance, address || null, coordinates.latitude, coordinates.longitude,
			preReservationText || null, autoApprove ? 1 : 0,
			minCancelDays, params.id, org.id
		);
		return { infoSuccess: true };
	},

	saveFloorplan: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'floorplans.manage');
		await assertHallInOrg(locals.db, params.id, org.id);
		const data = await request.formData();
		const floorplanJson = String(data.get('floorplanJson') ?? '');
		if (!floorplanJson) return fail(400, { floorplanError: st(locals.locale).serverErrors.noData });
		await dbRun(locals.db, 'UPDATE halls SET floorplan_json=? WHERE id=? AND org_id=?', floorplanJson, params.id, org.id);
		return { floorplanSuccess: true };
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
		await assertHallInOrg(locals.db, params.id, org.id);
		const data = await request.formData();
		const blockType = String(data.get('blockType') ?? '') as 'date_range' | 'weekly';
		const dateFrom = String(data.get('dateFrom') ?? '') || null;
		const dateTo = String(data.get('dateTo') ?? '') || null;
		const daysRaw = data.getAll('days').map(Number);
		const days = daysRaw.length > 0 ? daysRaw : null;
		const reason = String(data.get('reason') ?? '').trim() || null;

		if (blockType === 'date_range' && (!dateFrom || !dateTo)) {
			return fail(400, { blockError: st(locals.locale).serverErrors.dateRangeRequiresBothDates });
		}
		if (blockType === 'weekly' && (!days || days.length === 0)) {
			return fail(400, { blockError: st(locals.locale).serverErrors.weeklyBlockRequiresDay });
		}

		const id = crypto.randomUUID();
		await dbRun(
			locals.db,
			'INSERT INTO hall_blocks (id, hall_id, block_type, date_from, date_to, days_of_week, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
			id, params.id, blockType, dateFrom, dateTo, toJson(days), reason
		);
		return { blockSuccess: true };
	},

	deleteBlock: async ({ request, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		await dbRun(locals.db,
			'DELETE FROM hall_blocks WHERE id = ? AND hall_id IN (SELECT id FROM halls WHERE org_id = ?)',
			id, org.id);
		return { success: true };
	},

	cancelEvents: async ({ request, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		const data = await request.formData();
		const ids = String(data.get('ids') ?? '').split(',').filter(Boolean);
		if (ids.length > 0) {
			for (const reservationId of ids) {
				await dbRun(locals.db,
					"UPDATE reservations SET status = 'cancelled' WHERE id = ? AND org_id = ?",
					reservationId, org.id);
			}
		}
		return { cancelSuccess: true };
	},

	addTableType: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		await assertHallInOrg(locals.db, params.id, org.id);
		const tt = parseTableType(await request.formData(), locals.locale);
		if ('error' in tt) return fail(400, { tableTypeError: tt.error });

		const id = crypto.randomUUID();
		await dbRun(
			locals.db,
			'INSERT INTO table_types (id, hall_id, name, shape, width, height, radius, max_chairs, amount, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
			id, params.id, tt.name, tt.shape, tt.width, tt.height, tt.radius, tt.maxChairs, tt.amount, tt.color
		);
		return { tableTypeSuccess: true };
	},

	updateTableType: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		await assertHallInOrg(locals.db, params.id, org.id);
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { tableTypeError: st(locals.locale).serverErrors.missingTableType });
		const tt = parseTableType(data, locals.locale);
		if ('error' in tt) return fail(400, { tableTypeError: tt.error });

		await dbRun(
			locals.db,
			`UPDATE table_types SET name=?, shape=?, width=?, height=?, radius=?, max_chairs=?, amount=?, color=?
			 WHERE id=? AND hall_id=?`,
			tt.name, tt.shape, tt.width, tt.height, tt.radius, tt.maxChairs, tt.amount, tt.color, id, params.id
		);
		return { tableTypeSuccess: true };
	},

	deleteTableType: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		await assertHallInOrg(locals.db, params.id, org.id);
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		await dbRun(locals.db, 'DELETE FROM table_types WHERE id=? AND hall_id=?', id, params.id);
		return { success: true };
	},

	// ─── Extras (bookable add-ons) ──────────────────────────────────────────
	addExtra: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		await assertHallInOrg(locals.db, params.id, org.id);
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const description = String(data.get('description') ?? '').trim() || null;
		const pricing = String(data.get('pricing') ?? 'fixed') === 'per_guest' ? 'per_guest' : 'fixed';
		const priceCents = Math.max(0, Math.round((Number(data.get('price')) || 0) * 100));
		if (!name) return fail(400, { extraError: st(locals.locale).serverErrors.nameRequired });
		if (!(await canAddExtra(locals.db, params.id, locals.currentOrg!.subscription.plan))) {
			const limit = getPlan(locals.currentOrg!.subscription.plan).limits.maxExtrasPerHall;
			return fail(403, { extraError: `Your plan allows ${limit} extra${limit === 1 ? '' : 's'} per hall. Upgrade to add more.` });
		}
		await dbRun(locals.db,
			'INSERT INTO hall_extras (id, hall_id, name, description, price_cents, pricing) VALUES (?, ?, ?, ?, ?, ?)',
			crypto.randomUUID(), params.id, name, description, priceCents, pricing);
		return { extraSuccess: true };
	},

	updateExtra: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		await assertHallInOrg(locals.db, params.id, org.id);
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const name = String(data.get('name') ?? '').trim();
		const description = String(data.get('description') ?? '').trim() || null;
		const pricing = String(data.get('pricing') ?? 'fixed') === 'per_guest' ? 'per_guest' : 'fixed';
		const priceCents = Math.max(0, Math.round((Number(data.get('price')) || 0) * 100));
		if (!id || !name) return fail(400, { extraError: st(locals.locale).serverErrors.nameRequired });
		await dbRun(locals.db,
			'UPDATE hall_extras SET name=?, description=?, price_cents=?, pricing=? WHERE id=? AND hall_id=?',
			name, description, priceCents, pricing, id, params.id);
		return { extraSuccess: true };
	},

	deleteExtra: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		await assertHallInOrg(locals.db, params.id, org.id);
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		await dbRun(locals.db, 'DELETE FROM hall_extras WHERE id=? AND hall_id=?', id, params.id);
		return { extraSuccess: true };
	},

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
		return { amenityRemoved: row.slug };
	},

	saveProfile: async ({ request, params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		await assertHallInOrg(locals.db, params.id, org.id);
		const data = await request.formData();

		const name        = String(data.get('name') ?? '').trim();
		const maxPeople   = Number(data.get('maxPeople') ?? 100);
		const color       = String(data.get('color') ?? '#f05ca1').trim();
		const description = String(data.get('description') ?? '').trim() || null;
		const address     = String(data.get('address') ?? '').trim() || null;
		const chosen      = parseCoordinates(data.get('latitude'), data.get('longitude'));
		if (!chosen) return fail(400, { profileError: locals.locale === 'en' ? 'Choose a valid location on the map.' : 'Vyberte platnú polohu na mape.' });

		if (!name) return fail(400, { profileError: st(locals.locale).serverErrors.hallNameRequired });
		if (!Number.isFinite(maxPeople) || maxPeople < 1) return fail(400, { profileError: st(locals.locale).serverErrors.capacityAtLeastOne });

		// Geocode only an address that has no pin, and only after the cheap checks
		// above have passed — a rejected save should not cost a network lookup.
		const coordinates = await coordinatesForSave(locals.db, address, chosen);

		const isPublic = data.get('isPublic') === 'on';
		const normalizeSlug = (value: string) => value.trim().toLowerCase()
			.normalize('NFD').replace(/[̀-ͯ]/g, '')
			.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
		const typedSlug = normalizeSlug(String(data.get('slug') ?? ''));
		// New halls arrive listed (migration 0006's note), so a hall can reach a save
		// with the toggle on and nothing typed in the URL field. Deriving the slug
		// from the name keeps that from being a dead end; a typed slug is never
		// touched, and only a derived one gets a numeric suffix to clear a clash.
		const derivedSlug = !typedSlug && isPublic ? normalizeSlug(name) : '';
		let slug = typedSlug || derivedSlug || null;
		const coverImageUrl = String(data.get('coverImageUrl') ?? '').trim() || null;

		// A listed hall needs the two things discovery cannot work without: an address
		// to place it and a URL to send people to. A cover image is strongly
		// recommended and the editor says so loudly, but it no longer blocks the save
		// — a venue with no photo listed is better than a venue not listed at all.
		if (isPublic) {
			if (!slug) return fail(400, { profileError: st(locals.locale).serverErrors.publicUrlRequired });
			if (!address) return fail(400, { profileError: st(locals.locale).serverErrors.addressRequiredForPublic });
		}

		const priceBand = parsePriceBand(data.get('priceBand'));
		if (priceBand === 'invalid') return fail(400, { profileError: st(locals.locale).serverErrors.invalidPriceBand });

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
		const galleryImages = data.getAll('galleryImages').map(String).filter(Boolean);
		const planLimit = getPlan(locals.currentOrg!.subscription.plan).limits.maxGalleryImages;
		if (planLimit !== -1 && galleryImages.length > planLimit) {
			return fail(400, { profileError: `Your plan allows up to ${planLimit} gallery images.` });
		}
		const pricingInfo = String(data.get('pricingInfo') ?? '').trim() || null;
		const contactPhone = String(data.get('contactPhone') ?? '').trim() || null;
		const contactEmail = String(data.get('contactEmail') ?? '').trim() || null;
		const contactWebsite = String(data.get('contactWebsite') ?? '').trim() || null;
		const openingHoursRaw = String(data.get('openingHours') ?? '{}');
		let openingHours: Record<string, unknown> = {};
		try { openingHours = JSON.parse(openingHoursRaw); } catch { openingHours = {}; }

		// The slug is the public URL (/halls/<slug>), so it has to be unique across
		// every organisation, not just this one — two orgs holding "grand-hall" would
		// send visitors to whichever row the lookup happened to return first.
		if (slug) {
			const isTaken = async (candidate: string) => !!(await dbFirst<{ id: string }>(
				locals.db, 'SELECT id FROM halls WHERE slug = ? AND id != ?', candidate, params.id
			));
			if (await isTaken(slug)) {
				if (!derivedSlug) return fail(400, { profileError: st(locals.locale).serverErrors.slugAlreadyTaken });
				let candidate = '';
				for (let n = 2; n < 200; n++) {
					candidate = `${derivedSlug}-${n}`;
					if (!(await isTaken(candidate))) break;
					candidate = '';
				}
				if (!candidate) return fail(400, { profileError: st(locals.locale).serverErrors.slugAlreadyTaken });
				slug = candidate;
			}
		}

		// A hall suspended by a plan downgrade cannot be made public until the owner
		// reactivates it (which re-checks the active-hall limit).
		const locked = await dbFirst<{ plan_locked: number }>(locals.db, 'SELECT plan_locked FROM halls WHERE id = ? AND org_id = ?', params.id, locals.currentOrg!.id);
		if (locked?.plan_locked && isPublic) {
			return fail(403, { profileError: st(locals.locale).serverErrors.hallSuspendedByPlan });
		}

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

		return { profileSuccess: true };
	},

	// Re-enable a hall that was suspended by a plan downgrade, if there's room
	// under the current plan's active-hall limit.
	reactivate: async ({ params, locals }) => {
		const org = await requireOrgPermission(locals, 'halls.manage');
		await assertHallInOrg(locals.db, params.id, org.id);
		const orgId = locals.currentOrg!.id;
		if (!(await canAddHall(locals.db, orgId, locals.currentOrg!.subscription.plan))) {
			const limit = getPlan(locals.currentOrg!.subscription.plan).limits.maxHalls;
			return fail(403, { error: `Your plan allows ${limit} active hall${limit === 1 ? '' : 's'}. Upgrade to reactivate more.` });
		}
		await dbRun(locals.db, 'UPDATE halls SET plan_locked = 0 WHERE id = ? AND org_id = ?', params.id, orgId);
		return { reactivated: true };
	},

	/** Ask Hallify to survey the venue and draw the plan.
	 *
	 *  Quote-only by design: the price depends on size, access and travel, so this
	 *  records an enquiry and notifies us. It charges nothing and promises no
	 *  figure — a number shown here would be one we cannot stand behind. */
	requestFloorplanService: async ({ request, locals }) => {
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
			  WHERE hall_id = ? AND status NOT IN ('delivered', 'cancelled') LIMIT 1`, hall.id);
		if (existing) return { floorplanRequested: true };

		await dbRun(locals.db,
			`INSERT INTO floorplan_requests (id, org_id, hall_id, requested_by, note)
			 VALUES (?, ?, ?, ?, ?)`,
			crypto.randomUUID(), org.id, hall.id, user.id, note || null);

		// Reaches us, not the organisation's own inbox. A failure here must not lose
		// the request — it is already recorded and visible in the platform queue.
		try {
			await sendEmail(
				locals.db,
				OPERATOR.contactEmail,
				`Floor plan mapping request — ${org.name}`,
				`<p><strong>${org.name}</strong> asked us to map a venue.</p>
				 <p>Venue: ${hall.name}<br>Requested by: ${user.first_name} ${user.last_name} (${user.email})</p>
				 <p>${note ? note.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string)) : 'No additional notes.'}</p>`,
				'floorplan-request'
			);
		} catch {
			/* recorded regardless */
		}

		return { floorplanRequested: true };
	},
};
