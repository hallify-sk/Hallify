import { db } from '$lib/server/db.js';
import { halls, plans, type Hall, type Plan } from '$lib/server/schema.js';
import { serializeNonPOJOs } from '$lib/util.js';
import { fail } from '@sveltejs/kit';
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
		if (!preview.startsWith('data:image/png;base64,')) {
			return fail(400, { message: 'Neplatný plán.', validate: ['screenshot'] });
		}
		try {
			// Create new plan
			const newPlan = await db
				.insert(plans)
				.values({
					user_id: locals.user.id,
					data: JSON.parse(planData),
					preview
				})
				.returning();

			// Find the hall
			const hall = (
				await db
					.select()
					.from(halls)
					.where(eq(halls.id, parseInt(params.id)))
					.limit(1)
			)[0];
			if (!hall) {
				return fail(404, { message: 'Neplatná sála.', validate: ['hall'] });
			}

			// Update hall to reference the new plan
			await db
				.update(halls)
				.set({ plan: newPlan[0].id })
				.where(eq(halls.id, parseInt(params.id)));
		} catch (e) {
			console.error(e);
			return fail(500, { message: 'Neplatný plán.', validate: ['plan'] });
		}

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
		return fail(404, { message: 'Neplatná sála.', validate: ['hall'] });
	}

	return {
		hall: serializeNonPOJOs(hallWithPlan[0].hall) as Hall,
		plan: hallWithPlan[0].plan ? (serializeNonPOJOs(hallWithPlan[0].plan) as Plan) : null
	};
};
