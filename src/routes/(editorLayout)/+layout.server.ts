import { serializeNonPOJOs } from "$lib/lib";
import type { AuthModel } from "pocketbase";

/** Enable server-side rendering for this layout. */
export const ssr = true;

/**
 * Function to load data for the server-side rendering of the layout.
 *
 * @returns {Promise<Object>} Object containing user and authentication expiration data.
 */
export async function load({ locals }) {
	return {
		/**
		 * Serialized user data, if available.
		 * @type {AuthModel}
		 */
		user: locals.user ? (serializeNonPOJOs(locals.user) as AuthModel) : null,

		authExpired: locals.authExpired
	};
}
