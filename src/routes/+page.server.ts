import { db } from '$lib/server/db.js';
import { halls } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export const load = async function ({ locals }) {
	if (!locals.user) {
		return {
			halls: [],
			user: null,
			permission: null
		};
	}
	const hallList = await db.select().from(halls).where(eq(halls.allow_reservations, true));

	return {
		halls: hallList,
		user: JSON.parse(JSON.stringify(locals.user)),
		permission: JSON.parse(JSON.stringify(locals.permission))
	};
};
