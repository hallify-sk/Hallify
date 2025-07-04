import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { events, halls } from '$lib/server/schema.js';
import { eq, and } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ params, locals }) => {
    const eventId = parseInt(params.id);
    
    if (isNaN(eventId)) {
        return json({ error: 'Invalid event ID' }, { status: 400 });
    }

    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const event = await db.select({
            id: events.id,
            name: events.name,
            description: events.description,
            hallId: events.hallId,
            userId: events.userId,
            startDate: events.startDate,
            endDate: events.endDate,
            maxParticipants: events.maxParticipants,
            isPublic: events.isPublic,
            allowRegistration: events.allowRegistration,
            status: events.status,
            notes: events.notes,
            hallName: halls.name,
            hallColor: halls.color
        }).from(events)
        .leftJoin(halls, eq(events.hallId, halls.id))
        .where(
            and(
                eq(events.id, eventId),
                eq(events.userId, locals.user.id)
            )
        )
        .limit(1);

        if (event.length === 0) {
            return json({ error: 'Event not found' }, { status: 404 });
        }

        return json({ event: event[0] });
    } catch (error) {
        console.error('Error fetching event:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
    const eventId = parseInt(params.id);
    
    if (isNaN(eventId)) {
        return json({ error: 'Invalid event ID' }, { status: 400 });
    }

    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { name, description, eventDate, maxParticipants, isPublic, allowRegistration, notes } = body;

        // Validate required fields
        if (!name || !description || !eventDate) {
            return json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Check if event exists and belongs to user
        const existingEvent = await db.select({
            id: events.id,
            userId: events.userId,
            hallId: events.hallId
        }).from(events)
        .where(
            and(
                eq(events.id, eventId),
                eq(events.userId, locals.user.id)
            )
        )
        .limit(1);

        if (existingEvent.length === 0) {
            return json({ error: 'Event not found' }, { status: 404 });
        }

        // Parse and validate date
        const selectedDate = new Date(eventDate);
        if (isNaN(selectedDate.getTime())) {
            return json({ error: 'Invalid date format' }, { status: 400 });
        }

        // Set start time to beginning of day and end time to end of day
        const startDate = new Date(selectedDate);
        startDate.setHours(0, 0, 0, 0);
        
        const endDate = new Date(selectedDate);
        endDate.setHours(23, 59, 59, 999);

        // Check if the new date is available (excluding current event)
        const conflictingEvents = await db.select().from(events)
        .where(
            and(
                eq(events.hallId, existingEvent[0].hallId),
                // Exclude current event from conflict check
                // Since we're updating to full-day events, we just need to check the date
            )
        );

        // Filter out the current event and check for date conflicts
        const hasConflict = conflictingEvents.some(event => {
            if (event.id === eventId) return false; // Skip current event
            
            const eventStart = new Date(event.startDate);
            const eventEnd = new Date(event.endDate);
            eventStart.setHours(0, 0, 0, 0);
            eventEnd.setHours(23, 59, 59, 999);
            
            return (selectedDate >= eventStart && selectedDate <= eventEnd);
        });

        if (hasConflict) {
            return json({ error: 'Sála je v daný deň už obsadená' }, { status: 409 });
        }

        // Update the event
        await db.update(events)
        .set({
            name,
            description,
            startDate,
            endDate,
            maxParticipants: maxParticipants || null,
            isPublic: Boolean(isPublic),
            allowRegistration: Boolean(allowRegistration),
            notes: notes || null,
            updatedAt: new Date()
        })
        .where(eq(events.id, eventId));

        return json({ success: true });
    } catch (error) {
        console.error('Error updating event:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
    const eventId = parseInt(params.id);
    
    if (isNaN(eventId)) {
        return json({ error: 'Invalid event ID' }, { status: 400 });
    }

    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Check if event exists and belongs to user
        const existingEvent = await db.select().from(events)
        .where(
            and(
                eq(events.id, eventId),
                eq(events.userId, locals.user.id)
            )
        )
        .limit(1);

        if (existingEvent.length === 0) {
            return json({ error: 'Event not found' }, { status: 404 });
        }

        // Delete the event
        await db.delete(events).where(eq(events.id, eventId));

        return json({ success: true });
    } catch (error) {
        console.error('Error deleting event:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
