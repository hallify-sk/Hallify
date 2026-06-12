import type { PageServerLoad, Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import sql from '$lib/db';
import { dispatchWebhooks } from '$lib/notifications';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) redirect(303, '/app/login');
  const user = locals.user;
  const org  = locals.currentOrg!;

  const channelId = url.searchParams.get('c');
  const ticketId  = url.searchParams.get('t');

  // ─── Channels ────────────────────────────────────────────────────────────
  const channels = await sql<{
    id: string; name: string; type: string; description: string | null;
    unread_count: string; last_message: string | null; last_message_at: Date | null;
  }[]>`
    SELECT c.id, c.name, c.type, c.description,
      COUNT(cm.id) FILTER (WHERE cm.created_at > COALESCE(
        (SELECT MAX(cm2.created_at) FROM channel_messages cm2
          WHERE cm2.channel_id = c.id AND cm2.sender_id = ${user.id}),
        c.created_at
      ))::text AS unread_count,
      (SELECT body FROM channel_messages WHERE channel_id = c.id
        AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1) AS last_message,
      (SELECT created_at FROM channel_messages WHERE channel_id = c.id
        AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1) AS last_message_at
    FROM channels c
    LEFT JOIN channel_messages cm ON cm.channel_id = c.id AND cm.deleted_at IS NULL
    WHERE c.org_id = ${org.id} AND c.archived_at IS NULL
    GROUP BY c.id
    ORDER BY c.created_at
  `;

  // ─── Client tickets (user's own, with reservation info) ──────────────────
  const tickets = await sql<{
    id: string; subject: string; status: string; updated_at: Date;
    reservation_id: string | null; hall_name: string | null; event_date: Date | null;
    last_message: string | null; unread: boolean;
  }[]>`
    SELECT t.id, t.subject, t.status, t.updated_at,
      t.reservation_id, h.name AS hall_name, r.event_date,
      (SELECT body FROM messages WHERE ticket_id = t.id
        AND message_type = 'text' ORDER BY created_at DESC LIMIT 1) AS last_message,
      EXISTS (
        SELECT 1 FROM messages m WHERE m.ticket_id = t.id AND m.sender_id != ${user.id}
          AND m.created_at > COALESCE(
            (SELECT MAX(m2.created_at) FROM messages m2
              WHERE m2.ticket_id = t.id AND m2.sender_id = ${user.id}),
            t.created_at)
      ) AS unread
    FROM tickets t
    LEFT JOIN reservations r ON r.id = t.reservation_id
    LEFT JOIN halls h ON h.id = r.hall_id
    WHERE t.user_id = ${user.id} AND t.org_id = ${org.id}
    ORDER BY t.updated_at DESC
  `;

  // ─── User's reservations at this org (for new ticket form) ───────────────
  const myReservations = await sql<{
    id: string; title: string; hall_name: string; event_date: Date; status: string;
  }[]>`
    SELECT r.id, r.title, h.name AS hall_name, r.event_date, r.status
    FROM reservations r
    JOIN halls h ON h.id = r.hall_id
    WHERE r.user_id = ${user.id} AND r.org_id = ${org.id}
      AND r.status NOT IN ('cancelled')
    ORDER BY r.event_date DESC
  `;

  // ─── Org members + presence ──────────────────────────────────────────────
  const members = await sql<{
    user_id: string; first_name: string; last_name: string; role: string; is_online: boolean;
  }[]>`
    SELECT m.user_id, u.first_name, u.last_name, m.role,
      (p.last_seen_at IS NOT NULL AND p.last_seen_at > NOW() - INTERVAL '2 minutes') AS is_online
    FROM organization_members m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN user_presence p ON p.user_id = m.user_id AND p.org_id = m.org_id
    WHERE m.org_id = ${org.id}
    ORDER BY u.first_name
  `;

  // ─── Active channel ──────────────────────────────────────────────────────
  let activeChannel: typeof channels[0] | null = null;
  let channelMessages: {
    id: string; sender_id: string; body: string; edited_at: Date | null; created_at: Date;
    sender_first_name: string; sender_last_name: string;
  }[] = [];

  if (channelId) {
    activeChannel = channels.find(c => c.id === channelId) ?? null;
    if (activeChannel) {
      channelMessages = await sql`
        SELECT cm.id, cm.sender_id, cm.body, cm.edited_at, cm.created_at,
               u.first_name AS sender_first_name, u.last_name AS sender_last_name
        FROM channel_messages cm
        JOIN users u ON u.id = cm.sender_id
        WHERE cm.channel_id = ${channelId} AND cm.deleted_at IS NULL
        ORDER BY cm.created_at LIMIT 300
      `;
    }
  }

  // ─── Active ticket ───────────────────────────────────────────────────────
  let activeTicket: typeof tickets[0] | null = null;
  let ticketMessages: {
    id: string; sender_id: string; body: string | null; message_type: string;
    attachment_url: string | null; attachment_name: string | null; attachment_type: string | null;
    edited_at: Date | null; created_at: Date;
    sender_first_name: string; sender_last_name: string; sender_role: string | null;
  }[] = [];

  if (ticketId) {
    activeTicket = tickets.find(t => t.id === ticketId) ?? null;
    if (activeTicket) {
      ticketMessages = await sql`
        SELECT m.id, m.sender_id, m.body, m.message_type,
               m.attachment_url, m.attachment_name, m.attachment_type,
               m.edited_at, m.created_at,
               u.first_name AS sender_first_name, u.last_name AS sender_last_name,
               om.role AS sender_role
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        LEFT JOIN organization_members om ON om.user_id = m.sender_id AND om.org_id = ${org.id}
        WHERE m.ticket_id = ${ticketId}
        ORDER BY m.created_at
      `;
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
    const org  = locals.currentOrg!;
    const data = await request.formData();
    const channelId = String(data.get('channel_id') ?? '');
    const body = String(data.get('body') ?? '').trim();
    if (!body || !channelId) return;

    const [ch] = await sql<{ id: string; name: string }[]>`
      SELECT id, name FROM channels WHERE id = ${channelId} AND org_id = ${org.id}
    `;
    if (!ch) return;

    await sql`
      INSERT INTO channel_messages (channel_id, org_id, sender_id, body)
      VALUES (${channelId}, ${org.id}, ${user.id}, ${body})
    `;

    dispatchWebhooks(org.id, 'channel_message.new', {
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
    await sql`
      UPDATE channel_messages SET body = ${body}, edited_at = NOW()
      WHERE id = ${msgId} AND sender_id = ${user.id} AND deleted_at IS NULL
    `;
  },

  deleteChannel: async ({ request, locals }) => {
    const user = locals.user!;
    const org  = locals.currentOrg!;
    const data = await request.formData();
    const msgId = String(data.get('msg_id') ?? '');
    if (!msgId) return;
    if (org.role === 'owner' || org.role === 'admin') {
      await sql`UPDATE channel_messages SET deleted_at = NOW() WHERE id = ${msgId}`;
    } else {
      await sql`UPDATE channel_messages SET deleted_at = NOW() WHERE id = ${msgId} AND sender_id = ${user.id}`;
    }
  },

  createChannel: async ({ request, locals }) => {
    const user = locals.user!;
    const org  = locals.currentOrg!;
    if (org.role !== 'owner' && org.role !== 'admin') return;
    const data = await request.formData();
    const rawName = String(data.get('name') ?? '').trim();
    const name = rawName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const description = String(data.get('description') ?? '').trim();
    const type = (String(data.get('type') ?? 'general') === 'announcement' ? 'announcement' : 'general') as 'general' | 'announcement';
    if (!name) return;

    const [ch] = await sql<{ id: string }[]>`
      INSERT INTO channels (org_id, name, type, description, created_by)
      VALUES (${org.id}, ${name}, ${type}, ${description || null}, ${user.id})
      ON CONFLICT (org_id, name) DO NOTHING RETURNING id
    `;
    if (ch) redirect(302, `/app/messages?c=${ch.id}`);
  },

  sendTicket: async ({ request, locals }) => {
    const user = locals.user!;
    const org  = locals.currentOrg!;
    const data = await request.formData();
    const ticketId = String(data.get('ticket_id') ?? '');
    const body = String(data.get('body') ?? '').trim();
    if (!body || !ticketId) return;

    const [ticket] = await sql<{ id: string; subject: string }[]>`
      SELECT id, subject FROM tickets WHERE id = ${ticketId} AND user_id = ${user.id} AND org_id = ${org.id}
    `;
    if (!ticket) return;

    await sql`INSERT INTO messages (ticket_id, sender_id, body, message_type) VALUES (${ticketId}, ${user.id}, ${body}, 'text')`;
    await sql`UPDATE tickets SET updated_at = NOW() WHERE id = ${ticketId}`;

    dispatchWebhooks(org.id, 'ticket.reply', {
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
    await sql`
      UPDATE messages SET body = ${body}, edited_at = NOW()
      WHERE id = ${msgId} AND sender_id = ${user.id} AND message_type = 'text'
    `;
  },

  deleteTicket: async ({ request, locals }) => {
    const user = locals.user!;
    const data = await request.formData();
    const msgId = String(data.get('msg_id') ?? '');
    if (!msgId) return;
    await sql`DELETE FROM messages WHERE id = ${msgId} AND sender_id = ${user.id} AND message_type = 'text'`;
  },

  createTicket: async ({ request, locals }) => {
    const user = locals.user!;
    const org  = locals.currentOrg!;
    const data = await request.formData();
    const reservationId = String(data.get('reservation_id') ?? '').trim();
    const body = String(data.get('body') ?? '').trim();
    if (!reservationId || !body) return;

    // Verify the reservation belongs to this user and org
    const [res] = await sql<{ id: string; title: string; hall_name: string; event_date: Date }[]>`
      SELECT r.id, r.title, h.name AS hall_name, r.event_date
      FROM reservations r
      JOIN halls h ON h.id = r.hall_id
      WHERE r.id = ${reservationId} AND r.user_id = ${user.id} AND r.org_id = ${org.id}
    `;
    if (!res) return;

    const subject = `${res.hall_name} – ${new Date(res.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    const [ticket] = await sql<{ id: string }[]>`
      INSERT INTO tickets (org_id, user_id, reservation_id, subject, status)
      VALUES (${org.id}, ${user.id}, ${reservationId}, ${subject}, 'open') RETURNING id
    `;
    await sql`INSERT INTO messages (ticket_id, sender_id, body, message_type) VALUES (${ticket.id}, ${user.id}, ${body}, 'text')`;

    dispatchWebhooks(org.id, 'ticket.new', {
      ticket_id: ticket.id, ticket_subject: subject,
      sender_name: `${user.first_name} ${user.last_name}`.trim(), message: body,
    }).catch(() => {});

    redirect(302, `/app/messages?t=${ticket.id}`);
  },

  closeTicket: async ({ request, locals }) => {
    const user = locals.user!;
    const org  = locals.currentOrg!;
    const data = await request.formData();
    const ticketId = String(data.get('ticket_id') ?? '');
    if (!ticketId) return;
    // Users can close their own; admins can close any
    if (org.role === 'owner' || org.role === 'admin') {
      await sql`UPDATE tickets SET status = 'closed', updated_at = NOW() WHERE id = ${ticketId} AND org_id = ${org.id}`;
    } else {
      await sql`UPDATE tickets SET status = 'closed', updated_at = NOW() WHERE id = ${ticketId} AND user_id = ${user.id} AND org_id = ${org.id}`;
    }
    redirect(302, `/app/messages?t=${ticketId}`);
  },

  reopenTicket: async ({ request, locals }) => {
    const user = locals.user!;
    const org  = locals.currentOrg!;
    const data = await request.formData();
    const ticketId = String(data.get('ticket_id') ?? '');
    if (!ticketId) return;
    if (org.role === 'owner' || org.role === 'admin') {
      await sql`UPDATE tickets SET status = 'open', updated_at = NOW() WHERE id = ${ticketId} AND org_id = ${org.id}`;
    } else {
      await sql`UPDATE tickets SET status = 'open', updated_at = NOW() WHERE id = ${ticketId} AND user_id = ${user.id} AND org_id = ${org.id}`;
    }
    redirect(302, `/app/messages?t=${ticketId}`);
  },
};
