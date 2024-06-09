import { error, fail } from '@sveltejs/kit';
import PocketBase from 'pocketbase';

/**
 * Defines actions related to updating user data.
 *
 * @type {import('@sveltejs/kit').Actions}
 */
export const actions = {
	/**
	 * Handles updating user data based on the request parameters.
	 *
	 * @param options - The options object containing request, locals, and params.
	 * @returns A promise resolving to either success or failure message.
	 */
	updateUser: async ({ request, locals, params }) => {
		const data = await request.formData();
		const name = data.get('name')?.toString();
		const email = data.get('email')?.toString();

		if (!name || name.trim() == '') {
			return fail(400, { incorrect: true, message: 'Vyžaduje sa meno', type: 'name' });
		}
		if (!email || email.trim() == '') {
			return fail(400, { incorrect: true, message: 'Vyžaduje sa e-mail', type: 'email' });
		}
		// Validate email with simple regex
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { incorrect: true, message: 'E-mail nie je platný', type: 'email' });
		}
		try {
			console.log(params.slug);
			await (locals.pb as PocketBase).collection('users').update(params.slug, {
				name,
				email,
				adminNotes: data.get('adminComment')?.toString() || ''
			});
			return { success: true };
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (e: any) {
			console.log(e);
			return fail(500, {
				incorrect: true,
				message: 'Nastala serverová chyba. Skúste to prosím neskôr.'
			});
		}
	}
};

/**
 * Loads user data based on the provided parameters.
 *
 * @type {import('@sveltejs/kit').PageServerLoad}
 */
export async function load({ locals, params }) {
	let user;
	try {
		user = await (locals.pb as PocketBase).collection('users').getOne(params.slug);
	} catch (e) {
		console.log(e);
		return error(404, {
			message: 'Not found'
		});
	}
	return {
		user: user
	};
}
