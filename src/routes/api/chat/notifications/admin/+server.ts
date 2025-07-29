import { json, type RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { chatSessions, chatMessages } from '$lib/server/schema';
import { eq, sql, and, isNull } from 'drizzle-orm';

// Get admin notifications (unread message counts)
export async function GET({ locals }: RequestEvent) {
	if (!locals.user || locals.permission?.name !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	// Count unread messages from non-admin users
	const result = await db
		.select({
			unreadCount: sql<number>`COUNT(*)`
		})
		.from(chatMessages)
		.innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
		.where(and(
			eq(chatMessages.isRead, false),
			eq(chatSessions.status, 'active'),
			// Only count messages from guests/users, not other admins
			sql`${chatMessages.senderType} != 'admin'`
		));

	const unreadCount = result[0]?.unreadCount || 0;

	return json({ unreadCount });
}
