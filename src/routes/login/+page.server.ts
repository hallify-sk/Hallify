import { fail, redirect } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { createSession } from '$lib/auth';
import { emailServiceDown } from '$lib/email';
import { st } from '$lib/i18n-server';
import { rateLimit, rateLimitKey, tooManyAttemptsMessage, RATE_LIMITS } from '$lib/rateLimit';
import { venueIdentity } from '$lib/site/brand.server';
import { acceptedTerms, recordLegalAcceptance } from '$lib/site/legal-acceptance';
import { authenticateOnVenue, findHallifyAccount, registerOnVenue } from '$lib/server/identity';
import { sendVerificationEmail } from '$lib/server/email-verification';
import type { Actions, PageServerLoad } from './$types';

/** Only a same-origin absolute path may be followed after sign-in or sign-up.
 *
 *  `?redirect=` is carried into a hidden field and then into a 303, so without this
 *  `/login?redirect=https://evil.example.com` is an open redirect: a link on the
 *  org's own domain that signs somebody in and then hands them to an attacker's
 *  copy of the page. A value starting `//` or `/\` is a protocol-relative URL the
 *  browser resolves against another host, so those go too.
 *
 *  Same rule as /app/login and /app/register — this is the reservation-invite side
 *  of it (`/invite/[token]` links here with `?redirect=/invite/<token>`). */
const DEFAULT_NEXT = '/halls';

function safeNext(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v.startsWith('/')) return DEFAULT_NEXT;
  if (v.startsWith('//') || v.startsWith('/\\')) return DEFAULT_NEXT;
  return v;
}

/** Where an org member goes after signing in on the venue's domain: the console page
 *  they were sent here from, or the console home. A public-page redirect (/halls/…)
 *  is a client's destination, not theirs. */
function memberNext(redirectTo: string): string {
  return redirectTo === '/app/manage' || redirectTo.startsWith('/app/manage/') || redirectTo.startsWith('/app/manage?')
    ? redirectTo
    : '/app/manage';
}

export const load: PageServerLoad = async ({ locals, url }) => {
  // This route is only for custom-domain visitors
  if (!locals.domainOrg) redirect(303, '/app/login');
  // Already signed in — org members manage on the bubble, clients book.
  if (locals.user) {
    redirect(303, locals.user.account_type === 'client' ? '/halls' : memberNext(safeNext(url.searchParams.get('redirect'))));
  }
  return {
    // Branded like the rest of the venue's site (display name and logo).
    domainOrg: await venueIdentity(locals.db, locals.domainOrg),
    redirectTo: safeNext(url.searchParams.get('redirect')),
  };
};

/** Every fail() in this route spreads this so ActionData has one consistent shape —
 *  otherwise the union's narrowest member drops `email` and the template can't read it. */
const formShape = { email: '', first_name: '', last_name: '', separate: false, linkSent: false };

