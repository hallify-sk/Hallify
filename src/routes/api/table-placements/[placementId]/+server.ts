import { db } from '$lib/server/db.js';
import { tablePlacements, type TablePlacement } from '$lib/server/schema.js';
import { serializeNonPOJOs } from '$lib/util.js';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export async function GET({ params }) {
	try {
		const placementId = parseInt(params.placementId);
		if (isNaN(placementId)) {
			return error(400, 'Invalid placement ID');
		}

		const [placement] = await db
			.select()
			.from(tablePlacements)
			.where(eq(tablePlacements.id, placementId))
			.limit(1);

		if (!placement) {
			return error(404, 'Table placement not found');
		}

		return json(serializeNonPOJOs(placement) as TablePlacement);
	} catch (err) {
		console.error('Error fetching table placement:', err);
		return error(500, 'Failed to fetch table placement');
	}
}

export async function PUT({ params, request }) {
	try {
		const placementId = parseInt(params.placementId);
		if (isNaN(placementId)) {
			return error(400, 'Invalid placement ID');
		}

		const { name, description, tableData, thumbnail, isPublic } = await request.json();

		if (!name || !tableData) {
			return error(400, 'Name and table data are required');
		}

		const [placement] = await db
			.update(tablePlacements)
			.set({
				name,
				description,
				tableData,
				thumbnail,
				isPublic: isPublic !== false, // default to true unless explicitly false
				updatedAt: new Date()
			})
			.where(eq(tablePlacements.id, placementId))
			.returning();

		if (!placement) {
			return error(404, 'Table placement not found');
		}

		return json(serializeNonPOJOs(placement) as TablePlacement);
	} catch (err) {
		console.error('Error updating table placement:', err);
		return error(500, 'Failed to update table placement');
	}
}

export async function DELETE({ params }) {
	try {
		const placementId = parseInt(params.placementId);
		if (isNaN(placementId)) {
			return error(400, 'Invalid placement ID');
		}

		await db
			.delete(tablePlacements)
			.where(eq(tablePlacements.id, placementId));

		return json({ success: true });
	} catch (err) {
		console.error('Error deleting table placement:', err);
		return error(500, 'Failed to delete table placement');
	}
}
