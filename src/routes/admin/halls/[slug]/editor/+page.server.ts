/**
 * Load data for the page.
 *
 * @type {import('./$types').PageServerLoad}
 * @param {Object} context - The context object.
 * @param {Object} context.locals - Local data available for the server-side rendering.
 * @returns {Promise<Object>} Object containing tables and stage categories data.
 */

import { error } from "@sveltejs/kit";

/** @type {import('./$types.d.ts').ServerLoad} */
export async function load({ locals, params }) {
	let hall;
	try {
		hall = await locals.pb.collection("halls").getOne(params.slug);
	} catch (e) {
		throw error(404, { message: "Not found" });
	}

	return {
		user: locals.user,
		tables: await locals.pb.collection("tables").getFullList(),
		hall: hall,
		apiUrl: locals.pbApiURL
	};
}

/**
 * Actions available for the page.
 */
export const actions = {
	/**
	 * Save stage action.
	 *
	 * @param {Request} request - HTTP request object.
	 * @param {Object} params - URL parameters.
	 * @returns {Promise<Object>} Object containing success flag.
	 */
	saveStage: async ({ request, locals, params }) => {
		const formData = await request.formData();
		const stage = formData.get("stage")?.toString();
		const image = formData.get("image") as Blob;
		const data = new FormData();

		if (stage) {
			data.append("data", stage);
		}
		if (image) {
			data.append("render", image, "stage.png");
		}

		try {
			await locals.pb.collection("halls").update(params.slug, data);
		} catch (e) {
			console.error(e);
		}

		return { success: true };
	}
};
