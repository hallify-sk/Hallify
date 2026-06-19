import { fail, redirect } from '@sveltejs/kit';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { OrgMemberRow, OrgInviteRow } from '$lib/db/index';
import { archiveAndDeleteOrg, orgMemberCount } from '$lib/orgLifecycle';
import { getPlan } from '$lib/plans';
import { canAddMember } from '$lib/limits';
import { sendOrgInviteEmail } from '$lib/email';
import { st } from '$lib/i18n-server';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const orgId = locals.currentOrg!.id;

  const members = await dbAll<OrgMemberRow>(locals.db,
    `SELECT m.*, u.email AS user_email, u.first_name AS user_first_name, u.last_name AS user_last_name
    FROM organization_members m
    JOIN users u ON u.id = m.user_id
    WHERE m.org_id = ?
    ORDER BY m.role, u.first_name`,
    orgId
  );

  const invites = await dbAll<OrgInviteRow>(locals.db,
    `SELECT * FROM organization_invites
    WHERE org_id = ? AND accepted_at IS NULL AND expires_at > datetime('now')
    ORDER BY created_at DESC`,
    orgId
  );

  return { members, invites, currentOrg: locals.currentOrg };
};

export const actions: Actions = {
  invite: async ({ request, locals, url }) => {
    if (locals.currentOrg?.impersonated) return fail(403, { error: st(locals.locale).serverErrors.impersonationBlockThisOrg });
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const email = (data.get('email') as string)?.trim().toLowerCase();
    const role = (data.get('role') as string) ?? 'member';

    if (!email) return fail(400, { error: st(locals.locale).serverErrors.emailRequired });
    if (!['admin', 'member'].includes(role)) return fail(400, { error: st(locals.locale).serverErrors.invalidRole });

    // Enforce the plan's member (seat) limit.
    if (!(await canAddMember(locals.db, orgId, locals.currentOrg!.subscription.plan))) {
      const limit = getPlan(locals.currentOrg!.subscription.plan).limits.maxMembers;
      return fail(403, { error: st(locals.locale).serverErrors.memberSeatLimit(limit) });
    }

    // Check if already a member
    const existingUser = await dbFirst<{ id: string }>(locals.db, 'SELECT id FROM users WHERE email = ?', email);
    if (existingUser) {
      const existing = await dbFirst<{ id: string }>(locals.db,
        'SELECT id FROM organization_members WHERE org_id = ? AND user_id = ?',
        orgId, existingUser.id
      );
      if (existing) return fail(400, { error: st(locals.locale).serverErrors.userAlreadyMember });
    }

    // Upsert invite (reset token + expiry if re-inviting same email)
    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await dbRun(locals.db,
      `INSERT INTO organization_invites (id, org_id, email, role, token, expires_at, invited_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (org_id, email) DO UPDATE
        SET role = excluded.role,
            token = excluded.token,
            expires_at = excluded.expires_at,
            accepted_at = NULL,
            invited_by = excluded.invited_by`,
      crypto.randomUUID(), orgId, email, role, token, expiresAt, locals.user!.id
    );

    // Email the invite link (apex app — invites are accepted off-bubble).
    const base = (env.APP_URL || url.origin).replace(/\/$/, '');
    const inviterName = `${locals.user!.first_name ?? ''} ${locals.user!.last_name ?? ''}`.trim() || 'A teammate';
    const sent = await sendOrgInviteEmail(locals.db, email, {
      orgName: locals.currentOrg!.name,
      inviterName,
      role,
      inviteUrl: `${base}/app/invite/${token}`,
    });

    return {
      success: true,
      message: sent
        ? st(locals.locale).serverErrors.inviteSent(email)
        : st(locals.locale).serverErrors.inviteCreatedEmailFailed(email),
    };
  },

  revoke: async ({ request, locals }) => {
    if (locals.currentOrg?.impersonated) return fail(403, { error: st(locals.locale).serverErrors.impersonationBlockThisOrg });
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const id = data.get('id') as string;
    await dbRun(locals.db, 'DELETE FROM organization_invites WHERE id = ? AND org_id = ?', id, orgId);
    return { success: true };
  },

  remove: async ({ request, locals }) => {
    if (locals.currentOrg?.impersonated) return fail(403, { error: st(locals.locale).serverErrors.impersonationBlockThisOrg });
    // Defense-in-depth: this action mutates membership, so re-check the caller's
    // role explicitly rather than relying solely on the manage-layout guard.
    if (locals.currentOrg?.role !== 'owner' && locals.currentOrg?.role !== 'admin') {
      return fail(403, { error: st(locals.locale).serverErrors.noPermissionRemoveMembers });
    }
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const userId = data.get('user_id') as string;

    // An org must never be left empty — the last member must close it instead.
    if (await orgMemberCount(locals.db, orgId) <= 1) {
      return fail(400, { error: st(locals.locale).serverErrors.lastMemberCloseOrg });
    }

    // Cannot remove the only owner (org must always keep an owner).
    const ownerCountRow = await dbFirst<{ count: number }>(locals.db,
      `SELECT COUNT(*) AS count FROM organization_members WHERE org_id = ? AND role = 'owner'`,
      orgId
    );
    const target = await dbFirst<{ role: string }>(locals.db,
      'SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?',
      orgId, userId
    );
    if (target?.role === 'owner' && Number(ownerCountRow?.count ?? 0) <= 1) {
      return fail(400, { error: st(locals.locale).serverErrors.cannotRemoveOnlyOwner });
    }

    await dbRun(locals.db, 'DELETE FROM organization_members WHERE org_id = ? AND user_id = ?', orgId, userId);
    return { success: true };
  },

  // Current user leaves the org. The last member (usually the owner) cannot
  // leave — they must explicitly close the organization.
  leave: async ({ locals, cookies }) => {
    if (locals.currentOrg?.impersonated) return fail(403, { error: st(locals.locale).serverErrors.impersonationBlockThisOrg });
    const orgId = locals.currentOrg!.id;
    const userId = locals.user!.id;

    const me = await dbFirst<{ role: string }>(locals.db,
      'SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?', orgId, userId);
    if (!me) return fail(400, { error: st(locals.locale).serverErrors.notMemberOfOrg });

    if (await orgMemberCount(locals.db, orgId) <= 1) {
      return fail(400, { error: st(locals.locale).serverErrors.lastMemberCloseOrgInstead });
    }
    if (me.role === 'owner') {
      const owners = await dbFirst<{ count: number }>(locals.db,
        `SELECT COUNT(*) AS count FROM organization_members WHERE org_id = ? AND role = 'owner'`, orgId);
      if (Number(owners?.count ?? 0) <= 1) {
        return fail(400, { error: st(locals.locale).serverErrors.onlyOwnerPromoteOrClose });
      }
    }

    await dbRun(locals.db, 'DELETE FROM organization_members WHERE org_id = ? AND user_id = ?', orgId, userId);
    const sessionId = cookies.get('session_id');
    if (sessionId) await dbRun(locals.db, 'UPDATE sessions SET current_org_id = NULL WHERE id = ?', sessionId);
    redirect(303, '/app/');
  },

  // Owner-only: permanently close the organization. Archives a legal/accounting
  // record (kept indefinitely) then deletes all live data. Requires typing the
  // org name to confirm.
  closeOrg: async ({ request, locals }) => {
    const org = locals.currentOrg!;
    if (org.impersonated) return fail(403, { error: st(locals.locale).serverErrors.impersonationBlockThisOrg });
    if (org.role !== 'owner') return fail(403, { error: st(locals.locale).serverErrors.onlyOwnerCanCloseOrg });

    const data = await request.formData();
    const confirmName = String(data.get('confirm_name') ?? '').trim();
    if (confirmName !== org.name) {
      return fail(400, { error: st(locals.locale).serverErrors.typeOrgNameToConfirm(org.name) });
    }

    await archiveAndDeleteOrg(locals.db, org.id, {
      closedBy: locals.user!.id,
      closedByEmail: locals.user!.email,
      reason: 'owner_closed',
    });

    redirect(303, '/app/');
  },

  changeRole: async ({ request, locals }) => {
    if (locals.currentOrg?.impersonated) return fail(403, { error: st(locals.locale).serverErrors.impersonationBlockThisOrg });
    const orgId = locals.currentOrg!.id;
    const data = await request.formData();
    const userId = data.get('user_id') as string;
    const newRole = data.get('role') as string;

    if (!['owner', 'admin', 'member'].includes(newRole)) return fail(400, { error: st(locals.locale).serverErrors.invalidRole });

    // Prevent demoting the last owner
    if (newRole !== 'owner') {
      const ownerCountRow = await dbFirst<{ count: number }>(locals.db,
        `SELECT COUNT(*) AS count FROM organization_members WHERE org_id = ? AND role = 'owner'`,
        orgId
      );
      const current = await dbFirst<{ role: string }>(locals.db,
        'SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?',
        orgId, userId
      );
      if (current?.role === 'owner' && Number(ownerCountRow?.count ?? 0) <= 1) {
        return fail(400, { error: st(locals.locale).serverErrors.cannotDemoteOnlyOwner });
      }
    }

    await dbRun(locals.db,
      'UPDATE organization_members SET role = ? WHERE org_id = ? AND user_id = ?',
      newRole, orgId, userId
    );
    return { success: true };
  }
};
