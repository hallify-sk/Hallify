import { PUBLIC_CALENDAR_EXPIRE } from '$env/static/public';
import { error, fail } from '@sveltejs/kit';
import PocketBase from 'pocketbase';

export const actions = {
	updateReservation: async ({ request, locals, params }) => {
		const data = await request.formData();
		const name = data.get('menoUdalosti')?.toString();
		const peopleCount = data.get('pocetHosti')?.toString();
		const type = data.get('type')?.toString();
		const selectedAddons = [];
		for (const pair of data.keys()) {
			if (!['type', 'date', 'pocetHosti', 'menoUdalosti'].includes(pair)) selectedAddons.push(pair);
		}
		console.log(selectedAddons);

		if (!locals.user) {
			return fail(401, {
				incorrect: true,
				message: 'Pre vytvorenie rezervácie musíte byť prihlásený.',
				type: 'auth'
			});
		}

		if (!name || name == '') {
			return fail(401, {
				incorrect: true,
				message: 'Pre vytvorenie rezervácie musíte zadať jej názov.',
				type: 'name'
			});
		}

		if (!type || type == '') {
			return fail(401, {
				incorrect: true,
				message: 'Pre vytvorenie rezervácie musíte zadať druh události.',
				type: 'type'
			});
		}

		if (!peopleCount || peopleCount == '' || isNaN(parseInt(peopleCount))) {
			return fail(401, {
				incorrect: true,
				message: 'Pre vytvorenie rezervácie musíte zadať počet ľudí.',
				type: 'personCount'
			});
		}
		const expires = new Date(new Date().getTime() + parseInt(PUBLIC_CALENDAR_EXPIRE) * 60000);
		//Try to update current reservation
		try {
			await (locals.pb as PocketBase).collection('temp_reservations').update(params.slug, {
				expires,
				name,
				guestCount: peopleCount,
				category: type,
				addons: selectedAddons
			});
			return { success: true };
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (e: any) {
			if (e?.data?.data?.date) {
				return fail(401, {
					incorrect: true,
					message: 'Vaša rezervácia prepadla a dátum si už rezervoval niekto iný.'
				});
			} else {
				return fail(500, {
					incorrect: true,
					message: 'Nastala serverová chyba. Skúste to prosím neskôr.'
				});
			}
		}
	}
};

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals, params }) {
	let reservation;
	try {
		reservation = await (locals.pb as PocketBase)
			.collection('temp_reservations')
			.getOne(params.slug, { expand: 'category' });
	} catch (e) {
		try {
			reservation = await (locals.pb as PocketBase).collection('reservations').getOne(params.slug);
		} catch (e) {
			return error(404, {
				message: 'Not found'
			});
		}
	}
	return {
		reservation: reservation,
		addons: await (locals.pb as PocketBase).collection('addons').getFullList(),
		categories: (
			await (locals.pb as PocketBase)
				.collection('stage_categories')
				.getFullList({ sort: 'created' })
		).map((i) => {
			return { id: i.id, name: i.name };
		})
	};
}
