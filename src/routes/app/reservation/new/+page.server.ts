import { fail, redirect } from '@sveltejs/kit';
import sql from '$lib/db/index';
import type { HallRow, HallBlockRow, TemplateRow } from '$lib/db/index';
import type { Actions, PageServerLoad } from './$types';
import { notifyNewReservation } from '$lib/email';
import { postSystemMessage } from '$lib/tickets';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) redirect(303, '/app/login');

	const orgId = locals.currentOrg?.id;
	const halls = await sql<(Pick<HallRow, 'id' | 'name' | 'description' | 'max_people' | 'auto_approve' | 'pre_reservation_text' | 'allow_reservations' | 'color' | 'slug' | 'cover_image_url'>)[]>`
		SELECT id, name, description, max_people, auto_approve, pre_reservation_text, allow_reservations, color, slug, cover_image_url FROM halls
		WHERE org_id = ${orgId ?? null} ORDER BY name
	`;

	const hallId = url.searchParams.get('hall');
	let blocks: HallBlockRow[] = [];
	let templates: TemplateRow[] = [];
	let takenDates: string[] = [];

	if (hallId) {
		blocks = await sql<HallBlockRow[]>`
			SELECT * FROM hall_blocks WHERE hall_id = ${hallId}
		`;
		templates = await sql<TemplateRow[]>`
			SELECT * FROM floorplan_templates WHERE hall_id = ${hallId} ORDER BY name
		`;
		const taken = await sql<{ event_date: Date }[]>`
			SELECT event_date FROM reservations WHERE hall_id = ${hallId} AND status != 'cancelled'
		`;
		takenDates = taken.map(r => {
			const d = new Date(r.event_date);
			return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		});
	}

	return { halls, blocks, templates, selectedHallId: hallId, takenDates };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) redirect(303, '/app/login');

		const data = await request.formData();
		const hallId = String(data.get('hallId') ?? '');
		const title = String(data.get('title') ?? '').trim();
		const description = String(data.get('description') ?? '').trim();
		const eventDate = String(data.get('eventDate') ?? '');
		const templateId = String(data.get('templateId') ?? '');

		if (!hallId || !title || !eventDate) {
			return fail(400, { error: 'Vyplňte všetky povinné polia.' });
		}

		// Check hall exists and allows reservations
		const [hall] = await sql<HallRow[]>`SELECT * FROM halls WHERE id = ${hallId}`;
		if (!hall || !hall.allow_reservations) {
			return fail(400, { error: 'Táto sála nie je dostupná pre rezervácie.' });
		}

		// Check for blocked date
		const blocks = await sql<HallBlockRow[]>`
			SELECT * FROM hall_blocks WHERE hall_id = ${hallId}
		`;
		const d = new Date(eventDate);
		const dow = d.getDay();
		const blocked = blocks.some((b) => {
			if (b.block_type === 'weekly') return b.days_of_week?.includes(dow);
			if (b.block_type === 'date_range' && b.date_from && b.date_to) {
				return d >= new Date(b.date_from) && d <= new Date(b.date_to);
			}
			return false;
		});
		if (blocked) {
			return fail(400, { error: 'Sála nie je dostupná v zvolený dátum.' });
		}

		// Check date not already taken
		const [existing] = await sql<[{ count: string }]>`
			SELECT COUNT(*)::text AS count FROM reservations
			WHERE hall_id = ${hallId} AND event_date = ${eventDate} AND status != 'cancelled'
		`;
		if (Number(existing.count) > 0) {
			return fail(400, { error: 'Na tento dátum už existuje udalosť v tejto sále.' });
		}

		// Copy template layout if provided
		let layoutJson = null;
		if (templateId) {
			const [tmpl] = await sql<TemplateRow[]>`SELECT layout_json FROM floorplan_templates WHERE id = ${templateId}`;
			if (tmpl) layoutJson = tmpl.layout_json;
		}

		// Determine initial status: auto-approve if hall has it enabled
		const initialStatus = hall.auto_approve ? 'approved' : 'pending';

		const orgId = locals.currentOrg!.id;
		const [{ id }] = await sql<[{ id: string }]>`
			INSERT INTO reservations (org_id, hall_id, user_id, title, description, event_date, layout_json, status)
			VALUES (${orgId}, ${hallId}, ${locals.user.id}, ${title}, ${description || null}, ${eventDate}, ${layoutJson ? JSON.stringify(layoutJson) : null}, ${initialStatus})
			RETURNING id
		`;

		// Post system message about creation
		const userName = `${locals.user.first_name} ${locals.user.last_name}`;
		await postSystemMessage(
			locals.user.id,
			title,
			`reservation_created:${initialStatus}:${userName}`,
			locals.user.id
		);

		// Notify admins about new reservation
		notifyNewReservation(userName, title, hall.name, eventDate).catch(() => {});

		redirect(303, `/reservation/${id}`);
	}
};
