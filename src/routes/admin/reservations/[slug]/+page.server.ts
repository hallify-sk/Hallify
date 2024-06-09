import PocketBase from "pocketbase";
import { error, fail } from "@sveltejs/kit";

/**
 * Actions for handling reservation confirmations and updates.
 */
export const actions = {
	/**
	 * Confirm a reservation.
	 *
	 * @param {Object} options - Object containing request, locals, and params.
	 * @returns {Promise<Object>} Object indicating success or failure of the confirmation.
	 */
	confirmReservation: async ({ request, locals, params }) => {
		const data = await request.formData();
		const name = data.get("menoUdalosti")?.toString();
		const date = data.get("date")?.toString();
		const peopleCount = data.get("pocetHosti")?.toString();
		const type = data.get("type")?.toString();
		const selectedAddons = [];
		for (const pair of data.keys()) {
			if (!["type", "date", "pocetHosti", "menoUdalosti"].includes(pair)) selectedAddons.push(pair);
		}

		// Validation checks for user input
		if (!locals.user) {
			return fail(401, {
				incorrect: true,
				message: "Pre vytvorenie rezervácie musíte byť prihlásený.",
				type: "auth"
			});
		}

		// Additional validation checks
		try {
			// Create reservation
			const res = await (locals.pb as PocketBase).collection("reservations").create({
				name,
				user: locals.user.id,
				guestCount: peopleCount,
				category: type,
				addons: selectedAddons,
				date: date
			});
			// Delete temporary reservation
			await (locals.pb as PocketBase).collection("temp_reservations").delete(params.slug);
			return { success: true, reservationId: res.id };
		} catch (e: any) {
			if (e?.data?.data?.date) {
				return fail(401, {
					incorrect: true,
					message: "Vaša rezervácia prepadla a dátum si už rezervoval niekto iný."
				});
			} else {
				return fail(500, {
					incorrect: true,
					message: "Nastala serverová chyba. Skúste to prosím neskôr."
				});
			}
		}
	},

	/**
	 * Update a reservation.
	 *
	 * @param {Object} options - Object containing request, locals, and params.
	 * @returns {Promise<Object>} Object indicating success or failure of the update.
	 */
	updateReservation: async ({ request, locals, params }) => {
		const data = await request.formData();
		const name = data.get("menoUdalosti")?.toString();
		const peopleCount = data.get("pocetHosti")?.toString();
		const type = data.get("type")?.toString();
		const selectedAddons = [];
		for (const pair of data.keys()) {
			if (!["type", "date", "pocetHosti", "menoUdalosti", "adminComment"].includes(pair)) selectedAddons.push(pair);
		}

		// Validation checks for user input
		if (!locals.user) {
			return fail(401, {
				incorrect: true,
				message: "Pre vytvorenie rezervácie musíte byť prihlásený.",
				type: "auth"
			});
		}

		// Additional validation checks
		try {
			// Update reservation
			await (locals.pb as PocketBase).collection("reservations").update(params.slug, {
				name,
				guestCount: peopleCount,
				category: type,
				adminNotes: data.get("adminComment")?.toString() || "",
				addons: selectedAddons
			});
			return { success: true };
		} catch (e: any) {
			if (e?.data?.data?.date) {
				return fail(401, {
					incorrect: true,
					message: "Vaša rezervácia prepadla a dátum si už rezervoval niekto iný."
				});
			} else {
				return fail(500, {
					incorrect: true,
					message: "Nastala serverová chyba. Skúste to prosím neskôr."
				});
			}
		}
	}
};

/**
 * Loads initial data for the reservation page.
 */
export async function load({ locals, params }) {
	let reservation;
	try {
		// Fetch reservation details
		reservation = await (locals.pb as PocketBase).collection("reservations").getOne(params.slug, { expand: "user" });
	} catch (e) {
		// Handle errors
		return error(404, {
			message: "Not found"
		});
	}

	// Fetch additional data needed for the page
	return {
		user: locals.user,
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
