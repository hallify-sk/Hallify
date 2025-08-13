import { db } from '$lib/server/db.js';
import { hallLayouts, halls } from '$lib/server/schema.js';
import { serializeNonPOJOs } from '$lib/util.js';
import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export const load = async ({ params, url }) => {
	const hallId = parseInt(params.id);
	if (isNaN(hallId)) {
		return error(400, 'Invalid hall ID');
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

	// If editing existing layout
	let layout = null;
	if (params.layoutId) {
		const layoutId = parseInt(params.layoutId);
		if (!isNaN(layoutId)) {
			const [existingLayout] = await db
				.select()
				.from(hallLayouts)
				.where(eq(hallLayouts.id, layoutId))
				.limit(1);
			
			if (existingLayout) {
				layout = serializeNonPOJOs(existingLayout);
			}
		}
	}

	// Get initial name and description from URL params (for new layouts)
	const name = url.searchParams.get('name') || '';
	const description = url.searchParams.get('description') || '';

	return {
		hall: serializeNonPOJOs(hall),
		layout,
		initialName: name,
		initialDescription: description
	};
};
