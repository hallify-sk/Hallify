import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { loginUrl } from '$lib/login-redirect';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { dispatchWebhooks } from '$lib/notifications';
import { notifyGuestMessage } from '$lib/email';
import { st } from '$lib/i18n-server';
import { channelName, channelNameProblem, CHANNEL_DESC_MAX } from '$lib/channels';
import { channelUnreadCountSql, ticketUnreadSql, markChannelRead, markTicketRead } from '$lib/unread';
import { findOrCreateReservationThread, MESSAGE_MAX } from '$lib/server/threads';

const ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const isAdminRole = (role: string | undefined) => role === 'owner' || role === 'admin';

/** An uploaded image from the form, or null; `false` when the fields are malformed. */
function attachmentFrom(data: FormData): { url: string; name: string | null; type: string } | null | false {
  const url = String(data.get('attachment_url') ?? '').trim();
  if (!url) return null;
  if (!/^\/uploads\/[\w\-./]+$/.test(url)) return false;
  const type = String(data.get('attachment_type') ?? '').trim();
  if (!ATTACHMENT_TYPES.includes(type)) return false;
  return { url, name: String(data.get('attachment_name') ?? '').trim().slice(0, 200) || null, type };
}

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, loginUrl(url));
  const user = locals.user;
  const org = locals.currentOrg;
  if (!org) redirect(303, '/app/'); // home offers creating an org; the form itself felt compulsory

  const channelId = url.searchParams.get('c');
  const ticketId  = url.searchParams.get('t');
  const isAdmin = isAdminRole(org.role);

  // ─── Channels ────────────────────────────────────────────────────────────
  // Same unread rule as the sidebar badge ($lib/unread), so the two always agree.
  const channels = await dbAll<{
    id: string; name: string; type: string; description: string | null; archived_at: string | null;
    unread_count: number; last_message_at: string | null;
  }>(locals.db,
    `SELECT c.id, c.name, c.type, c.description, c.archived_at,
      ${channelUnreadCountSql('c')} AS unread_count,
      (SELECT created_at FROM channel_messages WHERE channel_id = c.id
        AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1) AS last_message_at
    FROM channels c
    WHERE c.org_id = ? AND (c.archived_at IS NULL OR ? = 1)
    ORDER BY c.created_at`,
    user.id, org.id, user.id, user.id, org.id, isAdmin ? 1 : 0
  );

  // ─── Client tickets (user's own, with reservation info) ──────────────────
  const tickets = await dbAll<{
    id: string; subject: string; status: string; updated_at: string;
    reservation_id: string | null; hall_name: string | null; event_date: string | null;
    last_message: string | null; unread: number;
  }>(locals.db,
    `SELECT t.id, t.subject, t.status, t.updated_at,
      t.reservation_id, h.name AS hall_name, r.event_date,
      (SELECT body FROM messages WHERE ticket_id = t.id
        AND message_type = 'text' ORDER BY created_at DESC LIMIT 1) AS last_message,
      CASE WHEN ${ticketUnreadSql('t')} THEN 1 ELSE 0 END AS unread
    FROM tickets t
    LEFT JOIN reservations r ON r.id = t.reservation_id
    LEFT JOIN halls h ON h.id = r.hall_id
    WHERE t.user_id = ? AND t.org_id = ?
    ORDER BY t.updated_at DESC`,
    user.id, user.id, user.id, user.id, org.id
  );

  // ─── User's reservations at this org (for new ticket form) ───────────────
  const myReservations = await dbAll<{
    id: string; title: string; hall_name: string; event_date: string; status: string;
  }>(locals.db,
    `SELECT r.id, r.title, h.name AS hall_name, r.event_date, r.status
    FROM reservations r
    JOIN halls h ON h.id = r.hall_id
    WHERE r.user_id = ? AND r.org_id = ?
      AND r.status NOT IN ('cancelled')
    ORDER BY r.event_date DESC`,
    user.id, org.id
  );

  // ─── Org members + presence ──────────────────────────────────────────────
  const members = await dbAll<{
    user_id: string; first_name: string; last_name: string; role: string; is_online: number;
  }>(locals.db,
    `SELECT m.user_id, u.first_name, u.last_name, m.role,
      CASE WHEN p.last_seen_at IS NOT NULL AND p.last_seen_at > datetime('now', '-2 minutes') THEN 1 ELSE 0 END AS is_online
    FROM organization_members m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN user_presence p ON p.user_id = m.user_id AND p.org_id = m.org_id
    WHERE m.org_id = ?
    ORDER BY u.first_name`,
    org.id
  );

  // ─── Active channel ──────────────────────────────────────────────────────
  let activeChannel: typeof channels[0] | null = null;
  let channelMessages: {
    id: string; sender_id: string; body: string; edited_at: string | null; created_at: string;
    attachment_url: string | null; attachment_name: string | null; attachment_type: string | null;
    sender_first_name: string; sender_last_name: string;
  }[] = [];

  if (channelId) {
    activeChannel = channels.find(c => c.id === channelId) ?? null;
    if (activeChannel) {
      // Opening a channel marks it read — but only writes when something new arrived,
      // so a chat left open no longer writes to the database on every poll.
      await markChannelRead(locals.db, user.id, activeChannel.id);
      channelMessages = await dbAll<typeof channelMessages[0]>(locals.db,
        `SELECT * FROM (
           SELECT cm.id, cm.sender_id, cm.body, cm.edited_at, cm.created_at,
                  cm.attachment_url, cm.attachment_name, cm.attachment_type,
                  u.first_name AS sender_first_name, u.last_name AS sender_last_name
           FROM channel_messages cm
           JOIN users u ON u.id = cm.sender_id
           WHERE cm.channel_id = ? AND cm.deleted_at IS NULL
           ORDER BY cm.created_at DESC LIMIT 300
         ) ORDER BY created_at`,
        channelId
      );
    }
  }

  // ─── Active ticket ───────────────────────────────────────────────────────
  let activeTicket: typeof tickets[0] | null = null;
  let ticketMessages: {
    id: string; sender_id: string; body: string | null; message_type: string;
    attachment_url: string | null; attachment_name: string | null; attachment_type: string | null;
    edited_at: string | null; created_at: string;
    sender_first_name: string; sender_last_name: string; sender_role: string | null;
  }[] = [];

  if (ticketId) {
    activeTicket = tickets.find(t => t.id === ticketId) ?? null;
    if (activeTicket) {
      await markTicketRead(locals.db, user.id, activeTicket.id);
      ticketMessages = await dbAll<typeof ticketMessages[0]>(locals.db,
        `SELECT m.id, m.sender_id, m.body, m.message_type,
               m.attachment_url, m.attachment_name, m.attachment_type,
               m.edited_at, m.created_at,
               COALESCE(u.first_name, 'Former') AS sender_first_name,
               COALESCE(u.last_name, 'member') AS sender_last_name,
               om.role AS sender_role
        FROM messages m
        LEFT JOIN users u ON u.id = m.sender_id
        LEFT JOIN organization_members om ON om.user_id = m.sender_id AND om.org_id = ?
        WHERE m.ticket_id = ? AND m.message_type != 'system'
        ORDER BY m.created_at`,
        org.id, ticketId
      );
    }
  }

  return {
    channels, tickets, myReservations, members,
    activeChannel, activeTicket, channelMessages, ticketMessages,
    currentUserId: user.id, orgRole: org.role,
    canManageChannels: isAdmin,
    // Announcement channels are read-only for members.
    canPostInChannel: !!activeChannel && !activeChannel.archived_at && (activeChannel.type !== 'announcement' || isAdmin),
  };
};

