import { Hall, Reservation } from '$lib/server/models.js';
import { serializeNonPOJOs, validateHex } from '$lib/util';
import { fail } from '@sveltejs/kit';

export const actions = {
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
		const color = formData.get('color');
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

		// Create hall
		const hall = await Hall.create({
			name,
			plan,
			color,
			allow_reservations,
			custom_layouts,
			force_layouts
		});
		return { hall: serializeNonPOJOs(hall) };
	}
};

export const load = async function () {
	const halls = await Hall.findAll();
	const reservations = await Reservation.findAll();
	return {
		halls: serializeNonPOJOs(halls) as Array<Hall>,
		reservations: serializeNonPOJOs(reservations) as Array<Reservation>
	};
};
