import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { events, halls, users } from '$lib/server/schema.js';
import { eq, and, gte, lte, or } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const { hallId, startDate, endDate, blockedDays } = await request.json();
        
        if (!hallId || !startDate || !endDate) {
            return json({ error: 'Missing required parameters' }, { status: 400 });
        }

        const hallIdNum = parseInt(hallId);
        if (isNaN(hallIdNum)) {
            return json({ error: 'Invalid hall ID' }, { status: 400 });
        }

        // Check if hall exists
        const hall = await db.select().from(halls).where(eq(halls.id, hallIdNum)).limit(1);
        if (hall.length === 0) {
            return json({ error: 'Hall not found' }, { status: 404 });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);

        // Find all events in this hall that overlap with the proposed block period
        const conflictingEvents = await db
            .select({
                id: events.id,
                name: events.name,
                description: events.description,
                startDate: events.startDate,
                endDate: events.endDate,
                userName: users.first_name,
                userLastName: users.last_name,
                userEmail: users.email,
                maxParticipants: events.maxParticipants,
                currentParticipants: events.currentParticipants
            })
            .from(events)
            .innerJoin(users, eq(events.userId, users.id))
            .where(
                and(
                    eq(events.hallId, hallIdNum),
                    // Check for date range overlap
                    or(
                        // Event starts within block period
                        and(
                            gte(events.startDate, start),
                            lte(events.startDate, end)
                        ),
                        // Event ends within block period
                        and(
                            gte(events.endDate, start),
                            lte(events.endDate, end)
                        ),
                        // Event spans the entire block period
                        and(
                            lte(events.startDate, start),
                            gte(events.endDate, end)
                        )
                    )
                )
            );

        // Filter events by blocked days if specific days are provided
        let filteredEvents = conflictingEvents;
        
        if (blockedDays && Array.isArray(blockedDays) && blockedDays.length > 0) {
            // Map Slovak day abbreviations to JavaScript day indices
            const dayMapping: Record<string, number> = {
                'ned': 0, // Sunday
                'pon': 1, // Monday
                'uto': 2, // Tuesday
                'str': 3, // Wednesday
                'stv': 4, // Thursday
                'pia': 5, // Friday
                'sob': 6  // Saturday
            };

            const blockedDayIndices = blockedDays
                .map(day => dayMapping[day])
                .filter(index => index !== undefined);

            filteredEvents = conflictingEvents.filter(event => {
                const eventStart = new Date(event.startDate);
                const eventEnd = new Date(event.endDate);
                
                // Check each day of the event to see if it falls on a blocked day
                const currentDate = new Date(eventStart);
                while (currentDate <= eventEnd) {
                    const dayOfWeek = currentDate.getDay();
                    if (blockedDayIndices.includes(dayOfWeek)) {
                        return true; // This event conflicts with a blocked day
                    }
                    currentDate.setDate(currentDate.getDate() + 1);
                }
                return false;
            });
        }

        // Format the response
        const conflicts = filteredEvents.map(event => ({
            id: event.id,
            name: event.name,
            description: event.description,
            startDate: event.startDate,
            endDate: event.endDate,
            organizer: `${event.userName} ${event.userLastName}`,
            organizerEmail: event.userEmail,
            participants: `${event.currentParticipants || 0}${event.maxParticipants ? `/${event.maxParticipants}` : ''}`
        }));

        return json({
            hallId: hallIdNum,
            hallName: hall[0].name,
            blockStartDate: startDate,
            blockEndDate: endDate,
            blockedDays,
            conflictCount: conflicts.length,
            conflicts
        });

    } catch (error) {
        console.error('Error checking event conflicts:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
