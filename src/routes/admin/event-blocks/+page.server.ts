import { Hall, Plan, Reservation } from '$lib/server/models.js';
import { serializeNonPOJOs, validateHex } from '$lib/util';
import { fail } from '@sveltejs/kit';

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
		const hall = await Hall.findOne({ where: { id: hall_id } });
		if (!hall) {
			return fail(404, { message: 'Sála neexistuje.', validate: ['hall_id'] });
		}
		const plan = await Plan.findOne({ where: { id: plan_id } });
		if (!plan) {
			return fail(404, { message: 'Plán neexistuje.', validate: ['plan_id'] });
		}
		const planExists = await Hall.findOne({ where: { plan: plan_id } });
		if (planExists) {
			return fail(400, { message: 'Plán už patrí inej sále.', validate: ['plan_id'] });
		}

		// Update hall
		hall.plan = parseInt(plan_id);
		await hall.save();
		return { hall: serializeNonPOJOs(hall) };
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
		if (await Hall.findOne({ where: { name } })) {
			return fail(400, { message: 'Sála s týmto názvom už existuje.', validate: ['name'] });
		}
		const plan = formData.get('plan');
		if (plan && typeof plan !== 'number') {
			return fail(400, { message: 'Plán sály je neplatný.', validate: ['plan'] });
		}
		const color = formData.get('color_value');
		if (!color || typeof color !== 'string' || color.length < 1) {
			return fail(400, { message: 'Farba sály je povinná.', validate: ['color'] });
		}
		if (await Hall.findOne({ where: { color } })) {
			return fail(400, { message: 'Sála s touto farbou už existuje.', validate: ['color'] });
		}
		if (validateHex(color) === false) {
			return fail(400, { message: 'Farba sály je neplatná.', validate: ['color'] });
		}
		const allow_reservations = formData.get('allow_reservations') == 'on';
		const custom_layouts = formData.get('custom_layouts') == 'on';
		const force_layouts = formData.get('force_layouts') == 'on';
		const allow_feedback = formData.get('allow_feedback') == 'on';

		// Create hall
		const hall = Hall.create({
			name,
			color,
			allow_reservations,
			custom_layouts,
			force_layouts,
			allow_feedback
		});
		
		return { hall: serializeNonPOJOs(hall) };
	}
};

export const load = async function () {
	const halls = await Hall.findAll({include: {model: Plan}});
	const plans = await Plan.findAll();
	const reservations = await Reservation.findAll();
	return {
		halls: serializeNonPOJOs(halls) as Array<Hall>,
		plans: serializeNonPOJOs(plans) as Array<Plan>,
		reservations: serializeNonPOJOs(reservations) as Array<Reservation>
	};
};
