import { db } from '$lib/server/db.js';
import { events, halls, plans, type Event, type Hall, type Plan } from '$lib/server/schema.js';
import { serializeNonPOJOs } from '$lib/util.js';
import { fail, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export const actions = {
    saveTableLayout: async function ({ request, locals, params }) {
        if (!locals.user) {
            return fail(401, { message: 'Nie ste prihlásený.', validate: ['user'] });
        }
        
        const formData = await request.formData();
        const tableLayoutData = formData.get('plan')?.toString();
        if (!tableLayoutData) {
            return fail(400, { message: 'Neplatné rozloženie stolov.', validate: ['plan'] });
        }

        try {
            // Get the event and verify the user has access
            const event = await db
                .select()
                .from(events)
                .where(eq(events.id, parseInt(params.id)))
                .limit(1);
                
            if (!event[0]) {
                return fail(404, { message: 'Event neexistuje.', validate: ['event'] });
            }

            // Check if user owns the event or is admin
            const userOwnsEvent = event[0].userId === locals.user.id;
            const isAdmin = locals.user.permission_id === 1; // Assuming 1 is admin permission
            
            if (!userOwnsEvent && !isAdmin) {
                return fail(403, { message: 'Nemáte oprávnenie upravovať toto rozloženie.', validate: ['permission'] });
            }

            // Update the event with the table layout data
            await db
                .update(events)
                .set({ 
                    tableLayoutData: JSON.parse(tableLayoutData),
                    updatedAt: new Date()
                })
                .where(eq(events.id, parseInt(params.id)));

            return { success: true };
        } catch (e) {
            console.error(e);
            return fail(500, { message: 'Chyba pri ukladaní rozloženia stolov.', validate: ['plan'] });
        }
    }
};

export const load = async function ({ params, locals }) {
    // Get event with its hall and hall's plan
    const eventWithHall = await db
        .select({
            event: events,
            hall: halls,
            plan: plans
        })
        .from(events)
        .leftJoin(halls, eq(events.hallId, halls.id))
        .leftJoin(plans, eq(halls.plan, plans.id))
        .where(eq(events.id, parseInt(params.id)))
        .limit(1);

    if (!eventWithHall[0]) {
        throw error(404, 'Event neexistuje.');
    }

    // Create a combined plan data structure
    // Use event's table layout if it exists, otherwise use hall's plan data
    let planData = null;
    if (eventWithHall[0].event.tableLayoutData) {
        // Event has its own table layout
        planData = {
            data: eventWithHall[0].event.tableLayoutData
        };
    } else if (eventWithHall[0].plan?.data) {
        // Use hall's plan data as base
        planData = eventWithHall[0].plan;
    }

    return {
        event: serializeNonPOJOs(eventWithHall[0].event) as Event,
        hall: eventWithHall[0].hall ? (serializeNonPOJOs(eventWithHall[0].hall) as Hall) : null,
        plan: planData ? serializeNonPOJOs(planData) as Plan : null,
        user: locals.user ? serializeNonPOJOs(locals.user) : null,
        permission: locals.user?.permission_id || null
    };
};
