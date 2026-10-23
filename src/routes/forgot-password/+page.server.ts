import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { dbFirst } from '$lib/db/index';
import type { UserRow } from '$lib/db/index';
import { sendPasswordResetEmail, emailServiceDown } from '$lib/email';
import { createPasswordReset } from '$lib/server/account';
import { st } from '$lib/i18n-server';
import { rateLimit, rateLimitKey, tooManyAttemptsMessage, RATE_LIMITS } from '$lib/rateLimit';
import { venueIdentity } from '$lib/site/brand.server';
import { findHallifyAccount } from '$lib/server/identity';

/** Password recovery on a venue's site: the Hallify account (D4), or a client account
 *  of this venue from before accounts were shared.
 *
 *  Clients previously had no recovery path at all: /app/forgot-password matches only
 *  `org_id IS NULL` (org/platform users), and hooks redirects every /app/* request on
 *  a bubble away for clients — so a locked-out customer had nowhere to go.
 *
 *  Scoped to the bubble's org, mirroring how client login works: the same address can
 *  be a client of several venues, and each is a separate account. */
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.domainOrg) redirect(303, '/app/forgot-password');
  if (locals.user) redirect(303, '/halls');
  return { domainOrg: await venueIdentity(locals.db, locals.domainOrg) };
};

export const actions: Actions = {
  default: async ({ request, url, locals, getClientAddress }) => {
    if (!locals.domainOrg) return fail(400, { error: st(locals.locale).serverErrors.notDomainLoginPage });
    const orgId = locals.domainOrg.id;

    const data = await request.formData();
    const email = String(data.get('email') ?? '').toLowerCase().trim();
    if (!email) return fail(400, { error: st(locals.locale).serverErrors.emailRequired });

    for (const [bucket, id, rule] of [
      ['forgot_ip', getClientAddress(), RATE_LIMITS.forgotIp],
      ['forgot_email', `${orgId}|${email}`, RATE_LIMITS.forgotEmail],
    ] as const) {
      const rl = await rateLimit(locals.db, rateLimitKey(bucket, id), rule);
      if (!rl.ok) {
        return fail(429, {
          error: tooManyAttemptsMessage(st(locals.locale).serverErrors.tooManyAttempts, rl.retryAfterMinutes),
        });
      }
    }

    // During an email outage nothing can be sent to anyone, so saying "sent" would
    // be false. The answer is the same for every address, so it reveals nothing.
    if (await emailServiceDown(locals.db)) {
      return fail(503, { error: st(locals.locale).serverErrors.emailUnavailable });
    }

    // Always report success — never reveal whether the address has an account here.
    // A Hallify account is what signs people in on every venue site (D4), so it is the
    // one reset when the address has it; otherwise this venue's own, older account.
    const user = (await findHallifyAccount(locals.db, email)) ?? await dbFirst<Pick<UserRow, 'id'>>(
      locals.db,
      "SELECT id FROM users WHERE email = ? AND org_id = ? AND account_type = 'client' AND account_id IS NULL AND deleted_at IS NULL",
      email, orgId
    );

    if (user) {
      // Only the token's hash is stored; the link in the email is the one copy.
      const token = await createPasswordReset(locals.db, user.id);
      // Stays on this bubble — the reset route below is bubble-scoped too.
      const ok = await sendPasswordResetEmail(locals.db, email, `${url.origin}/reset-password/${token}`);
      if (!ok && await emailServiceDown(locals.db)) {
        return fail(503, { error: st(locals.locale).serverErrors.emailUnavailable });
      }
    }

    return { sent: true };
  },
};
