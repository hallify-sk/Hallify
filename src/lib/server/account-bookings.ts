// Bookings across venues for one Hallify account (D4): its own, and those of every
// venue client row linked to it. Each links to where it can be opened: a booking
// made on a venue's site opens on that site (sessions stay host-scoped, and the same
// Hallify email and password sign in there).

import { dbAll } from '$lib/db/index';
import { orgPublicBaseUrl } from '$lib/orgUrl';
import type { ReservationRow } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';

export type AccountBooking = ReservationRow & {
	hall_name: string;
	hall_slug: string | null;
	org_name: string;
	org_slug: string;
	/** Where to open it. */
	href: string;
};

/** SQL condition matching the account's own bookings and its linked venue rows'. */
export const ACCOUNT_BOOKINGS_WHERE = '(r.user_id = ? OR r.user_id IN (SELECT id FROM users WHERE account_id = ?))';

export async function listAccountBookings(db: D1Database, accountId: string, url: URL, limit = 500): Promise<AccountBooking[]> {
	const rows = await dbAll<Omit<AccountBooking, 'href'>>(
		db,
		`SELECT r.*, h.name AS hall_name, h.slug AS hall_slug, o.name AS org_name, o.slug AS org_slug
		   FROM reservations r
		   JOIN halls h ON h.id = r.hall_id
		   JOIN organizations o ON o.id = r.org_id
		  WHERE ${ACCOUNT_BOOKINGS_WHERE}
		  ORDER BY r.event_date DESC
		  LIMIT ?`,
		accountId,
		accountId,
		limit
	);
	const bases = new Map<string, string>();
	const out: AccountBooking[] = [];
	for (const r of rows) {
		let href: string;
		if (r.user_id === accountId) {
			// Made on hallify.sk by the account itself (a member booking at their venue).
			href = `/app/reservation/${r.id}`;
		} else {
			const orgId = String(r.org_id);
			let base = bases.get(orgId);
			if (!base) {
				// Locally there is no public host: the venue's subdomain of this one.
				base = (await orgPublicBaseUrl(db, orgId, url)) ?? `${url.protocol}//${r.org_slug}.${url.host}`;
				bases.set(orgId, base);
			}
			href = `${base}/halls/my-reservations/${r.id}`;
		}
		out.push({ ...r, href });
	}
	return out;
}

/** An upcoming booking that is still on. */
export function isUpcoming(r: { status: string; event_date: string }, todayISO: string): boolean {
	return r.status !== 'cancelled' && r.status !== 'completed' && String(r.event_date).slice(0, 10) >= todayISO;
}
