// A reservation's history: who created it, changed its status, declined it, edited
// its details or handed it to a client, and when. Shown on the staff event page.
//
// It replaces the "system" messages that used to be posted into tickets without an
// organisation — threads nobody could open, which still counted as unread.

import { dbAll, dbRun } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';

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
 * The legacy system-message body — `status_change:<status>:<actor>` or
 * `reservation_created:<status>:<actor>` — as an activity entry.
 */
export function parseSystemBody(body: string): { kind: ActivityKind; status: string | null; actorName: string | null } {
	const [type, status, ...rest] = body.split(':');
	const actorName = rest.join(':') || null;
	if (type === 'reservation_created') return { kind: 'created', status: status || null, actorName };
	return { kind: 'status', status: status || null, actorName };
}
