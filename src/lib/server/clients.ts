// The client list (D10): loading what $lib/clients builds the list from, one client's
// card, and the team's notes about a client.
//
// The list is built in memory from the venue's reservations and client accounts: a
// venue has hundreds or a few thousand bookings, and building it in one place keeps
// the grouping of phone-booking guests (by contact, see $lib/clients) out of SQL.

import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import {
	buildClientList, bookingClientKey,
	type ClientAccountRow, type ClientBookingRow, type ClientNoteRow, type ClientSummary,
} from '$lib/clients';
import { clientFeedback, type FeedbackListItem } from '$lib/server/feedback';
import type { D1Database } from '@cloudflare/workers-types';

interface Sources {
	accounts: ClientAccountRow[];
	bookings: ClientBookingRow[];
	ratings: Array<{ user_id: string | null; rating: number }>;
	notes: ClientNoteRow[];
}

const BOOKINGS_SQL = `
	SELECT r.id, r.user_id, (u.account_type = 'client') AS owner_is_client,
	       r.customer_name, r.customer_contact,
	       (SELECT ri.email FROM reservation_invites ri
	         WHERE ri.reservation_id = r.id AND ri.accepted_at IS NULL
	         ORDER BY ri.created_at DESC LIMIT 1) AS invite_email,
	       (SELECT TRIM(ri.first_name || ' ' || ri.last_name) FROM reservation_invites ri
	         WHERE ri.reservation_id = r.id AND ri.accepted_at IS NULL
	         ORDER BY ri.created_at DESC LIMIT 1) AS invite_name,
	       r.title, r.event_date, r.status, r.hall_id, h.name AS hall_name, r.created_at
	  FROM reservations r
	  JOIN halls h ON h.id = r.hall_id
	  LEFT JOIN users u ON u.id = r.user_id
	 WHERE r.org_id = ?`;

async function loadSources(db: D1Database, orgId: string): Promise<Sources> {
	const accounts = await dbAll<ClientAccountRow>(db,
		`SELECT id, first_name, last_name, email, created_at FROM users
		  WHERE org_id = ? AND account_type = 'client'`, orgId);
	const bookings = await dbAll<ClientBookingRow>(db, BOOKINGS_SQL, orgId);
	// Both tables arrive with migration 0031b; before it there is nothing to add.
	const ratings = await dbAll<{ user_id: string | null; rating: number }>(db,
		'SELECT user_id, rating FROM reservation_feedback WHERE org_id = ?', orgId).catch(() => []);
	const notes = await dbAll<ClientNoteRow>(db,
		`SELECT n.client_key, n.phone, n.notes, n.updated_at,
		        NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS updated_by_name
		   FROM client_notes n LEFT JOIN users u ON u.id = n.updated_by
		  WHERE n.org_id = ?`, orgId).catch(() => []);
	return { accounts, bookings, ratings, notes };
}

export async function loadClientList(db: D1Database, orgId: string, todayISO: string): Promise<ClientSummary[]> {
	return buildClientList({ ...(await loadSources(db, orgId)), todayISO });
}

export interface ClientCard {
	client: ClientSummary;
	registeredAt: string | null;
	bookings: Array<Pick<ClientBookingRow, 'id' | 'title' | 'event_date' | 'status' | 'hall_id' | 'hall_name' | 'created_at'>>;
	feedback: FeedbackListItem[];
	threads: Array<{ id: string; subject: string; status: string; updated_at: string; reservation_id: string | null; message_count: number }>;
	notes: ClientNoteRow | null;
	upcoming: number;
	completed: number;
}

/** One client's card, or null when the key is not a client of this venue. */
export async function loadClientCard(db: D1Database, orgId: string, key: string, todayISO: string): Promise<ClientCard | null> {
	const sources = await loadSources(db, orgId);
	const client = buildClientList({ ...sources, todayISO }).find((c) => c.key === key);
	if (!client) return null;

	const accountByEmail = new Map(sources.accounts.map((a) => [a.email.trim().toLowerCase(), a.id]));
	const bookings = sources.bookings
		.filter((b) => bookingClientKey(b, accountByEmail) === key)
		.sort((a, b) => b.event_date.localeCompare(a.event_date))
		.map(({ id, title, event_date, status, hall_id, hall_name, created_at }) => ({ id, title, event_date, status, hall_id, hall_name, created_at }));

	const threads = client.userId
		? await dbAll<ClientCard['threads'][number]>(db,
			`SELECT t.id, t.subject, t.status, t.updated_at, t.reservation_id,
			        (SELECT COUNT(*) FROM messages m WHERE m.ticket_id = t.id AND m.message_type != 'system') AS message_count
			   FROM tickets t
			  WHERE t.org_id = ? AND t.user_id = ?
			  ORDER BY t.updated_at DESC`, orgId, client.userId)
		: [];

	return {
		client,
		registeredAt: client.kind === 'account' ? client.since : null,
		bookings,
		feedback: client.userId ? await clientFeedback(db, orgId, client.userId) : [],
		threads,
		notes: sources.notes.find((n) => n.client_key === key) ?? null,
		upcoming: bookings.filter((b) => b.status !== 'cancelled' && b.status !== 'completed' && b.event_date.slice(0, 10) >= todayISO).length,
		completed: bookings.filter((b) => b.status === 'completed').length,
	};
}

export async function saveClientNotes(db: D1Database, orgId: string, key: string, values: { phone: string | null; notes: string | null }, userId: string): Promise<void> {
	await dbRun(db,
		`INSERT INTO client_notes (org_id, client_key, phone, notes, updated_by, updated_at)
		 VALUES (?, ?, ?, ?, ?, datetime('now'))
		 ON CONFLICT (org_id, client_key) DO UPDATE SET
		   phone = excluded.phone, notes = excluded.notes, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
		orgId, key, values.phone, values.notes, userId);
}

/** The client key of a reservation's client, for linking a booking to the card. */
export async function reservationClientKey(db: D1Database, orgId: string, reservationId: string): Promise<string | null> {
	const b = await dbFirst<ClientBookingRow>(db, `${BOOKINGS_SQL} AND r.id = ?`, orgId, reservationId);
	if (!b) return null;
	let accountByEmail = new Map<string, string>();
	const email = b.invite_email ?? (b.customer_contact?.includes('@') ? b.customer_contact : null);
	if (!b.owner_is_client && email) {
		const rows = await dbAll<{ id: string; email: string }>(db,
			`SELECT id, email FROM users WHERE org_id = ? AND account_type = 'client'`, orgId);
		accountByEmail = new Map(rows.map((r) => [r.email.trim().toLowerCase(), r.id]));
	}
	return bookingClientKey(b, accountByEmail);
}
