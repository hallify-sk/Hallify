import { redirect } from '@sveltejs/kit';
import { loginUrl } from '$lib/login-redirect';
import type { LayoutServerLoad } from './$types';

/** The bookings of a Hallify account across every venue (D4). A venue's own client
 *  rows never get here: their sessions only exist on the venue's site. */
export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.user) redirect(303, loginUrl(url));
	return { user: locals.user };
};
