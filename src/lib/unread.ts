// Unread message count for the sidebar ping + notification poll, and the read
// markers behind it. Covers three perspectives:
//   (1) threads where the user is the client (replies to them),
//   (2) for org staff, their org's inbox (a client wrote and nobody has answered or
//       this staff member has not opened it since),
//   (3) for any org member, team channels with messages they have not read.
//
// "Unread" used to mean "newer than my own last message", so reading a reply never
// cleared the badge, and status changes posted as 'system' messages into tickets
// without an organisation produced counts for threads nobody could open. A message
// is now unread when it is newer than BOTH my last read of the thread and my own
// last message in it; system messages and organisation-less threads never count.

import { dbFirst, dbRun } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';

/** When `userId` last caught up on ticket `t`: their last read or their last message. */
const TICKET_SEEN = (alias: string) => `MAX(
	COALESCE((SELECT tr.last_read_at FROM ticket_reads tr WHERE tr.ticket_id = ${alias}.id AND tr.user_id = ?), ''),
	COALESCE((SELECT MAX(ms.created_at) FROM messages ms WHERE ms.ticket_id = ${alias}.id AND ms.sender_id = ?), ''))`;

/**
 * SQL for "ticket `alias` has a message from someone else that `userId` has not seen".
 * Binds the user id three times, in order.
 */
export function ticketUnreadSql(alias = 't'): string {
	return `EXISTS (
		SELECT 1 FROM messages mu WHERE mu.ticket_id = ${alias}.id AND mu.sender_id != ?
		  AND mu.message_type != 'system'
		  AND mu.created_at > ${TICKET_SEEN(alias)})`;
}

/**
 * SQL for "channel `alias` has messages from others that `userId` has not read". A
 * channel nobody opened yet counts from the later of its creation and the member
 * joining, so a new colleague does not inherit the whole history as unread.
 * Binds: userId (reads), orgId + userId (join date), userId (sender).
 */
export function channelUnreadCountSql(alias = 'c'): string {
	return `(SELECT COUNT(*) FROM channel_messages cmu
		WHERE cmu.channel_id = ${alias}.id AND cmu.deleted_at IS NULL
		  AND cmu.created_at > COALESCE(
		    (SELECT cr.last_read_at FROM channel_reads cr WHERE cr.channel_id = ${alias}.id AND cr.user_id = ?),
		    MAX(${alias}.created_at, COALESCE((SELECT om.joined_at FROM organization_members om WHERE om.org_id = ? AND om.user_id = ?), '')))
		  AND cmu.sender_id != ?)`;
}

/**
 * `isStaff` reads "may read the organisation's client inbox" and `canReadChannels`
 * "may read the team channels": both are messages.view since D3, so a member
 * denied it is not pinged for threads they cannot open (announcement channels
 * still count: they are for everyone).
 */
export async function unreadMessageCount(
	db: D1Database,
	userId: string,
	orgId: string | null,
	isStaff: boolean,
	canReadChannels = true
): Promise<number> {
	let n = 0;

	// (1) Threads I own (as a client, or a member writing to their own venue).
	try {
		const mine = await dbFirst<{ n: number }>(db,
			`SELECT COUNT(*) AS n FROM tickets t
			 WHERE t.user_id = ? AND t.org_id IS NOT NULL AND ${ticketUnreadSql('t')}`,
			userId, userId, userId, userId);
		n += mine?.n ?? 0;
	} catch { /* ticket_reads arrives with migration 0018 */ }

	if (orgId && isStaff) {
		// (2) Org inbox: the client's latest message is newer than the last staff reply
		//     and newer than the last time I opened the thread.
		try {
			const inbox = await dbFirst<{ n: number }>(db,
				`SELECT COUNT(*) AS n FROM tickets t
				 WHERE t.org_id = ? AND t.status = 'open' AND t.user_id != ?
				   AND EXISTS (
				     SELECT 1 FROM messages m WHERE m.ticket_id = t.id AND m.sender_id = t.user_id
				       AND m.message_type != 'system'
				       AND m.created_at > COALESCE(
				         (SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.ticket_id = t.id AND m2.sender_id != t.user_id),
				         '')
				       AND m.created_at > COALESCE(
				         (SELECT tr.last_read_at FROM ticket_reads tr WHERE tr.ticket_id = t.id AND tr.user_id = ?),
				         ''))`,
				orgId, userId, userId);
			n += inbox?.n ?? 0;
		} catch { /* ticket_reads arrives with migration 0018 */ }
	}

	if (orgId) {
		// (3) Team channels with unread messages (counted per channel, like threads).
		// Announcement channels are for the whole organisation, messages.view or not.
		try {
			const ch = await dbFirst<{ n: number }>(db,
				`SELECT COUNT(*) AS n FROM channels c
				 WHERE c.org_id = ? AND (? = 1 OR c.type = 'announcement')
				   AND c.archived_at IS NULL AND ${channelUnreadCountSql('c')} > 0`,
				orgId, canReadChannels ? 1 : 0, userId, orgId, userId, userId);
			n += ch?.n ?? 0;
		} catch { /* channels missing on a very old database */ }
	}

	return n;
}

/**
 * Mark a ticket read up to now. Only writes when there is something newer than the
 * stored marker, so a page polling every few seconds does not write on every poll.
 */
export async function markTicketRead(db: D1Database, userId: string, ticketId: string): Promise<void> {
	try {
		await dbRun(db,
			`INSERT INTO ticket_reads (user_id, ticket_id, last_read_at) VALUES (?, ?, datetime('now'))
			 ON CONFLICT (user_id, ticket_id) DO UPDATE SET last_read_at = datetime('now')
			 WHERE ticket_reads.last_read_at < COALESCE((SELECT MAX(created_at) FROM messages WHERE ticket_id = excluded.ticket_id), '')`,
			userId, ticketId);
	} catch { /* ticket_reads arrives with migration 0018 */ }
}

/** Mark a channel read up to now; same write-only-when-needed rule as tickets. */
export async function markChannelRead(db: D1Database, userId: string, channelId: string): Promise<void> {
	await dbRun(db,
		`INSERT INTO channel_reads (user_id, channel_id, last_read_at) VALUES (?, ?, datetime('now'))
		 ON CONFLICT (user_id, channel_id) DO UPDATE SET last_read_at = datetime('now')
		 WHERE channel_reads.last_read_at < COALESCE((SELECT MAX(created_at) FROM channel_messages WHERE channel_id = excluded.channel_id), '')`,
		userId, channelId);
}
