import { db } from '$lib/server/db';
import { chatSessions, chatMessages, users } from '$lib/server/schema';
import { eq, sql, desc, gte, and, count } from 'drizzle-orm';
import { error, type ServerLoad } from '@sveltejs/kit';

export const load: ServerLoad = async ({ locals }) => {
	if (!locals.user || locals.permission?.name !== 'admin') {
		throw error(403, 'Unauthorized');
	}

	// Date ranges for statistics
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
	const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

	// Get all active chat sessions with unread message counts
	const sessions = await db
		.select({
			id: chatSessions.id,
			guestIdentifier: chatSessions.guestIdentifier,
			userId: chatSessions.userId,
			assignedAdminId: chatSessions.assignedAdminId,
			status: chatSessions.status,
			subject: chatSessions.subject,
			lastMessageAt: chatSessions.lastMessageAt,
			createdAt: chatSessions.createdAt,
			userFirstName: users.first_name,
			userLastName: users.last_name,
			userEmail: users.email,
			unreadCount: sql<number>`COUNT(CASE WHEN ${chatMessages.isRead} = false AND ${chatMessages.senderType} != 'admin' THEN 1 END)`
		})
		.from(chatSessions)
		.leftJoin(users, eq(chatSessions.userId, users.id))
		.leftJoin(chatMessages, eq(chatSessions.id, chatMessages.sessionId))
		.where(eq(chatSessions.status, 'active'))
		.groupBy(
			chatSessions.id, 
			chatSessions.guestIdentifier,
			chatSessions.userId,
			chatSessions.assignedAdminId,
			chatSessions.status,
			chatSessions.subject,
			chatSessions.lastMessageAt,
			chatSessions.createdAt,
			users.first_name, 
			users.last_name,
			users.email
		)
		.orderBy(desc(chatSessions.lastMessageAt));

	// Get statistics
	const [totalChats] = await db
		.select({ count: count() })
		.from(chatSessions);

	const [newChatsToday] = await db
		.select({ count: count() })
		.from(chatSessions)
		.where(gte(chatSessions.createdAt, today));

	const [newChatsThisWeek] = await db
		.select({ count: count() })
		.from(chatSessions)
		.where(gte(chatSessions.createdAt, weekAgo));

	const [closedChatsThisWeek] = await db
		.select({ count: count() })
		.from(chatSessions)
		.where(and(
			eq(chatSessions.status, 'closed'),
			gte(chatSessions.updatedAt, weekAgo)
		));

	const [activeChats] = await db
		.select({ count: count() })
		.from(chatSessions)
		.where(eq(chatSessions.status, 'active'));

	// Get unread messages count
	const [unreadMessages] = await db
		.select({ count: count() })
		.from(chatMessages)
		.innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
		.where(and(
			eq(chatMessages.isRead, false),
			eq(chatMessages.senderType, 'guest'),
			eq(chatSessions.status, 'active')
		));

	return {
		sessions,
		stats: {
			totalChats: totalChats.count,
			newChatsToday: newChatsToday.count,
			newChatsThisWeek: newChatsThisWeek.count,
			closedChatsThisWeek: closedChatsThisWeek.count,
			activeChats: activeChats.count,
			unreadMessages: unreadMessages.count
		}
	};
};
