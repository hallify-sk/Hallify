import { db } from '$lib/server/db.js';
import { hallLayouts, tablePlacements, halls } from '$lib/server/schema.js';
import { serializeNonPOJOs } from '$lib/util.js';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export const load = async ({ params }) => {
	const hallId = parseInt(params.id);
	const layoutId = parseInt(params.layoutId);
	
	if (isNaN(hallId) || isNaN(layoutId)) {
		return error(400, 'Invalid hall or layout ID');
	}

	// Get hall info
	const [hall] = await db
		.select()
		.from(halls)
		.where(eq(halls.id, hallId))
		.limit(1);

	if (!hall) {
		return error(404, 'Hall not found');
	}

	// Get layout info
	const [layout] = await db
		.select()
		.from(hallLayouts)
		.where(eq(hallLayouts.id, layoutId))
		.limit(1);

	if (!layout) {
		return error(404, 'Layout not found');
	}

	// If editing existing table placement
	let tablePlacement = null;
	if (params.tablePlacementId) {
		const tablePlacementId = parseInt(params.tablePlacementId);
		if (!isNaN(tablePlacementId)) {
			const [existingPlacement] = await db
				.select()
				.from(tablePlacements)
				.where(eq(tablePlacements.id, tablePlacementId))
				.limit(1);
			
			if (existingPlacement) {
				tablePlacement = serializeNonPOJOs(existingPlacement);
			}
		}
	}

	return {
		hall: serializeNonPOJOs(hall),
		layout: serializeNonPOJOs(layout),
		tablePlacement
	};
};
