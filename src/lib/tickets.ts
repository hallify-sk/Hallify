import { dbFirst } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';
import { logReservationActivity, parseSystemBody } from '$lib/server/reservation-activity';

/**
 * Record an activity-log entry for a reservation, like "X changed status to Y".
 *
 * This used to find or create a ticket WITHOUT an organisation keyed by
 * "[Reservation] <title>" and post a 'system' message into it. Nobody could open
 * those threads, yet each one counted as an unread message for the client — the
 * phantom "Správy 1" badge. Entries now go to the reservation's activity history,
 * which the staff event page shows.
 *
 * Pass `reservationId` when you have it; without it the reservation is looked up by
 * its owner and title (the old key), most recent first.
 * Non-critical: errors are logged but don't propagate.
 */
export async function postSystemMessage(
	db: D1Database,
	userId: string,
	reservationTitle: string,
	body: string,
	senderId: string,
	reservationId?: string
): Promise<string | null> {
	try {
		const res = reservationId
			? await dbFirst<{ id: string; org_id: string | null }>(db, 'SELECT id, org_id FROM reservations WHERE id = ?', reservationId)
			: await dbFirst<{ id: string; org_id: string | null }>(db,
				'SELECT id, org_id FROM reservations WHERE user_id = ? AND title = ? ORDER BY created_at DESC LIMIT 1',
				userId, reservationTitle);
		if (!res) return null;
		const parsed = parseSystemBody(body);
		await logReservationActivity(db, {
			reservationId: res.id,
			orgId: res.org_id,
			actorId: senderId,
			actorName: parsed.actorName,
			kind: parsed.kind,
			status: parsed.status,
		});
		return res.id;
	} catch (err) {
		console.error('postSystemMessage failed:', err);
		return null;
	}
}
