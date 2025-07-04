import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { events, eventInvitations } from '$lib/server/schema.js';
import { eq, and } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
    const eventId = parseInt(params.id);
    
    if (isNaN(eventId)) {
        return json({ error: 'Invalid event ID' }, { status: 400 });
    }

    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { invitationId } = body;

        // Validate required fields
        if (!invitationId) {
            return json({ error: 'Invitation ID is required' }, { status: 400 });
        }

        // Check if event exists and belongs to user
        const event = await db.select({
            id: events.id,
            userId: events.userId,
            allowInvitations: events.allowInvitations
        }).from(events)
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

        // Check if invitations are enabled for this event
        if (!event[0].allowInvitations) {
            return json({ error: 'Invitations are not enabled for this event' }, { status: 400 });
        }

        // Check if invitation exists and belongs to this event
        const invitation = await db.select({
            id: eventInvitations.id,
            eventId: eventInvitations.eventId
        }).from(eventInvitations)
        .where(
            and(
                eq(eventInvitations.id, invitationId),
                eq(eventInvitations.eventId, eventId)
            )
        )
        .limit(1);

        if (invitation.length === 0) {
            return json({ error: 'Invitation not found' }, { status: 404 });
        }

        // Delete the invitation
        await db.delete(eventInvitations).where(eq(eventInvitations.id, invitationId));

        return json({ success: true });
    } catch (error) {
        console.error('Error removing invitation:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
