import { dbFirst, dbRun } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * Find or create a ticket for a reservation, then post a system message.
 * System messages are activity-log entries like "X changed status to Y".
 * Non-critical: errors are logged but don't propagate.
 */
export async function postSystemMessage(
	db: D1Database,
	userId: string,
	reservationTitle: string,
	body: string,
	senderId: string
): Promise<string | null> {
	try {
		const subject = `[Reservation] ${reservationTitle}`;

		// Find existing ticket or create one
		let ticket = await dbFirst<{ id: string }>(
			db,
			'SELECT id FROM tickets WHERE user_id = ? AND subject = ? ORDER BY created_at DESC LIMIT 1',
			userId,
			subject
		);
		if (!ticket) {
			const ticketId = crypto.randomUUID();
			await dbRun(db, 'INSERT INTO tickets (id, user_id, subject) VALUES (?, ?, ?)', ticketId, userId, subject);
			ticket = { id: ticketId };
		}

		await dbRun(
			db,
			"INSERT INTO messages (id, ticket_id, sender_id, body, message_type) VALUES (?, ?, ?, ?, 'system')",
			crypto.randomUUID(),
			ticket!.id,
			senderId,
			body
		);
		await dbRun(
			db,
			"UPDATE tickets SET updated_at = datetime('now'), status = 'open' WHERE id = ?",
			ticket!.id
		);

		return ticket!.id;
	} catch (err) {
		console.error('postSystemMessage failed:', err);
		return null;
	}
}
