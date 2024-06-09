import { SECRET_TURNSTILE_TOKEN } from '$env/static/private';
import { PUBLIC_DEV, PUBLIC_TURNSTILE_URL } from '$env/static/public';
import { fail } from '@sveltejs/kit';
import type { RecordModel } from 'pocketbase';

/**
 * Actions for user authentication.
 */
export const actions = {

	/**
	 * Login action.
	 * @async
	 * @param {Request} request - HTTP request object.
	 * @param {function} getClientAddress - Function to get client's IP address.
	 * @param {object} locals - Local data specific to the request.
	 * @returns {object} - Object indicating success or failure of login.
	 * @throws {object} - Error object indicating authentication failure or CAPTCHA verification failure.
	 */
	login: async ({ request, getClientAddress, locals }) => {
		const data = await request.formData();
		const email = data.get('email')?.toString();
		const password = data.get('password')?.toString();
		const turnstile = data.get('cf-turnstile-response')?.toString();
		if (!email || email.trim() == '') {
			return fail(400, { incorrect: true, message: 'Vyžaduje sa e-mail', type: 'email' });
		}
		if (!password || password.trim() == '') {
			return fail(400, { incorrect: true, message: 'Vyžaduje sa heslo', type: 'password' });
		}

		// CAPTCHA validation
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
			console.log(outcome);
			if (!outcome.success)
				return fail(400, {
					incorrect: true,
					message: 'CAPTCHA verifikácia zlyhala.',
					type: 'auth'
				});
		}

		try {
			await locals.pb.admins.authWithPassword(email, password);
			return { success: true };
		} catch (e) {
			return fail(400, {
				incorrect: true,
				message: 'Nesprávna kombinácia e-mailu a hesla.',
				type: 'auth'
			});
		}
	},
};

/**
 * Server load function for the page.
 * @async
 * @param {object} locals - Local data specific to the request.
 * @returns {object} - Object containing user data and reservations, or an empty object.
 */
export async function load({ locals }) {
	if (!locals.pb.authStore.isAdmin) {
		return {};
	} else {
		return {
			user: locals.user,
			reservations: await locals.pb.collection('reservations').getFullList({ sort: 'created', expand: "user,addons,category" }) as RecordModel[],
			apiUrl: locals.pbApiURL
		};
	}
}
