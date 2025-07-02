import { db } from '$lib/server/db.js';
import {
	type Hall,
	halls,
	type Plan,
	plans,
	type Reservation,
	reservations
} from '$lib/server/schema.js';
import { serializeNonPOJOs, validateHex } from '$lib/util';
import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export const actions = {
	changeHallPlan: async function ({ request }) {
		if (request.method != 'POST') {
			return fail(405, { message: 'Metóda nie je povolená.' });
		}
		const formData = await request.formData();
		const hall_id = formData.get('hall_id');
		if (!hall_id || typeof hall_id !== 'string' || hall_id.length < 1) {
			return fail(400, { message: 'ID sály je povinné.', validate: ['hall_id'] });
		}
		const plan_id = formData.get('plan_id');
		if (!plan_id || typeof plan_id !== 'string' || plan_id.length < 1) {
			return fail(400, { message: 'ID plánu je povinné.', validate: ['plan_id'] });
		}
		const hall = (
			await db
				.select()
				.from(halls)
				.where(eq(halls.id, parseInt(hall_id)))
				.limit(1)
		)[0];
		if (!hall) {
			return fail(404, { message: 'Sála neexistuje.', validate: ['hall_id'] });
		}
		const plan = (
			await db
				.select()
				.from(plans)
				.where(eq(plans.id, parseInt(plan_id)))
				.limit(1)
		)[0];
		if (!plan) {
			return fail(404, { message: 'Plán neexistuje.', validate: ['plan_id'] });
		}
		// Check if the plan is already assigned to another hall
		const planExists = (
			await db
				.select()
				.from(halls)
				.where(eq(halls.plan, parseInt(plan_id)))
				.limit(1)
		)[0];
		if (planExists) {
			return fail(400, { message: 'Plán už patrí inej sále.', validate: ['plan_id'] });
		}
		// Update hall
		const updatedHall = await db
			.update(halls)
			.set({ plan: parseInt(plan_id) })
			.where(eq(halls.id, parseInt(hall_id)))
			.returning();

		return { hall: serializeNonPOJOs(updatedHall[0]) };
	},
	create: async function ({ request }) {
		if (request.method != 'POST') {
			return fail(405, { message: 'Metóda nie je povolená.' });
		}
		const formData = await request.formData();
		const name = formData.get('name');
		if (!name || typeof name !== 'string' || name.length < 1) {
			return fail(400, { message: 'Názov sály je povinný.', validate: ['name'] });
		}

		// Add capacity validation
		const capacity = formData.get('capacity');
		if (!capacity || typeof capacity !== 'string') {
			return fail(400, { message: 'Kapacita sály je povinná.', validate: ['capacity'] });
		}

		const capacityNumber = parseInt(capacity);
		if (isNaN(capacityNumber) || capacityNumber < 1) {
			return fail(400, { message: 'Kapacita musí byť číslo väčšie ako 0.', validate: ['capacity'] });
		}

		const existingHallByName = (
			await db.select().from(halls).where(eq(halls.name, name)).limit(1)
		)[0];
		if (existingHallByName) {
			return fail(400, { message: 'Sála s týmto názvom už existuje.', validate: ['name'] });
		}

		const plan = formData.get('plan');
		if (plan && typeof plan !== 'number') {
			return fail(400, { message: 'Plán sály je neplatný.', validate: ['plan'] });
		}

		// Fix: Get the color from the correct field name
		const color = formData.get('color_value');
		if (!color || typeof color !== 'string' || color.length < 1) {
			return fail(400, { message: 'Farba sály je povinná.', validate: ['color'] });
		}

		const existingHallByColor = (
			await db.select().from(halls).where(eq(halls.color, color)).limit(1)
		)[0];
		if (existingHallByColor) {
			return fail(400, { message: 'Sála s touto farbou už existuje.', validate: ['color'] });
		}

		if (validateHex(color) === false) {
			return fail(400, { message: 'Farba sály je neplatná.', validate: ['color'] });
		}

		const allow_reservations = formData.get('allow_reservations') == 'on';
		const custom_layouts = formData.get('custom_layouts') == 'on';
		const force_layouts = formData.get('force_layouts') == 'on';
		const allow_feedback = formData.get('allow_feedback') == 'on';

		// Create hall with capacity and correct color
		const newHall = await db
			.insert(halls)
			.values({
				name,
				capacity: capacityNumber,
				color, // This will now be the hex value
				allow_reservations,
				custom_layouts,
				force_layouts,
				allow_feedback,
				plan: plan ? parseInt(plan as string) : null
			})
			.returning();

		return { hall: serializeNonPOJOs(newHall[0]) };
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

	return {
		halls: serializeNonPOJOs(hallsWithPlans) as Array<{ hall: Hall; plan: Plan | null }>,
		plans: serializeNonPOJOs(allPlans) as Array<Plan>,
		reservations: serializeNonPOJOs(allReservations) as Array<Reservation>
	};
};
