import { fail, redirect } from '@sveltejs/kit';
import { loginUrl } from '$lib/login-redirect';
import { dbAll, fromJson, fromJsonArr } from '$lib/db/index';
import type { HallRow, HallBlockRow, TemplateRow } from '$lib/db/index';
import type { Actions, PageServerLoad } from './$types';
import { getTakenDates, getHeldDatesByOthers, earliestBookableISO, HOLD_MINUTES } from '$lib/availability';
import { st } from '$lib/i18n-server';
import { createReservation } from '$lib/server/reservations';

const RANGE_DAYS = 540; // how far ahead to compute taken/held for the picker

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, loginUrl(url));
	const orgId = locals.currentOrg?.id;

	const halls = await dbAll<Pick<HallRow,
		'id' | 'name' | 'description' | 'max_people' | 'auto_approve' | 'pre_reservation_text' |
		'allow_reservations' | 'custom_layouts' | 'force_layouts' | 'min_days_advance' | 'color' | 'slug' | 'cover_image_url'>>(
		locals.db,
		`SELECT id, name, description, max_people, auto_approve, pre_reservation_text, allow_reservations,
		        custom_layouts, force_layouts, min_days_advance, color, slug, cover_image_url
		 FROM halls WHERE org_id = ? AND archived_at IS NULL ORDER BY name`,
		orgId ?? null
	);

	const hallId = url.searchParams.get('hall');
	let blocks: HallBlockRow[] = [];
	let templates: TemplateRow[] = [];
	let takenDates: string[] = [];
	let heldDates: string[] = [];

	if (hallId && halls.some(h => h.id === hallId)) {
		const today = new Date();
		const fromISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
		const to = new Date(today); to.setDate(today.getDate() + RANGE_DAYS);
		const toISO = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, '0')}-${String(to.getDate()).padStart(2, '0')}`;

		blocks = await dbAll<HallBlockRow>(locals.db, 'SELECT * FROM hall_blocks WHERE hall_id = ?', hallId);
		templates = await dbAll<TemplateRow>(locals.db, 'SELECT * FROM floorplan_templates WHERE hall_id = ? ORDER BY name', hallId);
		takenDates = await getTakenDates(locals.db, hallId, fromISO, toISO);
		heldDates = await getHeldDatesByOthers(locals.db, hallId, locals.user.id);
	}

	const dateParam = url.searchParams.get('date');
	const selectedDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;

	return {
		halls: halls.map(h => ({
			...h,
			auto_approve: !!h.auto_approve,
			allow_reservations: !!h.allow_reservations,
			custom_layouts: !!h.custom_layouts,
			force_layouts: !!h.force_layouts,
			earliestDate: earliestBookableISO(h.min_days_advance),
		})),
		blocks: blocks.map(b => ({ ...b, days_of_week: fromJsonArr(b.days_of_week as string | null) })),
		templates: templates.map(t => ({ ...t, layout_json: fromJson(t.layout_json as string | null) })),
		selectedHallId: hallId,
		selectedDate,
		takenDates,
		heldDates,
		holdMinutes: HOLD_MINUTES,
	};
};

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		if (!locals.user) redirect(303, loginUrl(url));
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { error: st(locals.locale).serverErrors.noOrganizationSelected });

		const data = await request.formData();
		const hallId = String(data.get('hallId') ?? '');
		const eventDate = String(data.get('eventDate') ?? '');

		// Validation, availability and the insert all live in createReservation —
		// the manual-entry screen goes through the very same path.
		const created = await createReservation(locals, {
			orgId,
			hallId,
			title: String(data.get('title') ?? ''),
			description: String(data.get('description') ?? ''),
			eventDate,
			templateId: String(data.get('templateId') ?? ''),
			startTime: String(data.get('startTime') ?? ''),
			endTime: String(data.get('endTime') ?? ''),
			numGuests: parseInt(String(data.get('numGuests') ?? ''), 10) || null,
			eventType: String(data.get('eventType') ?? ''),
			eventTypeOther: String(data.get('eventTypeOther') ?? ''),
		});

		if (!created.ok) {
			return fail(created.status, { error: created.error, values: { hallId, eventDate } });
		}

		redirect(303, `/app/reservation/${created.id}`);
	}
};
