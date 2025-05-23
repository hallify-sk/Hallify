import { db } from '$lib/server/db.js';
import { halls, plans, type Hall, type Plan } from '$lib/server/schema.js';
import { serializeNonPOJOs } from '$lib/util.js';
import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

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

		const hall = (
			await db
				.select()
				.from(halls)
				.where(eq(halls.id, parseInt(id)))
				.limit(1)
		)[0];
		if (!hall) {
			return fail(404, { message: 'Plán neexistuje.', validate: ['plan'] });
		}

		await db
			.update(halls)
			.set({ plan: null })
			.where(eq(halls.id, parseInt(id)));

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

		const hall = (
			await db
				.select()
				.from(halls)
				.where(eq(halls.id, parseInt(id)))
				.limit(1)
		)[0];
		if (!hall) {
			return fail(404, { message: 'Plán neexistuje.', validate: ['plan'] });
		}

		const planId = formData.get('planId');
		if (!planId || typeof planId !== 'string' || planId.length < 1) {
			return fail(400, { message: 'ID plánu je povinné.', validate: ['plan'] });
		}

		// Verify the plan exists
		const plan = (
			await db
				.select()
				.from(plans)
				.where(eq(plans.id, parseInt(planId)))
				.limit(1)
		)[0];
		if (!plan) {
			return fail(404, { message: 'Plán neexistuje.', validate: ['plan'] });
		}

		await db
			.update(halls)
			.set({ plan: parseInt(planId) })
			.where(eq(halls.id, parseInt(id)));

		return { success: true };
	}
};

export const load = async function ({ params }) {
	// Get hall with its plan using a join
	const hallWithPlan = await db
		.select({
			hall: halls,
			plan: plans
		})
		.from(halls)
		.leftJoin(plans, eq(halls.plan, plans.id))
		.where(eq(halls.id, parseInt(params.id)))
		.limit(1);

	if (!hallWithPlan[0]) {
		return fail(404, { message: 'Sála neexistuje.', validate: ['hall'] });
	}

	// Get all available plans for the changePlan action
	const allPlans = await db.select().from(plans);

	return {
		hall: serializeNonPOJOs(hallWithPlan[0].hall) as Hall,
		currentPlan: hallWithPlan[0].plan ? (serializeNonPOJOs(hallWithPlan[0].plan) as Plan) : null,
		allPlans: serializeNonPOJOs(allPlans) as Array<Plan>
	};
};
