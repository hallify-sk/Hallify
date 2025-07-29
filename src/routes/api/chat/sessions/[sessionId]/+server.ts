import { json, type RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { chatSessions } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

// Assign admin to a chat session
export async function PATCH({ request, locals }: RequestEvent) {
	if (!locals.user || locals.permission?.name !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { sessionId } = await request.json();
	if (!sessionId) {
		return json({ error: 'Missing sessionId' }, { status: 400 });
	}

	const [session] = await db.update(chatSessions)
		.set({ 
			assignedAdminId: locals.user.id,
			updatedAt: new Date()
		})
		.where(eq(chatSessions.id, sessionId))
		.returning();

	return json(session);
}

// Close/resolve a chat session
export async function PUT({ request, locals }: RequestEvent) {
	if (!locals.user || locals.permission?.name !== 'admin') {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { sessionId, status } = await request.json();
	if (!sessionId || !status) {
		return json({ error: 'Missing sessionId or status' }, { status: 400 });
	}

	const [session] = await db.update(chatSessions)
		.set({ 
			status,
			updatedAt: new Date()
		})
		.where(eq(chatSessions.id, sessionId))
		.returning();

	return json(session);
}
