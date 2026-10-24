// What of a reservation row its client may see.
//
// A phone booking keeps staff-only details on the row (customer_name,
// customer_contact, internal_notes: migration 0018). The client's booking page
// selected `r.*`, so once such a booking was assigned to a client those details
// reached their browser in the page HTML and __data.json (B60). The client pages
// select this list instead: anything added to the table later stays off the page
// until somebody decides the client should see it.

import type { ReservationRow } from '$lib/db/index';

export const CLIENT_RESERVATION_COLUMNS = [
	'id', 'org_id', 'hall_id', 'user_id', 'title', 'description', 'event_date', 'start_time', 'end_time',
	'status', 'invite_code', 'num_guests', 'extras_json', 'extras_snapshot_json', 'event_type',
	'status_reason', 'cancelled_by', 'feedback_requested_at', 'created_at',
] as const;

/** Columns only the venue's staff may read. */
export const STAFF_ONLY_RESERVATION_COLUMNS = ['customer_name', 'customer_contact', 'internal_notes'] as const;

/** The client-safe columns as a SELECT list, e.g. `r.id, r.org_id, …`. */
export function clientReservationColumns(alias = 'r'): string {
	return CLIENT_RESERVATION_COLUMNS.map((c) => `${alias}.${c}`).join(', ');
}

export type ClientReservationRow = Omit<ReservationRow, 'layout_json' | 'rsvp_config'> & {
	extras_snapshot_json: string | null;
	status_reason: string | null;
	cancelled_by: string | null;
	feedback_requested_at: string | null;
};
