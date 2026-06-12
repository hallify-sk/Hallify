import type { LayoutServerLoad } from './$types';
import sql from '$lib/db';

export const load: LayoutServerLoad = async ({ locals }) => {
  let unreadMessages = 0;
  let orgs: { id: string; name: string; slug: string; role: string }[] = [];

  if (locals.user) {
    const [unread] = await sql<{ count: string }[]>`
      SELECT COUNT(DISTINCT t.id)::text AS count
      FROM tickets t
      JOIN messages m ON m.ticket_id = t.id
      WHERE t.user_id = ${locals.user.id}
        AND t.status = 'open'
        AND m.sender_id != ${locals.user.id}
        AND m.created_at > COALESCE(
          (SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.ticket_id = t.id AND m2.sender_id = ${locals.user.id}),
          t.created_at
        )
    `;
    unreadMessages = parseInt(unread?.count ?? '0', 10);

    orgs = await sql<{ id: string; name: string; slug: string; role: string }[]>`
      SELECT o.id, o.name, o.slug, m.role
      FROM organization_members m
      JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = ${locals.user.id}
        AND o.suspended_at IS NULL
      ORDER BY m.joined_at
    `;
  }

  return {
    user: locals.user,
    branding: locals.branding,
    currentOrg: locals.currentOrg,
    orgs,
    unreadMessages,
  };
};
