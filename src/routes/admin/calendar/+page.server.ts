import { db } from '$lib/server/db.js';
import { halls, events, eventBlocks, users } from '$lib/server/schema';
import { eq, desc } from 'drizzle-orm';

export const load = async function ({ locals }) {
    if (!locals.user) {
        return {
            halls: [],
            events: [],
            eventBlocks: [],
            user: null,
            permission: null
        };
    }
    
    const hallList = await db.select().from(halls);
    
    // Fetch all events with hall and user information for admin
    const allEvents = await db.select({
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
        hallColor: halls.color,
        userId: events.userId,
        userFirstName: users.first_name,
        userLastName: users.last_name
    })
    .from(events)
    .leftJoin(halls, eq(events.hallId, halls.id))
    .leftJoin(users, eq(events.userId, users.id))
    .orderBy(desc(events.startDate));

    // Fetch event blocks
    const allEventBlocks = await db.select({
        id: eventBlocks.id,
        hallId: eventBlocks.hallId,
        startDate: eventBlocks.startDate,
        endDate: eventBlocks.endDate,
        reason: eventBlocks.reason,
        blockedDays: eventBlocks.blockedDays,
        isActive: eventBlocks.isActive,
        hallName: halls.name,
        hallColor: halls.color
    })
    .from(eventBlocks)
    .leftJoin(halls, eq(eventBlocks.hallId, halls.id))
    .orderBy(desc(eventBlocks.startDate));

    return {
        halls: hallList,
        events: allEvents,
        eventBlocks: allEventBlocks,
        user: JSON.parse(JSON.stringify(locals.user)),
        permission: JSON.parse(JSON.stringify(locals.permission))
    };
};
