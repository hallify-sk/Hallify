import { listAccountBookings } from '$lib/server/account-bookings';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	return { reservations: await listAccountBookings(locals.db, locals.user!.id, url) };
};
