import { db } from '$lib/server/db.js';
import { hallLayouts, type NewHallLayout, type HallLayout } from '$lib/server/schema.js';
import { serializeNonPOJOs } from '$lib/util.js';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export async function GET({ params }) {
	try {
		const hallId = parseInt(params.id);
		if (isNaN(hallId)) {
			return error(400, 'Invalid hall ID');
		}

		const layouts = await db
			.select()
			.from(hallLayouts)
			.where(eq(hallLayouts.hallId, hallId))
			.orderBy(hallLayouts.createdAt);

		return json(serializeNonPOJOs(layouts) as HallLayout[]);
	} catch (err) {
		console.error('Error fetching hall layouts:', err);
		return error(500, 'Failed to fetch hall layouts');
	}
}

export async function POST({ params, request }) {
	try {
		const hallId = parseInt(params.id);
		if (isNaN(hallId)) {
			return error(400, 'Invalid hall ID');
		}

		const { name, description, layoutData, thumbnail } = await request.json();

		if (!name || !layoutData) {
			return error(400, 'Name and layout data are required');
		}

		const newLayout: NewHallLayout = {
			name,
			description,
			hallId,
			layoutData,
			thumbnail,
			isDefault: false
		};

		const [layout] = await db
			.insert(hallLayouts)
			.values(newLayout)
			.returning();

		return json(serializeNonPOJOs(layout) as HallLayout);
	} catch (err) {
		console.error('Error creating hall layout:', err);
		return error(500, 'Failed to create hall layout');
	}
}
