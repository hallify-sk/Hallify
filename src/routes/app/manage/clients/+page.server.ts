import type { PageServerLoad } from './$types';
import { requireOrgPermission } from '$lib/server/access';
import { loadClientList } from '$lib/server/clients';
import { parseClientFilters, queryClients } from '$lib/clients';
import { todayUtcISO } from '$lib/server/reservation-rules';

/** The client list (D10): everyone who booked or registered with the venue. Gated
 *  like the reservations it is built from: console pages open on a manage permission,
 *  never on a view one (see requireOrgPermission in $lib/server/access). */
export const load: PageServerLoad = async ({ locals, url }) => {
	const org = await requireOrgPermission(locals, 'reservations.manage');
	const filters = parseClientFilters(url.searchParams);
	const all = await loadClientList(locals.db, org.id, todayUtcISO());
	const result = queryClients(all, filters);
	return { ...result, filters, everyone: all.length, today: todayUtcISO() };
};
