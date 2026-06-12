import type { PageServerLoad, Actions } from './$types';
import sql from '$lib/db';
import type { TicketRow, MessageRow } from '$lib/db';
import { error, fail } from '@sveltejs/kit';
import { notifyNewMessage } from '$lib/email';

export const load: PageServerLoad = async ({ params }) => {
	const [ticket] = await sql<TicketRow[]>`
		SELECT t.*, u.first_name AS user_first_name, u.last_name AS user_last_name, u.email AS user_email
		FROM tickets t JOIN users u ON u.id = t.user_id
		WHERE t.id = ${params.id}
	`;
	if (!ticket) error(404, 'Ticket not found');

	const messages = await sql<MessageRow[]>`
		SELECT m.*, u.first_name AS sender_first_name, u.last_name AS sender_last_name, u.role AS sender_role
		FROM messages m JOIN users u ON u.id = m.sender_id
		WHERE m.ticket_id = ${params.id}
		ORDER BY m.created_at ASC
	`;

	return { ticket, messages };
};

export const actions: Actions = {
	send: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401);
		const data = await request.formData();
		const body = String(data.get('body') ?? '').trim();
		const attachmentUrl = String(data.get('attachmentUrl') ?? '').trim() || null;
		const attachmentName = String(data.get('attachmentName') ?? '').trim() || null;
		const attachmentType = String(data.get('attachmentType') ?? '').trim() || null;
		if (!body && !attachmentUrl) return fail(400, { error: 'Message is required' });

		await sql`INSERT INTO messages (ticket_id, sender_id, body, attachment_url, attachment_name, attachment_type)
			VALUES (${params.id}, ${locals.user.id}, ${body || ''}, ${attachmentUrl}, ${attachmentName}, ${attachmentType})`;
		await sql`UPDATE tickets SET updated_at = NOW() WHERE id = ${params.id}`;

		// Notify the ticket owner
		const [tk] = await sql<TicketRow[]>`
			SELECT t.subject, u.email AS user_email FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.id = ${params.id}
		`;
		if (tk?.user_email) {
			notifyNewMessage(tk.user_email, tk.subject, `${locals.user.first_name} ${locals.user.last_name}`).catch(() => {});
		}

		return { success: true };
	},
	editMessage: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const data = await request.formData();
		const messageId = String(data.get('messageId') ?? '');
		const body = String(data.get('body') ?? '').trim();
		if (!messageId || !body) return fail(400, { error: 'Invalid' });

		// Only allow editing own messages that are text type
		const [msg] = await sql<{ sender_id: string; message_type: string }[]>`
			SELECT sender_id, message_type FROM messages WHERE id = ${messageId}
		`;
		if (!msg || msg.sender_id !== locals.user.id || msg.message_type !== 'text') return fail(403);

		await sql`UPDATE messages SET body = ${body}, edited_at = NOW() WHERE id = ${messageId}`;
		return { success: true };
	},
	deleteMessage: async ({ request, locals }) => {
		if (!locals.user) return fail(401);
		const data = await request.formData();
		const messageId = String(data.get('messageId') ?? '');
		if (!messageId) return fail(400, { error: 'Invalid' });

		const [msg] = await sql<{ sender_id: string; message_type: string }[]>`
			SELECT sender_id, message_type FROM messages WHERE id = ${messageId}
		`;
		if (!msg || msg.message_type !== 'text') return fail(403);
		// Admins can delete any text message, users only their own
		if (locals.user.role !== 'admin' && msg.sender_id !== locals.user.id) return fail(403);

		await sql`DELETE FROM messages WHERE id = ${messageId}`;
		return { success: true };
	},
	close: async ({ params }) => {
		await sql`UPDATE tickets SET status = 'closed', updated_at = NOW() WHERE id = ${params.id}`;
		return { success: true };
	},
	reopen: async ({ params }) => {
		await sql`UPDATE tickets SET status = 'open', updated_at = NOW() WHERE id = ${params.id}`;
		return { success: true };
	}
};
