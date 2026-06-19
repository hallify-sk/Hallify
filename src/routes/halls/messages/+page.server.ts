import { redirect } from '@sveltejs/kit';
import { dbAll } from '$lib/db/index';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(303, '/login?redirect=/halls/messages');
	const orgId = locals.domainOrg!.id;
	const userId = locals.user.id;

	const threads = await dbAll<{
		id: string; subject: string; status: string; updated_at: string;
		reservation_id: string; res_title: string; event_date: string;
		last_message: string | null; unread: number;
	}>(locals.db,
		`SELECT t.id, t.subject, t.status, t.updated_at, t.reservation_id,
		   r.title AS res_title, r.event_date,
		   (SELECT body FROM messages WHERE ticket_id = t.id AND message_type = 'text' ORDER BY created_at DESC LIMIT 1) AS last_message,
		   CASE WHEN EXISTS (
		     SELECT 1 FROM messages m WHERE m.ticket_id = t.id AND m.sender_id != ?
		       AND m.created_at > COALESCE(
		         (SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.ticket_id = t.id AND m2.sender_id = ?),
		         t.created_at)
		   ) THEN 1 ELSE 0 END AS unread
		FROM tickets t
		JOIN reservations r ON r.id = t.reservation_id
		WHERE t.user_id = ? AND t.org_id = ?
		ORDER BY t.updated_at DESC`,
		userId, userId, userId, orgId
	);

	return { threads };
};
