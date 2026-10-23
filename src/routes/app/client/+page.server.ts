import { listAccountBookings, isUpcoming } from '$lib/server/account-bookings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const all = await listAccountBookings(locals.db, locals.user!.id, url);
	const today = new Date().toISOString().slice(0, 10);
	return { reservations: all.slice(0, 20), upcomingCount: all.filter((r) => isUpcoming(r, today)).length };
};
