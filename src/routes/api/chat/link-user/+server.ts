import { json, type RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { chatSessions } from '$lib/server/schema';
import { eq, and, isNull } from 'drizzle-orm';

// Link guest chat sessions to user when they sign in
export async function POST({ request, locals }: RequestEvent) {
	if (!locals.user) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const { guestIdentifier } = await request.json();
	if (!guestIdentifier) {
		return json({ error: 'Missing guestIdentifier' }, { status: 400 });
	}

	// Find any active chat sessions for this guest that aren't linked to a user
	const sessions = await db.update(chatSessions)
		.set({ 
			userId: locals.user.id,
			updatedAt: new Date()
		})
		.where(and(
			eq(chatSessions.guestIdentifier, guestIdentifier),
			isNull(chatSessions.userId),
			eq(chatSessions.status, 'active')
		))
		.returning();

	return json({ linkedSessions: sessions.length });
}
