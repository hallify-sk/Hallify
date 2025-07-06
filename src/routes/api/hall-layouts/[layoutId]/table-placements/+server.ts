import { db } from '$lib/server/db.js';
import { tablePlacements, type NewTablePlacement, type TablePlacement } from '$lib/server/schema.js';
import { serializeNonPOJOs } from '$lib/util.js';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export async function GET({ params }) {
	try {
		const layoutId = parseInt(params.layoutId);
		if (isNaN(layoutId)) {
			return error(400, 'Invalid layout ID');
		}

		const placements = await db
			.select()
			.from(tablePlacements)
			.where(eq(tablePlacements.hallLayoutId, layoutId))
			.orderBy(tablePlacements.createdAt);

		return json(serializeNonPOJOs(placements) as TablePlacement[]);
	} catch (err) {
		console.error('Error fetching table placements:', err);
		return error(500, 'Failed to fetch table placements');
	}
}

export async function POST({ params, request }) {
	try {
		const layoutId = parseInt(params.layoutId);
		if (isNaN(layoutId)) {
			return error(400, 'Invalid layout ID');
		}

		const { name, description, tableData, thumbnail, userId, isPublic } = await request.json();

		if (!name || !tableData) {
			return error(400, 'Name and table data are required');
		}

		const newPlacement: NewTablePlacement = {
			name,
			description,
			hallLayoutId: layoutId,
			tableData,
			thumbnail,
			userId: userId || null,
			isPublic: isPublic !== false, // default to true unless explicitly false
			isDefault: false
		};

		const [placement] = await db
			.insert(tablePlacements)
			.values(newPlacement)
			.returning();

		return json(serializeNonPOJOs(placement) as TablePlacement);
	} catch (err) {
		console.error('Error creating table placement:', err);
		return error(500, 'Failed to create table placement');
	}
}
