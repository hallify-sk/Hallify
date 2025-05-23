import { Hall, Plan } from "$lib/server/models";
import { serializeNonPOJOs } from "$lib/util.js";
import { fail } from "@sveltejs/kit";

export const actions = {
    savePlan: async function ({ request, locals, params }) {
        if(!locals.user) {
            return fail(401, { message: 'Nie ste prihlásený.', validate: ['user'] });
        }
        const formData = await request.formData();
        const planData = formData.get('plan')?.toString();
        if(!planData) {
            return fail(400, { message: 'Neplatný plán.', validate: ['plan'] });
        }
        const preview = formData.get('screenshot')?.toString();
        if(!preview) {
            return fail(400, { message: 'Neplatný plán.', validate: ['screenshot'] });
        }
        if(!preview.startsWith('data:image/png;base64,')) {
            return fail(400, { message: 'Neplatný plán.', validate: ['screenshot'] });
        }
        try{
            const plan = await Plan.create({
                user_id: locals.user?.id,
                data: JSON.parse(planData),
                preview
            });
            const hall = await Hall.findByPk(params.id);
            if(!hall) {
                return fail(404, { message: 'Neplatná sála.', validate: ['hall'] });
            }
            hall.setPlanData(plan);
            hall.save();
        } catch (e) {
            console.error(e);
            return fail(500, { message: 'Neplatný plán.', validate: ['plan'] });
        }

        return {success: true};
    }
};

export const load = async function ({ params }) {
    const hall = await Hall.findByPk(params.id, { include: { model: Plan } });
    if(!hall) {
        return fail(404, { message: 'Neplatná sála.', validate: ['hall'] });
    }
    return {
        hall: serializeNonPOJOs(hall) as Hall,
    };
};