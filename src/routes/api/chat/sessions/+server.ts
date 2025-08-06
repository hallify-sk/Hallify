import { json, type RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { chatSessions, chatMessages, users } from '$lib/server/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

// Get all chat sessions (admin only)
export async function GET({ locals, url }: RequestEvent) {
	if (!locals.user || locals.permission?.name !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const status = url.searchParams.get('status') || 'active';
	
	const sessions = await db.select({
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
		assignedAdminFirstName: sql<string>`assigned_admin.first_name`,
		assignedAdminLastName: sql<string>`assigned_admin.last_name`,
		assignedAdminEmail: sql<string>`assigned_admin.email`,
		unreadCount: sql<number>`COUNT(CASE WHEN ${chatMessages.isRead} = false AND ${chatMessages.senderType} != 'admin' THEN 1 END)`
	})
	.from(chatSessions)
	.leftJoin(users, eq(chatSessions.userId, users.id))
	.leftJoin(sql`users AS assigned_admin`, sql`${chatSessions.assignedAdminId} = assigned_admin.id`)
	.leftJoin(chatMessages, eq(chatSessions.id, chatMessages.sessionId))
	.where(eq(chatSessions.status, status))
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
		users.email,
		sql`assigned_admin.first_name`,
		sql`assigned_admin.last_name`,
		sql`assigned_admin.email`
	)
	.orderBy(desc(chatSessions.lastMessageAt));

	return json(sessions);
};

// Create new chat session
export async function POST({ request, locals }: RequestEvent) {
	const { message, subject, guestIdentifier } = await request.json();

	if (!message || !guestIdentifier) {
		return json({ error: 'Message and guest identifier required' }, { status: 400 });
	}

	try {
		const sessionId = nanoid();
		
		// Create session first
		const [session] = await db.insert(chatSessions).values({
			id: sessionId,
			guestIdentifier,
			userId: locals.user?.id || null,
			subject: subject || 'New Chat',
			lastMessageAt: new Date(),
			status: 'active'
		}).returning();

		// Then create first message
		await db.insert(chatMessages).values({
			sessionId: session.id, // Use the returned session ID
			senderId: locals.user?.id || null,
			senderType: locals.user ? 'user' : 'guest',
			message
		});

		return json({ sessionId: session.id, session });
	} catch (error) {
		console.error('Error creating chat session:', error);
		return json({ error: 'Failed to create chat session' }, { status: 500 });
	}
}
