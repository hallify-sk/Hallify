import { Hall } from "$lib/server/models";
import { fail } from "@sveltejs/kit";

export const actions = {
    removePlan: async function ({ request }) {
        if (request.method != 'POST') {
            return fail(405, { message: 'Metóda nie je povolená.' });
        }
        const formData = await request.formData();
        const id = formData.get('hallId');
        if (!id || typeof id !== 'string' || id.length < 1) {
            return fail(400, { message: 'ID plánu je povinné.', validate: ['id'] });
        }
        const hall = await Hall.findByPk(id);
        if (!hall) {
            return fail(404, { message: 'Plán neexistuje.', validate: ['plan'] });
        }
        await hall.setPlanData(0);
        return { success: true };
    },
    changePlan: async function ({ request, params }) {
        if (request.method != 'POST') {
            return fail(405, { message: 'Metóda nie je povolená.' });
        }
        const formData = await request.formData();
        const id = params.id;
        if (!id || typeof id !== 'string' || id.length < 1) {
            return fail(400, { message: 'ID plánu je povinné.', validate: ['id'] });
        }
        const hall = await Hall.findByPk(id);
        if (!hall) {
            return fail(404, { message: 'Plán neexistuje.', validate: ['plan'] });
        }
        const planId = formData.get('planId');
        if (!planId || typeof planId !== 'string' || planId.length < 1) {
            return fail(400, { message: 'ID plánu je povinné.', validate: ['plan'] });
        }
        await hall.setPlanData(parseInt(planId));
        return { success: true };
    }
}