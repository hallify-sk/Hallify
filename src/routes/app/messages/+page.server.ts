import type { PageServerLoad, Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { dispatchWebhooks } from '$lib/notifications';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, '/app/login');
  const user = locals.user;
  const org = locals.currentOrg;
  if (!org) redirect(303, '/app/'); // home offers creating an org; the form itself felt compulsory

  const channelId = url.searchParams.get('c');
  const ticketId  = url.searchParams.get('t');

  // ─── Channels ────────────────────────────────────────────────────────────
  const channels = await dbAll<{
    id: string; name: string; type: string; description: string | null;
    unread_count: string; last_message: string | null; last_message_at: string | null;
  }>(locals.db,
    `SELECT c.id, c.name, c.type, c.description,
      CAST(COUNT(CASE WHEN cm.created_at > COALESCE(
        (SELECT cr.last_read_at FROM channel_reads cr
          WHERE cr.channel_id = c.id AND cr.user_id = ?),
        c.created_at
      ) AND cm.sender_id != ? THEN 1 END) AS TEXT) AS unread_count,
      (SELECT body FROM channel_messages WHERE channel_id = c.id
        AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1) AS last_message,
      (SELECT created_at FROM channel_messages WHERE channel_id = c.id
        AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1) AS last_message_at
    FROM channels c
    LEFT JOIN channel_messages cm ON cm.channel_id = c.id AND cm.deleted_at IS NULL
    WHERE c.org_id = ? AND c.archived_at IS NULL
    GROUP BY c.id
    ORDER BY c.created_at`,
    user.id, user.id, org.id
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
      CASE WHEN EXISTS (
        SELECT 1 FROM messages m WHERE m.ticket_id = t.id AND m.sender_id != ?
          AND m.created_at > COALESCE(
            (SELECT MAX(m2.created_at) FROM messages m2
              WHERE m2.ticket_id = t.id AND m2.sender_id = ?),
            t.created_at)
      ) THEN 1 ELSE 0 END AS unread
    FROM tickets t
    LEFT JOIN reservations r ON r.id = t.reservation_id
    LEFT JOIN halls h ON h.id = r.hall_id
    WHERE t.user_id = ? AND t.org_id = ?
    ORDER BY t.updated_at DESC`,
    user.id, user.id, user.id, org.id
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
    sender_first_name: string; sender_last_name: string;
  }[] = [];

  if (channelId) {
    activeChannel = channels.find(c => c.id === channelId) ?? null;
    if (activeChannel) {
      // Opening a channel marks it read. `channels` above was already computed, so the
      // badge clears on the NEXT load — which matches how the sidebar poll refreshes.
      await dbRun(locals.db,
        `INSERT INTO channel_reads (user_id, channel_id, last_read_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT (user_id, channel_id) DO UPDATE SET last_read_at = datetime('now')`,
        user.id, activeChannel.id
      );
      channelMessages = await dbAll<{
        id: string; sender_id: string; body: string; edited_at: string | null; created_at: string;
        sender_first_name: string; sender_last_name: string;
      }>(locals.db,
        `SELECT cm.id, cm.sender_id, cm.body, cm.edited_at, cm.created_at,
               u.first_name AS sender_first_name, u.last_name AS sender_last_name
        FROM channel_messages cm
        JOIN users u ON u.id = cm.sender_id
        WHERE cm.channel_id = ? AND cm.deleted_at IS NULL
        ORDER BY cm.created_at LIMIT 300`,
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
      ticketMessages = await dbAll<{
        id: string; sender_id: string; body: string | null; message_type: string;
        attachment_url: string | null; attachment_name: string | null; attachment_type: string | null;
        edited_at: string | null; created_at: string;
        sender_first_name: string; sender_last_name: string; sender_role: string | null;
      }>(locals.db,
        `SELECT m.id, m.sender_id, m.body, m.message_type,
               m.attachment_url, m.attachment_name, m.attachment_type,
               m.edited_at, m.created_at,
               COALESCE(u.first_name, 'Former') AS sender_first_name,
               COALESCE(u.last_name, 'member') AS sender_last_name,
               om.role AS sender_role
        FROM messages m
        LEFT JOIN users u ON u.id = m.sender_id
        LEFT JOIN organization_members om ON om.user_id = m.sender_id AND om.org_id = ?
        WHERE m.ticket_id = ?
        ORDER BY m.created_at`,
        org.id, ticketId
      );
    }
  }

  return {
    channels, tickets, myReservations, members,
    activeChannel, activeTicket, channelMessages, ticketMessages,
    currentUserId: user.id, orgRole: org.role,
  };
};

export const actions: Actions = {
  sendChannel: async ({ request, locals }) => {
    const user = locals.user!;
    const org = locals.currentOrg;
  if (!org) redirect(303, '/app/org/new');
    const data = await request.formData();
    const channelId = String(data.get('channel_id') ?? '');
    const body = String(data.get('body') ?? '').trim();
    if (!body || !channelId) return;

    const ch = await dbFirst<{ id: string; name: string }>(
      locals.db,
      `SELECT id, name FROM channels WHERE id = ? AND org_id = ?`,
      channelId, org.id
    );
    if (!ch) return;

    await dbRun(
      locals.db,
      `INSERT INTO channel_messages (id, channel_id, org_id, sender_id, body) VALUES (?, ?, ?, ?, ?)`,
      crypto.randomUUID(), channelId, org.id, user.id, body
    );

    dispatchWebhooks(locals.db, org.id, 'channel_message.new', {
      channel_id: channelId, channel_name: ch.name,
      sender_name: `${user.first_name} ${user.last_name}`.trim(),
      message: body,
    }).catch(() => {});

    redirect(302, `/app/messages?c=${channelId}`);
  },

  editChannel: async ({ request, locals }) => {
    const user = locals.user!;
    const data = await request.formData();
    const msgId = String(data.get('msg_id') ?? '');
    const body = String(data.get('body') ?? '').trim();
    if (!body || !msgId) return;
    await dbRun(
      locals.db,
      `UPDATE channel_messages SET body = ?, edited_at = datetime('now') WHERE id = ? AND sender_id = ? AND deleted_at IS NULL`,
      body, msgId, user.id
    );
  },

  deleteChannel: async ({ request, locals }) => {
    const user = locals.user!;
    const org = locals.currentOrg;
  if (!org) redirect(303, '/app/org/new');
    const data = await request.formData();
    const msgId = String(data.get('msg_id') ?? '');
    if (!msgId) return;
    if (org.role === 'owner' || org.role === 'admin') {
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
    if (org.role !== 'owner' && org.role !== 'admin') return;
    const data = await request.formData();
    const rawName = String(data.get('name') ?? '').trim();
    const name = rawName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const description = String(data.get('description') ?? '').trim();
    const type = (String(data.get('type') ?? 'general') === 'announcement' ? 'announcement' : 'general') as 'general' | 'announcement';
    if (!name) return;

    const channelId = crypto.randomUUID();
    await dbRun(
      locals.db,
      `INSERT INTO channels (id, org_id, name, type, description, created_by) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (org_id, name) DO NOTHING`,
      channelId, org.id, name, type, description || null, user.id
    );
    const ch = await dbFirst<{ id: string }>(locals.db, `SELECT id FROM channels WHERE org_id = ? AND name = ?`, org.id, name);
    if (ch) redirect(302, `/app/messages?c=${ch.id}`);
  },

  sendTicket: async ({ request, locals }) => {
    const user = locals.user!;
    const org = locals.currentOrg;
  if (!org) redirect(303, '/app/org/new');
    const data = await request.formData();
    const ticketId = String(data.get('ticket_id') ?? '');
    const body = String(data.get('body') ?? '').trim();
    if (!body || !ticketId) return;

    const ticket = await dbFirst<{ id: string; subject: string }>(
      locals.db,
      `SELECT id, subject FROM tickets WHERE id = ? AND user_id = ? AND org_id = ?`,
      ticketId, user.id, org.id
    );
    if (!ticket) return;

    await dbRun(locals.db, `INSERT INTO messages (id, ticket_id, sender_id, body, message_type) VALUES (?, ?, ?, ?, 'text')`, crypto.randomUUID(), ticketId, user.id, body);
    await dbRun(locals.db, `UPDATE tickets SET updated_at = datetime('now') WHERE id = ?`, ticketId);

    dispatchWebhooks(locals.db, org.id, 'ticket.reply', {
      ticket_id: ticketId, ticket_subject: ticket.subject,
      sender_name: `${user.first_name} ${user.last_name}`.trim(), message: body,
    }).catch(() => {});

    redirect(302, `/app/messages?t=${ticketId}`);
  },

  editTicket: async ({ request, locals }) => {
    const user = locals.user!;
    const data = await request.formData();
    const msgId = String(data.get('msg_id') ?? '');
    const body = String(data.get('body') ?? '').trim();
    if (!body || !msgId) return;
    await dbRun(
      locals.db,
      `UPDATE messages SET body = ?, edited_at = datetime('now') WHERE id = ? AND sender_id = ? AND message_type = 'text'`,
      body, msgId, user.id
    );
  },

  deleteTicket: async ({ request, locals }) => {
    const user = locals.user!;
    const data = await request.formData();
    const msgId = String(data.get('msg_id') ?? '');
    if (!msgId) return;
    await dbRun(locals.db, `DELETE FROM messages WHERE id = ? AND sender_id = ? AND message_type = 'text'`, msgId, user.id);
  },

  createTicket: async ({ request, locals }) => {
    const user = locals.user!;
    const org = locals.currentOrg;
  if (!org) redirect(303, '/app/org/new');
    const data = await request.formData();
    const reservationId = String(data.get('reservation_id') ?? '').trim();
    const body = String(data.get('body') ?? '').trim();
    if (!reservationId || !body) return;

    // Verify the reservation belongs to this user and org
    const res = await dbFirst<{ id: string; title: string; hall_name: string; event_date: string }>(
      locals.db,
      `SELECT r.id, r.title, h.name AS hall_name, r.event_date
      FROM reservations r
      JOIN halls h ON h.id = r.hall_id
      WHERE r.id = ? AND r.user_id = ? AND r.org_id = ?`,
      reservationId, user.id, org.id
    );
    if (!res) return;

    const subject = `${res.hall_name} – ${new Date(res.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    const ticketId = crypto.randomUUID();
    await dbRun(
      locals.db,
      `INSERT INTO tickets (id, org_id, user_id, reservation_id, subject, status) VALUES (?, ?, ?, ?, ?, 'open')`,
      ticketId, org.id, user.id, reservationId, subject
    );
    await dbRun(locals.db, `INSERT INTO messages (id, ticket_id, sender_id, body, message_type) VALUES (?, ?, ?, ?, 'text')`, crypto.randomUUID(), ticketId, user.id, body);

    dispatchWebhooks(locals.db, org.id, 'ticket.new', {
      ticket_id: ticketId, ticket_subject: subject,
      sender_name: `${user.first_name} ${user.last_name}`.trim(), message: body,
    }).catch(() => {});

    redirect(302, `/app/messages?t=${ticketId}`);
  },

  closeTicket: async ({ request, locals }) => {
    const user = locals.user!;
    const org = locals.currentOrg;
  if (!org) redirect(303, '/app/org/new');
    const data = await request.formData();
    const ticketId = String(data.get('ticket_id') ?? '');
    if (!ticketId) return;
    // Users can close their own; admins can close any
    if (org.role === 'owner' || org.role === 'admin') {
      await dbRun(locals.db, `UPDATE tickets SET status = 'closed', updated_at = datetime('now') WHERE id = ? AND org_id = ?`, ticketId, org.id);
    } else {
      await dbRun(locals.db, `UPDATE tickets SET status = 'closed', updated_at = datetime('now') WHERE id = ? AND user_id = ? AND org_id = ?`, ticketId, user.id, org.id);
    }
    redirect(302, `/app/messages?t=${ticketId}`);
  },

  reopenTicket: async ({ request, locals }) => {
    const user = locals.user!;
    const org = locals.currentOrg;
  if (!org) redirect(303, '/app/org/new');
    const data = await request.formData();
    const ticketId = String(data.get('ticket_id') ?? '');
    if (!ticketId) return;
    if (org.role === 'owner' || org.role === 'admin') {
      await dbRun(locals.db, `UPDATE tickets SET status = 'open', updated_at = datetime('now') WHERE id = ? AND org_id = ?`, ticketId, org.id);
    } else {
      await dbRun(locals.db, `UPDATE tickets SET status = 'open', updated_at = datetime('now') WHERE id = ? AND user_id = ? AND org_id = ?`, ticketId, user.id, org.id);
    }
    redirect(302, `/app/messages?t=${ticketId}`);
  },
};
