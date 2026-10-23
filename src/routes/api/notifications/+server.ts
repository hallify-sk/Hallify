import { json } from '@sveltejs/kit';
import { unreadMessageCount } from '$lib/unread';
import { unreadAnnouncementCount, unreadAnnouncements } from '$lib/announcements';
import { notificationAreas } from '$lib/notification-centre';
import { unreadNotificationCount } from '$lib/server/notification-centre';
import { orgPermissions } from '$lib/server/access';
import type { RequestHandler } from './$types';

// Polled by the app shell (~every 15s) to drive notification sounds + sidebar
// pings without a websocket layer, and the bell's count (D12).
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ unreadMessages: 0, unreadAnnouncements: 0, announcements: [], unreadNotifications: 0 });

	const orgId = locals.currentOrg?.id ?? null;
	const isStaff = locals.currentOrg?.role === 'owner' || locals.currentOrg?.role === 'admin';
	const held = await orgPermissions(locals);

	// The client inbox and the team channels both open on messages.view (D3), the
	// same rule the root layout counts by.
	const readsMessages = held.has('messages.view');
	const unreadMessages = await unreadMessageCount(locals.db, locals.user.id, orgId, readsMessages, readsMessages);

	let annUnread = 0;
	let announcements: { id: string; level: string; title: string }[] = [];
	if (isStaff && orgId) {
		annUnread = await unreadAnnouncementCount(locals.db, locals.user.id, orgId);
		if (annUnread > 0) {
			announcements = (await unreadAnnouncements(locals.db, locals.user.id, orgId))
				.map((a) => ({ id: a.id, level: a.level, title: a.title }));
		}
	}

	const unreadNotifications = orgId && locals.user.account_type !== 'client'
		? await unreadNotificationCount(locals.db, { orgId, userId: locals.user.id, areas: notificationAreas(held) })
		: 0;

	return json({ unreadMessages, unreadAnnouncements: annUnread, announcements, unreadNotifications });
};
