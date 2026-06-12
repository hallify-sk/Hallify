import { error, fail } from '@sveltejs/kit';
import sql from '$lib/db/index';
import type { HallRow, HallBlockRow, TemplateRow, TableTypeRow, ReservationRow } from '$lib/db/index';
import { getPlan } from '$lib/plans';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = locals.currentOrg!.id;
	const [hall] = await sql<HallRow[]>`SELECT * FROM halls WHERE id = ${params.id} AND org_id = ${orgId}`;
	if (!hall) error(404, 'Hall not found');

	const templates = await sql<TemplateRow[]>`
		SELECT * FROM floorplan_templates WHERE hall_id = ${params.id} ORDER BY name
	`;
	const blocks = await sql<HallBlockRow[]>`
		SELECT * FROM hall_blocks WHERE hall_id = ${params.id} ORDER BY created_at
	`;
	const tableTypes = await sql<TableTypeRow[]>`
		SELECT * FROM table_types WHERE hall_id = ${params.id} ORDER BY name
	`;
	const reservations = await sql<Pick<ReservationRow, 'id' | 'title' | 'event_date'>[]>`
		SELECT id, title, event_date FROM reservations WHERE hall_id = ${params.id} AND status != 'cancelled' ORDER BY event_date
	`;

	const plan = getPlan(locals.currentOrg!.subscription.plan);
	return { hall, templates, blocks, tableTypes, reservations, plan };
};

