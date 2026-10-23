import { error, json } from '@sveltejs/kit';
import {
	listNotifications,
	markAllNotificationsRead,
	markNotificationRead,
	notificationViewer
} from '$lib/server/notification-centre';
import type { RequestHandler } from './$types';

// The bell's panel (D12): the member's recent notifications, and marking them read.
// Same-origin only, like every POST under /api (see the Origin check in hooks).

export const GET: RequestHandler = async ({ locals }) => {
	const viewer = await notificationViewer(locals);
	if (!viewer) error(403, 'Forbidden');
	return json(await listNotifications(locals.db, viewer), { headers: { 'cache-control': 'no-store' } });
};

export const POST: RequestHandler = async ({ locals, request }) => {
	const viewer = await notificationViewer(locals);
	if (!viewer) error(403, 'Forbidden');

	let body: { action?: unknown; id?: unknown };
	try {
		body = await request.json();
	} catch {
		error(400, 'Bad request');
	}

	if (body.action === 'readAll') {
		await markAllNotificationsRead(locals.db, viewer);
	} else if (body.action === 'read' && typeof body.id === 'string' && body.id.length <= 64) {
		await markNotificationRead(locals.db, viewer, body.id);
	} else {
		error(400, 'Bad request');
	}
	return json(await listNotifications(locals.db, viewer));
};
