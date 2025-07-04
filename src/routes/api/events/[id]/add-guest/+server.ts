import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db.js';
import { events, eventInvitations, eventRegistrations } from '$lib/server/schema.js';
import { eq, and, count } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ params, request, locals }) => {
    const eventId = parseInt(params.id);
    
    if (isNaN(eventId)) {
        return json({ error: 'Invalid event ID' }, { status: 400 });
    }

    if (!locals.user) {
        return json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { name, email, phone, notes } = body;

        // Validate required fields
        if (!name || !name.trim()) {
            return json({ error: 'Meno hosťa je povinné' }, { status: 400 });
        }

        // Check if event exists and belongs to user
        const event = await db.select({
            id: events.id,
            userId: events.userId,
            allowInvitations: events.allowInvitations,
            invitationToken: events.invitationToken,
            maxParticipants: events.maxParticipants
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

        // Check capacity limits if maxParticipants is set
        if (event[0].maxParticipants) {
            // Count confirmed invitations
            const confirmedInvitations = await db.select({ count: count() })
                .from(eventInvitations)
                .where(
                    and(
                        eq(eventInvitations.eventId, eventId),
                        eq(eventInvitations.status, 'confirmed')
                    )
                );

            // Count registered users
            const registeredUsers = await db.select({ count: count() })
                .from(eventRegistrations)
                .where(
                    and(
                        eq(eventRegistrations.eventId, eventId),
                        eq(eventRegistrations.status, 'registered')
                    )
                );

            const currentParticipants = (confirmedInvitations[0]?.count || 0) + (registeredUsers[0]?.count || 0);

            if (currentParticipants >= event[0].maxParticipants) {
                return json({ 
                    error: `Nemôžete pridať viac hostí. Limit účastníkov (${event[0].maxParticipants}) je už naplnený.` 
                }, { status: 400 });
            }
        }

        // Add the guest to invitations table as manually added (confirmed status)
        await db.insert(eventInvitations).values({
            eventId,
            name: name.trim(),
            email: email?.trim() || null,
            phone: phone?.trim() || null,
            notes: notes?.trim() || null,
            status: 'confirmed',
            confirmedAt: new Date()
        });

        return json({ success: true });
    } catch (error) {
        console.error('Error adding guest:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
};
