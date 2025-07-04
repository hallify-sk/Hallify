import { db } from '$lib/server/db.js';
import { halls, events } from '$lib/server/schema';
import { eq, desc } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';

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

export const actions = {
    createEvent: async ({ request, locals }) => {
        if (!locals.user) {
            return fail(401, {
                message: 'Musíte byť prihlásený na vytvorenie udalosti',
                validate: []
            });
        }

        const formData = await request.formData();
        
        const name = formData.get('name') as string;
        const description = formData.get('description') as string;
        const hallId = formData.get('hallId') as string;
        const eventDate = formData.get('eventDate') as string;
        const maxParticipants = formData.get('maxParticipants') as string;
        const isPublic = formData.get('isPublic') === 'on';
        const allowRegistration = formData.get('allowRegistration') === 'on';
        const allowInvitations = formData.get('allowInvitations') === 'on';

        // Validation
        const errors: string[] = [];
        
        if (!name || name.trim().length < 3) {
            errors.push('name');
        }
        
        if (!description || description.trim().length < 10) {
            errors.push('description');
        }
        
        if (!hallId) {
            errors.push('hallId');
        }
        
        if (!eventDate) {
            errors.push('eventDate');
        }

        // Validate date
        const eventDateTime = new Date(eventDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to start of today

        if (eventDateTime < today) {
            return fail(400, {
                message: 'Dátum udalosti nemôže byť v minulosti',
                validate: errors
            });
        }

        if (maxParticipants && (parseInt(maxParticipants) < 1 || parseInt(maxParticipants) > 10000)) {
            errors.push('maxParticipants');
        }

        if (errors.length > 0) {
            return fail(400, {
                message: 'Prosím vyplňte všetky požadované polia správne',
                validate: errors
            });
        }

        // Check if hall exists and allows reservations
        const hall = await db.select().from(halls)
            .where(eq(halls.id, parseInt(hallId)))
            .limit(1);
        
        if (hall.length === 0 || !hall[0].allow_reservations) {
            return fail(400, {
                message: 'Vybraná sála neexistuje alebo nie je dostupná pre rezervácie',
                validate: ['hallId']
            });
        }

        // Check hall capacity if maxParticipants is specified
        if (maxParticipants && parseInt(maxParticipants) > hall[0].capacity) {
            return fail(400, {
                message: `Maximálny počet účastníkov (${maxParticipants}) prekračuje kapacitu sály (${hall[0].capacity})`,
                validate: ['maxParticipants']
            });
        }

        try {
            // Create start and end datetime for the event (full day event)
            const startOfDay = new Date(eventDate);
            startOfDay.setHours(0, 0, 0, 0);
            
            const endOfDay = new Date(eventDate);
            endOfDay.setHours(23, 59, 59, 999);

            // Generate invitation token if invitations are enabled
            let invitationToken = null;
            if (allowInvitations) {
                invitationToken = crypto.randomUUID();
            }

            // Create the event
            const newEvent = await db.insert(events).values({
                name: name.trim(),
                description: description.trim(),
                hallId: parseInt(hallId),
                userId: locals.user.id,
                startDate: startOfDay,
                endDate: endOfDay,
                maxParticipants: maxParticipants ? parseInt(maxParticipants) : null,
                isPublic: isPublic,
                allowRegistration: allowRegistration,
                allowInvitations: allowInvitations,
                invitationToken: invitationToken,
                status: 'planned',
                createdAt: new Date(),
                updatedAt: new Date()
            }).returning();

            return {
                success: true,
                message: 'Udalosť bola úspešne vytvorená',
                eventId: newEvent[0].id
            };
        } catch (error) {
            console.error('Error creating event:', error);
            return fail(500, {
                message: 'Chyba pri vytváraní udalosti. Skúste to znova.',
                validate: []
            });
        }
    }
};
