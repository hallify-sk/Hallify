import { error, fail } from '@sveltejs/kit';
import PocketBase from 'pocketbase';

export const actions = {
	confirmReservation: async ({ request, locals, params }) => {
		const data = await request.formData();
		const name = data.get('menoUdalosti')?.toString();
		const date = data.get('date')?.toString();
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
				message: 'Pre vytvorenie rezervácie musíte zadať typ udalosti.',
				type: 'type'
			});
		}

		if (!peopleCount || peopleCount == '' || isNaN(parseInt(peopleCount)) || parseInt(peopleCount) <= 0 || parseInt(peopleCount) > 120) {
			return fail(401, {
				incorrect: true,
				message: 'Pre vytvorenie rezervácie musíte zadať počet ľudí.',
				type: 'personCount'
			});
		}
		try {
			const res = await (locals.pb as PocketBase).collection('reservations').create({
				name,
				user: locals.user.id,
				guestCount: peopleCount,
				category: type,
				addons: selectedAddons,
				date: date
			});
			await (locals.pb as PocketBase).collection("temp_reservations").delete(params.slug);
			return { success: true, reservationId: res.id };
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (e: any) {
			if (e?.data?.data?.date) {
				return fail(401, {
					incorrect: true,
					message: 'Vaša rezervácia prepadla a dátum si už rezervoval niekto iný.'
				});
			} else {
				console.log(e);
				return fail(500, {
					incorrect: true,
					message: 'Nastala serverová chyba. Skúste to prosím neskôr.'
				});
			}
		}
	},
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
				message: 'Pre vytvorenie rezervácie musíte zadať typ udalosti.',
				type: 'type'
			});
		}

		if (!peopleCount || peopleCount == '' || isNaN(parseInt(peopleCount)) || parseInt(peopleCount) <= 0 || parseInt(peopleCount) > 120) {
			return fail(401, {
				incorrect: true,
				message: 'Pre vytvorenie rezervácie musíte zadať počet ľudí.',
				type: 'personCount'
			});
		}
		try {
			await (locals.pb as PocketBase).collection('reservations').update(params.slug, {
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
			reservation = await (locals.pb as PocketBase).collection('reservations').getOne(params.slug);
			console.log(reservation);
		} catch (e) {
			console.log(e)
			return error(404, {
				message: 'Not found'
			});
		}
	return {
		user: locals.user,
		reservation: reservation,
		addons: await (locals.pb as PocketBase).collection('addons').getFullList(),
		categories: (
			await (locals.pb as PocketBase)
				.collection('stage_categories')
				.getFullList({ sort: 'created' })
		).map((i) => {
			return { id: i.id, name: i.name };
		}),
		templates: 
			(await (locals.pb as PocketBase)
				.collection('stage_templates')
				.getList(0, 3, { filter: `categories.id?="${reservation.category}"&&chairCount>=${reservation.guestCount}`, expand: "tags,categories"})).items
	};
}
