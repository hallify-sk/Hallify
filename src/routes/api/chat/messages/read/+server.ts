import { json, type RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { chatMessages } from '$lib/server/schema';
import { eq, and, ne } from 'drizzle-orm';

// Mark messages as read
export async function PATCH({ request, locals }: RequestEvent) {
	if (!locals.user || locals.permission?.name !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { sessionId } = await request.json();
	if (!sessionId) {
		return json({ error: 'Missing sessionId' }, { status: 400 });
	}

	// Mark all unread messages in this session as read (except admin messages)
	await db.update(chatMessages)
		.set({ isRead: true })
		.where(and(
			eq(chatMessages.sessionId, sessionId),
			eq(chatMessages.isRead, false),
			ne(chatMessages.senderType, 'admin')
		));

	return json({ success: true });
}