export const actions: Actions = {
  sendChannel: async ({ request, locals }) => {
    const user = locals.user!;
    const org = locals.currentOrg;
    if (!org) redirect(303, '/app/org/new');
    const d = st(locals.locale);
    const data = await request.formData();
    const channelId = String(data.get('channel_id') ?? '');
    const body = String(data.get('body') ?? '').trim();
    const att = attachmentFrom(data);
    if (att === false) return fail(400, { chatError: d.serverErrors.invalid });
    if ((!body && !att) || !channelId) return fail(400, { chatError: d.serverErrors.messageRequired });
    if (body.length > MESSAGE_MAX) return fail(400, { chatError: d.resOps.messageTooLong(MESSAGE_MAX) });

    const ch = await dbFirst<{ id: string; name: string; type: string; archived_at: string | null }>(
      locals.db,
      `SELECT id, name, type, archived_at FROM channels WHERE id = ? AND org_id = ?`,
      channelId, org.id
    );
    if (!ch) return fail(404, { chatError: d.serverErrors.notFound });
    if (ch.archived_at) return fail(409, { chatError: d.teamChat.channelArchived });
    if (ch.type === 'announcement' && !isAdminRole(org.role)) return fail(403, { chatError: d.teamChat.announcementReadOnly });

    await dbRun(
      locals.db,
      `INSERT INTO channel_messages (id, channel_id, org_id, sender_id, body, attachment_url, attachment_name, attachment_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(), channelId, org.id, user.id, body, att ? att.url : null, att ? att.name : null, att ? att.type : null
    );
    // My own message means I have read the channel up to now.
    await markChannelRead(locals.db, user.id, channelId);

    dispatchWebhooks(locals.db, org.id, 'channel_message.new', {
      channel_id: channelId, channel_name: ch.name,
      sender_name: `${user.first_name} ${user.last_name}`.trim(),
      message: body,
    }).catch(() => {});

    redirect(303, `/app/messages?c=${channelId}`);
  },

  editChannel: async ({ request, locals }) => {
    const user = locals.user!;
    const org = locals.currentOrg;
    if (!org) redirect(303, '/app/org/new');
    const data = await request.formData();
    const msgId = String(data.get('msg_id') ?? '');
    const body = String(data.get('body') ?? '').trim();
    if (!body || !msgId) return;
    if (body.length > MESSAGE_MAX) return fail(400, { chatError: st(locals.locale).resOps.messageTooLong(MESSAGE_MAX) });
    await dbRun(
      locals.db,
      `UPDATE channel_messages SET body = ?, edited_at = datetime('now') WHERE id = ? AND sender_id = ? AND org_id = ? AND deleted_at IS NULL`,
      body, msgId, user.id, org.id
    );
  },

  // Deletes one channel MESSAGE (owners/admins may remove anyone's: moderation).
  deleteChannel: async ({ request, locals }) => {
    const user = locals.user!;
    const org = locals.currentOrg;
    if (!org) redirect(303, '/app/org/new');
    const data = await request.formData();
    const msgId = String(data.get('msg_id') ?? '');
    if (!msgId) return;
    if (isAdminRole(org.role)) {
      // org_id is required here: without it an admin of ANY org could soft-delete
      // any other org's channel message by id.
      await dbRun(locals.db, `UPDATE channel_messages SET deleted_at = datetime('now') WHERE id = ? AND org_id = ?`, msgId, org.id);
    } else {
      await dbRun(locals.db, `UPDATE channel_messages SET deleted_at = datetime('now') WHERE id = ? AND sender_id = ? AND org_id = ?`, msgId, user.id, org.id);
    }
  },

  createChannel: async ({ request, locals }) => {
    const user = locals.user!;
    const org = locals.currentOrg;
    if (!org) redirect(303, '/app/org/new');
    const d = st(locals.locale);
    // Used to return "success" and do nothing for a member.
    if (!isAdminRole(org.role)) return fail(403, { channelError: d.teamChat.onlyAdminsCreate });
    const data = await request.formData();
    const rawName = String(data.get('name') ?? '');
    const description = String(data.get('description') ?? '').trim();
    const type = (String(data.get('type') ?? 'general') === 'announcement' ? 'announcement' : 'general') as 'general' | 'announcement';

    const problem = channelNameProblem(rawName);
    if (problem === 'empty') return fail(400, { channelError: d.teamChat.nameEmpty, name: rawName });
    if (problem === 'too_long') return fail(400, { channelError: d.teamChat.nameTooLong, name: rawName });
    if (description.length > CHANNEL_DESC_MAX) return fail(400, { channelError: d.teamChat.descriptionTooLong(CHANNEL_DESC_MAX), name: rawName });
    const name = channelName(rawName);

    const existing = await dbFirst<{ id: string }>(locals.db, `SELECT id FROM channels WHERE org_id = ? AND name = ?`, org.id, name);
    if (existing) return fail(409, { channelError: d.teamChat.nameTaken(name), name: rawName });

    const channelId = crypto.randomUUID();
    try {
      await dbRun(
        locals.db,
        `INSERT INTO channels (id, org_id, name, type, description, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
        channelId, org.id, name, type, description || null, user.id
      );
    } catch {
      return fail(409, { channelError: d.teamChat.nameTaken(name), name: rawName });
    }
    redirect(303, `/app/messages?c=${channelId}`);
  },

  // ─── Channel management (owners/admins) ──────────────────────────────────
  renameChannel: async ({ request, locals }) => {
    const org = locals.currentOrg;
    if (!org) redirect(303, '/app/org/new');
    const d = st(locals.locale);
    if (!isAdminRole(org.role)) return fail(403, { manageError: d.serverErrors.accessDenied });
    const data = await request.formData();
    const channelId = String(data.get('channel_id') ?? '');
    const rawName = String(data.get('name') ?? '');
    const description = String(data.get('description') ?? '').trim();
    const problem = channelNameProblem(rawName);
    if (problem === 'empty') return fail(400, { manageError: d.teamChat.nameEmpty });
    if (problem === 'too_long') return fail(400, { manageError: d.teamChat.nameTooLong });
    if (description.length > CHANNEL_DESC_MAX) return fail(400, { manageError: d.teamChat.descriptionTooLong(CHANNEL_DESC_MAX) });
    const name = channelName(rawName);
    const clash = await dbFirst<{ id: string }>(locals.db, 'SELECT id FROM channels WHERE org_id = ? AND name = ? AND id != ?', org.id, name, channelId);
    if (clash) return fail(409, { manageError: d.teamChat.nameTaken(name) });
    await dbRun(locals.db, 'UPDATE channels SET name = ?, description = ? WHERE id = ? AND org_id = ?',
      name, description || null, channelId, org.id);
    redirect(303, `/app/messages?c=${channelId}`);
  },

  archiveChannel: async ({ request, locals }) => {
    const org = locals.currentOrg;
    if (!org) redirect(303, '/app/org/new');
    if (!isAdminRole(org.role)) return fail(403, { manageError: st(locals.locale).serverErrors.accessDenied });
    const channelId = String((await request.formData()).get('channel_id') ?? '');
    await dbRun(locals.db, "UPDATE channels SET archived_at = datetime('now') WHERE id = ? AND org_id = ?", channelId, org.id);
    redirect(303, '/app/messages');
  },

  unarchiveChannel: async ({ request, locals }) => {
    const org = locals.currentOrg;
    if (!org) redirect(303, '/app/org/new');
    if (!isAdminRole(org.role)) return fail(403, { manageError: st(locals.locale).serverErrors.accessDenied });
    const channelId = String((await request.formData()).get('channel_id') ?? '');
    await dbRun(locals.db, 'UPDATE channels SET archived_at = NULL WHERE id = ? AND org_id = ?', channelId, org.id);
    redirect(303, `/app/messages?c=${channelId}`);
  },

  removeChannel: async ({ request, locals }) => {
    const org = locals.currentOrg;
    if (!org) redirect(303, '/app/org/new');
    if (!isAdminRole(org.role)) return fail(403, { manageError: st(locals.locale).serverErrors.accessDenied });
    const channelId = String((await request.formData()).get('channel_id') ?? '');
    // channel_messages and channel_reads cascade with the channel.
    await dbRun(locals.db, 'DELETE FROM channel_messages WHERE channel_id = ? AND org_id = ?', channelId, org.id);
    await dbRun(locals.db, 'DELETE FROM channels WHERE id = ? AND org_id = ?', channelId, org.id);
    redirect(303, '/app/messages');
  },

  sendTicket: async ({ request, locals }) => {
    const user = locals.user!;
    const org = locals.currentOrg;
    if (!org) redirect(303, '/app/org/new');
    const d = st(locals.locale);
    const data = await request.formData();
    const ticketId = String(data.get('ticket_id') ?? '');
    const body = String(data.get('body') ?? '').trim();
    if (!body || !ticketId) return fail(400, { chatError: d.serverErrors.messageRequired });
    if (body.length > MESSAGE_MAX) return fail(400, { chatError: d.resOps.messageTooLong(MESSAGE_MAX) });

    const ticket = await dbFirst<{ id: string; subject: string; status: string }>(
      locals.db,
      `SELECT id, subject, status FROM tickets WHERE id = ? AND user_id = ? AND org_id = ?`,
      ticketId, user.id, org.id
    );
    if (!ticket) return fail(404, { chatError: d.serverErrors.ticketNotFound });
    // A closed thread used to accept POSTed messages.
    if (ticket.status !== 'open') return fail(409, { chatError: d.messaging.ticketClosed });

    await dbRun(locals.db, `INSERT INTO messages (id, ticket_id, sender_id, body, message_type) VALUES (?, ?, ?, ?, 'text')`, crypto.randomUUID(), ticketId, user.id, body);
    await dbRun(locals.db, `UPDATE tickets SET updated_at = datetime('now') WHERE id = ?`, ticketId);

    const senderName = `${user.first_name} ${user.last_name}`.trim();
    dispatchWebhooks(locals.db, org.id, 'ticket.reply', {
      ticket_id: ticketId, ticket_subject: ticket.subject, sender_name: senderName, message: body,
    }).catch(() => {});
    // The venue's staff hear about it like any client message (they did not before).
    notifyGuestMessage(locals.db, org.id, senderName, ticket.subject, body).catch(() => {});

    redirect(303, `/app/messages?t=${ticketId}`);
  },

  editTicket: async ({ request, locals }) => {
    const user = locals.user!;
    const org = locals.currentOrg;
    if (!org) redirect(303, '/app/org/new');
    const data = await request.formData();
    const msgId = String(data.get('msg_id') ?? '');
    const body = String(data.get('body') ?? '').trim();
    if (!body || !msgId) return;
    if (body.length > MESSAGE_MAX) return fail(400, { chatError: st(locals.locale).resOps.messageTooLong(MESSAGE_MAX) });
    await dbRun(
      locals.db,
      `UPDATE messages SET body = ?, edited_at = datetime('now')
        WHERE id = ? AND sender_id = ? AND message_type = 'text'
          AND ticket_id IN (SELECT id FROM tickets WHERE org_id = ?)`,
      body, msgId, user.id, org.id
    );
  },

  deleteTicket: async ({ request, locals }) => {
    const user = locals.user!;
    const org = locals.currentOrg;
    if (!org) redirect(303, '/app/org/new');
    const data = await request.formData();
    const msgId = String(data.get('msg_id') ?? '');
    if (!msgId) return;
    await dbRun(locals.db,
      `DELETE FROM messages WHERE id = ? AND sender_id = ? AND message_type = 'text'
         AND ticket_id IN (SELECT id FROM tickets WHERE org_id = ?)`, msgId, user.id, org.id);
  },

  createTicket: async ({ request, locals }) => {
    const user = locals.user!;
    const org = locals.currentOrg;
    if (!org) redirect(303, '/app/org/new');
    const d = st(locals.locale);
    const data = await request.formData();
    const reservationId = String(data.get('reservation_id') ?? '').trim();
    const body = String(data.get('body') ?? '').trim();
    if (!reservationId || !body) return fail(400, { chatError: d.serverErrors.messageRequired });
    if (body.length > MESSAGE_MAX) return fail(400, { chatError: d.resOps.messageTooLong(MESSAGE_MAX) });

    // Verify the reservation belongs to this user and org
    const res = await dbFirst<{ id: string; title: string; hall_name: string; event_date: string }>(
      locals.db,
      `SELECT r.id, r.title, h.name AS hall_name, r.event_date
      FROM reservations r
      JOIN halls h ON h.id = r.hall_id
      WHERE r.id = ? AND r.user_id = ? AND r.org_id = ?`,
      reservationId, user.id, org.id
    );
    if (!res) return fail(404, { chatError: d.serverErrors.notFound });

    const subject = `${res.hall_name} – ${new Date(res.event_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    // One thread per booking: a second "new" message joins the existing thread.
    const thread = await findOrCreateReservationThread(locals.db, { orgId: org.id, reservationId, userId: user.id, subject });
    await dbRun(locals.db, `INSERT INTO messages (id, ticket_id, sender_id, body, message_type) VALUES (?, ?, ?, ?, 'text')`, crypto.randomUUID(), thread.id, user.id, body);
    await dbRun(locals.db, `UPDATE tickets SET updated_at = datetime('now'), status = 'open' WHERE id = ?`, thread.id);

    const senderName = `${user.first_name} ${user.last_name}`.trim();
    dispatchWebhooks(locals.db, org.id, thread.created ? 'ticket.new' : 'ticket.reply', {
      ticket_id: thread.id, ticket_subject: thread.subject, sender_name: senderName, message: body,
    }).catch(() => {});
    notifyGuestMessage(locals.db, org.id, senderName, thread.subject, body).catch(() => {});

    redirect(303, `/app/messages?t=${thread.id}`);
  },

  closeTicket: async ({ request, locals }) => {
    const user = locals.user!;
    const org = locals.currentOrg;
    if (!org) redirect(303, '/app/org/new');
    const data = await request.formData();
    const ticketId = String(data.get('ticket_id') ?? '');
    if (!ticketId) return;
    // Users can close their own; admins can close any
    if (isAdminRole(org.role)) {
      await dbRun(locals.db, `UPDATE tickets SET status = 'closed', updated_at = datetime('now') WHERE id = ? AND org_id = ?`, ticketId, org.id);
    } else {
      await dbRun(locals.db, `UPDATE tickets SET status = 'closed', updated_at = datetime('now') WHERE id = ? AND user_id = ? AND org_id = ?`, ticketId, user.id, org.id);
    }
    redirect(303, `/app/messages?t=${ticketId}`);
  },

  reopenTicket: async ({ request, locals }) => {
    const user = locals.user!;
    const org = locals.currentOrg;
    if (!org) redirect(303, '/app/org/new');
    const data = await request.formData();
    const ticketId = String(data.get('ticket_id') ?? '');
    if (!ticketId) return;
    if (isAdminRole(org.role)) {
      await dbRun(locals.db, `UPDATE tickets SET status = 'open', updated_at = datetime('now') WHERE id = ? AND org_id = ?`, ticketId, org.id);
    } else {
      await dbRun(locals.db, `UPDATE tickets SET status = 'open', updated_at = datetime('now') WHERE id = ? AND user_id = ? AND org_id = ?`, ticketId, user.id, org.id);
    }
    redirect(303, `/app/messages?t=${ticketId}`);
  },
};
