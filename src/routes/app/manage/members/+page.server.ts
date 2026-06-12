import { fail } from '@sveltejs/kit';
import sql from '$lib/db';
import type { OrgMemberRow, OrgInviteRow } from '$lib/db';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const orgId = locals.currentOrg!.id;

  const members = await sql<OrgMemberRow[]>`
    SELECT m.*, u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name
    FROM organization_members m
    JOIN users u ON u.id = m.user_id
    WHERE m.org_id = ${orgId}
    ORDER BY m.role, u.first_name
  `;

  const invites = await sql<OrgInviteRow[]>`
    SELECT * FROM organization_invites
    WHERE org_id = ${orgId} AND accepted_at IS NULL AND expires_at > NOW()
    ORDER BY created_at DESC
  `;

  return { members, invites, currentOrg: locals.currentOrg };
};

export const actions: Actions = {
  invite: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const email = (data.get('email') as string)?.trim().toLowerCase();
    const role = (data.get('role') as string) ?? 'member';

    if (!email) return fail(400, { error: 'Email is required.' });
    if (!['admin', 'member'].includes(role)) return fail(400, { error: 'Invalid role.' });

    // Check if already a member
    const [existingUser] = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${email}`;
    if (existingUser) {
      const [existing] = await sql<{ id: string }[]>`
        SELECT id FROM organization_members WHERE org_id = ${orgId} AND user_id = ${existingUser.id}
      `;
      if (existing) return fail(400, { error: 'This user is already a member.' });
    }

    // Upsert invite (reset token + expiry if re-inviting same email)
    await sql`
      INSERT INTO organization_invites (org_id, email, role, invited_by)
      VALUES (${orgId}, ${email}, ${role}, ${locals.user!.id})
      ON CONFLICT (org_id, email) DO UPDATE
        SET role = EXCLUDED.role,
            token = encode(gen_random_bytes(24), 'hex'),
            expires_at = NOW() + INTERVAL '7 days',
            accepted_at = NULL,
            invited_by = EXCLUDED.invited_by
    `;

    // TODO: send invite email via nodemailer when SMTP is configured

    return { success: true, message: `Invite sent to ${email}` };
  },

  revoke: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const id = data.get('id') as string;
    await sql`DELETE FROM organization_invites WHERE id = ${id} AND org_id = ${orgId}`;
    return { success: true };
  },

  remove: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const userId = data.get('user_id') as string;

    // Cannot remove the only owner
    const [ownerCount] = await sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM organization_members WHERE org_id = ${orgId} AND role = 'owner'
    `;
    const [target] = await sql<{ role: string }[]>`
      SELECT role FROM organization_members WHERE org_id = ${orgId} AND user_id = ${userId}
    `;
    if (target?.role === 'owner' && Number(ownerCount.count) <= 1) {
      return fail(400, { error: 'Cannot remove the only owner.' });
    }

    await sql`DELETE FROM organization_members WHERE org_id = ${orgId} AND user_id = ${userId}`;
    return { success: true };
  },

  changeRole: async ({ request, locals }) => {
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const userId = data.get('user_id') as string;
    const newRole = data.get('role') as string;

    if (!['owner', 'admin', 'member'].includes(newRole)) return fail(400, { error: 'Invalid role.' });

    // Prevent demoting the last owner
    if (newRole !== 'owner') {
      const [ownerCount] = await sql<{ count: string }[]>`
        SELECT COUNT(*)::text AS count FROM organization_members WHERE org_id = ${orgId} AND role = 'owner'
      `;
      const [current] = await sql<{ role: string }[]>`
        SELECT role FROM organization_members WHERE org_id = ${orgId} AND user_id = ${userId}
      `;
      if (current?.role === 'owner' && Number(ownerCount.count) <= 1) {
        return fail(400, { error: 'Cannot demote the only owner.' });
      }
    }

    await sql`
      UPDATE organization_members SET role = ${newRole} WHERE org_id = ${orgId} AND user_id = ${userId}
    `;
    return { success: true };
  }
};
