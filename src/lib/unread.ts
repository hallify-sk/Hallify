// Unread message count for the sidebar ping + notification poll. Covers both
// perspectives: threads where the user is the client (replies to them) and, for
// org staff, their org's inbox (client wrote last, staff hasn't replied).

import { dbFirst } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';

export async function unreadMessageCount(
	db: D1Database,
	userId: string,
	orgId: string | null,
	isStaff: boolean
): Promise<number> {
	// (1) Threads I own as a client with a newer reply from someone else.
	const mine = await dbFirst<{ n: number }>(db,
		`SELECT COUNT(DISTINCT t.id) AS n
		 FROM tickets t JOIN messages m ON m.ticket_id = t.id
		 WHERE t.user_id = ? AND t.status = 'open' AND m.sender_id != ?
		   AND m.created_at > COALESCE(
		     (SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.ticket_id = t.id AND m2.sender_id = ?),
		     t.created_at)`,
		userId, userId, userId);

	let n = mine?.n ?? 0;

	// (2) Org inbox: tickets where the client's latest message is newer than the
	//     last staff (non-client) reply — i.e. awaiting the org's response.
	if (isStaff && orgId) {
		const inbox = await dbFirst<{ n: number }>(db,
			`SELECT COUNT(*) AS n FROM tickets t
			 WHERE t.org_id = ? AND t.status = 'open' AND t.user_id != ?
			   AND EXISTS (
			     SELECT 1 FROM messages m WHERE m.ticket_id = t.id AND m.sender_id = t.user_id
			       AND m.created_at > COALESCE(
			         (SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.ticket_id = t.id AND m2.sender_id != t.user_id),
			         '0'))`,
			orgId, userId);
		n += inbox?.n ?? 0;
	}

	return n;
}
