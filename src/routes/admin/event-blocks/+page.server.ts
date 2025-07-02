import { db } from '$lib/server/db.js';
import {
    halls,
    plans,
    reservations,
    eventBlocks,
    type Hall,
    type Plan,
    type Reservation,
    type EventBlock
} from '$lib/server/schema.js';
import { serializeNonPOJOs } from '$lib/util';
import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export const actions = {
    createEventBlock: async ({ request }) => {
        const formData = await request.formData();
        
        const hallId = formData.get('hallId') as string;
        const startDate = formData.get('startDate') as string;
        const endDate = formData.get('endDate') as string;
        const reason = formData.get('reason') as string;

		console.log(startDate, endDate, hallId, reason);
        
        // Get selected days from checkboxes
        const selectedDays: string[] = [];
        const dayNames = ['pon', 'uto', 'str', 'stv', 'pia', 'sob', 'ned'];
        
        dayNames.forEach(day => {
            if (formData.get(day) === 'on') {
                selectedDays.push(day);
            }
        });

        // Validation
        const errors: string[] = [];
        
        if (!hallId) {
            errors.push('hallId');
        }
        
        if (!startDate) {
            errors.push('startDate');
        }
        
        if (!endDate) {
            errors.push('endDate');
        }
        
        if (!reason || reason.trim().length < 3) {
            errors.push('reason');
        }

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (start < today) {
            return fail(400, {
                message: 'Začiatočný dátum nemôže byť v minulosti',
                validate: errors
            });
        }

        if (end <= start) {
            return fail(400, {
                message: 'Konečný dátum musí byť po začiatočnom dátume',
                validate: errors
            });
        }

        if (errors.length > 0) {
            return fail(400, {
                message: 'Prosím vyplňte všetky požadované polia',
                validate: errors
            });
        }

        // Check if hall exists
        const hall = await db.select().from(halls).where(eq(halls.id, parseInt(hallId))).limit(1);
        
        if (hall.length === 0) {
            return fail(400, {
                message: 'Vybraná sála neexistuje',
                validate: ['hallId']
            });
        }

        // Calculate if it's a short period (< 7 days) or long period
        const diffTime = end.getTime() - start.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        const blockedDays = diffDays < 7 ? dayNames : selectedDays;

        try {
            // Create the event block
            await db.insert(eventBlocks).values({
                hallId: parseInt(hallId),
                startDate: startDate,
                endDate: endDate,
                reason: reason.trim(),
                blockedDays: blockedDays,
                type: 'temporary',
                isActive: true
            });

            return {
                success: true,
                message: 'Výluka bola úspešne vytvorená'
            };
        } catch (error) {
            console.error('Error creating event block:', error);
            return fail(500, {
                message: 'Chyba pri vytváraní výluky. Skúste to znova.',
                validate: []
            });
        }
    },

    updateEventBlock: async ({ request }) => {
        const formData = await request.formData();
        
        const eventBlockId = formData.get('eventBlockId') as string;
        const hallId = formData.get('hallId') as string;
        const startDate = formData.get('startDate') as string;
        const endDate = formData.get('endDate') as string;
        const reason = formData.get('edit-reason') as string; // FIX: Changed from 'reason' to 'edit-reason'
        
        // Get selected days from checkboxes - FIX: Use correct field names
        const selectedDays: string[] = [];
        const dayNames = ['pon', 'uto', 'str', 'stv', 'pia', 'sob', 'ned'];
        
        dayNames.forEach(day => {
            if (formData.get(`edit-${day}`) === 'on') {
                selectedDays.push(day);
            }
        });

        // Validation
        const errors: string[] = [];
        
        if (!eventBlockId) {
            return fail(400, {
                message: 'ID výluky je povinné',
                validate: []
            });
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
        
        if (!reason || reason.trim().length < 3) {
            errors.push('reason');
        }

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (start < today) {
            return fail(400, {
                message: 'Začiatočný dátum nemôže byť v minulosti',
                validate: errors
            });
        }

        if (end <= start) {
            return fail(400, {
                message: 'Konečný dátum musí byť po začiatočnom dátume',
                validate: errors
            });
        }

        if (errors.length > 0) {
            return fail(400, {
                message: 'Prosím vyplňte všetky požadované polia',
                validate: errors
            });
        }

        // Check if event block exists
        const existingBlock = await db.select().from(eventBlocks)
            .where(eq(eventBlocks.id, parseInt(eventBlockId)))
            .limit(1);
        
        if (existingBlock.length === 0) {
            return fail(400, {
                message: 'Výluka nebola nájdená',
                validate: []
            });
        }

        // Check if hall exists
        const hall = await db.select().from(halls).where(eq(halls.id, parseInt(hallId))).limit(1);
        
        if (hall.length === 0) {
            return fail(400, {
                message: 'Vybraná sála neexistuje',
                validate: ['hallId']
            });
        }

        // Calculate if it's a short period (< 7 days) or long period
        const diffTime = end.getTime() - start.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // FIX: Use selectedDays when period is long enough, otherwise use all days
        const blockedDays = diffDays < 7 ? dayNames : (selectedDays.length > 0 ? selectedDays : dayNames);

        try {
            // Update the event block
            await db.update(eventBlocks)
                .set({
                    hallId: parseInt(hallId),
                    startDate: startDate,
                    endDate: endDate,
                    reason: reason.trim(),
                    blockedDays: blockedDays,
                    updatedAt: new Date()
                })
                .where(eq(eventBlocks.id, parseInt(eventBlockId)));

            return {
                success: true,
                message: 'Výluka bola úspešne aktualizovaná'
            };
        } catch (error) {
            console.error('Error updating event block:', error);
            return fail(500, {
                message: 'Chyba pri aktualizácii výluky. Skúste to znova.',
                validate: []
            });
        }
    },

    deleteEventBlock: async ({ request }) => {
        const formData = await request.formData();
        const eventBlockId = formData.get('eventBlockId') as string;

        // Validation
        if (!eventBlockId) {
            return fail(400, {
                message: 'ID výluky je povinné',
                validate: []
            });
        }

        try {
            // Check if event block exists
            const existingBlock = await db.select().from(eventBlocks)
                .where(eq(eventBlocks.id, parseInt(eventBlockId)))
                .limit(1);
            
            if (existingBlock.length === 0) {
                return fail(400, {
                    message: 'Výluka nebola nájdená',
                    validate: []
                });
            }

            // Soft delete by setting isActive to false
            await db.update(eventBlocks)
                .set({
                    isActive: false,
                    updatedAt: new Date()
                })
                .where(eq(eventBlocks.id, parseInt(eventBlockId)));

            return {
                success: true,
                message: 'Výluka bola úspešne zmazaná'
            };
        } catch (error) {
            console.error('Error deleting event block:', error);
            return fail(500, {
                message: 'Chyba pri mazaní výluky. Skúste to znova.',
                validate: []
            });
        }
    },

    updatePermanentBlocks: async ({ request }) => {
        const formData = await request.formData();
        const permanentBlocksData = formData.get('permanentBlocks') as string;

        try {
            const permanentBlocks = JSON.parse(permanentBlocksData);

            // Update each hall's allowed days
            for (const [hallId, daySettings] of Object.entries(permanentBlocks)) {
                const allowedDays = Object.entries(daySettings as Record<string, boolean>)
                    .filter(([, allowed]) => allowed)
                    .map(([day]) => day);

                await db.update(halls)
                    .set({
                        allowedDays: allowedDays,
                        updatedAt: new Date()
                    })
                    .where(eq(halls.id, parseInt(hallId)));
            }

            return {
                success: true,
                message: 'Trvalé výluky boli úspešne aktualizované'
            };
        } catch (error) {
            console.error('Error updating permanent blocks:', error);
            return fail(500, {
                message: 'Chyba pri aktualizácii trvalých výluk. Skúste to znova.',
                validate: []
            });
        }
    }
};

export const load = async function () {
    // Get halls with their plans using a join
    const hallsWithPlans = await db
        .select({
            hall: halls,
            plan: plans
        })
        .from(halls)
        .leftJoin(plans, eq(halls.plan, plans.id));

    const allPlans = await db.select().from(plans);
    const allReservations = await db.select().from(reservations);
    const allEventBlocks = await db.select().from(eventBlocks).where(eq(eventBlocks.isActive, true));

    return {
        halls: serializeNonPOJOs(hallsWithPlans) as Array<{ hall: Hall; plan: Plan | null }>,
        plans: serializeNonPOJOs(allPlans) as Array<Plan>,
        reservations: serializeNonPOJOs(allReservations) as Array<Reservation>,
        eventBlocks: serializeNonPOJOs(allEventBlocks) as Array<EventBlock>
    };
};
