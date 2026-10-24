// A reservation's history: who created it, changed its status, declined it, edited
// its details or handed it to a client, and when. Shown on the staff event page.
//
// It replaces the "system" messages that used to be posted into tickets without an
// organisation — threads nobody could open, which still counted as unread.

import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';
import { EXPIRE_PAST_REQUESTS_SQL } from '$lib/server/reservation-rules';

export type ActivityKind = 'created' | 'status' | 'declined' | 'expired' | 'edited' | 'assigned';

export interface ActivityInput {
	reservationId: string;
	orgId: string | null;
	actorId?: string | null;
	actorName?: string | null;
	kind: ActivityKind;
	status?: string | null;
	note?: string | null;
}

export interface ActivityRow {
	id: string;
	kind: ActivityKind;
	status: string | null;
	note: string | null;
	actor_name: string | null;
	created_at: string;
}

/** Never throws: history is a record, not a reason for the action itself to fail. */
export async function logReservationActivity(db: D1Database, a: ActivityInput): Promise<void> {
	try {
		await dbRun(db,
			`INSERT INTO reservation_activity (id, reservation_id, org_id, actor_id, actor_name, kind, status, note)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			crypto.randomUUID(), a.reservationId, a.orgId, a.actorId ?? null, a.actorName ?? null,
			a.kind, a.status ?? null, a.note ? a.note.slice(0, 2000) : null);
	} catch (err) {
		console.error('logReservationActivity failed:', err);
	}
}

export async function listReservationActivity(db: D1Database, reservationId: string, limit = 100): Promise<ActivityRow[]> {
	try {
		return await dbAll<ActivityRow>(db,
			`SELECT id, kind, status, note, actor_name, created_at FROM reservation_activity
			  WHERE reservation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`,
			reservationId, limit);
	} catch {
		return [];
	}
}

/**
 * Who entered a booking: the actor of its 'created' entry, by their current name when
 * the account still exists. A phone booking handed to a client no longer says it,
 * because its owner (`user_id`) is then the client. Null when nothing was recorded.
 */
export async function reservationCreatorName(db: D1Database, reservationId: string): Promise<string | null> {
	try {
		const row = await dbFirst<{ name: string | null }>(db,
			`SELECT COALESCE(NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''), a.actor_name) AS name
			   FROM reservation_activity a LEFT JOIN users u ON u.id = a.actor_id
			  WHERE a.reservation_id = ? AND a.kind = 'created'
			  ORDER BY a.created_at, a.rowid LIMIT 1`,
			reservationId);
		return row?.name?.trim() || null;
	} catch {
		return null; // before migration 0018
	}
}

/**
 * The legacy system-message body — `status_change:<status>:<actor>` or
 * `reservation_created:<status>:<actor>` — as an activity entry.
 */
export function parseSystemBody(body: string): { kind: ActivityKind; status: string | null; actorName: string | null } {
	const [type, status, ...rest] = body.split(':');
	const actorName = rest.join(':') || null;
	if (type === 'reservation_created') return { kind: 'created', status: status || null, actorName };
	return { kind: 'status', status: status || null, actorName };
}

/**
 * Requests whose date passed while they were still waiting for an answer expire:
 * they are cancelled (cancelled_by = 'expired') with a history entry, and can no
 * longer be approved. Run from the request-time sweep next to auto-completion.
 */
export async function expirePastRequests(db: D1Database): Promise<void> {
	const [logSql, updateSql] = EXPIRE_PAST_REQUESTS_SQL;
	try { await dbRun(db, logSql); } catch { /* reservation_activity arrives with migration 0018 */ }
	await dbRun(db, updateSql);
}
