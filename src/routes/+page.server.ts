import { Hall, Plan } from "$lib/server/models";
import { serializeNonPOJOs } from "$lib/util";

export const load = async function ({ locals }) {

    const halls = await Hall.findAll({ include: { model: Plan }, where: { allow_reservations: true} });

    return {
        halls: serializeNonPOJOs(halls) as Array<Hall>,
        user: JSON.parse(JSON.stringify(locals.user)),
        permission: JSON.parse(JSON.stringify(locals.permission))
    };
};