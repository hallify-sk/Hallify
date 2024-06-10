import { serializeNonPOJOs } from "$lib/lib";
import { fail } from "@sveltejs/kit";

export const actions: import("./$types").Actions = {
	/**
	 * Fetch additional halls with pagination.
	 *
	 * @param {Object} locals - Local variables including PocketBase client instance.
	 * @param {Object} request - The HTTP request object.
	 * @returns {Object} - An object containing serialized halls.
	 *
	 * @throws {Error} - Throws an error if the page parameter is invalid or if no halls are found.
	 */
	getMoreHalls: async ({ locals, request }) => {
		const data = await request.formData();
		const page = data.get("page")?.toString();
		if (!page) return fail(400);
		if (isNaN(parseInt(page))) return fail(400);
		const reservations = await locals.pb
			.collection("reservations")
			.getList(parseInt(page), 50, { sort: "created", expand: "user,addons,category" });
		if (!reservations.items.length) return fail(404);

		return {
			reservations: serializeNonPOJOs(reservations)
		};
	},

	/**
	 * Remove specified halls from the collection.
	 *
	 * @param {Object} locals - Local variables including PocketBase client instance.
	 * @param {Object} request - The HTTP request object.
	 * @returns {Object} - An object indicating success.
	 *
	 * @throws {Error} - Throws an error if the reason or checkboxes parameters are missing or invalid.
	 */
	removeHalls: async ({ locals, request }) => {
		const formData = await request.formData();
		const reason = formData.get("reason")?.toString();
		const checkboxes = formData.get("checkboxes")?.toString();
		const parsedCheckboxes = JSON.parse(checkboxes || "[]");
		if (!parsedCheckboxes.length || !reason) return fail(400);
		for (let i = 0; i < parsedCheckboxes.length; i++) {
			await locals.pb.collection("reservations").delete(parsedCheckboxes[i]);
		}
		return { success: true };
	},

	/**
	 * Create a new hall with default details.
	 *
	 * @param {Object} locals - Local variables including PocketBase client instance.
	 * @param {Object} request - The HTTP request object.
	 * @returns {Object} - The created hall.
	 */
	createHall: async ({ locals }) => {
		const hall = await locals.pb.collection("halls").create({ name: "Nová sála", config: {} });
		return { hall };
	}
};

/**
 * Load initial hall details.
 *
 * @param {Object} locals - Local variables including PocketBase client instance and user information.
 * @returns {Object} - An object containing user information, reservations, and API URL.
 */
export async function load({ locals }) {
	return {
		user: locals.user,
		reservations: await locals.pb.collection("reservations").getList(0, 50, { sort: "created", expand: "user,addons,category" }),
		apiUrl: locals.pbApiURL
	};
}
