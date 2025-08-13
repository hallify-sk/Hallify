import { json, type RequestEvent } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { chatSessions } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { checkPathPermission } from '$lib/util';

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
export async function PUT({ request, locals, params }: RequestEvent) {
	const sessionId = params.sessionId;
	const body = await request.json();
	const { status, guestIdentifier } = body;

	if (!sessionId || !status) {
		return json({ error: 'Missing sessionId or status' }, { status: 400 });
	}

	// For admin users, allow closing any session
	if (locals.user && checkPathPermission('/admin/chat', locals.permission)) {
		const [session] = await db.update(chatSessions)
			.set({
				status,
				updatedAt: new Date()
			})
			.where(eq(chatSessions.id, sessionId))
			.returning();

		return json(session);
	}

	// For regular users/guests, allow closing only their own sessions
	if (status === 'closed') {
		// First get the session to check ownership
		const [existingSession] = await db
			.select()
			.from(chatSessions)
			.where(eq(chatSessions.id, sessionId))
			.limit(1);

		if (!existingSession) {
			return json({ error: 'Session not found' }, { status: 404 });
		}

		// Check if user owns this session (either by userId or guestIdentifier)
		const canClose = (locals.user && existingSession.userId === locals.user.id) ||
			(guestIdentifier && existingSession.guestIdentifier === guestIdentifier);

		if (!canClose) {
			return json({ error: 'Unauthorized - can only close your own sessions' }, { status: 403 });
		}

		const [session] = await db.update(chatSessions)
			.set({
				status: 'closed',
				updatedAt: new Date()
			})
			.where(eq(chatSessions.id, sessionId))
			.returning();

		return json(session);
	}

	return json({ error: 'Unauthorized' }, { status: 401 });
}
