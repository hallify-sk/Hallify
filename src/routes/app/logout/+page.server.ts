import { redirect } from '@sveltejs/kit';
import { deleteSession } from '$lib/auth';
import type { Actions, PageServerLoad } from './$types';

/** Opening /app/logout (typed, bookmarked, an old link) used to be a 500: the route had
 *  only the POST action. Signing out on a plain GET would let any page sign a visitor
 *  out with an <img>, so a GET asks instead; someone already signed out goes to sign-in. */
export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) redirect(303, '/app/login');
	return {};
};

export const actions: Actions = {
	default: async ({ cookies, locals }) => {
		await deleteSession(cookies, locals.db);
		redirect(303, '/app/login');
	}
};
