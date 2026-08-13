import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import type { UserRow } from '$lib/db/index';
import { createSession } from '$lib/auth';
import { st } from '$lib/i18n-server';
import { rateLimit, rateLimitKey, tooManyAttemptsMessage, RATE_LIMITS } from '$lib/rateLimit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
  // This route is only for custom-domain visitors
  if (!locals.domainOrg) redirect(303, '/app/login');
  // Already signed in — org members manage on the bubble, clients book.
  if (locals.user) redirect(303, locals.user.account_type === 'client' ? '/halls' : '/app/manage');
  return {
    domainOrg: locals.domainOrg,
    redirectTo: url.searchParams.get('redirect') ?? '/halls',
  };
};

/** Every fail() in this route spreads this so ActionData has one consistent shape —
 *  otherwise the union's narrowest member drops `email` and the template can't read it. */
const formShape = { email: '', first_name: '', last_name: '' };

export const actions: Actions = {
  login: async ({ request, cookies, locals, getClientAddress }) => {
    if (!locals.domainOrg) return fail(400, { ...formShape, tab: 'login', error: st(locals.locale).serverErrors.notDomainLoginPage });

    const data = await request.formData();
    const email    = String(data.get('email') ?? '').toLowerCase().trim();
    const password = String(data.get('password') ?? '');
    const redirectTo = String(data.get('redirect') ?? '/halls');

    if (!email || !password) return fail(400, { ...formShape, tab: 'login', email, error: st(locals.locale).serverErrors.emailPasswordRequired });

    const orgId = locals.domainOrg.id;

    // Same two buckets as the apex login. The email bucket is scoped by org because
    // the same address can be a client in several bubbles — they shouldn't share a
    // counter and lock each other out.
    for (const [bucket, id, rule] of [
      ['login_ip', getClientAddress(), RATE_LIMITS.loginIp],
      ['login_email', `${orgId}|${email}`, RATE_LIMITS.loginEmail],
    ] as const) {
      const rl = await rateLimit(locals.db, rateLimitKey(bucket, id), rule);
      if (!rl.ok) {
        return fail(429, {
          ...formShape, tab: 'login', email,
          error: tooManyAttemptsMessage(st(locals.locale).serverErrors.tooManyAttempts, rl.retryAfterMinutes),
        });
      }
    }
    // Authenticate either a client of this org OR an organization account that is
    // a member of this org (so a venue owner can sign in on their own domain).
    const candidates = await dbAll<UserRow>(
      locals.db,
      `SELECT u.* FROM users u
       WHERE u.email = ?
         AND ( (u.account_type = 'client' AND u.org_id = ?)
            OR EXISTS (SELECT 1 FROM organization_members m WHERE m.user_id = u.id AND m.org_id = ?) )`,
      email,
      orgId,
      orgId
    );

    let authed: UserRow | null = null;
    for (const c of candidates) {
      if (await bcrypt.compare(password, c.password_hash)) { authed = c; break; }
    }
    if (!authed) return fail(400, { ...formShape, tab: 'login', email, error: st(locals.locale).serverErrors.invalidEmailOrPassword });

    await createSession(authed.id, cookies, locals.db);
    // Org members land in the management app; clients return to the booking surface.
    redirect(303, authed.account_type === 'client' ? redirectTo : '/app/manage');
  },

  register: async ({ request, cookies, locals, getClientAddress }) => {
    if (!locals.domainOrg) return fail(400, { ...formShape, tab: 'register', error: st(locals.locale).serverErrors.notDomainLoginPage });

    const rlReg = await rateLimit(locals.db, rateLimitKey('register', getClientAddress()), RATE_LIMITS.register);
    if (!rlReg.ok) {
      return fail(429, {
        ...formShape, tab: 'register',
        error: tooManyAttemptsMessage(st(locals.locale).serverErrors.tooManyAttempts, rlReg.retryAfterMinutes),
      });
    }

    const data = await request.formData();
    const first_name = String(data.get('first_name') ?? '').trim();
    const last_name  = String(data.get('last_name') ?? '').trim();
    const email      = String(data.get('email') ?? '').toLowerCase().trim();
    const password   = String(data.get('password') ?? '');
    const redirectTo = String(data.get('redirect') ?? '/halls');

    if (!first_name || !last_name) return fail(400, { ...formShape, tab: 'register', first_name, last_name, email, error: st(locals.locale).serverErrors.firstLastNameRequired });
    if (!email) return fail(400, { ...formShape, tab: 'register', first_name, last_name, email, error: st(locals.locale).serverErrors.emailRequired });
    if (password.length < 8) return fail(400, { ...formShape, tab: 'register', first_name, last_name, email, error: st(locals.locale).serverErrors.passwordMin8 });

    const orgId = locals.domainOrg.id;
    const existing = await dbFirst<{ id: string }>(locals.db, `SELECT id FROM users WHERE email = ? AND org_id = ?`, email, orgId);
    if (existing) return fail(400, { ...formShape, tab: 'register', first_name, last_name, email, error: st(locals.locale).serverErrors.accountEmailExists });

    const password_hash = await bcrypt.hash(password, 12);
    const newUserId = crypto.randomUUID();
    await dbRun(
      locals.db,
      `INSERT INTO users (id, email, password_hash, first_name, last_name, account_type, org_id)
      VALUES (?, ?, ?, ?, ?, 'client', ?)`,
      newUserId,
      email,
      password_hash,
      first_name,
      last_name,
      orgId
    );

    await createSession(newUserId, cookies, locals.db);
    redirect(303, redirectTo);
  }
};
