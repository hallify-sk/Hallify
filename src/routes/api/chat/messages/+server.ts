import { json, type RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { chatMessages, chatSessions } from '$lib/server/schema';
import { eq, and, gt } from 'drizzle-orm';

// Get messages for a session (with polling support)
export async function GET({ url }: RequestEvent) {
	try {
		const sessionId = url.searchParams.get('sessionId');
		const since = url.searchParams.get('since'); // ISO timestamp
		if (!sessionId) return json({ error: 'Missing sessionId' }, { status: 400 });

		// First verify the session exists
		const existingSession = await db.select()
			.from(chatSessions)
			.where(eq(chatSessions.id, sessionId))
			.limit(1);

		if (existingSession.length === 0) {
			return json({ error: 'Session not found' }, { status: 404 });
		}

		const whereConditions = [eq(chatMessages.sessionId, sessionId)];
		if (since) {
			whereConditions.push(gt(chatMessages.createdAt, new Date(since)));
		}

		const messages = await db.select().from(chatMessages)
			.where(and(...whereConditions))
			.orderBy(chatMessages.createdAt);
		
		// Include session status in response for the client to handle UI states
		return json({ 
			messages, 
			sessionStatus: existingSession[0].status,
			sessionId: existingSession[0].id
		});
	} catch (error) {
		console.error('Error loading messages:', error);
		return json({ error: 'Failed to load messages' }, { status: 500 });
	}
}

// Send a message
export async function POST({ request, locals }: RequestEvent) {
	try {
		const { sessionId, message, senderType } = await request.json();
		if (!sessionId || !message || !senderType) {
			return json({ error: 'Missing fields' }, { status: 400 });
		}

		// First verify the session exists
		const existingSession = await db.select()
			.from(chatSessions)
			.where(eq(chatSessions.id, sessionId))
			.limit(1);

		if (existingSession.length === 0) {
			return json({ error: 'Session not found' }, { status: 404 });
		}

		const session = existingSession[0];

		// If session is closed and this is from a guest/user, reopen it
		if (session.status === 'closed' && senderType !== 'admin') {
			await db.update(chatSessions)
				.set({ 
					status: 'active',
					assignedAdminId: null, // Clear assigned admin so it can be reassigned
					updatedAt: new Date()
				})
				.where(eq(chatSessions.id, sessionId));
		}

		const senderId = locals.user?.id || null;
		const [msg] = await db.insert(chatMessages).values({
			sessionId,
			senderId,
			senderType,
			message
		}).returning();

		// Update session lastMessageAt
		await db.update(chatSessions)
			.set({ lastMessageAt: new Date() })
			.where(eq(chatSessions.id, sessionId));

		return json(msg);
	} catch (error) {
		console.error('Error sending message:', error);
		return json({ error: 'Failed to send message' }, { status: 500 });
	}
}
