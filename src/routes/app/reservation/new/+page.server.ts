import { fail, redirect } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun, fromJson, fromJsonArr } from '$lib/db/index';
import type { HallRow, HallBlockRow, TemplateRow } from '$lib/db/index';
import type { Actions, PageServerLoad } from './$types';
import { notifyNewReservation } from '$lib/email';
import { postSystemMessage } from '$lib/tickets';
import { assertCanBook, getTakenDates, getHeldDatesByOthers, releaseHold, earliestBookableISO, HOLD_MINUTES } from '$lib/availability';
import { st } from '$lib/i18n-server';

const RANGE_DAYS = 540; // how far ahead to compute taken/held for the picker

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/app/login');
	const orgId = locals.currentOrg?.id;

	const halls = await dbAll<Pick<HallRow,
		'id' | 'name' | 'description' | 'max_people' | 'auto_approve' | 'pre_reservation_text' |
		'allow_reservations' | 'custom_layouts' | 'force_layouts' | 'min_days_advance' | 'color' | 'slug' | 'cover_image_url'>>(
		locals.db,
		`SELECT id, name, description, max_people, auto_approve, pre_reservation_text, allow_reservations,
		        custom_layouts, force_layouts, min_days_advance, color, slug, cover_image_url
		 FROM halls WHERE org_id = ? ORDER BY name`,
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
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/app/login');
		const orgId = locals.currentOrg?.id;
		if (!orgId) return fail(403, { error: st(locals.locale).serverErrors.noOrganizationSelected });

		const data = await request.formData();
		const hallId = String(data.get('hallId') ?? '');
		const title = String(data.get('title') ?? '').trim();
		const description = String(data.get('description') ?? '').trim();
		const eventDate = String(data.get('eventDate') ?? '');
		const templateId = String(data.get('templateId') ?? '');
		const startTime = String(data.get('startTime') ?? '').trim() || null;
		const endTime = String(data.get('endTime') ?? '').trim() || null;
		const numGuests = parseInt(String(data.get('numGuests') ?? ''), 10) || null;

		if (!hallId || !title || !eventDate) {
			return fail(400, { error: st(locals.locale).serverErrors.fillAllRequiredFields, values: { hallId, eventDate } });
		}

		const hall = await dbFirst<HallRow>(locals.db, 'SELECT * FROM halls WHERE id = ? AND org_id = ?', hallId, orgId);
		if (!hall) return fail(400, { error: st(locals.locale).serverErrors.hallNotFound });

		if (hall.force_layouts && !templateId) {
			return fail(400, { error: st(locals.locale).serverErrors.layoutMustBeSelected, values: { hallId, eventDate } });
		}

		// All availability rules in one place (past/min-advance/blocked/taken/held/capacity).
		const check = await assertCanBook(locals.db, hall, eventDate, locals.user.id, numGuests, locals.locale);
		if (!check.ok) return fail(400, { error: check.reason, values: { hallId, eventDate } });

		let layoutJson: string | null = null;
		if (templateId) {
			const tmpl = await dbFirst<TemplateRow>(locals.db,
				'SELECT layout_json FROM floorplan_templates WHERE id = ? AND hall_id = ?', templateId, hallId);
			if (tmpl) layoutJson = tmpl.layout_json as string | null;
		}

		const initialStatus = hall.auto_approve ? 'approved' : 'pending';
		const newId = crypto.randomUUID();
		const inviteCode = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();

		try {
			await dbRun(locals.db,
				`INSERT INTO reservations (id, org_id, hall_id, user_id, title, description, event_date, start_time, end_time, layout_json, status, invite_code, num_guests)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				newId, orgId, hallId, locals.user.id, title, description || null, eventDate, startTime, endTime, layoutJson, initialStatus, inviteCode, numGuests
			);
		} catch {
			// Lost the one-per-hall-day unique index race.
			return fail(409, { error: st(locals.locale).serverErrors.dateJustTaken, values: { hallId } });
		}

		await releaseHold(locals.db, hallId, eventDate, locals.user.id);

		const userName = `${locals.user.first_name} ${locals.user.last_name}`;
		await postSystemMessage(locals.db, locals.user.id, title, `reservation_created:${initialStatus}:${userName}`, locals.user.id);
		notifyNewReservation(locals.db, orgId, title, userName, hall.name, eventDate).catch(() => {});

		redirect(303, `/app/reservation/${newId}`);
	}
};
