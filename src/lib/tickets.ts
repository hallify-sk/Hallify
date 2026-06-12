import sql from '$lib/db';

/**
 * Find or create a ticket for a reservation, then post a system message.
 * System messages are activity-log entries like "X changed status to Y".
 * Non-critical: errors are logged but don't propagate.
 */
export async function postSystemMessage(
	userId: string,
	reservationTitle: string,
	body: string,
	senderId: string
): Promise<string | null> {
	try {
		const subject = `[Reservation] ${reservationTitle}`;

		// Find existing ticket or create one
		let [ticket] = await sql<{ id: string }[]>`
			SELECT id FROM tickets
			WHERE user_id = ${userId} AND subject = ${subject}
			ORDER BY created_at DESC LIMIT 1
		`;
		if (!ticket) {
			[ticket] = await sql<{ id: string }[]>`
				INSERT INTO tickets (user_id, subject) VALUES (${userId}, ${subject}) RETURNING id
			`;
		}

		await sql`
			INSERT INTO messages (ticket_id, sender_id, body, message_type)
			VALUES (${ticket.id}, ${senderId}, ${body}, 'system')
		`;
		await sql`UPDATE tickets SET updated_at = NOW(), status = 'open' WHERE id = ${ticket.id}`;

		return ticket.id;
	} catch (err) {
		console.error('postSystemMessage failed:', err);
		return null;
	}
}