export const actions: Actions = {
  login: async ({ request, cookies, locals, getClientAddress }) => {
    if (!locals.domainOrg) return fail(400, { ...formShape, tab: 'login', error: st(locals.locale).serverErrors.notDomainLoginPage });

    const data = await request.formData();
    const email    = String(data.get('email') ?? '').toLowerCase().trim();
    const password = String(data.get('password') ?? '');
    // Re-validated here, not just where it was rendered: the field is in the POST
    // body and nothing stops it being replaced before the form is submitted.
    const redirectTo = safeNext(data.get('redirect'));

    if (!email || !password) return fail(400, { ...formShape, tab: 'login', email, error: st(locals.locale).serverErrors.emailPasswordRequired });

    const orgId = locals.domainOrg.id;

    // Same two buckets as the apex login. The email bucket is scoped by org because
    // the same address can be a client in several bubbles — they shouldn't share a
    // counter and lock each other out.
    for (const [bucket, id, rule] of [
      ['login_ip', getClientAddress(), RATE_LIMITS.loginIp],
      ['login_email', `${orgId}|${email}`, RATE_LIMITS.loginEmail],
      // The Hallify password opens every venue site, so guesses at it are counted
      // once for the address too: spreading them over venues gains nothing.
      ['login_email', email, RATE_LIMITS.loginEmail],
    ] as const) {
      const rl = await rateLimit(locals.db, rateLimitKey(bucket, id), rule);
      if (!rl.ok) {
        return fail(429, {
          ...formShape, tab: 'login', email,
          error: tooManyAttemptsMessage(st(locals.locale).serverErrors.tooManyAttempts, rl.retryAfterMinutes),
        });
      }
    }
    // One Hallify account on every venue site (D4): the Hallify email and password
    // sign in a member of this venue as staff and everyone else as this venue's
    // client (the client row is created and linked on the first visit). A venue's
    // old, separate client account still opens with its own password.
    const result = await authenticateOnVenue(locals.db, orgId, email, password);
    if (result?.kind === 'separate') {
      return fail(400, { ...formShape, tab: 'login', email, separate: true, error: st(locals.locale).identity.separateAccount });
    }
    if (!result) return fail(400, { ...formShape, tab: 'login', email, error: st(locals.locale).serverErrors.invalidEmailOrPassword });

    await createSession(result.userId, cookies, locals.db);
    // Org members land in the management app; clients return to the booking surface.
    redirect(303, result.kind === 'client' ? redirectTo : memberNext(redirectTo));
  },

  /** "Send me a link": this venue has an old account for the address with another
   *  password. The link mailed to the Hallify account's address says it is for joining;
   *  opening it only verifies the address, and the old accounts are joined once the
   *  person who opened it also gives the Hallify password there (`joinOldAccounts`).
   *  Anyone can ask for this link, so the mailbox alone must not be enough: the
   *  Hallify account may have been made with this address by someone else. */
  sendLink: async ({ request, url, locals, getClientAddress }) => {
    if (!locals.domainOrg) return fail(400, { ...formShape, tab: 'login', error: st(locals.locale).serverErrors.notDomainLoginPage });
    const data = await request.formData();
    const email = String(data.get('email') ?? '').toLowerCase().trim();
    if (!email) return fail(400, { ...formShape, tab: 'login', error: st(locals.locale).serverErrors.emailRequired });

    for (const [bucket, id, rule] of [
      ['forgot_ip', getClientAddress(), RATE_LIMITS.forgotIp],
      ['forgot_email', `verify|${email}`, RATE_LIMITS.forgotEmail],
    ] as const) {
      const rl = await rateLimit(locals.db, rateLimitKey(bucket, id), rule);
      if (!rl.ok) {
        return fail(429, { ...formShape, tab: 'login', email, error: tooManyAttemptsMessage(st(locals.locale).serverErrors.tooManyAttempts, rl.retryAfterMinutes) });
      }
    }
    // The same answer whether or not the address has an account: nothing to probe.
    const account = await findHallifyAccount(locals.db, email);
    if (account) {
      const ok = await sendVerificationEmail(locals.db, {
        userId: account.id,
        email: account.email,
        origin: url.origin,
        locale: account.locale === 'en' || account.locale === 'sk' ? account.locale : locals.locale,
        venue: locals.domainOrg.name,
        purpose: 'join',
      });
      if (!ok && await emailServiceDown(locals.db)) {
        return fail(503, { ...formShape, tab: 'login', email, error: st(locals.locale).serverErrors.emailUnavailable });
      }
    }
    return { ...formShape, tab: 'login', email, linkSent: true, error: '' };
  },

  register: async ({ request, cookies, url, locals, getClientAddress }) => {
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
    const redirectTo = safeNext(data.get('redirect'));

    if (!first_name || !last_name) return fail(400, { ...formShape, tab: 'register', first_name, last_name, email, error: st(locals.locale).serverErrors.firstLastNameRequired });
    if (!email) return fail(400, { ...formShape, tab: 'register', first_name, last_name, email, error: st(locals.locale).serverErrors.emailRequired });
    if (password.length < 8) return fail(400, { ...formShape, tab: 'register', first_name, last_name, email, error: st(locals.locale).serverErrors.passwordMin8 });
    // The Terms and the Privacy Policy are linked on the form; agreeing is required.
    if (!acceptedTerms(data)) return fail(400, { ...formShape, tab: 'register', first_name, last_name, email, error: st(locals.locale).serverErrors.mustAcceptTerms });

    const orgId = locals.domainOrg.id;
    // Signing up here creates the person's Hallify account and this venue's client
    // row together (D4). An address that already has a Hallify account signs in with
    // it instead: the sign-in tab opens with the address filled in.
    const password_hash = await bcrypt.hash(password, 12);
    const reg = await registerOnVenue(locals.db, orgId, { email, passwordHash: password_hash, firstName: first_name, lastName: last_name, locale: locals.locale });
    if (!reg.ok && reg.reason === 'hasAccount') {
      return fail(400, { ...formShape, tab: 'login', email, error: st(locals.locale).identity.hasHallifyAccount });
    }
    if (!reg.ok) return fail(400, { ...formShape, tab: 'register', first_name, last_name, email, error: st(locals.locale).serverErrors.accountEmailExists });
    const newUserId = reg.clientId;

    // The Terms were accepted for both: the account and this venue's client row.
    await recordLegalAcceptance(locals.db, { userId: newUserId, orgId, context: 'register' });
    await recordLegalAcceptance(locals.db, { userId: reg.accountId, context: 'register' });

    // Booking works straight away; the venue site reminds them until they confirm.
    await sendVerificationEmail(locals.db, {
      userId: reg.accountId,
      email,
      origin: url.origin,
      locale: locals.locale,
      venue: locals.domainOrg.name,
    });

    await createSession(newUserId, cookies, locals.db);
    redirect(303, redirectTo);
  }
};
