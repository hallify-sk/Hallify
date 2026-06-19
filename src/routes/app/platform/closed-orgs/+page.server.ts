import { dbAll, fromJson } from '$lib/db/index';
import type { PageServerLoad } from './$types';

interface ClosedOrgRow {
	id: string; org_id: string; name: string; slug: string | null;
	plan: string | null; status: string | null;
	stripe_customer_id: string | null; stripe_subscription_id: string | null;
	member_count: number; reservation_count: number;
	org_created_at: string | null; closed_at: string;
	closed_by_email: string | null; closed_reason: string | null;
	snapshot: string;
}

export const load: PageServerLoad = async ({ locals }) => {
	const rows = await dbAll<ClosedOrgRow>(locals.db,
		`SELECT id, org_id, name, slug, plan, status, stripe_customer_id, stripe_subscription_id,
		        member_count, reservation_count, org_created_at, closed_at, closed_by_email, closed_reason, snapshot
		 FROM closed_organizations ORDER BY closed_at DESC`);

	return {
		closedOrgs: rows.map(r => ({
			...r,
			snapshot: fromJson<{ subscription: unknown; members: { email: string; first_name: string; last_name: string; role: string; joined_at: string }[]; reservations: { title: string; event_date: string; status: string; num_guests: number | null; hall_name: string | null }[] }>(r.snapshot),
		})),
	};
};
