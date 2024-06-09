import { serializeNonPOJOs } from "$lib/lib";
import type { AuthModel } from "pocketbase";

export const ssr = true;

/**
 * Loads data for the server-side rendering of the layout.
 *
 * @param {Object} locals - Local data available for the server-side rendering.
 * @returns {Promise<Object>} Object containing user and authentication expiration data.
 */
export async function load({ locals }) {
	return {
		/** Serialized user data, if available. */
		user: locals.user ? (serializeNonPOJOs(locals.user) as AuthModel) : null,
		/** Flag indicating whether authentication has expired. */
		authExpired: locals.authExpired
	};
}
