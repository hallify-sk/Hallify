import { db } from '$lib/server/db.js';
import { hallLayouts, halls } from '$lib/server/schema.js';
import { eq, and } from 'drizzle-orm';
import { json, error } from '@sveltejs/kit';
import { serializeNonPOJOs } from '$lib/util.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ params, locals }) => {
    const hallId = parseInt(params.id);
    
    if (isNaN(hallId)) {
        return error(400, 'Invalid hall ID');
    }

    if (!locals.user) {
        return error(401, 'Unauthorized');
    }

    try {
        // Verify hall exists
        const hallExists = await db.select({ id: halls.id })
            .from(halls)
            .where(eq(halls.id, hallId))
            .limit(1);

        if (hallExists.length === 0) {
            return error(404, 'Hall not found');
        }

        // Get available table layouts for this hall
        // Include layouts that are marked as templates/public
        const layouts = await db.select({
            id: hallLayouts.id,
            name: hallLayouts.name,
            layoutData: hallLayouts.layoutData,
            isDefault: hallLayouts.isDefault,
            createdAt: hallLayouts.createdAt,
            updatedAt: hallLayouts.updatedAt
        }).from(hallLayouts)
        .where(
            and(
                eq(hallLayouts.hallId, hallId),
                // Only return layouts that could serve as templates
                // For now, we'll return all layouts for this hall
            )
        )
        .orderBy(hallLayouts.createdAt);

        return json(serializeNonPOJOs(layouts));
    } catch (err) {
        console.error('Error fetching table layouts:', err);
        return error(500, 'Internal server error');
    }
};
