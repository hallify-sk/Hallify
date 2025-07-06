import { db } from '$lib/server/db.js';
import { hallLayouts, type HallLayout } from '$lib/server/schema.js';
import { serializeNonPOJOs } from '$lib/util.js';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export async function GET({ params }) {
	try {
		const layoutId = parseInt(params.layoutId);
		if (isNaN(layoutId)) {
			return error(400, 'Invalid layout ID');
		}

		const [layout] = await db
			.select()
			.from(hallLayouts)
			.where(eq(hallLayouts.id, layoutId))
			.limit(1);

		if (!layout) {
			return error(404, 'Layout not found');
		}

		return json(serializeNonPOJOs(layout) as HallLayout);
	} catch (err) {
		console.error('Error fetching hall layout:', err);
		return error(500, 'Failed to fetch hall layout');
	}
}

export async function PUT({ params, request }) {
	try {
		const layoutId = parseInt(params.layoutId);
		if (isNaN(layoutId)) {
			return error(400, 'Invalid layout ID');
		}

		const { name, description, layoutData, thumbnail } = await request.json();

		if (!name || !layoutData) {
			return error(400, 'Name and layout data are required');
		}

		const [layout] = await db
			.update(hallLayouts)
			.set({
				name,
				description,
				layoutData,
				thumbnail,
				updatedAt: new Date()
			})
			.where(eq(hallLayouts.id, layoutId))
			.returning();

		if (!layout) {
			return error(404, 'Layout not found');
		}

		return json(serializeNonPOJOs(layout) as HallLayout);
	} catch (err) {
		console.error('Error updating hall layout:', err);
		return error(500, 'Failed to update hall layout');
	}
}

export async function DELETE({ params }) {
	try {
		const layoutId = parseInt(params.layoutId);
		if (isNaN(layoutId)) {
			return error(400, 'Invalid layout ID');
		}

		await db
			.delete(hallLayouts)
			.where(eq(hallLayouts.id, layoutId));

		return json({ success: true });
	} catch (err) {
		console.error('Error deleting hall layout:', err);
		return error(500, 'Failed to delete hall layout');
	}
}
