import { db } from '$lib/server/db.js';
import { halls } from '$lib/server/schema.js';
import { serializeNonPOJOs, validateHex } from '$lib/util.js';
import { eq, and, ne } from 'drizzle-orm';

export async function PUT({ request, params }) {
	const id = params.id;
	const hall = (
		await db
			.select()
			.from(halls)
			.where(eq(halls.id, parseInt(id)))
			.limit(1)
	)[0];
	if (!hall) {
		return new Response(null, { status: 404, statusText: 'Nenašla sa sála s týmto ID.' });
	}
	const formData = await request.formData();
	const name = formData.get('name')?.toString();
	if (!name || typeof name !== 'string' || name.length < 1) {
		return new Response(JSON.stringify({ message: 'Názov sály je povinný.', validate: ['name'] }), {
			status: 400,
			headers: {
				'Content-Type': 'application/json'
			}
		});
	}
	const hallSecond = (
		await db
			.select()
			.from(halls)
			.where(and(eq(halls.name, name), ne(halls.id, parseInt(id))))
			.limit(1)
	)[0];
	if (hallSecond) {
		return new Response(
			JSON.stringify({ message: 'Sála s týmto názvom už existuje.', validate: ['name'] }),
			{ status: 400, headers: { 'Content-Type': 'application/json' } }
		);
	}
	const plan = parseInt(formData.get('plan')?.toString() ?? '0');
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
		return new Response(
			JSON.stringify({ message: 'Farba sály je povinná.', validate: ['color'] }),
			{
				status: 400,
				headers: {
					'Content-Type': 'application/json'
				}
			}
		);
	}
	if (validateHex(color) === false) {
		return new Response(
			JSON.stringify({ message: 'Farba sály je neplatná.', validate: ['color'] }),
			{
				status: 400,
				headers: {
					'Content-Type': 'application/json'
				}
			}
		);
	}
	const hallThird = (
		await db
			.select()
			.from(halls)
			.where(and(eq(halls.color, color), ne(halls.id, parseInt(id))))
			.limit(1)
	)[0];
	if (hallThird) {
		return new Response(
			JSON.stringify({ message: 'Sála s touto farbou už existuje.', validate: ['color'] }),
			{
				status: 400,
				headers: {
					'Content-Type': 'application/json'
				}
			}
		);
	}
	const allow_reservations = formData.get('allow_reservations') == 'true';
	const custom_layouts = formData.get('custom_layouts') == 'true';
	const force_layouts = formData.get('force_layouts') == 'true';
	const allow_feedback = formData.get('allow_feedback') == 'true';

	// Update hall
	const updatedHall = await db
		.update(halls)
		.set({
			name,
			plan: plan || null,
			color,
			allow_reservations,
			custom_layouts,
			force_layouts,
			allow_feedback
		})
		.where(eq(halls.id, parseInt(id)))
		.returning();

	return new Response(JSON.stringify(serializeNonPOJOs(updatedHall[0])), {
		status: 200,
		headers: {
			'Content-Type': 'application/json'
		}
	});
}
