import { db } from '$lib/server/db.js';
import { events, halls, eventInvitations, eventRegistrations, users } from '$lib/server/schema.js';
import { eq, and } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params, locals }) => {
    const eventId = parseInt(params.id);
    
    if (isNaN(eventId)) {
        throw error(404, 'Event not found');
    }

    if (!locals.user) {
        throw error(401, 'Unauthorized');
    }

    try {
        // Get event details
        const eventData = await db.select({
            id: events.id,
            name: events.name,
            description: events.description,
            hallId: events.hallId,
            userId: events.userId,
            startDate: events.startDate,
            endDate: events.endDate,
            maxParticipants: events.maxParticipants,
            currentParticipants: events.currentParticipants,
            isPublic: events.isPublic,
            allowRegistration: events.allowRegistration,
            allowInvitations: events.allowInvitations,
            invitationToken: events.invitationToken,
            status: events.status,
            notes: events.notes,
            createdAt: events.createdAt,
            hallName: halls.name,
            hallColor: halls.color,
            hallCapacity: halls.capacity
        }).from(events)
        .leftJoin(halls, eq(events.hallId, halls.id))
        .where(
            and(
                eq(events.id, eventId),
                eq(events.userId, locals.user.id)
            )
        )
        .limit(1);

        if (eventData.length === 0) {
            throw error(404, 'Event not found');
        }

        const event = eventData[0];

        // Get registered users (if registration is enabled)
        const registrations = event.allowRegistration ? await db.select({
            id: eventRegistrations.id,
            status: eventRegistrations.status,
            registeredAt: eventRegistrations.registeredAt,
            notes: eventRegistrations.notes,
            userName: users.first_name,
            userLastName: users.last_name,
            userEmail: users.email
        }).from(eventRegistrations)
        .leftJoin(users, eq(eventRegistrations.userId, users.id))
        .where(eq(eventRegistrations.eventId, eventId)) : [];

        // Get invitations (if invitation management is enabled)
        const invitations = event.allowInvitations ? await db.select({
            id: eventInvitations.id,
            name: eventInvitations.name,
            email: eventInvitations.email,
            phone: eventInvitations.phone,
            status: eventInvitations.status,
            confirmedAt: eventInvitations.confirmedAt,
            notes: eventInvitations.notes
        }).from(eventInvitations)
        .where(eq(eventInvitations.eventId, eventId)) : [];

        return {
            event,
            registrations,
            invitations
        };
    } catch (err) {
        console.error('Error loading event:', err);
        throw error(500, 'Internal server error');
    }
};
