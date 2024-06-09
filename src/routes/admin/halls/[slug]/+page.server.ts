import { error, fail } from "@sveltejs/kit";
import PocketBase from "pocketbase";
export const actions: import("./$types").Actions = {
	/**
	 * Save changes to a hall's details.
	 *
	 * @param {Object} locals - Local variables including PocketBase client instance.
	 * @param {Object} request - The HTTP request object.
	 * @param {Object} params - Route parameters.
	 * @param {string} params.slug - The hall ID (slug).
	 * @returns {Object} - The updated hall configuration.
	 *
	 * @throws {Error} - Throws an error if the hall is not found or if there is a server error during the update.
	 */
	saveChanges: async ({ locals, request, params }) => {
		const hallId = params.slug;
		const data = await request.formData();
		const hall = await locals.pb.collection("halls").getFullList({ filter: `id="${hallId}"` });
		if (!hall.length) {
			throw error(404, { message: "Not found" });
		}
		let newData;
		const object: { [key: string]: string } = {};
		data.forEach(function (value, key) {
			if (key == "hallName" || key == "disabled") return;
			object[key] = value.toString();
		});
		console.log(object);
		try {
			let json = JSON.stringify(object);
			//If toggleModule is updated, only update toggleModule
			console.log(data.get("toggleModule"));
			if (!data.get("toggleModule")) {
				hall[0].config.toggleModule = data.get("toggleModule");
				json = JSON.stringify(hall[0].config);
			}
			console.log(json);

			newData = await locals.pb.collection("halls").update(hallId, {
				enabled: data.get("enabled") === "on" ? true : false,
				name: data.get("hallName")?.toString() || hall[0].name,
				config: json
			});
		} catch (e) {
			throw fail(500);
		}
		return {
			config: newData
		};
	}
};
/**
 * Loads user data based on the provided parameters.
 *
 * @type {import('@sveltejs/kit').PageServerLoad}
 */
export async function load({ locals, params }) {
	let hall;
	try {
		hall = await (locals.pb as PocketBase).collection("stages").getOne(params.slug);
	} catch (e) {
		console.log(e);
		return error(404, {
			message: "Not found"
		});
	}
	return {
		hall
	};
}
