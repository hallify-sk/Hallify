import { db } from '$lib/server/db.js';
import { halls, events } from '$lib/server/schema';
import { eq, desc } from 'drizzle-orm';

export const load = async function ({ locals }) {
    if (!locals.user) {
        return {
            halls: [],
            events: [],
            user: null,
            permission: null
        };
    }
    
    const hallList = await db.select().from(halls).where(eq(halls.allow_reservations, true));
    
    // Fetch user's events with hall information
    const userEvents = await db.select({
        id: events.id,
        name: events.name,
        description: events.description,
        startDate: events.startDate,
        endDate: events.endDate,
        status: events.status,
        isPublic: events.isPublic,
        allowRegistration: events.allowRegistration,
        allowInvitations: events.allowInvitations,
        invitationToken: events.invitationToken,
        maxParticipants: events.maxParticipants,
        createdAt: events.createdAt,
        hallId: events.hallId,
        hallName: halls.name,
        hallCapacity: halls.capacity,
        hallColor: halls.color
    })
    .from(events)
    .leftJoin(halls, eq(events.hallId, halls.id))
    .where(eq(events.userId, locals.user.id))
    .orderBy(desc(events.startDate));

    return {
        halls: hallList,
        events: userEvents,
        user: JSON.parse(JSON.stringify(locals.user)),
        permission: JSON.parse(JSON.stringify(locals.permission))
    };
};
