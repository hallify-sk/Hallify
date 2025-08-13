import { db } from '$lib/server/db.js';
import { events, hallLayouts } from '$lib/server/schema.js';
import { eq, and } from 'drizzle-orm';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ params, request, locals }) => {
    const eventId = parseInt(params.id);
    
    if (isNaN(eventId)) {
        return error(400, 'Invalid event ID');
    }

    if (!locals.user) {
        return error(401, 'Unauthorized');
    }

    try {
        const { layoutId } = await request.json();
        
        if (!layoutId || isNaN(parseInt(layoutId))) {
            return error(400, 'Invalid layout ID');
        }

        // Verify event exists and user owns it
        const eventData = await db.select({ 
            id: events.id, 
            userId: events.userId, 
            hallId: events.hallId 
        })
        .from(events)
        .where(
            and(
                eq(events.id, eventId),
                eq(events.userId, locals.user.id)
            )
        )
        .limit(1);

        if (eventData.length === 0) {
            return error(404, 'Event not found or access denied');
        }

        const event = eventData[0];

        // Verify layout exists and belongs to the same hall as the event
        const layoutData = await db.select({ 
            id: hallLayouts.id, 
            hallId: hallLayouts.hallId 
        })
        .from(hallLayouts)
        .where(eq(hallLayouts.id, parseInt(layoutId)))
        .limit(1);

        if (layoutData.length === 0) {
            return error(404, 'Layout not found');
        }

        const layout = layoutData[0];

        // Verify layout belongs to the same hall as the event
        if (layout.hallId !== event.hallId) {
            return error(400, 'Layout does not belong to the event hall');
        }

        // Update event with the layout ID
        await db.update(events)
            .set({ 
                layoutId: parseInt(layoutId),
                updatedAt: new Date()
            })
            .where(eq(events.id, eventId));

        return json({ success: true, layoutId: parseInt(layoutId) });
    } catch (err) {
        console.error('Error setting event layout:', err);
        return error(500, 'Internal server error');
    }
};
