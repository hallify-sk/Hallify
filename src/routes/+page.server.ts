import { SECRET_TURNSTILE_TOKEN } from '$env/static/private';
import { PUBLIC_DEV, PUBLIC_TURNSTILE_URL, PUBLIC_CALENDAR_EXPIRE } from '$env/static/public';
import { fail, redirect } from '@sveltejs/kit';
import PocketBase, { type RecordModel } from 'pocketbase';

export const actions = {
	logout: async ({ locals }) => {
		if (!locals.user) return fail(400);
		locals.pb.authStore.clear();
		return { success: true };
	},
	login: async ({ request, getClientAddress, locals }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString();
		const password = data.get('password')?.toString();
		const turnstile = data.get('cf-turnstile-response')?.toString();
		if (!email || email.trim() == '') {
			return fail(400, { incorrect: true, message: 'Vyžaduje sa e-mail', type: 'email' });
		}
		//validate email with simple regex
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { incorrect: true, message: 'E-mail nie je platný', type: 'email' });
		}
		if (!password || password.trim() == '') {
			return fail(400, { incorrect: true, message: 'Vyžaduje sa heslo', type: 'password' });
		}
		const formData = new FormData();
		if (PUBLIC_DEV != 'true') {
			formData.append('secret', SECRET_TURNSTILE_TOKEN);
			formData.append('response', turnstile as string);
			formData.append('remoteip', getClientAddress());
			const result: Response = await fetch(PUBLIC_TURNSTILE_URL, {
				body: formData,
				method: 'POST'
			});
			const outcome = await result.json();
			if (!outcome.success)
				return fail(400, {
					incorrect: true,
					message: 'CAPTCHA verifikácia zlyhala.',
					type: 'auth'
				});
		}
		try {
			await locals.pb.collection('users').authWithPassword(email, password);
			return { success: true };
		} catch (e) {
			return fail(400, {
				incorrect: true,
				message: 'Nesprávna kombinácia e-mailu a hesla.',
				type: 'auth'
			});
		}
	},
	register: async ({ request, getClientAddress, locals }) => {
		const data = await request.formData();
		const name = data.get('name')?.toString();
		const email = data.get('email')?.toString();
		const password = data.get('password')?.toString();
		const turnstile = data.get('cf-turnstile-response')?.toString();

		if (!name || name.trim() == '') {
			return fail(400, { incorrect: true, message: 'Vyžaduje sa meno', type: 'name' });
		}
		if (!email || email.trim() == '') {
			return fail(400, { incorrect: true, message: 'Vyžaduje sa e-mail', type: 'email' });
		}
		//validate email with simple regex
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { incorrect: true, message: 'E-mail nie je platný', type: 'email' });
		}
		if (!password || password.trim() == '') {
			return fail(400, { incorrect: true, message: 'Vyžaduje sa heslo', type: 'password' });
		}

		//Validate password with simple regex step by step.
		if (password.length < 8) {
			return fail(400, {
				incorrect: true,
				message: 'Heslo musí mať aspoň 8 znakov',
				type: 'password'
			});
		}
		if (!/[a-z]/.test(password)) {
			return fail(400, {
				incorrect: true,
				message: 'Heslo musí obsahovať aspoň jedno malé písmeno',
				type: 'password'
			});
		}
		if (!/[A-Z]/.test(password)) {
			return fail(400, {
				incorrect: true,
				message: 'Heslo musí obsahovať aspoň jedno veľké písmeno',
				type: 'password'
			});
		}
		if (!/[0-9]/.test(password)) {
			return fail(400, {
				incorrect: true,
				message: 'Heslo musí obsahovať aspoň jedno číslo',
				type: 'password'
			});
		}

		const formData = new FormData();
		if (PUBLIC_DEV != 'true') {
			formData.append('secret', SECRET_TURNSTILE_TOKEN);
			formData.append('response', turnstile as string);
			formData.append('remoteip', getClientAddress());
			const result: Response = await fetch(PUBLIC_TURNSTILE_URL, {
				body: formData,
				method: 'POST'
			});
			const outcome = await result.json();
			if (!outcome.success)
				return fail(400, {
					incorrect: true,
					message: 'CAPTCHA verifikácia zlyhala.',
					type: 'auth'
				});
		}
		try {
			const createData = new FormData();
			createData.append('name', name);
			createData.append('email', email);
			createData.append('password', password);
			createData.append('passwordConfirm', password);
			await (locals.pb as PocketBase).collection('users').create(createData);
			await locals.pb.collection('users').authWithPassword(email, password);
			return { success: true };
		} catch (e) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			console.log((e as any).data.data);
			return fail(404, {
				incorrect: true,
				message: 'E-Mail neexistuje alebo heslo je neplatné',
				type: 'auth'
			});
		}
	},
	reserveDateTemp: async ({ request, getClientAddress, locals }) => {
		const data = await request.formData();
		const date = data.get('date')?.toString();
		const turnstile = data.get('cf-turnstile-response')?.toString();

		if (!locals.user) {
			return fail(401, {
				incorrect: true,
				message: 'Pre vybratie dátumu musíte byť prihlásený.',
				type: 'auth'
			});
		}
		const formData = new FormData();
		if (PUBLIC_DEV != 'true') {
			formData.append('secret', SECRET_TURNSTILE_TOKEN);
			formData.append('response', turnstile as string);
			formData.append('remoteip', getClientAddress());
			const result: Response = await fetch(PUBLIC_TURNSTILE_URL, {
				body: formData,
				method: 'POST'
			});
			const outcome = await result.json();
			if (!outcome.success)
				return fail(400, {
					incorrect: true,
					message: 'CAPTCHA verifikácia zlyhala.',
					type: 'auth'
				});
		}

		if (!date || date.trim() == '') {
			return fail(400, {
				incorrect: true,
				message: 'Pre udalosť sa vyžaduje dátum.',
				type: 'date'
			});
		}
		try {
			//Remove any previous reservations;
			const reservation = await (locals.pb as PocketBase)
				.collection('temp_reservations')
				.getFirstListItem(`user="${locals.user.id}"`);
			await (locals.pb as PocketBase).collection('temp_reservations').delete(reservation.id);
		} catch (e) {
			//No need to do anything.
		}
		try {
			const expires = new Date(new Date().getTime() + parseInt(PUBLIC_CALENDAR_EXPIRE) * 60000);
			await (locals.pb as PocketBase)
				.collection('temp_reservations')
				.create({ user: locals.user.id, date, expires });
			return { success: true };
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (e: any) {
			console.error(e.data.data);
			if (e?.data?.data?.date) {
				return fail(400, { incorrect: true, message: 'Dátum už bol zarezervovaný.' });
			} else {
				return fail(500, {
					incorrect: true,
					message: 'Nastala serverová chyba. Skúste to prosím neskôr.'
				});
			}
		}
	},
	addToDateTemp: async ({ request, locals }) => {
		const data = await request.formData();
		console.log(data);
		const date = data.get('date')?.toString();
		const name = data.get('menoUdalosti')?.toString();
		const peopleCount = data.get('pocetLudi')?.toString();
		const type = data.get('type')?.toString();
		const selectedAddons = [];
		for (const pair of data.keys()) {
			if (!['type', 'date', 'pocetLudi', 'menoUdalosti'].includes(pair)) selectedAddons.push(pair);
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

		if (!date || date == '') {
			return fail(401, {
				incorrect: true,
				message: 'Chybný dátum, vráťte sa o krok dozadu.',
				type: 'date'
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

		let toUpdate: RecordModel;
		const expires = new Date(new Date().getTime() + parseInt(PUBLIC_CALENDAR_EXPIRE) * 60000);

		try {
			//Fetch current reservation
			toUpdate = await (locals.pb as PocketBase)
				.collection('temp_reservations')
				.getFirstListItem(`user="${locals.user.id}"`);
		} catch (e) {
			try {
				toUpdate = await (locals.pb as PocketBase)
					.collection('temp_reservations')
					.create({ user: locals.user.id, date, expires });
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
		try {
			const formData = new FormData();
			formData.append('guestCount', peopleCount);
			formData.append('category', type);
			formData.append('name', name);
			for (const addon of selectedAddons) {
				formData.append('addons', addon);
			}
			await (locals.pb as PocketBase)
				.collection('temp_reservations')
				.update(toUpdate.id, formData);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (e: any) {
			return fail(500, {
				incorrect: true,
				message: 'Nastala serverová chyba. Skúste to prosím neskôr.'
			});
		}
		throw redirect(303, `/event/${toUpdate.id}`);
	}
};

/** @type {import('./$types').PageServerLoad} */
export async function load({ locals }) {
	return {
		tempReservations: await (locals.pb as PocketBase)
			.collection('temp_reservations')
			.getFullList({fields: "id,expires,date,user"}),
		ownedTempReservations: await (locals.pb as PocketBase)
			.collection('temp_reservations')
			.getFullList({filter: `user="${locals.user.id}"`, expand: "category"}),
		reservations: await (locals.pb as PocketBase)
			.collection('reservations')
			.getFullList({ sort: 'created', fields: "id,expires,date,user" }),
		ownedReservations: await (locals.pb as PocketBase)
			.collection('reservations')
			.getFullList({filter: `user="${locals.user.id}"`, expand: "category"}),
		addons: await (locals.pb as PocketBase).collection('addons').getFullList(),
		stages: await (locals.pb as PocketBase).collection('stages').getFullList({ sort: 'created' }),
		categories: (
			await (locals.pb as PocketBase)
				.collection('stage_categories')
				.getFullList({ sort: 'created' })
		).map((i) => {
			return { id: i.id, name: i.name };
		})
	};
}
