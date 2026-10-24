// Bookings across venues for one Hallify account (D4): its own, and those of every
// venue client row linked to it. Each links to where it can be opened: a booking
// made on a venue's site opens on that site (sessions stay host-scoped, and the same
// Hallify email and password sign in there).

import { dbAll } from '$lib/db/index';
import { orgPublicBaseUrl } from '$lib/orgUrl';
import { clientReservationColumns, type ClientReservationRow } from '$lib/reservation-client';
import { accountClientAccess, type ClientAccess } from '$lib/server/reservation-client-access';
import type { D1Database } from '@cloudflare/workers-types';

export type AccountBooking = ClientReservationRow & {
	hall_name: string;
	hall_slug: string | null;
	org_name: string;
	org_slug: string;
	/** 'member': shared with the account by its owner or the venue (0038). */
	access: ClientAccess;
	/** Where to open it. */
	href: string;
};

/** SQL condition matching the account's own bookings and its linked venue rows' —
 *  owned ones only. Lists use accountClientAccess, which adds the shared ones (0038). */
export const ACCOUNT_BOOKINGS_WHERE = '(r.user_id = ? OR r.user_id IN (SELECT id FROM users WHERE account_id = ?))';

/** Its own, its linked venue rows', and the ones shared with either (0038), each with
 *  `access`. Client-safe columns only: a phone booking's staff-only details stay off
 *  the page (B60). */
export async function listAccountBookings(db: D1Database, accountId: string, url: URL, limit = 500): Promise<AccountBooking[]> {
	const a = accountClientAccess(accountId);
	const rows = await dbAll<Omit<AccountBooking, 'href'>>(
		db,
		`SELECT ${clientReservationColumns('r')}, h.name AS hall_name, h.slug AS hall_slug, o.name AS org_name, o.slug AS org_slug,
		        ${a.access.sql} AS access
		   FROM reservations r
		   JOIN halls h ON h.id = r.hall_id
		   JOIN organizations o ON o.id = r.org_id
		  WHERE ${a.where.sql}
		  ORDER BY r.event_date DESC
		  LIMIT ?`,
		...a.access.params,
		...a.where.params,
		limit
	);
	const bases = new Map<string, string>();
	const out: AccountBooking[] = [];
	for (const r of rows) {
		let href: string;
		if (r.user_id === accountId && r.access === 'owner') {
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
