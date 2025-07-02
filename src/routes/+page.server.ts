import { db } from '$lib/server/db.js';
import { halls, events } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';

export const load = async function ({ locals }) {
    if (!locals.user) {
        return {
            halls: [],
            user: null,
            permission: null
        };
    }
    const hallList = await db.select().from(halls).where(eq(halls.allow_reservations, true));

    return {
        halls: hallList,
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
        const startDate = formData.get('startDate') as string;
        const endDate = formData.get('endDate') as string;
        const startTime = formData.get('startTime') as string;
        const endTime = formData.get('endTime') as string;
        const maxParticipants = formData.get('maxParticipants') as string;
        const isPublic = formData.get('isPublic') === 'on';
        const allowRegistration = formData.get('allowRegistration') === 'on';

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
        
        if (!startDate) {
            errors.push('startDate');
        }
        
        if (!endDate) {
            errors.push('endDate');
        }
        
        if (!startTime) {
            errors.push('startTime');
        }
        
        if (!endTime) {
            errors.push('endTime');
        }

        // Validate dates and times
        const start = new Date(`${startDate}T${startTime}`);
        const end = new Date(`${endDate}T${endTime}`);
        const now = new Date();

        if (start < now) {
            return fail(400, {
                message: 'Začiatočný dátum a čas nemôže byť v minulosti',
                validate: errors
            });
        }

        if (end <= start) {
            return fail(400, {
                message: 'Konečný dátum a čas musí byť po začiatočnom',
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
            // Create the event
            const newEvent = await db.insert(events).values({
                name: name.trim(),
                description: description.trim(),
                hallId: parseInt(hallId),
                userId: locals.user.id,
                startDate: start,
                endDate: end,
                maxParticipants: maxParticipants ? parseInt(maxParticipants) : null,
                isPublic: isPublic,
                allowRegistration: allowRegistration,
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
