import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dbFirst } from '$lib/db/index';

// A cheap "has anything changed?" check for an open channel or thread.
//
// The chat used to re-run the whole page load (channels, tickets, members, messages)
// every 3 seconds per open tab — and write a channel read on every one of them. The
// page now polls this read-only marker and reloads only when it changes.
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = locals.user;
	const org = locals.currentOrg;
	if (!user || !org) return json({ marker: null }, { status: 401 });

	const channelId = url.searchParams.get('c');
	const ticketId = url.searchParams.get('t');

	let row: { n: number; last: string | null; edited: string | null } | null = null;
	if (channelId) {
		row = await dbFirst(locals.db,
			`SELECT COUNT(*) AS n, MAX(cm.created_at) AS last, MAX(cm.edited_at) AS edited
			   FROM channel_messages cm JOIN channels c ON c.id = cm.channel_id
			  WHERE cm.channel_id = ? AND c.org_id = ? AND cm.deleted_at IS NULL`,
			channelId, org.id);
	} else if (ticketId) {
		row = await dbFirst(locals.db,
			`SELECT COUNT(*) AS n, MAX(m.created_at) AS last, MAX(m.edited_at) AS edited
			   FROM messages m JOIN tickets t ON t.id = m.ticket_id
			  WHERE m.ticket_id = ? AND t.org_id = ? AND t.user_id = ?`,
			ticketId, org.id, user.id);
	}

	return json(
		{ marker: row ? `${row.n}|${row.last ?? ''}|${row.edited ?? ''}` : null },
		{ headers: { 'cache-control': 'no-store' } }
	);
};
