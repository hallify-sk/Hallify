import { error, redirect } from "@sveltejs/kit";
import PocketBase from "pocketbase";

/** @type {import('./$types').PageServerLoad} */
/**
 * Loads data for the server-side rendering of the page.
 *
 * @param {Object} params - Parameters of the page.
 * @returns {Promise<Object>} Object containing reservation data and addons.
 */
export async function load({ locals, params }) {
	let reservation;
	try {
		reservation = await (locals.pb as PocketBase).collection("temp_reservations").getOne(params.slug, { expand: "category" });
	} catch (e) {
		try {
			reservation = await (locals.pb as PocketBase).collection("reservations").getOne(params.slug);
		} catch (e) {
			return error(404, {
				message: "Not found"
			});
		}
	}
	if (reservation.expires) return redirect(301, `/event/${params.slug}/edit`);
	return {
		reservation: reservation,
		addons: await (locals.pb as PocketBase).collection("addons").getFullList()
	};
}
