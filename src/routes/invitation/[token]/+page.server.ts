import { db } from '$lib/server/db.js';
import { events, halls, eventInvitations, eventRegistrations } from '$lib/server/schema.js';
import { eq, and, count } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';

export const load: PageServerLoad = async ({ params }) => {
    const { token } = params;
    
    if (!token) {
        throw error(404, 'Invitation not found');
    }

    // Find the event by invitation token
    const eventData = await db.select({
        id: events.id,
        name: events.name,
        description: events.description,
        startDate: events.startDate,
        endDate: events.endDate,
        maxParticipants: events.maxParticipants,
        currentParticipants: events.currentParticipants,
        allowInvitations: events.allowInvitations,
        hallName: halls.name,
        hallCapacity: halls.capacity,
        hallColor: halls.color
    })
    .from(events)
    .leftJoin(halls, eq(events.hallId, halls.id))
    .where(and(
        eq(events.invitationToken, token),
        eq(events.allowInvitations, true)
    ))
    .limit(1);

    if (eventData.length === 0) {
        throw error(404, 'Invitation not found or no longer valid');
    }

    const event = eventData[0];
    
    // Check if event is in the future
    const now = new Date();
    const eventDate = new Date(event.startDate);
    
    if (eventDate < now) {
        throw error(410, 'This event has already passed');
    }

    return {
        event,
        token
    };
};

export const actions: Actions = {
    confirmInvitation: async ({ request, params }) => {
        const { token } = params;
        
        if (!token) {
            return fail(400, {
                message: 'Invalid invitation token',
                success: false
            });
        }

        const formData = await request.formData();
        const name = formData.get('name') as string;
        const email = formData.get('email') as string;
        const phone = formData.get('phone') as string;

        // Validation
        if (!name || name.trim().length < 2) {
            return fail(400, {
                message: 'Meno musí mať aspoň 2 znaky',
                success: false,
                errors: ['name']
            });
        }

        // Find the event
        const eventData = await db.select({
            id: events.id,
            maxParticipants: events.maxParticipants,
            currentParticipants: events.currentParticipants,
            allowInvitations: events.allowInvitations
        })
        .from(events)
        .where(and(
            eq(events.invitationToken, token),
            eq(events.allowInvitations, true)
        ))
        .limit(1);

        if (eventData.length === 0) {
            return fail(404, {
                message: 'Pozvánka nebola nájdená alebo už nie je platná',
                success: false
            });
        }

        const event = eventData[0];

        // Check if event is full by counting actual participants
        if (event.maxParticipants) {
            // Count confirmed invitations
            const confirmedInvitations = await db.select({ count: count() })
                .from(eventInvitations)
                .where(
                    and(
                        eq(eventInvitations.eventId, event.id),
                        eq(eventInvitations.status, 'confirmed')
                    )
                );

            // Count registered users
            const registeredUsers = await db.select({ count: count() })
                .from(eventRegistrations)
                .where(
                    and(
                        eq(eventRegistrations.eventId, event.id),
                        eq(eventRegistrations.status, 'registered')
                    )
                );

            const currentParticipants = (confirmedInvitations[0]?.count || 0) + (registeredUsers[0]?.count || 0);

            if (currentParticipants >= event.maxParticipants) {
                return fail(400, {
                    message: 'Udalosť je už plne obsadená',
                    success: false
                });
            }
        }

        try {
            // Check if this person already confirmed (by name and email if provided)
            const existingInvitation = await db.select()
                .from(eventInvitations)
                .where(and(
                    eq(eventInvitations.eventId, event.id),
                    eq(eventInvitations.name, name.trim()),
                    email ? eq(eventInvitations.email, email.trim()) : undefined
                ))
                .limit(1);

            if (existingInvitation.length > 0) {
                return fail(400, {
                    message: 'Už ste potvrdili účasť na tejto udalosti',
                    success: false
                });
            }

            // Create the invitation confirmation
            await db.insert(eventInvitations).values({
                eventId: event.id,
                name: name.trim(),
                email: email?.trim() || null,
                phone: phone?.trim() || null,
                status: 'confirmed',
                confirmedAt: new Date()
            });

            return {
                success: true,
                message: 'Vaša účasť bola úspešne potvrdená!'
            };

        } catch (error) {
            console.error('Error confirming invitation:', error);
            return fail(500, {
                message: 'Nastala chyba pri potvrdzovaní účasti. Skúste to znova.',
                success: false
            });
        }
    }
};
