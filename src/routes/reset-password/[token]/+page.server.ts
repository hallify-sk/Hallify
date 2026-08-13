import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { dbFirst, dbRun } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import bcrypt from 'bcryptjs';
import { rateLimit, rateLimitKey, tooManyAttemptsMessage, RATE_LIMITS } from '$lib/rateLimit';

/** Bubble-scoped password reset for CLIENT accounts.
 *
 *  The token must belong to a client of THIS bubble's org — the same address can hold
 *  separate client accounts at several venues, so a token issued by one venue must not
 *  be redeemable on another's domain. */
async function loadReset(db: App.Locals['db'], token: string, orgId: string) {
  return dbFirst<{ id: string; user_id: string; expires_at: string; used: number }>(
    db,
    `SELECT pr.id, pr.user_id, pr.expires_at, pr.used
     FROM password_resets pr
     JOIN users u ON u.id = pr.user_id
     WHERE pr.token = ? AND u.org_id = ? AND u.account_type = 'client'`,
    token, orgId
  );
}

export const load: PageServerLoad = async ({ params, locals }) => {
  if (!locals.domainOrg) redirect(303, `/app/reset-password/${params.token}`);
  const reset = await loadReset(locals.db, params.token, locals.domainOrg.id);
  if (!reset || !!reset.used || new Date(reset.expires_at) < new Date()) {
    return { valid: false };
  }
  return { valid: true };
};

export const actions: Actions = {
  default: async ({ request, params, locals, getClientAddress }) => {
    if (!locals.domainOrg) return fail(400, { error: st(locals.locale).serverErrors.notDomainLoginPage });

    const rl = await rateLimit(locals.db, rateLimitKey('reset_token', getClientAddress()), RATE_LIMITS.resetToken);
    if (!rl.ok) {
      return fail(429, {
        error: tooManyAttemptsMessage(st(locals.locale).serverErrors.tooManyAttempts, rl.retryAfterMinutes),
      });
    }

    const data = await request.formData();
    const password = String(data.get('password') ?? '');
    const confirm = String(data.get('confirmPassword') ?? '');

    // Client accounts register with an 8-character minimum on this bubble; keep reset
    // consistent with registration rather than the apex's 6.
    if (!password || password.length < 8) {
      return fail(400, { error: st(locals.locale).serverErrors.passwordMin8 });
    }
    if (password !== confirm) {
      return fail(400, { error: st(locals.locale).serverErrors.passwordsDoNotMatch });
    }

    const reset = await loadReset(locals.db, params.token, locals.domainOrg.id);
    if (!reset || !!reset.used || new Date(reset.expires_at) < new Date()) {
      return fail(400, { error: st(locals.locale).serverErrors.invalidOrExpiredResetLink });
    }

    const hash = await bcrypt.hash(password, 12);
    await dbRun(locals.db, 'UPDATE users SET password_hash = ? WHERE id = ?', hash, reset.user_id);
    await dbRun(locals.db, 'UPDATE password_resets SET used = 1 WHERE id = ?', reset.id);

    redirect(303, '/login?reset=success');
  },
};