export const actions: Actions = {
	saveInfo: async ({ request, params }) => {
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const description = String(data.get('description') ?? '').trim();
		const maxPeople = Number(data.get('maxPeople') ?? 100);
		const color = String(data.get('color') ?? '#3b82f6').trim();
		const allowReservations = data.get('allowReservations') === 'on';
		const customLayouts = data.get('customLayouts') === 'on';
		const forceLayouts = data.get('forceLayouts') === 'on';
		const allowFeedback = data.get('allowFeedback') === 'on';
		const minDaysAdvance = Number(data.get('minDaysAdvance') ?? 0);
		const address = String(data.get('address') ?? '').trim();
		const preReservationText = String(data.get('preReservationText') ?? '').trim();
		const autoApprove = data.get('autoApprove') === 'on';
		const minCancelDays = Number(data.get('minCancelDays') ?? 0);
		if (!name) return fail(400, { infoError: 'Name is required.' });
		await sql`UPDATE halls SET
			name=${name}, description=${description||null}, max_people=${maxPeople}, color=${color},
			allow_reservations=${allowReservations}, custom_layouts=${customLayouts},
			force_layouts=${forceLayouts}, allow_feedback=${allowFeedback},
			min_days_advance=${minDaysAdvance}, address=${address||null},
			pre_reservation_text=${preReservationText||null}, auto_approve=${autoApprove},
			min_cancel_days=${minCancelDays}
			WHERE id=${params.id}`;
		return { infoSuccess: true };
	},

	saveFloorplan: async ({ request, params }) => {
		const data = await request.formData();
		const floorplanJson = String(data.get('floorplanJson') ?? '');
		if (!floorplanJson) return fail(400, { floorplanError: 'No data.' });
		await sql`UPDATE halls SET floorplan_json=${floorplanJson}::jsonb WHERE id=${params.id}`;
		return { floorplanSuccess: true };
	},

	saveTemplate: async ({ request, params }) => {
		const data = await request.formData();
		const name = String(data.get('templateName') ?? '').trim();
		const eventType = String(data.get('eventType') ?? '').trim();
		const layoutJson = String(data.get('layoutJson') ?? '');
		if (!name || !layoutJson) return fail(400, { templateError: 'Name and layout are required.' });
		await sql`
			INSERT INTO floorplan_templates (hall_id, name, event_type, layout_json)
			VALUES (${params.id}, ${name}, ${eventType||null}, ${layoutJson}::jsonb)
		`;
		return { templateSuccess: true };
	},

	deleteTemplate: async ({ request }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		await sql`DELETE FROM floorplan_templates WHERE id=${id}`;
		return { success: true };
	},

	addBlock: async ({ request, params }) => {
		const data = await request.formData();
		const blockType = String(data.get('blockType') ?? '') as 'date_range' | 'weekly';
		const dateFrom = String(data.get('dateFrom') ?? '') || null;
		const dateTo = String(data.get('dateTo') ?? '') || null;
		const daysRaw = data.getAll('days').map(Number);
		const days = daysRaw.length > 0 ? daysRaw : null;
		const reason = String(data.get('reason') ?? '').trim() || null;

		if (blockType === 'date_range' && (!dateFrom || !dateTo)) {
			return fail(400, { blockError: 'Date range requires both from and to dates.' });
		}
		if (blockType === 'weekly' && (!days || days.length === 0)) {
			return fail(400, { blockError: 'Weekly block requires at least one day selected.' });
		}

		await sql`
			INSERT INTO hall_blocks (hall_id, block_type, date_from, date_to, days_of_week, reason)
			VALUES (${params.id}, ${blockType}, ${dateFrom}, ${dateTo}, ${days}, ${reason})
		`;
		return { blockSuccess: true };
	},

	deleteBlock: async ({ request }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		await sql`DELETE FROM hall_blocks WHERE id=${id}`;
		return { success: true };
	},

	cancelEvents: async ({ request }) => {
		const data = await request.formData();
		const ids = String(data.get('ids') ?? '').split(',').filter(Boolean);
		if (ids.length > 0) {
			await sql`UPDATE reservations SET status = 'cancelled' WHERE id = ANY(${ids})`;
		}
		return { cancelSuccess: true };
	},

	addTableType: async ({ request, params }) => {
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const shape = String(data.get('shape') ?? 'rect') as 'rect' | 'round';
		const width = Number(data.get('width') ?? 2);
		const height = Number(data.get('height') ?? 1);
		const radius = Number(data.get('radius') ?? 1);
		const maxChairs = Number(data.get('maxChairs') ?? 8);
		const amount = Number(data.get('amount') ?? 0);

		if (!name) return fail(400, { tableTypeError: 'Name is required.' });

		await sql`
			INSERT INTO table_types (hall_id, name, shape, width, height, radius, max_chairs, amount)
			VALUES (${params.id}, ${name}, ${shape}, ${width}, ${height}, ${radius}, ${maxChairs}, ${amount})
		`;
		return { tableTypeSuccess: true };
	},

	deleteTableType: async ({ request }) => {
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		await sql`DELETE FROM table_types WHERE id=${id}`;
		return { success: true };
	},

	saveProfile: async ({ request, params, locals }) => {
		const data = await request.formData();

		const name        = String(data.get('name') ?? '').trim();
		const maxPeople   = Number(data.get('maxPeople') ?? 100);
		const color       = String(data.get('color') ?? '#3b82f6').trim();
		const description = String(data.get('description') ?? '').trim() || null;
		const address     = String(data.get('address') ?? '').trim() || null;

		if (!name) return fail(400, { profileError: 'Hall name is required.' });

		const isPublic = data.get('isPublic') === 'on';
		const slugRaw = String(data.get('slug') ?? '').trim().toLowerCase()
			.normalize('NFD').replace(/[̀-ͯ]/g, '')
			.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
		const slug = slugRaw || null;
		const coverImageUrl = String(data.get('coverImageUrl') ?? '').trim() || null;
		const amenities = data.getAll('amenities').map(String);
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

		if (slug) {
			const [conflict] = await sql`SELECT id FROM halls WHERE slug = ${slug} AND id != ${params.id}`;
			if (conflict) return fail(400, { profileError: 'That URL slug is already taken — try a different one.' });
		}

		await sql`UPDATE halls SET
			name = ${name},
			max_people = ${maxPeople},
			color = ${color},
			description = ${description},
			address = ${address},
			is_public = ${isPublic},
			slug = ${slug},
			cover_image_url = ${coverImageUrl},
			gallery_images = ${JSON.stringify(galleryImages)}::jsonb,
			amenities = ${JSON.stringify(amenities)}::jsonb,
			pricing_info = ${pricingInfo},
			contact_phone = ${contactPhone},
			contact_email = ${contactEmail},
			contact_website = ${contactWebsite},
			opening_hours = ${JSON.stringify(openingHours)}::jsonb
		WHERE id = ${params.id}`;

		return { profileSuccess: true };
	}
};
