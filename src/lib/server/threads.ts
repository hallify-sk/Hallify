// The message thread (ticket) that belongs to one booking and its client.
//
// Every place that starts a conversation about a booking used to SELECT for an
// existing thread and INSERT a new one when none was found. Two sends in parallel
// (a double-click, two tabs) both found nothing and both inserted, splitting the
// conversation into several threads. Migration 0018 adds a unique index on
// (org_id, reservation_id, user_id); this inserts against it and re-reads, so the
// loser of a race simply joins the winner's thread.

import { dbFirst, dbRun } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';

export async function findOrCreateReservationThread(
	db: D1Database,
	opts: { orgId: string; reservationId: string; userId: string; subject: string }
): Promise<{ id: string; subject: string; created: boolean }> {
	const find = () => dbFirst<{ id: string; subject: string }>(db,
		'SELECT id, subject FROM tickets WHERE org_id = ? AND reservation_id = ? AND user_id = ? ORDER BY created_at LIMIT 1',
		opts.orgId, opts.reservationId, opts.userId);

	const existing = await find();
	if (existing) return { ...existing, created: false };

	const id = crypto.randomUUID();
	const ins = await dbRun(db,
		`INSERT OR IGNORE INTO tickets (id, org_id, user_id, reservation_id, subject, status) VALUES (?, ?, ?, ?, ?, 'open')`,
		id, opts.orgId, opts.userId, opts.reservationId, opts.subject);
	if (ins.meta?.changes === 1) return { id, subject: opts.subject, created: true };

	const winner = await find();
	if (winner) return { ...winner, created: false };
	// Should not happen (the insert was ignored, so a row exists); fall back to ours.
	return { id, subject: opts.subject, created: true };
}

/** Longest message body the app stores. A 200 000-character message was accepted before. */
export const MESSAGE_MAX = 5000;
