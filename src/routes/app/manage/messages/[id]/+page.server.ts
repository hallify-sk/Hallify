import type { PageServerLoad, Actions } from './$types';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { TicketRow, MessageRow } from '$lib/db/index';
import { error, fail } from '@sveltejs/kit';
import { notifyNewMessage } from '$lib/email';
import { st } from '$lib/i18n-server';
// NOT converted to requireOrgPermission on purpose — see the note in
// ../+page.server.ts. messages.view and messages.send are both held by the seeded
// default "Member" role, so gating this thread view and its five mutating actions
// on them would open every customer conversation to any member of the org.
import { requireOrgStaff } from '$lib/guards';

export const load: PageServerLoad = async ({ params, locals }) => {
	const orgId = requireOrgStaff(locals).id;
	const ticket = await dbFirst<TicketRow & { user_first_name: string; user_last_name: string; user_email: string }>(
		locals.db,
		`SELECT t.*, u.first_name AS user_first_name, u.last_name AS user_last_name, u.email AS user_email
		FROM tickets t JOIN users u ON u.id = t.user_id
		WHERE t.id = ? AND t.org_id = ?`,
		params.id, orgId
	);
	if (!ticket) error(404, st(locals.locale).serverErrors.ticketNotFound);

	const messages = await dbAll<MessageRow & { sender_first_name: string; sender_last_name: string; sender_role: string }>(
		locals.db,
		`SELECT m.*, u.first_name AS sender_first_name, u.last_name AS sender_last_name, u.role AS sender_role
		FROM messages m JOIN users u ON u.id = m.sender_id
		WHERE m.ticket_id = ? AND EXISTS (SELECT 1 FROM tickets t WHERE t.id = m.ticket_id AND t.org_id = ?)
		ORDER BY m.created_at ASC`,
		params.id, orgId
	);

	return { ticket, messages };
};

export const actions: Actions = {
	send: async ({ request, params, locals }) => {
	  const org = requireOrgStaff(locals);
		if (!locals.user) return fail(401);
		const data = await request.formData();
		const body = String(data.get('body') ?? '').trim();
		// Rendered straight into an href, so the scheme must be constrained — a
		// `javascript:` URI here would execute in the viewer's session. Attachments are
		// always same-origin R2 objects served from /uploads/, so require that shape.
		const rawAttachmentUrl = String(data.get('attachmentUrl') ?? '').trim();
		if (rawAttachmentUrl && !rawAttachmentUrl.startsWith('/uploads/')) {
			return fail(400, { error: st(locals.locale).serverErrors.messageRequired });
		}
		const attachmentUrl = rawAttachmentUrl || null;
		const attachmentName = String(data.get('attachmentName') ?? '').trim() || null;
		const attachmentType = String(data.get('attachmentType') ?? '').trim() || null;
		if (!body && !attachmentUrl) return fail(400, { error: st(locals.locale).serverErrors.messageRequired });

		await dbRun(
			locals.db,
			`INSERT INTO messages (id, ticket_id, sender_id, body, attachment_url, attachment_name, attachment_type)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			crypto.randomUUID(), params.id, locals.user.id, body || '', attachmentUrl, attachmentName, attachmentType
		);
		await dbRun(locals.db, `UPDATE tickets SET updated_at = datetime('now') WHERE id = ? AND org_id = ?`, params.id, org.id);

		// Notify the ticket owner
		const tk = await dbFirst<{ subject: string; user_email: string }>(
			locals.db,
			`SELECT t.subject, u.email AS user_email FROM tickets t JOIN users u ON u.id = t.user_id WHERE t.id = ? AND t.org_id = ?`,
			params.id, org.id
		);
		if (tk?.user_email) {
			notifyNewMessage(locals.db, locals.currentOrg!.id, tk.user_email, tk.subject, `${locals.user.first_name} ${locals.user.last_name}`, { ticketId: params.id, message: body }).catch(() => {});
		}

		return { success: true };
	},
	editMessage: async ({ request, locals }) => {
	  const org = requireOrgStaff(locals);
		if (!locals.user) return fail(401);
		const data = await request.formData();
		const messageId = String(data.get('messageId') ?? '');
		const body = String(data.get('body') ?? '').trim();
		if (!messageId || !body) return fail(400, { error: st(locals.locale).serverErrors.invalid });

		// Only allow editing own messages that are text type
		const msg = await dbFirst<{ sender_id: string; message_type: string }>(
			locals.db,
			`SELECT m.sender_id, m.message_type FROM messages m JOIN tickets t ON t.id = m.ticket_id
			 WHERE m.id = ? AND t.org_id = ?`,
			messageId, org.id
		);
		if (!msg || msg.sender_id !== locals.user.id || msg.message_type !== 'text') return fail(403);

		await dbRun(locals.db, `UPDATE messages SET body = ?, edited_at = datetime('now')
			 WHERE id = ? AND ticket_id IN (SELECT id FROM tickets WHERE org_id = ?)`,
			body, messageId, org.id);
		return { success: true };
	},
	deleteMessage: async ({ request, locals }) => {
	  const org = requireOrgStaff(locals);
		if (!locals.user) return fail(401);
		const data = await request.formData();
		const messageId = String(data.get('messageId') ?? '');
		if (!messageId) return fail(400, { error: st(locals.locale).serverErrors.invalid });

		const msg = await dbFirst<{ sender_id: string; message_type: string }>(
			locals.db,
			`SELECT m.sender_id, m.message_type FROM messages m JOIN tickets t ON t.id = m.ticket_id
			 WHERE m.id = ? AND t.org_id = ?`,
			messageId, org.id
		);
		if (!msg || msg.message_type !== 'text') return fail(403);
		// Org owners/admins can delete any text message; others only their own
		const isOrgAdmin = locals.currentOrg?.role === 'owner' || locals.currentOrg?.role === 'admin';
		if (!isOrgAdmin && msg.sender_id !== locals.user.id) return fail(403);

		await dbRun(locals.db, `DELETE FROM messages WHERE id = ? AND ticket_id IN (SELECT id FROM tickets WHERE org_id = ?)`,
			messageId, org.id);
		return { success: true };
	},
	close: async ({ params, locals }) => {
	  const org = requireOrgStaff(locals);
		await dbRun(locals.db, `UPDATE tickets SET status = 'closed', updated_at = datetime('now') WHERE id = ? AND org_id = ?`, params.id, org.id);
		return { success: true };
	},
	reopen: async ({ params, locals }) => {
	  const org = requireOrgStaff(locals);
		await dbRun(locals.db, `UPDATE tickets SET status = 'open', updated_at = datetime('now') WHERE id = ? AND org_id = ?`, params.id, org.id);
		return { success: true };
	}
};
