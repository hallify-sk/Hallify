import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import sql from '$lib/db';

export const load: PageServerLoad = async ({ params, locals }) => {
  const [invite] = await sql<{
    id: string; org_id: string; org_name: string; email: string; role: string; expires_at: Date; accepted_at: Date | null;
  }[]>`
    SELECT i.id, i.org_id, o.name AS org_name, i.email, i.role, i.expires_at, i.accepted_at
    FROM organization_invites i
    JOIN organizations o ON o.id = i.org_id
    WHERE i.token = ${params.token}
  `;

  if (!invite) error(404, 'Invite not found or expired');
  if (invite.accepted_at) error(410, 'This invite has already been used');
  if (new Date(invite.expires_at) < new Date()) error(410, 'This invite has expired');

  return { invite, user: locals.user };
};

export const actions: Actions = {
  accept: async ({ params, locals, cookies }) => {
    if (!locals.user) redirect(303, `/login?redirect=/invite/${params.token}`);

    const [invite] = await sql<{
      id: string; org_id: string; email: string; role: string; expires_at: Date; accepted_at: Date | null;
    }[]>`
      SELECT * FROM organization_invites
      WHERE token = ${params.token}
        AND accepted_at IS NULL
        AND expires_at > NOW()
    `;

    if (!invite) return fail(410, { error: 'Invite is no longer valid.' });

    // Verify email matches (soft check — invite is email-specific)
    if (invite.email.toLowerCase() !== locals.user.email.toLowerCase()) {
      return fail(403, { error: 'This invite was sent to a different email address.' });
    }

    // Add member (ignore if already a member)
    await sql`
      INSERT INTO organization_members (org_id, user_id, role)
      VALUES (${invite.org_id}, ${locals.user.id}, ${invite.role})
      ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role
    `;

    // Mark invite accepted
    await sql`
      UPDATE organization_invites SET accepted_at = NOW() WHERE id = ${invite.id}
    `;

    // Switch session to the new org
    const sessionId = cookies.get('session_id');
    if (sessionId) {
      await sql`UPDATE sessions SET current_org_id = ${invite.org_id} WHERE id = ${sessionId}`;
    }

    redirect(303, '/app/');
  },
};
