import { redirect } from "@sveltejs/kit";
/**
 * Loads data for the server-side rendering of a page.
 *
 * @returns Object with user and apiUrl
 */
export async function load({ locals, route }) {
	if (!locals.pb.authStore.isAdmin) {
		//If user is not admin, redirect to /admin only if user is not already on /admin
		if (route.id != "/admin") {
			throw redirect(307, "/admin");
		} else {
			return {};
		}
	} else {
		return {
			user: locals.user,
			apiUrl: locals.pbApiURL
		};
	}
}
