import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { dbFirst, dbRun } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import { canAddMember } from '$lib/limits';
import { getPlan } from '$lib/plans';
import type { PlanId } from '$lib/plans';

export const load: PageServerLoad = async ({ params, locals }) => {
  const invite = await dbFirst<{
    id: string; org_id: string; org_name: string; email: string; role: string; expires_at: string; accepted_at: string | null;
  }>(
    locals.db,
    `SELECT i.id, i.org_id, o.name AS org_name, i.email, i.role, i.expires_at, i.accepted_at
     FROM organization_invites i
     JOIN organizations o ON o.id = i.org_id
     WHERE i.token = ?`,
    params.token
  );

  if (!invite) error(404, st(locals.locale).serverErrors.inviteNotFoundOrExpired);
  if (invite.accepted_at) error(410, st(locals.locale).serverErrors.inviteAlreadyUsed);
  if (new Date(invite.expires_at) < new Date()) error(410, st(locals.locale).serverErrors.inviteExpired);

  return { invite, token: params.token, user: locals.user };
};

export const actions: Actions = {
  accept: async ({ params, locals, cookies }) => {
    if (!locals.user) redirect(303, `/app/login?redirect=/app/invite/${params.token}`);

    const invite = await dbFirst<{
      id: string; org_id: string; email: string; role: string; expires_at: string; accepted_at: string | null;
    }>(
      locals.db,
      `SELECT * FROM organization_invites
       WHERE token = ?
         AND accepted_at IS NULL
         AND expires_at > datetime('now')`,
      params.token
    );

    if (!invite) return fail(410, { error: st(locals.locale).serverErrors.inviteNoLongerValid });

    // Verify email matches (soft check — invite is email-specific)
    if (invite.email.toLowerCase() !== locals.user.email.toLowerCase()) {
      return fail(403, { error: st(locals.locale).serverErrors.inviteDifferentEmail });
    }

    // Enforce the plan's member cap HERE too. It was only checked when the invite was
    // created, so an owner could issue several invites while under the cap and every
    // one of them would still be accepted.
    const alreadyMember = await dbFirst<{ ok: number }>(locals.db,
      'SELECT 1 AS ok FROM organization_members WHERE org_id = ? AND user_id = ? LIMIT 1',
      invite.org_id, locals.user.id);
    if (!alreadyMember) {
      const sub = await dbFirst<{ plan: string | null }>(locals.db,
        'SELECT plan FROM subscriptions WHERE org_id = ?', invite.org_id);
      const plan = (sub?.plan ?? 'free') as PlanId;
      if (!(await canAddMember(locals.db, invite.org_id, plan))) {
        return fail(403, { error: st(locals.locale).serverErrors.memberSeatLimit(getPlan(plan).limits.maxMembers) });
      }
    }

    // Add member (ignore if already a member)
    await dbRun(
      locals.db,
      `INSERT INTO organization_members (id, org_id, user_id, role)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (org_id, user_id) DO UPDATE SET role = excluded.role`,
      crypto.randomUUID(), invite.org_id, locals.user.id, invite.role
    );

    // Mark invite accepted
    await dbRun(
      locals.db,
      `UPDATE organization_invites SET accepted_at = datetime('now') WHERE id = ?`,
      invite.id
    );

    // Switch session to the new org
    const sessionId = cookies.get('session_id');
    if (sessionId) {
      await dbRun(
        locals.db,
        'UPDATE sessions SET current_org_id = ? WHERE id = ?',
        invite.org_id, sessionId
      );
    }

    redirect(303, '/app/');
  },
};
