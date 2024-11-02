import { Hall } from '$lib/server/models.js';
import { validateHex } from '$lib/util.js';

export async function PUT({ request, params }) {
	const id = params.id;
	const hall = await Hall.findOne({ where: { id } });
	if (!hall) {
		return new Response(null, { status: 404, statusText: 'Nenašla sa sála s týmto ID.' });
	}
	const formData = await request.formData();
	const name = formData.get('name');
	if (!name || typeof name !== 'string' || name.length < 1) {
		return new Response(JSON.stringify({ message: 'Názov sály je povinný.', validate: ['name'] }), {
			status: 400,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}
	const hallSecond = await Hall.findOne({ where: { name } });
	if (hallSecond && hallSecond.id !== hall.id) {
		return new Response(
			JSON.stringify({ message: 'Sála s týmto názvom už existuje.', validate: ['name'] }),
			{ status: 400, headers: { 'Content-Type': 'application/json' } }
		);
	}
	const plan = formData.get('plan');
	if (plan && typeof plan !== 'number') {
        return new Response(JSON.stringify({ message: 'Plán sály je neplatný.', validate: ['plan'] }), {
            status: 400,
            headers: {
                'Content-Type': 'application/json'
            }
        });
	}
	const color = formData.get('color');
	if (!color || typeof color !== 'string' || color.length < 1) {
        return new Response(JSON.stringify({ message: 'Farba sály je povinná.', validate: ['color'] }), {
            status: 400,
            headers: {
                'Content-Type': 'application/json'
            }
        });
	};
    if (validateHex(color) === false) {
        return new Response(JSON.stringify({ message: 'Farba sály je neplatná.', validate: ['color'] }), {
            status: 400,
            headers: {
                'Content-Type': 'application/json'
            }
        });
	};
	const hallThird = await Hall.findOne({ where: { color } });
    if (hallThird && hallThird.id !== hall.id) {
        return new Response(JSON.stringify({ message: 'Sála s touto farbou už existuje.', validate: ['color'] }), {
            status: 400,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    };
	const allow_reservations = formData.get('allow_reservations') == 'on';
	const custom_layouts = formData.get('custom_layouts') == 'on';
	const force_layouts = formData.get('force_layouts') == 'on';
}
