// Who on the CLIENT side may open a reservation, and as what (shared events, 0038).
//
// The staff side has its own rules (src/lib/server/reservation-access.ts). Here the
// question is the venue site's and the Hallify client area's: may this person see
// this booking, and are they its owner or someone it was shared with?
//
//   owner  — reservations.user_id: the booking's one client. Cancels, changes the
//            booking, rates the event, and shares it with others.
//   member — an accepted row in reservation_members: sees what the owner sees,
//            messages the venue about it, seats the guests when the owner may.
//
// A member row is matched for the same PERSON, not only the same row: the venue
// client row itself, the Hallify account it is linked to (users.account_id), and
// any other row linked to that account ("one account everywhere", D4).
//
// Every page that shows a client a booking must ask through here, and select the
// client-safe columns only (clientReservationColumns, never r.*: B60).

import { dbFirst } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';

export type ClientAccess = 'owner' | 'member';

/** A SQL fragment and the values its placeholders take, in order. */
export interface SqlPart {
	sql: string;
	params: string[];
}

/** Every users.id that is the same person as venue user `?`: the row, its Hallify
 *  account, and the account's other linked rows. Three placeholders. */
const SAME_PERSON = `(SELECT ? AS id
	UNION SELECT account_id FROM users WHERE id = ? AND account_id IS NOT NULL
	UNION SELECT u2.id FROM users u2 JOIN users me ON me.account_id = u2.account_id
	       WHERE me.id = ? AND me.account_id IS NOT NULL)`;

/** "An accepted member row of reservation `alias` for one of `ids`". */
function memberExists(alias: string, ids: string): string {
	return `EXISTS (SELECT 1 FROM reservation_members rm
	          WHERE rm.reservation_id = ${alias}.id AND rm.accepted_at IS NOT NULL AND rm.user_id IN ${ids})`;
}

/**
 * For a venue user (a client row on the venue's site): the WHERE condition "they may
 * see reservation `alias`", and the column that says as what. The owner is the row
 * itself, as before; membership counts for the same person.
 */
export function venueClientAccess(userId: string, alias = 'r'): { where: SqlPart; access: SqlPart } {
	return {
		where: {
			sql: `(${alias}.user_id = ? OR ${memberExists(alias, SAME_PERSON)})`,
			params: [userId, userId, userId, userId],
		},
		access: { sql: `CASE WHEN ${alias}.user_id = ? THEN 'owner' ELSE 'member' END`, params: [userId] },
	};
}

/** The Hallify account and every venue row linked to it. Two placeholders. */
const ACCOUNT_IDS = '(SELECT ? AS id UNION SELECT id FROM users WHERE account_id = ?)';

/**
 * For a Hallify account (the cross-venue list on hallify.sk): its own bookings, its
 * linked venue rows' bookings, and the ones shared with either.
 */
export function accountClientAccess(accountId: string, alias = 'r'): { where: SqlPart; access: SqlPart } {
	return {
		where: {
			sql: `(${alias}.user_id IN ${ACCOUNT_IDS} OR ${memberExists(alias, ACCOUNT_IDS)})`,
			params: [accountId, accountId, accountId, accountId],
		},
		access: {
			sql: `CASE WHEN ${alias}.user_id IN ${ACCOUNT_IDS} THEN 'owner' ELSE 'member' END`,
			params: [accountId, accountId],
		},
	};
}

/** May venue user `userId` see reservation `reservationId` of org `orgId`, and as what. */
export async function clientReservationAccess(
	db: D1Database,
	reservationId: string,
	userId: string,
	orgId: string
): Promise<ClientAccess | null> {
	const a = venueClientAccess(userId);
	try {
		const row = await dbFirst<{ access: ClientAccess }>(
			db,
			`SELECT ${a.access.sql} AS access FROM reservations r
			  WHERE r.id = ? AND r.org_id = ? AND ${a.where.sql}`,
			...a.access.params,
			reservationId,
			orgId,
			...a.where.params
		);
		return row?.access ?? null;
	} catch {
		// Before migration 0038 there are no members: the owner check alone.
		const own = await dbFirst<{ id: string }>(
			db,
			'SELECT id FROM reservations WHERE id = ? AND org_id = ? AND user_id = ?',
			reservationId,
			orgId,
			userId
		);
		return own ? 'owner' : null;
	}
}

/** What each side may do. Members see and seat; only the owner changes the booking. */
export function clientRights(access: ClientAccess | null) {
	const owner = access === 'owner';
	const any = access !== null;
	return {
		view: any,
		message: any,
		/** Seating and guest layout, whenever the booking allows the client to. */
		editLayout: any,
		cancel: owner,
		editBooking: owner,
		feedback: owner,
		manageMembers: owner,
	};
}
