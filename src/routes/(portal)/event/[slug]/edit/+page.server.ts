import PocketBase from "pocketbase";
import { error, fail } from "@sveltejs/kit";

export const actions = {
	/** Action to confirm a reservation. */
	confirmReservation: async ({ request, locals, params }) => {
		// Retrieve form data from the request
		const data = await request.formData();
		const name = data.get("menoUdalosti")?.toString();
		const date = data.get("date")?.toString();
		const peopleCount = data.get("pocetHosti")?.toString();
		const type = data.get("type")?.toString();
		const selectedAddons = [];

		// Extract selected addons from form data
		for (const pair of data.keys()) {
			if (!["type", "date", "pocetHosti", "menoUdalosti"].includes(pair)) selectedAddons.push(pair);
		}

		// Validate user authentication
		if (!locals.user) {
			return fail(401, {
				incorrect: true,
				message: "Pre vytvorenie rezervácie musíte byť prihlásený.",
				type: "auth"
			});
		}

		// Validate reservation name
		if (!name || name == "") {
			return fail(401, {
				incorrect: true,
				message: "Pre vytvorenie rezervácie musíte zadať jej názov.",
				type: "name"
			});
		}

		// Validate reservation type
		if (!type || type == "") {
			return fail(401, {
				incorrect: true,
				message: "Pre vytvorenie rezervácie musíte zadať typ udalosti.",
				type: "type"
			});
		}

		// Validate number of people for the reservation
		if (!peopleCount || peopleCount == "" || isNaN(parseInt(peopleCount)) || parseInt(peopleCount) <= 0 || parseInt(peopleCount) > 120) {
			return fail(401, {
				incorrect: true,
				message: "Pre vytvorenie rezervácie musíte zadať počet ľudí.",
				type: "personCount"
			});
		}

		try {
			// Attempt to create the reservation in the database
			const res = await (locals.pb as PocketBase).collection("reservations").create({
				name,
				user: locals.user.id,
				guestCount: peopleCount,
				category: type,
				addons: selectedAddons,
				date: date
			});

			// Delete temporary reservation after successful creation
			await (locals.pb as PocketBase).collection("temp_reservations").delete(params.slug);

			// Return success response with reservation ID
			return { success: true, reservationId: res.id };
		} catch (e: any) {
			if (e?.data?.data?.date) {
				// Handle error if reservation date is not available
				return fail(401, {
					incorrect: true,
					message: "Vaša rezervácia prepadla a dátum si už rezervoval niekto iný."
				});
			} else {
				// Handle other server errors
				console.log(e);
				return fail(500, {
					incorrect: true,
					message: "Nastala serverová chyba. Skúste to prosím neskôr."
				});
			}
		}
	},

	/** Action to update a reservation. */
	updateReservation: async ({ request, locals, params }) => {
		// Retrieve form data from the request
		const data = await request.formData();
		const name = data.get("menoUdalosti")?.toString();
		const peopleCount = data.get("pocetHosti")?.toString();
		const type = data.get("type")?.toString();
		const selectedAddons = [];

		// Extract selected addons from form data
		for (const pair of data.keys()) {
			if (!["type", "date", "pocetHosti", "menoUdalosti"].includes(pair)) selectedAddons.push(pair);
		}

		// Validate user authentication
		if (!locals.user) {
			return fail(401, {
				incorrect: true,
				message: "Pre vytvorenie rezervácie musíte byť prihlásený.",
				type: "auth"
			});
		}

		// Validate reservation name
		if (!name || name == "") {
			return fail(401, {
				incorrect: true,
				message: "Pre vytvorenie rezervácie musíte zadať jej názov.",
				type: "name"
			});
		}

		// Validate reservation type
		if (!type || type == "") {
			return fail(401, {
				incorrect: true,
				message: "Pre vytvorenie rezervácie musíte zadať typ udalosti.",
				type: "type"
			});
		}

		// Validate number of people for the reservation
		if (!peopleCount || peopleCount == "" || isNaN(parseInt(peopleCount)) || parseInt(peopleCount) <= 0 || parseInt(peopleCount) > 120) {
			return fail(401, {
				incorrect: true,
				message: "Pre vytvorenie rezervácie musíte zadať počet ľudí.",
				type: "personCount"
			});
		}

		try {
			// Attempt to update the reservation in the database
			await (locals.pb as PocketBase).collection("reservations").update(params.slug, {
				name,
				guestCount: peopleCount,
				category: type,
				addons: selectedAddons
			});
			// Return success response
			return { success: true };
		} catch (e: any) {
			if (e?.data?.data?.date) {
				// Handle error if reservation date is not available
				return fail(401, {
					incorrect: true,
					message: "Vaša rezervácia prepadla a dátum si už rezervoval niekto iný."
				});
			} else {
				// Handle other server errors
				return fail(500, {
					incorrect: true,
					message: "Nastala serverová chyba. Skúste to prosím neskôr."
				});
			}
		}
	}
};

/**
 * Function to load data for the server-side rendering of the page.
 *
 * @returns {Promise<Object>} Object containing reservation data, addons, categories, and templates.
 */
export async function load({ locals, params }) {
	let reservation;

	try {
		// Attempt to retrieve temporary reservation data
		reservation = await (locals.pb as PocketBase).collection("temp_reservations").getOne(params.slug, { expand: "category" });
	} catch (e) {
		try {
			// If temporary reservation not found, attempt to retrieve reservation data
			reservation = await (locals.pb as PocketBase).collection("reservations").getOne(params.slug);
		} catch (e) {
			// Handle error if reservation not found
			return error(404, {
				message: "Not found"
			});
		}
	}

	return {
		reservation: reservation,
		addons: await (locals.pb as PocketBase).collection("addons").getFullList(),
		categories: (await (locals.pb as PocketBase).collection("stage_categories").getFullList({ sort: "created" })).map((i) => {
			return { id: i.id, name: i.name };
		}),
		templates: (
			await (locals.pb as PocketBase)
				.collection("stage_templates")
				.getList(0, 3, {
					filter: `categories.id?="${reservation.category}"&&chairCount>=${reservation.guestCount}`,
					expand: "tags,categories"
				})
		).items
	};
}
