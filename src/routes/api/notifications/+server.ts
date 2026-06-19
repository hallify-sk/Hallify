import { json } from '@sveltejs/kit';
import { unreadMessageCount } from '$lib/unread';
import { unreadAnnouncementCount, unreadAnnouncements } from '$lib/announcements';
import type { RequestHandler } from './$types';

// Polled by the app shell (~every 15s) to drive notification sounds + sidebar
// pings without a websocket layer.
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ unreadMessages: 0, unreadAnnouncements: 0, announcements: [] });

	const orgId = locals.currentOrg?.id ?? null;
	const isStaff = locals.currentOrg?.role === 'owner' || locals.currentOrg?.role === 'admin';

	const unreadMessages = await unreadMessageCount(locals.db, locals.user.id, orgId, isStaff);

	let annUnread = 0;
	let announcements: { id: string; level: string; title: string }[] = [];
	if (isStaff && orgId) {
		annUnread = await unreadAnnouncementCount(locals.db, locals.user.id, orgId);
		if (annUnread > 0) {
			announcements = (await unreadAnnouncements(locals.db, locals.user.id, orgId))
				.map((a) => ({ id: a.id, level: a.level, title: a.title }));
		}
	}

	return json({ unreadMessages, unreadAnnouncements: annUnread, announcements });
};
