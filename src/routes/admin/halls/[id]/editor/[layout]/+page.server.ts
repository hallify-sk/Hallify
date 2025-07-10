import { db } from '$lib/server/db.js';
import { halls, plans, type Hall, type Plan } from '$lib/server/schema.js';
import { serializeNonPOJOs } from '$lib/util.js';
import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export const actions = {
    savePlan: async function ({ request, locals, params }) {
        if (!locals.user) {
            return fail(401, { message: 'Nie ste prihlásený.', validate: ['user'] });
        }
        
        const formData = await request.formData();
        const planData = formData.get('plan')?.toString();
        if (!planData) {
            return fail(400, { message: 'Neplatný plán.', validate: ['plan'] });
        }
        
        const preview = formData.get('screenshot')?.toString();
        if (!preview) {
            return fail(400, { message: 'Neplatný plán.', validate: ['screenshot'] });
        }
        
        const finished = formData.get('finished') === 'true';
        
        if (!preview.startsWith('data:image/png;base64,')) {
            return fail(400, { message: 'Neplatný plán.', validate: ['screenshot'] });
        }

            // Validate hall exists
            const hall = await db
                .select()
                .from(halls)
                .where(eq(halls.id, parseInt(params.id)))
                .limit(1);
                
            if (!hall[0]) {
                return fail(404, { message: 'Neplatná sála.', validate: ['hall'] });
            }

            if (params.layout === 'new') {
                // Create new plan
                const newPlan = await db
                    .insert(plans)
                    .values({
                        user_id: locals.user.id,
                        data: JSON.parse(planData),
                        preview,
                        finished
                    })
                    .returning();

                // Update hall to reference the new plan
                await db
                    .update(halls)
                    .set({ plan: newPlan[0].id })
                    .where(eq(halls.id, parseInt(params.id)));
                    
                // Redirect to edit the newly created plan
                throw redirect(303, `/admin/halls/${params.id}/editor/${newPlan[0].id}`);
            } else {
                // Update existing plan
                const planId = parseInt(params.layout);
                
                if (isNaN(planId)) {
                    return fail(400, { message: 'Neplatné ID plánu.', validate: ['layout'] });
                }
                
                // Verify the plan exists
                const existingPlan = await db
                    .select()
                    .from(plans)
                    .where(eq(plans.id, planId))
                    .limit(1);
                    
                if (!existingPlan[0]) {
                    return fail(404, { message: 'Plán nebol nájdený.', validate: ['plan'] });
                }
                
                // Update the existing plan
                await db
                    .update(plans)
                    .set({
                        data: JSON.parse(planData),
                        preview,
                        finished,
                        updated_at: new Date()
                    })
                    .where(eq(plans.id, planId));
                    
                return { success: true, planId: planId };
            }
       
    }
};

export const load = async function ({ params }) {
    try {
        // Get hall by ID
        const hall = await db
            .select()
            .from(halls)
            .where(eq(halls.id, parseInt(params.id)))
            .limit(1);

        if (!hall[0]) {
            return fail(404, { message: 'Neplatná sála.', validate: ['hall'] });
        }

        // Get plan by layout parameter
        let plan: Plan | null = null;
        let isNewPlan = false;
        
        if (params.layout === 'new') {
            isNewPlan = true;
        } else {
            const planId = parseInt(params.layout);
            
            if (isNaN(planId)) {
                return fail(400, { message: 'Neplatné ID plánu.', validate: ['layout'] });
            }
            
            const planResult = await db
                .select()
                .from(plans)
                .where(eq(plans.id, planId))
                .limit(1);
                
            if (!planResult[0]) {
                return fail(404, { message: 'Plán nebol nájdený.', validate: ['plan'] });
            }
            
            plan = planResult[0];
        }

        return {
            hall: serializeNonPOJOs(hall[0]) as Hall,
            plan: plan ? (serializeNonPOJOs(plan) as Plan) : null,
            isNewPlan
        };
    } catch (e) {
        console.error(e);
        return fail(500, { message: 'Chyba pri načítaní dát.', validate: ['server'] });
    }
};
